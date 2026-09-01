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
      socket.on('order:updated', () => {
        loadRiderAssignedOrder(riderId);
      });
    }
  } catch (e) {}
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
    const itemsText = (order.items || []).map(i => `• ${i.quantity}x ${i.name} (${i.size})`).join('<br>');

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

          <!-- Cash Collection -->
          <div class="flex items-center justify-between p-3.5 bg-emerald-50 rounded-xl border border-emerald-200/80">
            <div>
              <div class="text-[10px] text-emerald-800 font-semibold uppercase">Collect Cash on Delivery</div>
              <div class="text-lg font-extrabold text-emerald-900">${Utils.formatCurrency(order.total_amount)}</div>
            </div>
            <span class="text-2xl">💵</span>
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

async function riderUpdateStatus(status) {
  if (!currentRiderOrderId) return;

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
    }
  } catch (err) {
    Utils.showToast('Failed to update status', 'error');
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
