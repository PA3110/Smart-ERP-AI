# SmartERP AI — Phase 1: Flash-Sale Reservation/Queue Engine

Built on top of the `erp-crm-project` foundation (Express + TypeScript + better-sqlite3 backend,
React+TS+Vite frontend — CRM/products/challans already working from that starter).

## What's new (this phase)

- `backend/src/db/index.ts` — added `reservations`, `queue_entries`, `flash_orders`,
  `audit_log`, `flash_config` tables.
- `backend/src/services/flashSaleService.ts` — the actual concurrency-safe engine:
  atomic reserve-or-queue, expiry sweep, queue promotion, payment success/fail,
  idempotency guard against double payment, full audit logging.
- `backend/src/routes/flashSale.ts` — REST API: `/flash-sale/simulate`, `/buy-now`,
  `/:id/pay`, `/:id/cancel`, `/state/:productId`, `/config/:productId`.
- `backend/public/index.html` — a functional (not styled-to-spec yet) demo page:
  live KPI cards, reservation table with countdowns and Pay ✓/✗ buttons, queue table,
  audit feed. Served at `/demo`.

## Why it's actually safe, not just visually safe

`better-sqlite3` is synchronous. Every state-changing function (`buyNow`, `promoteQueue`,
`releaseReservation`, `confirmPayment`) is wrapped in `db.transaction(...)`. Because Node
is single-threaded and these calls block the event loop for their (sub-millisecond) duration,
two requests can never interleave mid-check: each request fully reads current
stock/reservations and writes its decision before the next one starts. That's what
guarantees no overselling under real concurrent load — verified below, not just claimed.

## Verified test results (run in this session)

**100 truly parallel HTTP requests against 10 units of stock:**
```
HTTP codes: 100 × 201 (all requests accepted)
stats: { available: 0, reserved: 10, queueSize: 90 }
```
Exactly 10 reservations, 90 queued. No overselling, no negative stock, no duplicate allocation.

**Full lifecycle (pay success / pay fail / cancel / natural expiry / queue promotion):**
```
Pay success -> reservation FULFILLED, order created, stock permanently deducted
Pay fail    -> reservation PAYMENT_FAILED, queue advances
Cancel      -> reservation CANCELLED, queue advances
7 remaining -> auto-EXPIRED after the configured window, queue advances for each
Net: 9 released reservations -> exactly 9 new customers promoted from the queue
```

**Idempotency / double-payment guard:**
```
Re-paying an already-FULFILLED reservation -> HTTP 409,
"Reservation is already FULFILLED — payment cannot be applied twice..."
```

## Known simplifications in this phase (to be built out next)

- Warehouse allocation is a stub (nearest of 4 hardcoded warehouses) — the full
  multi-factor allocation engine (batch/FEFO/SLA/cost) is phase-2+ scope.
- Queue priority is pure chronological FIFO; configurable business-priority rules
  aren't wired in yet.
- Demo UI is plain HTML/JS, intentionally unstyled — it will be replaced by the
  real Stitch-matched screens in phase 2.
- CRM intent scoring, AI insights, and the other ~20 ERP modules from the spec are
  not started; this phase deliberately isolates the hardest correctness problem first.

## Running it

```bash
cd backend
cp .env.example .env
npm install
npm run seed     # optional: demo CRM users/customers/products from the base template
npm run dev       # http://localhost:4000
```
Open **http://localhost:4000/demo** and click "Simulate Flash Sale".

## Phase 2 update — real UI, matched to the Stitch/Nexora design system

The uploaded Stitch export (`stitch_nexora_intelligent_erp_system`) contained full working
HTML/Tailwind source per screen plus `DESIGN.md` (exact color tokens, type scale, spacing,
component specs) for a design called **"Nexora ERP."** Per your instruction, that design is
authoritative, so the demo UI at `/demo` now uses the *exact* Tailwind config, color tokens,
fonts (Hanken Grotesk + JetBrains Mono + Material Symbols), and component patterns from that
export (hero product card, TOTAL/AVAILABLE/RESERVED/SOLD grid, reservation cards, "Demand
Waitlist Priority Queue" ranked cards, "Immutable Event Ledger") — not a generic redesign.

It's wired to the real, already-tested backend (no mock data): Run Simulation calls
`/flash-sale/simulate`, reservation cards call `/flash-sale/:id/pay` and `/:id/cancel` live,
and everything polls `/flash-sale/state/:id` every second.

Note: the Stitch export bakes in the product name **"Nexora ERP"** (logo, header text) rather
than "SmartERP AI" from the original brief — flagging this in case you want it renamed; happy
to swap it, just say the word.

Remaining Stitch screens not yet wired to live data (good phase-3 targets, once more of the
backend exists to back them): Demand AI, role dashboards (Sales/Operations/Admin), checkout/
payment screens, warehouse pick-pack, carrier dispatch, RBAC/audit-log screens.
