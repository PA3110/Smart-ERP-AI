# Vivek ERP System — ERP + CRM + Flash-Sale Reservation Engine

A full-stack operations portal for a wholesale/distribution business, covering
authentication with roles, customer CRM, product/inventory management, and a
sales challan workflow with stock-safe business logic.

Built for the "Full Stack Developer Case Study" brief.

## Tech stack

**Backend:** Node.js, TypeScript, Express.js, SQLite (via `better-sqlite3`), JWT auth, Zod validation
**Frontend:** React 19, TypeScript, Vite, React Router, Axios
**Deployment target:** any Node host (Render/Railway/Fly.io) for the API + any static host (Vercel/Netlify) for the frontend

> **Why SQLite instead of PostgreSQL/MySQL?** SQLite keeps the project runnable
> with zero external setup (no DB server, no connection strings) so it can be
> cloned and run in minutes. The schema and queries are simple SQL and can be
> ported to PostgreSQL by swapping `better-sqlite3` for `pg`/`postgres.js` and
> adjusting the `AUTOINCREMENT`/`datetime('now')` syntax. See "Porting to
> PostgreSQL" below if that's required for grading.

## Project structure

```
erp-crm/
├── backend/                 # Express + TypeScript API
│   ├── src/
│   │   ├── db/               # SQLite connection, schema, seed script
│   │   ├── middleware/        # JWT auth, role guard, error handler
│   │   ├── routes/            # auth, customers, products, challans
│   │   └── server.ts
│   ├── .env.example
│   └── package.json
├── frontend/                 # React + Vite admin UI
│   ├── src/
│   │   ├── api/               # axios client
│   │   ├── context/           # auth context
│   │   ├── components/        # shell, route guard, status tag
│   │   └── pages/              # login, dashboard, customers, products, challans
│   ├── .env.example
│   └── package.json
└── postman_collection.json   # Import into Postman to exercise every endpoint
```

## Core modules implemented

1. **Authentication & roles** — JWT login, 4 roles (Admin, Sales, Warehouse, Accounts), route-level role checks on both the API (middleware) and UI (buttons/actions hidden or blocked by role).
2. **Customer CRM** — add/edit/search/detail view, follow-up notes log, status (Lead/Active/Inactive), customer type (Retail/Wholesale/Distributor).
3. **Product & inventory** — add/edit products, stock movement log (IN/OUT with reason, actor, timestamp), low-stock flag against `min_stock`.
4. **Sales challans** — multi-product challan builder, auto-generated challan numbers (`CH-YYYY-NNNN`), Draft → Confirmed → Cancelled lifecycle, **atomic stock reduction on confirm**, **hard block on negative stock** (with a clear error listing exactly which products are short), and **product snapshots** (name/SKU/price captured at challan time so historic challans don't change if a product is later edited).

## Business logic notes (what to look at first)

The important logic lives in `backend/src/routes/challans.ts`:

- `confirmChallan()` checks stock for **every** line item before mutating anything, then performs the stock decrement and writes a `stock_movements` row inside a single SQLite transaction. If any product is short, the whole confirm is rejected and nothing changes.
- Challan line items store `product_name_snapshot`, `sku_snapshot`, and `unit_price_snapshot` — not just a `product_id` — so a challan's history is immutable even if the product catalog changes later.
- Cancelling a **Confirmed** challan restocks the products and logs an `IN` movement referencing the cancelled challan, so the stock ledger stays consistent.

## Running locally

### 1. Backend

```bash
cd backend
cp .env.example .env      # edit JWT_SECRET for anything beyond local testing
npm install
npm run seed               # creates the SQLite DB and demo users/data
npm run dev                 # starts the API on http://localhost:4000
```

Demo logins (created by the seed script):

| Role       | Email                  | Password       |
|------------|-------------------------|----------------|
| Admin      | admin@erp.local          | Admin@123      |
| Sales      | sales@erp.local          | Sales@123      |
| Warehouse  | warehouse@erp.local      | Warehouse@123  |
| Accounts   | accounts@erp.local       | Accounts@123   |

### 2. Frontend

```bash
cd frontend
cp .env.example .env       # VITE_API_URL should point at the backend
npm install
npm run dev                 # starts the UI on http://localhost:5173
```

Open `http://localhost:5173`, sign in with any demo login above (or click a
demo login on the page to autofill it).

### 3. API testing

Import `postman_collection.json` into Postman. Run **Auth → Login (Sales)**
first — it stores the JWT into a collection variable that every other request
reuses automatically.

## Environment variables

**backend/.env**
```
PORT=4000
JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=8h
DB_FILE=./data/erp.db
CORS_ORIGIN=http://localhost:5173
```

**frontend/.env**
```
VITE_API_URL=http://localhost:4000
```

## Deployment

The app deploys as two independent services plus a database:

- **Backend** → Render / Railway / Fly.io (any Node 18+ host). Build command
  `npm install && npm run build`, start command `npm start`. Set `PORT`,
  `JWT_SECRET`, `CORS_ORIGIN` (your deployed frontend URL) as environment
  variables. Run `npm run seed` once via the platform's shell/console after
  first deploy to create demo users.
- **Frontend** → Vercel / Netlify / Render Static Site. Build command
  `npm install && npm run build`, publish directory `dist`. Set `VITE_API_URL`
  to your deployed backend URL.
- **Database** → the SQLite file persists on the backend host's disk. For a
  platform with ephemeral disks (e.g. most free tiers), either enable a
  persistent volume, or port to PostgreSQL (see below) and use
  Supabase/Neon/Render Postgres free tier.

AWS deployment was treated as the optional bonus per the brief and was not
pursued for this submission; the stack above satisfies the requirement using
free-tier hosting with a documented, reproducible setup.

## Porting to PostgreSQL (if required)

The schema in `backend/src/db/index.ts` uses only portable SQL (no SQLite-only
functions besides `datetime('now')`, `AUTOINCREMENT`, and the `RETURNING`
clause used for the challan counter, all of which have direct Postgres
equivalents). To port:

1. Swap `better-sqlite3` for `pg` (or the `postgres` package) and change the
   connection setup in `db/index.ts`.
2. Replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `SERIAL PRIMARY KEY`.
3. Replace `datetime('now')` defaults with `now()`.
4. Route handlers are written as parameterized SQL via `better-sqlite3`'s
   `.prepare().run()/.get()/.all()`; converting to `pg`'s `pool.query()` is a
   mechanical find-and-replace since the SQL itself is standard.

## Known limitations

- No PDF invoice export (listed as a bonus feature in the brief — not implemented).
- No Docker setup or CI/CD pipeline (bonus features — not implemented).
- No product image upload to S3 (bonus feature — not implemented).
- Challan edit UI only supports replacing line items while in Draft status (matches the spec: only Draft challans are editable).
- Pagination exists on all list endpoints, but the frontend currently requests a generous page size instead of exposing page-through controls in the UI — acceptable for this dataset size but would need pager controls for very large datasets.
- Single SQLite file means concurrent write throughput is lower than a networked database; fine for an internal ops tool at this scale, but PostgreSQL is recommended before scaling to many concurrent warehouse staff.

## Architecture summary

A stateless Express API issues short-lived JWTs after verifying credentials
against bcrypt-hashed passwords. Every protected route validates the JWT and,
where relevant, checks the caller's role before touching the database. The
React frontend stores the JWT in `localStorage`, attaches it to every request
via an axios interceptor, and redirects to `/login` on any `401`. Business
rules that must never be bypassed (stock can't go negative, challans store
immutable snapshots) are enforced only in the backend — the frontend's
role-based UI hiding is a convenience, not a security boundary.
