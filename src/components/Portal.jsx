import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../services/api';
import { initials } from '../utils/format';

export function Toast({ message, tone = 'success', onClose }) {
  if (!message) return null;
  return (
    <div className={`fixed right-4 top-4 z-[100] flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-xl ${tone === 'error' ? 'bg-red-700' : 'bg-slate-900'}`}>
      <i className={`fa-solid ${tone === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'} text-amber-300`} />
      <span>{message}</span>
      <button onClick={onClose} className="ml-auto text-white/60 hover:text-white" aria-label="Close notification"><i className="fa-solid fa-xmark" /></button>
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 transition hover:text-slate-900" aria-label="Close modal"><i className="fa-solid fa-xmark" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const roleLinks = {
  admin: [
    ['overview', 'Overview', 'fa-chart-pie'],
    ['orders', 'Orders', 'fa-receipt'],
    ['kitchen', 'Kitchen KDS', 'fa-fire-burner'],
    ['menu', 'Menu Manager', 'fa-utensils'],
    ['crm', 'Customers / CRM', 'fa-users'],
    ['payments', 'Payments', 'fa-credit-card'],
    ['branches', 'Branches', 'fa-code-branch'],
    ['riders', 'Riders', 'fa-motorcycle'],
    ['tracking', 'Live Tracking', 'fa-location-dot'],
    ['reviews', 'Reviews', 'fa-star'],
    ['whatsapp', 'WhatsApp Inbox', 'fa-brands fa-whatsapp'],
    ['reports', 'Reports Export', 'fa-file-export'],
    ['settings', 'Settings', 'fa-gear'],
    ['audit', 'Audit Logs', 'fa-shield-halved']
  ],
  manager: [
    ['orders', 'Orders Management', 'fa-receipt'],
    ['menu', 'Menu Manager', 'fa-utensils'],
    ['crm', 'Customer CRM', 'fa-users'],
    ['reports', 'Reports Export', 'fa-file-export']
  ],
  delivery: [
    ['riders', 'Riders & Dispatch', 'fa-motorcycle'],
    ['tracking', 'Live Operations Map', 'fa-map-location-dot']
  ],
  kitchen: [['kitchen', 'Kitchen Display', 'fa-fire-burner']]
};

export function PortalHeader({ title, subtitle, icon = 'fa-utensils', onLogout }) {
  const navigate = useNavigate();
  const logout = () => {
    clearSession();
    if (onLogout) onLogout();
    navigate('/staff/login');
  };
  const isKitchen = title?.toLowerCase().includes('kitchen');
  const isDelivery = title?.toLowerCase().includes('delivery manager');
  return (
    <header className={`sticky top-0 z-30 flex items-center justify-between px-4 py-3 text-white shadow-md ${isKitchen ? 'border-b-2 border-amber-500 bg-slate-900' : isDelivery ? 'bg-gradient-to-r from-blue-900 to-indigo-950' : 'bg-gradient-to-r from-red-900 to-red-950'}`}>
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black shadow-sm ${isKitchen ? 'bg-amber-500 text-slate-950' : isDelivery ? 'bg-blue-400 text-slate-950' : 'bg-amber-400 text-red-950'}`}><i className={`fa-solid ${icon}`} /></div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-extrabold tracking-wide sm:text-base">{title}</h1>
          {subtitle && <p className={`hidden text-[11px] font-medium sm:block ${isKitchen ? 'text-amber-400/90' : isDelivery ? 'text-blue-200' : 'text-amber-200/90'}`}>{subtitle}</p>}
        </div>
      </div>
          <button onClick={logout} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${isKitchen ? 'border-slate-700 bg-slate-800 text-red-200 hover:bg-slate-700' : 'border-white/20 bg-white/10 hover:bg-white/20'}`}><i className="fa-solid fa-power-off text-xs" /> Logout</button>
    </header>
  );
}

