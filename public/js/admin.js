/* ==========================================================================
   FEASTFLOW SUPER ADMIN DASHBOARD CONTROLLER
   ========================================================================== */

let adminSocket = null;
let adminLiveMap = null;
let mapRiderMarkers = {};
let allRidersCache = [];

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('overview-tab')) {
    initAdminSocket();
  }
});

function initAdminSocket() {
  try {
    if (typeof io !== 'undefined') {
      adminSocket = io();
      adminSocket.on('order:created', (newOrder) => {
        Utils.showToast(`🔔 New Order #${newOrder.order_id} Received (${Utils.formatCurrency(newOrder.total_amount)})`, 'info');
        loadAdminAnalytics();
        if (document.getElementById('orders-tab')?.classList.contains('active')) {
          loadAdminOrders();
        }
      });

      adminSocket.on('order:updated', (order) => {
        if (document.getElementById('orders-tab')?.classList.contains('active')) {
          loadAdminOrders();
        }
      });

      adminSocket.on('rider:location', (data) => {
        updateMapRiderLocation(data.rider_id, data.lat, data.lng);
      });
    }
  } catch (err) {
    console.warn('Admin Socket error:', err);
  }
}

/**
 * Tab Navigation Switcher
 */
function switchAdminTab(tabId) {
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.sidebar-item').forEach(b => {
    b.classList.remove('bg-red-800', 'text-white', 'font-bold');
    b.classList.add('text-slate-300', 'hover:bg-slate-800');
  });

  const activeTab = document.getElementById(tabId);
  if (activeTab) activeTab.classList.remove('hidden');

  // Highlight button
  const activeBtn = document.querySelector(`button[onclick="switchAdminTab('${tabId}')"]`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-300', 'hover:bg-slate-800');
    activeBtn.classList.add('bg-red-800', 'text-white', 'font-bold');
  }

  // Trigger lazy data loading
  if (tabId === 'overview-tab') loadAdminAnalytics();
  else if (tabId === 'orders-tab') loadAdminOrders();
  else if (tabId === 'kitchen-tab') loadAdminKitchenKDS();
  else if (tabId === 'menu-tab') loadAdminMenu();
  else if (tabId === 'crm-tab') loadAdminCRM();
  else if (tabId === 'payments-tab') loadAdminPayments();
  else if (tabId === 'branches-tab') loadAdminBranches();
  else if (tabId === 'riders-tab') loadAdminRiders();
  else if (tabId === 'tracking-tab') setTimeout(loadAdminLiveMap, 200);
  else if (tabId === 'reviews-tab') loadAdminReviews();
  else if (tabId === 'whatsapp-inbox-tab') loadAdminWhatsAppInbox();
  else if (tabId === 'settings-tab') loadAdminSettings();
  else if (tabId === 'audit-tab') loadAdminAuditLogs();
}

/**
 * 1. Analytics & KPI Overview
 */
