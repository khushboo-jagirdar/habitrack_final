import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.Mixed, required: true },
  buyerId: { type: mongoose.Schema.Types.Mixed, required: true },
  ownerId: { type: mongoose.Schema.Types.Mixed, required: true },
  type: { type: String, enum: ['buy', 'rent'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'cancelled', 'failed'], default: 'pending' },
  // Razorpay payment fields
  razorpayOrderId: { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },
  razorpaySignature: { type: String, default: '' },
  paymentMethod: { type: String, default: '' }, // upi, card, netbanking, wallet
  paymentLast4: { type: String, default: '' },
  documents: [{
    name: String,
    url: String,
    uploadedBy: String, // userId
    category: { type: String, enum: ['Sale Deed', 'NOC', 'Tax Receipt', 'Agreement', 'Other'], default: 'Other' },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

export default mongoose.model('Transaction', transactionSchema);
