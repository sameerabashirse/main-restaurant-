import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { formatCurrency, formatDateTime } from '../utils/format';
import { Modal, Toast } from '../components/Portal';

const defaultPhone = localStorage.getItem('feastflow_cust_phone') || '03001234567';
const defaultName = localStorage.getItem('feastflow_cust_name') || 'Sameer';

function Bubble({ children, mine = false }) {
  return <div className={`mb-3 flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${mine ? 'rounded-br-sm bg-[#d9fdd3] text-slate-800' : 'rounded-bl-sm bg-white text-slate-700'}`}>{children}</div></div>;
}

function MapPanel({ track, riderLocation }) {
  const element = useRef(null);
  const mapRef = useRef(null);
  const riderMarkerRef = useRef(null);
  useEffect(() => {
    if (!element.current || !track) return undefined;
    const liveLocation = track.rider?.location;
    const center = [liveLocation?.lat || track.branch_location?.lat || 31.4704, liveLocation?.lng || track.branch_location?.lng || 74.4101];
    const map = L.map(element.current, { zoomControl: true }).setView(center, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    const icon = (emoji) => L.divIcon({ className: 'map-icon', html: `<span style="font-size:26px">${emoji}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    const destination = track.order?.delivery_address;
    if (track.branch_location) L.marker([track.branch_location.lat, track.branch_location.lng], { icon: icon('🍽️') }).addTo(map).bindPopup('FeastFlow Restaurant');
    if (destination?.lat && destination?.lng) L.marker([destination.lat, destination.lng], { icon: icon('🏠') }).addTo(map).bindPopup('Your Destination');
    if (liveLocation) {
      riderMarkerRef.current = L.marker([liveLocation.lat, liveLocation.lng], { icon: icon('🚴') }).addTo(map).bindPopup('Live Rider Location');
      L.polyline([[track.branch_location?.lat || 31.4704, track.branch_location?.lng || 74.4101], [liveLocation.lat, liveLocation.lng], [destination?.lat || 31.475, destination?.lng || 74.42]], { color: '#047857', weight: 4, dashArray: '6, 6' }).addTo(map);
    }
    mapRef.current = map;
    return () => { riderMarkerRef.current = null; mapRef.current = null; map.remove(); };
  }, [track]);
  useEffect(() => {
    if (riderMarkerRef.current && riderLocation?.lat && riderLocation?.lng) {
      riderMarkerRef.current.setLatLng([riderLocation.lat, riderLocation.lng]);
      mapRef.current?.panTo([riderLocation.lat, riderLocation.lng]);
    }
  }, [riderLocation]);
  return <div ref={element} className="h-64 w-full overflow-hidden rounded-2xl border border-slate-200" />;
}

export default function CustomerPage() {
  const [customer, setCustomer] = useState({ name: defaultName, phone: defaultPhone });
  const [branches, setBranches] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [modal, setModal] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [wizard, setWizard] = useState({ size: '', flavour: '', crust: '', extras: [] });
  const [track, setTrack] = useState(null);
  const [activeOrderId, setActiveOrderId] = useState('');
  const activeOrderRef = useRef('');
  const [riderLocation, setRiderLocation] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, food_quality: 'Excellent', delivery_speed: 'Fast', feedback: '' });
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef(null);
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);

  useEffect(() => {
    api.post('/api/chat/start', { phone: defaultPhone, name: defaultName }).then((result) => {
      if (result.customer) {
        setCustomer(result.customer);
        localStorage.setItem('feastflow_cust_phone', result.customer.phone);
        localStorage.setItem('feastflow_cust_name', result.customer.name);
      }
      if (result.categories) setCategories(result.categories);
      if (result.branches) setBranches(result.branches);
      const name = result.customer?.name || defaultName;
      const firstMessage = { text: 'FeastFlow Restaurant', infoCard: true, buttons: ['Explore Food Menu', 'Reorder Last Meal', 'Branch Location'] };
      const nextMessages = [firstMessage];
      if (result.is_returning && result.last_order) {
        activeOrderRef.current = result.last_order.order_id;
        setActiveOrderId(result.last_order.order_id);
        nextMessages.push({ text: `Welcome Back, ${name}!`, returning: true, loyalty: result.customer?.loyalty_points || 0, level: result.customer?.customer_level || 'Customer', lastOrder: result.last_order.order_id, buttons: ['Reorder Last Meal', 'View Full Menu'] });
      } else {
        nextMessages.push({ text: `Hi ${name}! Welcome to FeastFlow. I’m your smart ordering assistant. How can I help you today?`, buttons: ['View Menu', 'Track Order', 'My Rewards'] });
      }
      setMessages(nextMessages);
    }).catch(() => {});
    const socket = getSocket();
    const onNotification = ({ body }) => setMessages((old) => [...old, { text: body }]);
    const onStatus = (order) => setMessages((old) => [...old, { text: `Order ${order.order_id || ''} is now ${order.order_status}.` }]);
    const onLocation = (data) => {
      if (!activeOrderRef.current || !data.order_id || data.order_id === activeOrderRef.current) setRiderLocation({ lat: data.lat, lng: data.lng });
    };
    socket.on('whatsapp:notification', onNotification);
    socket.on('order:updated', onStatus);
    socket.on('rider:location', onLocation);
    return () => { socket.off('whatsapp:notification', onNotification); socket.off('order:updated', onStatus); socket.off('rider:location', onLocation); };
  }, []);

  useEffect(() => {
    const chatBody = bottom.current?.parentElement;
    chatBody?.scrollTo({ top: chatBody.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const addMessage = (text, mine = false, extra = {}) => setMessages((old) => [...old, { text, mine, ...extra }]);

  const loadMenu = async (chosenCategory = null) => {
    try {
      const result = await api.get('/api/chat/menu');
      setMenu(result.menu_items || []);
      setCategories(result.categories || categories);
      setCategory(chosenCategory);
      addMessage('Here’s our fresh menu. Choose a category to explore:', false, { menu: true });
    } catch (error) { setToast(error.message); }
  };

  const showLocation = async () => {
    try {
      const result = await api.get('/api/chat/branches');
      setBranches(result.branches || []);
      const branch = result.branches?.[0];
      addMessage(`${branch?.name || 'FeastFlow DHA Branch'}\n\nAddress: ${branch?.address || 'Phase 5 Commercial, DHA, Lahore'}\nHours: ${branch?.opening_hours || '12:00 PM - 12:00 AM'}\nDelivery Coverage: DHA 1-8, Gulberg, Cantt\nPhone: ${branch?.phone || '042-35894120'}`, false, { buttons: ['View Menu'] });
    } catch (error) { setToast(error.message); }
  };

  const reorder = async () => {
    if (!customer.customer_id) return;
    try {
      const result = await api.get(`/api/chat/reorder/${customer.customer_id}`);
      if (!result.success || !result.last_order) return addMessage('No previous order found. Explore our menu below!', false, { buttons: ['View Menu'] });
      const items = (result.last_order.items || []).map((item) => ({ item_id: item.item_id, name: item.name, quantity: item.quantity, size: item.size, extras: item.extras || [], price: Number(item.unit_price || item.total_price / item.quantity || 0) }));
      setCart(items);
      activeOrderRef.current = result.last_order.order_id;
      setActiveOrderId(result.last_order.order_id);
      addMessage(`Quick Reorder Summary:\n${items.map((item) => `• ${item.name} (x${item.quantity}) - ${formatCurrency(item.price * item.quantity)}`).join('\n')}\nTotal: ${formatCurrency(items.reduce((sum, item) => sum + item.price * item.quantity, 0))}`, false, { buttons: ['Proceed to Checkout', 'Modify & Add More'] });
    } catch (error) { addMessage('Unable to fetch past order.', false); setToast(error.message); }
  };

  const sendMessage = async (value = input) => {
    const text = value.trim();
    if (!text) return;
    setInput('');
    addMessage(text, true);
    const normalized = text.toLowerCase();
    if (normalized.includes('hello') || normalized.includes('hi') || normalized.includes('start') || normalized === 'menu') return addMessage('FeastFlow Restaurant', false, { infoCard: true, buttons: ['Explore Food Menu', 'Reorder Last Meal', 'Branch Location'] });
    if (normalized.includes('food')) return loadMenu();
    if (normalized.includes('reward') || normalized.includes('loyalty')) return addMessage(`You have ${customer.loyalty_points || 0} loyalty points. Keep ordering to unlock more FeastFlow rewards!`);
    if (normalized.includes('track') || normalized.includes('order')) return openTrackPrompt();
    if (normalized.includes('reorder') || normalized.includes('same again')) return reorder();
    if (normalized.includes('remind')) {
      try { const result = await api.post('/api/chat/reminder/trigger', { phone: customer.phone || defaultPhone }); addMessage(result.message || 'Reminder request received.'); } catch (error) { setToast(error.message); }
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/whatsapp/webhook', { simulated: true, phone: customer.phone || defaultPhone, message: { text: { body: text } } });
      addMessage('Thanks! I’ve sent that to the FeastFlow assistant. Try “menu”, “track”, or “rewards” for quick actions.');
    } catch (error) { setToast(error.message); }
    finally { setBusy(false); }
  };

  const openCustomizer = (item) => {
    const customization = item.customization || {};
    setSelectedItem(item);
    setWizard({ size: customization.sizes?.[0]?.name || item.sizes?.[0]?.name || '', flavour: customization.flavours?.[0] || '', crust: customization.crusts?.[0]?.name || '', extras: [] });
    setModal('customize');
  };

  const confirmAdd = () => {
    const sizeOptions = selectedItem.customization?.sizes || selectedItem.sizes || [];
    const size = sizeOptions.find((entry) => entry.name === wizard.size);
    const extrasOptions = selectedItem.customization?.extras || selectedItem.customization?.addons || selectedItem.extras || [];
    const extras = extrasOptions.filter((entry) => wizard.extras.includes(entry.name));
    const price = Number(size?.price ?? selectedItem.price) + extras.reduce((sum, entry) => sum + Number(entry.price || 0), 0);
    setCart((old) => [...old, { item_id: selectedItem._id, name: selectedItem.name, quantity: 1, size: wizard.size, extras: wizard.extras, price }]);
    setModal(null);
    addMessage(`${selectedItem.name} added to your cart.`, false);
  };

  const checkout = async () => {
    if (!cart.length) return;
    setBusy(true);
    try {
      const result = await api.post('/api/chat/checkout', { customer_phone: customer.phone || defaultPhone, customer_name: customer.name || defaultName, branch_id: 'BR-DHA', items: cart, delivery_type: 'Home Delivery', delivery_address: { address: customer.addresses?.[0]?.address || 'House 42, Street 10, Phase 5 DHA, Lahore', label: 'Home', lat: 31.475, lng: 74.42 }, payment_method: 'Cash on Delivery' });
      if (!result.success) throw new Error(result.message);
      addMessage(`Order ${result.order.order_id} confirmed! Your total is ${formatCurrency(result.order.total_amount)}. Cash on Delivery selected.`);
      setCart([]);
      activeOrderRef.current = result.order.order_id;
      setActiveOrderId(result.order.order_id);
      addMessage('We have sent this order to our kitchen!', false, { buttons: ['Track Live Delivery', 'Order More', 'Review Order'] });
      setModal(null);
    } catch (error) { setToast(error.message); }
    finally { setBusy(false); }
  };

  const openTrackPrompt = () => {
    setModal('track');
    setTrack(null);
  };

  const findOrder = async (event) => {
    event.preventDefault();
    const query = event.currentTarget.elements.query.value;
    setBusy(true);
    try {
      const result = await api.get(`/api/chat/track?query=${encodeURIComponent(query)}`);
      setTrack(result);
      activeOrderRef.current = result.order?.order_id || query;
      setActiveOrderId(result.order?.order_id || query);
      setRiderLocation(result.rider?.location || null);
    } catch (error) { setToast(error.message); }
    finally { setBusy(false); }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    try {
      const result = await api.post('/api/chat/review', { order_id: activeOrderId, ...reviewForm, rating: Number(reviewForm.rating) });
      addMessage(`Thank you for your review! You earned ${result.points_earned || 20} loyalty points.`);
      setModal(null);
    } catch (error) { setToast(error.message); }
  };

  const updateCartQuantity = (index, delta) => setCart((old) => old.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item).filter((item) => item.quantity > 0));

  const visibleMenu = category ? menu.filter((item) => item.category === category) : menu;
  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-slate-100 font-sans text-slate-800 antialiased">
      <header className="w-full bg-gradient-to-r from-red-900 via-red-950 to-red-900 px-4 py-2.5 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-base font-extrabold text-red-950 shadow-sm"><i className="fa-solid fa-utensils" /></div><div><h1 className="text-sm font-extrabold leading-tight tracking-wide sm:text-base">FeastFlow Restaurant</h1><p className="hidden text-[11px] font-medium text-amber-200/90 sm:block">Smart AI Food Ordering & Customization</p></div></div><Link to="/staff/login" className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"><i className="fa-solid fa-lock text-[10px]" /> Staff Operations</Link></div>
      </header>
      <main className="flex w-full flex-1 items-center justify-center p-0 sm:px-4 sm:py-6">
        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:h-[840px] sm:w-[410px] sm:rounded-[40px] sm:border-slate-800 sm:ring-[12px] sm:ring-slate-900">
          <div className="hidden h-6 w-full items-center justify-center bg-[#075e54] sm:flex"><div className="h-4 w-28 rounded-b-xl bg-black" /></div>
          <div className="flex shrink-0 items-center justify-between gap-2.5 bg-[#075e54] px-3.5 py-2.5 text-white shadow-sm"><div className="flex min-w-0 items-center gap-2.5"><div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-lg text-white shadow-inner"><i className="fa-solid fa-utensils" /><span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#075e54] bg-[#25d366]" /></div><div className="min-w-0"><div className="flex items-center gap-1.5"><h2 className="truncate text-sm font-bold">FeastFlow Restaurant</h2><i className="fa-solid fa-circle-check text-xs text-[#25d366]" /></div><p className="truncate text-[11px] font-medium text-emerald-200">🟢 Online • {customer.name || 'AI Assistant'} ({customer.customer_level || 'AI Assistant'})</p></div></div><button onClick={() => { setMessages([{ text: 'Chat reset. What would you like to order today?', buttons: ['View Menu'] }]); setCart([]); }} className="rounded-full p-2 text-white/90 transition hover:bg-white/10 hover:text-white" aria-label="Reset chat"><i className="fa-solid fa-rotate-right text-xs" /></button></div>
          <div className="wa-chat-texture flex-1 overflow-y-auto p-3.5">{messages.map((message, index) => <Bubble key={`${index}-${message.text}`} mine={message.mine}>{message.infoCard ? <><div className="mb-2 flex items-center gap-2 font-bold text-red-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-900 text-xs text-amber-300"><i className="fa-solid fa-utensils" /></span>FeastFlow Restaurant</div><div className="space-y-1 text-xs text-slate-700"><div>📍 <b>DHA Lahore Branch</b> (Phase 5 Commercial)</div><div>🕒 12:00 PM - 12:00 AM Daily</div><div>🚚 Fast Delivery (DHA, Gulberg, Cantt)</div><div>⭐ 4.8 Rating (1,240 Reviews)</div></div></> : message.returning ? <><b className="text-sm text-emerald-900">👋 {message.text}</b><span className="mt-1 block text-xs font-semibold text-amber-800">⭐ {message.loyalty} Points ({message.level})</span><span className="mt-1 block text-xs text-slate-600">Last Order: <b>{message.lastOrder}</b></span></> : <span className="whitespace-pre-line">{message.text}</span>}{message.buttons && <div className="mt-3 grid gap-2">{message.buttons.map((button) => <button key={button} onClick={() => button.includes('Location') ? showLocation() : button.includes('Reorder') || button.includes('Same') ? reorder() : button.includes('Checkout') ? setModal('checkout') : button.includes('Track') ? openTrackPrompt() : button.includes('Review') ? setModal('review') : sendMessage(button)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100">{button}<i className="fa-solid fa-chevron-right float-right mt-0.5 text-[9px]" /></button>)}</div>}{message.menu && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{categories.map((item) => <button key={item._id || item.name} onClick={() => setCategory(item.name)} className="rounded-xl bg-amber-50 p-2 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-amber-100">{item.icon || '🍽️'} {item.name}</button>)}</div>}</Bubble>) }{menu.length > 0 && <div className="mb-3 grid gap-3 sm:grid-cols-2">{visibleMenu.map((item) => <div key={item._id} className="overflow-hidden rounded-2xl bg-white shadow-sm"><img src={item.image} alt="" className="h-28 w-full object-cover" /><div className="p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-800">{item.name}</p><p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{item.description}</p></div><b className="whitespace-nowrap text-xs text-red-900">{formatCurrency(item.price)}</b></div><button onClick={() => openCustomizer(item)} className="mt-3 w-full rounded-lg bg-red-900 py-2 text-[10px] font-bold text-white hover:bg-red-800">Customize & Add</button></div></div>)}</div>}{busy && <Bubble><span className="text-slate-400">FeastFlow is typing…</span></Bubble>}<div ref={bottom} /></div>
           <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-slate-200/90 bg-slate-100 px-2.5 py-2">{[['Menu', 'fa-utensils'], ['Cart', 'fa-basket-shopping'], ['Location', 'fa-location-dot'], ['Track', 'fa-box'], ['Rewards', 'fa-gift']].map(([label, icon]) => <button key={label} onClick={() => label === 'Menu' ? loadMenu() : label === 'Cart' ? setModal('checkout') : label === 'Location' ? showLocation() : label === 'Track' ? openTrackPrompt() : addMessage(`You have ${customer.loyalty_points || 0} loyalty points. Your current level is ${customer.customer_level || 'New Customer'}.`)} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#075e54] shadow-sm hover:bg-emerald-50">{label === 'Menu' ? '🍕' : label === 'Cart' ? '🛒' : label === 'Location' ? '📍' : label === 'Track' ? '📦' : '⭐'} {label}</button>)}</div>
           <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-100 p-2"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendMessage()} placeholder="Ask about menu or place order..." className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs shadow-inner outline-none focus:ring-2 focus:ring-emerald-600" /><button onClick={() => sendMessage()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm hover:bg-[#008f6f]" aria-label="Send message"><i className="fa-solid fa-paper-plane text-xs" /></button></div>
           {cart.length > 0 && <button onClick={() => setModal('checkout')} className="flex shrink-0 items-center justify-between border-t-2 border-[#25d366] bg-[#075e54] px-4 py-2.5 text-white shadow-lg transition hover:bg-[#064e47]"><span className="flex items-center gap-2 text-xs"><i className="fa-solid fa-basket-shopping text-sm text-emerald-300" /><b>{cart.reduce((sum, item) => sum + item.quantity, 0)} Item{cart.reduce((sum, item) => sum + item.quantity, 0) > 1 ? 's' : ''}</b><span className="text-emerald-300">|</span><strong className="text-sm">{formatCurrency(total)}</strong></span><span className="rounded-full bg-[#25d366] px-3.5 py-1.5 text-xs font-extrabold text-slate-900">Checkout <i className="fa-solid fa-chevron-right ml-1 text-[10px]" /></span></button>}
        </div>
      </main>
      {toast && <Toast message={toast} tone="error" onClose={() => setToast('')} />}
      {modal === 'customize' && selectedItem && <Modal title={`Customize ${selectedItem.name}`} onClose={() => setModal(null)}><div className="space-y-4">{(selectedItem.customization?.flavours || []).length > 0 && <div><label className="mb-2 block text-xs font-bold text-slate-700">Choose flavour</label><select className="input-control" value={wizard.flavour} onChange={(event) => setWizard({ ...wizard, flavour: event.target.value })}>{selectedItem.customization.flavours.map((value) => <option key={value}>{value}</option>)}</select></div>}<div><label className="mb-2 block text-xs font-bold text-slate-700">Choose size</label><div className="grid grid-cols-2 gap-2">{(selectedItem.customization?.sizes || selectedItem.sizes || []).map((value) => <button key={value.name} onClick={() => setWizard({ ...wizard, size: value.name })} className={`rounded-xl border px-3 py-2 text-xs font-bold ${wizard.size === value.name ? 'border-red-900 bg-red-50 text-red-900' : 'border-slate-200 text-slate-600'}`}>{value.name}<span className="mt-1 block text-[10px] font-normal">{formatCurrency(value.price)}</span></button>)}</div></div>{(selectedItem.customization?.crusts || []).length > 0 && <div><label className="mb-2 block text-xs font-bold text-slate-700">Choose crust</label><select className="input-control" value={wizard.crust} onChange={(event) => setWizard({ ...wizard, crust: event.target.value })}>{selectedItem.customization.crusts.map((value) => <option key={value.name}>{value.name}</option>)}</select></div>}{(selectedItem.customization?.extras || selectedItem.customization?.addons || selectedItem.extras || []).length > 0 && <div><label className="mb-2 block text-xs font-bold text-slate-700">Add extras</label>{(selectedItem.customization?.extras || selectedItem.customization?.addons || selectedItem.extras || []).map((value) => <label key={value.name} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs"><span>{value.name} <small className="text-slate-400">+{formatCurrency(value.price)}</small></span><input type="checkbox" checked={wizard.extras.includes(value.name)} onChange={(event) => setWizard({ ...wizard, extras: event.target.checked ? [...wizard.extras, value.name] : wizard.extras.filter((name) => name !== value.name) })} /></label>)}</div>}<button onClick={confirmAdd} className="primary-button w-full">Add to cart</button></div></Modal>}
      {modal === 'checkout' && <Modal title="Your FeastFlow Cart" onClose={() => setModal(null)}>{cart.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">Your cart is empty. Choose View Menu to get started.</p> : <><div className="mb-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">{cart.map((item, index) => <div key={index} className="flex items-center justify-between gap-2 p-3 text-xs"><span className="min-w-0"><b className="block truncate">{item.name}</b><small className="block text-slate-500">{item.size} · {formatCurrency(item.price)} each</small></span><div className="flex items-center gap-2"><button onClick={() => updateCartQuantity(index, -1)} className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-600">−</button><b>{item.quantity}</b><button onClick={() => updateCartQuantity(index, 1)} className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-600">+</button><button onClick={() => setCart((old) => old.filter((_, itemIndex) => itemIndex !== index))} className="ml-1 text-red-600" aria-label="Remove item"><i className="fa-solid fa-trash-can" /></button><b className="w-20 text-right">{formatCurrency(item.price * item.quantity)}</b></div></div>)}</div><div className="mb-4 flex justify-between text-sm font-extrabold"><span>Total</span><span className="text-red-900">{formatCurrency(total)}</span></div><button disabled={busy} onClick={checkout} className="primary-button w-full disabled:opacity-60">{busy ? 'Placing order…' : 'Confirm Cash on Delivery'}</button></>}</Modal>}
      {modal === 'review' && <Modal title="Review your order" onClose={() => setModal(null)}><form onSubmit={submitReview} className="space-y-3"><label className="block text-xs font-bold text-slate-700">Rating<select className="input-control mt-1" value={reviewForm.rating} onChange={(event) => setReviewForm({ ...reviewForm, rating: event.target.value })}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{'⭐'.repeat(value)} ({value}/5)</option>)}</select></label><label className="block text-xs font-bold text-slate-700">Food quality<select className="input-control mt-1" value={reviewForm.food_quality} onChange={(event) => setReviewForm({ ...reviewForm, food_quality: event.target.value })}><option>Excellent</option><option>Good</option><option>Average</option><option>Poor</option></select></label><label className="block text-xs font-bold text-slate-700">Delivery speed<select className="input-control mt-1" value={reviewForm.delivery_speed} onChange={(event) => setReviewForm({ ...reviewForm, delivery_speed: event.target.value })}><option>Fast</option><option>On time</option><option>Slow</option></select></label><label className="block text-xs font-bold text-slate-700">Feedback<textarea className="input-control mt-1" rows="3" value={reviewForm.feedback} onChange={(event) => setReviewForm({ ...reviewForm, feedback: event.target.value })} /></label><button className="primary-button w-full">Submit review</button></form></Modal>}
      {modal === 'track' && <Modal title="Live Delivery Tracking" onClose={() => setModal(null)} wide><form onSubmit={findOrder} className="mb-4 flex gap-2"><input name="query" defaultValue={activeOrderId || customer.phone || defaultPhone} placeholder="Order ID or phone number" className="input-control" required /><button className="primary-button">{busy ? 'Searching…' : 'Track'}</button></form>{track ? <div className="space-y-3"><div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs"><div><div className="text-[10px] uppercase text-slate-400">Order ID</div><b>{track.order?.order_id}</b></div><div><div className="text-[10px] uppercase text-slate-400">Status</div><b className="text-emerald-700">{track.order?.order_status}</b></div><div><div className="text-[10px] uppercase text-slate-400">Assigned Rider</div><b>{track.rider?.name || track.order?.rider_name || 'Rider Ali'}</b></div></div><MapPanel track={track} riderLocation={riderLocation} />{track.rider && <p className="text-xs text-slate-600"><i className="fa-solid fa-motorcycle mr-2 text-red-900" />{track.rider.name} · {track.rider.phone}</p>}</div> : <p className="py-8 text-center text-xs text-slate-500">Enter an order ID or phone number to see live status.</p>}</Modal>}
    </div>
  );
}