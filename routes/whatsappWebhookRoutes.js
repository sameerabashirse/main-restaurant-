const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const Branch = require('../models/Branch');
const MenuCategory = require('../models/MenuCategory');
const MenuItem = require('../models/MenuItem');
const WhatsAppSession = require('../models/WhatsAppSession');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Settings = require('../models/Settings');

const DEFAULT_WHATSAPP_VERIFY_TOKEN = Settings.schema.path('whatsapp_verify_token').defaultValue;
const WHATSAPP_GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || 'v26.0';

const getExpectedVerifyToken = async () => {
  const envToken = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
  if (envToken) {
    return { token: envToken, source: 'environment' };
  }

  let settingsToken = '';
  if (Settings.db.readyState === 1) {
    try {
      const settings = await Settings.findOne().select('whatsapp_verify_token').lean();
      settingsToken = String(settings?.whatsapp_verify_token || '').trim();
    } catch (error) {
      console.warn('Unable to read WhatsApp verify token from settings; using default token fallback.');
    }
  }

  if (settingsToken) {
    return { token: settingsToken, source: 'database' };
  }

  return { token: DEFAULT_WHATSAPP_VERIFY_TOKEN, source: 'default' };
};

const limitText = (value, maxLength) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trim() || 'Option';
};

const buttonId = (button, index) => limitText(button.id || `btn_${index + 1}`, 256);

const buttonTitle = (button, index) => limitText(button.title || button.label || `Option ${index + 1}`, 20);

const listRowTitle = (row, index) => limitText(row.title || row.label || `Option ${index + 1}`, 24);

const buildWhatsAppMessagePayload = (to, responsePayload, contextMessageId) => {
  const basePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to
  };

  if (contextMessageId) {
    basePayload.context = { message_id: contextMessageId };
  }

  if (responsePayload.type === 'location' && responsePayload.latitude && responsePayload.longitude) {
    return {
      ...basePayload,
      type: 'location',
      location: {
        latitude: Number(responsePayload.latitude),
        longitude: Number(responsePayload.longitude),
        name: 'FeastFlow Restaurant',
        address: limitText(responsePayload.body, 1000)
      }
    };
  }

  if (responsePayload.type === 'interactive_list') {
    const sections = (responsePayload.sections || []).map((section, sectionIndex) => ({
      title: limitText(section.title || `Section ${sectionIndex + 1}`, 24),
      rows: (section.rows || []).slice(0, 10).map((row, rowIndex) => ({
        id: limitText(row.id || `row_${sectionIndex + 1}_${rowIndex + 1}`, 200),
        title: listRowTitle(row, rowIndex),
        description: limitText(row.description || '', 72)
      }))
    })).filter((section) => section.rows.length > 0);

    if (sections.length > 0) {
      return {
        ...basePayload,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: limitText(responsePayload.body, 1024) },
          action: {
            button: limitText(responsePayload.button_text || 'Select', 20),
            sections
          }
        }
      };
    }
  }

  if (responsePayload.type === 'interactive_button' && Array.isArray(responsePayload.buttons) && responsePayload.buttons.length > 0) {
    if (responsePayload.buttons.length <= 3) {
      return {
        ...basePayload,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: limitText(responsePayload.body, 1024) },
          action: {
            buttons: responsePayload.buttons.slice(0, 3).map((button, index) => ({
              type: 'reply',
              reply: {
                id: buttonId(button, index),
                title: buttonTitle(button, index)
              }
            }))
          }
        }
      };
    }

    return {
      ...basePayload,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: limitText(responsePayload.body, 1024) },
        action: {
          button: 'Select',
          sections: [{
            title: 'Options',
            rows: responsePayload.buttons.slice(0, 10).map((button, index) => ({
              id: buttonId(button, index),
              title: listRowTitle(button, index)
            }))
          }]
        }
      }
    };
  }

  return {
    ...basePayload,
    type: 'text',
    text: {
      preview_url: false,
      body: limitText(responsePayload.body || 'Thanks for messaging FeastFlow.', 4096)
    }
  };
};

