import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Property from '../models/Property.js';

const router = express.Router();
const UPLOADS_DIR = './uploads';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage });

function isPropertyLegal(property) {
  if (!property || !property.title || !property.address) return false;
  if (Number(property.price) <= 0) return false;
  const content = `${property.title} ${property.address}`.toLowerCase();
  const illegalTerms = ['illegal', 'fake', 'fraud', 'unauthorized', 'banned', 'forbidden'];
  return !illegalTerms.some(term => content.includes(term));
}

// Get all properties or by owner
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.ownerId) filter.ownerId = req.query.ownerId;
    if (req.query.type && req.query.type !== 'any') filter.type = req.query.type;
    if (req.query.propertyType && req.query.propertyType !== 'any') filter.propertyType = req.query.propertyType;
    if (req.query.minPrice || req.query.maxPrice) {
      filter.price = {};
      if (req.query.minPrice) filter.price.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) filter.price.$lte = Number(req.query.maxPrice);
    }
    if (req.query.bedroom) filter.bedroom = { $gte: Number(req.query.bedroom) };
    if (req.query.location) {
      filter.$or = [
        { title: { $regex: req.query.location, $options: 'i' } },
        { address: { $regex: req.query.location, $options: 'i' } },
      ];
    }
    const properties = await Property.find(filter).sort({ createdAt: -1 });
    res.json(properties);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single property
router.get('/:id', async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });
    res.json(property);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create property
router.post('/', upload.array('images', 5), async (req, res) => {
  try {
    const { ownerId, title, address, price, bedroom, bathroom, description, reraId, latitude, longitude, type, propertyType, agentId } = req.body;
    if (!ownerId || !title || !address || !price || !bedroom || !bathroom) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ message: 'At least one image is required.' });
    if (files.length > 5) return res.status(400).json({ message: 'You can upload up to 5 images.' });

    const tempData = { title, address, price: Number(price) };
    const property = new Property({
      ownerId,
      title,
      address,
      price: Number(price),
      type: type || 'buy',
      propertyType: propertyType || 'house',
      bedroom: Number(bedroom),
      bathroom: Number(bathroom),
      description: description || '',
      images: files.map(f => `/uploads/${f.filename}`),
      latitude: latitude ? Number(latitude) : 0,
      longitude: longitude ? Number(longitude) : 0,
      reraId: reraId || '',
      agentId: agentId || null,
      legalStatus: isPropertyLegal(tempData) ? 'legal' : 'illegal',
      verified: false,
    });
    await property.save();
    res.status(201).json(property);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify/flag property
router.patch('/:id/verify', async (req, res) => {
  try {
    const { verified, legalStatus, notes, user } = req.body;
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });

    if (typeof verified === 'boolean') property.verified = verified;
    if (legalStatus === 'legal' || legalStatus === 'illegal') property.legalStatus = legalStatus;
    property.verificationLog.push({ user: user || 'anonymous', verified: property.verified, legalStatus: property.legalStatus, notes: notes || '' });
    await property.save();
    res.json(property);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Edit property
router.put('/:id', upload.array('images', 5), async (req, res) => {
  try {
    const { ownerId, title, address, price, bedroom, bathroom, description, reraId, latitude, longitude, type, propertyType, agentId } = req.body;
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });
    if (String(property.ownerId) !== String(ownerId)) {
      return res.status(403).json({ message: 'You can only edit your own properties' });
    }

    if (title) property.title = title;
    if (address) property.address = address;
    if (price) property.price = Number(price);
    if (bedroom !== undefined) property.bedroom = Number(bedroom);
    if (bathroom !== undefined) property.bathroom = Number(bathroom);
    if (latitude) property.latitude = Number(latitude);
    if (longitude) property.longitude = Number(longitude);
    if (type) property.type = type;
    if (propertyType) property.propertyType = propertyType;
    if (description !== undefined) property.description = description;
    if (reraId !== undefined) property.reraId = reraId;
    if (agentId !== undefined) property.agentId = agentId || null;

    const files = req.files || [];
    if (files.length > 0) property.images = files.map(f => `/uploads/${f.filename}`);

    property.legalStatus = isPropertyLegal(property) ? 'legal' : 'illegal';
    await property.save();
    res.json(property);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete property
router.delete('/:id', async (req, res) => {
  try {
    const { ownerId } = req.body;
    const property = await Property.findById(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });
    if (String(property.ownerId) !== String(ownerId)) {
      return res.status(403).json({ message: 'You can only delete your own properties' });
    }
    await property.deleteOne();
    res.json({ message: 'Property deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
