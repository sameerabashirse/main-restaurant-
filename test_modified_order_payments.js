const assert = require('node:assert/strict');

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function request(method, path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

async function run() {
  const admin = await request('POST', '/api/auth/admin-login', { email: 'admin@restaurant.com', password: 'admin123' });
  const rider = await request('POST', '/api/auth/rider-login', { email: 'rider@restaurant.com', password: 'rider123' });

  for (const paymentMethod of ['Cash on Delivery', 'Online Payment', 'Bank Transfer']) {
    const item = { name: 'Chocolate Lava Cake', quantity: 1, size: 'Regular', price: 550 };
    const { order } = await request('POST', '/api/chat/checkout', {
      customer_phone: '03001234567',
      customer_name: 'Merge Regression',
      branch_id: 'BR-DHA',
      delivery_type: 'Home Delivery',
      delivery_address: { label: 'Home', address: 'House 42, DHA', lat: 31.475, lng: 74.42 },
      payment_method: paymentMethod,
      items: [item]
    });
    const updated = await request('PUT', `/api/chat/modify-order/${order.order_id}`, {
      customer_phone: order.customer_phone,
      items: [{ ...item, quantity: 2 }]
    });
    assert.equal(updated.order.order_id, order.order_id);
    assert.equal(updated.order.payment_method, paymentMethod);
    assert.equal(updated.order.payment_status, order.payment_status);
    assert.equal(updated.updated_total, order.total_amount * 2);
    assert.equal(updated.order.is_updated, true);
    assert.equal(updated.order.modification_history.length, 1);

    await request('PUT', `/api/admin/orders/${order.order_id}/status`, { rider_id: 'RIDER-101' }, admin.token);
    const assigned = await request('GET', '/api/rider/assigned/RIDER-101', null, rider.token);
    assert.equal(assigned.active_order.order_id, order.order_id);
    assert.equal(assigned.active_order.payment_method, paymentMethod);
    assert.equal(assigned.active_order.remaining_amount_to_collect, updated.updated_total);

    if (paymentMethod === 'Cash on Delivery') {
      const collected = await request('POST', '/api/rider/confirm-cash', { order_id: order.order_id }, rider.token);
      assert.equal(collected.order.cashReceivedAmount, updated.updated_total);
    }
    console.log(`PASS: modified dessert order preserves ${paymentMethod} and updates rider collection total`);
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
