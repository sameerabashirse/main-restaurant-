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

async function runRiderWorkflowTests() {
  console.log('🧪 =========================================================');
  console.log('🧪 FEASTFLOW RIDER LIVE-LOCATION & WORKFLOW AUTOMATED TESTS');
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

    // Create / ensure Rider 2 for security isolation testing
    await request('POST', '/api/admin/riders', { name: 'Rider Tariq', phone: '03214455667', vehicle_number: 'LEK-9900', email: 'rider_tariq@restaurant.com' }, adminToken);
    const rider2Auth = await request('POST', '/api/auth/staff-login', { email: 'rider_tariq@restaurant.com', password: 'rider123' });
    const rider2Token = rider2Auth.data?.token;

    // 2. Create a fresh Home Delivery Order
    const orderRes = await request('POST', '/api/chat/checkout', {
      customer_phone: '03007654321',
      customer_name: 'Zubair Ahmed',
      orderType: 'DELIVERY',
      deliveryAddress: {
        houseNumber: '15-C',
        streetNumber: 'Street 9',
        area: 'Phase 5 DHA',
        city: 'Lahore',
        landmark: 'Near Jalal Sons',
        instructions: 'Call on arrival',
        formattedAddress: '15-C, Street 9, Phase 5 DHA, Lahore'
      },
      deliveryLocation: {
        latitude: 31.4720,
        longitude: 74.4150,
        accuracy: 12,
        confirmedAt: new Date()
      },
      items: [{ name: 'Chicken Fajita Pizza', size: 'Large', quantity: 1 }]
    });

    assert(orderRes.status === 200, 'Home Delivery order created successfully');
    const orderId = orderRes.data.order.order_id;
    assert(orderRes.data.order.order_status === 'RECEIVED', 'Order initialized with canonical RECEIVED status');

    // 3. Manager assigns order to Rider RIDER-101
    const assignRes = await request('PUT', `/api/admin/orders/${orderId}/status`, {
      rider_id: 'RIDER-101'
    }, adminToken);
    assert(assignRes.status === 200 && assignRes.data.order.order_status === 'RIDER_ASSIGNED', 'Manager assigns order & transitions status to RIDER_ASSIGNED');

    // 4. Test Invalid Status Transition: Rider cannot jump straight to OUT_FOR_DELIVERY before PICKED_UP
    const prematureStartRes = await request('POST', '/api/rider/status', {
      rider_id: 'RIDER-101',
      order_id: orderId,
      status: 'OUT_FOR_DELIVERY'
    }, rider101Token);
    assert(prematureStartRes.status === 400, 'Rejects premature Start Delivery before PICKED_UP');

    // 5. Test Step 1: Rider accepts delivery -> RIDER_ACCEPTED
    const acceptRes = await request('POST', '/api/rider/status', {
      rider_id: 'RIDER-101',
      order_id: orderId,
      status: 'RIDER_ACCEPTED'
    }, rider101Token);
    assert(acceptRes.status === 200 && acceptRes.data.order.order_status === 'RIDER_ACCEPTED', 'Rider accepts delivery (RIDER_ACCEPTED)');

    // 6. Test Step 2: Rider picks up food from restaurant -> PICKED_UP
    const pickupRes = await request('POST', '/api/rider/status', {
      rider_id: 'RIDER-101',
      order_id: orderId,
      status: 'PICKED_UP'
    }, rider101Token);
    assert(pickupRes.status === 200 && pickupRes.data.order.order_status === 'PICKED_UP', 'Rider marks food picked up from restaurant (PICKED_UP)');

    // 7. Test Step 3: Start Delivery uses canonical OUT_FOR_DELIVERY
    const startDeliveryRes = await request('POST', '/api/rider/status', {
      rider_id: 'RIDER-101',
      order_id: orderId,
      status: 'OUT_FOR_DELIVERY'
    }, rider101Token);
    assert(startDeliveryRes.status === 200 && startDeliveryRes.data.order.order_status === 'OUT_FOR_DELIVERY', 'Start Delivery transitions status to canonical OUT_FOR_DELIVERY');

    // 8. Test Invalid Coordinates in location update
    const invalidGpsRes = await request('POST', '/api/rider/location', {
      rider_id: 'RIDER-101',
      order_id: orderId,
      lat: 125.47, // > 90 invalid lat
      lng: 74.41
    }, rider101Token);
    assert(invalidGpsRes.status === 400, 'Rejects invalid latitude/longitude in location push');

    // 9. Test Valid GPS location push by assigned rider
    const validGpsRes = await request('POST', '/api/rider/location', {
      rider_id: 'RIDER-101',
      order_id: orderId,
      lat: 31.4735,
      lng: 74.4180,
      accuracy: 8
    }, rider101Token);
    assert(validGpsRes.status === 200 && validGpsRes.data.location.lat === 31.4735, 'Assigned rider successfully pushes real-time GPS coordinates');

    // 10. Test Security: Unassigned Rider cannot push GPS location for this order
    const unauthorizedGpsRes = await request('POST', '/api/rider/location', {
      rider_id: 'RIDER-101',
      order_id: orderId,
      lat: 31.4740,
      lng: 74.4190
    }, rider2Token);
    assert(unauthorizedGpsRes.status === 403, 'Unassigned rider is rejected with 403 Forbidden on location push');

    // 11. Customer tracking endpoint retrieves updated status & live rider location
    const trackRes = await request('GET', `/api/chat/track?query=${orderId}`);
    assert(
      trackRes.status === 200 &&
      trackRes.data.order.order_status === 'OUT_FOR_DELIVERY' &&
      trackRes.data.rider?.location?.lat === 31.4735,
      'Customer tracking loads correct canonical status and live rider location coordinates'
    );

    // Cash confirmation is required before completing a cash delivery.
    const beforeCashRes = await request('POST', '/api/rider/status', {
      rider_id: 'RIDER-101',
      order_id: orderId,
      status: 'DELIVERED'
    }, rider101Token);
    assert(beforeCashRes.status === 400, 'Cash delivery cannot complete before cash collection');

    const cashRes = await request('POST', '/api/rider/confirm-cash', {
      order_id: orderId
    }, rider101Token);
    assert(cashRes.status === 200 && cashRes.data.order.cashReceivedByRider === true, 'Rider confirms cash collection before completing delivery');

    // 12. Test Step 4: Rider marks delivery complete -> DELIVERED
    const deliveredRes = await request('POST', '/api/rider/status', {
      rider_id: 'RIDER-101',
      order_id: orderId,
      status: 'DELIVERED'
    }, rider101Token);
    assert(deliveredRes.status === 200 && deliveredRes.data.order.order_status === 'DELIVERED', 'Rider successfully completes delivery with DELIVERED');

    // 13. Verify rider is released and marked Available
    const riderStatusRes = await request('GET', '/api/rider/assigned/RIDER-101', null, rider101Token);
    assert(
      riderStatusRes.status === 200 &&
      riderStatusRes.data.rider.status === 'Available' &&
      riderStatusRes.data.rider.assigned_order_id === null,
      'Rider is cleanly released to Available state upon delivery completion'
    );

    console.log(`\n=========================================================`);
    console.log(`🏁 TEST SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`=========================================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runRiderWorkflowTests();
