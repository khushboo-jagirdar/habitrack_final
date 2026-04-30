import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import nodemailer from 'nodemailer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Transaction from '../models/Transaction.js';
import Property from '../models/Property.js';
import User from '../models/User.js';

const router = express.Router();
const DOCS_DIR = './uploads/documents';
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// ─── Email transporter (Gmail SMTP) ──────────────────────────────────────────
function getMailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

// ─── Razorpay instance ──────────────────────────────────────────────────────
function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('Razorpay keys not configured.');
  return new Razorpay({ key_id, key_secret });
}

// ─── Step 1: Create Razorpay Order ──────────────────────────────────────────
// Only buyers can create orders
router.post('/create-order', async (req, res) => {
  try {
    const { userId, propertyId, type } = req.body;
    if (!userId || !propertyId || !type) {
      return res.status(400).json({ message: 'userId, propertyId, and type are required.' });
    }
    if (type !== 'buy' && type !== 'rent') {
      return res.status(400).json({ message: 'Type must be "buy" or "rent".' });
    }

    // Check user type — only buyers can pay
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.userType !== 'buyer') {
      return res.status(403).json({ message: 'Only buyers can make payments. Your account type is: ' + user.userType });
    }

    // Get property
    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ message: 'Property not found.' });

    // Prevent owner from buying their own property
    if (String(property.ownerId) === String(userId)) {
      return res.status(400).json({ message: 'You cannot buy/rent your own property.' });
    }

    let amount = Number(property.price);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid property price.' });
    }

    // Real estate purchases online are usually a fixed "Booking Token", not the full Crores.
    // This also prevents Razorpay's test-mode maximum amount limits (5 Lakhs).
    if (type === 'buy') {
      amount = 50000; // ₹50,000 booking amount
    }

    // Create Razorpay order (amount in paise)
    const razorpay = getRazorpay();
    const shortPropId = String(propertyId).slice(-6);
    const order = await razorpay.orders.create({
      amount: amount * 100, // Razorpay expects amount in paise
      currency: 'INR',
      receipt: `txn_${shortPropId}_${Date.now()}`.slice(0, 40),
      notes: {
        propertyId: String(propertyId),
        buyerId: String(userId),
        type,
      },
    });

    // Create a pending transaction
    const transaction = new Transaction({
      propertyId,
      buyerId: userId,
      ownerId: property.ownerId,
      type,
      amount,
      status: 'pending',
      razorpayOrderId: order.id,
    });
    await transaction.save();

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      transactionId: transaction._id,
    });
  } catch (err) {
    const errorMsg = err.error ? err.error.description : err.message;
    console.error('[create-order]', err);
    res.status(500).json({ message: errorMsg || 'Failed to create order.' });
  }
});

