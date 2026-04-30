import express from 'express';
import User from '../models/User.js';

const router = express.Router();

// Mock function to "send" OTP
const sendMockOtp = (aadhaarNumber) => {
  // In a real app, you'd call a Govt. API or UIDAI partner
  return "123456"; // Static OTP for demo/testing
};

// Step 1: Send OTP to Aadhaar linked mobile
router.post('/send-otp', async (req, res) => {
  try {
    const { userId, aadhaarNumber } = req.body;

    if (!aadhaarNumber || aadhaarNumber.length !== 12) {
      return res.status(400).json({ message: "Invalid Aadhaar Number. Must be 12 digits." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = sendMockOtp(aadhaarNumber);
    
    user.aadhaarNumber = aadhaarNumber;
    user.aadhaarOtp = otp;
    user.aadhaarOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    
    await user.save();

    res.json({ message: "OTP sent to your registered mobile number (Mock: 123456)", refId: "HAB-" + Date.now() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Step 2: Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.aadhaarOtp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (new Date() > user.aadhaarOtpExpiry) {
      return res.status(400).json({ message: "OTP expired" });
    }

    user.aadhaarVerified = true;
    user.aadhaarOtp = '';
    user.aadhaarOtpExpiry = null;
    
    await user.save();

    res.json({ 
      message: "Aadhaar verified successfully!", 
      user: {
        fullName: user.fullName,
        aadhaarVerified: true
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
