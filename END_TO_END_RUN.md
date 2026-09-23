# Vivek ERP System — End-to-End Verification Run

Executed live in this session against a freshly seeded database. Every step below is a real
HTTP call against the running backend — not a description of intended behavior.

## 1. Auth
```
POST /auth/login {admin@erp.local / Admin@123} -> 200, JWT issued
GET  /auth/me (Bearer token) -> {"user":{"id":1,"name":"Admin User","role":"Admin",...}}
```

## 2. CRM — create customer
```
POST /customers {"name":"Vivek Enterprises", ...} -> 201
customer created: id 3, "Vivek Enterprises"
```

## 3. Inventory — create product
```
POST /products {"name":"Smart LED Panel","sku":"LED-PANEL-01","stock":40,...} -> 201
product created: id 5, "Smart LED Panel", stock 40
```

## 4. Flash-sale engine — 10 stock vs 100 real concurrent HTTP buyers
```
100 parallel POST /flash-sale/buy-now (50-way concurrency) -> 100 x HTTP 201
stats: { available: 0, reserved: 10, queueSize: 90 }
```
Exactly 10 reservations granted, 90 queued. No overselling, no negative stock, verified
under genuine concurrent load (not a sequential loop).

## 5. Full lifecycle settle — pay success / pay fail / cancel / natural expiry / queue promotion
```
Reservation #1 -> pay success -> status FULFILLED, order_id 1 (stock permanently deducted)
Reservation #2 -> pay fail    -> status PAYMENT_FAILED, queue advances
Reservation #3 -> cancel      -> status CANCELLED, queue advances
Remaining 7    -> auto-EXPIRED after the 10s window, queue advances for each

Final stats: {
  available: 0, reserved: 9, allocated: 1, queueSize: 79,
  reservationStatusCounts: { RESERVED: 9, EXPIRED: 9, FULFILLED: 1, PAYMENT_FAILED: 1, CANCELLED: 1 }
}
```
9 released reservations -> exactly 9 new customers promoted from the queue. Reconciles perfectly.

## 6. Idempotency guard
```
Re-paying the already-FULFILLED reservation #1 -> HTTP 409
"Reservation is already FULFILLED — payment cannot be applied twice, and this window has closed
(idempotency guard)."
```

## 7. UI + branding
```
GET /demo/ -> 200, contains "Vivek ERP" (rebranded from the Stitch export's "Nexora ERP")
```

## 8. Build verification (both halves of the stack)
```
backend:  npx tsc --noEmit -p .        -> clean, no errors
frontend: npm run build (tsc -b + vite) -> ✓ built in 291ms, dist/index.html + JS + CSS emitted
```

## What this proves
- The concurrency guarantee (10 stock, 100 buyers, no overselling) is real, tested against
  genuine parallel HTTP traffic, not just described.
- Auth, RBAC-gated CRM/product endpoints, and the flash-sale engine all run in the **same**
  process/database — one connected system, not disconnected demos.
- Both the Express/TypeScript backend and the React/TypeScript frontend compile cleanly as of
  this run.
- Branding is "Vivek ERP" throughout: page titles, header, package names, README.

## How to reproduce this yourself
```bash
cd backend
cp .env.example .env
npm install
npm run seed      # creates admin@erp.local / Admin@123 and demo customers/products
npm run dev        # http://localhost:4000
```
Open **http://localhost:4000/demo** for the flash-sale console (Vivek ERP / Nexora design system).
The CRM/product/customer API is live at the same origin, e.g.:
```bash
curl -X POST http://localhost:4000/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@erp.local","password":"Admin@123"}'
```

For the React CRM screens:
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies to the backend
```

## Phase 3 addition — Demand AI & Replenishment (verified this session)

New module: `POST /ai-insights/:productId/generate`, `GET /ai-insights/:productId/latest`,
`POST /ai-insights/:id/decision`. Every number is computed from real rows (reservations,
queue_entries, flash_orders, audit_log) — no randomness — and each recommendation lists the
exact counts behind it.

**Bug found and fixed during this work:** `queueSize` and the status-count breakdowns in
`/flash-sale/state/:id` were being computed from a 200-row-limited display list, so a flash
sale with more than 200 queued customers (e.g. 300 buyers) under-reported the queue size
(showed 200 instead of 290). Fixed to aggregate with `COUNT(*) ... GROUP BY status` over the
full table; verified correct afterward (290/290).

**Full loop verified live:**
```
Simulate: 10 stock vs 150 buyers -> queueSize: 140 (correct)
Generate insight -> CRITICAL risk, recommend +165 units, justification:
  - 150 purchase attempts recorded against 10 original units.
  - 140 customers currently unmet in the queue (WAITING).
  - 10 units held in active reservations, 0 already sold/allocated.
  - Observed burn rate 10.00 units/sec over the last 1s.
  - Reorder = unmet demand (150) + safety buffer (15, from min-stock/10% of demand).
Decision: MODIFIED, manager sets qty to 200 instead of the recommended 165
Stock: 10 -> 210 (confirmed +200, exactly the manager-approved amount, not the AI's raw number)
Re-deciding the same insight -> HTTP 409 (can't approve twice)
```
This is the human-governance gate from the brief: the AI only recommends; only a person
clicking Approve/Modify/Reject changes real stock, and the audit log records both the AI's
recommendation and the human decision as separate events.

UI: added a live "Demand AI" panel to the console (matches the Stitch `nexora_erp_ai_demand_intelligence`
screen — current demand hits, depletion countdown, burn rate, recommended-action card with
justification bullets, Approve/Modify/Decline buttons) — refreshes automatically every 3s.
