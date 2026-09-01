export const formatCurrency = (amount = 0) =>
  `Rs. ${Number(amount || 0).toLocaleString('en-PK')}`;

export const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
};

export const statusClass = (status = '') => {
  const value = status.toLowerCase();
  if (['completed', 'delivered', 'paid', 'available', 'ready'].includes(value)) return 'bg-emerald-100 text-emerald-700';
  if (['cancelled', 'failed', 'unavailable'].includes(value)) return 'bg-red-100 text-red-700';
  if (['preparing', 'confirmed', 'out for delivery', 'assigned'].includes(value)) return 'bg-blue-100 text-blue-700';
  return 'bg-amber-100 text-amber-700';
};

export const initials = (name = '') => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'FF';