export function Sidebar({ role, active, onChange }) {
  const user = getUser();
  return (
    <aside className="flex w-full shrink-0 flex-col rounded-3xl border border-slate-800 bg-slate-900 p-4 text-slate-200 shadow-xl md:w-64">
      <div className="mb-3 flex items-center gap-2.5 border-b border-slate-800 px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-red-800 text-xs font-bold text-amber-300"><i className="fa-solid fa-utensils" /></div>
        <span className="text-sm font-extrabold tracking-wide text-white">{role === 'admin' ? 'Admin Portal' : role === 'delivery' ? 'Dispatch Portal' : role === 'kitchen' ? 'Kitchen Portal' : 'Manager Portal'}</span>
      </div>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-[11px] font-semibold text-slate-300">
        <span>{user?.name || 'FeastFlow User'}</span><strong className="text-[10px] uppercase tracking-wider text-amber-400">{role}</strong>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {(roleLinks[role] || []).map(([key, label, icon]) => (
           <button key={key} onClick={() => onChange(key)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${active === key ? role === 'delivery' ? 'bg-blue-700 text-white' : 'bg-red-800 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
            <i className={`${icon.includes(' ') ? icon : `fa-solid ${icon}`} w-4`} /> {label}
          </button>
        ))}
      </nav>
      <NavLink to="/" className="mt-4 border-t border-slate-800 px-3 pt-4 text-xs font-medium text-amber-300 transition hover:text-white"><i className="fa-solid fa-arrow-up-right-from-square mr-2" />Customer assistant</NavLink>
    </aside>
  );
}

export function PortalLayout({ role, title, subtitle, icon, active, onChange, children }) {
  const kitchen = role === 'kitchen';
  return (
    <div className={`min-h-screen ${kitchen ? 'bg-slate-950 text-slate-100' : 'bg-amber-50/40'}`}>
      <PortalHeader title={title} subtitle={subtitle} icon={icon} />
      <main className={`mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6 ${kitchen ? '' : 'md:flex-row'}`}>
        {!kitchen && <Sidebar role={role} active={active} onChange={onChange} />}
        <section className={`min-w-0 flex-1 rounded-3xl border p-4 shadow-sm sm:p-6 ${kitchen ? 'border-slate-800 bg-slate-900' : 'border-slate-200/90 bg-white'}`}>{children}</section>
      </main>
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'red' }) {
  const tones = { red: 'bg-red-50 text-red-900', amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', green: 'bg-emerald-50 text-emerald-700' };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p></div><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] || tones.red}`}><i className={`fa-solid ${icon}`} /></span></div></div>;
}

export function EmptyState({ icon = 'fa-inbox', title = 'Nothing here yet', text = 'Records will appear here when available.' }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center"><i className={`fa-solid ${icon} mb-3 text-3xl text-slate-300`} /><p className="text-sm font-bold text-slate-600">{title}</p><p className="mt-1 max-w-sm text-xs text-slate-400">{text}</p></div>;
}

export function StatusBadge({ status }) {
  const value = String(status || 'Pending');
  const lower = value.toLowerCase();
  const tone = ['completed', 'delivered', 'paid', 'available', 'ready'].includes(lower) ? 'bg-emerald-100 text-emerald-700' : ['cancelled', 'failed'].includes(lower) ? 'bg-red-100 text-red-700' : ['preparing', 'confirmed', 'out for delivery', 'assigned'].includes(lower) ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${tone}`}>{value}</span>;
}

export function DataTable({ columns, rows, emptyText = 'No records found.' }) {
  if (!rows?.length) return <EmptyState title={emptyText} />;
  return <div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr>{columns.map((column) => <th key={column.key} className="px-4 py-3 font-bold">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={row._id || row.order_id || row.customer_id || row.rider_id || index} className="transition hover:bg-slate-50/70">{columns.map((column) => <td key={column.key} className="px-4 py-3 text-slate-700">{column.render ? column.render(row) : row[column.key] ?? '—'}</td>)}</tr>)}</tbody></table></div>;
}