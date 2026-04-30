import express from 'express';
import Chat from '../models/Chat.js';
import User from '../models/User.js';

const router = express.Router();

async function getPublicUser(userId) {
  try {
    const user = await User.findById(userId).select('-password -aadhaarOtp -aadhaarOtpExpiry');
    return user || null;
  } catch {
    return null;
  }
}

// Get chat threads for a user
router.get('/threads', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const chats = await Chat.find({ users: userId });
    const threads = await Promise.all(chats.map(async (c) => {
      const lastMessage = c.messages?.[c.messages.length - 1] || null;
      const participants = await Promise.all((c.users || []).map(getPublicUser));
      return {
        id: c._id,
        users: c.users,
        lastMessage,
        updatedAt: lastMessage?.createdAt || c.createdAt || 0,
        participants: participants.filter(Boolean),
      };
    }));
    threads.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json(threads);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single thread
router.get('/threads/:id', async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ message: 'Thread not found' });
    const participants = await Promise.all((chat.users || []).map(getPublicUser));
    res.json({ ...chat.toObject(), id: chat._id, participants: participants.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create or append thread
router.post('/threads', async (req, res) => {
  try {
    const { senderId, recipientEmail, text } = req.body;
    if (!senderId || !recipientEmail || !text) {
      return res.status(400).json({ message: 'senderId, recipientEmail and text are required' });
    }

    const recipient = await User.findOne({ email: recipientEmail.toLowerCase() });
    if (!recipient) return res.status(404).json({ message: 'Recipient not found' });
    if (String(recipient._id) === String(senderId)) {
      return res.status(400).json({ message: 'Cannot chat with yourself' });
    }

    const newMessage = { senderId, text, createdAt: new Date() };
    let chat = await Chat.findOne({ users: { $all: [senderId, String(recipient._id)], $size: 2 } });

    if (!chat) {
      chat = new Chat({ users: [senderId, String(recipient._id)], messages: [newMessage] });
    } else {
      chat.messages.push(newMessage);
    }
    await chat.save();
    res.status(201).json({ ...chat.toObject(), id: chat._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Send message to thread
router.post('/threads/:id/messages', async (req, res) => {
  try {
    const { senderId, text } = req.body;
    if (!senderId || !text) return res.status(400).json({ message: 'senderId and text are required' });

    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ message: 'Thread not found' });
    if (!(chat.users || []).map(String).includes(String(senderId))) {
      return res.status(403).json({ message: 'Not a participant' });
    }

    const newMessage = { senderId, text, createdAt: new Date() };
    chat.messages.push(newMessage);
    await chat.save();
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete thread
router.delete('/threads/:id', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: 'userId is required' });

    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ message: 'Thread not found' });
    
    if (!(chat.users || []).map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Not a participant' });
    }

    await Chat.findByIdAndDelete(req.params.id);
    res.json({ message: 'Chat deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
