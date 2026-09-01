/* ==========================================================================
   FEASTFLOW KITCHEN DISPLAY SYSTEM (KDS) CONTROLLER
   ========================================================================== */

let kitchenSocket = null;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('kitchen-kds-grid')) {
    initKitchenSocket();
  }
});

function initKitchenSocket() {
  try {
    if (typeof io !== 'undefined') {
      kitchenSocket = io();
      kitchenSocket.on('order:created', (order) => {
        Utils.showToast(`🔥 Kitchen Alert: New Order #${order.order_id}!`, 'warning');
        playKitchenAlertSound();
        loadKitchenKDS();
      });

      kitchenSocket.on('order:updated', () => {
        loadKitchenKDS();
      });
    }
  } catch (err) {
    console.warn('Kitchen socket error:', err);
  }
}

function playKitchenAlertSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {}
}

async function loadKitchenKDS() {
  const container = document.getElementById('kitchen-kds-grid');
  if (!container) return;

  try {
    const data = await API.get('/api/admin/kitchen/orders');
    const orders = data.orders || [];

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-16 text-center text-slate-400 bg-slate-800/60 rounded-2xl border border-slate-700">
          <i class="fa-solid fa-circle-check text-4xl text-emerald-500 mb-3 block"></i>
          <h3 class="text-base font-bold text-slate-200">Kitchen Queue is Clear!</h3>
          <p class="text-xs text-slate-400 mt-1">All incoming orders have been prepared.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = orders.map(o => {
      let borderCol = 'border-amber-500/60 bg-slate-800';
      if (o.order_status === 'Received') borderCol = 'border-blue-500/80 bg-slate-800/90 shadow-blue-900/20';
      if (o.order_status === 'Confirmed') borderCol = 'border-indigo-500/80 bg-slate-800/90';
      if (o.order_status === 'Preparing') borderCol = 'border-amber-500/90 bg-slate-800 shadow-amber-900/30 ring-1 ring-amber-500/50 animate-pulse';
      if (o.order_status === 'Ready') borderCol = 'border-purple-500/80 bg-slate-800';

      return `
        <div class="rounded-2xl border-2 ${borderCol} p-4 shadow-lg flex flex-col justify-between transition-all duration-300">
          <div>
            <div class="flex items-center justify-between pb-2 border-b border-slate-700 mb-3">
              <div>
                <span class="text-base font-extrabold text-amber-400 font-mono tracking-wider">${o.order_id}</span>
                <div class="text-[11px] text-slate-400">${o.customer_name} • ${Utils.formatDateTime(o.created_at)}</div>
              </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-bold ${o.order_status === 'Preparing' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-700 text-slate-200'}">
                ${o.order_status}
              </span>
            </div>

            <!-- Items List -->
            <div class="space-y-2 mb-4">
              ${(o.items || []).map(i => `
                <div class="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/60">
                  <div class="flex items-center justify-between text-sm font-bold text-slate-100">
                    <span><span class="text-amber-400 font-mono text-base mr-1">${i.quantity}x</span> ${i.name}</span>
                    <span class="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-normal">${i.size}</span>
                  </div>
                  ${i.extras && i.extras.length > 0 ? `
                    <div class="text-xs text-amber-300/90 mt-1 pl-3 font-medium border-l-2 border-amber-500/40">
                      ${i.extras.join(', ')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="pt-2 border-t border-slate-700/80 flex gap-2">
            ${o.order_status === 'Received' ? `
              <button class="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors" onclick="kitchenUpdateStatus('${o.order_id}', 'Confirmed')">
                <i class="fa-solid fa-check"></i> Accept Ticket
              </button>
            ` : ''}
            ${o.order_status === 'Confirmed' ? `
              <button class="w-full bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors" onclick="kitchenUpdateStatus('${o.order_id}', 'Preparing')">
                <i class="fa-solid fa-fire-burner"></i> Start Cooking
              </button>
            ` : ''}
            ${o.order_status === 'Preparing' ? `
              <button class="w-full bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors" onclick="kitchenUpdateStatus('${o.order_id}', 'Ready')">
                <i class="fa-solid fa-bell"></i> Mark Order Ready
              </button>
            ` : ''}
            ${o.order_status === 'Ready' ? `
              <div class="w-full text-center py-2 text-xs text-emerald-400 font-semibold bg-emerald-950/40 border border-emerald-800/50 rounded-xl">
                <i class="fa-solid fa-circle-check mr-1"></i> Awaiting Rider Pickup
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div class="col-span-full text-center text-rose-400 py-6 text-xs">Error loading Kitchen queue.</div>';
  }
}

async function kitchenUpdateStatus(orderId, status) {
  try {
    const res = await API.put(`/api/admin/orders/${orderId}/status`, { order_status: status });
    if (res && res.success) {
      Utils.showToast(`Order ${orderId} is now ${status}!`, 'success');
      loadKitchenKDS();
    }
  } catch (err) {
    Utils.showToast('Failed to update status', 'error');
  }
}

window.loadKitchenKDS = loadKitchenKDS;
window.kitchenUpdateStatus = kitchenUpdateStatus;
