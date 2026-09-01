import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, getUser } from '../services/api';
import { getSocket } from '../services/socket';
import { formatCurrency, formatDateTime } from '../utils/format';
import { Modal, PortalHeader, StatusBadge, Toast } from '../components/Portal';

function RiderMap({ location }) {
  const element = useRef(null);
  useEffect(() => {
    if (!element.current || !location) return undefined;
    const map = L.map(element.current).setView([location.lat, location.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    L.marker([location.lat, location.lng]).addTo(map).bindPopup('Your current location').openPopup();
    return () => map.remove();
  }, [location]);
  return <div ref={element} className="h-56 w-full overflow-hidden rounded-2xl border border-slate-200" />;
}

export default function RiderDashboard() {
  const user = getUser();
  const [assignment, setAssignment] = useState(null);
  const [location, setLocation] = useState({ lat: 31.4704, lng: 74.4101 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ message: '', tone: 'success' });
  const [modal, setModal] = useState(false);
  const riderId = user?.rider_id || 'RIDER-101';

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get(`/api/rider/assigned/${riderId}`);
      setAssignment(result);
      if (result.rider?.current_location) setLocation(result.rider.current_location);
    } catch (error) { setToast({ message: error.message, tone: 'error' }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const socket = getSocket();
    const onUpdate = () => load();
    socket.on('order:updated', onUpdate);
    return () => socket.off('order:updated', onUpdate);
  }, []);

  const updateStatus = async (status) => {
    if (!assignment?.active_order) return;
    try {
      await api.post('/api/rider/status', { rider_id: riderId, order_id: assignment.active_order.order_id, status });
      setToast({ message: `Delivery marked ${status}.`, tone: 'success' });
      load();
    } catch (error) { setToast({ message: error.message, tone: 'error' }); }
  };

  const shareLocation = async () => {
    if (!navigator.geolocation) return setToast({ message: 'GPS is not available in this browser.', tone: 'error' });
    navigator.geolocation.getCurrentPosition(async (position) => {
      const next = { lat: position.coords.latitude, lng: position.coords.longitude };
      setLocation(next);
      try {
        await api.post('/api/rider/location', { rider_id: riderId, order_id: assignment?.active_order?.order_id, ...next });
        setToast({ message: 'GPS location shared with dispatch.', tone: 'success' });
      } catch (error) { setToast({ message: error.message, tone: 'error' }); }
    }, () => setToast({ message: 'Location permission was not granted.', tone: 'error' }));
  };

  const order = assignment?.active_order;
  return <div className="min-h-screen bg-amber-50/40"><PortalHeader title="FeastFlow Rider Portal" subtitle="Assigned deliveries • Customer information • GPS location" icon="fa-motorcycle" /><main className="mx-auto w-full max-w-2xl p-4 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-slate-900">Good day, {assignment?.rider?.name || user?.name || 'Rider'}</h2><p className="text-xs text-slate-500">Keep your status and location up to date.</p></div><button onClick={load} className="secondary-button"><i className="fa-solid fa-rotate mr-1" /> Refresh</button></div>{loading ? <div className="rounded-3xl bg-white p-12 text-center text-xs text-slate-400"><i className="fa-solid fa-spinner fa-spin mr-2" />Loading your assignment…</div> : order ? <div className="space-y-4"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active delivery</p><h3 className="mt-1 text-xl font-extrabold text-slate-900">#{order.order_id}</h3><p className="mt-1 text-xs text-slate-500">{formatDateTime(order.createdAt || order.created_at)}</p></div><StatusBadge status={order.order_status} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Customer</p><p className="mt-1 text-sm font-bold text-slate-800">{order.customer_name}</p><p className="text-xs text-slate-500">{order.customer_phone}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Collection</p><p className="mt-1 text-sm font-bold text-red-900">{formatCurrency(order.total_amount)}</p><p className="text-xs text-slate-500">{order.payment_method || 'Cash on Delivery'}</p></div></div><div className="mt-3 rounded-2xl border border-slate-200 p-3 text-xs text-slate-600"><i className="fa-solid fa-location-dot mr-2 text-red-800" />{order.delivery_address?.address || 'Customer address unavailable'}</div><div className="mt-4 space-y-2 border-t border-slate-100 pt-4">{(order.items || []).map((item, index) => <div className="flex justify-between text-xs" key={index}><span>{item.quantity}× {item.name}</span><span className="text-slate-500">{item.size}</span></div>)}</div><div className="mt-5 flex flex-wrap gap-2">{order.order_status === 'Ready' && <button onClick={() => updateStatus('Out for Delivery')} className="primary-button flex-1">Start delivery</button>}{order.order_status === 'Out for Delivery' && <button onClick={() => setModal(true)} className="primary-button flex-1">Mark delivered</button>}<button onClick={shareLocation} className="secondary-button"><i className="fa-solid fa-location-crosshairs mr-1" /> Share GPS</button></div></div><RiderMap location={location} /></div> : <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm"><i className="fa-solid fa-motorcycle mb-3 text-4xl text-slate-200" /><h3 className="text-sm font-extrabold text-slate-700">No active delivery</h3><p className="mt-1 text-xs text-slate-400">Dispatch will show your next assigned order here.</p></div>}{toast.message && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast({ message: '', tone: 'success' })} />}</main>{modal && <Modal title="Complete delivery" onClose={() => setModal(false)}><p className="mb-5 text-xs leading-relaxed text-slate-500">Confirm that order <b>#{order?.order_id}</b> has been delivered to the customer.</p><div className="flex gap-2"><button onClick={() => setModal(false)} className="secondary-button flex-1">Cancel</button><button onClick={() => { setModal(false); updateStatus('Delivered'); }} className="primary-button flex-1">Confirm delivered</button></div></Modal>}</div>;
}