/* ==========================================================================
   FEASTFLOW DELIVERY DISPATCH MANAGER CONTROLLER
   ========================================================================== */

let deliveryLiveMap = null;
let deliveryRiderMarkers = {};

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('delivery-map-tab') || document.getElementById('map-tab')) {
    initDeliverySocket();
  }
});

function initDeliverySocket() {
  try {
    if (typeof io !== 'undefined') {
      const socket = io();
      socket.on('rider:location', (data) => {
        if (deliveryRiderMarkers[data.rider_id]) {
          deliveryRiderMarkers[data.rider_id].setLatLng([data.lat, data.lng]);
        }
      });
      socket.on('order:updated', () => {
        loadAdminRiders();
      });
    }
  } catch (err) {
    console.warn('Delivery socket error:', err);
  }
}

function switchDeliveryTab(tabId) {
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.sidebar-item').forEach(b => {
    b.classList.remove('bg-blue-700', 'text-white', 'font-bold');
    b.classList.add('text-slate-300', 'hover:bg-slate-800');
  });

  const activeTab = document.getElementById(tabId);
  if (activeTab) activeTab.classList.remove('hidden');

  const activeBtn = document.querySelector(`button[onclick="switchDeliveryTab('${tabId}')"]`);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-300', 'hover:bg-slate-800');
    activeBtn.classList.add('bg-blue-700', 'text-white', 'font-bold');
  }

  if (tabId === 'riders-tab') loadAdminRiders();
  if (tabId === 'map-tab') setTimeout(loadLiveMap, 200);
}

async function loadLiveMap() {
  const container = document.getElementById('admin-live-map');
  if (!container || typeof L === 'undefined') return;

  if (deliveryLiveMap) deliveryLiveMap.remove();

  deliveryLiveMap = L.map('admin-live-map').setView([31.4704, 74.4101], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(deliveryLiveMap);

  try {
    const [branchesData, ridersData] = await Promise.all([
      API.get('/api/admin/branches'),
      API.get('/api/admin/riders')
    ]);

    (branchesData?.branches || []).forEach(b => {
      const bIcon = L.divIcon({ html: '<span class="text-2xl">📍</span>', className: 'map-icon', iconSize: [30, 30] });
      L.marker([b.lat || 31.4704, b.lng || 74.4101], { icon: bIcon })
        .addTo(deliveryLiveMap)
        .bindPopup(`<strong>${b.name}</strong><br>${b.address}`);
    });

    (ridersData?.riders || []).forEach(r => {
      if (r.current_location) {
        const rIcon = L.divIcon({ html: '<span class="text-2xl">🚴</span>', className: 'map-icon', iconSize: [30, 30] });
        const marker = L.marker([r.current_location.lat, r.current_location.lng], { icon: rIcon })
          .addTo(deliveryLiveMap)
          .bindPopup(`<strong>${r.name} (${r.rider_id})</strong><br>Status: ${r.status}`);
        deliveryRiderMarkers[r.rider_id] = marker;
      }
    });
  } catch (err) {
    console.warn('Map error:', err);
  }
}

window.switchDeliveryTab = switchDeliveryTab;
window.loadLiveMap = loadLiveMap;