const sendWhatsAppReply = async (to, responsePayload, options = {}) => {
  const accessToken = String(process.env.WHATSAPP_TOKEN || '').trim();
  const phoneNumberId = String(options.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  if (!accessToken || !phoneNumberId) {
    return {
      success: false,
      skipped: true,
      reason: !accessToken ? 'WHATSAPP_TOKEN is missing' : 'WHATSAPP_PHONE_NUMBER_ID is missing and webhook metadata did not include phone_number_id'
    };
  }

  const messagePayload = buildWhatsAppMessagePayload(to, responsePayload, options.contextMessageId);
  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(messagePayload)
  });
  const responseBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      success: false,
      status: response.status,
      error: responseBody.error?.message || 'WhatsApp Cloud API send failed',
      details: responseBody.error
    };
  }

  return {
    success: true,
    status: response.status,
    messageId: responseBody.messages?.[0]?.id || null
  };
};

// GET /api/whatsapp/webhook - Webhook Verification Handshake
router.get('/webhook', async (req, res) => {
  const mode = String(req.query['hub.mode'] || '').trim();
  const receivedToken = String(req.query['hub.verify_token'] || '').trim();
  const challenge = req.query['hub.challenge'];

  const { token: expectedToken, source: expectedTokenSource } = await getExpectedVerifyToken();

  console.log('Webhook verification attempt:', {
    mode,
    challengePresent: Boolean(challenge),
    receivedTokenPresent: Boolean(receivedToken),
    expectedTokenPresent: Boolean(expectedToken),
    expectedTokenSource,
    tokenMatches: receivedToken === expectedToken,
    receivedTokenLength: receivedToken.length,
    expectedTokenLength: expectedToken.length
  });

  if (
    mode === 'subscribe' &&
    receivedToken &&
    expectedToken &&
    receivedToken === expectedToken
  ) {
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Forbidden');
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
          const phoneNumberId = value.metadata?.phone_number_id;

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
            const outboundMessage = await WhatsAppMessage.create({
              phone: fromPhone,
              direction: 'OUTBOUND',
              message_type: responsePayload.type || 'text',
              body: responsePayload.body,
              payload: responsePayload,
              status: body.simulated ? 'simulated' : 'pending'
            });

            if (!body.simulated) {
              try {
                const sendResult = await sendWhatsAppReply(fromPhone, responsePayload, {
                  phoneNumberId,
                  contextMessageId: msg.id
                });
                outboundMessage.status = sendResult.success ? 'sent' : 'failed';
                outboundMessage.wa_message_id = sendResult.messageId || outboundMessage.wa_message_id;
                outboundMessage.payload = { ...responsePayload, whatsapp_send: sendResult };
                await outboundMessage.save();

                if (!sendResult.success) {
                  console.error('WhatsApp reply was not sent:', sendResult);
                }
              } catch (sendError) {
                outboundMessage.status = 'failed';
                outboundMessage.payload = {
                  ...responsePayload,
                  whatsapp_send: {
                    success: false,
                    error: sendError.message
                  }
                };
                await outboundMessage.save();
                console.error('WhatsApp reply send error:', sendError.message);
              }
            }

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
async function processWhatsAppConversation(phone, text, payload = {}) {
  let session = await WhatsAppSession.findOne({ phone });
  let customer = await Customer.findOne({ phone });

  if (!session) {
    session = await WhatsAppSession.create({
      phone,
      name: customer ? customer.name : 'Customer',
      customer_id: customer ? customer.customer_id : null,
      checkout_draft: {}
    });
  }

  const cleanText = (text || '').toLowerCase().trim();

  // Reset or Cancellation check
  if (cleanText === 'cancel' || cleanText === 'start over') {
    session.checkout_state = null;
    session.checkout_draft = {};
    await session.save();
    return {
      type: 'interactive_button',
      body: `❌ Checkout cancelled. How else can I help you today?`,
      buttons: [
        { id: 'btn_view_menu', title: '🍕 View Menu' },
        { id: 'btn_place_order', title: '🛒 Place Order' },
        { id: 'btn_track', title: '📦 Track Order' }
      ]
    };
  }

  // Handle Location message payload directly
  if (payload.lat !== undefined && payload.lng !== undefined) {
    const lat = Number(payload.lat);
    const lng = Number(payload.lng);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      session.checkout_draft = session.checkout_draft || {};
      session.checkout_draft.latitude = lat;
      session.checkout_draft.longitude = lng;
      session.checkout_draft.accuracy = payload.accuracy || 10;
      session.checkout_state = 'AWAITING_DELIVERY_CONFIRMATION';
      await session.save();

      const d = session.checkout_draft;
      return {
        type: 'interactive_button',
        body: `📍 *Location Coordinates Received!*\nLat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}\n\n📋 *Please confirm your delivery details:*\n• *Name:* ${d.name || customer?.name || 'Customer'}\n• *Phone:* ${d.phone || phone}\n• *House/Flat:* ${d.houseNumber || 'N/A'}\n• *Street:* ${d.streetNumber || 'N/A'}\n• *Area/Society:* ${d.area || 'N/A'}\n• *City:* ${d.city || 'Lahore'}\n• *Landmark:* ${d.landmark || 'None'}\n• *Instructions:* ${d.instructions || 'None'}\n• *Location Status:* ✅ Received (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        buttons: [
          { id: 'btn_confirm_order', title: '✅ Confirm Order' },
          { id: 'btn_change_address', title: '✏️ Change Address' },
          { id: 'btn_cancel_checkout', title: '❌ Cancel' }
        ]
      };
    }
  }

  // Handle active Checkout Conversation States
  if (session.checkout_state) {
    const draft = session.checkout_draft || {};

    if (session.checkout_state === 'AWAITING_ORDER_TYPE') {
      if (cleanText.includes('pickup') || payload.id === 'btn_self_pickup') {
        draft.orderType = 'PICKUP';
        session.checkout_state = 'AWAITING_DELIVERY_CONFIRMATION';
        session.checkout_draft = draft;
        await session.save();

        const branch = await Branch.findOne({ branch_id: 'BR-DHA' });
        return {
          type: 'interactive_button',
          body: `🏪 *Self Pickup Selected*\n\nPickup Location:\n📍 *${branch ? branch.name : 'FeastFlow DHA Branch'}*\nAddress: ${branch ? branch.address : 'Phase 5 Commercial DHA, Lahore'}\nPhone: ${branch ? branch.phone : '042-35894120'}\n\nPlease confirm your pickup order:`,
          buttons: [
            { id: 'btn_confirm_order', title: '✅ Confirm Order' },
            { id: 'btn_cancel_checkout', title: '❌ Cancel' }
          ]
        };
      } else {
        draft.orderType = 'DELIVERY';
        session.checkout_state = 'AWAITING_CUSTOMER_NAME';
        session.checkout_draft = draft;
        await session.save();

        return {
          type: 'text',
          body: `🚚 *Home Delivery Selected*\n\nStep 1/9: What is your full name?`
        };
      }
    }

    if (session.checkout_state === 'AWAITING_CUSTOMER_NAME') {
      draft.name = text.trim();
      session.checkout_state = 'AWAITING_PHONE';
      session.checkout_draft = draft;
      await session.save();

      return {
        type: 'interactive_button',
        body: `Step 2/9: Thanks ${draft.name}! Please enter your phone number, or confirm your WhatsApp number (${phone}):`,
        buttons: [
          { id: 'btn_confirm_phone', title: `📱 Use ${phone}` }
        ]
      };
    }

    if (session.checkout_state === 'AWAITING_PHONE') {
      draft.phone = cleanText.includes('use') || payload.id === 'btn_confirm_phone' ? phone : text.trim();
      session.checkout_state = 'AWAITING_HOUSE_NUMBER';
      session.checkout_draft = draft;
      await session.save();

      return {
        type: 'text',
        body: `Step 3/9: What is your House/Flat number? (e.g. 42-B)`
      };
    }

    if (session.checkout_state === 'AWAITING_HOUSE_NUMBER') {
      draft.houseNumber = text.trim();
      session.checkout_state = 'AWAITING_STREET_NUMBER';
      session.checkout_draft = draft;
      await session.save();

      return {
        type: 'text',
        body: `Step 4/9: What is your Street number or Lane? (e.g. Street 10)`
      };
    }

    if (session.checkout_state === 'AWAITING_STREET_NUMBER') {
      draft.streetNumber = text.trim();
      session.checkout_state = 'AWAITING_AREA';
      session.checkout_draft = draft;
      await session.save();

      return {
        type: 'text',
        body: `Step 5/9: What is your Area / Sector / Society? (e.g. Phase 5 DHA)`
      };
    }

    if (session.checkout_state === 'AWAITING_AREA') {
      draft.area = text.trim();
      session.checkout_state = 'AWAITING_CITY';
      session.checkout_draft = draft;
      await session.save();

      return {
        type: 'interactive_button',
        body: `Step 6/9: What is your City?`,
        buttons: [
          { id: 'btn_city_lahore', title: '📍 Lahore' }
        ]
      };
    }

    if (session.checkout_state === 'AWAITING_CITY') {
      draft.city = cleanText.includes('lahore') || payload.id === 'btn_city_lahore' ? 'Lahore' : text.trim();
      session.checkout_state = 'AWAITING_LANDMARK';
      session.checkout_draft = draft;
      await session.save();

      return {
        type: 'interactive_button',
        body: `Step 7/9: Any nearest landmark? (e.g. Near Jalal Sons, or tap Skip):`,
        buttons: [
          { id: 'btn_skip_landmark', title: '⏩ Skip Landmark' }
        ]
      };
    }

    if (session.checkout_state === 'AWAITING_LANDMARK') {
      draft.landmark = (cleanText.includes('skip') || payload.id === 'btn_skip_landmark') ? '' : text.trim();
      session.checkout_state = 'AWAITING_INSTRUCTIONS';
      session.checkout_draft = draft;
      await session.save();

      return {
        type: 'interactive_button',
        body: `Step 8/9: Any delivery instructions for rider? (e.g. Ring bell twice, or tap Skip):`,
        buttons: [
          { id: 'btn_skip_instructions', title: '⏩ Skip Instructions' }
        ]
      };
    }

    if (session.checkout_state === 'AWAITING_INSTRUCTIONS') {
      draft.instructions = (cleanText.includes('skip') || payload.id === 'btn_skip_instructions') ? '' : text.trim();
      session.checkout_state = 'AWAITING_DELIVERY_LOCATION';
      session.checkout_draft = draft;
      await session.save();

      return {
        type: 'interactive_button',
        body: `Step 9/9: 📍 *Exact Delivery Location*\n\nPlease share your exact location pin so our rider can navigate straight to your doorstep.`,
        buttons: [
          { id: 'btn_share_location', title: '📍 Share Current Location' },
          { id: 'btn_continue_manual_loc', title: '📍 Use Address Pin' }
        ]
      };
    }

    if (session.checkout_state === 'AWAITING_DELIVERY_LOCATION') {
      if (cleanText.includes('continue') || payload.id === 'btn_continue_manual_loc') {
        draft.latitude = draft.latitude || 31.4704;
        draft.longitude = draft.longitude || 74.4101;
        draft.accuracy = 10;
        session.checkout_state = 'AWAITING_DELIVERY_CONFIRMATION';
        session.checkout_draft = draft;
        await session.save();
      }
    }

    if (session.checkout_state === 'AWAITING_DELIVERY_CONFIRMATION') {
      if (cleanText.includes('confirm') || payload.id === 'btn_confirm_order') {
        session.checkout_state = null;
        await session.save();
        return {
          type: 'text',
          body: `🎉 *Thank you! Your order has been placed successfully.*\nOur kitchen is preparing your hot meal and a rider will be assigned shortly.`
        };
      }
    }
  }

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

  // 2. Start Checkout Flow ("checkout", "place order", "btn_place_order", "btn_new_order")
  if (cleanText.includes('checkout') || cleanText.includes('place order') || payload.id === 'btn_place_order' || payload.id === 'btn_new_order') {
    session.checkout_state = 'AWAITING_ORDER_TYPE';
    session.checkout_draft = {};
    await session.save();

    return {
      type: 'interactive_button',
      body: `Please select your order type:`,
      buttons: [
        { id: 'btn_home_delivery', title: '🚚 Home Delivery' },
        { id: 'btn_self_pickup', title: '🏪 Self Pickup' }
      ]
    };
  }

  // 3. Restaurant Location Button Click
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

  // 4. Category List Menu
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
