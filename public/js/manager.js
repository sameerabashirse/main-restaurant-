/* ==========================================================================
   FEASTFLOW RESTAURANT MANAGER DASHBOARD CONTROLLER
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('manager-orders-tab') || document.getElementById('orders-tab')) {
    initManagerSocket();
  }
});

function initManagerSocket() {
  try {
    if (typeof io !== 'undefined') {
      const socket = io();
      socket.on('order:created', (order) => {
        Utils.showToast(`🔔 New Order #${order.order_id} Received`, 'info');
        loadAdminOrders();
      });
      socket.on('order:updated', () => {
        loadAdminOrders();
      });
    }
  } catch (err) {
    console.warn('Manager socket error:', err);
  }
}

function switchManagerTab(tabId) {
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.sidebar-item').forEach(b => {
    b.classList.remove('bg-red-800', 'text-white', 'font-bold');
    b.classList.add('text-slate-300', 'hover:bg-slate-800');
  });

  const activeTab = document.getElementById(tabId);
  if (activeTab) activeTab.classList.remove('hidden');

  const activeBtn = document.querySelector(`button[onclick="switchManagerTab('${tabId}')"]`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-300', 'hover:bg-slate-800');
    activeBtn.classList.add('bg-red-800', 'text-white', 'font-bold');
  }

  if (tabId === 'orders-tab') loadAdminOrders();
  if (tabId === 'menu-tab') loadAdminMenu();
  if (tabId === 'crm-tab') loadAdminCRM();
}

window.switchManagerTab = switchManagerTab;
