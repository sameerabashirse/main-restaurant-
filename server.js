require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/adminRoutes');
const riderRoutes = require('./routes/riderRoutes');
const whatsappWebhookRoutes = require('./routes/whatsappWebhookRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Save io instance to app
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Connect Database & Seed initial records
connectDB();

// API & WhatsApp Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/whatsapp', whatsappWebhookRoutes); // WhatsApp Cloud API Webhook

// Distinct HTML Page Routes for Separated Portals
app.get('/staff/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'staff-login.html'));
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/rider/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rider-login.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/staff/manager/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manager-dashboard.html'));
});

app.get('/staff/kitchen/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kitchen-dashboard.html'));
});

app.get('/staff/delivery/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'delivery-dashboard.html'));
});

app.get('/rider/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rider-dashboard.html'));
});

// Backward compatibility helper routes
app.get('/admin', (req, res) => res.redirect('/admin/login'));
app.get('/staff', (req, res) => res.redirect('/staff/login'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date(),
    service: 'FeastFlow Multi-Portal Restaurant Platform'
  });
});

// Socket.io Real-time Event Handling
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  socket.on('rider:location:send', (data) => {
    io.emit('rider:location', data);
  });

  socket.on('join:order', (orderId) => {
    socket.join(`order:${orderId}`);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 FEASTFLOW MULTI-PORTAL RESTAURANT SYSTEM RUNNING!`);
  console.log(`💬 Customer WhatsApp Assistant: http://localhost:${PORT}`);
  console.log(`👨‍🍳 Staff Operations Portal:   http://localhost:${PORT}/staff/login`);
  console.log(`👑 Super Admin Portal:         http://localhost:${PORT}/admin/login`);
  console.log(`🚴 Rider Portal:               http://localhost:${PORT}/rider/login`);
  console.log(`====================================================`);
});
