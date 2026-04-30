import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import User from '../models/User.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'habittrack_secret';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@habittrack.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234';

// ─── Sandbox.co.in token cache ───────────────────────────────────────────────
let _sandboxToken = null;
let _sandboxTokenExpiry = 0;

async function getSandboxToken() {
  if (_sandboxToken && Date.now() < _sandboxTokenExpiry) return _sandboxToken;
  const apiKey    = process.env.AADHAAR_API_KEY;
  const apiSecret = process.env.AADHAAR_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error('Sandbox API key/secret not configured.');
  console.log(`[Sandbox Debug] Authenticating with key: ${apiKey.substring(0, 8)}...`);
  const r = await fetch('https://api.sandbox.co.in/authenticate', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'x-api-secret': apiSecret,
      'x-api-version': '1.0',
      'Content-Type': 'application/json',
    },
  });
  const d = await r.json();
  if (!r.ok || (d.code !== 200 && d.status !== 'success')) {
    console.error('[Sandbox Auth Error]:', d);
    throw new Error(d.message || 'Sandbox auth failed.');
  }
  _sandboxToken = d.access_token;
  console.log('[Sandbox Debug] Auth successful, token received.');
  _sandboxTokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 hours
  return _sandboxToken;
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

// ─── Register ────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, userType } = req.body;
    if (!fullName || !email || !password || !userType) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'User already exists.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      fullName,
      email: email.toLowerCase(),
      password: hashedPassword,
      userType,
    });
    await newUser.save();

    // Auto-login: return token + user so frontend can log in immediately
    const token = signToken({ id: newUser._id, email: newUser.email, userType: newUser.userType, isAdmin: false });
    res.status(201).json({
      message: 'Account created successfully.',
      userId: newUser._id,
      token,
      user: {
        id: newUser._id,
        fullName: newUser.fullName,
        email: newUser.email,
        userType: newUser.userType,
        avatar: newUser.avatar,
        aadhaarVerified: newUser.aadhaarVerified,
        isAdmin: false,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Registration failed.' });
  }
});

// ─── Login ───────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials.' });

    const token = signToken({ id: user._id, email: user.email, userType: user.userType, isAdmin: user.isAdmin });
    res.json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        userType: user.userType,
        avatar: user.avatar,
        aadhaarVerified: user.aadhaarVerified,
        isAdmin: user.isAdmin,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Login failed.' });
  }
});

// ─── Admin Login ─────────────────────────────────────────────────────────────
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    // Check env-based admin credentials first
    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && password === ADMIN_PASSWORD) {
      const token = signToken({ id: 'admin', email: ADMIN_EMAIL, userType: 'admin', isAdmin: true });
      return res.json({
        token,
        user: {
          id: 'admin',
          fullName: 'Administrator',
          email: ADMIN_EMAIL,
          userType: 'admin',
          isAdmin: true,
          avatar: '',
        },
      });
    }

    // Also allow DB users with isAdmin: true
    const user = await User.findOne({ email: email.toLowerCase(), isAdmin: true });
    if (!user) return res.status(401).json({ message: 'Invalid admin credentials.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid admin credentials.' });

    const token = signToken({ id: user._id, email: user.email, userType: 'admin', isAdmin: true });
    res.json({
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        userType: 'admin',
        isAdmin: true,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Admin login failed.' });
  }
});

// ─── Email transporter (Gmail SMTP) ──────────────────────────────────────────
function getMailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

// ─── Step 1: Send Reset OTP to Email ─────────────────────────────────────────
router.post('/send-reset-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'No account found with this email.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    user.resetOtpVerified = false;
    await user.save();

    // Send email
    const transporter = getMailTransporter();
    await transporter.sendMail({
      from: `"HabiTrack" <${process.env.SMTP_EMAIL}>`,
      to: user.email,
      subject: '🔐 HabiTrack — Password Reset OTP',
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e0eaea;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#008080,#00b3b3);padding:28px 24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;">HabiTrack</h1>
            <p style="color:#c8fff4;margin:4px 0 0;font-size:13px;">India's #1 Property Platform</p>
          </div>
          <div style="padding:28px 24px;">
            <p style="color:#1a3a3a;font-size:15px;">Hi <strong>${user.fullName}</strong>,</p>
            <p style="color:#4a6a6a;font-size:14px;">We received a request to reset your password. Use the OTP below to verify your identity:</p>
            <div style="text-align:center;margin:24px 0;">
              <div style="display:inline-block;background:#f0fafa;border:2px dashed #008080;border-radius:10px;padding:16px 36px;letter-spacing:8px;font-size:32px;font-weight:700;color:#008080;">${otp}</div>
            </div>
            <p style="color:#4a6a6a;font-size:13px;">This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
            <p style="color:#999;font-size:12px;margin-top:20px;">If you didn't request this, please ignore this email.</p>
          </div>
          <div style="background:#f8fafa;padding:14px 24px;text-align:center;border-top:1px solid #e0eaea;">
            <p style="color:#999;font-size:11px;margin:0;">© ${new Date().getFullYear()} HabiTrack. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    console.log(`[RESET] OTP sent to ${user.email}`);
    res.json({ message: 'OTP sent to your email address.' });
  } catch (err) {
    console.error('[send-reset-otp]', err.message);
    res.status(500).json({ message: err.message || 'Failed to send OTP.' });
  }
});

