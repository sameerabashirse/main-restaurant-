const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const DeliveryRider = require('../models/DeliveryRider');
const AuditLog = require('../models/AuditLog');

const JWT_SECRET = process.env.JWT_SECRET || 'feastflow_super_secret_jwt_key_2026';

// 1. Staff Operations Login (/api/auth/staff-login)
router.post('/staff-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    let redirectUrl = '/staff/manager/dashboard';
    if (user.role === 'admin') redirectUrl = '/admin/dashboard';
    if (user.role === 'kitchen') redirectUrl = '/staff/kitchen/dashboard';
    if (user.role === 'delivery') redirectUrl = '/staff/delivery/dashboard';
    if (user.role === 'rider') redirectUrl = '/rider/dashboard';

    await AuditLog.create({
      action: 'STAFF_LOGIN_SUCCESS',
      performed_by: user.name,
      role: user.role,
      module: 'Auth',
      details: `Staff user logged in as ${user.role}`
    });

    return res.json({
      success: true,
      token,
      redirectUrl,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Staff Login Error:', err);
    res.status(500).json({ success: false, message: 'Server authentication error.' });
  }
});

// 2. Super Admin Login (/api/auth/admin-login)
router.post('/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, role: 'admin' });

    if (!user) {
      return res.status(403).json({ success: false, message: 'Access Denied. Only Super Admins may log in here.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials.' });
    }

    const token = jwt.sign(
      { userId: user._id, role: 'admin', email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    await AuditLog.create({
      action: 'ADMIN_LOGIN_SUCCESS',
      performed_by: user.name,
      role: 'admin',
      module: 'Auth',
      details: 'Super Admin logged into Admin Portal'
    });

    return res.json({
      success: true,
      token,
      redirectUrl: '/admin/dashboard',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: 'admin'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Admin login error.' });
  }
});

// 3. Rider Login (/api/auth/rider-login)
router.post('/rider-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, role: 'rider' });

    if (!user) {
      return res.status(403).json({ success: false, message: 'Access Denied. Rider account not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid rider credentials.' });
    }

    const token = jwt.sign(
      { userId: user._id, role: 'rider', email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      token,
      redirectUrl: '/rider/dashboard',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: 'rider'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Rider authentication error.' });
  }
});

// 4. Token Verification (/api/auth/verify)
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ success: true, user: decoded });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
});

module.exports = router;
