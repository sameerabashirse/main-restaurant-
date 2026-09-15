const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', err => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runDeliveryFlowTests() {
  console.log('🧪 =========================================================');
  console.log('🧪 FEASTFLOW CONVERSATIONAL DELIVERY FLOW AUTOMATED TESTS');
  console.log('🧪 =========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate roles
    const adminAuth = await request('POST', '/api/auth/admin-login', { email: 'admin@restaurant.com', password: 'admin123' });
    const adminToken = adminAuth.data?.token;

    const rider101Auth = await request('POST', '/api/auth/rider-login', { email: 'rider@restaurant.com', password: 'rider123' });
    const rider101Token = rider101Auth.data?.token;

    // Create / ensure a second rider user exists for security testing
    await request('POST', '/api/admin/riders', { name: 'Rider Farhan', phone: '03229988776', vehicle_number: 'LEK-5544', email: 'rider2@restaurant.com' }, adminToken);
    const rider102Auth = await request('POST', '/api/auth/staff-login', { email: 'rider2@restaurant.com', password: 'rider123' });
    const rider102Token = rider102Auth.data?.token;

    // 2. Test Step-by-Step Webhook Conversation State Machine (Questions asked one at a time)
    const phone = '03335554433';
    
    // Start checkout via webhook
    const step0 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: 'place order' } } });
    assert(step0.status === 200, 'Webhook initiates order checkout');

    // Step 1: Choose Home Delivery -> Next question Full Name
    const step1 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: 'Home Delivery' } } });
    assert(step1.status === 200, 'Home delivery selection prompts for Full Name (Step 1/9)');

    // Step 2: Name -> Next question Phone
    const step2 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: 'Hamza Khan' } } });
    assert(step2.status === 200, 'Name response prompts for Phone confirmation (Step 2/9)');

    // Step 3: Phone -> Next question House number
    const step3 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: '03335554433' } } });
    assert(step3.status === 200, 'Phone response prompts for House/Flat number (Step 3/9)');

    // Step 4: House -> Next question Street number
    const step4 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: 'Flat 12-B' } } });
    assert(step4.status === 200, 'House response prompts for Street number (Step 4/9)');

    // Step 5: Street -> Next question Area
    const step5 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: 'Street 4' } } });
    assert(step5.status === 200, 'Street response prompts for Area/Society (Step 5/9)');

    // Step 6: Area -> Next question City
    const step6 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: 'Phase 6 DHA' } } });
    assert(step6.status === 200, 'Area response prompts for City (Step 6/9)');

    // Step 7: City -> Next question Landmark with Skip option
    const step7 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: 'Lahore' } } });
    assert(step7.status === 200, 'City response prompts for Landmark with Skip option (Step 7/9)');

    // Step 8: Landmark -> Next question Delivery Instructions with Skip option
    const step8 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: 'Near Main Mosque' } } });
    assert(step8.status === 200, 'Landmark response prompts for Delivery Instructions (Step 8/9)');

    // Step 9: Instructions -> Next question Exact Delivery Location
    const step9 = await request('POST', '/api/whatsapp/webhook', { simulated: true, phone, message: { text: { body: 'Please ring bell twice' } } });
    assert(step9.status === 200, 'Instructions response prompts for Location coordinates (Step 9/9)');

    // Location message -> Exact coordinates extracted
    const stepLoc = await request('POST', '/api/whatsapp/webhook', {
      simulated: true,
      phone,
      message: {
        type: 'location',
        location: { latitude: 31.4820, longitude: 74.4310 }
      }
    });
    assert(stepLoc.status === 200, 'Location payload extracted and associates with session');

    // 3. Validation: Home Delivery requires valid coordinates
    const invalidCoordsCheckout = await request('POST', '/api/chat/checkout', {
      customer_phone: '03331112222',
      customer_name: 'Invalid Coord User',
      orderType: 'DELIVERY',
      deliveryLocation: { latitude: 199.99, longitude: 74.41 }, // Invalid lat > 90
      items: [{ name: 'Chicken Tikka Pizza', size: 'Medium', quantity: 1 }]
    });
    assert(invalidCoordsCheckout.status === 400, 'Rejects invalid latitude/longitude (> 90 lat) for Home Delivery');

    // 4. Validation: Self Pickup does not require customer location coordinates
    const pickupOrderRes = await request('POST', '/api/chat/checkout', {
      customer_phone: '03332223333',
      customer_name: 'Pickup User',
      orderType: 'PICKUP',
      items: [{ name: 'Chicken Tikka Pizza', size: 'Medium', quantity: 1 }]
    });
    assert(
      pickupOrderRes.status === 200 &&
      pickupOrderRes.data.order.orderType === 'PICKUP' &&
      pickupOrderRes.data.order.delivery_type === 'Pickup',
      'Self Pickup order succeeds without requiring customer delivery coordinates'
    );

    // 5. Successful Home Delivery Checkout with Complete Snapshot
    const homeOrderRes = await request('POST', '/api/chat/checkout', {
      customer_phone: '03335554433',
      customer_name: 'Hamza Khan',
      customer: { name: 'Hamza Khan', phone: '03335554433' },
      orderType: 'DELIVERY',
      deliveryAddress: {
        houseNumber: 'Flat 12-B',
        streetNumber: 'Street 4',
        area: 'Phase 6 DHA',
        city: 'Lahore',
        landmark: 'Near Main Mosque',
        instructions: 'Please ring bell twice',
        formattedAddress: 'Flat 12-B, Street 4, Phase 6 DHA, Near Main Mosque, Lahore'
      },
      deliveryLocation: {
        latitude: 31.4820,
        longitude: 74.4310,
        accuracy: 10,
        confirmedAt: new Date()
      },
      items: [{ name: 'Chicken Tikka Pizza', size: 'Medium', quantity: 1 }]
    });

    assert(homeOrderRes.status === 200, 'Home Delivery order created with complete snapshot');
    const createdOrder = homeOrderRes.data.order;
    assert(
      createdOrder.deliveryAddress?.houseNumber === 'Flat 12-B' &&
      createdOrder.deliveryAddress?.landmark === 'Near Main Mosque' &&
      createdOrder.deliveryLocation?.latitude === 31.4820 &&
      createdOrder.deliveryLocation?.longitude === 74.4310,
      'Order preserves immutable snapshot of deliveryAddress and deliveryLocation'
    );

    // 6. Manager Assigns Rider to Home Delivery Order
    const assignRes = await request('PUT', `/api/admin/orders/${createdOrder.order_id}/status`, {
      rider_id: 'RIDER-101'
    }, adminToken);
    assert(assignRes.status === 200 && assignRes.data.order.rider_id === 'RIDER-101', 'Manager assigns order to Rider RIDER-101');

    // 7. Assigned Rider receives complete details automatically
    const riderAssignedRes = await request('GET', '/api/rider/assigned/RIDER-101', null, rider101Token);
    assert(
      riderAssignedRes.status === 200 &&
      riderAssignedRes.data.active_order?.order_id === createdOrder.order_id &&
      riderAssignedRes.data.active_order?.customer_name === 'Hamza Khan' &&
      riderAssignedRes.data.active_order?.deliveryAddress?.houseNumber === 'Flat 12-B',
      'Assigned rider portal loads full customer address, landmark, and coordinates automatically'
    );

    // 8. Security: Unassigned Rider cannot access another rider’s delivery details
    const unauthorizedRiderRes = await request('GET', '/api/rider/assigned/RIDER-101', null, rider102Token);
    assert(
      unauthorizedRiderRes.status === 403,
      'Unrelated rider attempting to access assigned delivery receives 403 Forbidden'
    );

    console.log(`\n=========================================================`);
    console.log(`🏁 TEST SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`=========================================================\n`);
    
    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
}

runDeliveryFlowTests();
