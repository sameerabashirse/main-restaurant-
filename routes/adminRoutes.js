const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Customer = require('../models/Customer');
const Branch = require('../models/Branch');
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const DeliveryRider = require('../models/DeliveryRider');
const Review = require('../models/Review');
const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');
const WhatsAppSession = require('../models/WhatsAppSession');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Counter = require('../models/Counter');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { processOrderDelivered } = require('../services/orderService');

const getIO = (req) => req.app.get('io');

// GET /api/admin/analytics - KPI Overview
router.get('/analytics', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = await Order.find({ created_at: { $gte: today } });
    const todayRevenue = todayOrders
      .filter(o => o.order_status !== 'Cancelled')
      .reduce((sum, o) => sum + o.total_amount, 0);

    const pendingOrdersCount = await Order.countDocuments({
      order_status: { $in: ['Received', 'Confirmed', 'Preparing', 'Ready', 'Out For Delivery'] }
    });

    const completedOrdersCount = await Order.countDocuments({ order_status: 'Delivered' });
    const totalCustomersCount = await Customer.countDocuments();
    const activeRidersCount = await DeliveryRider.countDocuments({ status: { $ne: 'Offline' } });

    const reviews = await Review.find();
    const avgRating = reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : '5.0';

    const orders = await Order.find({ order_status: { $ne: 'Cancelled' } });
    const itemSalesMap = {};
    orders.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          itemSalesMap[item.name] = (itemSalesMap[item.name] || 0) + (item.quantity || 1);
        });
      }
    });

    const bestSellers = Object.keys(itemSalesMap)
      .map(name => ({ name, count: itemSalesMap[name] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const vipCount = await Customer.countDocuments({ customer_level: 'VIP Customer' });
    const regularCount = await Customer.countDocuments({ customer_level: 'Regular Customer' });
    const newCount = await Customer.countDocuments({ customer_level: 'New Customer' });

    res.json({
      success: true,
      metrics: {
        today_orders_count: todayOrders.length,
        today_revenue: todayRevenue,
        pending_orders_count: pendingOrdersCount,
        completed_orders_count: completedOrdersCount,
        total_customers: totalCustomersCount,
        active_riders: activeRidersCount,
        average_rating: Number(avgRating),
        repeat_customers_rate: totalCustomersCount > 0 ? Math.round(((vipCount + regularCount) / totalCustomersCount) * 100) : 0
      },
      best_sellers: bestSellers,
      customer_segmentation: { new: newCount, regular: regularCount, vip: vipCount }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/kitchen/orders - Dedicated Kitchen Queue (Kitchen Staff Role)
router.get('/kitchen/orders', authenticateToken, authorizeRoles('admin', 'manager', 'kitchen'), async (req, res) => {
  try {
    const orders = await Order.find({
      order_status: { $in: ['Received', 'Confirmed', 'Preparing', 'Ready'] }
    }).sort({ created_at: 1 });

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/orders - Order Management Table
router.get('/orders', authenticateToken, authorizeRoles('admin', 'manager', 'kitchen', 'delivery'), async (req, res) => {
  try {
    const orders = await Order.find().sort({ created_at: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/orders/:order_id/status
router.put('/orders/:order_id/status', authenticateToken, authorizeRoles('admin', 'manager', 'kitchen', 'delivery'), async (req, res) => {
  try {
    const { order_id } = req.params;
    const { order_status, payment_status, rider_id } = req.body;

    const order = await Order.findOne({ order_id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order_status) order.order_status = order_status;
    if (payment_status) order.payment_status = payment_status;

    if (rider_id) {
      const rider = await DeliveryRider.findOne({ rider_id });
      if (rider) {
        order.rider_id = rider.rider_id;
        order.rider_name = rider.name;
        order.rider_phone = rider.phone;
        rider.assigned_order_id = order.order_id;
        rider.status = 'On Delivery';
        await rider.save();
      }
    }

    if (order_status === 'Delivered') {
      await processOrderDelivered(order, rider_id || order.rider_id);
    } else {
      await order.save();
    }

    await AuditLog.create({
      action: 'UPDATE_ORDER_STATUS',
      performed_by: req.user.name,
      role: req.user.role,
      module: 'Orders',
      details: `Order ${order_id} status updated to '${order.order_status}'`
    });

    const io = getIO(req);
    if (io) {
      io.emit(`order:status:${order.order_id}`, {
        order_id: order.order_id,
        order_status: order.order_status,
        rider_name: order.rider_name,
        rider_phone: order.rider_phone
      });
      io.emit('order:updated', order);
    }

    res.json({ success: true, message: 'Order status updated', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/branches - Branch Management
router.get('/branches', authenticateToken, authorizeRoles('admin', 'manager', 'delivery'), async (req, res) => {
  try {
    const branches = await Branch.find();
    res.json({ success: true, branches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/branches - Add Branch
router.post('/branches', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { name, address, phone, opening_hours, lat, lng } = req.body;
    const branchId = await Counter.getNextSequence('branch_id', 'BR-CUSTOM-', 3, 10);

    const newBranch = await Branch.create({
      branch_id: branchId,
      name,
      address,
      phone,
      opening_hours: opening_hours || '12:00 PM - 12:00 AM',
      lat: Number(lat) || 31.4704,
      lng: Number(lng) || 74.4101
    });

    await AuditLog.create({
      action: 'ADD_BRANCH',
      performed_by: req.user.name,
      role: req.user.role,
      module: 'Branches',
      details: `Added new branch: ${name}`
    });

    res.json({ success: true, message: 'Branch created', branch: newBranch });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/payments - Payment Ledger
router.get('/payments', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const orders = await Order.find().sort({ created_at: -1 });
    const payments = orders.map(o => ({
      transaction_id: `TXN-${o.order_id}`,
      order_id: o.order_id,
      customer_name: o.customer_name,
      amount: o.total_amount,
      method: o.payment_method,
      status: o.payment_status,
      date: o.created_at
    }));

    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/whatsapp/inbox - WhatsApp Live Messages Inbox
router.get('/whatsapp/inbox', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const sessions = await WhatsAppSession.find().sort({ last_interaction: -1 });
    const recentMessages = await WhatsAppMessage.find().sort({ timestamp: -1 }).limit(50);
    res.json({ success: true, sessions, recent_messages: recentMessages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/whatsapp/handover - Human Support Chat Takeover
router.post('/whatsapp/handover', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const { phone, is_human_handover, staff_message } = req.body;
    let session = await WhatsAppSession.findOne({ phone });

    if (session) {
      session.is_human_handover = !!is_human_handover;
      session.assigned_staff_name = req.user.name;
      await session.save();
    }

    if (staff_message) {
      await WhatsAppMessage.create({
        phone,
        direction: 'OUTBOUND',
        message_type: 'text',
        body: `👤 *Human Support (${req.user.name}):*\n${staff_message}`
      });

      const io = getIO(req);
      if (io) {
        io.emit('whatsapp:notification', {
          phone,
          body: `👤 *Human Support (${req.user.name}):*\n${staff_message}`
        });
      }
    }

    await AuditLog.create({
      action: 'WHATSAPP_HUMAN_HANDOVER',
      performed_by: req.user.name,
      role: req.user.role,
      module: 'WhatsApp Inbox',
      details: `Set human takeover=${is_human_handover} for ${phone}`
    });

    res.json({ success: true, message: 'WhatsApp handover state updated', session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/reports/export - Export CSV Reports
router.get('/reports/export', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const orders = await Order.find().sort({ created_at: -1 });
    let csv = 'Order ID,Customer Name,Phone,Total Amount,Payment Method,Payment Status,Order Status,Date\n';
    orders.forEach(o => {
      csv += `"${o.order_id}","${o.customer_name}","${o.customer_phone}",${o.total_amount},"${o.payment_method}","${o.payment_status}","${o.order_status}","${o.created_at.toISOString()}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="feastflow_sales_report.csv"');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/audit-logs - Audit Activity Viewer
router.get('/audit-logs', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET & PUT /api/admin/settings - System Branding Settings
router.get('/settings', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/settings', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();

    Object.assign(settings, req.body);
    settings.updated_at = new Date();
    await settings.save();

    await AuditLog.create({
      action: 'UPDATE_SYSTEM_SETTINGS',
      performed_by: req.user.name,
      role: req.user.role,
      module: 'Settings',
      details: 'Updated restaurant branding and delivery configuration.'
    });

    res.json({ success: true, message: 'Settings updated successfully', settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- MENU & CUSTOMER CRM ENDPOINTS ---
router.get('/menu', authenticateToken, authorizeRoles('admin', 'manager', 'kitchen'), async (req, res) => {
  try {
    const categories = await MenuCategory.find().sort({ display_order: 1 });
    const items = await MenuItem.find({ is_active: { $ne: false } });
    res.json({ success: true, categories, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/menu/item', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const newItem = await MenuItem.create(req.body);
    res.json({ success: true, message: 'Menu item created', item: newItem });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/menu/item/:id', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    // Soft delete to protect historical order integrity
    await MenuItem.findByIdAndUpdate(req.params.id, { is_active: false });
    res.json({ success: true, message: 'Menu item archived' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/customers', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const customers = await Customer.find().sort({ total_spending: -1 });
    res.json({ success: true, customers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/customers/:customer_id/points', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const customer = await Customer.findOne({ customer_id: req.params.customer_id });
    if (customer) {
      customer.loyalty_points = Number(req.body.points);
      await customer.save();
    }
    res.json({ success: true, message: 'Points updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/riders', authenticateToken, authorizeRoles('admin', 'manager', 'delivery'), async (req, res) => {
  try {
    const riders = await DeliveryRider.find();
    res.json({ success: true, riders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/riders', authenticateToken, authorizeRoles('admin', 'manager', 'delivery'), async (req, res) => {
  try {
    const riderId = await Counter.getNextSequence('rider_id', 'RIDER-', 3, 100);
    const rider = await DeliveryRider.create({
      rider_id: riderId,
      name: req.body.name,
      phone: req.body.phone,
      vehicle_number: req.body.vehicle_number || 'LEK-0000'
    });

    // Also create User login record so rider can sign into the mobile portal
    const riderEmail = req.body.email || `rider_${riderId.toLowerCase()}@restaurant.com`;
    const defaultPassword = await bcrypt.hash('rider123', 10);

    const existingUser = await User.findOne({ email: riderEmail });
    if (!existingUser) {
      await User.create({
        name: req.body.name,
        email: riderEmail,
        password: defaultPassword,
        role: 'rider',
        phone: req.body.phone
      });
    }

    res.json({ success: true, rider, email: riderEmail });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/reviews', authenticateToken, authorizeRoles('admin', 'manager'), async (req, res) => {
  try {
    const reviews = await Review.find().sort({ created_at: -1 });
    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
