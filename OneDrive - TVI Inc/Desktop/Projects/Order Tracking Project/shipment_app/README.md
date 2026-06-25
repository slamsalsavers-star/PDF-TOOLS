# ShipmentMS — Multi-Tenant Shipment Management System

A production-ready, multi-tenant SaaS application for shipping companies.

## Tech Stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Backend   | Node.js · Express · TypeScript · Zod               |
| Frontend  | React 18 · Vite · TypeScript · Tailwind CSS        |
| State     | TanStack Query (server) · Zustand (client)          |
| Forms     | React Hook Form + Zod resolvers                     |
| Auth      | JWT (access 15m) + Refresh token (7d, httpOnly cookie) |
| Database  | PostgreSQL (row-based multi-tenancy)                |
| Scraper   | Puppeteer (Maersk booking lookup)                   |

## Quick Start

### 1. Configure environment
```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and the JWT secrets
```

### 2. Database setup (creates DB + runs all migrations)
```bash
node database/setup.js
```

### 3. Seed demo data
```bash
node database/seed.js
# Credentials: admin@demo.com / Admin1234!  (tenant slug: demo)
```

### 4. Start development
```bash
npm run dev
# Backend: http://localhost:4000
# Frontend: http://localhost:5173
```

## Project Structure

```
shipment_app/
├── backend/
│   └── src/
│       ├── config/env.ts          # Zod-validated env
│       ├── db/client.ts           # pg pool + typed helpers
│       ├── middleware/            # auth, validate, error
│       ├── utils/                 # errors, response, pagination
│       └── modules/
│           ├── auth/              # login, refresh, logout, me
│           ├── users/
│           ├── roles/             # + permissions
│           ├── shipments/         # + statuses + comments
│           ├── bookings/          # + Maersk lookup
│           ├── customers/
│           ├── forwarders/
│           ├── shipping-lines/
│           ├── periods/
│           ├── facilities/
│           └── reference/         # statuses, types, dashboard
├── frontend/
│   └── src/
│       ├── api/                   # Axios wrappers per module
│       ├── components/            # ui/ + layout/
│       ├── hooks/                 # useConfirm
│       ├── pages/                 # one folder per module
│       ├── store/auth.store.ts    # Zustand with persistence
│       └── types/index.ts
└── database/
    ├── migrations/001_schema.sql  # Full schema (auto-applied)
    ├── setup.js                   # Migration runner
    └── seed.js                    # Demo tenant + admin user
```

## API Endpoints

All routes are prefixed `/api/v1/`.

| Module         | Endpoints                                              |
|----------------|--------------------------------------------------------|
| Auth           | POST /auth/login, /auth/refresh, /auth/logout, GET /auth/me |
| Shipments      | CRUD + POST /:id/statuses + POST /:id/comments        |
| Bookings       | CRUD + POST /lookup (Maersk scraper)                   |
| Customers      | CRUD (paginated)                                       |
| Forwarders     | CRUD                                                   |
| Shipping Lines | CRUD                                                   |
| Periods        | CRUD (open/close)                                      |
| Facilities     | CRUD                                                   |
| Users          | CRUD (admin)                                           |
| Roles          | CRUD + permission assignment                           |
| Reference      | /statuses, /shipment-types, /countries, /dashboard     |

## Multi-Tenancy

- Every table has a `tenant_id` FK to `tenants`
- JWT payload carries `tenantId` — all queries are scoped automatically
- Users log in with `email + password + tenant_slug`

## RBAC

- Roles → Permissions (module × action)
- Modules: shipments, bookings, customers, forwarders, shipping_lines, periods, facilities, users, roles, settings
- Actions: view, create, edit, delete
- `requirePermission(module, action)` middleware on every route

## Maersk Booking Lookup

Uses the Puppeteer scraper at `scripts/maersk_scraper.js`.  
POST `/api/v1/bookings/lookup` → returns `{ vessel, voyage, eta, cut_off, ... }`.
