import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, getUser, setSession } from '../services/api';
import { Toast } from '../components/Portal';

const redirects = { admin: '/admin/dashboard', manager: '/staff/manager/dashboard', kitchen: '/staff/kitchen/dashboard', delivery: '/staff/delivery/dashboard', rider: '/rider/dashboard' };
const presets = {
  admin: ['admin@restaurant.com', 'admin123'],
  manager: ['manager@restaurant.com', 'manager123'],
  kitchen: ['kitchen@restaurant.com', 'kitchen123'],
  delivery: ['delivery@restaurant.com', 'delivery123'],
  rider: ['rider@restaurant.com', 'rider123']
};

export default function Login({ kind = 'staff' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState(kind === 'admin' ? 'admin' : kind === 'rider' ? 'rider' : 'manager');
  const [email, setEmail] = useState(presets[role][0]);
  const [password, setPassword] = useState(presets[role][1]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = getUser();
    if (user && redirects[user.role] && (location.pathname.includes('login'))) navigate(redirects[user.role], { replace: true });
  }, [location.pathname, navigate]);

  const selectRole = (value) => {
    setRole(value);
    setEmail(presets[value][0]);
    setPassword(presets[value][1]);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const endpoint = kind === 'admin' ? '/api/auth/admin-login' : kind === 'rider' ? '/api/auth/rider-login' : '/api/auth/staff-login';
      const result = await api.post(endpoint, { email, password });
      if (!result.success) throw new Error(result.message || 'Unable to sign in.');
      setSession(result.token, result.user);
      navigate(result.redirectUrl || redirects[result.user.role] || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const admin = kind === 'admin';
  const rider = kind === 'rider';
  const title = admin ? 'Super Admin Login' : rider ? 'Rider Portal Login' : 'Staff Operations Login';
  const subtitle = admin ? 'Executive access to FeastFlow operations and analytics.' : rider ? 'Sign in to view assigned deliveries and update status.' : 'Sign in with assigned staff credentials to access operational tools.';
  return (
    <div className={`flex min-h-screen flex-col items-center justify-between antialiased ${admin ? 'bg-slate-900 text-slate-100' : 'text-slate-800 bg-amber-50/40'}`}>
      <header className={`w-full px-4 py-3.5 text-white ${admin ? 'border-b border-slate-800 bg-slate-950/80 backdrop-blur-md' : 'shadow-md ' + (rider ? 'bg-gradient-to-r from-slate-900 to-slate-950' : 'bg-gradient-to-r from-red-900 to-red-950')}`}>
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5"><div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black shadow-md ${admin ? 'bg-amber-500 text-slate-950' : 'bg-amber-400 text-red-950'}`}><i className={`fa-solid ${admin ? 'fa-crown' : 'fa-utensils'}`} /></div><div><h1 className="text-sm font-bold tracking-wide">{admin ? 'FeastFlow Executive Portal' : `FeastFlow ${rider ? 'Rider' : 'Staff Operations'} Portal`}</h1><p className="text-[10px] text-slate-400">{admin ? 'Enterprise Restaurant Governance' : subtitle}</p></div></Link>
          <Link to={admin || rider ? '/staff/login' : '/'} className={`text-xs font-medium transition ${admin ? 'text-slate-400 hover:text-amber-400' : 'text-amber-200 hover:text-white'}`}>{admin || rider ? 'Staff Login →' : 'Customer assistant'}</Link>
        </div>
      </header>
      <main className="flex w-full flex-1 items-center justify-center p-4">
        <div className={`relative w-full max-w-md overflow-hidden rounded-3xl border p-8 shadow-2xl ${admin ? 'border-slate-700/80 bg-slate-800/90 backdrop-blur-xl' : 'border-slate-200 bg-white'}`}>
          {admin && <><div className="pointer-events-none absolute -left-24 -top-24 h-48 w-48 rounded-full bg-red-800/30 blur-3xl" /><div className="pointer-events-none absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-amber-500/20 blur-3xl" /></>}
          <div className="relative mb-8 text-center"><div className={`mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-2xl border text-2xl shadow-inner ${admin ? 'border-red-800/60 bg-red-950/80 text-red-500' : rider ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-red-200 bg-red-50 text-red-900'}`}><i className={`fa-solid ${admin ? 'fa-shield-halved' : rider ? 'fa-motorcycle' : 'fa-user-shield'}`} /></div><h2 className={`text-xl font-extrabold tracking-tight ${admin ? 'text-white' : 'text-slate-900'}`}>{title}</h2><p className={`mt-1 text-xs ${admin ? 'text-slate-400' : 'text-slate-500'}`}>{admin ? 'Strictly restricted to executive administrator accounts.' : subtitle}</p></div>
          {error && <Toast message={error} tone="error" onClose={() => setError('')} />}
          <form onSubmit={submit} className="relative space-y-4">
            {!admin && !rider && <div><label className="mb-1.5 block text-xs font-bold text-slate-700">Select Role Preset</label><select value={role} onChange={(event) => selectRole(event.target.value)} className="input-control"><option value="manager">Restaurant Manager</option><option value="kitchen">Kitchen Chef</option><option value="delivery">Delivery Manager</option><option value="rider">Rider</option><option value="admin">Super Admin</option></select></div>}
            <div><label className={`mb-1.5 block text-xs font-semibold ${admin ? 'text-slate-300' : 'text-slate-700'}`}>{admin ? 'Administrator Email' : 'Email Address'}</label><div className="relative"><i className="fa-solid fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500" /><input className={`input-control pl-9 ${admin ? '!border-slate-700 !bg-slate-900/90 !text-white' : ''}`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></div>
            <div><label className={`mb-1.5 block text-xs font-semibold ${admin ? 'text-slate-300' : 'text-slate-700'}`}>{admin ? 'Secret Password' : 'Password'}</label><div className="relative"><i className="fa-solid fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500" /><input className={`input-control pl-9 ${admin ? '!border-slate-700 !bg-slate-900/90 !text-white' : ''}`} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div></div>
            <button disabled={busy} className={`mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold text-white shadow-lg transition disabled:cursor-wait disabled:opacity-60 ${admin ? 'bg-gradient-to-r from-red-800 to-red-900 shadow-red-950/50 hover:from-red-700 hover:to-red-800' : rider ? 'bg-slate-900 hover:bg-slate-800' : 'bg-red-900 hover:bg-red-800'}`}><i className="fa-solid fa-lock" />{busy ? 'Signing in…' : admin ? 'Login to Executive Admin Portal' : 'Sign In to FeastFlow'}</button>
          </form>
          {!admin && !rider && <p className="mt-5 text-center text-[10px] text-slate-400">Demo credentials are pre-filled for each role preset.</p>}
        </div>
      </main>
      <footer className={`w-full px-4 py-4 text-center text-xs ${admin ? 'text-slate-600' : 'text-slate-400'}`}>{admin ? 'FeastFlow SaaS Operations Platform © 2026' : '© 2026 FeastFlow Restaurant Platform · Secure access'}</footer>
    </div>
  );
}