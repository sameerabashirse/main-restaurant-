const assert = require('assert');
const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(path, method = 'GET', data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runModifyOrderTests() {
  console.log('🧪 ===============================================');
  console.log('🧪 TESTING 10-MINUTE MODIFY ORDER FEATURE');
  console.log('🧪 ===============================================\n');

  try {
    // 1. Create a fresh order
    console.log('1️⃣ Creating a fresh test order...');
    const checkoutRes = await makeRequest('/api/chat/checkout', 'POST', {
      customer_phone: '03001234567',
      customer_name: 'Test Customer',
      branch_id: 'BR-DHA',
      items: [
        { item_id: 'ITEM-1', name: 'Chicken Tikka Pizza', quantity: 1, size: 'Medium', extras: [], price: 1199 }
      ],
      orderType: 'DELIVERY',
      payment_method: 'Cash on Delivery'
    });

    assert.strictEqual(checkoutRes.status, 200, 'Checkout failed');
    assert.strictEqual(checkoutRes.body.success, true, 'Checkout response should be true');
    const orderId = checkoutRes.body.order.order_id;
    const initialTotal = checkoutRes.body.order.total_amount;
    console.log(`✅ PASS: Order created successfully with ID: ${orderId} (Initial Total: Rs. ${initialTotal})`);

    // 2. Check Modify Order Eligibility within 10 minutes
    console.log('\n2️⃣ Checking Modify Order eligibility within 10 minutes...');
    const eligRes = await makeRequest(`/api/chat/modify-eligibility/${orderId}?phone=03001234567`, 'GET');
    assert.strictEqual(eligRes.status, 200, 'Eligibility check failed');
    assert.strictEqual(eligRes.body.eligible, true, 'Order should be eligible for modification');
    assert.ok(eligRes.body.remaining_seconds > 0, 'Remaining seconds should be > 0');
    console.log(`✅ PASS: Eligibility check passed (${eligRes.body.remaining_seconds}s remaining)`);

    // 3. Modify Order within 10 minutes (add item)
    console.log('\n3️⃣ Modifying order within 10 minutes (adding French Fries)...');
    const modifyRes = await makeRequest(`/api/chat/modify-order/${orderId}`, 'PUT', {
      customer_phone: '03001234567',
      items: [
        { item_id: 'ITEM-1', name: 'Chicken Tikka Pizza', quantity: 1, size: 'Medium', extras: [], price: 1199 },
        { item_id: 'ITEM-2', name: 'Crispy French Fries', quantity: 1, size: 'Medium', extras: [], price: 399 }
      ]
    });

    assert.strictEqual(modifyRes.status, 200, 'Order modification failed');
    assert.strictEqual(modifyRes.body.success, true, 'Modification response should be true');
    assert.strictEqual(modifyRes.body.order.order_id, orderId, 'Order ID must remain unchanged');
    assert.strictEqual(modifyRes.body.order.is_updated, true, 'is_updated flag should be set to true');
    assert.strictEqual(modifyRes.body.updated_total, 1199 + 399, 'Server must recalculate correct total price (1598)');
    assert.strictEqual(modifyRes.body.additional_amount, 399, 'Additional amount must equal 399');
    console.log(`✅ PASS: Order ${orderId} updated successfully (New Total: Rs. ${modifyRes.body.updated_total}, Additional: Rs. ${modifyRes.body.additional_amount})`);

    // 4. Test ownership validation rejection (wrong phone number)
    console.log('\n4️⃣ Testing ownership validation (attempting modification with unauthorized phone)...');
    const wrongPhoneRes = await makeRequest(`/api/chat/modify-order/${orderId}`, 'PUT', {
      customer_phone: '03999999999',
      items: [
        { item_id: 'ITEM-1', name: 'Chicken Tikka Pizza', quantity: 1, size: 'Medium', extras: [], price: 1199 }
      ]
    });
    assert.strictEqual(wrongPhoneRes.status, 403, 'Unauthorized modification should return 403');
    console.log('✅ PASS: Unauthorized modification attempt rejected with 403 Forbidden');

    // 5. Test 10-minute time expiry rule on backend
    console.log('\n5️⃣ Testing 10-minute time expiry rule on backend...');
    const expiredCheckRes = await makeRequest(`/api/chat/modify-eligibility/${orderId}?phone=03001234567&simulate_expired=true`, 'GET');
    assert.strictEqual(expiredCheckRes.body.eligible, false, 'Expired order should not be eligible');
    assert.strictEqual(expiredCheckRes.body.is_expired, true, 'is_expired flag should be true');

    const expiredModifyRes = await makeRequest(`/api/chat/modify-order/${orderId}?simulate_expired=true`, 'PUT', {
      customer_phone: '03001234567',
      items: [
        { item_id: 'ITEM-1', name: 'Chicken Tikka Pizza', quantity: 2, size: 'Medium', extras: [], price: 1199 }
      ]
    });
    assert.strictEqual(expiredModifyRes.status, 400, 'Expired modification request should return 400');
    assert.strictEqual(expiredModifyRes.body.expired, true, 'Expired flag should be returned');
    assert.strictEqual(expiredModifyRes.body.message, 'The 10-minute modification window has expired. Please contact the restaurant for assistance.');
    console.log('✅ PASS: Expired modification rejected with 400 and exact required error message');

    // 6. Test order status lock safety (status = OUT_FOR_DELIVERY)
    console.log('\n6️⃣ Testing order status safety lock (status = OUT_FOR_DELIVERY)...');
    // Login as Admin to update status to OUT_FOR_DELIVERY
    const loginRes = await makeRequest('/api/auth/admin-login', 'POST', { email: 'admin@restaurant.com', password: 'admin123' });
    assert.strictEqual(loginRes.status, 200, 'Admin login failed');
    const token = loginRes.body.token;

    await makeRequest(`/api/admin/orders/${orderId}/status`, 'PUT', { order_status: 'OUT_FOR_DELIVERY' }, token);

    const lockedModifyRes = await makeRequest(`/api/chat/modify-order/${orderId}`, 'PUT', {
      customer_phone: '03001234567',
      items: [
        { item_id: 'ITEM-1', name: 'Chicken Tikka Pizza', quantity: 1, size: 'Medium', extras: [], price: 1199 }
      ]
    });
    assert.strictEqual(lockedModifyRes.status, 400, 'Locked status modification should return 400');
    assert.strictEqual(lockedModifyRes.body.locked, true, 'Locked flag should be returned');
    assert.strictEqual(lockedModifyRes.body.message, 'Your order is already being prepared and can no longer be modified.');
    console.log('✅ PASS: Locked status modification rejected with 400 and exact required error message');

    console.log('\n===============================================');
    console.log('🏁 ALL 10-MINUTE MODIFY ORDER CHECKS PASSED SUCCESSFULLY!');
    console.log('===============================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runModifyOrderTests();
