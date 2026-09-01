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

async function runVerification() {
  console.log('🧪 ===============================================');
  console.log('🧪 FEASTFLOW AUTOMATED SYSTEM VERIFICATION SUITE');
  console.log('🧪 ===============================================\n');

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
    // 1. Healthcheck
    const health = await request('GET', '/api/health');
    assert(health.status === 200 && health.data.status === 'online', 'Health check probe returns 200 Online');

    // 2. Authentication across all roles
    const adminAuth = await request('POST', '/api/auth/admin-login', { email: 'admin@restaurant.com', password: 'admin123' });
    assert(adminAuth.status === 200 && adminAuth.data.token && adminAuth.data.user.role === 'admin', 'Super Admin authentication');
    const adminToken = adminAuth.data?.token;

    const managerAuth = await request('POST', '/api/auth/staff-login', { email: 'manager@restaurant.com', password: 'manager123' });
    assert(managerAuth.status === 200 && managerAuth.data.redirectUrl === '/staff/manager/dashboard', 'Manager authentication & redirect');

    const kitchenAuth = await request('POST', '/api/auth/staff-login', { email: 'kitchen@restaurant.com', password: 'kitchen123' });
    assert(kitchenAuth.status === 200 && kitchenAuth.data.redirectUrl === '/staff/kitchen/dashboard', 'Kitchen staff authentication & redirect');

    const deliveryAuth = await request('POST', '/api/auth/staff-login', { email: 'delivery@restaurant.com', password: 'delivery123' });
    assert(deliveryAuth.status === 200 && deliveryAuth.data.redirectUrl === '/staff/delivery/dashboard', 'Delivery Manager authentication & redirect');

    const riderAuth = await request('POST', '/api/auth/rider-login', { email: 'rider@restaurant.com', password: 'rider123' });
    assert(riderAuth.status === 200 && riderAuth.data.user.role === 'rider', 'Rider authentication');
    const riderToken = riderAuth.data?.token;

    // 3. Security: Unauthenticated Rider API access rejected
    const unauthRider = await request('GET', '/api/rider/assigned/RIDER-101');
    assert(unauthRider.status === 401, 'Unauthenticated rider route access rejected with 401');

    // 4. Security: Rider cannot access Super Admin Analytics
    const riderOnAdmin = await request('GET', '/api/admin/analytics', null, riderToken);
    assert(riderOnAdmin.status === 403, 'Rider attempting to access Admin Analytics rejected with 403');

    // 5. Admin Analytics accessible by Admin
    const adminAnalytics = await request('GET', '/api/admin/analytics', null, adminToken);
    assert(adminAnalytics.status === 200 && adminAnalytics.data.metrics, 'Super Admin can access KPI Analytics');

    // 6. Customer Chat Start & Dynamic ID
    const chatStart = await request('POST', '/api/chat/start', { phone: '03112233445', name: 'Zain Test' });
    assert(chatStart.status === 200 && chatStart.data.customer.customer_id.startsWith('CUST-'), 'Customer identification and dynamic CUST ID generation');

    // 7. Menu Query
    const menuRes = await request('GET', '/api/chat/menu');
    assert(menuRes.status === 200 && menuRes.data.menu_items.length > 0, 'Menu items retrieved successfully');

    // 8. Server-side price validation at checkout
    const checkoutRes = await request('POST', '/api/chat/checkout', {
      customer_phone: '03112233445',
      customer_name: 'Zain Test',
      items: [
        { name: 'Chicken Tikka Pizza', size: 'Medium', quantity: 2, unit_price: 1 } // Forged unit_price: 1
      ]
    });
    assert(
      checkoutRes.status === 200 && 
      checkoutRes.data.order.total_amount === 2398 && // 1199 * 2 = 2398 calculated on server!
      checkoutRes.data.order.order_id.startsWith('FF-2026-'),
      'Checkout validates price on server (rejects forged price: 1) and generates atomic FF-2026-XXXX ID'
    );
    const createdOrderId = checkoutRes.data?.order?.order_id;

    // 9. Rider assigned order access with JWT token
    const riderAssigned = await request('GET', '/api/rider/assigned/RIDER-101', null, riderToken);
    assert(riderAssigned.status === 200 && riderAssigned.data.rider, 'Rider can access assigned deliveries with JWT');

    // 10. Rider GPS Location Push with JWT
    const gpsRes = await request('POST', '/api/rider/location', {
      rider_id: 'RIDER-101',
      lat: 31.4725,
      lng: 74.4135
    }, riderToken);
    assert(gpsRes.status === 200 && gpsRes.data.success, 'Rider can push live GPS coordinates with authentication');

    // 11. Idempotency: Complete Order Twice and verify spending incremented once
    const custBefore = await request('POST', '/api/chat/start', { phone: '03112233445' });
    const spendBefore = custBefore.data.customer.total_spending;

    await request('PUT', `/api/admin/orders/${createdOrderId}/status`, { order_status: 'Delivered' }, adminToken);
    await request('PUT', `/api/admin/orders/${createdOrderId}/status`, { order_status: 'Delivered' }, adminToken); // Second call

    const custAfter = await request('POST', '/api/chat/start', { phone: '03112233445' });
    const spendAfter = custAfter.data.customer.total_spending;

    assert(spendAfter - spendBefore === 2398, 'Idempotent Order Delivery (Spending incremented only once despite repeated updates)');

    // 12. Review Submission and +20 Loyalty Points
    const reviewRes = await request('POST', '/api/chat/review', {
      order_id: createdOrderId,
      rating: 5,
      food_quality: 'Amazing',
      delivery_speed: 'Fast',
      feedback: 'Excellent pizza!'
    });
    assert(reviewRes.status === 200 && reviewRes.data.points_earned === 20, 'Customer review awards +20 loyalty points');

    console.log(`\n===============================================`);
    console.log(`🏁 VERIFICATION SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`===============================================\n`);
  } catch (err) {
    console.error('Test execution error:', err);
  }
}

runVerification();
