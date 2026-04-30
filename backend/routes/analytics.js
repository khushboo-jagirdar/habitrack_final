import express from 'express';
import Property from '../models/Property.js';
import User from '../models/User.js';

const router = express.Router();

// Increment view count
router.patch('/:id/view', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: "Property not found" });

    const today = new Date().toISOString().split('T')[0];
    
    // Increment total views
    property.views = (property.views || 0) + 1;

    // Increment daily views
    const dayEntry = property.dailyViews.find(d => d.date === today);
    if (dayEntry) {
      dayEntry.count += 1;
    } else {
      property.dailyViews.push({ date: today, count: 1 });
      // Keep only last 30 days to prevent array bloat
      if (property.dailyViews.length > 30) {
        property.dailyViews.shift();
      }
    }

    await property.save();
    res.json({ views: property.views });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get analytics for an owner/agent
router.get('/owner-stats', async (req, res) => {
  const { ownerId } = req.query;
  if (!ownerId) return res.status(400).json({ message: "ownerId is required" });

  try {
    const properties = await Property.find({ ownerId });
    
    // Aggregated stats
    let totalViews = 0;
    let propertyPerformance = [];
    let trendData = {}; // { "YYYY-MM-DD": count }

    for (const p of properties) {
      totalViews += p.views || 0;
      
      // Calculate save count from User collection
      const saveCount = await User.countDocuments({ 
        "savedProperties.id": p._id.toString() 
      });

      propertyPerformance.push({
        id: p._id,
        title: p.title,
        views: p.views || 0,
        saves: saveCount,
        status: p.listingStatus
      });

      // Aggregate trends
      p.dailyViews.forEach(dv => {
        trendData[dv.date] = (trendData[dv.date] || 0) + dv.count;
      });
    }

    // Convert trendData to sorted array
    const trends = Object.keys(trendData)
      .sort()
      .map(date => ({
        date,
        views: trendData[date]
      }));

    res.json({
      totalProperties: properties.length,
      totalViews,
      totalSaves: propertyPerformance.reduce((sum, p) => sum + p.saves, 0),
      propertyPerformance,
      trends
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
