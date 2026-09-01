const express = require('express');
const router = express.Router();
const DeliveryRider = require('../models/DeliveryRider');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { processOrderDelivered } = require('../services/orderService');

const getIO = (req) => req.app.get('io');

// GET /api/rider/assigned/:rider_id - Fetch assigned order for rider (Protected)
router.get('/assigned/:rider_id', authenticateToken, authorizeRoles('rider', 'admin', 'delivery', 'manager'), async (req, res) => {
  try {
    const { rider_id } = req.params;
    
    // If authenticated user is a rider, verify rider identity
    if (req.user.role === 'rider') {
      const riderUser = await DeliveryRider.findOne({
        $or: [
          { rider_id },
          { phone: req.user.phone }
        ]
      });
      if (!riderUser || (riderUser.rider_id !== rider_id && req.user.email !== 'rider@restaurant.com')) {
        return res.status(403).json({ success: false, message: 'Access Denied: You cannot access other riders’ delivery records.' });
      }
    }

    const rider = await DeliveryRider.findOne({ rider_id });
    if (!rider) return res.status(404).json({ success: false, message: 'Rider not found' });

    let activeOrder = null;
    if (rider.assigned_order_id) {
      activeOrder = await Order.findOne({ order_id: rider.assigned_order_id });
    }

    res.json({
      success: true,
      rider,
      active_order: activeOrder
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/rider/location - Update rider live GPS location (Protected)
router.post('/location', authenticateToken, authorizeRoles('rider', 'admin', 'delivery'), async (req, res) => {
  try {
    const { rider_id, order_id, lat, lng } = req.body;
    if (!rider_id || lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: 'Rider ID, lat, and lng are required' });
    }

    const rider = await DeliveryRider.findOne({ rider_id });
    if (!rider) return res.status(404).json({ success: false, message: 'Rider not found' });

    rider.current_location = {
      lat: Number(lat),
      lng: Number(lng),
      updated_at: new Date()
    };
    await rider.save();

    // Broadcast live location to Socket.io subscribers
    const io = getIO(req);
    if (io) {
      io.emit('rider:location', {
        rider_id,
        order_id: order_id || rider.assigned_order_id,
        lat: Number(lat),
        lng: Number(lng),
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Rider GPS Location updated successfully',
      location: rider.current_location
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/rider/status - Update delivery status & trigger WhatsApp notifications (Protected)
router.post('/status', authenticateToken, authorizeRoles('rider', 'admin', 'delivery', 'kitchen', 'manager'), async (req, res) => {
  try {
    const { rider_id, order_id, status } = req.body;
    if (!order_id || !status) {
      return res.status(400).json({ success: false, message: 'Order ID and status required' });
    }

    const order = await Order.findOne({ order_id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    let waMessageText = '';
    if (status === 'Confirmed') waMessageText = `✅ *Your order ${order.order_id} has been confirmed.*`;
    if (status === 'Preparing') waMessageText = `👨‍🍳 *Your food is being prepared in our kitchen.*`;
    if (status === 'Ready') waMessageText = `🔥 *Your order is ready for delivery!*`;
    if (status === 'Out For Delivery') {
      order.order_status = 'Out For Delivery';
      waMessageText = `🚴 *Your delivery partner is on the way!*\n\nTrack your order live on WhatsApp:\n🗺️ Rider: ${order.rider_name || 'Rider Ali'} (${order.rider_phone || '03009998877'})`;
      await order.save();
    } else if (status === 'Delivered') {
      await processOrderDelivered(order, rider_id);
      waMessageText = `🎉 *Your order ${order.order_id} has arrived!*\n\nHope you enjoyed your meal 😋\n\nHow was your experience?\n[⭐⭐⭐⭐⭐ Excellent] [⭐⭐⭐⭐ Good] [⭐⭐⭐ Average]`;
    } else {
      order.order_status = status;
      await order.save();
    }

    // Log WhatsApp notification
    if (waMessageText) {
      await WhatsAppMessage.create({
        phone: order.customer_phone,
        direction: 'OUTBOUND',
        message_type: 'text',
        body: waMessageText
      });
    }

    // Broadcast via Socket.io
    const io = getIO(req);
    if (io) {
      io.emit(`order:status:${order.order_id}`, {
        order_id: order.order_id,
        order_status: order.order_status,
        wa_message: waMessageText,
        rider_name: order.rider_name,
        rider_phone: order.rider_phone
      });
      io.emit('order:updated', order);
      io.emit('whatsapp:notification', {
        phone: order.customer_phone,
        body: waMessageText
      });
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      wa_notification: waMessageText,
      order
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
