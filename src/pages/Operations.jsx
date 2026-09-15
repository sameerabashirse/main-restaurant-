import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, getUser } from '../services/api';
import { getSocket } from '../services/socket';
import { formatCurrency, formatDateTime } from '../utils/format';
import { DataTable, EmptyState, Modal, PortalLayout, StatCard, StatusBadge, Toast } from '../components/Portal';

function useOperationsData(role, active, notify) {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const load = async (tab = active) => {
    setLoading(true);
    try {
      if (tab === 'tracking') {
        const [riders, branches] = await Promise.all([api.get('/api/admin/riders'), api.get('/api/admin/branches')]);
        setData((old) => ({ ...old, riders, branches }));
        return;
      }
      const result = tab === 'overview' ? await api.get('/api/admin/analytics')
        : tab === 'orders' ? await api.get('/api/admin/orders')
          : tab === 'kitchen' ? await api.get('/api/admin/kitchen/orders')
            : tab === 'menu' ? await api.get('/api/admin/menu')
              : tab === 'crm' ? await api.get('/api/admin/customers')
                : tab === 'payments' ? await api.get('/api/admin/payments')
                  : tab === 'branches' ? await api.get('/api/admin/branches')
                    : tab === 'riders' || tab === 'tracking' ? await api.get('/api/admin/riders')
                      : tab === 'reviews' ? await api.get('/api/admin/reviews')
                        : tab === 'whatsapp' ? await api.get('/api/admin/whatsapp/inbox')
                          : tab === 'settings' ? await api.get('/api/admin/settings')
                            : tab === 'audit' ? await api.get('/api/admin/audit-logs')
                              : {};
      setData((old) => ({ ...old, [tab]: result }));
    } catch (error) { notify(error.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(active); }, [active]);
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => load(active);
    const onCreated = (order) => {
      if (role === 'kitchen') playKitchenAlertSound();
      refresh(order);
    };
    socket.on('order:created', onCreated);
    socket.on('order:updated', refresh);
    socket.on('rider:location', refresh);
    return () => {
      socket.off('order:created', onCreated);
      socket.off('order:updated', refresh);
      socket.off('rider:location', refresh);
    };
  }, [active]);
  return { data, loading, load };
}

function playKitchenAlertSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(587.33, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch {}
}

