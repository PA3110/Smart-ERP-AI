# Feature Comparison & Merge — "Vivek-ERP-Fixed" vs "vivek-erp-system"

You sent two projects. Here's what each actually had, and what this merged build now does.

## What "Vivek-ERP-Fixed" had that mine didn't (ported in this round)

| Feature | Fixed project | This build now |
|---|---|---|
| Multi-warehouse batch inventory | Real `inventory(physical/reserved/allocated/damaged)` per warehouse+batch | Ported: `warehouses` + `inventory_batches` tables, same physical/allocated/damaged model |
| Warehouse allocation | City-match heuristic, no real distance | **Upgraded further**: real haversine great-circle distance using actual lat/lon per warehouse and customer city — genuine geography, not a label |
| Customer purchase-intent scoring | Denormalized counters on `customers`, HIGH/MEDIUM/LOW | Ported as `customerIntentService.ts`, computed live from real `reservations` history (fulfilled/failed/cancelled/expired), same explainability requirement from the brief |
| Idempotency keys | On reservations + payments | Ported onto `reservations` **and** `queue_entries` (the Fixed project's version didn't dedupe on the queued path — see bug list below) |
| Reset-demo endpoint | `/api/reset-demo` | Ported as `/flash-sale/:productId/reset` |
| 6 named warehouses w/ real coordinates | Yes (4) | Extended to 6 (added Mumbai, Kolkata) |
| Richer Stitch screen set | 24 screens incl. admin audit logs, ops dashboards, carrier dispatch, warehouse pick-pack, RBAC, raft/quorum diagnostics | Copied into `stitch-reference/` in this zip for future phases |

## What mine had that "Fixed" didn't (kept)

- TypeScript throughout (Fixed was plain JS)
- Auth + JWT + role-based access control (Fixed had none — every API was open)
- CRM module (customers/products/challans) beyond the flash-sale demo
- AI Demand Forecasting & Replenishment module with human-approval gate
- Docker + production build pipeline (Fixed only had `node server.js`, no build step, no Dockerfile)
- Rate limiting on the hottest endpoint (new this round, see below)

## Bugs found in "Fixed" while comparing (not ported, fixed differently here)

1. **Idempotency gap**: Fixed only checked its idempotency key against the `reservations` table. A duplicate request that lands in the *queue* (item out of stock) would create a second queue entry — the exact "duplicate request" edge case from your original spec, still open. Fixed here: dedup checks both tables.
2. **No delete-order safety** in its reset path (`DELETE FROM ... ; DELETE FROM ...` in one `db.exec` string, relying on FK cascade order by luck). This is the same class of bug I found and fixed in my own reset endpoint below — worth calling out because it's an easy trap in both codebases.

## Bug found in my own code while extending it this round

`resetDemo()` deleted `reservations` **before** `flash_orders`, and `flash_orders.reservation_id` has a foreign-key constraint back to `reservations`. With `PRAGMA foreign_keys = ON`, that delete order throws mid-function and silently aborts the reset — leaving stale reservations/queue entries behind while the product's stock number had already changed. Fixed: delete children (`flash_orders`, `queue_entries`) before the parent (`reservations`), and wrapped the whole function in `db.transaction(...)` so a partial reset can never happen again.

## New for Big-Billion-Day-scale readiness (not in either project before)

- **Rate limiting** on `POST /flash-sale/buy-now` (300 requests / 10s per IP) — caps bot-style hammering without blocking real concurrent shoppers.
- **Real haversine distance** allocation instead of a hardcoded warehouse-distance table.
- **Warehouse Network panel** and **Recent Allocations panel** added to the console UI, showing live per-warehouse stock and the plain-English reason each order was routed where it was.
- **Customer intent badges** now shown live on every reservation card in the UI.

## Verified this round (live, against the compiled production build)

```
300 concurrent-style buyers vs 10 stock -> exactly 10 reserved, 290 queued (unchanged guarantee)
Payment success for a Mumbai customer -> allocated from Mumbai Fulfillment Center, 0 km,
  batch MUM-01-20260921, "2 units available" — real, verifiable numbers
Reset mid-flight (with a fulfilled order + 290-deep queue already present) -> previously
  threw and silently left stale data; now cleans up completely and returns fresh zeros
Idempotency retry on the QUEUED path -> second request returns the same queue entry id,
  duplicate: true — no more silent double-queuing
```

## Still not done (honest scope line)

RBAC is not yet applied to the flash-sale/AI-insights endpoints (they're intentionally open,
matching a public storefront checkout — CRM/products/challans are the ones behind login).
The 24 additional Stitch screens are reference assets only, not wired to live data yet.
Queue priority is still FIFO-only (no VIP override, though the Stitch set includes a
"VIP reservation override" screen for exactly that, ready for a future phase).
