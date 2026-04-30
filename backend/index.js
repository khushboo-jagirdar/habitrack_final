import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dns from 'dns';
import path from 'path';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import propertiesRoutes from './routes/properties.js';
import chatRoutes from './routes/chat.js';
import contactRoutes from './routes/contact.js';
import transactionRoutes from './routes/transactions.js';
import adminRoutes from './routes/admin.js';
import analyticsRoutes from './routes/analytics.js';
import reviewRoutes from './routes/reviews.js';
import aadhaarRoutes from './routes/aadhaar.js';

import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Socket.io Logic
let onlineUsers = [];

const addUser = (userId, socketId) => {
  if (!onlineUsers.some((user) => String(user.userId) === String(userId))) {
    onlineUsers.push({ userId: String(userId), socketId });
  }
};

const removeUser = (socketId) => {
  onlineUsers = onlineUsers.filter((user) => user.socketId !== socketId);
};

const getUser = (userId) => {
  return onlineUsers.find((user) => String(user.userId) === String(userId));
};

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("newUser", (userId) => {
    addUser(userId, socket.id);
    console.log("User mapped:", userId, "->", socket.id);
  });

  socket.on("sendMessage", ({ receiverId, data }) => {
    const receiver = getUser(receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit("getMessage", data);
    }
  });

  socket.on("typing", ({ receiverId, isTyping }) => {
    const receiver = getUser(receiverId);
    if (receiver) {
      io.to(receiver.socketId).emit("getTyping", isTyping);
    }
  });

  socket.on("disconnect", () => {
    removeUser(socket.id);
    console.log("User disconnected:", socket.id);
  });
});

// MongoDB Atlas connection
console.log('🔄 Attempting MongoDB connection...');
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 120000,
  socketTimeoutMS: 120000,
  connectTimeoutMS: 30000,
})
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/aadhaar', aadhaarRoutes);

// Serve uploaded files
app.use('/uploads', express.static(path.resolve('./uploads')));
app.use('/uploads/documents', express.static(path.resolve('./uploads/documents')));

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
