import mongoose from 'mongoose';

const verificationLogSchema = new mongoose.Schema({
  user: String,
  verified: Boolean,
  legalStatus: String,
  notes: String,
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const propertySchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.Mixed, required: true },
  title: { type: String, required: true },
  address: { type: String, required: true },
  price: { type: Number, required: true },
  type: { type: String, enum: ['buy', 'rent'], default: 'buy' },
  propertyType: { type: String, enum: ['house', 'apartment', 'condo', 'land', 'other'], default: 'house' },
  bedroom: { type: Number, default: 0 },
  bathroom: { type: Number, default: 0 },
  description: { type: String, default: '' },
  images: [String],
  latitude: { type: Number, default: 0 },
  longitude: { type: Number, default: 0 },
  reraId: { type: String, default: '' },
  legalStatus: { type: String, enum: ['legal', 'illegal'], default: 'legal' },
  verified: { type: Boolean, default: false },
  verificationLog: [verificationLogSchema],
  agentId: { type: mongoose.Schema.Types.Mixed, default: null },
  listingStatus: { type: String, enum: ['available', 'sold', 'rented'], default: 'available' },
  views: { type: Number, default: 0 },
  dailyViews: [{
    date: { type: String }, // "YYYY-MM-DD"
    count: { type: Number, default: 0 }
  }],
  virtualTourUrl: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('Property', propertySchema);