function LiveMap({ riders = [], branches = [] }) {
  const element = useRef(null);
  useEffect(() => {
    if (!element.current) return undefined;
    const map = L.map(element.current).setView([31.4704, 74.4101], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    const icon = (emoji) => L.divIcon({ className: 'map-icon', html: `<span style="font-size:25px">${emoji}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    branches.forEach((branch) => branch.lat && L.marker([branch.lat, branch.lng], { icon: icon('🏪') }).addTo(map).bindPopup(branch.name));
    riders.forEach((rider) => rider.current_location?.lat && L.marker([rider.current_location.lat, rider.current_location.lng], { icon: icon('🏍️') }).addTo(map).bindPopup(rider.name));
    return () => map.remove();
  }, [riders, branches]);
  return <div ref={element} className="h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200" />;
}

function Overview({ result }) {
  const metrics = result?.metrics || {};
  return <div className="space-y-5"><div><h2 className="section-title">Operations Overview</h2><p className="text-xs text-slate-500">A live view of FeastFlow restaurant performance.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Today's orders" value={metrics.today_orders_count ?? '—'} icon="fa-receipt" /><StatCard label="Today's revenue" value={metrics.today_revenue != null ? formatCurrency(metrics.today_revenue) : '—'} icon="fa-chart-line" tone="green" /><StatCard label="Pending orders" value={metrics.pending_orders_count ?? '—'} icon="fa-hourglass-half" tone="amber" /><StatCard label="Active riders" value={metrics.active_riders ?? '—'} icon="fa-motorcycle" tone="blue" /></div><div className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-5"><h3 className="mb-4 text-sm font-extrabold text-slate-900">Customer snapshot</h3><div className="grid grid-cols-2 gap-3 text-xs"><p className="rounded-xl bg-slate-50 p-3 text-slate-500">Total customers <b className="mt-1 block text-lg text-slate-900">{metrics.total_customers ?? '—'}</b></p><p className="rounded-xl bg-slate-50 p-3 text-slate-500">Average rating <b className="mt-1 block text-lg text-slate-900">{metrics.average_rating ?? '—'} ★</b></p><p className="rounded-xl bg-slate-50 p-3 text-slate-500">Completed orders <b className="mt-1 block text-lg text-slate-900">{metrics.completed_orders_count ?? '—'}</b></p><p className="rounded-xl bg-slate-50 p-3 text-slate-500">Repeat customers <b className="mt-1 block text-lg text-slate-900">{metrics.repeat_customers_rate ?? '—'}%</b></p></div></div><div className="rounded-2xl border border-slate-200 p-5"><h3 className="mb-4 text-sm font-extrabold text-slate-900">Best sellers</h3>{result?.best_sellers?.length ? <div className="space-y-3">{result.best_sellers.map((item) => <div key={item.name} className="flex items-center gap-3 text-xs"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><i className="fa-solid fa-fire" /></span><span className="flex-1 font-semibold text-slate-700">{item.name}</span><b className="text-slate-900">{item.count} orders</b></div>)}</div> : <EmptyState icon="fa-chart-simple" title="No sales yet" />}</div></div></div>;
}

function OrderLocationMap({ order }) {
  const element = useRef(null);
  useEffect(() => {
    if (!element.current || !order) return undefined;
    const lat = order.deliveryLocation?.latitude ?? order.delivery_address?.lat ?? 31.4704;
    const lng = order.deliveryLocation?.longitude ?? order.delivery_address?.lng ?? 74.4101;
    const map = L.map(element.current).setView([lat, lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
    const icon = (emoji) => L.divIcon({ className: 'map-icon', html: `<span style="font-size:26px">${emoji}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    L.marker([31.4704, 74.4101], { icon: icon('🍽️') }).addTo(map).bindPopup('FeastFlow Restaurant DHA');
    L.marker([lat, lng], { icon: icon('🏠') }).addTo(map).bindPopup(`<b>${order.customer?.name || order.customer_name || 'Customer'}</b><br/>${order.deliveryAddress?.formattedAddress || order.delivery_address?.address || ''}`).openPopup();
    return () => map.remove();
  }, [order]);
  return <div ref={element} className="h-64 w-full overflow-hidden rounded-2xl border border-slate-200" />;
}

function Orders({ result, riders = [], role, onRefresh, notify }) {
  const orders = result?.orders || [];
  const [selectedOrder, setSelectedOrder] = useState(null);
  const update = async (orderId, payload) => {
    try {
      await api.put(`/api/admin/orders/${orderId}/status`, payload);
      notify('Order updated successfully.');
      onRefresh();
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="section-title">Order Management</h2>
          <p className="text-xs text-slate-500">Live order queue, customer delivery details, and rider assignments.</p>
        </div>
        <button onClick={onRefresh} className="secondary-button">
          <i className="fa-solid fa-rotate mr-1" /> Refresh
        </button>
      </div>

      <DataTable
        rows={orders}
        emptyText="No orders in the queue."
        columns={[
          { key: 'order_id', label: 'Order', render: (row) => <span className="font-mono font-bold text-slate-900">{row.order_id}</span> },
          {
            key: 'customer_name',
            label: 'Customer',
            render: (row) => (
              <div>
                <b>{row.customer?.name || row.customer_name || 'Guest'}</b>
                <small className="block text-slate-400">{row.customer?.phone || row.customer_phone}</small>
              </div>
            )
          },
          {
            key: 'delivery_details',
            label: 'Delivery Address',
            render: (row) => {
              const isPickup = (row.orderType === 'PICKUP' || row.delivery_type === 'Pickup');
              if (isPickup) return <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">🏪 Pickup (DHA Branch)</span>;
              const addr = row.deliveryAddress?.formattedAddress || row.delivery_address?.address || 'Phase 5 DHA, Lahore';
              return (
                <div className="max-w-[200px] text-xs">
                  <p className="line-clamp-2 text-[11px] font-medium text-slate-700">{addr}</p>
                  {row.deliveryAddress?.landmark && <span className="block text-[10px] text-amber-700">📌 Near: {row.deliveryAddress.landmark}</span>}
                  {row.deliveryAddress?.instructions && <span className="block text-[10px] text-slate-500">📝 {row.deliveryAddress.instructions}</span>}
                </div>
              );
            }
          },
          {
            key: 'location_status',
            label: 'Location',
            render: (row) => {
              const isPickup = (row.orderType === 'PICKUP' || row.delivery_type === 'Pickup');
              if (isPickup) return <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">Store Pickup</span>;
              const lat = row.deliveryLocation?.latitude ?? row.delivery_address?.lat;
              const lng = row.deliveryLocation?.longitude ?? row.delivery_address?.lng;
              if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
                return (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <i className="fa-solid fa-circle-check text-[9px]" /> Verified
                    </span>
                    <button onClick={() => setSelectedOrder(row)} className="rounded p-1 text-xs text-blue-600 hover:bg-blue-50" title="View Customer Location">
                      <i className="fa-solid fa-map-location-dot" />
                    </button>
                  </div>
                );
              }
              return (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                  <i className="fa-solid fa-triangle-exclamation text-[9px]" /> Location Missing
                </span>
              );
            }
          },
          {
            key: 'total_amount',
            label: 'Amount & Collection',
            render: (row) => (
              <div>
                <b className="text-slate-900">{formatCurrency(row.total_amount)}</b>
                <span className="block text-[10px] text-slate-500 font-medium">
                  {row.payment_method || 'Cash on Delivery'} • <span className="text-amber-700 font-semibold">{row.payment_status || 'Pending'}</span>
                </span>
                {row.cashReceivedByRider && (
                  <div className="mt-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 leading-tight" title={`Collected at: ${formatDateTime(row.cashReceivedAt)}`}>
                    <i className="fa-solid fa-hand-holding-dollar text-[8px] mr-1 text-emerald-600" />
                    Cash Collected by {row.cashReceivedRiderName || row.rider_name || 'Rider'}: <b>{formatCurrency(row.cashReceivedAmount || row.total_amount)}</b>
                    <span className="block font-normal text-slate-400 text-[8px]">{formatDateTime(row.cashReceivedAt)}</span>
                  </div>
                )}
              </div>
            )
          },
          { key: 'order_status', label: 'Status', render: (row) => <StatusBadge status={row.order_status} /> },
          {
            key: 'rider_id',
            label: 'Assign rider',
            render: (row) => {
              const isHomeDelivery = (row.orderType === 'DELIVERY' || row.delivery_type === 'Home Delivery');
              const lat = row.deliveryLocation?.latitude ?? row.delivery_address?.lat;
              const lng = row.deliveryLocation?.longitude ?? row.delivery_address?.lng;
              const hasLocation = (lat !== undefined && lat !== null && lng !== undefined && lng !== null);

              if (isHomeDelivery && !hasLocation) {
                return <span className="text-[10px] font-semibold text-red-600" title="Location coordinates are required to dispatch rider">⚠️ Needs Location</span>;
              }

              return (
                <select
                  value={row.rider_id || ''}
                  onChange={(event) => event.target.value && update(row.order_id, { rider_id: event.target.value })}
                  className="max-w-[130px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold"
                >
                  <option value="">Unassigned</option>
                  {riders.map((rider) => (
                    <option key={rider.rider_id} value={rider.rider_id}>
                      {rider.name}
                    </option>
                  ))}
                </select>
              );
            }
          },
          { key: 'createdAt', label: 'Created', render: (row) => formatDateTime(row.createdAt || row.created_at) },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <select
                value={row.order_status || 'RECEIVED'}
                onChange={(event) => update(row.order_id, { order_status: event.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold"
              >
                <option value="RECEIVED">Received</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PREPARING">Preparing</option>
                <option value="READY_FOR_PICKUP">Ready for Pickup</option>
                <option value="RIDER_ASSIGNED">Rider Assigned</option>
                <option value="RIDER_ACCEPTED">Rider Accepted</option>
                <option value="PICKED_UP">Picked Up</option>
                <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                <option value="DELIVERED">Delivered</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            )
          }
        ]}
      />

      {selectedOrder && (
        <Modal title={`Customer Delivery Location • #${selectedOrder.order_id}`} onClose={() => setSelectedOrder(null)} wide>
          <div className="space-y-4">
            <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Customer Details</span>
                <p className="mt-1 font-bold text-slate-800">{selectedOrder.customer?.name || selectedOrder.customer_name}</p>
                <p className="text-slate-500">{selectedOrder.customer?.phone || selectedOrder.customer_phone}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Delivery Address</span>
                <p className="mt-1 font-medium text-slate-800">{selectedOrder.deliveryAddress?.formattedAddress || selectedOrder.delivery_address?.address}</p>
                {selectedOrder.deliveryAddress?.landmark && <p className="text-amber-700">Landmark: {selectedOrder.deliveryAddress.landmark}</p>}
                {selectedOrder.deliveryAddress?.instructions && <p className="text-slate-500">Instructions: {selectedOrder.deliveryAddress.instructions}</p>}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Payment & Collection</span>
                <p className="mt-1 font-bold text-slate-800">{formatCurrency(selectedOrder.total_amount)}</p>
                <p className="text-slate-500">{selectedOrder.payment_method || 'Cash on Delivery'} • <b className="text-amber-700">{selectedOrder.payment_status || 'Pending'}</b></p>
                {selectedOrder.cashReceivedByRider && (
                  <div className="mt-1.5 rounded-lg bg-emerald-100 border border-emerald-300 p-2 text-[10px] text-emerald-950">
                    <span className="font-extrabold text-emerald-900 block flex items-center gap-1">
                      <i className="fa-solid fa-circle-check text-emerald-700" /> Cash Collected by Rider
                    </span>
                    <div>Rider: <b>{selectedOrder.cashReceivedRiderName || selectedOrder.rider_name || 'Rider'}</b> ({selectedOrder.cashReceivedRiderId || selectedOrder.rider_id || 'RIDER'})</div>
                    <div>Collected: <b>{formatCurrency(selectedOrder.cashReceivedAmount || selectedOrder.total_amount)}</b></div>
                    <div className="text-slate-500">{formatDateTime(selectedOrder.cashReceivedAt)}</div>
                    <div className="text-slate-400 text-[9px]">Order: #{selectedOrder.order_id}</div>
                  </div>
                )}
              </div>
            </div>
            <OrderLocationMap order={selectedOrder} />
            <div className="flex justify-end">
              <button onClick={() => setSelectedOrder(null)} className="primary-button">
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Menu({ result, onRefresh, notify, canEdit }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Pizza', price: '', description: '', image: '' });
  const items = result?.items || [];
  const save = async (event) => { event.preventDefault(); try { await api.post('/api/admin/menu/item', { ...form, price: Number(form.price), is_available: true, is_active: true }); notify('Menu item added.'); setModal(false); setForm({ name: '', category: 'Pizza', price: '', description: '', image: '' }); onRefresh(); } catch (error) { notify(error.message, 'error'); } };
  const archive = async (id) => { if (!window.confirm('Archive this menu item?')) return; try { await api.delete(`/api/admin/menu/item/${id}`); notify('Menu item archived.'); onRefresh(); } catch (error) { notify(error.message, 'error'); } };
  return <div className="space-y-5"><div className="flex items-start justify-between"><div><h2 className="section-title">Menu Manager</h2><p className="text-xs text-slate-500">Manage available items and customization options.</p></div>{canEdit && <button onClick={() => setModal(true)} className="primary-button"><i className="fa-solid fa-plus mr-1" /> Add item</button>}</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((item) => <div key={item._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><img src={item.image} alt="" className="h-36 w-full object-cover" /><div className="p-4"><div className="flex justify-between gap-2"><h3 className="text-sm font-extrabold text-slate-900">{item.name}</h3><b className="text-xs text-red-900">{formatCurrency(item.price)}</b></div><p className="mt-1 text-[10px] text-slate-500">{item.category} · {item.description}</p>{canEdit && <button onClick={() => archive(item._id)} className="mt-3 text-[10px] font-bold text-red-700 hover:text-red-900"><i className="fa-solid fa-box-archive mr-1" /> Archive</button>}</div></div>)}</div>{!items.length && <EmptyState title="No menu items found." />}{modal && <Modal title="Add menu item" onClose={() => setModal(false)}><form onSubmit={save} className="space-y-3">{[['name', 'Item name', 'text'], ['category', 'Category', 'text'], ['price', 'Price', 'number'], ['description', 'Description', 'text'], ['image', 'Image URL', 'url']].map(([key, label, type]) => <label key={key} className="block text-xs font-bold text-slate-700">{label}<input required={['name', 'category', 'price'].includes(key)} type={type} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="input-control mt-1" /></label>)}<button className="primary-button w-full">Save item</button></form></Modal>}</div>;
}

function Riders({ result, onRefresh, notify, canEdit }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', vehicle_number: '', email: '' });
  const save = async (event) => { event.preventDefault(); try { await api.post('/api/admin/riders', form); notify('Rider added.'); setModal(false); onRefresh(); } catch (error) { notify(error.message, 'error'); } };
  return <div className="space-y-5"><div className="flex items-start justify-between"><div><h2 className="section-title">Riders & Dispatch</h2><p className="text-xs text-slate-500">Monitor rider status and fleet availability.</p></div>{canEdit && <button onClick={() => setModal(true)} className="primary-button"><i className="fa-solid fa-plus mr-1" /> Add rider</button>}</div><DataTable rows={result?.riders || []} emptyText="No riders found." columns={[{ key: 'rider_id', label: 'Rider ID' }, { key: 'name', label: 'Rider', render: (row) => <div><b>{row.name}</b><small className="block text-slate-400">{row.phone}</small></div> }, { key: 'vehicle_number', label: 'Vehicle' }, { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> }, { key: 'updated_at', label: 'Last update', render: (row) => formatDateTime(row.updated_at) }]} />{modal && <Modal title="Add delivery rider" onClose={() => setModal(false)}><form onSubmit={save} className="space-y-3">{[['name', 'Full name'], ['phone', 'Phone'], ['vehicle_number', 'Vehicle number'], ['email', 'Email']].map(([key, label]) => <label key={key} className="block text-xs font-bold text-slate-700">{label}<input required={key === 'name' || key === 'phone'} type={key === 'email' ? 'email' : 'text'} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="input-control mt-1" /></label>)}<button className="primary-button w-full">Create rider</button></form></Modal>}</div>;
}

function Kitchen({ result, onRefresh, notify }) {
  const orders = result?.orders || [];
  const update = async (id, status) => {
    try {
      await api.put(`/api/admin/orders/${id}/status`, { order_status: status });
      notify(`Order status moved to ${status}.`);
      onRefresh();
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const isMatching = (status, list) => {
    const s = String(status || '').toUpperCase().replace(/[\s-]+/g, '_');
    return list.includes(s);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-emerald-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Live Kitchen Queue Stream Active</span>
        </div>
        <div className="text-xs font-semibold text-amber-400">
          <i className="fa-solid fa-bell mr-1" /> Orders live
        </div>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-white">Kitchen Ticket Queue</h2>
          <p className="text-xs text-slate-400">Prepare incoming customer orders in real time.</p>
        </div>
        <button onClick={onRefresh} className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-slate-700">
          <i className="fa-solid fa-rotate mr-1" /> Refresh Queue
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {orders.map((order) => (
          <article key={order.order_id} className="flex flex-col justify-between rounded-2xl border-2 border-slate-700/80 bg-slate-800 p-4 shadow-lg transition-all">
            <div>
              <div className="mb-3 flex items-center justify-between border-b border-slate-700 pb-2">
                <div>
                  <b className="font-mono text-base tracking-wider text-amber-400">{order.order_id}</b>
                  <p className="text-[11px] text-slate-400">{order.customer_name} · {formatDateTime(order.createdAt || order.created_at)}</p>
                </div>
                <StatusBadge status={order.order_status} />
              </div>
              <div className="mb-4 space-y-2">
                {(order.items || []).map((item, index) => (
                  <div key={index} className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-2.5">
                    <div className="flex items-center justify-between text-sm font-bold text-slate-100">
                      <span><span className="mr-1 font-mono text-base text-amber-400">{item.quantity}x</span>{item.name}</span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-300">{item.size}</span>
                    </div>
                    {item.extras?.length > 0 && <div className="mt-1 border-l-2 border-amber-500/40 pl-3 text-xs font-medium text-amber-300/90">{item.extras.join(', ')}</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-700/80 pt-2">
              {isMatching(order.order_status, ['RECEIVED']) && (
                <button onClick={() => update(order.order_id, 'CONFIRMED')} className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-500">
                  <i className="fa-solid fa-check mr-1" /> Accept Ticket
                </button>
              )}
              {isMatching(order.order_status, ['CONFIRMED']) && (
                <button onClick={() => update(order.order_id, 'PREPARING')} className="w-full rounded-xl bg-amber-600 py-2.5 text-xs font-bold text-white hover:bg-amber-500">
                  <i className="fa-solid fa-fire-burner mr-1" /> Start Cooking
                </button>
              )}
              {isMatching(order.order_status, ['PREPARING']) && (
                <button onClick={() => update(order.order_id, 'READY_FOR_PICKUP')} className="w-full rounded-xl bg-purple-600 py-2.5 text-xs font-bold text-white hover:bg-purple-500">
                  <i className="fa-solid fa-bell mr-1" /> Mark Ready for Pickup
                </button>
              )}
              {isMatching(order.order_status, ['READY_FOR_PICKUP', 'READY', 'RIDER_ASSIGNED', 'RIDER_ACCEPTED']) && (
                <div className="w-full rounded-xl border border-emerald-800/50 bg-emerald-950/40 py-2 text-center text-xs font-semibold text-emerald-400">
                  <i className="fa-solid fa-circle-check mr-1" /> Ready for Rider Pickup
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {!orders.length && (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 py-16 text-center">
          <i className="fa-solid fa-circle-check mb-3 block text-4xl text-emerald-500" />
          <h3 className="text-base font-bold text-slate-200">Kitchen Queue is Clear!</h3>
          <p className="mt-1 text-xs text-slate-400">All incoming orders have been prepared.</p>
        </div>
      )}
    </div>
  );
}

function SimpleTablePanel({ type, result }) {
  const configs = {
    crm: { title: 'Customer CRM', subtitle: 'Customer profiles, loyalty points, and order history.', rows: result?.customers || [], columns: [{ key: 'customer_id', label: 'Customer ID' }, { key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone' }, { key: 'loyalty_points', label: 'Points' }, { key: 'total_orders', label: 'Orders' }] },
    payments: { title: 'Payments', subtitle: 'Order payment records and collection status.', rows: result?.payments || [], columns: [{ key: 'transaction_id', label: 'Transaction' }, { key: 'order_id', label: 'Order' }, { key: 'customer_name', label: 'Customer' }, { key: 'amount', label: 'Amount', render: (row) => formatCurrency(row.amount) }, { key: 'status', label: 'Status & Collection', render: (row) => (
      <div>
        <StatusBadge status={row.status} />
        {row.cashReceivedByRider && (
          <div className="mt-1 rounded bg-emerald-50 border border-emerald-200 p-1.5 text-[10px] text-emerald-900 leading-tight">
            <span className="font-bold text-emerald-800 block">💵 Cash Collected by Rider</span>
            <div>Rider: <b>{row.cashReceivedRiderName || 'Rider'}</b></div>
            <div>Collected: <b>{formatCurrency(row.cashReceivedAmount || row.amount)}</b></div>
            <div className="text-[9px] text-slate-500">{formatDateTime(row.cashReceivedAt)}</div>
          </div>
        )}
      </div>
    ) }, { key: 'date', label: 'Date', render: (row) => formatDateTime(row.date) }] },
    branches: { title: 'Branches', subtitle: 'Branch locations and opening hours.', rows: result?.branches || [], columns: [{ key: 'branch_id', label: 'Branch ID' }, { key: 'name', label: 'Branch' }, { key: 'address', label: 'Address' }, { key: 'phone', label: 'Phone' }, { key: 'opening_hours', label: 'Opening hours' }] },
    reviews: { title: 'Reviews', subtitle: 'Customer feedback and quality signals.', rows: result?.reviews || [], columns: [{ key: 'order_id', label: 'Order' }, { key: 'rating', label: 'Rating', render: (row) => <span className="font-bold text-amber-600">{row.rating} ★</span> }, { key: 'feedback', label: 'Feedback' }, { key: 'createdAt', label: 'Date', render: (row) => formatDateTime(row.createdAt || row.created_at) }] },
    audit: { title: 'Audit Logs', subtitle: 'Recent administrative activity and system events.', rows: result?.logs || [], columns: [{ key: 'action', label: 'Action' }, { key: 'performed_by', label: 'Performed by' }, { key: 'role', label: 'Role' }, { key: 'module', label: 'Module' }, { key: 'createdAt', label: 'Date', render: (row) => formatDateTime(row.createdAt || row.created_at) }] }
  };
  const config = configs[type];
  return <div className="space-y-5"><div><h2 className="section-title">{config.title}</h2><p className="text-xs text-slate-500">{config.subtitle}</p></div><DataTable rows={config.rows} columns={config.columns} emptyText={`No ${config.title.toLowerCase()} records found.`} /></div>;
}

function CRM({ result, notify, onRefresh }) {
  const customers = result?.customers || [];
  const editPoints = async (customer) => {
    const value = window.prompt(`Update loyalty points for ${customer.customer_id}:`, customer.loyalty_points || 0);
    if (value === null || Number.isNaN(Number(value))) return;
    try { await api.put(`/api/admin/customers/${customer.customer_id}/points`, { points: Number(value) }); notify('Points updated successfully.'); onRefresh(); }
    catch (error) { notify(error.message, 'error'); }
  };
  return <div className="space-y-5"><div><h2 className="section-title">Customer CRM</h2><p className="text-xs text-slate-500">Customer profiles, loyalty points, and order history.</p></div><DataTable rows={customers} emptyText="No customers found." columns={[{ key: 'customer_id', label: 'Customer ID' }, { key: 'name', label: 'Name', render: (row) => <div><b>{row.name}</b><small className="block text-slate-400">{row.phone}</small></div> }, { key: 'customer_level', label: 'Tier', render: (row) => <StatusBadge status={row.customer_level} /> }, { key: 'completed_orders', label: 'Orders' }, { key: 'total_spending', label: 'Spending', render: (row) => formatCurrency(row.total_spending) }, { key: 'loyalty_points', label: 'Points', render: (row) => <b className="text-amber-600">{row.loyalty_points || 0}</b> }, { key: 'actions', label: 'Actions', render: (row) => <button onClick={() => editPoints(row)} className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200">Edit Points</button> }]} /></div>;
}

function Branches({ result, notify, onRefresh, canEdit }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', phone: '', opening_hours: '' });
  const save = async (event) => { event.preventDefault(); try { const response = await api.post('/api/admin/branches', form); if (!response.success) throw new Error(response.message); notify('Branch created.'); setModal(false); setForm({ name: '', address: '', phone: '', opening_hours: '' }); onRefresh(); } catch (error) { notify(error.message, 'error'); } };
  return <div className="space-y-5"><div className="flex items-start justify-between"><div><h2 className="section-title">Branch Management</h2><p className="text-xs text-slate-500">Locations, contact details, and opening hours.</p></div>{canEdit && <button onClick={() => setModal(true)} className="primary-button"><i className="fa-solid fa-plus mr-1" /> Add branch</button>}</div><div className="grid gap-4 md:grid-cols-2">{(result?.branches || []).map((branch) => <div key={branch.branch_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-slate-900">{branch.name}</h3><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{branch.branch_id}</span></div><p className="text-xs text-slate-600"><i className="fa-solid fa-location-dot mr-1 text-red-700" />{branch.address}</p><p className="mt-1 text-xs text-slate-500"><i className="fa-solid fa-clock mr-1 text-amber-600" />{branch.opening_hours}</p><p className="mt-1 text-xs text-slate-500"><i className="fa-solid fa-phone mr-1 text-blue-600" />{branch.phone}</p></div>)}</div>{!result?.branches?.length && <EmptyState title="No branches found." />}{modal && <Modal title="Add branch" onClose={() => setModal(false)}><form onSubmit={save} className="space-y-3">{[['name', 'Branch name'], ['address', 'Address'], ['phone', 'Phone'], ['opening_hours', 'Opening hours']].map(([key, label]) => <label key={key} className="block text-xs font-bold text-slate-700">{label}<input required={key !== 'opening_hours'} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="input-control mt-1" /></label>)}<button className="primary-button w-full">Create branch</button></form></Modal>}</div>;
}

function WhatsAppInbox({ result, notify, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const handover = async (isHuman) => {
    if (!selected) return;
    try { await api.post('/api/admin/whatsapp/handover', { phone: selected.phone, is_human_handover: isHuman, ...(message ? { staff_message: message } : {}) }); notify(isHuman ? 'Conversation handed to staff.' : 'AI assistant restored.'); setMessage(''); onRefresh(); }
    catch (error) { notify(error.message, 'error'); }
  };
  return <div className="space-y-5"><div><h2 className="section-title">WhatsApp Live Inbox</h2><p className="text-xs text-slate-500">Active conversations and recent message feed.</p></div><div className="grid gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-3"><div className="border-b border-slate-100 pb-3 md:border-b-0 md:border-r md:pr-4"><h3 className="mb-2 text-xs font-bold text-slate-800">Active Conversations</h3><div className="space-y-1.5">{(result?.sessions || []).map((session) => <button key={session.phone} onClick={() => setSelected(session)} className={`w-full rounded-lg p-2 text-left text-xs ${selected?.phone === session.phone ? 'bg-emerald-50' : 'bg-slate-50 hover:bg-slate-100'}`}><b className="block text-slate-900">{session.name || 'Customer'}</b><span className="text-[10px] text-slate-500">{session.phone} · {formatDateTime(session.last_interaction)}</span></button>)}{!result?.sessions?.length && <p className="text-xs text-slate-400">No active conversations.</p>}</div></div><div className="md:col-span-2"><h3 className="mb-2 text-xs font-bold text-slate-800">Recent Message Feed</h3><div className="max-h-80 space-y-1.5 overflow-y-auto">{(result?.recent_messages || []).slice(0, 15).map((item, index) => <div key={item._id || index} className={`rounded p-2 text-xs ${item.direction === 'INBOUND' ? 'bg-slate-50 text-slate-800' : 'bg-emerald-50 font-medium text-emerald-900'}`}><div className="mb-0.5 text-[10px] text-slate-400">{item.direction} · {item.phone} · {formatDateTime(item.timestamp)}</div>{item.body}</div>)}{!result?.recent_messages?.length && <p className="text-xs text-slate-400">No messages yet.</p>}</div>{selected && <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-xs font-bold text-slate-800">{selected.name || selected.phone}</p><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Optional staff message" rows="2" className="input-control mt-2" /><div className="mt-2 flex gap-2"><button onClick={() => handover(true)} className="primary-button">Take over conversation</button><button onClick={() => handover(false)} className="secondary-button">Return to AI</button></div></div>}</div></div></div>;
}

function Reports({ notify }) {
  const download = async () => {
    try {
      const response = await fetch('/api/admin/reports/export', { headers: { Authorization: `Bearer ${localStorage.getItem('feastflow_token') || ''}` } });
      if (!response.ok) throw new Error('Report download failed.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'feastflow_sales_report.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify('Sales report downloaded.');
    } catch (error) { notify(error.message, 'error'); }
  };
  return <div className="space-y-5"><div><h2 className="section-title">Reports Export</h2><p className="text-xs text-slate-500">Download the existing authenticated FeastFlow sales report.</p></div><button onClick={download} className="primary-button"><i className="fa-solid fa-download mr-2" /> Export sales CSV</button></div>;
}

function Settings({ result, notify }) {
  const [form, setForm] = useState({});
  useEffect(() => { if (result?.settings) setForm(result.settings); }, [result]);
  const save = async (event) => { event.preventDefault(); try { await api.put('/api/admin/settings', { restaurant_name: form.restaurant_name, tax_rate_percent: Number(form.tax_rate_percent), default_delivery_fee: Number(form.default_delivery_fee) }); notify('Settings saved.'); } catch (error) { notify(error.message, 'error'); } };
  return <div className="max-w-xl space-y-5"><div><h2 className="section-title">Branding Settings</h2><p className="text-xs text-slate-500">Update the restaurant configuration used by operations.</p></div><form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 p-5">{[['restaurant_name', 'Restaurant name'], ['tax_rate_percent', 'Tax rate (%)'], ['default_delivery_fee', 'Default delivery fee']].map(([key, label]) => <label key={key} className="block text-xs font-bold text-slate-700">{label}<input className="input-control mt-1" type={key === 'restaurant_name' ? 'text' : 'number'} value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}<button className="primary-button">Save settings</button></form></div>;
}

export default function OperationsDashboard({ role }) {
  const [active, setActive] = useState(role === 'admin' ? 'overview' : role === 'manager' ? 'orders' : role === 'kitchen' ? 'kitchen' : 'riders');
  const [toast, setToast] = useState({ message: '', tone: 'success' });
  const notify = (message, tone = 'success') => setToast({ message, tone });
  const { data, loading, load } = useOperationsData(role, active, notify);
  const user = getUser();
  const result = data[active];
  const canEdit = ['admin', 'manager'].includes(role);
  useEffect(() => {
    if (active === 'orders' && !data.riders) load('riders');
  }, [active, data.riders]);
  const content = active === 'overview' ? <Overview result={result} />
    : active === 'orders' ? <Orders result={result} riders={data.riders?.riders || []} role={role} onRefresh={() => load('orders')} notify={notify} />
      : active === 'menu' ? <Menu result={result} onRefresh={() => load('menu')} notify={notify} canEdit={canEdit} />
        : active === 'riders' ? <Riders result={result} onRefresh={() => load('riders')} notify={notify} canEdit={canEdit || role === 'delivery'} />
          : active === 'kitchen' ? <Kitchen result={result} onRefresh={() => load('kitchen')} notify={notify} />
            : active === 'tracking' ? <div className="space-y-5"><div><h2 className="section-title">Live Operations Map</h2><p className="text-xs text-slate-500">Rider positions are updated through Socket.IO.</p></div><LiveMap riders={data.riders?.riders || []} branches={data.branches?.branches || []} /></div>
              : active === 'crm' ? <CRM result={result} notify={notify} onRefresh={() => load('crm')} />
                : active === 'branches' ? <Branches result={result} notify={notify} onRefresh={() => load('branches')} canEdit={canEdit} />
                  : active === 'whatsapp' ? <WhatsAppInbox result={result} notify={notify} onRefresh={() => load('whatsapp')} />
                    : active === 'reports' ? <Reports notify={notify} />
                      : ['payments', 'reviews', 'audit'].includes(active) ? <SimpleTablePanel type={active} result={result} />
                        : active === 'settings' ? <Settings result={result} notify={notify} />
                          : <EmptyState />;
  return <PortalLayout role={role} active={active} onChange={setActive} title={role === 'admin' ? 'FeastFlow Super Admin Portal' : role === 'manager' ? 'FeastFlow Restaurant Manager Portal' : role === 'kitchen' ? 'FeastFlow Kitchen Display System' : 'FeastFlow Delivery Manager Portal'} subtitle={role === 'admin' ? 'Analytics • Orders • CRM • Menu • Fleet Operations' : role === 'manager' ? 'Store-Level Orders • Menu Availability • Customer CRM' : role === 'kitchen' ? 'Live order queue • Status transitions • Audio alerts' : 'Rider dispatch • Fleet map • Live location tracking'} icon={role === 'kitchen' ? 'fa-fire-burner' : role === 'delivery' ? 'fa-map-location-dot' : role === 'manager' ? 'fa-user-tie' : 'fa-user-shield'}><div className="relative">{loading && <div className="absolute right-0 top-0 text-[10px] font-bold text-slate-400"><i className="fa-solid fa-spinner fa-spin mr-1" />Syncing</div>}{content}</div><Toast message={toast.message} tone={toast.tone} onClose={() => setToast({ message: '', tone: 'success' })} /></PortalLayout>;
}