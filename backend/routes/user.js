import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import User from '../models/User.js';

const router = express.Router();
const UPLOADS_DIR = './uploads';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

// Update user profile
router.put('/profile/:id', upload.single('avatar'), async (req, res) => {
  try {
    const { fullName, userType } = req.body;
    const update = {};
    if (fullName) update.fullName = fullName;
    if (userType) update.userType = userType;
    if (req.file) update.avatar = `/uploads/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password -aadhaarOtp -aadhaarOtpExpiry');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Update failed' });
  }
});

// Save a property
router.post('/:id/saved-properties', async (req, res) => {
  try {
    const { propertyId } = req.body;
    if (!propertyId) return res.status(400).json({ message: 'Property ID is required' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.savedProperties.includes(propertyId)) {
      user.savedProperties.push(propertyId);
      await user.save();
    }
    res.json({ message: 'Property saved', savedProperties: user.savedProperties });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Remove a saved property
router.delete('/:id/saved-properties/:propertyId', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.savedProperties = user.savedProperties.filter(
      pid => String(pid) !== String(req.params.propertyId)
    );
    await user.save();
    res.json({ message: 'Property removed', savedProperties: user.savedProperties });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get saved properties
router.get('/:id/saved-properties', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('savedProperties');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ savedProperties: user.savedProperties || [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// Update bank details for payouts
router.put('/:id/bank-details', async (req, res) => {
  try {
    const { accountNumber, ifscCode, bankName, accountHolderName } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.bankDetails = {
      accountNumber: accountNumber || user.bankDetails.accountNumber,
      ifscCode: ifscCode || user.bankDetails.ifscCode,
      bankName: bankName || user.bankDetails.bankName,
      accountHolderName: accountHolderName || user.bankDetails.accountHolderName
    };

    await user.save();
    res.json(user.bankDetails);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user public info
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -aadhaarOtp -aadhaarOtpExpiry');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all agents
router.get('/type/agents', async (req, res) => {
  try {
    const agents = await User.find({ userType: 'agent' }).select('fullName avatar email');
    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
