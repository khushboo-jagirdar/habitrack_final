import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  userType: { type: String, enum: ['buyer', 'owner', 'agent', 'admin'], default: 'buyer' },
  isAdmin: { type: Boolean, default: false },
  avatar: { type: String, default: '' },
  savedProperties: [{ type: mongoose.Schema.Types.Mixed }],
  // Aadhaar fields
  aadhaarNumber: { type: String, default: '' },
  aadhaarVerified: { type: Boolean, default: false },
  aadhaarOtp: { type: String, default: '' },
  aadhaarOtpExpiry: { type: Date, default: null },
  aadhaarRefId: { type: String, default: '' },
  // Password reset OTP fields
  resetOtp: { type: String, default: '' },
  resetOtpExpiry: { type: Date, default: null },
  resetOtpVerified: { type: Boolean, default: false },
  // Bank details for payouts (Owners/Agents)
  bankDetails: {
    accountNumber: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    bankName: { type: String, default: '' },
    accountHolderName: { type: String, default: '' }
  },
}, { timestamps: true });

export default mongoose.model('User', userSchema, 'Habitrack');
