/* ==========================================================================
   FEASTFLOW CUSTOMER WHATSAPP CHAT ENGINE
   ========================================================================== */

let socket = null;
let currentCustomer = null;
let currentCart = [];
let selectedBranch = { branch_id: 'BR-DHA', name: '📍 FeastFlow DHA Branch' };
let currentWACategory = null;
let isWizSubmitting = false;
let confirmedWAOrder = null;
let isWAModifyingOrder = false;
let isWASubmittingModify = false;

let currentWizItem = null;
let wizSelectedFlavor = '';
let wizSelectedSize = { name: 'Medium', price: 1199 };
let wizSelectedQty = 1;
let wizSelectedCrust = { name: 'Classic', price: 0 };
let wizSelectedSides = [];
let wizSelectedExtras = [];

let trackingMap = null;
let riderMarker = null;
let customerMarker = null;
let branchMarker = null;
let activeTrackOrderId = null;
let selectedPaymentMethod = 'Cash on Delivery';

// Initialize on customer page
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('wa-chat-body')) {
    initCustomerSocketConnection();
    initCustomerSession();
  }
});

function initCustomerSocketConnection() {
  try {
    if (typeof io !== 'undefined') {
      socket = io();
      socket.on('connect', () => {
        console.log('🔌 Customer WebSocket connected:', socket.id);
      });

      socket.on('whatsapp:notification', (data) => {
        if (!currentCustomer || data.phone === currentCustomer.phone) {
          appendWhatsAppInboundMsg(data.body);
        }
      });

      socket.on('rider:location', (data) => {
        if (activeTrackOrderId && (data.order_id === activeTrackOrderId || data.rider_id)) {
          updateRiderMapPosition(data.lat, data.lng);
        }
      });

      socket.on('order:updated', (order) => {
        if (currentCustomer && order.customer_id === currentCustomer.customer_id) {
          const trackBadge = document.getElementById('track-order-status');
          if (trackBadge && activeTrackOrderId === order.order_id) {
            trackBadge.innerText = order.order_status;
          }
        }
      });
    }
  } catch (err) {
    console.warn('Socket connection error:', err);
  }
}

