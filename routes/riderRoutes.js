const express = require('express');
const router = express.Router();
const DeliveryRider = require('../models/DeliveryRider');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Branch = require('../models/Branch');
const AuditLog = require('../models/AuditLog');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { processOrderDelivered, normalizeOrderStatus, CANONICAL_STATUS } = require('../services/orderService');

const getIO = (req) => req.app.get('io');

// GET /api/rider/assigned/:rider_id - Fetch assigned order for rider (Protected)
router.get('/assigned/:rider_id', authenticateToken, authorizeRoles('rider', 'admin', 'delivery', 'manager'), async (req, res) => {
  try {
    const { rider_id } = req.params;
    
    // If authenticated user is a rider, verify rider identity
    if (req.user.role === 'rider') {
      const myRider = await DeliveryRider.findOne({
        $or: [
          { email: req.user.email },
          { phone: req.user.phone }
        ]
      });

      const allowedRiderId = myRider?.rider_id || (req.user.email === 'rider@restaurant.com' ? 'RIDER-101' : null);

      if (!allowedRiderId || allowedRiderId !== rider_id) {
        return res.status(403).json({ success: false, message: 'Access Denied: You cannot access other riders’ delivery records.' });
      }
    }

    const rider = await DeliveryRider.findOne({ rider_id });
    if (!rider) return res.status(404).json({ success: false, message: 'Rider not found' });

    let activeOrder = null;
    if (rider.assigned_order_id) {
      const rawOrder = await Order.findOne({ order_id: rider.assigned_order_id }).lean();
      if (rawOrder) {
        rawOrder.order_status = normalizeOrderStatus(rawOrder.order_status);

        // Security check: Redact any sensitive banking/receipt details from rider view
        delete rawOrder.bank_receipt;
        delete rawOrder.transaction_receipt;
        delete rawOrder.iban;
        delete rawOrder.bank_account;
        delete rawOrder.account_number;

        // Calculate remaining amount to collect
        const total = rawOrder.total_amount || 0;
        const status = (rawOrder.payment_status || 'Pending').trim().toLowerCase();
        const isPaid = status === 'paid' || status === 'verified';
        const isCashCollected = Boolean(rawOrder.cashReceivedByRider);
        const paidAmount = rawOrder.paid_amount || (isPaid ? total : (isCashCollected ? (rawOrder.cashReceivedAmount || total) : 0));
        
        rawOrder.remaining_amount_to_collect = (isPaid || isCashCollected) ? 0 : Math.max(0, total - paidAmount);
        activeOrder = rawOrder;
      }
    }

    let branchLocation = { lat: 31.4704, lng: 74.4101, name: 'FeastFlow DHA Branch', address: 'Phase 5 Commercial DHA, Lahore', phone: '042-35894120' };
    if (activeOrder?.branch_id) {
      const branch = await Branch.findOne({ branch_id: activeOrder.branch_id });
      if (branch) {
        branchLocation = {
          lat: branch.lat,
          lng: branch.lng,
          name: branch.name,
          address: branch.address,
          phone: branch.phone
        };
      }
    }

    res.json({
      success: true,
      rider,
      active_order: activeOrder,
      branch: branchLocation
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/rider/confirm-cash - Confirm cash collection from customer (Protected)
router.post('/confirm-cash', authenticateToken, authorizeRoles('rider', 'admin', 'delivery', 'manager'), async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const order = await Order.findOne({ order_id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Determine rider identity
    let riderName = order.rider_name || 'Rider';
    let riderId = order.rider_id;

    if (req.user.role === 'rider') {
      const myRider = await DeliveryRider.findOne({
        $or: [
          { email: req.user.email },
          { phone: req.user.phone }
        ]
      });
      const allowedRiderId = myRider?.rider_id || (req.user.email === 'rider@restaurant.com' ? 'RIDER-101' : null);
      if (order.rider_id && order.rider_id !== allowedRiderId) {
        return res.status(403).json({ success: false, message: 'Access Denied: You are not assigned to this order.' });
      }
      riderId = allowedRiderId || order.rider_id;
      riderName = myRider?.name || order.rider_name || 'Rider';
    } else {
      riderName = req.user.name || 'Staff';
    }

    // Prevent duplicate cash confirmation
    if (order.cashReceivedByRider) {
      return res.status(400).json({
        success: false,
        message: 'Cash has already been confirmed as collected for this order.',
        cashReceivedAt: order.cashReceivedAt,
        cashReceivedAmount: order.cashReceivedAmount
      });
    }

    const total = order.total_amount || 0;
    const paidAlready = order.paid_amount || 0;
    const remainingToCollect = Math.max(0, total - paidAlready);

    order.cashReceivedByRider = true;
    order.cashReceivedAmount = remainingToCollect;
    order.cashReceivedAt = new Date();
    order.cashReceivedRiderId = riderId;
    order.cashReceivedRiderName = riderName;
    order.payment_status = 'Cash Collected';
    await order.save();

    // Audit log
    await AuditLog.create({
      action: 'CASH_COLLECTED_BY_RIDER',
      performed_by: `${riderName} (${riderId || 'Rider'})`,
      role: req.user.role,
      module: 'Payments',
      details: `Rider confirmed cash collection of Rs. ${remainingToCollect} for order ${order.order_id}`
    });

    const io = getIO(req);
    if (io) {
      const cashPayload = {
        order_id: order.order_id,
        rider_id: riderId,
        rider_name: riderName,
        amount: remainingToCollect,
        collected_at: order.cashReceivedAt,
        payment_status: order.payment_status
      };
      io.emit('order:cash-collected', cashPayload);
      io.emit('order:updated', order);
      io.to(`order:${order.order_id}`).emit('order:status', {
        order_id: order.order_id,
        order_status: order.order_status,
        payment_status: order.payment_status,
        cashReceivedByRider: true,
        cashReceivedAmount: remainingToCollect
      });
      console.log(`💵 [Socket.IO Broadcast] Emitted order:cash-collected for ${order.order_id}`);
    }

    res.json({
      success: true,
      message: `Cash collection of Rs. ${remainingToCollect} confirmed successfully.`,
      order
    });
  } catch (err) {
    console.error('Error in /api/rider/confirm-cash:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/rider/location - Update rider live GPS location (Protected)
router.post('/location', authenticateToken, authorizeRoles('rider', 'admin', 'delivery', 'manager'), async (req, res) => {
  try {
    const rawLat = req.body.latitude !== undefined ? req.body.latitude : req.body.lat;
    const rawLng = req.body.longitude !== undefined ? req.body.longitude : req.body.lng;
    const rawOrderId = req.body.orderId || req.body.order_id;
    const rawAccuracy = req.body.accuracy;

    if (rawLat === undefined || rawLng === undefined) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude coordinates are required.' });
    }

    const numLat = Number(rawLat);
    const numLng = Number(rawLng);
    const numAcc = Number(rawAccuracy) || 10;
    const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

    if (isNaN(numLat) || numLat < -90 || numLat > 90 || isNaN(numLng) || numLng < -180 || numLng > 180) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates: Latitude must be between -90 and 90, Longitude between -180 and 180.' });
    }

    // Resolve authenticated rider identity securely from JWT (do not trust client-supplied rider_id)
    let actualRiderId = null;
    let rider = null;

    if (req.user.role === 'rider') {
      rider = await DeliveryRider.findOne({
        $or: [
          { email: req.user.email },
          { phone: req.user.phone }
        ]
      });

      if (!rider && req.user.email === 'rider@restaurant.com') {
        rider = await DeliveryRider.findOne({ rider_id: 'RIDER-101' });
      }

      if (!rider) {
        console.warn(`[Rider GPS Auth Failed] No rider record found for email: ${req.user.email}`);
        return res.status(403).json({ success: false, message: 'Access Denied: Rider record not found.' });
      }

      actualRiderId = rider.rider_id;
    } else {
      // Admins/Dispatch can specify rider_id
      actualRiderId = req.body.rider_id || 'RIDER-101';
      rider = await DeliveryRider.findOne({ rider_id: actualRiderId });
    }

    const targetOrderId = rawOrderId || rider?.assigned_order_id;
    if (!targetOrderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required to push live delivery location.' });
    }

    // Verify rider is assigned to this exact order
    const order = await Order.findOne({ order_id: targetOrderId });
    if (!order) {
      return res.status(404).json({ success: false, message: `Order ${targetOrderId} not found.` });
    }

    if (req.user.role === 'rider') {
      if (order.rider_id && order.rider_id !== actualRiderId) {
        console.warn(`[Rider GPS Rejected] Rider ${actualRiderId} is not assigned to order ${targetOrderId} (Assigned: ${order.rider_id})`);
        return res.status(403).json({ success: false, message: `Access Denied: You are not assigned to order ${targetOrderId}.` });
      }
    }

    console.log(`[Rider GPS Received] Order: ${targetOrderId} | Lat: ${numLat}, Lng: ${numLng}, Acc: ${numAcc}m | Rider: ${actualRiderId} (Auth: Verified)`);

    // Persist latest location on Rider record
    if (rider) {
      rider.current_location = {
        lat: numLat,
        lng: numLng,
        updated_at: timestamp
      };
      await rider.save();
    }

    // Persist latest location on Order record
    order.riderLocation = {
      latitude: numLat,
      longitude: numLng,
      accuracy: numAcc,
      updatedAt: timestamp
    };
    await order.save();

    // Standardized Payload for Socket.IO Room Broadcast
    const payload = {
      orderId: targetOrderId,
      latitude: numLat,
      longitude: numLng,
      accuracy: numAcc,
      timestamp
    };

    // Backward compatibility payload
    const legacyPayload = {
      rider_id: actualRiderId,
      order_id: targetOrderId,
      lat: numLat,
      lng: numLng,
      accuracy: numAcc,
      timestamp
    };

    const io = getIO(req);
    if (io) {
      // Emit ONLY to the specific order room
      io.to(`order:${targetOrderId}`).emit('rider:location:update', payload);
      io.to(`order:${targetOrderId}`).emit('rider:location', legacyPayload);
      console.log(`📡 [Socket.IO Broadcast] Emitted rider:location:update to room order:${targetOrderId}`);
    }

    res.json({
      success: true,
      message: 'Rider GPS Location updated successfully',
      data: payload,
      location: {
        lat: numLat,
        lng: numLng,
        updated_at: timestamp
      }
    });
  } catch (err) {
    console.error('Error in /api/rider/location:', err);
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

    const currentStatus = normalizeOrderStatus(order.order_status);
    const nextStatus = normalizeOrderStatus(status);

    // Verify rider authorization
    if (req.user.role === 'rider') {
      const myRider = await DeliveryRider.findOne({
        $or: [
          { email: req.user.email },
          { phone: req.user.phone }
        ]
      });
      const allowedRiderId = myRider?.rider_id || (req.user.email === 'rider@restaurant.com' ? 'RIDER-101' : null);
      if (order.rider_id && order.rider_id !== allowedRiderId) {
        return res.status(403).json({ success: false, message: 'Access Denied: You are not assigned to this order.' });
      }

      // Enforce status sequence:
      // RIDER_ASSIGNED -> RIDER_ACCEPTED -> PICKED_UP -> OUT_FOR_DELIVERY -> DELIVERED
      if (nextStatus === CANONICAL_STATUS.OUT_FOR_DELIVERY) {
        if (currentStatus !== CANONICAL_STATUS.PICKED_UP) {
          return res.status(400).json({
            success: false,
            message: `Invalid status transition: Order must be marked PICKED_UP from restaurant before starting delivery (current status: ${currentStatus}).`
          });
        }
      } else if (nextStatus === CANONICAL_STATUS.DELIVERED) {
        if (currentStatus !== CANONICAL_STATUS.OUT_FOR_DELIVERY) {
          return res.status(400).json({
            success: false,
            message: `Invalid status transition: Order must be OUT_FOR_DELIVERY before marking Delivered (current status: ${currentStatus}).`
          });
        }
        // Requirement: Rider must confirm cash collection before marking a Cash on Delivery order as Delivered
        const isOnlinePaid = (order.payment_status === 'Paid' || order.payment_status === 'PAID') && order.payment_method !== 'Cash on Delivery';
        if (!isOnlinePaid && !order.cashReceivedByRider) {
          return res.status(400).json({
            success: false,
            message: 'Cash collection not confirmed: Please confirm cash received from customer before marking order as Delivered.'
          });
        }
      } else if (nextStatus === CANONICAL_STATUS.PICKED_UP) {
        const allowedPrevious = [CANONICAL_STATUS.RIDER_ACCEPTED, CANONICAL_STATUS.RIDER_ASSIGNED, CANONICAL_STATUS.READY_FOR_PICKUP];
        if (!allowedPrevious.includes(currentStatus)) {
          return res.status(400).json({
            success: false,
            message: `Invalid status transition: Order cannot be marked PICKED_UP from status ${currentStatus}.`
          });
        }
      }
    }

    let waMessageText = '';
    if (nextStatus === CANONICAL_STATUS.CONFIRMED) {
      order.order_status = CANONICAL_STATUS.CONFIRMED;
      waMessageText = `✅ *Your order ${order.order_id} has been confirmed.*`;
      await order.save();
    } else if (nextStatus === CANONICAL_STATUS.PREPARING) {
      order.order_status = CANONICAL_STATUS.PREPARING;
      waMessageText = `👨‍🍳 *Your food is being prepared in our kitchen.*`;
      await order.save();
    } else if (nextStatus === CANONICAL_STATUS.READY_FOR_PICKUP) {
      order.order_status = CANONICAL_STATUS.READY_FOR_PICKUP;
      waMessageText = `🔥 *Your order is ready for pickup!*`;
      await order.save();
    } else if (nextStatus === CANONICAL_STATUS.RIDER_ASSIGNED) {
      order.order_status = CANONICAL_STATUS.RIDER_ASSIGNED;
      waMessageText = `🛵 *Rider ${order.rider_name || 'Ali'} has been assigned to your order.*`;
      await order.save();
    } else if (nextStatus === CANONICAL_STATUS.RIDER_ACCEPTED) {
      order.order_status = CANONICAL_STATUS.RIDER_ACCEPTED;
      waMessageText = `🛵 *Rider ${order.rider_name || 'Ali'} accepted your order and is heading to the restaurant.*`;
      await order.save();
    } else if (nextStatus === CANONICAL_STATUS.PICKED_UP) {
      order.order_status = CANONICAL_STATUS.PICKED_UP;
      waMessageText = `🛍️ *Rider has picked up your food from the restaurant.*`;
      await order.save();
    } else if (nextStatus === CANONICAL_STATUS.OUT_FOR_DELIVERY) {
      order.order_status = CANONICAL_STATUS.OUT_FOR_DELIVERY;
      const host = req.headers.host || 'localhost:3000';
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const baseUrl = process.env.APP_BASE_URL || `${protocol}://${host}`;
      const trackingUrl = `${baseUrl}/track/${order.order_id}`;
      waMessageText = `🚴 *Your order is out for delivery.*\n\nTrack your rider live:\n${trackingUrl}\n\n🗺️ Rider: ${order.rider_name || 'Delivery Partner'} (${order.rider_phone || ''})`;
      await order.save();
    } else if (nextStatus === CANONICAL_STATUS.DELIVERED) {
      await processOrderDelivered(order, rider_id);
      waMessageText = `🎉 *Your order ${order.order_id} has arrived!*\n\nHope you enjoyed your meal 😋\n\nHow was your experience?\n[⭐⭐⭐⭐⭐ Excellent] [⭐⭐⭐⭐ Good] [⭐⭐⭐ Average]`;
    } else if (nextStatus === CANONICAL_STATUS.CANCELLED) {
      order.order_status = CANONICAL_STATUS.CANCELLED;
      waMessageText = `❌ *Your order ${order.order_id} has been cancelled.*`;
      await order.save();
    } else {
      order.order_status = nextStatus;
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
      const statusPayload = {
        order_id: order.order_id,
        order_status: order.order_status,
        wa_message: waMessageText,
        rider_name: order.rider_name,
        rider_phone: order.rider_phone
      };
      io.to(`order:${order.order_id}`).emit('order:status', statusPayload);
      io.emit(`order:status:${order.order_id}`, statusPayload);
      io.emit('order:updated', order);
      io.emit('whatsapp:notification', {
        phone: order.customer_phone,
        body: waMessageText
      });
    }

    res.json({
      success: true,
      message: `Order status updated to ${order.order_status}`,
      wa_notification: waMessageText,
      order
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

