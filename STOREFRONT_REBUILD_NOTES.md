# Vivek ERP System — Storefront + Admin Rebuild

You asked for four things to stop this feeling like a demo. Here's what changed, concretely.

## 1. Real storefront, separate from admin

- **`/`** — a real shop: hero banner, ⚡ Flash Deals section, regular catalog grid. Fetches
  `GET /storefront/products` (public, no login).
- **`/product.html?id=N`** — product detail page: price, MRP struck through, discount %,
  rating, live "Only N left!" urgency banner, description, a single **Buy Now** button.
- **`/order.html`** — the actual post-purchase journey: countdown timer, a **Pay** button that
  calls a simulated payment gateway (85% success / 15% decline, like a real card processor
  would report), and on success a real order confirmation showing the warehouse, batch, and
  the plain-English reason that warehouse was chosen. If sold out, shows queue position and
  auto-upgrades the page the instant a slot opens.
- **`/admin/`** — a completely separate ops console with a persistent left sidebar
  (Dashboard, Inventory & Warehouses, Reservations & Queue, Demand AI, Orders, Customers,
  Load Test), each a real page fetching live data, not a scroll of cards.

## 2. Real identity instead of "Customer 47"

The storefront asks a visitor for their name and city once (tap the person icon), stores it
locally, and uses *that* for every purchase — so reservations, orders, and CRM records all
show real names like "Ananya Sharma," not synthetic labels. Verified: a purchase by "Ananya
Sharma" showed up correctly in the CRM customer list *and* the orders feed after payment.

## 3. "Simulate Flash Sale" moved out of the customer's way

The bulk buyer-generator still exists — you need it to demonstrate "300 people vs 10 units"
without literally opening 300 browser tabs — but it now lives under **Admin → Load Test**,
clearly labeled as a stress-testing tool, separate from the real Buy Now flow a shopper uses.

## 4. Real product catalog

Seeded 7 consumer products: 3 flash deals (iPhone 17 Pro, Samsung Galaxy S26 Ultra, Sony
WH-1000XM6 — all low-stock, high-discount) and 4 regular catalog items (TV, earbuds, Instant
Pot, laptop — well-stocked). Real MRP/discount/rating/review-count fields, matching how an
actual Big Billion Day listing looks. The original B2B hardware catalog (PVC pipes, wire,
bulbs) is untouched underneath for the existing CRM/challan workflows.

## Two real bugs found and fixed while building this

1. **AI Demand Forecasting crashed** (`NOT NULL constraint failed: burn_rate_per_sec`). Cause:
   SQLite's `datetime('now')` returns `"2026-09-21 21:00:59"` — space-separated, no timezone —
   and the code was naively appending `"Z"` to treat it as ISO-8601, producing an invalid
   `Date`, `NaN`, and a failed insert. Fixed by properly converting the SQLite format to ISO
   before parsing, plus a defensive `Number.isFinite` guard so this class of bug can't crash
   the endpoint again even if a future timestamp source is malformed.
2. Re-confirmed the earlier `resetDemo` FK-ordering fix still holds under the new schema.

## Verified end-to-end this round (compiled production build, `node dist/server.js`)

```
GET /            -> 200 (storefront)
GET /admin/      -> 200 (admin console)
Buy Now (Ananya Sharma, Bangalore) -> reservation -> pay success -> FULFILLED
  -> order routed to Bangalore Fulfillment Center, 0 km, batch shown
Ananya Sharma appears in /customers (CRM) and /flash-sale/orders/all afterward
300 real concurrent buyers vs 10-stock Samsung -> exactly 10 reserved, 290 queued, 300x HTTP 201
AI insight generation -> works before and after a real sale; burn rate correctly
  changes from 0 to a real nonzero value once a sale has happened
Admin dashboard summary -> correctly aggregates reserved/queued/sold/revenue across products
Backend production build (tsc) and frontend (vite build) both compile clean
```

## Deployment to a public URL — what I can and can't do

I can't push this to a live server myself from here — I have no hosting credentials or
deploy access, and this app needs a real, persistent backend process (the concurrency
guarantee depends on a real SQLite database with transactions; it cannot run as a static
page or serverless function). What I *have* done is make it deployable in one step anywhere
that runs Docker, via the included `Dockerfile` and `docker-compose.yml`.

**Fastest real path to a public HTTPS URL (free tier, ~10 minutes), using Render:**
1. Push this project to a GitHub repo (private is fine).
2. Go to render.com → New → Web Service → connect that repo.
3. Render auto-detects the `Dockerfile` — accept the defaults.
4. Add an environment variable `JWT_SECRET` with a long random value.
5. Add a **persistent disk** mounted at `/app/data` (Render's free disk tier is enough for a
   SQLite demo) so the database survives restarts.
6. Deploy. Render gives you a `https://your-app.onrender.com` URL — share that.

Railway.app works almost identically (New Project → Deploy from GitHub → it detects the
Dockerfile automatically; add a volume for `/app/data`).

If you'd like, I can prepare the exact `render.yaml` / `railway.json` config file so steps
2–5 above are one click instead of manual — say the word and I'll add it to the project.