function getFormattedTime() {
  const now = new Date();
  let hours = now.getHours();
  let minutes = now.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  minutes = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${minutes} ${ampm}`;
}

function appendWhatsAppInboundMsg(bodyHtml, buttons = []) {
  const chatBody = document.getElementById('wa-chat-body');
  if (!chatBody) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'flex flex-col items-start max-w-[88%] self-start animate-fade-in my-1';

  let buttonsHtml = '';
  if (buttons && buttons.length > 0) {
    buttonsHtml = '<div class="flex flex-col gap-1.5 mt-2.5 w-full">';
    buttons.forEach(btn => {
      buttonsHtml += `
        <button class="w-full bg-white text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 border border-slate-200/90 py-2 px-3 rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5" onclick="handleWAButtonClick('${btn.id}', '${btn.title.replace(/'/g, "\\'")}')">
          ${btn.title}
        </button>
      `;
    });
    buttonsHtml += '</div>';
  }

  msgDiv.innerHTML = `
    <div class="bg-white text-slate-800 p-3.5 rounded-2xl rounded-tl-xs shadow-sm text-xs sm:text-sm leading-relaxed border border-slate-200/60 max-w-full">
      ${bodyHtml}
      ${buttonsHtml}
      <div class="text-[10px] text-slate-400 mt-1.5 text-right font-medium">${getFormattedTime()}</div>
    </div>
  `;

  chatBody.appendChild(msgDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function appendWhatsAppOutboundMsg(text) {
  const chatBody = document.getElementById('wa-chat-body');
  if (!chatBody) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'flex flex-col items-end max-w-[88%] self-end animate-fade-in my-1';
  msgDiv.innerHTML = `
    <div class="bg-[#DCF8C6] text-slate-900 p-3.5 rounded-2xl rounded-tr-xs shadow-sm text-xs sm:text-sm leading-relaxed border border-emerald-200/50">
      <div>${text}</div>
      <div class="text-[10px] text-emerald-800/80 mt-1 flex items-center justify-end gap-1 font-medium">
        ${getFormattedTime()} <span class="text-sky-500 font-bold">✓✓</span>
      </div>
    </div>
  `;

  chatBody.appendChild(msgDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function initCustomerSession() {
  const savedPhone = localStorage.getItem('feastflow_cust_phone') || '03001234567';
  const savedName = localStorage.getItem('feastflow_cust_name') || 'Sameer';
  identifyWhatsAppCustomer(savedPhone, savedName);
}

function resetWhatsAppChat() {
  const chatBody = document.getElementById('wa-chat-body');
  if (chatBody) chatBody.innerHTML = '';
  currentCart = [];
  updateWACartBar();
  initCustomerSession();
}

function handleWAKeyPress(e) {
  if (e.key === 'Enter') submitUserWAMessage();
}

function submitUserWAMessage() {
  const input = document.getElementById('wa-input-text');
  const text = input ? input.value.trim() : '';
  if (!text) return;
  input.value = '';
  sendWhatsAppMessage(text);
}

async function sendWhatsAppMessage(text) {
  appendWhatsAppOutboundMsg(text);
  const clean = text.toLowerCase().trim();

  if (clean.includes('hi') || clean.includes('hello') || clean.includes('start') || clean.includes('menu')) {
    setTimeout(() => {
      showRestaurantInformationCard();
    }, 300);
    return;
  }

  if (clean.includes('track')) {
    setTimeout(() => {
      promptWATrackOrder();
    }, 300);
    return;
  }

  if (clean.includes('rewards') || clean.includes('points')) {
    setTimeout(() => {
      showWARewardsInfo();
    }, 300);
    return;
  }

  try {
    const phone = currentCustomer ? currentCustomer.phone : '03001234567';
    await API.post('/api/whatsapp/webhook', {
      simulated: true,
      phone,
      message: { text: { body: text } }
    });
  } catch (err) {
    console.error('Webhook error:', err);
  }
}

function showRestaurantInformationCard() {
  const infoCardHtml = `
    <div class="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 rounded-xl p-3.5 shadow-xs mb-2">
      <div class="flex items-center gap-2 font-bold text-red-900 text-sm mb-2">
        <span class="w-6 h-6 rounded-full bg-red-900 text-amber-300 flex items-center justify-center text-xs"><i class="fa-solid fa-utensils"></i></span>
        FeastFlow Restaurant
      </div>
      <div class="space-y-1 text-xs text-slate-700">
        <div class="flex items-center gap-1.5"><i class="fa-solid fa-location-dot text-red-700 w-3.5"></i> <strong>DHA Lahore Branch</strong> (Phase 5 Commercial)</div>
        <div class="flex items-center gap-1.5"><i class="fa-solid fa-clock text-amber-700 w-3.5"></i> 12:00 PM - 12:00 AM Daily</div>
        <div class="flex items-center gap-1.5"><i class="fa-solid fa-truck-fast text-emerald-700 w-3.5"></i> Fast Delivery (DHA, Gulberg, Cantt)</div>
        <div class="flex items-center gap-1.5"><i class="fa-solid fa-star text-amber-500 w-3.5"></i> 4.8 Rating (1,240 Reviews)</div>
      </div>
    </div>
  `;
  appendWhatsAppInboundMsg(infoCardHtml, [
    { id: 'btn_view_menu', title: '🍕 Explore Food Menu' },
    { id: 'btn_reorder_last', title: '🔄 Reorder Last Meal' },
    { id: 'btn_location', title: '📍 Branch Location' }
  ]);
}

async function identifyWhatsAppCustomer(phone, name) {
  try {
    const data = await API.post('/api/chat/start', { phone, name });

    if (data && data.success) {
      currentCustomer = data.customer;
      localStorage.setItem('feastflow_cust_phone', currentCustomer.phone);
      localStorage.setItem('feastflow_cust_name', currentCustomer.name);

      const statusText = document.getElementById('wa-status-text');
      if (statusText) {
        statusText.innerText = `🟢 Online • ${currentCustomer.name} (${currentCustomer.customer_level})`;
      }

      showRestaurantInformationCard();

      if (data.is_returning && data.last_order) {
        activeTrackOrderId = data.last_order.order_id;
        const customerCardHtml = `
          <div class="bg-emerald-50/80 border-l-4 border-emerald-600 rounded-r-xl p-3 shadow-xs">
            <div class="font-bold text-emerald-900 text-xs sm:text-sm">👋 Welcome Back, ${currentCustomer.name}!</div>
            <div class="text-xs text-amber-800 font-semibold mt-1">⭐ <strong>${currentCustomer.loyalty_points} Points</strong> (${currentCustomer.customer_level})</div>
            <div class="text-xs text-slate-600 mt-1">Last Order: <span class="font-semibold text-slate-800">${data.last_order.order_id}</span></div>
          </div>
        `;
        appendWhatsAppInboundMsg(customerCardHtml, [
          { id: 'btn_reorder_last', title: '🔄 Order Same Again' },
          { id: 'btn_view_menu', title: '🍕 View Full Menu' }
        ]);
      }
    }
  } catch (err) {
    console.warn('Customer identification error:', err);
  }
}

function handleWAButtonClick(buttonId, buttonTitle) {
  appendWhatsAppOutboundMsg(buttonTitle);

  if (buttonId === 'btn_modify_order' || buttonTitle.includes('Modify Order')) handleWAModifyOrder();
  else if (buttonId === 'btn_save_updated_order' || buttonTitle.includes('Save Updated Order')) saveUpdatedWAOrder();
  else if (buttonId === 'btn_cancel_modification' || buttonTitle.includes('Cancel Changes')) cancelWAOrderModification();
  else if (buttonId === 'btn_same_cat' || buttonTitle.includes('Same Category')) {
    if (currentWACategory) selectWACategory(currentWACategory);
    else showWhatsAppCategoryList();
  }
  else if (buttonId === 'btn_view_menu' || buttonTitle.includes('Menu')) showWhatsAppCategoryList();
  else if (buttonId === 'btn_location' || buttonTitle.includes('Location')) showWhatsAppLocationMessage();
  else if (buttonId === 'btn_reorder_last' || buttonTitle.includes('Same Again') || buttonTitle.includes('Reorder')) handleQuickReorderFlow();
  else if (buttonId === 'btn_checkout_now' || buttonTitle.includes('Checkout')) triggerWACheckout();
  else if (buttonId === 'btn_confirm_order_final' || buttonTitle.includes('Confirm Order') || buttonTitle.includes('Confirm & Place Order')) processWAOrderConfirmation();
  else if (buttonId === 'btn_pay_cod' || buttonTitle.includes('Cash on Delivery')) setWAPaymentMethod('Cash on Delivery');
  else if (buttonId === 'btn_pay_online' || buttonTitle.includes('Online Payment')) setWAPaymentMethod('Online Payment');
  else if (buttonId === 'btn_pay_bank' || buttonTitle.includes('Bank Transfer')) setWAPaymentMethod('Bank Transfer');
  else if (buttonId === 'btn_change_payment' || buttonTitle.includes('Change Payment') || buttonTitle.includes('Payment Method')) promptWAPaymentMethod();
  else if (buttonId === 'btn_track' || buttonId === 'btn_track_order_live' || buttonTitle.includes('Track')) promptWATrackOrder();
  else if (buttonId === 'btn_rewards' || buttonTitle.includes('Rewards')) showWARewardsInfo();
  else if (buttonId.startsWith('cat_')) selectWACategory(buttonId.replace('cat_', ''));
}

async function handleQuickReorderFlow() {
  if (!currentCustomer) return identifyWhatsAppCustomer('03001234567', 'Sameer');

  try {
    const data = await API.get(`/api/chat/reorder/${currentCustomer.customer_id}`);

    if (data && data.success && data.last_order) {
      const order = data.last_order;
      currentCart = order.items.map(i => ({
        item_id: i.item_id,
        name: i.name,
        quantity: i.quantity,
        size: i.size,
        extras: i.extras,
        unit_price: i.unit_price,
        total_price: i.total_price
      }));

      updateWACartBar();

      const itemsSummary = currentCart.map(i => `• ${i.name} (x${i.quantity}) - ${Utils.formatCurrency(i.total_price)}`).join('<br>');
      const grandTotal = currentCart.reduce((sum, i) => sum + i.total_price, 0);

      const reorderMsg = `
        <div class="font-bold text-slate-800 mb-1">🔄 Quick Reorder Summary:</div>
        <div class="text-xs text-slate-600 space-y-1 mb-2">${itemsSummary}</div>
        <div class="font-bold text-red-900 border-t border-slate-200 pt-1">Total: ${Utils.formatCurrency(grandTotal)}</div>
      `;

      appendWhatsAppInboundMsg(reorderMsg, [
        { id: 'btn_checkout_now', title: '✅ Proceed to Checkout' },
        { id: 'btn_view_menu', title: '🍕 Modify & Add More' }
      ]);
    } else {
      appendWhatsAppInboundMsg('❌ No previous order found. Explore our menu below!', [
        { id: 'btn_view_menu', title: '🍕 View Menu' }
      ]);
    }
  } catch (err) {
    appendWhatsAppInboundMsg('❌ Unable to fetch past order.');
  }
}

function showWhatsAppLocationMessage() {
  const locHtml = `
    <div class="space-y-1.5">
      <div class="font-bold text-red-900 text-sm">📍 FeastFlow DHA Branch</div>
      <div class="text-xs text-slate-700">🏠 <strong>Address:</strong> Phase 5 Commercial, DHA, Lahore</div>
      <div class="text-xs text-slate-700">🕒 <strong>Hours:</strong> 12:00 PM - 12:00 AM</div>
      <div class="text-xs text-slate-700">🚚 <strong>Delivery Coverage:</strong> DHA 1-8, Gulberg, Cantt</div>
      <div class="text-xs text-slate-700">☎️ <strong>Phone:</strong> 042-35894120</div>
    </div>
  `;
  appendWhatsAppInboundMsg(locHtml, [
    { id: 'btn_view_menu', title: '🍕 View Menu' }
  ]);
}

async function showWhatsAppCategoryList() {
  try {
    const data = await API.get('/api/chat/menu');
    if (!data || !data.categories) return;

    const listContainer = document.getElementById('wa-list-options-container');
    if (listContainer) {
      listContainer.innerHTML = data.categories.map(c => `
        <div class="flex items-center gap-3 p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors" onclick="selectWACategory('${c.name}')">
          <span class="text-2xl">${c.icon}</span>
          <div>
            <div class="font-bold text-slate-800 text-sm">${c.name}</div>
            <div class="text-xs text-slate-400">Explore fresh ${c.name} items</div>
          </div>
        </div>
      `).join('');
    }

    Utils.openModal('wa-list-modal');
  } catch (err) {
    Utils.showToast('Failed to load categories', 'error');
  }
}

async function selectWACategory(catName) {
  currentWACategory = catName;
  Utils.closeModal('wa-list-modal');
  appendWhatsAppOutboundMsg(`Category: ${catName}`);

  try {
    const data = await API.get('/api/chat/menu');
    const items = (data.menu_items || []).filter(i => i.category.toLowerCase() === catName.toLowerCase());

    if (items.length === 0) {
      appendWhatsAppInboundMsg(`No items found in ${catName}.`, [{ id: 'btn_view_menu', title: '🍕 Other Categories' }]);
      return;
    }

    let productCardsHtml = `
      <div class="font-bold text-slate-800 mb-2">📋 ${catName} Menu:</div>
      <div class="grid grid-cols-2 gap-2 mt-2">
    `;

    items.forEach(item => {
      const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');
      productCardsHtml += `
        <div class="bg-white rounded-xl border border-slate-200/80 overflow-hidden shadow-2xs flex flex-col justify-between">
          <img src="${item.image}" alt="${item.name}" class="w-full h-24 object-cover">
          <div class="p-2 flex flex-col flex-1 justify-between">
            <div>
              <div class="font-bold text-xs text-slate-800 leading-tight">${item.name}</div>
              <div class="text-[10px] text-slate-500 line-clamp-2 mt-0.5">${item.description}</div>
            </div>
            <div class="flex items-center justify-between mt-2 pt-1 border-t border-slate-100">
              <span class="font-bold text-xs text-emerald-700">${Utils.formatCurrency(item.price)}</span>
              <button class="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold px-2 py-1 transition-colors" onclick="triggerSmartCustomizerWizard('${itemJson}')">
                ➕ Add
              </button>
            </div>
          </div>
        </div>
      `;
    });
    productCardsHtml += '</div>';

    appendWhatsAppInboundMsg(productCardsHtml, [
      { id: 'btn_view_menu', title: '🍕 Other Categories' },
      { id: 'btn_checkout_now', title: '🛒 View Cart & Checkout' }
    ]);
  } catch (err) {
    appendWhatsAppInboundMsg('❌ Error loading items.');
  }
}

// Smart Food Customization Wizard
function triggerSmartCustomizerWizard(itemObjStr) {
  const item = typeof itemObjStr === 'string' ? JSON.parse(itemObjStr) : itemObjStr;
  currentWizItem = item;

  wizSelectedFlavor = item.customization && item.customization.flavours && item.customization.flavours.length > 0 ? item.customization.flavours[0] : item.name;
  wizSelectedSize = item.sizes && item.sizes.length > 0 ? item.sizes[0] : { name: 'Medium', price: item.price };
  wizSelectedQty = 1;
  wizSelectedCrust = { name: 'Classic', price: 0 };
  wizSelectedSides = [];
  wizSelectedExtras = [];

  const titleEl = document.getElementById('wiz-modal-title');
  if (titleEl) titleEl.innerText = `✨ Customize ${item.name}`;

  const modalBody = document.getElementById('wiz-modal-body');
  if (modalBody) {
    renderCustomizerWizard(item, modalBody);
  }

  Utils.openModal('smart-customizer-modal');
}

function renderCustomizerWizard(item, container) {
  const cust = item.customization || {};
  const flavours = cust.flavours || [item.name];
  const sizes = cust.sizes || item.sizes || [{ name: 'Regular', price: item.price }];
  const crusts = cust.crusts || [{ name: 'Classic', price: 0 }];
  const sides = cust.sides || [];
  const extras = cust.extras || item.extras || [];

  container.innerHTML = `
    <div class="space-y-4 max-h-[70vh] overflow-y-auto px-1">
      <!-- Flavor Selection -->
      ${flavours.length > 1 ? `
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
          <div class="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-tag text-amber-600"></i> Select Flavor</div>
          <div class="grid grid-cols-2 gap-1.5">
            ${flavours.map((f, idx) => `
              <button class="wiz-opt-btn ${idx === 0 ? 'bg-amber-100 text-amber-900 border-amber-400 font-bold' : 'bg-white text-slate-700 border-slate-200'} py-2 px-2.5 rounded-lg border text-xs text-left transition-all" onclick="wizSelectFlavor('${f}', this)">
                ${f}
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Size Selection -->
      ${sizes.length > 0 ? `
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
          <div class="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-ruler text-amber-600"></i> Choose Size</div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            ${sizes.map((s, idx) => `
              <button class="wiz-opt-btn ${idx === 0 ? 'bg-amber-100 text-amber-900 border-amber-400 font-bold' : 'bg-white text-slate-700 border-slate-200'} py-2 px-2 rounded-lg border text-xs text-center transition-all" onclick="wizSelectSize('${s.name}', ${s.price}, this)">
                <div>${s.name}</div>
                <div class="text-[10px] text-slate-500 font-normal">${Utils.formatCurrency(s.price)}</div>
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Crust Selection -->
      ${crusts.length > 1 ? `
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
          <div class="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-bread-slice text-amber-600"></i> Select Crust</div>
          <div class="grid grid-cols-2 gap-1.5">
            ${crusts.map((c, idx) => `
              <button class="wiz-opt-btn ${idx === 0 ? 'bg-amber-100 text-amber-900 border-amber-400 font-bold' : 'bg-white text-slate-700 border-slate-200'} py-2 px-2.5 rounded-lg border text-xs text-left transition-all" onclick="wizSelectCrust('${c.name}', ${c.price}, this)">
                ${c.name} ${c.price > 0 ? `(+${Utils.formatCurrency(c.price)})` : ''}
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Extras & Sides -->
      ${extras.length > 0 ? `
        <div class="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
          <div class="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-cheese text-amber-600"></i> Extra Add-ons</div>
          <div class="grid grid-cols-2 gap-1.5">
            ${extras.map(e => `
              <button class="wiz-extra-btn bg-white text-slate-700 border-slate-200 py-2 px-2.5 rounded-lg border text-xs text-left transition-all flex items-center justify-between" onclick="wizToggleExtra('${e.name}', ${e.price}, this)">
                <span>${e.name}</span>
                <span class="text-[10px] text-emerald-700 font-bold">+${Utils.formatCurrency(e.price)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Bottom Bar with Quantity and Add Button -->
      <div class="flex items-center justify-between p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 mt-4">
        <div>
          <div class="text-[10px] text-amber-900 uppercase font-semibold">Running Total</div>
          <div id="wiz-running-total-text" class="text-base font-extrabold text-red-900">${Utils.formatCurrency(item.price)}</div>
        </div>
        <button class="bg-red-800 hover:bg-red-900 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-xs transition-colors flex items-center gap-1.5" onclick="confirmWizAddToCart()">
          <i class="fa-solid fa-cart-plus"></i> Add to Order
        </button>
      </div>
    </div>
  `;

  recalculateWizTotal();
}

function wizSelectFlavor(flavor, btn) {
  const parent = btn.parentElement;
  parent.querySelectorAll('.wiz-opt-btn').forEach(b => {
    b.className = 'wiz-opt-btn bg-white text-slate-700 border-slate-200 py-2 px-2.5 rounded-lg border text-xs text-left transition-all';
  });
  btn.className = 'wiz-opt-btn bg-amber-100 text-amber-900 border-amber-400 font-bold py-2 px-2.5 rounded-lg border text-xs text-left transition-all';
  wizSelectedFlavor = flavor;
  recalculateWizTotal();
}

function wizSelectSize(name, price, btn) {
  const parent = btn.parentElement;
  parent.querySelectorAll('.wiz-opt-btn').forEach(b => {
    b.className = 'wiz-opt-btn bg-white text-slate-700 border-slate-200 py-2 px-2 rounded-lg border text-xs text-center transition-all';
  });
  btn.className = 'wiz-opt-btn bg-amber-100 text-amber-900 border-amber-400 font-bold py-2 px-2 rounded-lg border text-xs text-center transition-all';
  wizSelectedSize = { name, price };
  recalculateWizTotal();
}

function wizSelectCrust(name, price, btn) {
  const parent = btn.parentElement;
  parent.querySelectorAll('.wiz-opt-btn').forEach(b => {
    b.className = 'wiz-opt-btn bg-white text-slate-700 border-slate-200 py-2 px-2.5 rounded-lg border text-xs text-left transition-all';
  });
  btn.className = 'wiz-opt-btn bg-amber-100 text-amber-900 border-amber-400 font-bold py-2 px-2.5 rounded-lg border text-xs text-left transition-all';
  wizSelectedCrust = { name, price };
  recalculateWizTotal();
}

function wizToggleExtra(name, price, btn) {
  const idx = wizSelectedExtras.findIndex(e => e.name === name);
  if (idx > -1) {
    wizSelectedExtras.splice(idx, 1);
    btn.className = 'wiz-extra-btn bg-white text-slate-700 border-slate-200 py-2 px-2.5 rounded-lg border text-xs text-left transition-all flex items-center justify-between';
  } else {
    wizSelectedExtras.push({ name, price });
    btn.className = 'wiz-extra-btn bg-emerald-50 text-emerald-900 border-emerald-400 font-bold py-2 px-2.5 rounded-lg border text-xs text-left transition-all flex items-center justify-between';
  }
  recalculateWizTotal();
}

function recalculateWizTotal() {
  let basePrice = wizSelectedSize ? wizSelectedSize.price : (currentWizItem ? currentWizItem.price : 1199);
  let crustPrice = wizSelectedCrust ? wizSelectedCrust.price : 0;
  let extrasSum = wizSelectedExtras.reduce((sum, e) => sum + e.price, 0);

  let grandTotal = (basePrice + crustPrice + extrasSum) * wizSelectedQty;

  const totalText = document.getElementById('wiz-running-total-text');
  if (totalText) totalText.innerText = Utils.formatCurrency(grandTotal);
}

function confirmWizAddToCart() {
  if (isWizSubmitting || !currentWizItem) return;
  isWizSubmitting = true;

  Utils.closeModal('smart-customizer-modal');

  let basePrice = wizSelectedSize ? wizSelectedSize.price : currentWizItem.price;
  let crustPrice = wizSelectedCrust ? wizSelectedCrust.price : 0;
  let extrasSum = wizSelectedExtras.reduce((sum, e) => sum + e.price, 0);
  let unitPrice = basePrice + crustPrice + extrasSum;
  let totalPrice = unitPrice * wizSelectedQty;

  const allExtrasCombined = [
    ...(wizSelectedCrust.name !== 'Classic' ? [`Crust: ${wizSelectedCrust.name}`] : []),
    ...wizSelectedExtras.map(e => e.name)
  ];

  currentCart.push({
    item_id: currentWizItem._id || currentWizItem.name,
    name: `${wizSelectedFlavor || currentWizItem.name}`,
    quantity: wizSelectedQty,
    size: wizSelectedSize ? wizSelectedSize.name : 'Medium',
    extras: allExtrasCombined,
    unit_price: unitPrice,
    total_price: totalPrice
  });

  updateWACartBar();

  Utils.showToast('Item added to your cart successfully.', 'success');

  const cartSummaryMsg = `
    <div class="font-bold text-slate-800 mb-1">🛒 Item added to your cart successfully.</div>
    <div class="text-xs text-slate-700">🍕 <strong>${wizSelectedQty}x ${wizSelectedSize.name} ${wizSelectedFlavor || currentWizItem.name}</strong></div>
    ${wizSelectedCrust.name !== 'Classic' ? `<div class="text-[11px] text-slate-500">Crust: ${wizSelectedCrust.name}</div>` : ''}
    <div class="font-bold text-emerald-800 text-xs mt-1">Item Total: ${Utils.formatCurrency(totalPrice)}</div>
  `;

  appendWhatsAppInboundMsg(cartSummaryMsg, [
    { id: 'btn_same_cat', title: `🍕 Same Category (${currentWACategory || 'Menu'})` },
    { id: 'btn_view_menu', title: '📋 Other Categories' },
    { id: 'btn_checkout_now', title: '✅ Proceed to Checkout' }
  ]);

  setTimeout(() => {
    isWizSubmitting = false;
  }, 500);
}

function updateWACartBar() {
  const bar = document.getElementById('wa-cart-summary-bar');
  if (!bar) return;

  if (currentCart.length === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');

  const totalQty = currentCart.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = currentCart.reduce((sum, i) => sum + i.total_price, 0);

  const qtyEl = document.getElementById('wa-cart-qty');
  const priceEl = document.getElementById('wa-cart-price');

  if (qtyEl) qtyEl.innerText = `${totalQty} Item${totalQty > 1 ? 's' : ''}`;
  if (priceEl) priceEl.innerText = Utils.formatCurrency(totalPrice);
}

function promptWAPaymentMethod() {
  const msg = `
    <div class="font-bold text-slate-800 mb-1.5">💳 Select Payment Method:</div>
    <div class="text-xs text-slate-600 space-y-1">
      <div>• 💵 <strong>Cash on Delivery</strong>: Pay cash to rider upon delivery</div>
      <div>• 💳 <strong>Online Payment</strong>: Card / JazzCash / EasyPaisa (verification pending)</div>
      <div>• 🏦 <strong>Bank Transfer</strong>: Direct IBAN transfer</div>
    </div>
  `;
  appendWhatsAppInboundMsg(msg, [
    { id: 'btn_pay_cod', title: '💵 Cash on Delivery' },
    { id: 'btn_pay_online', title: '💳 Online Payment' },
    { id: 'btn_pay_bank', title: '🏦 Bank Transfer' }
  ]);
}

function setWAPaymentMethod(method) {
  selectedPaymentMethod = method;
  let detailNote = '💵 You will pay cash to our rider.';
  if (method === 'Online Payment') {
    detailNote = '💳 Status will be Payment Verification Pending until verified by staff.';
  } else if (method === 'Bank Transfer') {
    detailNote = '🏦 Verification pending. Staff will confirm receipt prior to dispatch.';
  }
  appendWhatsAppInboundMsg(`✅ Payment method set to: <strong>${method}</strong>.<br><span class="text-xs text-slate-500">${detailNote}</span>`);
  triggerWACheckout();
}

function triggerWACheckout() {
  if (currentCart.length === 0) {
    Utils.showToast('Your cart is empty! Add items from the menu.', 'warning');
    return;
  }

  const itemsHtml = currentCart.map(i => `• ${i.name} (x${i.quantity}) [${i.size}] - ${Utils.formatCurrency(i.total_price)}`).join('<br>');
  const grandTotal = currentCart.reduce((sum, i) => sum + i.total_price, 0);

  const checkoutMsg = `
    <div class="font-bold text-slate-800 mb-1.5">🛒 Order Breakdown:</div>
    <div class="text-xs text-slate-600 space-y-1 mb-2">${itemsHtml}</div>
    <div class="text-xs text-slate-700 space-y-0.5 border-t border-slate-200 pt-1.5">
      <div>📍 <strong>Delivery:</strong> House 42, Street 10, Phase 5 DHA, Lahore</div>
      <div>💳 <strong>Payment Method:</strong> <strong class="text-emerald-700">${selectedPaymentMethod}</strong></div>
      <div class="text-sm font-extrabold text-red-900 pt-1">Total: ${Utils.formatCurrency(grandTotal)}</div>
    </div>
  `;

  appendWhatsAppInboundMsg(checkoutMsg, [
    { id: 'btn_confirm_order_final', title: '✅ Confirm & Place Order' },
    { id: 'btn_change_payment', title: '💳 Change Payment Method' },
    { id: 'btn_view_menu', title: '✏️ Add / Edit Items' }
  ]);
}

async function processWAOrderConfirmation() {
  appendWhatsAppOutboundMsg('✅ Confirm & Place Order');

  try {
    const payload = {
      customer_phone: currentCustomer ? currentCustomer.phone : '03001234567',
      customer_name: currentCustomer ? currentCustomer.name : 'Customer',
      branch_id: selectedBranch.branch_id,
      items: currentCart,
      delivery_type: 'Home Delivery',
      delivery_address: { label: 'Home', address: 'House 42, Street 10, Phase 5 DHA, Lahore', lat: 31.4750, lng: 74.4200 },
      payment_method: selectedPaymentMethod || 'Cash on Delivery'
    };

    const data = await API.post('/api/chat/checkout', payload);

    if (data && data.success) {
      const order = data.order;
      activeTrackOrderId = order.order_id;
      confirmedWAOrder = order;
      currentCart = [];
      currentWACategory = null;
      currentWizItem = null;
      updateWACartBar();
      Utils.closeModal('smart-customizer-modal');
      Utils.closeModal('wa-list-modal');

      const confirmedMsg = `
        <div class="font-bold text-emerald-800 text-sm mb-1">🎉 Order Confirmed!</div>
        <div class="text-xs text-slate-700 space-y-1">
          <div>Order Number: <strong class="text-slate-900">${order.order_id}</strong></div>
          <div>Total Amount: <strong class="text-red-900">${Utils.formatCurrency(order.total_amount)}</strong></div>
          <div>Payment Method: <strong class="text-emerald-800">${order.payment_method || 'Cash on Delivery'} (${order.payment_status})</strong></div>
          <div>Status: <span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">${order.order_status} (Sent to kitchen)</span></div>
          <div class="text-slate-500 text-[11px]">${order.payment_method === 'Cash on Delivery' ? 'Please keep exact cash ready for rider.' : 'Payment verification pending with staff.'}</div>
        </div>
      `;

      appendWhatsAppInboundMsg(confirmedMsg, [
        { id: 'btn_modify_order', title: '✏️ Modify Order' },
        { id: 'btn_track_order_live', title: '🚴 Track Live Delivery' },
        { id: 'btn_review', title: '⭐ Review Order' }
      ]);
    }
  } catch (err) {
    appendWhatsAppInboundMsg('❌ Order placement failed. Please try again.');
  }
}

async function handleWAModifyOrder() {
  const targetId = confirmedWAOrder ? confirmedWAOrder.order_id : activeTrackOrderId;
  const phone = currentCustomer ? currentCustomer.phone : '03001234567';

  if (!targetId) {
    Utils.showToast('No active order found to modify.', 'warning');
    return;
  }

  try {
    const data = await API.get(`/api/chat/modify-eligibility/${targetId}?phone=${phone}`);
    if (!data || !data.eligible) {
      appendWhatsAppInboundMsg(`⚠️ ${data ? data.message : 'Order cannot be modified.'}`);
      Utils.showToast(data ? data.message : 'Order cannot be modified.', 'error');
      return;
    }

    isWAModifyingOrder = true;
    confirmedWAOrder = data.order;
    currentCart = (data.order.items || []).map(i => ({
      item_id: i.item_id,
      name: i.name,
      quantity: i.quantity,
      size: i.size || 'Medium',
      extras: i.extras || [],
      unit_price: i.unit_price,
      total_price: i.total_price
    }));

    updateWACartBar();

    const modifyMsg = `
      <div class="font-bold text-amber-900 text-sm mb-1">✏️ Modifying Order #${data.order.order_id}</div>
      <div class="text-xs text-slate-700">Explore menu below to add more items or adjust quantities.</div>
      <div class="font-semibold text-slate-800 text-xs mt-1">Previous Total: ${Utils.formatCurrency(data.order.total_amount)}</div>
    `;

    appendWhatsAppInboundMsg(modifyMsg, [
      { id: 'btn_view_menu', title: '🍕 Add Items from Menu' },
      { id: 'btn_save_updated_order', title: '✅ Save Updated Order' },
      { id: 'btn_cancel_modification', title: '❌ Cancel Changes' }
    ]);
  } catch (err) {
    Utils.showToast('Failed to check modification eligibility.', 'error');
  }
}

async function saveUpdatedWAOrder() {
  if (!confirmedWAOrder || isWASubmittingModify) return;
  if (currentCart.length === 0) {
    Utils.showToast('Cart cannot be empty for order update.', 'warning');
    return;
  }

  isWASubmittingModify = true;
  const phone = currentCustomer ? currentCustomer.phone : '03001234567';

  try {
    const data = await API.put(`/api/chat/modify-order/${confirmedWAOrder.order_id}`, {
      customer_phone: phone,
      items: currentCart
    });

    if (data && data.success) {
      confirmedWAOrder = data.order;
      isWAModifyingOrder = false;
      currentCart = [];
      updateWACartBar();

      Utils.showToast('Your order has been updated successfully.', 'success');

      const updatedMsg = `
        <div class="font-bold text-emerald-800 text-sm mb-1">🎉 Your order has been updated successfully!</div>
        <div class="text-xs text-slate-700 space-y-1">
          <div>Order Number: <strong class="text-slate-900">${data.order.order_id}</strong></div>
          <div>Previous Total: <span>${Utils.formatCurrency(data.previous_total)}</span></div>
          <div>Additional Amount: <strong class="text-amber-800">${Utils.formatCurrency(data.additional_amount)}</strong></div>
          <div>Updated Final Total: <strong class="text-red-900">${Utils.formatCurrency(data.updated_total)}</strong></div>
          <div>Payment Method: <strong>${data.order.payment_method || 'Cash on Delivery'}</strong></div>
        </div>
      `;

      appendWhatsAppInboundMsg(updatedMsg, [
        { id: 'btn_modify_order', title: '✏️ Modify Order' },
        { id: 'btn_track_order_live', title: '🚴 Track Live Delivery' },
        { id: 'btn_review', title: '⭐ Review Order' }
      ]);
    } else {
      appendWhatsAppInboundMsg(`⚠️ ${data ? data.message : 'Order update failed.'}`);
      Utils.showToast(data ? data.message : 'Order update failed.', 'error');
    }
  } catch (err) {
    appendWhatsAppInboundMsg('❌ Order update failed. Please try again.');
  } finally {
    isWASubmittingModify = false;
  }
}

function cancelWAOrderModification() {
  isWAModifyingOrder = false;
  currentCart = [];
  updateWACartBar();
  appendWhatsAppInboundMsg('❌ Order modifications cancelled. Your original confirmed order remains unchanged.', [
    { id: 'btn_modify_order', title: '✏️ Modify Order' },
    { id: 'btn_track_order_live', title: '🚴 Track Live Delivery' }
  ]);
}

function promptWATrackOrder() {
  const orderIdToTrack = activeTrackOrderId || 'FF-2026-0002';
  openTrackingModal(orderIdToTrack);
}

async function openTrackingModal(orderId) {
  try {
    const data = await API.get(`/api/chat/track?query=${orderId}`);

    if (!data || !data.success) {
      Utils.showToast(data ? data.message : 'Order not found.', 'error');
      return;
    }

    const order = data.order;
    activeTrackOrderId = order.order_id;

    const idEl = document.getElementById('track-order-id');
    const statusEl = document.getElementById('track-order-status');
    const riderEl = document.getElementById('track-rider-name');

    if (idEl) idEl.innerText = order.order_id;
    if (statusEl) statusEl.innerText = order.order_status;
    if (riderEl) riderEl.innerText = order.rider_name || 'Rider Ali';

    Utils.openModal('tracking-modal');

    setTimeout(() => {
      initTrackingMap(
        data.branch_location || { lat: 31.4704, lng: 74.4101 },
        order.delivery_address || { lat: 31.4750, lng: 74.4200 },
        data.rider ? data.rider.location : { lat: 31.4720, lng: 74.4130 }
      );
    }, 200);
  } catch (err) {
    Utils.showToast('Failed to load tracking details.', 'error');
  }
}

function initTrackingMap(branchLoc, custLoc, riderLoc) {
  const container = document.getElementById('tracking-map');
  if (!container) return;

  if (trackingMap) trackingMap.remove();

  trackingMap = L.map('tracking-map').setView([riderLoc.lat, riderLoc.lng], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(trackingMap);

  const restaurantIcon = L.divIcon({ html: '<span class="text-2xl">🍽️</span>', className: 'map-icon', iconSize: [30, 30] });
  const custIcon = L.divIcon({ html: '<span class="text-2xl">🏠</span>', className: 'map-icon', iconSize: [30, 30] });
  const motorcycleIcon = L.divIcon({ html: '<span class="text-3xl animate-bounce">🚴</span>', className: 'map-icon', iconSize: [35, 35] });

  branchMarker = L.marker([branchLoc.lat, branchLoc.lng], { icon: restaurantIcon }).addTo(trackingMap).bindPopup('FeastFlow Restaurant');
  customerMarker = L.marker([custLoc.lat, custLoc.lng], { icon: custIcon }).addTo(trackingMap).bindPopup('Your Destination');
  riderMarker = L.marker([riderLoc.lat, riderLoc.lng], { icon: motorcycleIcon }).addTo(trackingMap).bindPopup('Live Rider Location');

  L.polyline([[branchLoc.lat, branchLoc.lng], [riderLoc.lat, riderLoc.lng], [custLoc.lat, custLoc.lng]], {
    color: '#047857', weight: 4, dashArray: '6, 6'
  }).addTo(trackingMap);
}

function updateRiderMapPosition(lat, lng) {
  if (riderMarker) {
    riderMarker.setLatLng([lat, lng]);
    if (trackingMap) trackingMap.panTo([lat, lng]);
  }
}

function showWARewardsInfo() {
  if (!currentCustomer) return identifyWhatsAppCustomer('03001234567', 'Sameer');

  const rewardsMsg = `
    <div class="space-y-1.5">
      <div class="font-bold text-amber-900 text-sm flex items-center gap-1.5"><i class="fa-solid fa-gift text-amber-600"></i> Loyalty Rewards</div>
      <div class="text-xs text-slate-700">👤 <strong>Customer:</strong> ${currentCustomer.name}</div>
      <div class="text-xs text-slate-700">⭐ <strong>Loyalty Balance:</strong> <span class="font-bold text-amber-700">${currentCustomer.loyalty_points} Points</span></div>
      <div class="text-xs text-slate-700">🎖️ <strong>Member Tier:</strong> <span class="font-semibold text-emerald-800">${currentCustomer.customer_level}</span></div>
      <div class="text-[11px] text-slate-500 pt-1 border-t border-slate-200">Earn +20 points for every completed order review!</div>
    </div>
  `;
  appendWhatsAppInboundMsg(rewardsMsg);
}

// Exports to window
window.resetWhatsAppChat = resetWhatsAppChat;
window.handleWAKeyPress = handleWAKeyPress;
window.submitUserWAMessage = submitUserWAMessage;
window.handleWAButtonClick = handleWAButtonClick;
window.showWhatsAppCategoryList = showWhatsAppCategoryList;
window.selectWACategory = selectWACategory;
window.triggerSmartCustomizerWizard = triggerSmartCustomizerWizard;
window.wizSelectFlavor = wizSelectFlavor;
window.wizSelectSize = wizSelectSize;
window.wizSelectCrust = wizSelectCrust;
window.wizToggleExtra = wizToggleExtra;
window.confirmWizAddToCart = confirmWizAddToCart;
window.triggerWACheckout = triggerWACheckout;
window.promptWAPaymentMethod = promptWAPaymentMethod;
window.setWAPaymentMethod = setWAPaymentMethod;
window.promptWATrackOrder = promptWATrackOrder;
window.showWARewardsInfo = showWARewardsInfo;
window.showWhatsAppLocationMessage = showWhatsAppLocationMessage;
