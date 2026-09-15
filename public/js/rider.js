/* ==========================================================================
   FEASTFLOW DELIVERY RIDER MOBILE PORTAL CONTROLLER
   ========================================================================== */

let activeRiderData = null;
let currentRiderOrderId = null;
let riderGPSInterval = null;

const demoGPSSteps = [
  { lat: 31.4704, lng: 74.4101 },
  { lat: 31.4715, lng: 74.4120 },
  { lat: 31.4728, lng: 74.4145 },
  { lat: 31.4739, lng: 74.4170 },
  { lat: 31.4750, lng: 74.4200 }
];
let currentGPSIndex = 0;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('rider-order-card')) {
    initRiderPortal();
  }
});

async function initRiderPortal() {
  const user = API.getUser();
  const riderId = (user && user.role === 'rider') ? 'RIDER-101' : 'RIDER-101';
  loadRiderAssignedOrder(riderId);

  try {
    if (typeof io !== 'undefined') {
      const socket = io();
      socket.on('order:updated', () => loadRiderAssignedOrder(riderId));
      socket.on('order:cash-collected', () => loadRiderAssignedOrder(riderId));
      socket.on('order:status', () => loadRiderAssignedOrder(riderId));
    }
  } catch (e) {}
}

function getRiderPaymentDisplay(order) {
  if (!order) return null;
  const method = order.payment_method || 'Cash on Delivery';
  const total = order.total_amount || 0;
  const rawStatus = (order.payment_status || 'Pending').trim();
  const statusLower = rawStatus.toLowerCase();
  const isCod = method.toLowerCase().includes('cash');
  const paidAmount = order.paid_amount || (statusLower === 'paid' ? total : 0);
  const isCashCollected = Boolean(order.cashReceivedByRider);

  // 1. ONLINE PAYMENT VERIFIED
  if (!isCod && (statusLower === 'paid' || statusLower === 'verified')) {
    return {
      scenario: 'ONLINE_VERIFIED',
      method,
      total,
      status: 'Paid (Verified)',
      badgeText: 'PAID — DO NOT COLLECT CASH',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      badgeIcon: 'fa-circle-check',
      remainingAmount: 0,
      showCashButton: false,
      instruction: null
    };
  }

  // Already collected by rider
  if (isCashCollected) {
    return {
      scenario: 'CASH_COLLECTED',
      method,
      total,
      status: 'Cash Collected',
      badgeText: 'CASH COLLECTED BY RIDER',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      badgeIcon: 'fa-hand-holding-dollar',
      remainingAmount: 0,
      showCashButton: false,
      instruction: `Collected by ${order.cashReceivedRiderName || 'Rider'} (Rs. ${order.cashReceivedAmount || total})`
    };
  }

  // 2. PAYMENT SUBMITTED BUT NOT VERIFIED
  if (!isCod && (statusLower.includes('verif') || statusLower === 'submitted' || statusLower === 'pending')) {
    return {
      scenario: 'VERIFICATION_PENDING',
      method,
      total,
      status: 'Payment Verification Pending',
      badgeText: 'PAYMENT VERIFICATION PENDING',
      badgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
      badgeIcon: 'fa-hourglass-half',
      remainingAmount: total,
      showCashButton: false,
      instruction: 'Confirm with staff before delivery. Rider must not treat this order as paid.'
    };
  }

  // 4. ONLINE PAYMENT REJECTED OR UNPAID
  if (!isCod && (statusLower.includes('reject') || statusLower.includes('fail') || statusLower === 'unpaid')) {
    return {
      scenario: 'PAYMENT_NOT_RECEIVED',
      method,
      total,
      status: 'Payment Not Received',
      badgeText: 'PAYMENT NOT RECEIVED',
      badgeClass: 'bg-red-100 text-red-800 border-red-300',
      badgeIcon: 'fa-triangle-exclamation',
      remainingAmount: total,
      showCashButton: true,
      instruction: 'Collect remaining amount only according to admin/staff instructions.'
    };
  }

  // 5. PARTIALLY PAID
  if (statusLower.includes('part') || (paidAmount > 0 && paidAmount < total)) {
    const remaining = Math.max(0, total - paidAmount);
    return {
      scenario: 'PARTIALLY_PAID',
      method,
      total,
      status: 'Partially Paid',
      badgeText: 'PARTIALLY PAID',
      badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-300',
      badgeIcon: 'fa-circle-half-stroke',
      remainingAmount: remaining,
      showCashButton: remaining > 0,
      instruction: `Paid amount: Rs. ${paidAmount} • Remaining amount to collect: Rs. ${remaining}`
    };
  }

  // 3. CASH ON DELIVERY
  return {
    scenario: 'CASH_ON_DELIVERY',
    method: 'Cash on Delivery',
    total,
    status: 'Pending Collection',
    badgeText: `COLLECT CASH: Rs. ${total}`,
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    badgeIcon: 'fa-money-bill-wave',
    remainingAmount: total,
    showCashButton: true,
    instruction: 'Collect exact cash from customer before handing over order.'
  };
}