async function loadAdminAnalytics() {
  try {
    const data = await API.get('/api/admin/analytics');
    if (!data || !data.success) return;

    const m = data.metrics || {};
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    setTxt('kpi-today-orders', m.today_orders_count || 0);
    setTxt('kpi-today-revenue', Utils.formatCurrency(m.today_revenue || 0));
    setTxt('kpi-pending-orders', m.pending_orders_count || 0);
    setTxt('kpi-completed-orders', m.completed_orders_count || 0);
    setTxt('kpi-total-customers', m.total_customers || 0);
    setTxt('kpi-avg-rating', `${m.average_rating || 5.0} ⭐`);
    setTxt('admin-pending-badge', m.pending_orders_count || 0);

    // Best Sellers List
    const bestSellersEl = document.getElementById('best-sellers-list');
    if (bestSellersEl) {
      if (!data.best_sellers || data.best_sellers.length === 0) {
        bestSellersEl.innerHTML = '<p class="text-xs text-slate-400">No sales recorded yet.</p>';
      } else {
        bestSellersEl.innerHTML = data.best_sellers.map(item => `
          <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-xs">
            <span class="font-medium text-slate-700">🍕 ${item.name}</span>
            <span class="font-bold bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full">${item.count} Sold</span>
          </div>
        `).join('');
      }
    }

    // Customer Segmentation
    const segEl = document.getElementById('customer-segment-bars');
    if (segEl && data.customer_segmentation) {
      const seg = data.customer_segmentation;
      const total = (seg.vip || 0) + (seg.regular || 0) + (seg.new || 0) || 1;
      segEl.innerHTML = `
        <div class="space-y-2 text-xs">
          <div>
            <div class="flex justify-between mb-1"><span>VIP Customers (${seg.vip})</span><span>${Math.round((seg.vip/total)*100)}%</span></div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div class="bg-purple-600 h-full" style="width:${(seg.vip/total)*100}%"></div></div>
          </div>
          <div>
            <div class="flex justify-between mb-1"><span>Regular (${seg.regular})</span><span>${Math.round((seg.regular/total)*100)}%</span></div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div class="bg-blue-600 h-full" style="width:${(seg.regular/total)*100}%"></div></div>
          </div>
          <div>
            <div class="flex justify-between mb-1"><span>New Customers (${seg.new})</span><span>${Math.round((seg.new/total)*100)}%</span></div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div class="bg-emerald-600 h-full" style="width:${(seg.new/total)*100}%"></div></div>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error('Analytics load error:', err);
  }
}

/**
 * 2. Orders Management
 */
async function loadAdminOrders() {
  const tbody = document.getElementById('admin-orders-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400 text-xs"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading Orders...</td></tr>';

  try {
    const [ordersData, ridersData] = await Promise.all([
      API.get('/api/admin/orders'),
      API.get('/api/admin/riders')
    ]);

    if (!ordersData || !ordersData.orders) return;
    const orders = ordersData.orders;
    allRidersCache = ridersData?.riders || [];

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400 text-xs">No orders recorded in system.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const itemsText = (o.items || []).map(i => `${i.quantity}x ${i.name} (${i.size})`).join(', ');
      return `
        <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition-colors text-xs">
          <td class="p-3 font-bold text-slate-900">${o.order_id}</td>
          <td class="p-3">
            <div class="font-semibold text-slate-800">${o.customer_name}</div>
            <div class="text-[10px] text-slate-400">${o.customer_phone}</div>
          </td>
          <td class="p-3 text-slate-600">${o.branch_name || 'DHA'}</td>
          <td class="p-3 max-w-xs truncate" title="${itemsText}">${itemsText}</td>
          <td class="p-3 font-bold text-slate-900">${Utils.formatCurrency(o.total_amount)}</td>
          <td class="p-3">${o.payment_status === 'Paid' ? '<span class="text-emerald-700 font-bold">Paid</span>' : '<span class="text-amber-700 font-semibold">Pending</span>'}</td>
          <td class="p-3">${Utils.getStatusBadge(o.order_status)}</td>
          <td class="p-3">
            <select class="bg-white border border-slate-200 rounded px-2 py-1 text-[11px]" onchange="assignOrderRider('${o.order_id}', this.value)">
              <option value="">${o.rider_name || 'Assign Rider...'}</option>
              ${allRidersCache.map(r => `<option value="${r.rider_id}" ${o.rider_id === r.rider_id ? 'selected' : ''}>${r.name} (${r.status})</option>`).join('')}
            </select>
          </td>
          <td class="p-3">
            <select class="bg-white border border-slate-200 rounded px-2 py-1 text-[11px] font-medium" onchange="updateOrderStatus('${o.order_id}', this.value)">
              <option value="Received" ${o.order_status === 'Received' ? 'selected' : ''}>Received</option>
              <option value="Confirmed" ${o.order_status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="Preparing" ${o.order_status === 'Preparing' ? 'selected' : ''}>Preparing</option>
              <option value="Ready" ${o.order_status === 'Ready' ? 'selected' : ''}>Ready</option>
              <option value="Out For Delivery" ${o.order_status === 'Out For Delivery' ? 'selected' : ''}>Out For Delivery</option>
              <option value="Delivered" ${o.order_status === 'Delivered' ? 'selected' : ''}>Delivered</option>
              <option value="Cancelled" ${o.order_status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-rose-500 text-xs">Failed to load orders.</td></tr>';
  }
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await API.put(`/api/admin/orders/${orderId}/status`, { order_status: newStatus });
    if (res && res.success) {
      Utils.showToast(`Order ${orderId} updated to ${newStatus}`, 'success');
      loadAdminAnalytics();
    }
  } catch (err) {
    Utils.showToast('Failed to update status', 'error');
  }
}

async function assignOrderRider(orderId, riderId) {
  if (!riderId) return;
  try {
    const res = await API.put(`/api/admin/orders/${orderId}/status`, { rider_id: riderId });
    if (res && res.success) {
      Utils.showToast(`Rider assigned to ${orderId}`, 'success');
      loadAdminOrders();
    }
  } catch (err) {
    Utils.showToast('Failed to assign rider', 'error');
  }
}

/**
 * 3. Kitchen KDS inside Admin
 */
async function loadAdminKitchenKDS() {
  const container = document.getElementById('kitchen-kds-grid');
  if (!container) return;

  container.innerHTML = '<div class="col-span-full text-center text-slate-400 py-8 text-xs">Loading active queue...</div>';

  try {
    const data = await API.get('/api/admin/kitchen/orders');
    const orders = data.orders || [];

    if (orders.length === 0) {
      container.innerHTML = '<div class="col-span-full p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-200 text-xs">No pending kitchen orders right now.</div>';
      return;
    }

    container.innerHTML = orders.map(o => `
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="font-extrabold text-sm text-slate-900">${o.order_id}</span>
            ${Utils.getStatusBadge(o.order_status)}
          </div>
          <div class="text-xs text-slate-500 mb-3">${o.customer_name} • ${Utils.formatDateTime(o.created_at)}</div>
          <div class="space-y-1.5 border-t border-slate-100 pt-2 mb-3">
            ${(o.items || []).map(i => `
              <div class="text-xs text-slate-800 font-medium">
                <span class="font-bold text-red-900">${i.quantity}x</span> ${i.name} <span class="text-slate-500">(${i.size})</span>
                ${i.extras && i.extras.length > 0 ? `<div class="text-[10px] text-slate-400 pl-3">• ${i.extras.join(', ')}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="flex gap-2 pt-2 border-t border-slate-100">
          ${o.order_status === 'Received' ? `<button class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-1.5 rounded-lg" onclick="updateOrderStatus('${o.order_id}', 'Confirmed')">Confirm</button>` : ''}
          ${o.order_status === 'Confirmed' ? `<button class="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-1.5 rounded-lg" onclick="updateOrderStatus('${o.order_id}', 'Preparing')">Start Cooking</button>` : ''}
          ${o.order_status === 'Preparing' ? `<button class="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1.5 rounded-lg" onclick="updateOrderStatus('${o.order_id}', 'Ready')">Mark Ready</button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="col-span-full text-center text-rose-500 py-4 text-xs">Error loading KDS queue.</div>';
  }
}

/**
 * 4. Menu Item Manager
 */
async function loadAdminMenu() {
  const container = document.getElementById('admin-menu-grid');
  if (!container) return;

  container.innerHTML = '<div class="col-span-full text-center text-slate-400 py-8 text-xs">Loading menu items...</div>';

  try {
    const data = await API.get('/api/admin/menu');
    const items = data.items || [];

    if (items.length === 0) {
      container.innerHTML = '<div class="col-span-full p-8 text-center text-slate-400 bg-white rounded-xl border text-xs">No menu items found.</div>';
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs flex flex-col justify-between">
        <img src="${item.image}" alt="${item.name}" class="w-full h-32 object-cover">
        <div class="p-3.5 flex flex-col flex-1 justify-between">
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-sm text-slate-900">${item.name}</span>
              <span class="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">${item.category}</span>
            </div>
            <p class="text-xs text-slate-500 line-clamp-2 mb-2">${item.description}</p>
          </div>
          <div class="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
            <span class="font-extrabold text-sm text-emerald-800">${Utils.formatCurrency(item.price)}</span>
            <button class="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold px-2.5 py-1 rounded transition-colors" onclick="deleteMenuItem('${item._id}')">
              <i class="fa-solid fa-trash-can"></i> Archive
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="col-span-full text-center text-rose-500 py-4 text-xs">Failed to load menu.</div>';
  }
}

function openAddMenuItemModal() {
  Utils.openModal('add-menu-item-modal');
}

async function saveNewMenuItem(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('new-item-name')?.value.trim();
  const category = document.getElementById('new-item-cat')?.value;
  const price = Number(document.getElementById('new-item-price')?.value);
  const image = document.getElementById('new-item-image')?.value.trim();
  const description = document.getElementById('new-item-desc')?.value.trim();

  if (!name || !price) return Utils.showToast('Name and price required', 'warning');

  try {
    const res = await API.post('/api/admin/menu/item', { name, category, price, image, description });
    if (res && res.success) {
      Utils.showToast('Menu item added successfully!', 'success');
      Utils.closeModal('add-menu-item-modal');
      loadAdminMenu();
    }
  } catch (err) {
    Utils.showToast('Failed to add item', 'error');
  }
}

async function deleteMenuItem(id) {
  if (!confirm('Archive this menu item?')) return;
  try {
    const res = await API.delete(`/api/admin/menu/item/${id}`);
    if (res && res.success) {
      Utils.showToast('Item archived', 'info');
      loadAdminMenu();
    }
  } catch (err) {
    Utils.showToast('Delete failed', 'error');
  }
}

/**
 * 5. Customer CRM
 */
async function loadAdminCRM() {
  const tbody = document.getElementById('admin-crm-table-body');
  if (!tbody) return;

  try {
    const data = await API.get('/api/admin/customers');
    const customers = data.customers || [];

    tbody.innerHTML = customers.map(c => `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 text-xs">
        <td class="p-3 font-bold text-slate-800">${c.customer_id}</td>
        <td class="p-3 font-medium">${c.name}<br><span class="text-[10px] text-slate-400">${c.phone}</span></td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">${c.customer_level}</span></td>
        <td class="p-3">${c.completed_orders || 0}</td>
        <td class="p-3 font-semibold text-emerald-800">${Utils.formatCurrency(c.total_spending || 0)}</td>
        <td class="p-3 font-bold text-amber-600">${c.loyalty_points || 0} pts</td>
        <td class="p-3 text-slate-500">${(c.favorite_items || []).join(', ') || 'N/A'}</td>
        <td class="p-3">
          <button class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded text-[11px]" onclick="promptUpdateCustomerPoints('${c.customer_id}', ${c.loyalty_points})">
            Edit Points
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-rose-500 text-xs">Failed to load CRM.</td></tr>';
  }
}

async function promptUpdateCustomerPoints(customerId, currentPoints) {
  const newPoints = prompt(`Update loyalty points for ${customerId}:`, currentPoints);
  if (newPoints === null || isNaN(newPoints)) return;

  try {
    const res = await API.put(`/api/admin/customers/${customerId}/points`, { points: Number(newPoints) });
    if (res && res.success) {
      Utils.showToast('Points updated successfully', 'success');
      loadAdminCRM();
    }
  } catch (err) {
    Utils.showToast('Failed to update points', 'error');
  }
}

/**
 * 6. Payment Ledger
 */
async function loadAdminPayments() {
  const tbody = document.getElementById('admin-payments-table-body');
  if (!tbody) return;

  try {
    const data = await API.get('/api/admin/payments');
    const payments = data.payments || [];

    tbody.innerHTML = payments.map(p => `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 text-xs">
        <td class="p-3 font-bold text-slate-700">${p.transaction_id}</td>
        <td class="p-3">${p.order_id}</td>
        <td class="p-3 font-medium">${p.customer_name}</td>
        <td class="p-3 font-bold text-emerald-800">${Utils.formatCurrency(p.amount)}</td>
        <td class="p-3">${p.method}</td>
        <td class="p-3">${p.status === 'Paid' ? '<span class="text-emerald-700 font-bold">Paid</span>' : '<span class="text-amber-700 font-semibold">Pending</span>'}</td>
        <td class="p-3 text-slate-400">${Utils.formatDateTime(p.date)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-rose-500 text-xs">Error loading ledger.</td></tr>';
  }
}

/**
 * 7. Branch Management
 */
async function loadAdminBranches() {
  const container = document.getElementById('admin-branches-grid');
  if (!container) return;

  try {
    const data = await API.get('/api/admin/branches');
    const branches = data.branches || [];

    container.innerHTML = branches.map(b => `
      <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-bold text-slate-900 text-sm">${b.name}</h4>
          <span class="text-[10px] font-bold bg-emerald-50 text-emerald-700 border px-1.5 py-0.5 rounded">${b.branch_id}</span>
        </div>
        <p class="text-xs text-slate-600 mb-1"><i class="fa-solid fa-location-dot text-red-700 mr-1"></i> ${b.address}</p>
        <p class="text-xs text-slate-500 mb-1"><i class="fa-solid fa-clock text-amber-600 mr-1"></i> ${b.opening_hours}</p>
        <p class="text-xs text-slate-500"><i class="fa-solid fa-phone text-blue-600 mr-1"></i> ${b.phone}</p>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="col-span-full text-center text-rose-500 py-4 text-xs">Error loading branches.</div>';
  }
}

function openAddBranchModal() {
  Utils.openModal('add-branch-modal');
}

async function saveNewBranch(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('new-branch-name')?.value.trim();
  const address = document.getElementById('new-branch-address')?.value.trim();
  const phone = document.getElementById('new-branch-phone')?.value.trim();
  const opening_hours = document.getElementById('new-branch-hours')?.value.trim();

  if (!name || !address || !phone) return Utils.showToast('Please fill all branch fields', 'warning');

  try {
    const res = await API.post('/api/admin/branches', { name, address, phone, opening_hours });
    if (res && res.success) {
      Utils.showToast('Branch created!', 'success');
      Utils.closeModal('add-branch-modal');
      loadAdminBranches();
    }
  } catch (err) {
    Utils.showToast('Failed to add branch', 'error');
  }
}

/**
 * 8. Riders Management
 */
async function loadAdminRiders() {
  const tbody = document.getElementById('admin-riders-table-body');
  if (!tbody) return;

  try {
    const data = await API.get('/api/admin/riders');
    const riders = data.riders || [];

    tbody.innerHTML = riders.map(r => `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 text-xs">
        <td class="p-3 font-bold text-slate-800">${r.rider_id}</td>
        <td class="p-3 font-medium">${r.name}</td>
        <td class="p-3 text-slate-500">${r.phone}</td>
        <td class="p-3 text-slate-600">${r.vehicle_number}</td>
        <td class="p-3">${Utils.getStatusBadge(r.status)}</td>
        <td class="p-3 font-semibold text-slate-700">${r.assigned_order_id || 'None'}</td>
        <td class="p-3 font-bold text-emerald-800">${r.total_deliveries || 0}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-rose-500 text-xs">Error loading riders.</td></tr>';
  }
}

function openAddRiderModal() {
  Utils.openModal('add-rider-modal');
}

async function saveNewRider(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('new-rider-name')?.value.trim();
  const phone = document.getElementById('new-rider-phone')?.value.trim();
  const vehicle_number = document.getElementById('new-rider-vehicle')?.value.trim();

  if (!name || !phone) return Utils.showToast('Rider name and phone required', 'warning');

  try {
    const res = await API.post('/api/admin/riders', { name, phone, vehicle_number });
    if (res && res.success) {
      Utils.showToast(`Rider added! Login: ${res.email}`, 'success');
      Utils.closeModal('add-rider-modal');
      loadAdminRiders();
    }
  } catch (err) {
    Utils.showToast('Failed to add rider', 'error');
  }
}

/**
 * 9. Live Map View
 */
async function loadAdminLiveMap() {
  const container = document.getElementById('admin-live-map');
  if (!container || typeof L === 'undefined') return;

  if (adminLiveMap) adminLiveMap.remove();

  adminLiveMap = L.map('admin-live-map').setView([31.4704, 74.4101], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(adminLiveMap);

  try {
    const [branchesData, ridersData] = await Promise.all([
      API.get('/api/admin/branches'),
      API.get('/api/admin/riders')
    ]);

    // Plot branches
    (branchesData?.branches || []).forEach(b => {
      const bIcon = L.divIcon({ html: '<span class="text-2xl">📍</span>', className: 'map-icon', iconSize: [30, 30] });
      L.marker([b.lat || 31.4704, b.lng || 74.4101], { icon: bIcon })
        .addTo(adminLiveMap)
        .bindPopup(`<strong>${b.name}</strong><br>${b.address}`);
    });

    // Plot riders
    (ridersData?.riders || []).forEach(r => {
      if (r.current_location) {
        const rIcon = L.divIcon({ html: '<span class="text-2xl">🚴</span>', className: 'map-icon', iconSize: [30, 30] });
        const marker = L.marker([r.current_location.lat, r.current_location.lng], { icon: rIcon })
          .addTo(adminLiveMap)
          .bindPopup(`<strong>${r.name} (${r.rider_id})</strong><br>Status: ${r.status}`);
        mapRiderMarkers[r.rider_id] = marker;
      }
    });
  } catch (err) {
    console.warn('Map data load error:', err);
  }
}

function updateMapRiderLocation(riderId, lat, lng) {
  if (mapRiderMarkers[riderId]) {
    mapRiderMarkers[riderId].setLatLng([lat, lng]);
  }
}

/**
 * 10. Reviews Viewer
 */
async function loadAdminReviews() {
  const container = document.getElementById('admin-reviews-list');
  if (!container) return;

  try {
    const data = await API.get('/api/admin/reviews');
    const reviews = data.reviews || [];

    if (reviews.length === 0) {
      container.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs">No customer reviews yet.</div>';
      return;
    }

    container.innerHTML = reviews.map(r => `
      <div class="bg-white rounded-xl border border-slate-200 p-3.5 mb-2 shadow-xs">
        <div class="flex items-center justify-between mb-1">
          <span class="font-bold text-xs text-slate-800">${r.customer_name} • Order ${r.order_id}</span>
          <span class="text-xs text-amber-500 font-bold">${'⭐'.repeat(r.rating)}</span>
        </div>
        <p class="text-xs text-slate-600 italic mb-2">"${r.feedback || 'No written feedback'}"</p>
        <div class="flex gap-4 text-[10px] text-slate-400">
          <span>Quality: <strong>${r.food_quality}</strong></span>
          <span>Speed: <strong>${r.delivery_speed}</strong></span>
          <span>Points: <strong>+${r.points_earned}</strong></span>
          <span>Date: <strong>${Utils.formatDateTime(r.created_at)}</strong></span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="text-center text-rose-500 py-4 text-xs">Failed to load reviews.</div>';
  }
}

/**
 * 11. WhatsApp Live Inbox
 */
async function loadAdminWhatsAppInbox() {
  const container = document.getElementById('admin-wa-inbox-container');
  if (!container) return;

  try {
    const data = await API.get('/api/admin/whatsapp/inbox');
    const sessions = data.sessions || [];
    const messages = data.recent_messages || [];

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="border-r border-slate-100 pr-2">
          <h4 class="font-bold text-xs text-slate-800 mb-2">Active Conversations</h4>
          <div class="space-y-1.5">
            ${sessions.map(s => `
              <div class="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer text-xs" onclick="selectInboxSession('${s.phone}')">
                <div class="font-bold text-slate-900">${s.name || 'Customer'}</div>
                <div class="text-[10px] text-slate-500">${s.phone} • Last: ${Utils.formatDateTime(s.last_interaction)}</div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="md:col-span-2">
          <h4 class="font-bold text-xs text-slate-800 mb-2">Recent Message Feed</h4>
          <div class="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            ${messages.slice(0, 15).map(m => `
              <div class="p-2 rounded text-xs ${m.direction === 'INBOUND' ? 'bg-slate-50 text-slate-800' : 'bg-emerald-50 text-emerald-900 font-medium'}">
                <div class="text-[10px] text-slate-400 mb-0.5">${m.direction} • ${m.phone} • ${Utils.formatDateTime(m.timestamp)}</div>
                <div>${m.body}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<div class="text-center text-rose-500 py-4 text-xs">Error loading WhatsApp inbox.</div>';
  }
}

/**
 * 12. CSV Export
 */
function exportCSVReport() {
  const token = API.getToken();
  window.open(`/api/admin/reports/export?token=${token}`, '_blank');
}

/**
 * 13. System Settings
 */
async function loadAdminSettings() {
  try {
    const data = await API.get('/api/admin/settings');
    if (data && data.settings) {
      const s = data.settings;
      if (document.getElementById('set-name')) document.getElementById('set-name').value = s.restaurant_name || '';
      if (document.getElementById('set-tax')) document.getElementById('set-tax').value = s.tax_rate_percent || 16;
      if (document.getElementById('set-delivery-fee')) document.getElementById('set-delivery-fee').value = s.default_delivery_fee || 150;
    }
  } catch (err) {
    console.warn('Settings load error:', err);
  }
}

async function saveSystemSettings(e) {
  if (e) e.preventDefault();
  const restaurant_name = document.getElementById('set-name')?.value.trim();
  const tax_rate_percent = Number(document.getElementById('set-tax')?.value);
  const default_delivery_fee = Number(document.getElementById('set-delivery-fee')?.value);

  try {
    const res = await API.put('/api/admin/settings', { restaurant_name, tax_rate_percent, default_delivery_fee });
    if (res && res.success) {
      Utils.showToast('System settings saved successfully!', 'success');
    }
  } catch (err) {
    Utils.showToast('Failed to save settings', 'error');
  }
}

/**
 * 14. Audit Logs
 */
async function loadAdminAuditLogs() {
  const tbody = document.getElementById('admin-audit-table-body');
  if (!tbody) return;

  try {
    const data = await API.get('/api/admin/audit-logs');
    const logs = data.logs || [];

    tbody.innerHTML = logs.map(l => `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 text-xs">
        <td class="p-3 text-slate-400">${Utils.formatDateTime(l.timestamp)}</td>
        <td class="p-3 font-bold text-slate-800">${l.action}</td>
        <td class="p-3 font-medium">${l.performed_by}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">${l.role}</span></td>
        <td class="p-3 text-slate-500">${l.module}</td>
        <td class="p-3 text-slate-600">${l.details}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-rose-500 text-xs">Error loading audit logs.</td></tr>';
  }
}

// Window bindings
window.switchAdminTab = switchAdminTab;
window.loadAdminAnalytics = loadAdminAnalytics;
window.loadAdminOrders = loadAdminOrders;
window.updateOrderStatus = updateOrderStatus;
window.assignOrderRider = assignOrderRider;
window.loadAdminMenu = loadAdminMenu;
window.openAddMenuItemModal = openAddMenuItemModal;
window.saveNewMenuItem = saveNewMenuItem;
window.deleteMenuItem = deleteMenuItem;
window.loadAdminCRM = loadAdminCRM;
window.promptUpdateCustomerPoints = promptUpdateCustomerPoints;
window.loadAdminBranches = loadAdminBranches;
window.openAddBranchModal = openAddBranchModal;
window.saveNewBranch = saveNewBranch;
window.loadAdminRiders = loadAdminRiders;
window.openAddRiderModal = openAddRiderModal;
window.saveNewRider = saveNewRider;
window.loadAdminLiveMap = loadAdminLiveMap;
window.exportCSVReport = exportCSVReport;
window.saveSystemSettings = saveSystemSettings;
