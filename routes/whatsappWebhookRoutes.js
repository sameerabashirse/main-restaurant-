const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Branch = require('../models/Branch');
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const WhatsAppSession = require('../models/WhatsAppSession');
const WhatsAppMessage = require('../models/WhatsAppMessage');

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'feastflow_verify_token_2026';

// GET /api/whatsapp/webhook - Webhook Verification Handshake
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ WhatsApp Webhook Verified Successfully!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ WhatsApp Webhook Verification Token Mismatch');
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

// POST /api/whatsapp/webhook - Receive Webhook Events from WhatsApp Cloud API
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Verify WhatsApp API Payload Structure
    if (body.object === 'whatsapp_business_account' || body.simulated) {
      const entries = body.entry || [{ changes: [{ value: { messages: [body.message] } }] }];

      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value || {};
          const messages = value.messages || [];

          for (const msg of messages) {
            const fromPhone = msg.from || msg.phone || '03001234567';
            const msgType = msg.type || 'text';

            let incomingText = '';
            let payloadData = {};

            if (msgType === 'text') {
              incomingText = msg.text ? msg.text.body : (msg.body || '');
            } else if (msgType === 'interactive') {
              if (msg.interactive.type === 'button_reply') {
                incomingText = msg.interactive.button_reply.title;
                payloadData = { id: msg.interactive.button_reply.id };
              } else if (msg.interactive.type === 'list_reply') {
                incomingText = msg.interactive.list_reply.title;
                payloadData = { id: msg.interactive.list_reply.id };
              }
            } else if (msgType === 'location') {
              incomingText = 'Location Shared';
              payloadData = { lat: msg.location.latitude, lng: msg.location.longitude };
            }

            // Log inbound message
            await WhatsAppMessage.create({
              phone: fromPhone,
              direction: 'INBOUND',
              message_type: msgType,
              body: incomingText,
              payload: payloadData,
              wa_message_id: msg.id || `wamid.${Date.now()}`
            });

            // Process conversation logic
            const responsePayload = await processWhatsAppConversation(fromPhone, incomingText, payloadData);

            // Log outbound message
            await WhatsAppMessage.create({
              phone: fromPhone,
              direction: 'OUTBOUND',
              message_type: responsePayload.type || 'text',
              body: responsePayload.body,
              payload: responsePayload
            });

            // Emit to connected UI web socket for live view
            const io = req.app.get('io');
            if (io) {
              io.emit('whatsapp:incoming', {
                from: fromPhone,
                text: incomingText,
                response: responsePayload
              });
            }
          }
        }
      }

      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.sendStatus(404);
    }
  } catch (err) {
    console.error('WhatsApp Webhook Error:', err);
    return res.status(500).send(err.message);
  }
});

// WhatsApp AI Conversational Logic Engine
async function processWhatsAppConversation(phone, text, payload) {
  let session = await WhatsAppSession.findOne({ phone });
  let customer = await Customer.findOne({ phone });

  if (!session) {
    session = await WhatsAppSession.create({
      phone,
      name: customer ? customer.name : 'Customer',
      customer_id: customer ? customer.customer_id : null
    });
  }

  const cleanText = text.toLowerCase().trim();

  // 1. First Message / Welcome Flow ("hi", "hello", "start", etc.)
  if (cleanText.includes('hi') || cleanText.includes('hello') || cleanText.includes('start') || cleanText.includes('menu')) {
    if (customer) {
      // Returning Customer Experience
      const lastOrder = await Order.findOne({ customer_id: customer.customer_id }).sort({ created_at: -1 });
      let lastOrderText = '';
      if (lastOrder && lastOrder.items) {
        lastOrderText = lastOrder.items.map(i => `🍕 ${i.name}`).join('\n🍟 ');
      }

      return {
        type: 'interactive_button',
        body: `👋 *Welcome back ${customer.name}!*\n\nWe remember your favorite meals ❤️\n\n*Your last order (${lastOrder ? lastOrder.order_id : 'N/A'}):*\n${lastOrderText}\n\nWould you like to order again?`,
        buttons: [
          { id: 'btn_reorder_last', title: '🔄 Order Same Again' },
          { id: 'btn_view_menu', title: '🍕 View Menu' },
          { id: 'btn_new_order', title: '🛒 New Order' }
        ]
      };
    } else {
      return {
        type: 'interactive_button',
        body: `🍽️ *Welcome to FeastFlow Restaurant!*\n\nI am your AI WhatsApp ordering assistant.\n\nHow can I help you today?`,
        buttons: [
          { id: 'btn_view_menu', title: '1️⃣ View Menu' },
          { id: 'btn_place_order', title: '2️⃣ Place Order' },
          { id: 'btn_location', title: '3️⃣ Restaurant Location' },
          { id: 'btn_track', title: '4️⃣ Track Order' },
          { id: 'btn_rewards', title: '5️⃣ My Rewards' },
          { id: 'btn_contact', title: '6️⃣ Contact Us' }
        ]
      };
    }
  }

  // 2. Restaurant Location Button Click
  if (cleanText.includes('location') || payload.id === 'btn_location' || cleanText.includes('3️⃣')) {
    const branch = await Branch.findOne({ branch_id: 'BR-DHA' });
    return {
      type: 'location',
      body: `📍 *FeastFlow DHA Branch*\n\nAddress: ${branch ? branch.address : 'Phase 5 Commercial DHA, Lahore'}\n⏰ Open Hours: 12 PM - 12 AM\n☎️ Phone: 042-35894120`,
      latitude: branch ? branch.lat : 31.4704,
      longitude: branch ? branch.lng : 74.4101,
      buttons: [
        { id: 'btn_view_menu', title: '🍕 View Menu' },
        { id: 'btn_place_order', title: '🛒 Order Now' }
      ]
    };
  }

  // 3. Category List Menu
  if (cleanText.includes('view menu') || payload.id === 'btn_view_menu' || cleanText.includes('1️⃣')) {
    const categories = await MenuCategory.find({ is_active: true }).sort({ display_order: 1 });
    return {
      type: 'interactive_list',
      body: `📋 *Select a Category from the List Menu below:*`,
      button_text: 'Select Category',
      sections: [{
        title: 'Menu Categories',
        rows: categories.map(c => ({ id: `cat_${c.name.toLowerCase()}`, title: `${c.icon} ${c.name}`, description: `Explore ${c.name} items` }))
      }]
    };
  }

  // Fallback default message
  return {
    type: 'interactive_button',
    body: `🤖 *FeastFlow AI Assistant*\n\nHow can I help you? Select an option below:`,
    buttons: [
      { id: 'btn_view_menu', title: '🍕 View Menu' },
      { id: 'btn_place_order', title: '🛒 Place Order' },
      { id: 'btn_track', title: '📦 Track Order' }
    ]
  };
}

module.exports = router;