async function loadRiderAssignedOrder(riderId = 'RIDER-101') {
  const card = document.getElementById('rider-order-card');
  if (!card) return;

  try {
    const data = await API.get(`/api/rider/assigned/${riderId}`);
    if (!data || !data.success) {
      card.innerHTML = `
        <div class="p-6 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          <i class="fa-solid fa-circle-check text-4xl text-emerald-600 mb-2 block"></i>
          <h3 class="font-bold text-sm text-slate-800">No active delivery assigned</h3>
          <p class="text-xs text-slate-400 mt-1">You are currently available for new delivery orders.</p>
        </div>
      `;
      return;
    }

    activeRiderData = data.rider;
    const order = data.active_order;

    if (!order) {
      card.innerHTML = `
        <div class="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          <i class="fa-solid fa-motorcycle text-4xl text-emerald-600 mb-3 block"></i>
          <h3 class="font-bold text-base text-slate-800">Ready for Deliveries!</h3>
          <p class="text-xs text-slate-500 mt-1">Status: <span class="text-emerald-700 font-bold">Available</span></p>
          <div class="text-[11px] text-slate-400 mt-3">Rider: ${activeRiderData.name} (${activeRiderData.rider_id})</div>
        </div>
      `;
      return;
    }

    currentRiderOrderId = order.order_id;
    window.currentRiderActiveOrder = order;
    const itemsText = (order.items || []).map(i => `• ${i.quantity}x ${i.name} (${i.size})`).join('<br>');
    const payment = getRiderPaymentDisplay(order);

    card.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
        <!-- Header -->
        <div class="bg-emerald-800 text-white p-4 flex items-center justify-between">
          <div>
            <span class="text-xs text-emerald-200 font-medium">Assigned Delivery</span>
            <div class="text-lg font-extrabold font-mono tracking-wide">${order.order_id}</div>
          </div>
          ${Utils.getStatusBadge(order.order_status)}
        </div>

        <!-- Body Details -->
        <div class="p-4 space-y-3.5">
          <!-- Customer Info -->
          <div class="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div class="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm flex-shrink-0">
              <i class="fa-solid fa-user"></i>
            </div>
            <div>
              <div class="font-bold text-slate-900 text-sm">${order.customer_name}</div>
              <a href="tel:${order.customer_phone}" class="text-xs font-semibold text-emerald-700 hover:underline flex items-center gap-1 mt-0.5">
                <i class="fa-solid fa-phone text-[10px]"></i> ${order.customer_phone}
              </a>
            </div>
          </div>

          <!-- Address -->
          <div class="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div class="w-9 h-9 rounded-full bg-red-100 text-red-800 flex items-center justify-center font-bold text-sm flex-shrink-0">
              <i class="fa-solid fa-location-dot"></i>
            </div>
            <div>
              <div class="text-[10px] text-slate-400 font-semibold uppercase">Delivery Destination</div>
              <div class="text-xs font-medium text-slate-800 mt-0.5">${order.delivery_address ? (order.delivery_address.address || order.delivery_address) : 'Phase 5 DHA, Lahore'}</div>
            </div>
          </div>

          <!-- Items Ordered -->
          <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div class="text-[10px] text-slate-400 font-semibold uppercase mb-1.5">Order Items</div>
            <div class="text-xs text-slate-700 leading-relaxed">${itemsText}</div>
          </div>

          <!-- Payment Visibility Card -->
          <div class="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5">
            <div class="flex items-center justify-between gap-1">
              <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment & Collection</span>
              <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${payment.badgeClass}">
                <i class="fa-solid ${payment.badgeIcon} text-[9px]"></i>
                ${payment.badgeText}
              </span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span class="text-[10px] text-slate-400 font-medium">Payment Method</span>
                <p class="font-bold text-slate-800 text-xs">${payment.method}</p>
              </div>
              <div>
                <span class="text-[10px] text-slate-400 font-medium">Payment Status</span>
                <p class="font-bold text-slate-800 text-xs">${payment.status}</p>
              </div>
              <div>
                <span class="text-[10px] text-slate-400 font-medium">Total Amount</span>
                <p class="font-extrabold text-slate-900 text-xs">${Utils.formatCurrency(payment.total)}</p>
              </div>
              <div>
                <span class="text-[10px] text-slate-400 font-medium">Remaining to Collect</span>
                <p class="font-black text-xs ${payment.remainingAmount > 0 ? 'text-red-700' : 'text-emerald-700'}">
                  ${Utils.formatCurrency(payment.remainingAmount)}
                </p>
              </div>
            </div>

            ${payment.instruction ? `
              <div class="rounded-lg bg-white border border-slate-200 p-2 text-[10px] font-semibold text-slate-600 leading-tight">
                <i class="fa-solid fa-circle-info mr-1 text-amber-600"></i>
                ${payment.instruction}
              </div>
            ` : ''}

            ${payment.showCashButton ? `
              <button type="button" onclick="openCashConfirmModal('${order.order_id}', ${payment.remainingAmount})" class="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold py-2 px-3 rounded-xl text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all">
                <i class="fa-solid fa-hand-holding-dollar"></i> Cash Received (Rs. ${payment.remainingAmount})
              </button>
            ` : ''}
          </div>

          <!-- Action Buttons -->
          <div class="space-y-2 pt-2">
            ${order.order_status !== 'Out For Delivery' && order.order_status !== 'Delivered' ? `
              <button class="w-full bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold py-3 px-4 rounded-xl text-sm shadow-md transition-colors flex items-center justify-center gap-2" onclick="riderUpdateStatus('Out For Delivery')">
                <i class="fa-solid fa-route"></i> Start Delivery (On The Way)
              </button>
            ` : ''}

            <button class="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-colors flex items-center justify-center gap-2" onclick="simulateRiderGPSMovement()">
              <i class="fa-solid fa-location-crosshairs"></i> Push Live GPS Coordinates
            </button>

            ${order.order_status !== 'Delivered' ? `
              <button class="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-3 px-4 rounded-xl text-sm shadow-md transition-colors flex items-center justify-center gap-2" onclick="riderUpdateStatus('Delivered')">
                <i class="fa-solid fa-circle-check"></i> Mark Order Delivered
              </button>
            ` : `
              <div class="w-full text-center py-2.5 text-xs text-emerald-700 font-bold bg-emerald-100 rounded-xl">
                ✓ Order Completed!
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    card.innerHTML = '<div class="p-6 text-center text-rose-500 bg-white rounded-xl text-xs">Error loading assigned delivery.</div>';
  }
}

function openCashConfirmModal(orderId, remainingAmount) {
  closeRiderCashModal();
  const modalHtml = `
    <div id="rider-cash-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div class="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
        <div class="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-center">
          <i class="fa-solid fa-hand-holding-dollar text-3xl text-amber-600 mb-2 block"></i>
          <h4 class="text-sm font-bold text-amber-950">Confirm Cash Receipt</h4>
          <p class="mt-2 text-xs text-amber-900 leading-relaxed">
            Confirm that you have received <b class="text-sm font-black text-amber-950">Rs. ${remainingAmount}</b> from the customer.
          </p>
        </div>
        <p class="text-[11px] text-slate-500 text-center mt-3">
          Once confirmed, this order will update to "Cash Collected" and staff will be notified in real time.
        </p>
        <div class="flex gap-2 mt-4">
          <button onclick="closeRiderCashModal()" class="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-3 rounded-xl text-xs">
            Cancel
          </button>
          <button onclick="submitRiderCashCollection('${orderId}')" id="btn-confirm-cash-submit" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-check"></i> Confirm Received
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeRiderCashModal() {
  const modal = document.getElementById('rider-cash-modal');
  if (modal) modal.remove();
}

async function submitRiderCashCollection(orderId) {
  const btn = document.getElementById('btn-confirm-cash-submit');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
  }
  try {
    const res = await API.post('/api/rider/confirm-cash', { order_id: orderId });
    closeRiderCashModal();
    if (res && res.success) {
      Utils.showToast(res.message || 'Cash confirmed successfully!', 'success');
      const riderId = activeRiderData ? activeRiderData.rider_id : 'RIDER-101';
      loadRiderAssignedOrder(riderId);
    } else {
      Utils.showToast(res?.message || 'Error confirming cash', 'error');
    }
  } catch (err) {
    Utils.showToast(err.message || 'Failed to confirm cash collection', 'error');
  }
}

async function riderUpdateStatus(status) {
  if (!currentRiderOrderId) return;
  const order = window.currentRiderActiveOrder;

  // Guard: Cash on Delivery / unpaid orders require confirmed cash collection before Delivered
  if (status === 'Delivered' || status === 'DELIVERED') {
    const isOnlinePaid = order && (order.payment_status === 'Paid' || order.payment_status === 'PAID') && order.payment_method !== 'Cash on Delivery';
    if (!isOnlinePaid && (!order || !order.cashReceivedByRider)) {
      Utils.showToast('Please confirm cash received from customer before marking Delivered.', 'warning');
      const remaining = order ? (order.total_amount - (order.paid_amount || 0)) : 0;
      openCashConfirmModal(currentRiderOrderId, remaining);
      return;
    }
  }

  try {
    const riderId = activeRiderData ? activeRiderData.rider_id : 'RIDER-101';
    const res = await API.post('/api/rider/status', {
      rider_id: riderId,
      order_id: currentRiderOrderId,
      status
    });

    if (res && res.success) {
      Utils.showToast(`Order status updated to: ${status}`, 'success');
      loadRiderAssignedOrder(riderId);
    } else {
      Utils.showToast(res?.message || 'Failed to update status', 'error');
    }
  } catch (err) {
    Utils.showToast(err.message || 'Failed to update status', 'error');
  }
}

async function simulateRiderGPSMovement() {
  const riderId = activeRiderData ? activeRiderData.rider_id : 'RIDER-101';
  currentGPSIndex = (currentGPSIndex + 1) % demoGPSSteps.length;
  const nextCoords = demoGPSSteps[currentGPSIndex];

  try {
    const res = await API.post('/api/rider/location', {
      rider_id: riderId,
      order_id: currentRiderOrderId,
      lat: nextCoords.lat,
      lng: nextCoords.lng
    });

    if (res && res.success) {
      Utils.showToast(`📍 Live GPS Broadcast: ${nextCoords.lat.toFixed(4)}, ${nextCoords.lng.toFixed(4)}`, 'info');
    }
  } catch (err) {
    Utils.showToast('GPS sync error', 'error');
  }
}

window.loadRiderAssignedOrder = loadRiderAssignedOrder;
window.riderUpdateStatus = riderUpdateStatus;
window.simulateRiderGPSMovement = simulateRiderGPSMovement;
