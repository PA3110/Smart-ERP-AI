import { db } from "../db";

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  capacity: number;
}

export interface AllocationResult {
  warehouseId: number;
  warehouseName: string;
  warehouseCity: string;
  batch: string;
  mfgDate: string;
  distanceKm: number;
  reason: string;
}

// Haversine formula — real great-circle distance in km between two lat/lon points.
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function cityCoords(city: string | null | undefined): { lat: number; lon: number } | null {
  if (!city) return null;
  const row = db.prepare(`SELECT lat, lon FROM city_coords WHERE city = ?`).get(city) as
    | { lat: number; lon: number }
    | undefined;
  return row ?? null;
}

/** Distribute a product's total stock across warehouses for the allocation demo (proportional to capacity). */
export function seedBatchesForProduct(productId: number, totalStock: number, mfgDate = new Date().toISOString().slice(0, 10)) {
  db.prepare(`DELETE FROM inventory_batches WHERE product_id = ?`).run(productId);
  const warehouses = db.prepare(`SELECT * FROM warehouses ORDER BY capacity DESC`).all() as Warehouse[];
  if (warehouses.length === 0 || totalStock <= 0) return;

  const totalCapacity = warehouses.reduce((s, w) => s + w.capacity, 0);
  let remaining = totalStock;
  const insert = db.prepare(
    `INSERT INTO inventory_batches (product_id, warehouse_id, batch, mfg_date, physical) VALUES (?, ?, ?, ?, ?)`
  );
  warehouses.forEach((w, idx) => {
    const isLast = idx === warehouses.length - 1;
    const share = isLast ? remaining : Math.round((w.capacity / totalCapacity) * totalStock);
    const qty = Math.max(0, Math.min(remaining, share));
    remaining -= qty;
    if (qty > 0) {
      insert.run(productId, w.id, `${w.code}-${mfgDate.replace(/-/g, "")}`, mfgDate, qty);
    }
  });
}

function batchAvailable(row: { physical: number; allocated: number; damaged: number }): number {
  return row.physical - row.allocated - row.damaged;
}

/**
 * Pick the best warehouse+batch to fulfil `qty` units for a customer in `customerCity`.
 * Real ranking: nearest warehouse (haversine, using actual lat/lon) among those with
 * enough available stock, tie-broken by oldest batch first (FIFO). Every number in the
 * returned reason is one you can verify against the warehouses/inventory_batches tables.
 */
export function chooseAllocation(productId: number, customerCity: string | undefined, qty: number): AllocationResult | null {
  const batches = db
    .prepare(
      `SELECT ib.*, w.name as warehouse_name, w.city as warehouse_city, w.lat as w_lat, w.lon as w_lon
       FROM inventory_batches ib JOIN warehouses w ON w.id = ib.warehouse_id
       WHERE ib.product_id = ?`
    )
    .all(productId) as (Warehouse & {
      id: number;
      warehouse_id: number;
      batch: string;
      mfg_date: string;
      physical: number;
      allocated: number;
      damaged: number;
      warehouse_name: string;
      warehouse_city: string;
      w_lat: number;
      w_lon: number;
    })[];

  const eligible = batches.filter((b) => batchAvailable(b) >= qty);
  if (eligible.length === 0) return null;

  const origin = cityCoords(customerCity);

  const scored = eligible.map((b) => {
    const distanceKm = origin ? haversineKm(origin.lat, origin.lon, b.w_lat, b.w_lon) : 99999;
    return { b, distanceKm };
  });

  scored.sort((x, y) => {
    if (x.distanceKm !== y.distanceKm) return x.distanceKm - y.distanceKm;
    return new Date(x.b.mfg_date).getTime() - new Date(y.b.mfg_date).getTime(); // FIFO tie-break
  });

  const pick = scored[0];
  const reason = origin
    ? `Nearest warehouse with sufficient stock: ${pick.b.warehouse_name} is ${pick.distanceKm.toFixed(0)} km from ${customerCity}, batch ${pick.b.batch} (mfg ${pick.b.mfg_date}) has ${batchAvailable(pick.b)} units available.`
    : `Customer city unknown — defaulted to ${pick.b.warehouse_name}, batch ${pick.b.batch} (${batchAvailable(pick.b)} units available).`;

  return {
    warehouseId: pick.b.warehouse_id,
    warehouseName: pick.b.warehouse_name,
    warehouseCity: pick.b.warehouse_city,
    batch: pick.b.batch,
    mfgDate: pick.b.mfg_date,
    distanceKm: Math.round(pick.distanceKm),
    reason,
  };
}

export function commitAllocation(batchWarehouseId: number, productId: number, batch: string, qty: number) {
  db.prepare(
    `UPDATE inventory_batches SET allocated = allocated + ? WHERE product_id = ? AND warehouse_id = ? AND batch = ?`
  ).run(qty, productId, batchWarehouseId, batch);
}

export function listWarehouseBreakdown(productId: number) {
  return db
    .prepare(
      `SELECT ib.warehouse_id, w.name as warehouse_name, w.city, ib.batch, ib.mfg_date, ib.physical, ib.allocated, ib.damaged,
              (ib.physical - ib.allocated - ib.damaged) as available
       FROM inventory_batches ib JOIN warehouses w ON w.id = ib.warehouse_id
       WHERE ib.product_id = ? ORDER BY w.name`
    )
    .all(productId);
}
