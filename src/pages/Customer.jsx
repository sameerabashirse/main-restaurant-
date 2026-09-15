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

function MapPanel({ track, riderLocation, lastUpdated }) {
  const element = useRef(null);
  const mapRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const polylineRef = useRef(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Live timer for elapsed time since last GPS update
  useEffect(() => {
    if (!lastUpdated) return undefined;
    const updateElapsed = () => {
      const diff = Math.max(0, Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000));
      setElapsedSec(diff);
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  const orderId = track?.order?.order_id;
  const branch = track?.branch_location || { lat: 31.4704, lng: 74.4101 };
  const destLat = track?.order?.deliveryLocation?.latitude ?? track?.order?.delivery_address?.lat ?? 31.4750;
  const destLng = track?.order?.deliveryLocation?.longitude ?? track?.order?.delivery_address?.lng ?? 74.4200;

  // Initialize Map once per order
  useEffect(() => {
    if (!element.current || !track) return undefined;

    const initialRider = riderLocation || track.rider?.location;
    const center = [initialRider?.latitude || initialRider?.lat || branch.lat, initialRider?.longitude || initialRider?.lng || branch.lng];

    const map = L.map(element.current, { zoomControl: true }).setView(center, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    const icon = (emoji) => L.divIcon({ className: 'map-icon', html: `<span style="font-size:26px">${emoji}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });

    L.marker([branch.lat, branch.lng], { icon: icon('🍽️') }).addTo(map).bindPopup('<b>FeastFlow Restaurant</b><br/>Pickup Branch');
    L.marker([destLat, destLng], { icon: icon('🏠') }).addTo(map).bindPopup(`<b>Your Delivery Destination</b><br/>${track.order?.deliveryAddress?.formattedAddress || track.order?.delivery_address?.address || ''}`);

    const riderLat = initialRider?.latitude ?? initialRider?.lat;
    const riderLng = initialRider?.longitude ?? initialRider?.lng;

    if (riderLat && riderLng) {
      riderMarkerRef.current = L.marker([riderLat, riderLng], { icon: icon('🚴') }).addTo(map).bindPopup('<b>Live Rider Location</b>').openPopup();
      polylineRef.current = L.polyline([[branch.lat, branch.lng], [riderLat, riderLng], [destLat, destLng]], { color: '#047857', weight: 4, dashArray: '6, 6' }).addTo(map);
    }

    mapRef.current = map;
    return () => {
      riderMarkerRef.current = null;
      polylineRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [orderId]);

  // Update Rider Marker position and polyline dynamically without re-mounting map
  useEffect(() => {
    const lat = riderLocation?.latitude ?? riderLocation?.lat;
    const lng = riderLocation?.longitude ?? riderLocation?.lng;

    if (lat !== undefined && lng !== undefined && mapRef.current) {
      if (riderMarkerRef.current) {
        riderMarkerRef.current.setLatLng([lat, lng]);
      } else {
        const icon = (emoji) => L.divIcon({ className: 'map-icon', html: `<span style="font-size:26px">${emoji}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
        riderMarkerRef.current = L.marker([lat, lng], { icon: icon('🚴') }).addTo(mapRef.current).bindPopup('<b>Live Rider Location</b>').openPopup();
      }

      if (polylineRef.current) {
        polylineRef.current.setLatLngs([[branch.lat, branch.lng], [lat, lng], [destLat, destLng]]);
      } else {
        polylineRef.current = L.polyline([[branch.lat, branch.lng], [lat, lng], [destLat, destLng]], { color: '#047857', weight: 4, dashArray: '6, 6' }).addTo(mapRef.current);
      }

      mapRef.current.panTo([lat, lng]);
    }
  }, [riderLocation?.lat, riderLocation?.lng, riderLocation?.latitude, riderLocation?.longitude]);

  const isStale = elapsedSec > 60;

  return (
    <div className="space-y-1.5">
      <div ref={element} className="h-64 w-full overflow-hidden rounded-2xl border border-slate-200 shadow-inner" />
      <div className="flex items-center justify-between px-1 text-[11px]">
        {lastUpdated ? (
          <span className={`inline-flex items-center gap-1.5 font-semibold ${isStale ? 'text-amber-700' : 'text-emerald-700'}`}>
            <span className={`h-2 w-2 rounded-full ${isStale ? 'bg-amber-500' : 'bg-emerald-500 animate-ping'}`} />
            {isStale
              ? `⚠️ Rider GPS signal idle (${Math.floor(elapsedSec / 60)}m ago)`
              : elapsedSec < 3
              ? 'Rider location updated just now'
              : `Rider location updated ${elapsedSec}s ago`}
          </span>
        ) : (
          <span className="text-slate-400">Waiting for live rider GPS…</span>
        )}
        <span className="text-slate-400 text-[10px]">Real-time GPS • FeastFlow Live</span>
      </div>
    </div>
  );
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

  const [checkoutStep, setCheckoutStep] = useState(null);
  const [checkoutDraft, setCheckoutDraft] = useState({
    orderType: 'DELIVERY',
    name: defaultName,
    phone: defaultPhone,
    houseNumber: '',
    streetNumber: '',
    area: '',
    city: 'Lahore',
    landmark: '',
    instructions: '',
    paymentMethod: 'Cash on Delivery',
    latitude: null,
    longitude: null,
    accuracy: null,
    locationReceived: false
  });

  const [lastLocationTime, setLastLocationTime] = useState(null);

  useEffect(() => {
    api.post('/api/chat/start', { phone: defaultPhone, name: defaultName }).then((result) => {
      if (result.customer) {
        setCustomer(result.customer);
        setCheckoutDraft((prev) => ({
          ...prev,
          name: result.customer.name || prev.name,
          phone: result.customer.phone || prev.phone
        }));
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
        const socket = getSocket();
        socket.emit('join:order', result.last_order.order_id);
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
      const orderId = data?.orderId || data?.order_id;
      const currentActiveId = activeOrderRef.current;
      if (!currentActiveId || !orderId || String(orderId).trim().toUpperCase() === String(currentActiveId).trim().toUpperCase()) {
        const lat = data.latitude !== undefined ? data.latitude : data.lat;
        const lng = data.longitude !== undefined ? data.longitude : data.lng;
        if (lat !== undefined && lng !== undefined) {
          setRiderLocation({ lat: Number(lat), lng: Number(lng) });
          setLastLocationTime(data.timestamp ? new Date(data.timestamp) : new Date());
        }
      }
    };

    const onConnect = () => {
      if (activeOrderRef.current) {
        socket.emit('join:order', activeOrderRef.current);
        api.get(`/api/chat/track?query=${encodeURIComponent(activeOrderRef.current)}`)
          .then((res) => {
            if (res.rider?.location) {
              const loc = res.rider.location;
              setRiderLocation({ lat: loc.latitude ?? loc.lat, lng: loc.longitude ?? loc.lng });
              setLastLocationTime(loc.updatedAt || loc.updated_at || new Date());
            }
          })
          .catch(() => {});
      }
    };

    socket.on('connect', onConnect);
    socket.on('whatsapp:notification', onNotification);
    socket.on('order:updated', onStatus);
    socket.on('rider:location:update', onLocation);
    socket.on('rider:location', onLocation);

    return () => {
      socket.off('connect', onConnect);
      socket.off('whatsapp:notification', onNotification);
      socket.off('order:updated', onStatus);
      socket.off('rider:location:update', onLocation);
      socket.off('rider:location', onLocation);
    };
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

  const startConversationalCheckout = () => {
    if (modal) setModal(null);
    if (!cart.length) {
      return addMessage('🛒 Your cart is currently empty! Explore our menu to add items first.', false, { buttons: ['View Menu'] });
    }

    const previousAddress = customer.addresses?.[0];
    if (previousAddress && previousAddress.address) {
      setCheckoutStep('AWAITING_PREVIOUS_DETAILS');
      setCheckoutDraft((prev) => ({
        ...prev,
        orderType: 'DELIVERY',
        name: customer.name || prev.name || defaultName,
        phone: customer.phone || prev.phone || defaultPhone,
        city: 'Lahore',
        latitude: previousAddress.lat || 31.4750,
        longitude: previousAddress.lng || 74.4200,
        accuracy: 10,
        locationReceived: true
      }));
      addMessage(`📋 Would you like to use your previous delivery details?\n\n• Name: ${customer.name || defaultName}\n• Phone: ${customer.phone || defaultPhone}\n• Saved Address: ${previousAddress.address}`, false, {
        buttons: ['Use Previous Details', 'Enter New Details', 'Cancel']
      });
      return;
    }

    setCheckoutStep('AWAITING_ORDER_TYPE');
    setCheckoutDraft((prev) => ({
      ...prev,
      orderType: 'DELIVERY',
      name: customer.name || prev.name || defaultName,
      phone: customer.phone || prev.phone || defaultPhone,
      city: 'Lahore'
    }));
    addMessage('Please select your order type:', false, {
      buttons: ['Home Delivery', 'Self Pickup']
    });
  };

  const captureBrowserLocation = () => {
    if (!navigator.geolocation) {
      addMessage('⚠️ Geolocation not supported by browser. Using standard DHA delivery coordinates.', false);
      applyLocationCoordinates(31.4750, 74.4200, 15);
      return;
    }
    addMessage('📍 Fetching exact GPS location from your browser...', false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        applyLocationCoordinates(latitude, longitude, accuracy);
      },
      (err) => {
        addMessage('⚠️ Could not fetch browser GPS. You can retry or confirm standard coordinates.', false, {
          buttons: ['📍 Share Current Location', '📍 Use DHA Pin (31.475, 74.420)', 'Cancel']
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const applyLocationCoordinates = (lat, lng, accuracy = 10) => {
    const updatedDraft = {
      ...checkoutDraft,
      latitude: Number(lat),
      longitude: Number(lng),
      accuracy: Number(accuracy),
      locationReceived: true
    };
    setCheckoutDraft(updatedDraft);
    setCheckoutStep('AWAITING_PAYMENT_METHOD');
    addMessage('Step 10/10: 💳 Please choose your preferred Payment Method:\n\n• 💵 Cash on Delivery (Pay cash upon delivery)\n• 💳 Online Payment (Credit/Debit Card / JazzCash / EasyPaisa)\n• 🏦 Bank Transfer (Direct IBAN transfer to restaurant account)', false, {
      buttons: ['💵 Cash on Delivery', '💳 Online Payment', '🏦 Bank Transfer']
    });
  };

  const displayOrderConfirmationSummary = (draft = checkoutDraft) => {
    const isPickup = draft.orderType === 'PICKUP';
    if (isPickup) {
      const branch = branches?.[0] || { name: 'FeastFlow DHA Branch', address: 'Phase 5 Commercial DHA, Lahore', phone: '042-35894120' };
      addMessage(`📋 Please confirm your pickup order details:\n\n• Order Type: 🏪 Self Pickup\n• Customer Name: ${draft.name || customer.name || defaultName}\n• Phone Number: ${draft.phone || customer.phone || defaultPhone}\n• Pickup Location: ${branch.name}\n• Branch Address: ${branch.address}\n• Payment Method: ${draft.paymentMethod || 'Cash on Pickup'}\n• Total Amount: ${formatCurrency(total)}`, false, {
        buttons: ['Confirm Order', 'Change Payment', 'Change Name', 'Change Phone', 'Cancel']
      });
      return;
    }

    const addrParts = [
      draft.houseNumber ? `House/Flat ${draft.houseNumber}` : '',
      draft.streetNumber ? `Street ${draft.streetNumber}` : '',
      draft.area,
      draft.city || 'Lahore'
    ].filter(Boolean).join(', ');

    addMessage(`📋 Please confirm your delivery details:\n\n• Full Name: ${draft.name || customer.name || defaultName}\n• Phone Number: ${draft.phone || customer.phone || defaultPhone}\n• House/Flat: ${draft.houseNumber || 'N/A'}\n• Street: ${draft.streetNumber || 'N/A'}\n• Area/Society: ${draft.area || 'N/A'}\n• City: ${draft.city || 'Lahore'}\n• Landmark: ${draft.landmark || 'None'}\n• Delivery Instructions: ${draft.instructions || 'None'}\n• Location Status: ${draft.locationReceived && draft.latitude ? `✅ Received (${draft.latitude.toFixed(4)}, ${draft.longitude.toFixed(4)})` : '⚠️ Not Received'}\n• Payment Method: ${draft.paymentMethod || 'Cash on Delivery'}\n• Order Total: ${formatCurrency(total)}`, false, {
      buttons: ['Confirm Order', 'Change Payment', 'Change Name', 'Change Phone', 'Change Address', 'Change Location', 'Cancel']
    });
  };

  const executeFinalOrderCheckout = async () => {
    if (!cart.length) return;
    setBusy(true);
    try {
      const isPickup = checkoutDraft.orderType === 'PICKUP';
      const formattedAddress = isPickup
        ? 'Store Pickup (DHA Branch)'
        : [
            checkoutDraft.houseNumber ? `House/Flat ${checkoutDraft.houseNumber}` : '',
            checkoutDraft.streetNumber ? `Street ${checkoutDraft.streetNumber}` : '',
            checkoutDraft.area,
            checkoutDraft.landmark ? `Near ${checkoutDraft.landmark}` : '',
            checkoutDraft.city || 'Lahore'
          ].filter(Boolean).join(', ') || 'Phase 5 DHA, Lahore';

      const chosenPayment = checkoutDraft.paymentMethod || 'Cash on Delivery';
      const payload = {
        customer_phone: checkoutDraft.phone || customer.phone || defaultPhone,
        customer_name: checkoutDraft.name || customer.name || defaultName,
        customer: {
          name: checkoutDraft.name || customer.name || defaultName,
          phone: checkoutDraft.phone || customer.phone || defaultPhone
        },
        branch_id: 'BR-DHA',
        items: cart,
        orderType: isPickup ? 'PICKUP' : 'DELIVERY',
        delivery_type: isPickup ? 'Pickup' : 'Home Delivery',
        deliveryAddress: {
          houseNumber: checkoutDraft.houseNumber || '',
          streetNumber: checkoutDraft.streetNumber || '',
          area: checkoutDraft.area || '',
          city: checkoutDraft.city || 'Lahore',
          landmark: checkoutDraft.landmark || '',
          instructions: checkoutDraft.instructions || '',
          formattedAddress
        },
        deliveryLocation: isPickup ? null : {
          latitude: checkoutDraft.latitude || 31.4750,
          longitude: checkoutDraft.longitude || 74.4200,
          accuracy: checkoutDraft.accuracy || 10,
          confirmedAt: new Date()
        },
        delivery_address: {
          label: isPickup ? 'Pickup' : 'Home',
          address: formattedAddress,
          lat: checkoutDraft.latitude || 31.4750,
          lng: checkoutDraft.longitude || 74.4200
        },
        payment_method: chosenPayment
      };

      const result = await api.post('/api/chat/checkout', payload);
      if (!result.success) throw new Error(result.message);

      setCheckoutStep(null);
      setCart([]);
      const newOrderId = result.order.order_id;
      activeOrderRef.current = newOrderId;
      setActiveOrderId(newOrderId);
      const socket = getSocket();
      socket.emit('join:order', newOrderId);

      let payNotice = `💵 Cash on Delivery: Please have exact amount (Rs. ${result.order.total_amount}) ready for our rider upon arrival.`;
      if (chosenPayment === 'Online Payment') {
        payNotice = `💳 Online Payment: Verification Pending. Please keep your transaction reference / receipt ready for verification.`;
      } else if (chosenPayment === 'Bank Transfer') {
        payNotice = `🏦 Bank Transfer: Verification Pending. Our staff will confirm your transfer prior to dispatch.`;
      }

      addMessage(`🎉 Order ${newOrderId} Confirmed! Total: ${formatCurrency(result.order.total_amount)}.\n• Payment Method: ${chosenPayment} (${result.order.payment_status || 'Pending'})\n${payNotice}\n\nWe have sent your order straight to our kitchen!`, false, {
        buttons: ['Track Live Delivery', 'Explore Food Menu', 'Review Order']
      });
    } catch (error) {
      addMessage(`❌ Checkout Error: ${error.message}`, false);
      setToast(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCheckoutStepInput = (rawText) => {
    const text = rawText.trim();
    const normalized = text.toLowerCase();

    // Cancellation & Reset Commands
    if (normalized === 'cancel' || normalized === 'start over' || normalized === 'reset') {
      setCheckoutStep(null);
      setCheckoutDraft((prev) => ({ ...prev, locationReceived: false }));
      addMessage('❌ Checkout cancelled. What would you like to explore today?', false, { buttons: ['Explore Food Menu', 'Branch Location'] });
      return true;
    }

    if (normalized === 'menu') {
      setCheckoutStep(null);
      loadMenu();
      return true;
    }

    if (checkoutStep === 'AWAITING_PREVIOUS_DETAILS') {
      if (normalized.includes('use previous') || normalized.includes('previous details')) {
        const prevAddr = customer.addresses?.[0];
        const updated = {
          ...checkoutDraft,
          houseNumber: '42',
          streetNumber: '10',
          area: 'Phase 5 DHA',
          city: 'Lahore',
          latitude: prevAddr?.lat || 31.4750,
          longitude: prevAddr?.lng || 74.4200,
          accuracy: 10,
          locationReceived: true
        };
        setCheckoutDraft(updated);
        setCheckoutStep('AWAITING_DELIVERY_LOCATION');
        addMessage('📍 Please confirm your delivery location coordinates:', false, {
          buttons: ['📍 Share Current Location', '📍 Confirm Saved Pin (31.475, 74.420)', 'Cancel']
        });
        return true;
      } else {
        setCheckoutStep('AWAITING_ORDER_TYPE');
        addMessage('Please select your order type:', false, {
          buttons: ['Home Delivery', 'Self Pickup']
        });
        return true;
      }
    }

    if (checkoutStep === 'AWAITING_ORDER_TYPE') {
      if (normalized.includes('pickup')) {
        const updated = { ...checkoutDraft, orderType: 'PICKUP', paymentMethod: 'Cash on Delivery' };
        setCheckoutDraft(updated);
        setCheckoutStep('AWAITING_PAYMENT_METHOD');
        addMessage('💳 Please choose your payment method for Pickup:\n\n• 💵 Cash on Pickup (Pay at counter)\n• 💳 Online Payment (Card / JazzCash / EasyPaisa)\n• 🏦 Bank Transfer (Direct IBAN transfer)', false, {
          buttons: ['💵 Cash on Pickup', '💳 Online Payment', '🏦 Bank Transfer']
        });
        return true;
      } else {
        const updated = { ...checkoutDraft, orderType: 'DELIVERY' };
        setCheckoutDraft(updated);
        setCheckoutStep('AWAITING_CUSTOMER_NAME');
        addMessage('Step 1/9: Please enter your full name:', false, {
          buttons: customer.name ? [`Use ${customer.name}`] : undefined
        });
        return true;
      }
    }

    if (checkoutStep === 'AWAITING_CUSTOMER_NAME') {
      const val = text.startsWith('Use ') ? text.replace('Use ', '').trim() : text;
      const updated = { ...checkoutDraft, name: val };
      setCheckoutDraft(updated);
      setCheckoutStep('AWAITING_PHONE');
      addMessage(`Step 2/9: Please enter your phone number:`, false, {
        buttons: customer.phone ? [`📱 Confirm ${customer.phone}`] : undefined
      });
      return true;
    }

    if (checkoutStep === 'AWAITING_PHONE') {
      const val = text.includes('Confirm ') ? text.replace('📱 Confirm ', '').trim() : text;
      const updated = { ...checkoutDraft, phone: val };
      setCheckoutDraft(updated);
      setCheckoutStep('AWAITING_HOUSE_NUMBER');
      addMessage('Step 3/9: Please enter your House / Flat / Apartment number:');
      return true;
    }

    if (checkoutStep === 'AWAITING_HOUSE_NUMBER') {
      const updated = { ...checkoutDraft, houseNumber: text };
      setCheckoutDraft(updated);
      setCheckoutStep('AWAITING_STREET_NUMBER');
      addMessage('Step 4/9: Please enter your Street number / Road / Lane:');
      return true;
    }

    if (checkoutStep === 'AWAITING_STREET_NUMBER') {
      const updated = { ...checkoutDraft, streetNumber: text };
      setCheckoutDraft(updated);
      setCheckoutStep('AWAITING_AREA');
      addMessage('Step 5/9: Please enter your Area / Sector / Society (e.g. Phase 5 DHA):');
      return true;
    }

    if (checkoutStep === 'AWAITING_AREA') {
      const updated = { ...checkoutDraft, area: text };
      setCheckoutDraft(updated);
      setCheckoutStep('AWAITING_CITY');
      addMessage('Step 6/9: Please select or enter your City:', false, {
        buttons: ['📍 Lahore', 'Islamabad', 'Karachi']
      });
      return true;
    }

    if (checkoutStep === 'AWAITING_CITY') {
      const val = text.replace('📍 ', '').trim();
      const updated = { ...checkoutDraft, city: val || 'Lahore' };
      setCheckoutDraft(updated);
      setCheckoutStep('AWAITING_LANDMARK');
      addMessage('Step 7/9: Nearest landmark (e.g. Near Jalal Sons, or tap Skip):', false, {
        buttons: ['⏩ Skip Landmark']
      });
      return true;
    }

    if (checkoutStep === 'AWAITING_LANDMARK') {
      const val = normalized.includes('skip') ? '' : text;
      const updated = { ...checkoutDraft, landmark: val };
      setCheckoutDraft(updated);
      setCheckoutStep('AWAITING_INSTRUCTIONS');
      addMessage('Step 8/9: Any special delivery instructions for our rider? (or tap Skip):', false, {
        buttons: ['⏩ Skip Instructions']
      });
      return true;
    }

    if (checkoutStep === 'AWAITING_INSTRUCTIONS') {
      const val = normalized.includes('skip') ? '' : text;
      const updated = { ...checkoutDraft, instructions: val };
      setCheckoutDraft(updated);
      setCheckoutStep('AWAITING_DELIVERY_LOCATION');
      addMessage('Step 9/9: 📍 Please share your exact delivery location so our rider can navigate directly to your doorstep.', false, {
        buttons: ['📍 Share Current Location', '📍 Use Standard DHA Pin', 'Cancel']
      });
      return true;
    }

    if (checkoutStep === 'AWAITING_DELIVERY_LOCATION') {
      if (normalized.includes('share') || normalized.includes('current location')) {
        captureBrowserLocation();
        return true;
      }
      if (normalized.includes('pin') || normalized.includes('standard') || normalized.includes('saved')) {
        applyLocationCoordinates(31.4750, 74.4200, 15);
        return true;
      }
    }

    if (checkoutStep === 'AWAITING_PAYMENT_METHOD') {
      let chosenMethod = 'Cash on Delivery';
      if (normalized.includes('online') || normalized.includes('card') || normalized.includes('jazzcash') || normalized.includes('easypaisa')) {
        chosenMethod = 'Online Payment';
      } else if (normalized.includes('bank') || normalized.includes('transfer') || normalized.includes('iban')) {
        chosenMethod = 'Bank Transfer';
      } else if (normalized.includes('cash') || normalized.includes('pickup') || normalized.includes('counter') || normalized.includes('cod')) {
        chosenMethod = 'Cash on Delivery';
      }

      const updated = { ...checkoutDraft, paymentMethod: chosenMethod };
      setCheckoutDraft(updated);
      setCheckoutStep(updated.orderType === 'PICKUP' ? 'AWAITING_PICKUP_CONFIRMATION' : 'AWAITING_DELIVERY_CONFIRMATION');
      addMessage(`✅ Payment Method selected: ${chosenMethod}.`, false);
      displayOrderConfirmationSummary(updated);
      return true;
    }

    if (checkoutStep === 'AWAITING_DELIVERY_CONFIRMATION' || checkoutStep === 'AWAITING_PICKUP_CONFIRMATION') {
      if (normalized.includes('confirm order') || normalized === 'confirm') {
        executeFinalOrderCheckout();
        return true;
      }
      if (normalized.includes('change payment') || normalized.includes('payment method')) {
        setCheckoutStep('AWAITING_PAYMENT_METHOD');
        addMessage('💳 Please choose your preferred payment method:', false, {
          buttons: ['💵 Cash on Delivery', '💳 Online Payment', '🏦 Bank Transfer']
        });
        return true;
      }
      if (normalized.includes('change name')) {
        setCheckoutStep('AWAITING_CUSTOMER_NAME');
        addMessage('Step 1/9: Please enter your full name:');
        return true;
      }
      if (normalized.includes('change phone')) {
        setCheckoutStep('AWAITING_PHONE');
        addMessage('Step 2/9: Please enter your phone number:');
        return true;
      }
      if (normalized.includes('change address')) {
        setCheckoutStep('AWAITING_HOUSE_NUMBER');
        addMessage('Step 3/9: Please enter your House / Flat / Apartment number:');
        return true;
      }
      if (normalized.includes('change location')) {
        setCheckoutStep('AWAITING_DELIVERY_LOCATION');
        addMessage('Step 9/9: 📍 Please share your exact delivery location:', false, {
          buttons: ['📍 Share Current Location', '📍 Use Standard DHA Pin']
        });
        return true;
      }
    }

    return false;
  };

  const sendMessage = async (value = input) => {
    const text = value.trim();
    if (!text) return;
    setInput('');
    addMessage(text, true);

    // If active in checkout conversation, handle it
    if (checkoutStep) {
      const handled = handleCheckoutStepInput(text);
      if (handled) return;
    }

    const normalized = text.toLowerCase();
    if (normalized.includes('checkout') || normalized === 'place order') {
      return startConversationalCheckout();
    }
    if (normalized.includes('hello') || normalized.includes('hi') || normalized.includes('start') || normalized === 'menu') {
      return addMessage('FeastFlow Restaurant', false, { infoCard: true, buttons: ['Explore Food Menu', 'Reorder Last Meal', 'Branch Location'] });
    }
    if (normalized.includes('food') || normalized.includes('menu')) return loadMenu();
    if (normalized.includes('reward') || normalized.includes('loyalty')) {
      return addMessage(`You have ${customer.loyalty_points || 0} loyalty points. Keep ordering to unlock more FeastFlow rewards!`);
    }
    if (normalized.includes('track') || normalized.includes('order')) return openTrackPrompt();
    if (normalized.includes('reorder') || normalized.includes('same again')) return reorder();
    if (normalized.includes('remind')) {
      try {
        const result = await api.post('/api/chat/reminder/trigger', { phone: customer.phone || defaultPhone });
        addMessage(result.message || 'Reminder request received.');
      } catch (error) { setToast(error.message); }
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
    addMessage(`${selectedItem.name} added to your cart. Total: ${formatCurrency(price)}.`, false, { buttons: ['Proceed to Checkout', 'View Menu'] });
  };

  const checkout = () => {
    startConversationalCheckout();
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
      const targetId = result.order?.order_id || query;
      activeOrderRef.current = targetId;
      setActiveOrderId(targetId);
      setRiderLocation(result.rider?.location || null);
      if (result.rider?.location?.updated_at) {
        setLastLocationTime(result.rider.location.updated_at);
      } else {
        setLastLocationTime(new Date());
      }
      const socket = getSocket();
      if (targetId) {
        socket.emit('join:order', targetId);
      }
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

  const handleButtonClick = (button) => {
    if (button.includes('Location') && !button.includes('Share') && !button.includes('Pin') && !button.includes('Change')) {
      showLocation();
    } else if (button.includes('Reorder') || button.includes('Same')) {
      reorder();
    } else if (button.includes('Checkout')) {
      startConversationalCheckout();
    } else if (button.includes('Track')) {
      openTrackPrompt();
    } else if (button.includes('Review')) {
      setModal('review');
    } else if (button.includes('Share Current Location') || button.includes('Share Location')) {
      captureBrowserLocation();
    } else if (button.includes('Confirm Saved Pin') || button.includes('Use DHA Pin') || button.includes('Use Standard DHA Pin')) {
      applyLocationCoordinates(31.4750, 74.4200, 15);
    } else {
      sendMessage(button);
    }
  };

  const visibleMenu = category ? menu.filter((item) => item.category === category) : menu;
  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-slate-100 font-sans text-slate-800 antialiased">
      <header className="w-full bg-gradient-to-r from-red-900 via-red-950 to-red-900 px-4 py-2.5 text-white shadow-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-base font-extrabold text-red-950 shadow-sm"><i className="fa-solid fa-utensils" /></div><div><h1 className="text-sm font-extrabold leading-tight tracking-wide sm:text-base">FeastFlow Restaurant</h1><p className="hidden text-[11px] font-medium text-amber-200/90 sm:block">Smart AI Food Ordering & Customization</p></div></div><Link to="/staff/login" className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"><i className="fa-solid fa-lock text-[10px]" /> Staff Operations</Link></div>
      </header>
      <main className="flex w-full flex-1 items-center justify-center p-0 sm:px-4 sm:py-6">
        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:h-[840px] sm:w-[410px] sm:rounded-[40px] sm:border-slate-800 sm:ring-[12px] sm:ring-slate-900">
          <div className="hidden h-6 w-full items-center justify-center bg-[#075e54] sm:flex"><div className="h-4 w-28 rounded-b-xl bg-black" /></div>
          <div className="flex shrink-0 items-center justify-between gap-2.5 bg-[#075e54] px-3.5 py-2.5 text-white shadow-sm"><div className="flex min-w-0 items-center gap-2.5"><div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-lg text-white shadow-inner"><i className="fa-solid fa-utensils" /><span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#075e54] bg-[#25d366]" /></div><div className="min-w-0"><div className="flex items-center gap-1.5"><h2 className="truncate text-sm font-bold">FeastFlow Restaurant</h2><i className="fa-solid fa-circle-check text-xs text-[#25d366]" /></div><p className="truncate text-[11px] font-medium text-emerald-200">🟢 Online • {customer.name || 'AI Assistant'} ({customer.customer_level || 'AI Assistant'})</p></div></div><button onClick={() => { setMessages([{ text: 'Chat reset. What would you like to order today?', buttons: ['View Menu'] }]); setCart([]); setCheckoutStep(null); }} className="rounded-full p-2 text-white/90 transition hover:bg-white/10 hover:text-white" aria-label="Reset chat"><i className="fa-solid fa-rotate-right text-xs" /></button></div>
          <div className="wa-chat-texture flex-1 overflow-y-auto p-3.5">{messages.map((message, index) => <Bubble key={`${index}-${message.text}`} mine={message.mine}>{message.infoCard ? <><div className="mb-2 flex items-center gap-2 font-bold text-red-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-900 text-xs text-amber-300"><i className="fa-solid fa-utensils" /></span>FeastFlow Restaurant</div><div className="space-y-1 text-xs text-slate-700"><div>📍 <b>DHA Lahore Branch</b> (Phase 5 Commercial)</div><div>🕒 12:00 PM - 12:00 AM Daily</div><div>🚚 Fast Delivery (DHA, Gulberg, Cantt)</div><div>⭐ 4.8 Rating (1,240 Reviews)</div></div></> : message.returning ? <><b className="text-sm text-emerald-900">👋 {message.text}</b><span className="mt-1 block text-xs font-semibold text-amber-800">⭐ {message.loyalty} Points ({message.level})</span><span className="mt-1 block text-xs text-slate-600">Last Order: <b>{message.lastOrder}</b></span></> : <span className="whitespace-pre-line">{message.text}</span>}{message.buttons && <div className="mt-3 grid gap-2">{message.buttons.map((button) => <button key={button} onClick={() => handleButtonClick(button)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-100">{button}<i className="fa-solid fa-chevron-right float-right mt-0.5 text-[9px]" /></button>)}</div>}{message.menu && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{categories.map((item) => <button key={item._id || item.name} onClick={() => setCategory(item.name)} className="rounded-xl bg-amber-50 p-2 text-[11px] font-bold text-slate-700 shadow-sm transition hover:bg-amber-100">{item.icon || '🍽️'} {item.name}</button>)}</div>}</Bubble>) }{menu.length > 0 && <div className="mb-3 grid gap-3 sm:grid-cols-2">{visibleMenu.map((item) => <div key={item._id} className="overflow-hidden rounded-2xl bg-white shadow-sm"><img src={item.image} alt="" className="h-28 w-full object-cover" /><div className="p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-800">{item.name}</p><p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{item.description}</p></div><b className="whitespace-nowrap text-xs text-red-900">{formatCurrency(item.price)}</b></div><button onClick={() => openCustomizer(item)} className="mt-3 w-full rounded-lg bg-red-900 py-2 text-[10px] font-bold text-white hover:bg-red-800">Customize & Add</button></div></div>)}</div>}{busy && <Bubble><span className="text-slate-400">FeastFlow is typing…</span></Bubble>}<div ref={bottom} /></div>
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-slate-200/90 bg-slate-100 px-2.5 py-2">{[['Menu', 'fa-utensils'], ['Cart', 'fa-basket-shopping'], ['Location', 'fa-location-dot'], ['Track', 'fa-box'], ['Rewards', 'fa-gift']].map(([label, icon]) => <button key={label} onClick={() => label === 'Menu' ? loadMenu() : label === 'Cart' ? startConversationalCheckout() : label === 'Location' ? showLocation() : label === 'Track' ? openTrackPrompt() : addMessage(`You have ${customer.loyalty_points || 0} loyalty points. Your current level is ${customer.customer_level || 'New Customer'}.`)} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#075e54] shadow-sm hover:bg-emerald-50">{label === 'Menu' ? '🍕' : label === 'Cart' ? '🛒' : label === 'Location' ? '📍' : label === 'Track' ? '📦' : '⭐'} {label}</button>)}</div>
          <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-100 p-2"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendMessage()} placeholder={checkoutStep ? "Type your response..." : "Ask about menu or place order..."} className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs shadow-inner outline-none focus:ring-2 focus:ring-emerald-600" /><button onClick={() => sendMessage()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm hover:bg-[#008f6f]" aria-label="Send message"><i className="fa-solid fa-paper-plane text-xs" /></button></div>
          {cart.length > 0 && <button onClick={startConversationalCheckout} className="flex shrink-0 items-center justify-between border-t-2 border-[#25d366] bg-[#075e54] px-4 py-2.5 text-white shadow-lg transition hover:bg-[#064e47]"><span className="flex items-center gap-2 text-xs"><i className="fa-solid fa-basket-shopping text-sm text-emerald-300" /><b>{cart.reduce((sum, item) => sum + item.quantity, 0)} Item{cart.reduce((sum, item) => sum + item.quantity, 0) > 1 ? 's' : ''}</b><span className="text-emerald-300">|</span><strong className="text-sm">{formatCurrency(total)}</strong></span><span className="rounded-full bg-[#25d366] px-3.5 py-1.5 text-xs font-extrabold text-slate-900">Checkout <i className="fa-solid fa-chevron-right ml-1 text-[10px]" /></span></button>}
        </div>
      </main>
      {toast && <Toast message={toast} tone="error" onClose={() => setToast('')} />}
      {modal === 'customize' && selectedItem && <Modal title={`Customize ${selectedItem.name}`} onClose={() => setModal(null)}><div className="space-y-4">{(selectedItem.customization?.flavours || []).length > 0 && <div><label className="mb-2 block text-xs font-bold text-slate-700">Choose flavour</label><select className="input-control" value={wizard.flavour} onChange={(event) => setWizard({ ...wizard, flavour: event.target.value })}>{selectedItem.customization.flavours.map((value) => <option key={value}>{value}</option>)}</select></div>}<div><label className="mb-2 block text-xs font-bold text-slate-700">Choose size</label><div className="grid grid-cols-2 gap-2">{(selectedItem.customization?.sizes || selectedItem.sizes || []).map((value) => <button key={value.name} onClick={() => setWizard({ ...wizard, size: value.name })} className={`rounded-xl border px-3 py-2 text-xs font-bold ${wizard.size === value.name ? 'border-red-900 bg-red-50 text-red-900' : 'border-slate-200 text-slate-600'}`}>{value.name}<span className="mt-1 block text-[10px] font-normal">{formatCurrency(value.price)}</span></button>)}</div></div>{(selectedItem.customization?.crusts || []).length > 0 && <div><label className="mb-2 block text-xs font-bold text-slate-700">Choose crust</label><select className="input-control" value={wizard.crust} onChange={(event) => setWizard({ ...wizard, crust: event.target.value })}>{selectedItem.customization.crusts.map((value) => <option key={value.name}>{value.name}</option>)}</select></div>}{(selectedItem.customization?.extras || selectedItem.customization?.addons || selectedItem.extras || []).length > 0 && <div><label className="mb-2 block text-xs font-bold text-slate-700">Add extras</label>{(selectedItem.customization?.extras || selectedItem.customization?.addons || selectedItem.extras || []).map((value) => <label key={value.name} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs"><span>{value.name} <small className="text-slate-400">+{formatCurrency(value.price)}</small></span><input type="checkbox" checked={wizard.extras.includes(value.name)} onChange={(event) => setWizard({ ...wizard, extras: event.target.checked ? [...wizard.extras, value.name] : wizard.extras.filter((name) => name !== value.name) })} /></label>)}</div>}<button onClick={confirmAdd} className="primary-button w-full">Add to cart</button></div></Modal>}
      {modal === 'review' && <Modal title="Review your order" onClose={() => setModal(null)}><form onSubmit={submitReview} className="space-y-3"><label className="block text-xs font-bold text-slate-700">Rating<select className="input-control mt-1" value={reviewForm.rating} onChange={(event) => setReviewForm({ ...reviewForm, rating: event.target.value })}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{'⭐'.repeat(value)} ({value}/5)</option>)}</select></label><label className="block text-xs font-bold text-slate-700">Food quality<select className="input-control mt-1" value={reviewForm.food_quality} onChange={(event) => setReviewForm({ ...reviewForm, food_quality: event.target.value })}><option>Excellent</option><option>Good</option><option>Average</option><option>Poor</option></select></label><label className="block text-xs font-bold text-slate-700">Delivery speed<select className="input-control mt-1" value={reviewForm.delivery_speed} onChange={(event) => setReviewForm({ ...reviewForm, delivery_speed: event.target.value })}><option>Fast</option><option>On time</option><option>Slow</option></select></label><label className="block text-xs font-bold text-slate-700">Feedback<textarea className="input-control mt-1" rows="3" value={reviewForm.feedback} onChange={(event) => setReviewForm({ ...reviewForm, feedback: event.target.value })} /></label><button className="primary-button w-full">Submit review</button></form></Modal>}
      {modal === 'track' && <Modal title="Live Delivery Tracking" onClose={() => setModal(null)} wide><form onSubmit={findOrder} className="mb-4 flex gap-2"><input name="query" defaultValue={activeOrderId || customer.phone || defaultPhone} placeholder="Order ID or phone number" className="input-control" required /><button className="primary-button">{busy ? 'Searching…' : 'Track'}</button></form>{track ? <div className="space-y-3"><div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs"><div><div className="text-[10px] uppercase text-slate-400">Order ID</div><b>{track.order?.order_id}</b></div><div><div className="text-[10px] uppercase text-slate-400">Status</div><b className="text-emerald-700">{track.order?.order_status}</b></div><div><div className="text-[10px] uppercase text-slate-400">Assigned Rider</div><b>{track.rider?.name || track.order?.rider_name || 'Rider Ali'}</b></div></div><MapPanel track={track} riderLocation={riderLocation} lastUpdated={lastLocationTime} />{track.rider && <p className="text-xs text-slate-600"><i className="fa-solid fa-motorcycle mr-2 text-red-900" />{track.rider.name} · {track.rider.phone}</p>}</div> : <p className="py-8 text-center text-xs text-slate-500">Enter an order ID or phone number to see live status.</p>}</Modal>}
    </div>
  );
}