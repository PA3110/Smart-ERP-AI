import { db } from "../db";
import { ApiError } from "../utils/errors";
import { findOrCreateCustomer, computeIntent } from "./customerIntentService";
import { chooseAllocation, commitAllocation, seedBatchesForProduct, listWarehouseBreakdown } from "./warehouseAllocationService";
// ---------- Types ----------

export type ReservationStatus =
  | "RESERVED" | "PAYMENT_PENDING" | "PAYMENT_SUCCESS" | "PAYMENT_FAILED"
  | "EXPIRED" | "CANCELLED" | "ALLOCATED" | "FULFILLED";

export interface Product {
  id: number;
  name: string;
  sku: string;
  stock: number;
}

export interface Reservation {
  id: number;
  product_id: number;
  customer_name: string;
  customer_id: number | null;
  customer_city: string | null;
  qty: number;
  status: ReservationStatus;
  requested_at: string;
  expires_at: string;
  order_id: number | null;
  queue_entry_id: number | null;
  idempotency_key: string | null;
}

export interface QueueEntry {
  id: number;
  product_id: number;
  customer_name: string;
  qty: number;
  status: string;
  priority: number;
  requested_at: string;
  reservation_id: number | null;
}

const DEFAULT_RESERVATION_SECONDS = 30;

// ---------- Audit ----------

function audit(eventType: string, entityType: string, entityId: number | null, productId: number | null, details: unknown) {
  db.prepare(
    `INSERT INTO audit_log (event_type, entity_type, entity_id, product_id, details) VALUES (?, ?, ?, ?, ?)`
  ).run(eventType, entityType, entityId, productId, JSON.stringify(details ?? {}));
}

// ---------- Config ----------

export function getConfig(productId: number): { reservation_seconds: number; max_retries: number } {
  const row = db.prepare(`SELECT reservation_seconds, max_retries FROM flash_config WHERE product_id = ?`).get(productId) as
    | { reservation_seconds: number; max_retries: number }
    | undefined;
  if (row) return row;
  return { reservation_seconds: DEFAULT_RESERVATION_SECONDS, max_retries: 2 };
}

export function setConfig(productId: number, reservationSeconds: number, maxRetries = 2) {
  db.prepare(
    `INSERT INTO flash_config (product_id, reservation_seconds, max_retries) VALUES (?, ?, ?)
     ON CONFLICT(product_id) DO UPDATE SET reservation_seconds = excluded.reservation_seconds, max_retries = excluded.max_retries`
  ).run(productId, reservationSeconds, maxRetries);
}

// ---------- Core stock math ----------

function getProduct(productId: number): Product | undefined {
  return db.prepare(`SELECT id, name, sku, stock FROM products WHERE id = ?`).get(productId) as Product | undefined;
}