// ─── Step 2: Verify Reset OTP ────────────────────────────────────────────────
router.post('/verify-reset-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (!user.resetOtp || !user.resetOtpExpiry)
      return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
    if (new Date() > user.resetOtpExpiry)
      return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    if (user.resetOtp !== otp)
      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });

    user.resetOtpVerified = true;
    user.resetOtp = '';
    await user.save();

    res.json({ message: 'OTP verified successfully. You can now set a new password.' });
  } catch (err) {
    console.error('[verify-reset-otp]', err.message);
    res.status(500).json({ message: err.message || 'OTP verification failed.' });
  }
});

// ─── Step 3: Reset Password (requires OTP verification) ─────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ message: 'Email and new password are required.' });
    if (newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (!user.resetOtpVerified)
      return res.status(403).json({ message: 'Please verify your email OTP first.' });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOtpVerified = false;
    user.resetOtp = '';
    user.resetOtpExpiry = null;
    await user.save();

    res.json({ message: 'Password reset successful. You can now sign in.' });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Reset failed.' });
  }
});

// ─── Aadhaar: Send OTP ────────────────────────────────────────────────────────
// Supported providers (set AADHAAR_PROVIDER in .env):
//   sandbox   → https://sandbox.co.in       (14-day free trial, real OTP, instant signup)
//   surepass  → https://surepass.io          (easiest — just email signup, instant token)
//   digio     → https://www.digio.in         (email signup, sandbox available)
//   (blank)   → dev mode: OTP shown on screen
router.post('/aadhaar/send-otp', async (req, res) => {
  try {
    const { aadhaarNumber, userId, mode } = req.body;
    if (!aadhaarNumber || !userId)
      return res.status(400).json({ message: 'Aadhaar number and userId are required.' });
    if (!/^\d{12}$/.test(aadhaarNumber))
      return res.status(400).json({ message: 'Invalid Aadhaar number. Must be 12 digits.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    let otp = null;
    let refId = null;
    const provider = process.env.AADHAAR_PROVIDER;
    const apiKey   = process.env.AADHAAR_API_KEY;

    // ── Demo / Manual Bypass Mode ─────────────────────────────────────────────
    if (mode === 'demo' && process.env.NODE_ENV !== 'production') {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`[DEMO MODE] Aadhaar OTP for user ${userId}: ${otp}`);
      
    // ── Sandbox.co.in (RECOMMENDED — 14-day free trial, real OTP) ─────────────
    // Sign up: https://sandbox.co.in → Get API key + secret from console
    // Docs: https://developer.sandbox.co.in
    } else if (provider === 'sandbox' && apiKey) {
      console.log(`[Sandbox Debug] Requesting OTP for Aadhaar: XXXX-XXXX-${aadhaarNumber.substring(8)}`);
      const token = await getSandboxToken();
      const r = await fetch('https://api.sandbox.co.in/kyc/aadhaar/okyc/otp', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Authorization': token,
          'x-api-version': '1.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          '@entity': 'in.co.sandbox.kyc.aadhaar.okyc.otp.request',
          aadhaar_number: aadhaarNumber,
          consent: 'Y',
          reason: 'KYC verification for HabiTrack',
        }),
      });
      const d = await r.json();
      console.log('[Sandbox Debug] OTP Response:', d);

      if (!r.ok || (d.code !== 200 && d.status !== 'success')) {
        console.error('[Sandbox OTP Error]:', d);
        if (process.env.NODE_ENV !== 'production') {
          console.warn("[Sandbox Error] falling back to Dev Mode for testing.");
          otp = "123456";
        } else {
          return res.status(502).json({ message: d.message || 'Sandbox: failed to send OTP.' });
        }
      } else {
        refId = d.data?.ref_id || d.data?.reference_id;
        console.log('[Sandbox Debug] OTP sent successfully. Reference ID:', refId);
      }

    // ── Surepass ─────────────────────────────────────────────────────────────
    // Sign up: https://surepass.io → Dashboard → API Token (no business docs needed)
    // Docs: https://docs.surepass.io/aadhaar-otp-based-verification
    } else if (provider === 'surepass' && apiKey) {
      const r = await fetch('https://kyc-api.surepass.io/api/v1/aadhaar-v2/generate-otp', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_number: aadhaarNumber }),
      });
      const d = await r.json();
      if (!r.ok || !d.success)
        return res.status(502).json({ message: d.message || 'Surepass: failed to send OTP.' });
      refId = d.data?.client_id;

    // ── Digio ─────────────────────────────────────────────────────────────────
    // Sign up: https://www.digio.in/developer.html → sandbox credentials via email
    // Docs: https://developer.digio.in/#aadhaar-esign
    } else if (provider === 'digio' && apiKey && process.env.AADHAAR_API_SECRET) {
      const creds = Buffer.from(`${apiKey}:${process.env.AADHAAR_API_SECRET}`).toString('base64');
      const r = await fetch('https://ext.digio.in:444/client/kyc/aadhaar/initiate_request', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaar_number: aadhaarNumber, purpose: 'KYC verification' }),
      });
      const d = await r.json();
      if (!r.ok || d.error)
        return res.status(502).json({ message: d.message || 'Digio: failed to send OTP.' });
      refId = d.id;

    // ── Dev / demo mode ───────────────────────────────────────────────────────
    } else {
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`[DEV] Aadhaar OTP for user ${userId}: ${otp}`);
    }

    user.aadhaarNumber    = aadhaarNumber;
    user.aadhaarOtp       = otp || '';
    user.aadhaarOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    if (refId) user.aadhaarRefId = refId;
    await user.save();

    res.json({
      message: 'OTP sent to your Aadhaar-linked mobile number.',
      ...(process.env.NODE_ENV !== 'production' && otp ? { devOtp: otp } : {}),
    });
  } catch (err) {
    console.error('[Aadhaar send-otp]', err.message);
    res.status(500).json({ message: err.message || 'Failed to send OTP.' });
  }
});

