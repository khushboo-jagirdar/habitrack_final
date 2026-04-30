import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.Mixed, required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const chatSchema = new mongoose.Schema({
  users: [{ type: mongoose.Schema.Types.Mixed }],
  messages: [messageSchema],
}, { timestamps: true });

export default mongoose.model('Chat', chatSchema);