function reservedQty(productId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(qty), 0) as total FROM reservations
       WHERE product_id = ? AND status IN ('RESERVED','PAYMENT_PENDING')`
    )
    .get(productId) as { total: number };
  return row.total;
}

export function availableStock(productId: number): number {
  const product = getProduct(productId);
  if (!product) return 0;
  return Math.max(0, product.stock - reservedQty(productId));
}

// ---------- Buy Now (atomic reserve-or-queue) ----------

/**
 * The heart of the "10 stock / 100 concurrent buyers" guarantee.
 * better-sqlite3 is synchronous, and this whole function runs inside a single
 * SQLite transaction (BEGIN IMMEDIATE under the hood via db.transaction),
 * so even if Express fires 100 of these back-to-back on the same event loop,
 * each call fully reads-then-writes before the next one can start:
 * no interleaving, no lost updates, no overselling, no negative stock.
 */
export const buyNow = db.transaction(
  (
    productId: number,
    customerName: string,
    qty: number,
    customerCity?: string,
    idempotencyKey?: string
  ): { type: "reserved" | "queued"; reservation?: Reservation; queueEntry?: QueueEntry; duplicate?: boolean } => {
    // Duplicate-request protection: same idempotency key returns the original outcome
    // instead of creating a second reservation or queue entry (double-click, retry-on-timeout, etc).
    if (idempotencyKey) {
      const existingRes = db.prepare(`SELECT * FROM reservations WHERE idempotency_key = ?`).get(idempotencyKey) as
        | Reservation
        | undefined;
      if (existingRes) return { type: "reserved", reservation: existingRes, duplicate: true };
      const existingQueue = db.prepare(`SELECT * FROM queue_entries WHERE idempotency_key = ?`).get(idempotencyKey) as
        | QueueEntry
        | undefined;
      if (existingQueue) return { type: "queued", queueEntry: existingQueue, duplicate: true };
    }

    const product = getProduct(productId);
    if (!product) throw new ApiError(404, "Product not found");
    if (qty < 1) throw new ApiError(400, "Quantity must be at least 1");

    const customerId = findOrCreateCustomer(customerName, customerCity);

    const avail = product.stock - reservedQty(productId);
    const { reservation_seconds } = getConfig(productId);

    if (avail >= qty) {
      const expiresAt = new Date(Date.now() + reservation_seconds * 1000).toISOString();
      const info = db
        .prepare(
          `INSERT INTO reservations (product_id, customer_name, customer_id, customer_city, qty, status, expires_at, idempotency_key)
           VALUES (?, ?, ?, ?, ?, 'RESERVED', ?, ?)`
        )
        .run(productId, customerName, customerId, customerCity || null, qty, expiresAt, idempotencyKey || null);
      const reservation = db.prepare(`SELECT * FROM reservations WHERE id = ?`).get(info.lastInsertRowid) as Reservation;
      audit("RESERVATION_CREATED", "reservation", reservation.id, productId, { customerName, qty, expiresAt });
      return { type: "reserved", reservation };
    } else {
      const info = db
        .prepare(
          `INSERT INTO queue_entries (product_id, customer_name, qty, status, idempotency_key) VALUES (?, ?, ?, 'WAITING', ?)`
        )
        .run(productId, customerName, qty, idempotencyKey || null);
      const queueEntry = db.prepare(`SELECT * FROM queue_entries WHERE id = ?`).get(info.lastInsertRowid) as QueueEntry;
      audit("QUEUE_JOINED", "queue_entry", queueEntry.id, productId, { customerName, qty });
      return { type: "queued", queueEntry };
    }
  }
);

// ---------- Queue promotion ----------

export const promoteQueue = db.transaction((productId: number): void => {
  let avail = availableStock(productId);
  const { reservation_seconds } = getConfig(productId);

  while (avail > 0) {
    const next = db
      .prepare(
        `SELECT * FROM queue_entries WHERE product_id = ? AND status = 'WAITING'
         ORDER BY priority DESC, requested_at ASC LIMIT 1`
      )
      .get(productId) as QueueEntry | undefined;
    if (!next) break;
    if (next.qty > avail) break; // not enough stock yet for this queued qty

    const expiresAt = new Date(Date.now() + reservation_seconds * 1000).toISOString();
    const info = db
      .prepare(
        `INSERT INTO reservations (product_id, customer_name, qty, status, expires_at, queue_entry_id)
         VALUES (?, ?, ?, 'RESERVED', ?, ?)`
      )
      .run(productId, next.customer_name, next.qty, expiresAt, next.id);

    db.prepare(`UPDATE queue_entries SET status = 'RESERVED', reservation_id = ? WHERE id = ?`).run(
      info.lastInsertRowid,
      next.id
    );

    audit("QUEUE_PROMOTED", "reservation", Number(info.lastInsertRowid), productId, {
      customerName: next.customer_name,
      queueEntryId: next.id,
    });

    avail -= next.qty;
  }
});

// ---------- Release (expire / cancel / payment failed) ----------

export const releaseReservation = db.transaction((reservationId: number, reason: "EXPIRED" | "CANCELLED" | "PAYMENT_FAILED"): void => {
  const reservation = db.prepare(`SELECT * FROM reservations WHERE id = ?`).get(reservationId) as Reservation | undefined;
  if (!reservation) return;
  if (!["RESERVED", "PAYMENT_PENDING"].includes(reservation.status)) return; // already settled

  db.prepare(`UPDATE reservations SET status = ? WHERE id = ?`).run(reason, reservationId);
  audit(reason, "reservation", reservationId, reservation.product_id, { customerName: reservation.customer_name });

  if (reservation.queue_entry_id) {
    db.prepare(`UPDATE queue_entries SET status = ? WHERE id = ?`).run(reason, reservation.queue_entry_id);
  }

  promoteQueue(reservation.product_id);
});

// ---------- Payment ----------

export const confirmPayment = db.transaction((reservationId: number, outcome: "success" | "fail"): Reservation => {
  const reservation = db.prepare(`SELECT * FROM reservations WHERE id = ?`).get(reservationId) as Reservation | undefined;
  if (!reservation) throw new ApiError(404, "Reservation not found");
  if (!["RESERVED", "PAYMENT_PENDING"].includes(reservation.status)) {
    throw new ApiError(409, `Reservation is already ${reservation.status} — payment cannot be applied twice, and this window has closed (idempotency guard).`);
  }

  if (outcome === "fail") {
    db.prepare(`UPDATE reservations SET status = 'PAYMENT_FAILED' WHERE id = ?`).run(reservationId);
    audit("PAYMENT_FAILED", "reservation", reservationId, reservation.product_id, { customerName: reservation.customer_name });
    if (reservation.queue_entry_id) {
      db.prepare(`UPDATE queue_entries SET status = 'PAYMENT_FAILED' WHERE id = ?`).run(reservation.queue_entry_id);
    }
    promoteQueue(reservation.product_id);
    return db.prepare(`SELECT * FROM reservations WHERE id = ?`).get(reservationId) as Reservation;
  }

  // success: permanently deduct stock, allocate real warehouse+batch by customer location, create order
  const product = getProduct(reservation.product_id)!;
  if (product.stock < reservation.qty) {
    // Should be structurally impossible given the reservation math, but guard anyway.
    throw new ApiError(409, "Inventory inconsistency detected: insufficient stock to fulfil a confirmed reservation");
  }
  db.prepare(`UPDATE products SET stock = stock - ? WHERE id = ?`).run(reservation.qty, reservation.product_id);

  const allocation = chooseAllocation(reservation.product_id, reservation.customer_city || undefined, reservation.qty);
  if (allocation) commitAllocation(allocation.warehouseId, reservation.product_id, allocation.batch, reservation.qty);

  const orderInfo = db
    .prepare(
      `INSERT INTO flash_orders (reservation_id, product_id, customer_name, qty, warehouse, batch, distance_km, allocation_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      reservationId,
      reservation.product_id,
      reservation.customer_name,
      reservation.qty,
      allocation?.warehouseName || null,
      allocation?.batch || null,
      allocation?.distanceKm ?? null,
      allocation?.reason || "No warehouse batch data available for this SKU."
    );

  db.prepare(`UPDATE reservations SET status = 'FULFILLED', order_id = ? WHERE id = ?`).run(orderInfo.lastInsertRowid, reservationId);
  if (reservation.queue_entry_id) {
    db.prepare(`UPDATE queue_entries SET status = 'FULFILLED' WHERE id = ?`).run(reservation.queue_entry_id);
  }

  audit("PAYMENT_SUCCESS", "reservation", reservationId, reservation.product_id, { customerName: reservation.customer_name });
  audit("ORDER_ALLOCATED", "flash_order", Number(orderInfo.lastInsertRowid), reservation.product_id, {
    warehouse: allocation?.warehouseName,
    reason: allocation?.reason,
  });

  return db.prepare(`SELECT * FROM reservations WHERE id = ?`).get(reservationId) as Reservation;
});