// ─── Aadhaar: Verify OTP ──────────────────────────────────────────────────────
router.post('/aadhaar/verify-otp', async (req, res) => {
  try {
    const { otp, userId } = req.body;
    if (!otp || !userId)
      return res.status(400).json({ message: 'OTP and userId are required.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (!user.aadhaarOtpExpiry)
      return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
    if (new Date() > user.aadhaarOtpExpiry)
      return res.status(400).json({ message: 'OTP expired. Please request a new one.' });

    const provider = process.env.AADHAAR_PROVIDER;
    const apiKey   = process.env.AADHAAR_API_KEY;

    // ── Sandbox.co.in verify ──────────────────────────────────────────────────
    if (provider === 'sandbox' && apiKey && user.aadhaarRefId) {
      const token = await getSandboxToken();
      const r = await fetch('https://api.sandbox.co.in/kyc/aadhaar/okyc/otp/verify', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Authorization': token,
          'x-api-version': '2.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          '@entity': 'in.co.sandbox.kyc.aadhaar.okyc.request',
          reference_id: user.aadhaarRefId,
          otp,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.code !== 200)
        return res.status(400).json({ message: d.message || 'Invalid OTP.' });

    // ── Surepass verify ───────────────────────────────────────────────────────
    } else if (provider === 'surepass' && apiKey && user.aadhaarRefId) {
      const r = await fetch('https://kyc-api.surepass.io/api/v1/aadhaar-v2/submit-otp', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: user.aadhaarRefId, otp }),
      });
      const d = await r.json();
      if (!r.ok || !d.success)
        return res.status(400).json({ message: d.message || 'Invalid OTP.' });

    // ── Digio verify ──────────────────────────────────────────────────────────
    } else if (provider === 'digio' && apiKey && process.env.AADHAAR_API_SECRET && user.aadhaarRefId) {
      const creds = Buffer.from(`${apiKey}:${process.env.AADHAAR_API_SECRET}`).toString('base64');
      const r = await fetch(`https://ext.digio.in:444/client/kyc/aadhaar/verify_otp`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.aadhaarRefId, otp }),
      });
      const d = await r.json();
      if (!r.ok || d.error)
        return res.status(400).json({ message: d.message || 'Invalid OTP.' });

    // ── Dev / demo mode ───────────────────────────────────────────────────────
    } else {
      if (!user.aadhaarOtp || user.aadhaarOtp !== otp)
        return res.status(400).json({ message: 'Invalid OTP.' });
    }

    user.aadhaarVerified  = true;
    user.aadhaarOtp       = '';
    user.aadhaarOtpExpiry = null;
    user.aadhaarRefId     = '';
    await user.save();

    res.json({ message: 'Aadhaar verified successfully.', aadhaarVerified: true });
  } catch (err) {
    console.error('[Aadhaar verify-otp]', err.message);
    res.status(500).json({ message: err.message || 'OTP verification failed.' });
  }
});

export default router;
