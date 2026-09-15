import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, getUser } from '../services/api';
import { getSocket } from '../services/socket';
import { formatCurrency, formatDateTime } from '../utils/format';
import { Modal, PortalHeader, StatusBadge, Toast } from '../components/Portal';

function RiderMap({ location, customerLocation, branchLocation }) {
  const element = useRef(null);
  useEffect(() => {
    if (!element.current) return undefined;
    const center = [customerLocation?.lat || location?.lat || 31.4704, customerLocation?.lng || location?.lng || 74.4101];
    const map = L.map(element.current).setView(center, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    const icon = (emoji) => L.divIcon({ className: 'map-icon', html: `<span style="font-size:26px">${emoji}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });

    if (branchLocation?.lat && branchLocation?.lng) {
      L.marker([branchLocation.lat, branchLocation.lng], { icon: icon('🏪') }).addTo(map).bindPopup(`<b>${branchLocation.name || 'FeastFlow Branch'}</b><br/>${branchLocation.address || ''}`);
    }
    if (customerLocation?.lat && customerLocation?.lng) {
      L.marker([customerLocation.lat, customerLocation.lng], { icon: icon('🏠') }).addTo(map).bindPopup('<b>Customer Delivery Location</b>').openPopup();
    }
    if (location?.lat && location?.lng) {
      L.marker([location.lat, location.lng], { icon: icon('🏍️') }).addTo(map).bindPopup('Your Live Location');
    }

    return () => map.remove();
  }, [location, customerLocation, branchLocation]);

  return <div ref={element} className="h-64 w-full overflow-hidden rounded-2xl border border-slate-200" />;
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return 999;
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function RiderDashboard() {
  const user = getUser();
  const [assignment, setAssignment] = useState(null);
  const [location, setLocation] = useState({ lat: 31.4704, lng: 74.4101 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', tone: 'success' });
  const [modal, setModal] = useState(false);
  const [gpsState, setGpsState] = useState('IDLE'); // 'IDLE' | 'REQUESTING' | 'ACTIVE' | 'ERROR'
  const [gpsErrorMsg, setGpsErrorMsg] = useState('');
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [lastGpsTime, setLastGpsTime] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const watchIdRef = useRef(null);
  const lastSentTimeRef = useRef(0);
  const lastSentCoordsRef = useRef(null);
  const riderId = user?.rider_id || 'RIDER-101';

  const isHttps = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const stopLiveTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsState('IDLE');
  };

  useEffect(() => {
    return () => {
      stopLiveTracking();
    };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get(`/api/rider/assigned/${riderId}`);
      setAssignment(result);
      if (result.rider?.current_location) {
        setLocation(result.rider.current_location);
        setLastGpsTime(result.rider.current_location.updated_at || new Date());
      }

      const status = String(result.active_order?.order_status || '').toUpperCase().replace(/[\s-]+/g, '_');
      if (status !== 'OUT_FOR_DELIVERY') {
        stopLiveTracking();
      }
    } catch (error) {
      setToast({ message: error.message, tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const socket = getSocket();
    setSocketConnected(socket.connected);

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onUpdate = () => load();
    const onAssigned = (data) => {
      if (!data || !data.rider_id || data.rider_id === riderId) load();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('order:updated', onUpdate);
    socket.on('rider:assigned', onAssigned);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('order:updated', onUpdate);
      socket.off('rider:assigned', onAssigned);
    };
  }, [riderId]);

  // Unified location submission pipeline
  const sendLocationUpdate = async ({ latitude, longitude, accuracy, timestamp = new Date() }, isManual = false) => {
    const orderId = assignment?.active_order?.order_id;
    if (!orderId) return;

    try {
      // 1. Post to authenticated backend route
      await api.post('/api/rider/location', {
        rider_id: riderId,
        order_id: orderId,
        orderId,
        latitude,
        longitude,
        accuracy: Number(accuracy) || 10,
        timestamp
      });

      // 2. Direct socket forward to order room
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit('rider:location:send', {
          orderId,
          order_id: orderId,
          latitude,
          longitude,
          lat: latitude,
          lng: longitude,
          accuracy: Number(accuracy) || 10,
          timestamp
        });
      }

      setLocation({ lat: latitude, lng: longitude });
      setLastGpsTime(timestamp);
      setGpsAccuracy(accuracy);
      setGpsState('ACTIVE');
      setGpsErrorMsg('');
      lastSentTimeRef.current = Date.now();
      lastSentCoordsRef.current = { lat: latitude, lng: longitude };

      if (isManual) {
        setToast({ message: 'GPS coordinates synced with dispatch & customer.', tone: 'success' });
      }
    } catch (err) {
      console.warn('Location sync failed:', err);
      if (isManual) {
        setToast({ message: err.message, tone: 'error' });
      }
    }
  };

  const updateStatus = async (status) => {
    if (!assignment?.active_order) return;
    try {
      if (status === 'DELIVERED' || status === 'CANCELLED') {
        stopLiveTracking();
      }
      await api.post('/api/rider/status', {
        rider_id: riderId,
        order_id: assignment.active_order.order_id,
        status
      });
      setToast({ message: `Order status updated to ${status}.`, tone: 'success' });
      load();
    } catch (error) {
      setToast({ message: error.message, tone: 'error' });
    }
  };

  const handleStartDelivery = async () => {
    if (!assignment?.active_order) return;
    if (!navigator.geolocation) {
      setToast({ message: 'GPS Geolocation is not supported by your browser.', tone: 'error' });
      setGpsState('ERROR');
      setGpsErrorMsg('Browser does not support GPS Geolocation.');
      return;
    }

    setGpsState('REQUESTING');
    setToast({ message: 'Requesting precise GPS location…', tone: 'success' });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        const now = new Date(position.timestamp || Date.now());

        try {
          // 1. Advance status to OUT_FOR_DELIVERY
          await api.post('/api/rider/status', {
            rider_id: riderId,
            order_id: assignment.active_order.order_id,
            status: 'OUT_FOR_DELIVERY'
          });

          // 2. Push initial location fix
          await sendLocationUpdate({ latitude: lat, longitude: lng, accuracy, timestamp: now });

          // 3. Start continuous watchPosition
          stopLiveTracking();
          const watchId = navigator.geolocation.watchPosition(
            (pos) => {
              const nextLat = pos.coords.latitude;
              const nextLng = pos.coords.longitude;
              const nextAcc = pos.coords.accuracy;
              const nowMs = Date.now();

              const prevCoords = lastSentCoordsRef.current;
              const distanceMoved = prevCoords ? calculateDistanceMeters(prevCoords.lat, prevCoords.lng, nextLat, nextLng) : 999;
              const timeElapsedMs = nowMs - (lastSentTimeRef.current || 0);

              // Throttle: Send if moved >= 5m OR time elapsed >= 5000ms
              if (distanceMoved >= 5 || timeElapsedMs >= 5000) {
                sendLocationUpdate({
                  latitude: nextLat,
                  longitude: nextLng,
                  accuracy: nextAcc,
                  timestamp: new Date(pos.timestamp || nowMs)
                });
              } else {
                // Update local marker
                setLocation({ lat: nextLat, lng: nextLng });
                setGpsAccuracy(nextAcc);
              }
            },
            (err) => {
              console.warn('GPS WatchPosition Error:', err);
              setGpsState('ERROR');
              let errText = 'GPS error occurred.';
              if (err.code === 1) errText = 'Location permission denied. Please allow GPS and select "Precise Location".';
              if (err.code === 2) errText = 'GPS position unavailable. Ensure device GPS is active.';
              if (err.code === 3) errText = 'GPS timed out. Retrying…';
              setGpsErrorMsg(errText);
              setToast({ message: errText, tone: 'error' });
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
          );

          watchIdRef.current = watchId;
          setGpsState('ACTIVE');
          setToast({ message: '🚀 Delivery started! Live GPS tracking active.', tone: 'success' });
          load();
        } catch (error) {
          stopLiveTracking();
          setToast({ message: error.message, tone: 'error' });
        }
      },
      (error) => {
        stopLiveTracking();
        setGpsState('ERROR');
        let msg = 'Unable to acquire accurate GPS location.';
        if (error.code === 1) msg = 'Location permission denied. Please enable Precise Location and GPS permissions.';
        if (error.code === 2) msg = 'GPS signal unavailable. Ensure location services are turned on.';
        if (error.code === 3) msg = 'GPS acquisition timed out. Please try again.';
        setGpsErrorMsg(msg);
        setToast({ message: msg, tone: 'error' });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  const shareOneTimeLocation = async () => {
    if (!navigator.geolocation) {
      return setToast({ message: 'GPS Geolocation is not available in this browser.', tone: 'error' });
    }
    setToast({ message: 'Getting current GPS fix…', tone: 'success' });
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp || Date.now())
        };
        await sendLocationUpdate(next, true);
      },
      (err) => {
        let msg = 'Location permission was not granted.';
        if (err.code === 1) msg = 'Location permission denied in browser/settings.';
        if (err.code === 2) msg = 'GPS position unavailable.';
        setToast({ message: msg, tone: 'error' });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  const order = assignment?.active_order;
  const branch = assignment?.branch || { lat: 31.4704, lng: 74.4101, name: 'FeastFlow DHA Branch', address: 'Phase 5 Commercial DHA, Lahore', phone: '042-35894120' };

  const customerLat = order?.deliveryLocation?.latitude ?? order?.delivery_address?.lat ?? 31.4750;
  const customerLng = order?.deliveryLocation?.longitude ?? order?.delivery_address?.lng ?? 74.4200;
  const customerPhone = order?.customer?.phone || order?.customer_phone;
  const customerName = order?.customer?.name || order?.customer_name;

  const currentStatus = String(order?.order_status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const isBeforePickup = ['RIDER_ASSIGNED', 'RIDER_ACCEPTED', 'READY_FOR_PICKUP', 'CONFIRMED', 'PREPARING', 'RECEIVED', 'READY'].includes(currentStatus);

  return (
    <div className="min-h-screen bg-amber-50/40">
      <PortalHeader
        title="FeastFlow Rider Portal"
        subtitle="Assigned deliveries • Customer information • Live GPS"
        icon="fa-motorcycle"
        onLogout={stopLiveTracking}
      />
      <main className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-4">
        {/* Mobile HTTPS & Background Throttling Guidance */}
        {!isHttps && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm flex items-start gap-2.5">
            <i className="fa-solid fa-triangle-exclamation mt-0.5 text-amber-600 text-sm" />
            <div>
              <b>HTTPS Recommended for Mobile GPS:</b> Mobile browsers block geolocation over insecure HTTP. When testing remotely via ngrok, open the <code>https://</code> URL.
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-3 text-[11px] text-blue-900 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <i className="fa-solid fa-mobile-screen-button text-blue-600" />
            <b>Mobile Test Mode:</b> Keep this browser tab open and active while riding/moving.
          </span>
          <span className={`inline-flex items-center gap-1 font-bold ${socketConnected ? 'text-emerald-700' : 'text-amber-700'}`}>
            <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            {socketConnected ? 'Socket Connected' : 'Reconnecting…'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">Good day, {assignment?.rider?.name || user?.name || 'Rider'}</h2>
            <p className="text-xs text-slate-500">Rider ID: <b>{riderId}</b> • Keep your status and location up to date.</p>
          </div>
          <button onClick={load} className="secondary-button">
            <i className="fa-solid fa-rotate mr-1" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="rounded-3xl bg-white p-12 text-center text-xs text-slate-400">
            <i className="fa-solid fa-spinner fa-spin mr-2" />Loading your assignment…
          </div>
        ) : order ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active delivery</p>
                  <h3 className="mt-1 text-xl font-extrabold text-slate-900">#{order.order_id}</h3>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(order.createdAt || order.created_at)}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={order.order_status} />
                  {currentStatus === 'OUT_FOR_DELIVERY' && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      Live Tracking Active
                    </span>
                  )}
                </div>
              </div>

              {/* Safe Diagnostics Card */}
              <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-200/80 p-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <i className="fa-solid fa-satellite-dish text-emerald-600" /> GPS Diagnostics
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    gpsState === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                    gpsState === 'REQUESTING' ? 'bg-amber-100 text-amber-800' :
                    gpsState === 'ERROR' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {gpsState === 'ACTIVE' ? '🟢 GPS Active' :
                     gpsState === 'REQUESTING' ? '🟡 Requesting GPS…' :
                     gpsState === 'ERROR' ? '🔴 GPS Error' : '⚪ Standby'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] text-slate-600">
                  <div>Coordinates: <b>{location?.lat?.toFixed(5) || '—'}, {location?.lng?.toFixed(5) || '—'}</b></div>
                  <div>Accuracy: <b>{gpsAccuracy ? `±${Math.round(gpsAccuracy)}m` : 'Normal'}</b></div>
                  <div className="col-span-2 text-slate-400 text-[10px]">
                    {lastGpsTime ? `Last synced at: ${new Date(lastGpsTime).toLocaleTimeString()}` : 'No sync recorded yet'}
                    {gpsErrorMsg && <span className="block mt-0.5 text-red-600 font-medium">⚠️ {gpsErrorMsg}</span>}
                  </div>
                </div>
              </div>

              {/* Customer & Collection summary */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-3.5">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Customer Details</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{customerName || 'Customer'}</p>
                  <p className="text-xs text-slate-600">{customerPhone}</p>
                  {customerPhone && (
                    <a href={`tel:${customerPhone}`} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-emerald-500">
                      <i className="fa-solid fa-phone text-[10px]" /> Call Customer
                    </a>
                  )}
                </div>
                <div className="rounded-2xl bg-slate-50 p-3.5">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Collection & Payment</p>
                  <p className="mt-1 text-sm font-bold text-red-900">{formatCurrency(order.total_amount)}</p>
                  <p className="text-xs text-slate-600">{order.payment_method || 'Cash on Delivery'} • <b className="text-amber-700">{order.payment_status || 'Pending'}</b></p>
                </div>
              </div>

              {/* Complete Delivery Address */}
              <div className="mt-3 rounded-2xl border border-slate-200 p-4 text-xs">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <i className="fa-solid fa-location-dot text-red-700" />
                  <span>Customer Drop-off Location</span>
                </div>
                <p className="mt-1.5 font-medium text-slate-800">
                  {order.deliveryAddress?.formattedAddress || order.delivery_address?.address || 'Customer address'}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                  {order.deliveryAddress?.houseNumber && <div>House/Flat: <b>{order.deliveryAddress.houseNumber}</b></div>}
                  {order.deliveryAddress?.streetNumber && <div>Street: <b>{order.deliveryAddress.streetNumber}</b></div>}
                  {order.deliveryAddress?.area && <div>Area: <b>{order.deliveryAddress.area}</b></div>}
                  {order.deliveryAddress?.city && <div>City: <b>{order.deliveryAddress.city}</b></div>}
                </div>
                {order.deliveryAddress?.landmark && (
                  <p className="mt-2 text-[11px] font-medium text-amber-800">
                    <i className="fa-solid fa-monument mr-1" /> Landmark: {order.deliveryAddress.landmark}
                  </p>
                )}
                {order.deliveryAddress?.instructions && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    <i className="fa-solid fa-note-sticky mr-1" /> Note: {order.deliveryAddress.instructions}
                  </p>
                )}
              </div>

              {/* Restaurant Pickup Details */}
              <div className="mt-3 rounded-2xl bg-amber-50/70 p-3.5 text-xs text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-950">
                    <i className="fa-solid fa-store mr-1.5 text-amber-800" /> Pickup: {branch.name}
                  </span>
                  <a href={`tel:${branch.phone}`} className="text-[11px] font-bold text-blue-700 hover:underline">
                    {branch.phone}
                  </a>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">{branch.address}</p>
              </div>

              {/* Navigation Action Buttons with Exact Coordinates */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${customerLat},${customerLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition ${!isBeforePickup ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'}`}
                >
                  <i className="fa-solid fa-diamond-turn-right" /> Navigate to Customer
                </a>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${branch.lat},${branch.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-bold transition ${isBeforePickup ? 'border-amber-600 bg-amber-600 text-white shadow-md' : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'}`}
                >
                  <i className="fa-solid fa-store" /> Navigate to Restaurant
                </a>
              </div>

              {/* Order Items list */}
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold uppercase text-slate-400">Order Items</p>
                {(order.items || []).map((item, index) => (
                  <div className="flex justify-between text-xs font-medium text-slate-800" key={index}>
                    <span>{item.quantity}× {item.name} {item.size ? `(${item.size})` : ''}</span>
                    <span className="font-semibold text-slate-600">{formatCurrency(item.total_price || item.unit_price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              {/* Sequential Delivery Workflow Action Buttons */}
              <div className="mt-5 flex flex-wrap gap-2">
                {/* Step 1: Accept Delivery */}
                {(['RIDER_ASSIGNED', 'READY_FOR_PICKUP', 'CONFIRMED', 'PREPARING', 'RECEIVED', 'READY'].includes(currentStatus)) && (
                  <button onClick={() => updateStatus('RIDER_ACCEPTED')} className="primary-button flex-1 bg-blue-700 hover:bg-blue-800">
                    <i className="fa-solid fa-handshake mr-1" /> Accept Delivery
                  </button>
                )}

                {/* Step 2: Pick Up Order from Restaurant */}
                {currentStatus === 'RIDER_ACCEPTED' && (
                  <button onClick={() => updateStatus('PICKED_UP')} className="primary-button flex-1 bg-amber-600 hover:bg-amber-700">
                    <i className="fa-solid fa-box mr-1" /> Pick Up from Restaurant
                  </button>
                )}

                {/* Step 3: Start Delivery & Activate Live GPS */}
                {currentStatus === 'PICKED_UP' && (
                  <button onClick={handleStartDelivery} className="primary-button flex-1 bg-emerald-600 hover:bg-emerald-700 shadow-md">
                    <i className="fa-solid fa-motorcycle mr-1" /> Start Delivery & Live GPS
                  </button>
                )}

                {/* Step 4: Mark Delivered */}
                {currentStatus === 'OUT_FOR_DELIVERY' && (
                  <button onClick={() => setModal(true)} className="primary-button flex-1 bg-emerald-700 hover:bg-emerald-800">
                    <i className="fa-solid fa-circle-check mr-1" /> Mark Delivered
                  </button>
                )}

                {/* One-time Share GPS sync */}
                <button onClick={shareOneTimeLocation} className="secondary-button">
                  <i className="fa-solid fa-location-crosshairs mr-1" /> Share GPS
                </button>
              </div>
            </div>

            <RiderMap
              location={location}
              customerLocation={{ lat: customerLat, lng: customerLng }}
              branchLocation={{ lat: branch.lat, lng: branch.lng, name: branch.name, address: branch.address }}
            />
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <i className="fa-solid fa-motorcycle mb-3 text-4xl text-slate-200" />
            <h3 className="text-sm font-extrabold text-slate-700">No active delivery</h3>
            <p className="mt-1 text-xs text-slate-400">Dispatch will show your next assigned order here.</p>
          </div>
        )}

        {toast.message && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast({ message: '', tone: 'success' })} />}
      </main>

      {modal && (
        <Modal title="Complete delivery" onClose={() => setModal(false)}>
          <p className="mb-5 text-xs leading-relaxed text-slate-500">
            Confirm that order <b>#{order?.order_id}</b> has been delivered to <b>{customerName}</b> and collection of <b>{formatCurrency(order?.total_amount)}</b> is complete.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setModal(false)} className="secondary-button flex-1">
              Cancel
            </button>
            <button
              onClick={() => {
                setModal(false);
                updateStatus('DELIVERED');
              }}
              className="primary-button flex-1 bg-emerald-700 hover:bg-emerald-800"
            >
              Confirm Delivered
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}