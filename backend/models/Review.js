import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.Mixed, required: true, ref: 'Property' },
  userId: { type: mongoose.Schema.Types.Mixed, required: true, ref: 'User' },
  agentId: { type: mongoose.Schema.Types.Mixed, ref: 'User' },
  ratings: {
    property: { type: Number, required: true, min: 1, max: 5 },
    agent: { type: Number, required: true, min: 1, max: 5 },
    neighborhood: { type: Number, required: true, min: 1, max: 5 }
  },
  comment: { type: String, required: true },
  isVerified: { type: Boolean, default: true } // Since we only allow verified buyers to post
}, { timestamps: true });

// Ensure a user can only review a property once
reviewSchema.index({ propertyId: 1, userId: 1 }, { unique: true });

export default mongoose.model('Review', reviewSchema);
