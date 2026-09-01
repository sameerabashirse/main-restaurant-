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
const { validateAndCalculateCart } = require('../services/orderService');

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
      delivery_address,
      payment_method
    } = req.body;

    if (!customer_phone || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Phone number and cart items are required' });
    }

    let customer = await Customer.findOne({ phone: customer_phone.trim() });
    if (!customer) {
      const newId = await Counter.getNextSequence('customer_id', 'CUST-', 4, 1000);
      customer = await Customer.create({
        customer_id: newId,
        name: customer_name ? customer_name.trim() : 'Customer',
        phone: customer_phone.trim(),
        addresses: [delivery_address || { label: 'Home', address: 'House 42, Street 10, Phase 5 DHA, Lahore', lat: 31.4750, lng: 74.4200 }]
      });
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

    const newOrder = await Order.create({
      order_id: orderId,
      customer_id: customer.customer_id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      branch_id: branch_id || 'BR-DHA',
      branch_name: branchName,
      items: processedItems,
      delivery_type: delivery_type || 'Home Delivery',
      delivery_address: delivery_address || (customer.addresses && customer.addresses[0]) || { label: 'Home', address: 'House 42, Street 10, Phase 5 DHA, Lahore' },
      payment_method: payment_method || 'Cash on Delivery',
      payment_status: 'Pending',
      order_status: 'Received',
      total_amount: totalAmount
    });

    customer.total_orders += 1;
    customer.last_order_date = new Date();
    processedItems.forEach(i => {
      if (!customer.favorite_items.includes(i.name)) customer.favorite_items.push(i.name);
    });
    customer.updateCustomerLevel();
    await customer.save();

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

    let riderLocation = null;
    if (order.rider_id) {
      const rider = await DeliveryRider.findOne({ rider_id: order.rider_id });
      if (rider) {
        riderLocation = {
          rider_id: rider.rider_id,
          name: rider.name,
          phone: rider.phone,
          vehicle_number: rider.vehicle_number,
          location: rider.current_location
        };
      }
    }

    let branchLocation = { lat: 31.4704, lng: 74.4101 };
    const branch = await Branch.findOne({ branch_id: order.branch_id });
    if (branch) branchLocation = { lat: branch.lat, lng: branch.lng };

    res.json({
      success: true,
      order,
      rider: riderLocation,
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
