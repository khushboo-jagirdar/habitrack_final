import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'habittrack_secret';

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized.' });
  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ message: 'Admin access required.' });
    req.admin = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

// ── Stats overview ────────────────────────────────────────────────────────────
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [totalUsers, verifiedUsers, totalProperties, totalTransactions, recentUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ aadhaarVerified: true }),
      Property.countDocuments(),
      Transaction.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(5).select('-password -aadhaarOtp -aadhaarOtpExpiry'),
    ]);
    const revenue = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    res.json({
      totalUsers,
      verifiedUsers,
      unverifiedUsers: totalUsers - verifiedUsers,
      totalProperties,
      totalTransactions,
      totalRevenue: revenue[0]?.total || 0,
      recentUsers,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET all users ─────────────────────────────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -aadhaarOtp -aadhaarOtpExpiry')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── CREATE user ───────────────────────────────────────────────────────────────
router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { fullName, email, password, userType, aadhaarVerified, isAdmin } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required.' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'Email already in use.' });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      fullName,
      email: email.toLowerCase(),
      password: hashed,
      userType: userType || 'buyer',
      aadhaarVerified: aadhaarVerified || false,
      isAdmin: isAdmin || false,
    });
    await user.save();
    const { password: _, aadhaarOtp, aadhaarOtpExpiry, ...userData } = user.toObject();
    res.status(201).json({ message: 'User created.', user: userData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── UPDATE user ───────────────────────────────────────────────────────────────
router.put('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { fullName, email, userType, aadhaarVerified, isAdmin, newPassword } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (email && email.toLowerCase() !== user.email) {
      const exists = await User.findOne({ email: email.toLowerCase() });
      if (exists) return res.status(409).json({ message: 'Email already in use.' });
      user.email = email.toLowerCase();
    }
    if (fullName) user.fullName = fullName;
    if (userType) user.userType = userType;
    if (typeof aadhaarVerified === 'boolean') user.aadhaarVerified = aadhaarVerified;
    if (typeof isAdmin === 'boolean') user.isAdmin = isAdmin;
    if (newPassword) {
      if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
      user.password = await bcrypt.hash(newPassword, 10);
    }
    await user.save();
    const { password, aadhaarOtp, aadhaarOtpExpiry, ...userData } = user.toObject();
    res.json({ message: 'User updated.', user: userData });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE user ───────────────────────────────────────────────────────────────
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'User deleted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET all properties ────────────────────────────────────────────────────────
router.get('/properties', requireAdmin, async (req, res) => {
  try {
    const properties = await Property.find().sort({ createdAt: -1 });
    res.json(properties);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE property ───────────────────────────────────────────────────────────
router.delete('/properties/:id', requireAdmin, async (req, res) => {
  try {
    await Property.findByIdAndDelete(req.params.id);
    res.json({ message: 'Property deleted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET all transactions ──────────────────────────────────────────────────────
router.get('/transactions', requireAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
