import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const dbFile = process.env.DB_FILE || "./data/erp.db";
const dbDir = path.dirname(dbFile);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

export const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Admin','Sales','Warehouse','Accounts')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT,
      business_name TEXT,
      gst_number TEXT,
      customer_type TEXT NOT NULL CHECK(customer_type IN ('Retail','Wholesale','Distributor')),
      address TEXT,
      status TEXT NOT NULL DEFAULT 'Lead' CHECK(status IN ('Lead','Active','Inactive')),
      followup_date TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS customer_followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      category TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 0,
      location TEXT,
      mrp REAL,
      emoji TEXT,
      rating REAL,
      review_count INTEGER DEFAULT 0,
      is_flash_deal INTEGER NOT NULL DEFAULT 0,
      storefront_visible INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      qty_change INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('IN','OUT')),
      reason TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS challans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challan_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Confirmed','Cancelled')),
      total_qty INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS challan_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challan_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name_snapshot TEXT NOT NULL,
      sku_snapshot TEXT NOT NULL,
      unit_price_snapshot REAL NOT NULL,
      qty INTEGER NOT NULL,
      FOREIGN KEY (challan_id) REFERENCES challans(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );

    -- ===== Flash-sale / reservation engine =====

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_id INTEGER,
      customer_city TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN (
        'RESERVED','PAYMENT_PENDING','PAYMENT_SUCCESS','PAYMENT_FAILED',
        'EXPIRED','CANCELLED','ALLOCATED','FULFILLED'
      )),
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      order_id INTEGER,
      queue_entry_id INTEGER,
      idempotency_key TEXT UNIQUE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS queue_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN (
        'WAITING','ELIGIBLE','RESERVED','CANCELLED','EXPIRED','FULFILLED'
      )),
      priority INTEGER NOT NULL DEFAULT 0,
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      reservation_id INTEGER,
      idempotency_key TEXT UNIQUE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS flash_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      warehouse TEXT,
      batch TEXT,
      distance_km REAL,
      allocation_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reservation_id) REFERENCES reservations(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      product_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec'))
    );

    CREATE TABLE IF NOT EXISTS flash_config (
      product_id INTEGER PRIMARY KEY,
      reservation_seconds INTEGER NOT NULL DEFAULT 30,
      max_retries INTEGER NOT NULL DEFAULT 2,
      grace_seconds INTEGER NOT NULL DEFAULT 5
    );

    -- ===== AI Demand Forecasting & Replenishment =====

    CREATE TABLE IF NOT EXISTS ai_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      current_stock INTEGER NOT NULL,
      available_stock INTEGER NOT NULL,
      demand_hits INTEGER NOT NULL,
      burn_rate_per_sec REAL NOT NULL,
      depletion_seconds REAL,
      stockout_risk TEXT NOT NULL CHECK(stockout_risk IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      forecasted_demand INTEGER NOT NULL,
      recommended_reorder_qty INTEGER NOT NULL,
      justification TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','MODIFIED','REJECTED')),
      decided_qty INTEGER,
      decided_by TEXT,
      decided_at TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- ===== Multi-warehouse / batch inventory + location-based allocation =====

    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      batch TEXT NOT NULL,
      mfg_date TEXT NOT NULL,
      expiry_date TEXT,
      physical INTEGER NOT NULL DEFAULT 0,
      allocated INTEGER NOT NULL DEFAULT 0,
      damaged INTEGER NOT NULL DEFAULT 0,
      UNIQUE(product_id, warehouse_id, batch),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    -- Known city coordinates for demo customers (used for haversine distance in allocation)
    CREATE TABLE IF NOT EXISTS city_coords (
      city TEXT PRIMARY KEY,
      lat REAL NOT NULL,
      lon REAL NOT NULL
    );
  `);

  const c = db.prepare("SELECT value FROM counters WHERE name = 'challan'").get();
  if (!c) db.prepare("INSERT INTO counters (name, value) VALUES ('challan', 0)").run();

  seedWarehousesAndCities();
}

// Real coordinates so allocation distance is a genuine haversine calculation, not a label.
const DEFAULT_WAREHOUSES: { code: string; name: string; city: string; lat: number; lon: number; capacity: number }[] = [
  { code: "BLR-01", name: "Bangalore Fulfillment Center", city: "Bangalore", lat: 12.9716, lon: 77.5946, capacity: 5000 },
  { code: "HYD-01", name: "Hyderabad Fulfillment Center", city: "Hyderabad", lat: 17.385, lon: 78.4867, capacity: 6000 },
  { code: "CHE-01", name: "Chennai Fulfillment Center", city: "Chennai", lat: 13.0827, lon: 80.2707, capacity: 5500 },
  { code: "DEL-01", name: "Delhi Fulfillment Center", city: "Delhi", lat: 28.6139, lon: 77.209, capacity: 8000 },
  { code: "MUM-01", name: "Mumbai Fulfillment Center", city: "Mumbai", lat: 19.076, lon: 72.8777, capacity: 7000 },
  { code: "KOL-01", name: "Kolkata Fulfillment Center", city: "Kolkata", lat: 22.5726, lon: 88.3639, capacity: 4500 },
];

// Coordinates for the demo customer cities generated by the flash-sale simulator.
const DEFAULT_CITY_COORDS: { city: string; lat: number; lon: number }[] = [
  { city: "Bangalore", lat: 12.9716, lon: 77.5946 },
  { city: "Hyderabad", lat: 17.385, lon: 78.4867 },
  { city: "Chennai", lat: 13.0827, lon: 80.2707 },
  { city: "Delhi", lat: 28.6139, lon: 77.209 },
  { city: "Mumbai", lat: 19.076, lon: 72.8777 },
  { city: "Kolkata", lat: 22.5726, lon: 88.3639 },
  { city: "Pune", lat: 18.5204, lon: 73.8567 },
  { city: "Ahmedabad", lat: 23.0225, lon: 72.5714 },
];

function seedWarehousesAndCities() {
  const existing = db.prepare("SELECT COUNT(*) as c FROM warehouses").get() as { c: number };
  if (existing.c === 0) {
    const insert = db.prepare(
      `INSERT INTO warehouses (code, name, city, lat, lon, capacity) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const w of DEFAULT_WAREHOUSES) insert.run(w.code, w.name, w.city, w.lat, w.lon, w.capacity);
  }
  const insertCity = db.prepare(
    `INSERT OR IGNORE INTO city_coords (city, lat, lon) VALUES (?, ?, ?)`
  );
  for (const c2 of DEFAULT_CITY_COORDS) insertCity.run(c2.city, c2.lat, c2.lon);
}

export function nextChallanNumber(): string {
  const row = db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'challan' RETURNING value").get() as { value: number };
  const year = new Date().getFullYear();
  return `CH-${year}-${String(row.value).padStart(4, "0")}`;
}
