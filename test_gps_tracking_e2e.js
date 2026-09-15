const http = require('http');
const { io } = require('socket.io-client');

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

async function runGPSTrackingE2ETests() {
  console.log('🧪 =========================================================');
  console.log('🧪 FEASTFLOW RIDER-TO-CUSTOMER LIVE GPS TRACKING E2E TESTS');
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
    // 1. Authenticate Admin and Assigned Rider (RIDER-101)
    const adminAuth = await request('POST', '/api/auth/admin-login', { email: 'admin@restaurant.com', password: 'admin123' });
    const adminToken = adminAuth.data?.token;

    const rider101Auth = await request('POST', '/api/auth/rider-login', { email: 'rider@restaurant.com', password: 'rider123' });
    const rider101Token = rider101Auth.data?.token;

    // Create an unassigned Rider for security authorization testing
    await request('POST', '/api/admin/riders', { name: 'Rider Farhan', phone: '03009988776', vehicle_number: 'LHR-7722', email: 'rider_farhan@restaurant.com' }, adminToken);
    const rider2Auth = await request('POST', '/api/auth/staff-login', { email: 'rider_farhan@restaurant.com', password: 'rider123' });
    const rider2Token = rider2Auth.data?.token;

    // 2. Create Home Delivery Order
    const orderRes = await request('POST', '/api/chat/checkout', {
      customer_phone: '03001122334',
      customer_name: 'Haris Rauf',
      orderType: 'DELIVERY',
      deliveryAddress: {
        houseNumber: '77-A',
        streetNumber: 'Street 3',
        area: 'Phase 5 DHA',
        city: 'Lahore',
        formattedAddress: '77-A, Street 3, Phase 5 DHA, Lahore'
      },
      deliveryLocation: {
        latitude: 31.4760,
        longitude: 74.4220,
        accuracy: 10,
        confirmedAt: new Date()
      },
      items: [{ name: 'BBQ Tikka Pizza', size: 'Large', quantity: 1 }]
    });

    assert(orderRes.status === 200, 'Home Delivery order created');
    const orderId = orderRes.data.order.order_id;

    // 3. Manager assigns order to RIDER-101
    const assignRes = await request('PUT', `/api/admin/orders/${orderId}/status`, {
      rider_id: 'RIDER-101'
    }, adminToken);
    assert(assignRes.status === 200, 'Order assigned to Rider RIDER-101');

    // 4. Test Coordinate Validation (Rejects invalid -95 lat / 190 lng)
    const invalidLatRes = await request('POST', '/api/rider/location', {
      order_id: orderId,
      latitude: -95.0,
      longitude: 74.4101
    }, rider101Token);
    assert(invalidLatRes.status === 400, 'Rejects latitude outside -90..90');

    const invalidLngRes = await request('POST', '/api/rider/location', {
      order_id: orderId,
      latitude: 31.4704,
      longitude: 195.0
    }, rider101Token);
    assert(invalidLngRes.status === 400, 'Rejects longitude outside -180..180');

    // 5. Test Authorization: Unassigned Rider cannot push GPS location
    const unassignedRiderRes = await request('POST', '/api/rider/location', {
      order_id: orderId,
      latitude: 31.4720,
      longitude: 74.4150
    }, rider2Token);
    assert(unassignedRiderRes.status === 403, 'Unassigned rider is rejected with 403 Forbidden on location update');

    // 6. Test Socket.IO Room Isolation & Real-time Event Delivery
    const customerSocket = io(BASE_URL, { path: '/socket.io', transports: ['websocket'] });
    const unrelatedSocket = io(BASE_URL, { path: '/socket.io', transports: ['websocket'] });

    await new Promise((resolve) => {
      let count = 0;
      customerSocket.on('connect', () => { if (++count === 2) resolve(); });
      unrelatedSocket.on('connect', () => { if (++count === 2) resolve(); });
    });

    // Customer joins order room: order:<orderId>
    customerSocket.emit('join:order', orderId);
    // Unrelated socket joins a different order room
    unrelatedSocket.emit('join:order', 'OTHER-ORDER-999');

    await new Promise(r => setTimeout(r, 200));

    let customerReceivedEvent = null;
    let unrelatedReceivedEvent = null;

    customerSocket.on('rider:location:update', (payload) => {
      customerReceivedEvent = payload;
    });

    unrelatedSocket.on('rider:location:update', (payload) => {
      unrelatedReceivedEvent = payload;
    });

    // 7. Assigned Rider pushes valid GPS location
    const pushGpsRes = await request('POST', '/api/rider/location', {
      order_id: orderId,
      latitude: 31.4715,
      longitude: 74.4135,
      accuracy: 6,
      timestamp: new Date()
    }, rider101Token);

    assert(pushGpsRes.status === 200, 'Assigned rider submits valid GPS coordinates');
    assert(pushGpsRes.data.data.latitude === 31.4715 && pushGpsRes.data.data.longitude === 74.4135, 'Backend returns standardized location data payload');

    // Wait for socket broadcast
    await new Promise(r => setTimeout(r, 300));

    assert(
      customerReceivedEvent !== null &&
      customerReceivedEvent.orderId === orderId &&
      customerReceivedEvent.latitude === 31.4715 &&
      customerReceivedEvent.longitude === 74.4135 &&
      customerReceivedEvent.accuracy === 6,
      'Customer socket in order room receives rider:location:update event with exact payload'
    );

    assert(
      unrelatedReceivedEvent === null,
      'Unrelated order room does NOT receive the location event (Room Isolation Verified)'
    );

    // 8. Test Initial Load & Reconnect Data Recovery
    const trackRes = await request('GET', `/api/chat/track?query=${orderId}`);
    assert(
      trackRes.status === 200 &&
      trackRes.data.rider?.location?.latitude === 31.4715 &&
      trackRes.data.rider?.location?.longitude === 74.4135,
      'Customer tracking GET endpoint returns latest stored GPS coordinates for initial load and reconnects'
    );

    // Clean up socket connections
    customerSocket.disconnect();
    unrelatedSocket.disconnect();

    console.log(`\n=========================================================`);
    console.log(`🏁 GPS TRACKING TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`=========================================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runGPSTrackingE2ETests();
