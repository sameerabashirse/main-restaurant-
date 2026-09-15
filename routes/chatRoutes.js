const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Branch = require('../models/Branch');
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const DeliveryRider = require('../models/DeliveryRider');
const Review = require('../models/Review');
const ReviewReward = require('../models/ReviewReward');
const Reminder = require('../models/Reminder');
const WhatsAppSession = require('../models/WhatsAppSession');
const Counter = require('../models/Counter');
const { validateAndCalculateCart, normalizeOrderStatus, CANONICAL_STATUS } = require('../services/orderService');

const getIO = (req) => req.app.get('io');

// POST /api/chat/start - Identify customer by WhatsApp phone number
router.post('/start', async (req, res) => {
  try {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    const cleanPhone = phone.trim();
    let customer = await Customer.findOne({ phone: cleanPhone });
    let isReturning = false;
    let lastOrder = null;

    if (customer) {
      isReturning = true;
      lastOrder = await Order.findOne({ customer_id: customer.customer_id }).sort({ created_at: -1 });
    } else {
      const newId = await Counter.getNextSequence('customer_id', 'CUST-', 4, 1000);
      customer = await Customer.create({
        customer_id: newId,
        name: name ? name.trim() : 'Customer',
        phone: cleanPhone,
        addresses: [
          { label: 'Home', address: 'House 42, Street 10, Phase 5 DHA, Lahore', lat: 31.4750, lng: 74.4200 }
        ]
      });
    }

    // Initialize or update WhatsApp session
    await WhatsAppSession.findOneAndUpdate(
      { phone: cleanPhone },
      { phone: cleanPhone, name: customer.name, customer_id: customer.customer_id, last_interaction: new Date() },
      { upsert: true, new: true }
    );

    const branches = await Branch.find({ is_active: true });
    const categories = await MenuCategory.find({ is_active: true }).sort({ display_order: 1 });

    res.json({
      success: true,
      is_returning: isReturning,
      customer: {
        customer_id: customer.customer_id,
        name: customer.name,
        phone: customer.phone,
        addresses: customer.addresses,
        favorite_items: customer.favorite_items,
        loyalty_points: customer.loyalty_points,
        customer_level: customer.customer_level,
        total_spending: customer.total_spending,
        completed_orders: customer.completed_orders,
        total_orders: customer.total_orders
      },
      last_order: lastOrder,
      branches,
      categories
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/branches
router.get('/branches', async (req, res) => {
  try {
    const branches = await Branch.find({ is_active: true });
    res.json({ success: true, branches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/menu
router.get('/menu', async (req, res) => {
  try {
    const categories = await MenuCategory.find({ is_active: true }).sort({ display_order: 1 });
    const menuItems = await MenuItem.find({ is_available: true, is_active: { $ne: false } });

    res.json({
      success: true,
      categories,
      menu_items: menuItems
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/reorder/:customer_id - Quick reorder previous meal
router.get('/reorder/:customer_id', async (req, res) => {
  try {
    const { customer_id } = req.params;
    const lastOrder = await Order.findOne({ customer_id }).sort({ created_at: -1 });

    if (!lastOrder) {
      return res.status(404).json({ success: false, message: 'No previous order found to reorder.' });
    }

    res.json({
      success: true,
      last_order: {
        order_id: lastOrder.order_id,
        items: lastOrder.items,
        total_amount: lastOrder.total_amount,
        branch_id: lastOrder.branch_id,
        delivery_address: lastOrder.delivery_address
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/checkout - Place WhatsApp order with server-calculated price & atomic ID
router.post('/checkout', async (req, res) => {
  try {
    const {
      customer_phone,
      customer_name,
      branch_id,
      items,
      delivery_type,
      orderType: rawOrderType,
      delivery_address,
      deliveryAddress: rawDeliveryAddress,
      deliveryLocation: rawDeliveryLocation,
      payment_method,
      customer: rawCustomer
    } = req.body;

    const phoneVal = (rawCustomer?.phone || customer_phone || '').trim();
    const nameVal = (rawCustomer?.name || customer_name || 'Customer').trim();

    if (!phoneVal || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Phone number and cart items are required' });
    }

    const isPickup = (rawOrderType === 'PICKUP' || rawOrderType === 'Pickup' || delivery_type === 'Pickup' || delivery_type === 'PICKUP');
    const orderType = isPickup ? 'PICKUP' : 'DELIVERY';
    const legacyDeliveryType = isPickup ? 'Pickup' : 'Home Delivery';

    // Parse Delivery Address
    let houseNumber = rawDeliveryAddress?.houseNumber || '';
    let streetNumber = rawDeliveryAddress?.streetNumber || '';
    let area = rawDeliveryAddress?.area || '';
    let city = rawDeliveryAddress?.city || 'Lahore';
    let landmark = rawDeliveryAddress?.landmark || '';
    let instructions = rawDeliveryAddress?.instructions || '';
    let formattedAddress = rawDeliveryAddress?.formattedAddress || '';

    if (!formattedAddress) {
      if (rawDeliveryAddress && (houseNumber || streetNumber || area)) {
        const parts = [
          houseNumber ? `House/Flat ${houseNumber}` : '',
          streetNumber ? `Street ${streetNumber}` : '',
          area,
          landmark ? `Near ${landmark}` : '',
          city
        ].filter(Boolean);
        formattedAddress = parts.join(', ');
      } else if (delivery_address?.address) {
        formattedAddress = delivery_address.address;
      } else if (typeof delivery_address === 'string') {
        formattedAddress = delivery_address;
      } else {
        formattedAddress = isPickup ? 'Store Pickup (DHA Branch)' : 'Phase 5 DHA, Lahore';
      }
    }

    // Parse Delivery Location Coordinates
    let lat = rawDeliveryLocation?.latitude ?? delivery_address?.lat;
    let lng = rawDeliveryLocation?.longitude ?? delivery_address?.lng;
    let accuracy = rawDeliveryLocation?.accuracy ?? null;

    if (!isPickup) {
      // Validate coordinates for Home Delivery
      if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
        lat = Number(lat);
        lng = Number(lng);
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return res.status(400).json({ success: false, message: 'Invalid location coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.' });
        }
      } else {
        // Fallback default coordinates if not provided (for backward compatibility)
        lat = 31.4704;
        lng = 74.4101;
      }
    } else {
      // Pickup does not require customer coordinates
      lat = lat ? Number(lat) : 31.4704;
      lng = lng ? Number(lng) : 74.4101;
    }

    let customer = await Customer.findOne({ phone: phoneVal });
    if (!customer) {
      const newId = await Counter.getNextSequence('customer_id', 'CUST-', 4, 1000);
      customer = await Customer.create({
        customer_id: newId,
        name: nameVal,
        phone: phoneVal,
        addresses: [
          { label: 'Home', address: formattedAddress, lat, lng }
        ]
      });
    } else {
      if (nameVal && nameVal !== 'Customer' && customer.name !== nameVal) {
        customer.name = nameVal;
      }
      // Add or update recent address in customer profile
      if (!isPickup && formattedAddress) {
        const existingAddrIndex = (customer.addresses || []).findIndex(a => a.address === formattedAddress);
        if (existingAddrIndex === -1) {
          customer.addresses.unshift({ label: 'Delivery', address: formattedAddress, lat, lng });
          if (customer.addresses.length > 5) customer.addresses = customer.addresses.slice(0, 5);
        }
      }
    }

    // SERVER-SIDE PRICE VALIDATION & CALCULATION (Prevents client-side price tampering)
    const { processedItems, totalAmount } = await validateAndCalculateCart(items);

    // ATOMIC ORDER ID GENERATION (Thread-safe, avoids duplicate key crashes)
    const orderId = await Counter.getNextSequence('order_id', 'FF-2026-', 4);

    let branchName = '📍 FeastFlow DHA Branch';
    if (branch_id) {
      const branchObj = await Branch.findOne({ branch_id });
      if (branchObj) branchName = branchObj.name;
    }

    const orderSnapshot = {
      order_id: orderId,
      customer_id: customer.customer_id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer: {
        name: customer.name,
        phone: customer.phone
      },
      branch_id: branch_id || 'BR-DHA',
      branch_name: branchName,
      items: processedItems,
      delivery_type: legacyDeliveryType,
      orderType: orderType,
      deliveryAddress: {
        houseNumber,
        streetNumber,
        area,
        city,
        landmark,
        instructions,
        formattedAddress
      },
      deliveryLocation: isPickup ? null : {
        latitude: lat,
        longitude: lng,
        accuracy,
        confirmedAt: new Date()
      },
      delivery_address: {
        label: isPickup ? 'Pickup' : 'Home',
        address: formattedAddress,
        lat,
        lng
      },
      payment_method: payment_method || 'Cash on Delivery',
      payment_status: (payment_method === 'Online Payment' || payment_method === 'Bank Transfer') ? 'Payment Verification Pending' : 'Pending',
      order_status: CANONICAL_STATUS.RECEIVED,
      total_amount: totalAmount
    };

    const newOrder = await Order.create(orderSnapshot);

    customer.total_orders += 1;
    customer.last_order_date = new Date();
    processedItems.forEach(i => {
      if (!customer.favorite_items.includes(i.name)) customer.favorite_items.push(i.name);
    });
    customer.updateCustomerLevel();
    await customer.save();

    // Clear checkout draft in session if exists
    await WhatsAppSession.findOneAndUpdate(
      { phone: customer.phone },
      { checkout_state: null, checkout_draft: {}, last_interaction: new Date() }
    );

    const io = getIO(req);
    if (io) {
      io.emit('order:created', newOrder);
    }

    res.json({
      success: true,
      message: '🎉 Order Confirmed! We will notify you on WhatsApp when your food is ready.',
      order: newOrder
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/modify-eligibility/:order_id - Check 10-minute modification window and order status
router.get('/modify-eligibility/:order_id', async (req, res) => {
  try {
    const { order_id } = req.params;
    const { phone } = req.query;

    const order = await Order.findOne({ order_id });
    if (!order) {
      return res.status(404).json({ success: false, eligible: false, message: 'Order not found.' });
    }

    if (phone) {
      const cleanReqPhone = String(phone).replace(/\D/g, '');
      const cleanOrderPhone = String(order.customer_phone || '').replace(/\D/g, '');
      if (cleanReqPhone && cleanOrderPhone && !cleanOrderPhone.includes(cleanReqPhone) && !cleanReqPhone.includes(cleanOrderPhone)) {
        return res.status(403).json({ success: false, eligible: false, message: 'Order ownership validation failed.' });
      }
    }

    const now = Date.now();
    const createdAt = new Date(order.created_at || order.createdAt || Date.now()).getTime();
    const isSimulatedExpired = req.query.simulate_expired === 'true';
    const elapsedMs = isSimulatedExpired ? (11 * 60 * 1000) : Math.max(0, now - createdAt);
    const windowMs = 10 * 60 * 1000;
    const remainingSeconds = Math.max(0, Math.floor((windowMs - elapsedMs) / 1000));
    const isExpired = elapsedMs > windowMs;

    const currentStatus = normalizeOrderStatus(order.order_status);
    const lockedStatuses = ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'READY_FOR_PICKUP', 'PICKED_UP'];
    const isLocked = lockedStatuses.includes(currentStatus);

    let message = 'Eligible for modification';
    if (isExpired) {
      message = 'The 10-minute modification window has expired. Please contact the restaurant for assistance.';
    } else if (isLocked) {
      message = 'Your order is already being prepared and can no longer be modified.';
    }

    res.json({
      success: true,
      eligible: !isExpired && !isLocked,
      remaining_seconds: remainingSeconds,
      is_expired: isExpired,
      is_locked: isLocked,
      order_status: currentStatus,
      message,
      server_time: new Date(),
      created_at: order.created_at,
      order
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/chat/modify-order/:order_id - Update existing order atomically within 10 mins
router.put('/modify-order/:order_id', async (req, res) => {
  try {
    const { order_id } = req.params;
    const { customer_phone, items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart items are required for order modification.' });
    }

    const order = await Order.findOne({ order_id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // 1. Ownership Validation
    if (customer_phone) {
      const cleanReqPhone = String(customer_phone).replace(/\D/g, '');
      const cleanOrderPhone = String(order.customer_phone || '').replace(/\D/g, '');
      if (cleanReqPhone && cleanOrderPhone && !cleanOrderPhone.includes(cleanReqPhone) && !cleanReqPhone.includes(cleanOrderPhone)) {
        return res.status(403).json({ success: false, message: 'Order ownership validation failed.' });
      }
    }

    // 2. Server-Recorded 10-Minute Expiry Check
    const now = Date.now();
    const createdAt = new Date(order.created_at || order.createdAt || Date.now()).getTime();
    const isSimulatedExpired = req.query.simulate_expired === 'true';
    const elapsedMs = isSimulatedExpired ? (11 * 60 * 1000) : Math.max(0, now - createdAt);
    const windowMs = 10 * 60 * 1000;

    if (elapsedMs > windowMs) {
      return res.status(400).json({
        success: false,
        expired: true,
        message: 'The 10-minute modification window has expired. Please contact the restaurant for assistance.'
      });
    }

    // 3. Order Status Safety Check
    const currentStatus = normalizeOrderStatus(order.order_status);
    const lockedStatuses = ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'READY_FOR_PICKUP', 'PICKED_UP'];
    if (lockedStatuses.includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        locked: true,
        message: 'Your order is already being prepared and can no longer be modified.'
      });
    }

    // 4. Server-Side Price & Item Recalculation
    const { processedItems, totalAmount } = await validateAndCalculateCart(items);

    const previousTotal = order.total_amount;
    const additionalAmount = Math.max(0, totalAmount - previousTotal);

    // 5. Atomic Order Update (Preserves same order_id, customer, address, payment)
    order.items = processedItems;
    order.total_amount = totalAmount;
    order.is_updated = true;
    order.updated_at = new Date();

    if (!order.modification_history) order.modification_history = [];
    order.modification_history.push({
      modified_at: new Date(),
      previous_total: previousTotal,
      new_total: totalAmount,
      items_count: processedItems.length
    });

    await order.save();

    // 6. Real-time Kitchen & Staff Socket Notifications
    const io = getIO(req);
    if (io) {
      io.emit('order:updated', order);
      io.emit('order:modified', {
        order_id: order.order_id,
        order,
        previous_total: previousTotal,
        new_total: totalAmount,
        additional_amount: additionalAmount
      });
    }

    res.json({
      success: true,
      message: 'Your order has been updated successfully.',
      order,
      previous_total: previousTotal,
      additional_amount: additionalAmount,
      updated_total: totalAmount
    });
  } catch (err) {
    console.error('Modify order error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/track
router.get('/track', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ success: false, message: 'Order ID or Phone number required' });
    }

    const cleanQuery = query.trim();
    let order = await Order.findOne({
      $or: [
        { order_id: cleanQuery },
        { customer_phone: cleanQuery }
      ]
    }).sort({ created_at: -1 });

    if (!order) {
      return res.status(404).json({ success: false, message: 'No matching order found.' });
    }

    // Normalize order status for frontend display
    order.order_status = normalizeOrderStatus(order.order_status);

    let riderData = null;
    if (order.rider_id) {
      const rider = await DeliveryRider.findOne({ rider_id: order.rider_id });
      if (rider) {
        const rawLoc = order.riderLocation || rider.current_location || {};
        const lat = rawLoc.latitude ?? rawLoc.lat;
        const lng = rawLoc.longitude ?? rawLoc.lng;
        const accuracy = rawLoc.accuracy ?? 10;
        const updatedAt = rawLoc.updatedAt ?? rawLoc.updated_at ?? new Date();

        riderData = {
          rider_id: rider.rider_id,
          name: rider.name,
          phone: rider.phone,
          vehicle_number: rider.vehicle_number,
          location: lat !== undefined && lng !== undefined ? {
            latitude: Number(lat),
            longitude: Number(lng),
            lat: Number(lat),
            lng: Number(lng),
            accuracy: Number(accuracy),
            updated_at: updatedAt,
            updatedAt: updatedAt
          } : null
        };
      }
    }

    let branchLocation = { lat: 31.4704, lng: 74.4101 };
    const branch = await Branch.findOne({ branch_id: order.branch_id });
    if (branch) branchLocation = { lat: branch.lat, lng: branch.lng };

    res.json({
      success: true,
      order,
      rider: riderData,
      branch_location: branchLocation
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/review - Post review & claim +20 points
router.post('/review', async (req, res) => {
  try {
    const { order_id, rating, food_quality, delivery_speed, feedback } = req.body;
    if (!order_id || !rating) {
      return res.status(400).json({ success: false, message: 'Order ID and rating required' });
    }

    const order = await Order.findOne({ order_id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    let reward = await ReviewReward.findOne({ order_id });
    let pointsAwarded = 0;

    if (!reward) {
      pointsAwarded = 20;
      await ReviewReward.create({
        order_id,
        customer_id: order.customer_id,
        points_awarded: 20
      });

      const customer = await Customer.findOne({ customer_id: order.customer_id });
      if (customer) {
        customer.loyalty_points += 20;
        await customer.save();
      }
    }

    let review = await Review.findOne({ order_id });
    if (!review) {
      review = await Review.create({
        order_id,
        customer_id: order.customer_id,
        customer_name: order.customer_name,
        rating: Math.min(5, Math.max(1, Number(rating) || 5)),
        food_quality: food_quality || 'Delicious',
        delivery_speed: delivery_speed || 'Fast',
        feedback: feedback ? String(feedback).trim() : '',
        points_earned: pointsAwarded
      });
    }

    order.is_reviewed = true;
    await order.save();

    const updatedCustomer = await Customer.findOne({ customer_id: order.customer_id });

    res.json({
      success: true,
      message: pointsAwarded > 0 ? '🎁 Thank you! 20 loyalty points have been added to your account.' : 'Review saved.',
      points_earned: pointsAwarded,
      current_points: updatedCustomer ? updatedCustomer.loyalty_points : 0,
      review
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/chat/reminder/trigger
router.post('/reminder/trigger', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });

    let session = await WhatsAppSession.findOne({ phone });
    const count = session ? session.reminder_count : 0;

    if (count >= 3) {
      return res.json({
        success: false,
        message: 'Maximum 3 reminders already sent. Do not spam customers.',
        max_reached: true
      });
    }

    const messages = [
      '👋 Still thinking about your order?\n\nYour favorite meal is waiting 😋',
      '🔥 Hungry? We are ready to serve you!\n\nOrder your hot meal now.',
      '🔥 Final reminder!\n\nReady to order delicious food?'
    ];

    const step = count + 1;
    const msg = messages[count];

    if (session) {
      session.reminder_count = step;
      await session.save();
    }

    const reminder = await Reminder.create({
      customer_id: session ? session.customer_id : 'CUST-TEMP',
      phone,
      step,
      message: msg,
      status: 'Sent',
      sent_at: new Date()
    });

    res.json({
      success: true,
      step,
      message: msg,
      reminder
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
