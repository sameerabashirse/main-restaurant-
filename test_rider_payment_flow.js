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

async function runRiderPaymentFlowTests() {
  console.log('🧪 =========================================================');
  console.log('🧪 FEASTFLOW RIDER PAYMENT VISIBILITY & CASH FLOW TESTS');
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
    assert(Boolean(adminToken), 'Super Admin logged in successfully');

    const riderAuth = await request('POST', '/api/auth/rider-login', { email: 'rider@restaurant.com', password: 'rider123' });
    const riderToken = riderAuth.data?.token;
    assert(Boolean(riderToken), 'Rider logged in successfully');

    // 2. Security restriction: Rider cannot call admin status or payment modification
    const unauthPaymentEdit = await request('PUT', '/api/admin/orders/FF-2026-0002/status', { payment_status: 'Paid' }, riderToken);
    assert(unauthPaymentEdit.status === 403, 'Rider is strictly blocked from editing payments directly (403 Forbidden)');

    // Setup fresh active COD order for RIDER-101
    const codSetup = await request('POST', '/api/chat/checkout', {
      customer_phone: '03001234567',
      customer_name: 'Sameer',
      branch_id: 'BR-DHA',
      delivery_type: 'Home Delivery',
      delivery_address: { label: 'Home', address: 'House 42, DHA', lat: 31.4750, lng: 74.4200 },
      payment_method: 'Cash on Delivery',
      items: [{ item_id: 'ITEM-GENERIC', name: 'Zinger Burger', quantity: 2, size: 'Regular', unit_price: 1150, total_price: 2300 }]
    });
    const codOrderId = codSetup.data?.order?.order_id;
    await request('PUT', `/api/admin/orders/${codOrderId}/status`, {
      order_status: 'Out For Delivery',
      rider_id: 'RIDER-101'
    }, adminToken);

    // 3. Security: Check assigned order response does not leak sensitive banking data
    const assignedRes = await request('GET', '/api/rider/assigned/RIDER-101', null, riderToken);
    assert(assignedRes.status === 200, 'Assigned delivery loaded for rider');
    const activeOrder = assignedRes.data?.active_order;
    assert(activeOrder && activeOrder.order_id === codOrderId, `Assigned order ${codOrderId} loaded`);
    assert(activeOrder.bank_receipt === undefined && activeOrder.iban === undefined && activeOrder.bank_account === undefined,
      'Sensitive banking / receipt fields are redacted from rider view');

    // 4. Verify payment visibility properties for active COD order
    assert(activeOrder.payment_method === 'Cash on Delivery', 'Order payment method is Cash on Delivery');
    assert(activeOrder.total_amount === 2300, 'Total order amount matches 2300');
    assert(activeOrder.remaining_amount_to_collect === 2300, 'Remaining amount to collect is exactly 2300');

    // 5. Flow Enforcement: Rider attempts to mark DELIVERED before cash is confirmed -> Expect HTTP 400
    const prematureDeliver = await request('POST', '/api/rider/status', {
      rider_id: 'RIDER-101',
      order_id: activeOrder.order_id,
      status: 'DELIVERED'
    }, riderToken);
    assert(prematureDeliver.status === 400, 'Premature Delivered transition rejected without cash confirmation');
    assert(prematureDeliver.data?.message?.includes('Cash collection not confirmed'),
      'Clear error message explaining cash collection confirmation is required');

    // 6. Cash Collection Flow: Rider confirms cash received
    const cashConfirmRes = await request('POST', '/api/rider/confirm-cash', {
      order_id: activeOrder.order_id
    }, riderToken);
    assert(cashConfirmRes.status === 200, 'Rider successfully confirms cash collection');
    assert(cashConfirmRes.data?.order?.cashReceivedByRider === true, 'cashReceivedByRider saved as true');
    assert(cashConfirmRes.data?.order?.cashReceivedAmount === 2300, 'cashReceivedAmount saved as 2300');
    assert(Boolean(cashConfirmRes.data?.order?.cashReceivedAt), 'cashReceivedAt timestamp recorded');
    assert(cashConfirmRes.data?.order?.cashReceivedRiderId === 'RIDER-101', 'Rider ID correctly associated with cash collection');
    assert(cashConfirmRes.data?.order?.payment_status === 'Cash Collected', 'payment_status updated to Cash Collected');

    // 7. Duplicate Prevention Flow: Rider attempts second cash confirmation
    const duplicateCash = await request('POST', '/api/rider/confirm-cash', {
      order_id: activeOrder.order_id
    }, riderToken);
    assert(duplicateCash.status === 400, 'Duplicate cash confirmation rejected (idempotency preserved)');
    assert(duplicateCash.data?.message?.includes('already been confirmed'), 'Duplicate warning returned to client');

    // 8. Verified delivery: Now rider can complete delivery
    const deliverAfterCash = await request('POST', '/api/rider/status', {
      rider_id: 'RIDER-101',
      order_id: activeOrder.order_id,
      status: 'DELIVERED'
    }, riderToken);
    assert(deliverAfterCash.status === 200, 'Order successfully marked DELIVERED after cash collection confirmed');
    assert(deliverAfterCash.data?.order?.order_status === 'DELIVERED', 'Order status is now DELIVERED');

    // 9. Admin and Staff Visibility: Verify cash collection is visible in Payment ledger
    const paymentsRes = await request('GET', '/api/admin/payments', null, adminToken);
    assert(paymentsRes.status === 200, 'Admin payments ledger fetched');
    const orderPayment = paymentsRes.data?.payments?.find(p => p.order_id === activeOrder.order_id);
    assert(orderPayment && orderPayment.cashReceivedByRider === true, 'Cash collection reflected in Admin payment ledger');
    assert(orderPayment.cashReceivedRiderName === 'Rider Ali', 'Rider name correctly attributed in payment record');
    assert(orderPayment.cashReceivedAmount === 2300, 'Collected amount matches total in ledger');

    // 10. Verify Online Paid scenario: Create an online paid order and verify remaining is 0
    const onlineOrder = await request('POST', '/api/chat/checkout', {
      customer_phone: '03001234567',
      customer_name: 'Sameer',
      branch_id: 'BR-DHA',
      delivery_type: 'Home Delivery',
      delivery_address: { label: 'Home', address: 'House 42, DHA', lat: 31.4750, lng: 74.4200 },
      payment_method: 'Online Payment',
      items: [{ item_id: 'ITEM-GENERIC', name: 'Cheesecake', quantity: 1, size: 'Slice', unit_price: 650, total_price: 650 }]
    });
    assert(onlineOrder.status === 200, 'Online order created');
    const onlineOrderId = onlineOrder.data?.order?.order_id;

    // Staff marks online payment verified as Paid
    await request('PUT', `/api/admin/orders/${onlineOrderId}/status`, {
      payment_status: 'Paid',
      rider_id: 'RIDER-101'
    }, adminToken);

    const riderOnlineOrderRes = await request('GET', '/api/rider/assigned/RIDER-101', null, riderToken);
    const assignedOnlineOrder = riderOnlineOrderRes.data?.active_order;
    assert(assignedOnlineOrder && assignedOnlineOrder.payment_status === 'Paid', 'Online order has Paid status');
    assert(assignedOnlineOrder.remaining_amount_to_collect === 0, 'Online Paid order has remaining amount 0 (PAID — DO NOT COLLECT CASH)');

    console.log('\n=========================================================');
    console.log(`🏁 TEST SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('=========================================================');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('❌ Test suite failed unexpectedly:', err);
    process.exit(1);
  }
}

runRiderPaymentFlowTests();