// ---------- Expiry sweep (called on an interval by the server) ----------

export function sweepExpired(): number {
  const now = new Date().toISOString();
  const expired = db
    .prepare(`SELECT id, product_id FROM reservations WHERE status IN ('RESERVED','PAYMENT_PENDING') AND expires_at <= ?`)
    .all(now) as { id: number; product_id: number }[];
  for (const r of expired) {
    releaseReservation(r.id, "EXPIRED");
  }
  return expired.length;
}

// ---------- Demo reset / simulate ----------

export const resetDemo = db.transaction((productName: string, sku: string, stock: number, reservationSeconds: number): Product => {
  let product = db.prepare(`SELECT id, name, sku, stock FROM products WHERE sku = ?`).get(sku) as Product | undefined;
  if (!product) {
    const info = db
      .prepare(`INSERT INTO products (name, sku, category, unit_price, stock, min_stock) VALUES (?, ?, 'Flash Sale Demo', 999, ?, 0)`)
      .run(productName, sku, stock);
    product = db.prepare(`SELECT id, name, sku, stock FROM products WHERE id = ?`).get(info.lastInsertRowid) as Product;
  } else {
    db.prepare(`UPDATE products SET stock = ?, name = ? WHERE id = ?`).run(stock, productName, product.id);
  }
  // Children before parents: flash_orders and queue_entries both hold foreign keys
  // into reservations, so deleting reservations first trips the FK constraint
  // (foreign_keys = ON) and aborts the reset midway, leaving stale data behind.
  db.prepare(`DELETE FROM flash_orders WHERE product_id = ?`).run(product.id);
  db.prepare(`DELETE FROM queue_entries WHERE product_id = ?`).run(product.id);
  db.prepare(`DELETE FROM reservations WHERE product_id = ?`).run(product.id);
  db.prepare(`DELETE FROM audit_log WHERE product_id = ?`).run(product.id);
  db.prepare(`DELETE FROM inventory_batches WHERE product_id = ?`).run(product.id);
  setConfig(product.id, reservationSeconds);
  seedBatchesForProduct(product.id, stock);
  audit("DEMO_RESET", "product", product.id, product.id, { stock, reservationSeconds });
  return getProduct(product.id)!;
});

