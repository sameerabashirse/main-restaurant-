import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import CustomerPage from './pages/Customer';
import Login from './pages/Login';
import OperationsDashboard from './pages/Operations';
import RiderDashboard from './pages/Rider';
import { api, clearSession, getToken, getUser, setSession } from './services/api';

function Protected({ role, children }) {
  const user = getUser();
  const [checking, setChecking] = useState(true);
  const hierarchy = { admin: ['admin'], manager: ['manager', 'admin'], kitchen: ['kitchen', 'manager', 'admin'], delivery: ['delivery', 'manager', 'admin'], rider: ['rider', 'admin'] };
  useEffect(() => {
    if (!user || !hierarchy[role]?.includes(user.role) || !getToken()) {
      setChecking(false);
      return undefined;
    }
    let active = true;
    api.get('/api/auth/verify').then((result) => {
      if (result.success && result.user && getToken()) setSession(getToken(), { ...user, ...result.user });
    }).catch(() => {
      clearSession();
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, [role]);
  if (!user || !hierarchy[role]?.includes(user.role)) return <Navigate to={role === 'rider' ? '/rider/login' : role === 'admin' ? '/admin/login' : '/staff/login'} replace />;
  if (checking) return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-xs text-slate-500"><i className="fa-solid fa-spinner fa-spin mr-2" />Verifying session…</div>;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CustomerPage />} />
      <Route path="/track/:orderId" element={<CustomerPage />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin/login" element={<Login kind="admin" />} />
      <Route path="/staff" element={<Navigate to="/staff/login" replace />} />
      <Route path="/staff/login" element={<Login />} />
      <Route path="/rider" element={<Navigate to="/rider/dashboard" replace />} />
      <Route path="/rider/login" element={<Login kind="rider" />} />
      <Route path="/admin/dashboard" element={<Protected role="admin"><OperationsDashboard role="admin" /></Protected>} />
      <Route path="/staff/manager/dashboard" element={<Protected role="manager"><OperationsDashboard role="manager" /></Protected>} />
      <Route path="/staff/kitchen/dashboard" element={<Protected role="kitchen"><OperationsDashboard role="kitchen" /></Protected>} />
      <Route path="/staff/delivery/dashboard" element={<Protected role="delivery"><OperationsDashboard role="delivery" /></Protected>} />
      <Route path="/rider/dashboard" element={<Protected role="rider"><RiderDashboard /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}