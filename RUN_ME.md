# Vivek ERP System — Production Deployment

Two ways to run it, both build and run the actual compiled production server
(not a dev/watch process, not a "demo" mode).

## Option A — Docker (recommended for real deployment)
```bash
docker compose up --build -d
```
Then open **http://localhost:4000/**. Data persists in a Docker volume
(`vivek_erp_data`) across restarts. Set a real `JWT_SECRET` env var before
running in anything beyond a local trial:
```bash
JWT_SECRET=$(openssl rand -hex 48) docker compose up --build -d
```

## Option B — No Docker, straight on the host
```bash
./start.sh
```
This installs dependencies, compiles the TypeScript backend (`tsc`), generates
a real random `JWT_SECRET` into `backend/.env` on first run, seeds the database
if empty, and runs `node dist/server.js` — the compiled production build.

Either way:
- App + reservation console: **http://localhost:4000/**
- Demo login: `admin@erp.local` / `Admin@123`
- API: `/auth`, `/customers`, `/products`, `/challans`, `/flash-sale`

## What "production" means here concretely
- Backend runs compiled JS (`dist/`), not `ts-node-dev`.
- Docker image is multi-stage (build stage compiles, runtime stage only ships
  `dist/`, `public/`, and production `node_modules`).
- SQLite file lives on a persistent volume/path (`DB_FILE`), not wiped on restart.
- `start.sh` generates a real random JWT secret instead of using the placeholder.
- Verified from a clean checkout in this session: build succeeded, server came
  up, `GET /` returned 200 with the Nexora/Vivek UI, and the 10-stock-vs-100-buyer
  concurrency test (10 reserved / 90 queued, zero overselling) passed against
  this exact compiled build — see `END_TO_END_RUN.md`.

## Still not in this build (scope honesty)
Warehouse allocation is a 4-warehouse stub, no AI/demand-forecast module yet,
queue priority is FIFO-only, and most of the other Stitch screens (Demand AI,
role dashboards, checkout, dispatch, RBAC/audit UI) aren't wired to live data
yet — only the Reservation Console is. Tell me which one to build next.
