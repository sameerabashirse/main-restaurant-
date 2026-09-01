const http = require('http');

const routes = [
  { url: 'http://127.0.0.1:3000/', name: 'Customer WhatsApp Interface' },
  { url: 'http://127.0.0.1:3000/staff/login', name: 'Staff Operations Login' },
  { url: 'http://127.0.0.1:3000/admin/login', name: 'Super Admin Login' },
  { url: 'http://127.0.0.1:3000/rider/login', name: 'Rider Login' },
  { url: 'http://127.0.0.1:3000/admin/dashboard', name: 'Executive Admin Dashboard' },
  { url: 'http://127.0.0.1:3000/staff/manager/dashboard', name: 'Manager Dashboard' },
  { url: 'http://127.0.0.1:3000/staff/kitchen/dashboard', name: 'Kitchen KDS Dashboard' },
  { url: 'http://127.0.0.1:3000/staff/delivery/dashboard', name: 'Delivery Dispatch Dashboard' },
  { url: 'http://127.0.0.1:3000/rider/dashboard', name: 'Rider Mobile Portal' },
  { url: 'http://127.0.0.1:3000/css/styles.css', name: 'Supplementary Stylesheet' },
  { url: 'http://127.0.0.1:3000/js/api.js', name: 'API Client Module' },
  { url: 'http://127.0.0.1:3000/js/auth.js', name: 'Auth Guard Module' },
  { url: 'http://127.0.0.1:3000/js/utils.js', name: 'UI Helpers Module' },
  { url: 'http://127.0.0.1:3000/js/customer.js', name: 'Customer Chat Module' },
  { url: 'http://127.0.0.1:3000/js/admin.js', name: 'Admin Controller Module' }
];

async function checkRoute(r) {
  return new Promise((resolve) => {
    http.get(r.url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const hasTailwind = data.includes('cdn.tailwindcss.com') || r.url.endsWith('.js') || r.url.endsWith('.css');
        console.log(`[${res.statusCode === 200 ? '✅ 200' : '❌ ' + res.statusCode}] ${r.name} (${data.length} bytes, Tailwind: ${hasTailwind})`);
        resolve(res.statusCode === 200);
      });
    }).on('error', e => {
      console.error(`❌ Error fetching ${r.name}:`, e.message);
      resolve(false);
    });
  });
}

async function verifyAll() {
  console.log('🌐 Verifying Static & HTML Portal Assets...\n');
  for (const r of routes) {
    await checkRoute(r);
  }
  console.log('\n✨ Asset Verification Complete!');
}

verifyAll();
