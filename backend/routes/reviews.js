import express from 'express';
import Review from '../models/Review.js';
import Transaction from '../models/Transaction.js';

const router = express.Router();

// Get reviews for a property
router.get('/property/:id', async (req, res) => {
  try {
    const reviews = await Review.find({ propertyId: req.params.id }).populate('userId', 'fullName avatar');
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get reviews for an agent
router.get('/agent/:id', async (req, res) => {
  try {
    const reviews = await Review.find({ agentId: req.params.id }).populate('userId', 'fullName avatar');
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Post a review
router.post('/', async (req, res) => {
  try {
    const { propertyId, userId, agentId, ratings, comment } = req.body;

    // 1. Check if user has a completed transaction for this property
    const transaction = await Transaction.findOne({
      propertyId: propertyId,
      buyerId: userId,
      status: 'completed'
    });

    if (!transaction) {
      return res.status(403).json({ message: 'Only verified buyers/tenants with a completed transaction can leave a review.' });
    }

    // 2. Create the review
    const review = new Review({
      propertyId,
      userId,
      agentId,
      ratings,
      comment
    });

    await review.save();
    res.status(201).json(review);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'You have already reviewed this property.' });
    }
    res.status(500).json({ message: err.message });
  }
});

export default router;