// ─── Step 2: Verify Payment & Complete Transaction ──────────────────────────
router.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !transactionId) {
      return res.status(400).json({ message: 'Payment verification data is incomplete.' });
    }

    // Verify signature using HMAC SHA256
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    const generated_signature = crypto
      .createHmac('sha256', key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      // Mark transaction as failed
      await Transaction.findByIdAndUpdate(transactionId, { status: 'failed' });
      return res.status(400).json({ message: 'Payment verification failed. Invalid signature.' });
    }

    // Get payment details from Razorpay
    let paymentMethod = '';
    try {
      const razorpay = getRazorpay();
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      paymentMethod = payment.method || ''; // upi, card, netbanking, wallet
    } catch (e) {
      // Non-critical, continue
    }

    // Update transaction as completed
    const transaction = await Transaction.findByIdAndUpdate(
      transactionId,
      {
        status: 'completed',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paymentMethod,
      },
      { new: true }
    );

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    // Update Property Status
    const property = await Property.findById(transaction.propertyId);
    if (property) {
      property.listingStatus = transaction.type === 'buy' ? 'sold' : 'rented';
      await property.save();

      // Send Email Notification to Owner
      try {
        const owner = await User.findById(property.ownerId);
        const buyer = await User.findById(transaction.buyerId);
        
        if (owner && owner.email) {
          const transporter = getMailTransporter();
          const actionText = transaction.type === 'buy' ? 'purchased' : 'rented';
          
          await transporter.sendMail({
            from: `"HabiTrack" <${process.env.SMTP_EMAIL}>`,
            to: owner.email,
            subject: `🎉 Your property was ${actionText} on HabiTrack!`,
            html: `
              <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:500px;margin:auto;border:1px solid #e0eaea;border-radius:12px;overflow:hidden;">
                <div style="background:linear-gradient(135deg,#008080,#00b3b3);padding:24px;text-align:center;">
                  <h1 style="color:#fff;margin:0;font-size:22px;">Good News, ${owner.fullName}!</h1>
                </div>
                <div style="padding:24px;">
                  <p style="color:#1a3a3a;font-size:15px;">Your property <strong>"${property.title}"</strong> has been successfully ${actionText}.</p>
                  
                  <div style="background:#f8fafa;border-left:4px solid #008080;padding:16px;margin:20px 0;border-radius:0 8px 8px 0;">
                    <p style="margin:0 0 8px;color:#4a6a6a;font-size:14px;"><strong>Transaction Details:</strong></p>
                    <p style="margin:4px 0;color:#1a3a3a;font-size:14px;">Amount Paid: ₹${transaction.amount.toLocaleString('en-IN')}</p>
                    <p style="margin:4px 0;color:#1a3a3a;font-size:14px;">Payment ID: ${razorpay_payment_id}</p>
                    <p style="margin:4px 0;color:#1a3a3a;font-size:14px;">Buyer: ${buyer ? buyer.fullName : 'HabiTrack User'}</p>
                  </div>
                  
                  <p style="color:#4a6a6a;font-size:14px;">The property status has been automatically updated to <strong>${property.listingStatus.toUpperCase()}</strong>.</p>
                  <p style="color:#4a6a6a;font-size:14px;">You can view the full transaction details in your HabiTrack dashboard.</p>
                </div>
                <div style="background:#f8fafa;padding:14px 24px;text-align:center;border-top:1px solid #e0eaea;">
                  <p style="color:#999;font-size:11px;margin:0;">© ${new Date().getFullYear()} HabiTrack. All rights reserved.</p>
                </div>
              </div>
            `,
          });
          console.log(`[verify-payment] Notification sent to owner ${owner.email}`);
        }
      } catch (emailErr) {
        console.error('[verify-payment] Failed to send owner email:', emailErr.message);
      }
    }

    res.json({
      message: `Property ${transaction.type === 'buy' ? 'purchased' : 'rented'} successfully!`,
      transaction,
    });
  } catch (err) {
    console.error('[verify-payment]', err.message);
    res.status(500).json({ message: err.message || 'Payment verification failed.' });
  }
});

// ─── Legacy: Create transaction (kept for backward compatibility) ────────────
router.post('/', async (req, res) => {
  try {
    const { userId, propertyId, type, amount } = req.body;
    if (!userId || !propertyId || !type || !amount) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Check user type
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.userType !== 'buyer') {
      return res.status(403).json({ message: 'Only buyers can make payments.' });
    }

    const property = await Property.findById(propertyId);
    if (!property) return res.status(404).json({ message: 'Property not found.' });

    const transaction = new Transaction({
      propertyId,
      buyerId: userId,
      ownerId: property.ownerId,
      type,
      amount: Number(amount),
      status: 'completed',
    });
    await transaction.save();
    res.status(201).json({
      message: `Property ${type === 'buy' ? 'purchased' : 'rented'} successfully!`,
      transaction,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user transactions (buyer or owner)
router.get('/user/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({
      $or: [
        { buyerId: req.params.userId },
        { ownerId: req.params.userId }
      ]
    }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all transactions
router.get('/', async (req, res) => {
  try {
    const transactions = await Transaction.find();
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single transaction
router.get('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Upload document to transaction vault
router.post('/:id/documents', upload.single('file'), async (req, res) => {
  try {
    const { userId, category, fileName } = req.body;
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

    // Verify user is part of transaction
    if (String(transaction.buyerId) !== String(userId) && 
        String(transaction.ownerId) !== String(userId)) {
      return res.status(403).json({ message: 'Unauthorized access to this transaction vault.' });
    }

    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const newDoc = {
      name: fileName || req.file.originalname,
      url: `/uploads/documents/${req.file.filename}`,
      uploadedBy: userId,
      category: category || 'Other',
      timestamp: new Date()
    };

    transaction.documents.push(newDoc);
    await transaction.save();

    res.status(201).json(newDoc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
