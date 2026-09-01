# FeastFlow Replit setup

## Run the app

The `Start application` workflow runs `npm run dev`. That command starts the existing Express/MongoDB service on port 3000 and the React/Vite development server on port 5000. The Replit preview uses the React server on port 5000; Vite proxies `/api` and Socket.IO traffic to the backend.

For a production client build, run:

```bash
npm run build
```

## Frontend structure

The React frontend lives in `src/`:

- `src/pages/Customer.jsx` — WhatsApp-style customer assistant, menu, customizer, cart, checkout, tracking, and rewards.
- `src/pages/Login.jsx` — admin, staff, and rider login flows.
- `src/pages/Operations.jsx` — shared admin, manager, kitchen, and delivery portals.
- `src/pages/Rider.jsx` — assigned order, delivery status, and GPS workflow.
- `src/components/Portal.jsx` — shared layouts, navigation, tables, modals, status badges, and notifications.
- `src/services/api.js` — existing API contract and FeastFlow localStorage session keys.

The backend routes, models, services, authentication, database setup, and server-side Socket.IO implementation remain unchanged. MongoDB can be supplied with `MONGODB_URI`; when it is absent, the existing backend falls back to its MongoDB memory server.

## Demo logins

The existing seeded credentials remain available through the staff role presets:

- Admin: `admin@restaurant.com` / `admin123`
- Manager: `manager@restaurant.com` / `manager123`
- Kitchen: `kitchen@restaurant.com` / `kitchen123`
- Delivery: `delivery@restaurant.com` / `delivery123`
- Rider: `rider@restaurant.com` / `rider123`

Production deployments should provide `MONGODB_URI`, `JWT_SECRET`, and the WhatsApp webhook verification configuration through Replit Secrets rather than committing them.