export function getState(productId: number) {
  const product = getProduct(productId);
  if (!product) throw new ApiError(404, "Product not found");

  const reserved = reservedQty(productId);
  const allocatedRow = db
    .prepare(`SELECT COALESCE(SUM(qty),0) as total FROM flash_orders WHERE product_id = ?`)
    .get(productId) as { total: number };

  const reservations = db
    .prepare(`SELECT * FROM reservations WHERE product_id = ? ORDER BY id DESC LIMIT 200`)
    .all(productId) as Reservation[];
  const reservationsWithIntent = reservations.map((r) => ({
    ...r,
    intent: r.customer_id ? computeIntent(r.customer_id).intent : "MEDIUM",
  }));
  const queue = db
    .prepare(`SELECT * FROM queue_entries WHERE product_id = ? ORDER BY id ASC LIMIT 200`)
    .all(productId) as QueueEntry[];
  const auditTrail = db
    .prepare(`SELECT * FROM audit_log WHERE product_id = ? ORDER BY id DESC LIMIT 100`)
    .all(productId);

  // Status counts and queue size must come from full-table aggregates, not the
  // truncated 200-row display lists above — a flash sale can easily have more
  // than 200 queued customers and slicing would silently under-report them.
  const countsFromTable = (table: "reservations" | "queue_entries", productId: number): Record<string, number> => {
    const rows = db
      .prepare(`SELECT status, COUNT(*) as c FROM ${table} WHERE product_id = ? GROUP BY status`)
      .all(productId) as { status: string; c: number }[];
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = r.c;
      return acc;
    }, {});
  };
  const reservationStatusCounts = countsFromTable("reservations", productId);
  const queueStatusCounts = countsFromTable("queue_entries", productId);

  return {
    product,
    stats: {
      totalStock: product.stock + allocatedRow.total, // original scale for display
      available: Math.max(0, product.stock - reserved),
      reserved,
      allocated: allocatedRow.total,
      queueSize: queueStatusCounts.WAITING || 0,
      reservationStatusCounts,
      queueStatusCounts,
    },
    reservations: reservationsWithIntent,
    queue,
    auditTrail,
    config: getConfig(productId),
    warehouseBreakdown: listWarehouseBreakdown(productId),
    recentOrders: db
      .prepare(`SELECT * FROM flash_orders WHERE product_id = ? ORDER BY id DESC LIMIT 20`)
      .all(productId),
  };
}
