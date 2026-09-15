const http = require('http');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let resData = '';
      res.on('data', (chunk) => { resData += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(resData) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: resData });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 =========================================================');
  console.log('🧪 TESTING CUSTOMER PAYMENT METHOD SELECTION & RIDER SYNC');
  console.log('🧪 =========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Log in admin and rider
    const adminLogin = await request('POST', '/api/auth/admin-login', { email: 'admin@restaurant.com', password: 'admin123' });
    assert(adminLogin.status === 200, 'Admin login successful');
    const adminToken = adminLogin.data.token;

    const riderLogin = await request('POST', '/api/auth/rider-login', { email: 'rider@restaurant.com', password: 'rider123' });
    assert(riderLogin.status === 200, 'Rider login successful');
    const riderToken = riderLogin.data.token;

    // 2. Place Order 1: Cash on Delivery
    console.log('\n--- Scenario 1: Cash on Delivery Checkout ---');
    const codOrderRes = await request('POST', '/api/chat/checkout', {
      customer_phone: '03001234567',
      customer_name: 'Sameer',
      branch_id: 'BR-DHA',
      delivery_type: 'Home Delivery',
      delivery_address: { label: 'Home', address: 'House 42, DHA', lat: 31.4750, lng: 74.4200 },
      payment_method: 'Cash on Delivery',
      items: [{ item_id: 'ITEM-GENERIC', name: 'Chocolate Lava Cake', quantity: 1, size: 'Regular', unit_price: 550, total_price: 550 }]
    });
    assert(codOrderRes.status === 200 && codOrderRes.data.success, 'COD order created via checkout');
    const codOrder = codOrderRes.data.order;
    assert(codOrder.payment_method === 'Cash on Delivery', 'Order has payment_method: Cash on Delivery');
    assert(codOrder.payment_status === 'Pending', 'COD order has payment_status: Pending');

    // Assign COD order to rider
    await request('PUT', `/api/admin/orders/${codOrder.order_id}/status`, {
      rider_id: 'RIDER-101'
    }, adminToken);

    const riderCodRes = await request('GET', '/api/rider/assigned/RIDER-101', null, riderToken);
    const assignedCod = riderCodRes.data?.active_order;
    assert(assignedCod && assignedCod.order_id === codOrder.order_id, 'Rider assigned COD order');
    assert(assignedCod.payment_method === 'Cash on Delivery', 'Rider sees payment_method: Cash on Delivery');
    assert(assignedCod.remaining_amount_to_collect === codOrder.total_amount, `Rider must collect Rs. ${codOrder.total_amount}`);

    // 3. Place Order 2: Online Payment
    console.log('\n--- Scenario 2: Online Payment Checkout ---');
    const onlineOrderRes = await request('POST', '/api/chat/checkout', {
      customer_phone: '03001234567',
      customer_name: 'Sameer',
      branch_id: 'BR-DHA',
      delivery_type: 'Home Delivery',
      delivery_address: { label: 'Home', address: 'House 42, DHA', lat: 31.4750, lng: 74.4200 },
      payment_method: 'Online Payment',
      items: [{ item_id: 'ITEM-GENERIC', name: 'Cheesecake', quantity: 1, size: 'Slice', unit_price: 650, total_price: 650 }]
    });
    assert(onlineOrderRes.status === 200 && onlineOrderRes.data.success, 'Online Payment order created via checkout');
    const onlineOrder = onlineOrderRes.data.order;
    assert(onlineOrder.payment_method === 'Online Payment', 'Order has payment_method: Online Payment');
    assert(onlineOrder.payment_status === 'Payment Verification Pending', 'Online order has initial payment_status: Payment Verification Pending');

    // Assign Online Payment order to rider
    await request('PUT', `/api/admin/orders/${onlineOrder.order_id}/status`, {
      rider_id: 'RIDER-101'
    }, adminToken);

    const riderOnlineRes = await request('GET', '/api/rider/assigned/RIDER-101', null, riderToken);
    const assignedOnline = riderOnlineRes.data?.active_order;
    assert(assignedOnline && assignedOnline.order_id === onlineOrder.order_id, 'Rider assigned Online Payment order');
    assert(assignedOnline.payment_method === 'Online Payment', 'Rider sees payment_method: Online Payment');
    assert(assignedOnline.payment_status === 'Payment Verification Pending', 'Rider sees payment_status: Payment Verification Pending');

    // 4. Place Order 3: Bank Transfer
    console.log('\n--- Scenario 3: Bank Transfer Checkout ---');
    const bankOrderRes = await request('POST', '/api/chat/checkout', {
      customer_phone: '03001234567',
      customer_name: 'Sameer',
      branch_id: 'BR-DHA',
      delivery_type: 'Home Delivery',
      delivery_address: { label: 'Home', address: 'House 42, DHA', lat: 31.4750, lng: 74.4200 },
      payment_method: 'Bank Transfer',
      items: [{ item_id: 'ITEM-GENERIC', name: 'Molten Brownie', quantity: 1, size: 'Single', unit_price: 600, total_price: 600 }]
    });
    assert(bankOrderRes.status === 200 && bankOrderRes.data.success, 'Bank Transfer order created via checkout');
    const bankOrder = bankOrderRes.data.order;
    assert(bankOrder.payment_method === 'Bank Transfer', 'Order has payment_method: Bank Transfer');
    assert(bankOrder.payment_status === 'Payment Verification Pending', 'Bank Transfer order has initial payment_status: Payment Verification Pending');

    // 5. Staff Verifies Online Payment
    console.log('\n--- Scenario 4: Staff Verification of Online Payment ---');
    const verifyRes = await request('PUT', `/api/admin/orders/${onlineOrder.order_id}/status`, {
      payment_status: 'Paid',
      rider_id: 'RIDER-101'
    }, adminToken);
    assert(verifyRes.status === 200, 'Staff updated payment_status to Paid');

    const riderVerifiedRes = await request('GET', '/api/rider/assigned/RIDER-101', null, riderToken);
    const assignedVerified = riderVerifiedRes.data?.active_order;
    assert(assignedVerified.payment_status === 'Paid', 'Rider sees verified payment_status: Paid');
    assert(assignedVerified.remaining_amount_to_collect === 0, 'Remaining collection amount is 0 (PAID — DO NOT COLLECT CASH)');

    console.log('\n=========================================================');
    console.log(`🏁 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('=========================================================');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
