import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  buyNow,
  confirmPayment,
  releaseReservation,
  resetDemo,
  getState,
  setConfig,
} from "../services/flashSaleService";
import { cityForIndex } from "../services/customerIntentService";
import { db } from "../db";

const router = Router();

// Big-sale-day protection: caps abusive/bot-style hammering of the hottest endpoint
// without blocking genuine concurrent shoppers (limit is per-IP, generous for real traffic).
const buyNowLimiter = rateLimit({
  windowMs: 10_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many purchase attempts from this connection. Please slow down and try again." },
});

// Reset/seed the demo product and start a fresh scenario
router.post("/simulate", (req, res, next) => {
  try {
    const {
      productName = "iPhone 17 Pro",
      sku = "FLASH-DEMO-1",
      stock = 10,
      customers = 100,
      reservationSeconds = 30,
    } = req.body || {};

    const product = resetDemo(productName, sku, Number(stock), Number(reservationSeconds));

    const results = { reserved: 0, queued: 0 };
    for (let i = 1; i <= Number(customers); i++) {
      // Round-robin real cities so warehouse allocation has real geography to work with.
      const city = cityForIndex(i);
      const outcome = buyNow(product.id, `Customer ${i}`, 1, city);
      if (outcome.type === "reserved") results.reserved++;
      else results.queued++;
    }

    res.json({ product, results, state: getState(product.id) });
  } catch (err) {
    next(err);
  }
});

// Explicit reset without launching a new wave of buyers (mirrors a real "reset demo" admin action)
router.post("/:productId/reset", (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    const product = db.prepare(`SELECT name, sku, stock FROM products WHERE id = ?`).get(productId) as
      | { name: string; sku: string; stock: number }
      | undefined;
    if (!product) return res.status(404).json({ error: "Product not found" });
    const { stock = product.stock, reservationSeconds = 30 } = req.body || {};
    const updated = resetDemo(product.name, product.sku, Number(stock), Number(reservationSeconds));
    res.json({ product: updated, state: getState(updated.id) });
  } catch (err) {
    next(err);
  }
});

router.get("/state/:productId", (req, res, next) => {
  try {
    res.json(getState(Number(req.params.productId)));
  } catch (err) {
    next(err);
  }
});

// Narrow, customer-facing view of a single reservation — used by the storefront's
// "My Order" status page so a shopper only sees their own order, not the whole
// admin state (queue of everyone else, full audit trail, etc).
router.get("/reservation/:id", (req, res, next) => {
  try {
    const reservation = db
      .prepare(
        `SELECT r.*, p.name as product_name, p.sku, p.unit_price, p.emoji
         FROM reservations r JOIN products p ON p.id = r.product_id WHERE r.id = ?`
      )
      .get(req.params.id);
    if (!reservation) return res.status(404).json({ error: "Reservation not found" });
    const order = db.prepare(`SELECT * FROM flash_orders WHERE reservation_id = ?`).get(req.params.id);
    res.json({ ...reservation, order: order || null });
  } catch (err) {
    next(err);
  }
});

// Single queue-entry status (for a shopper waiting in line, before they have a reservation yet)
router.get("/queue-entry/:id", (req, res, next) => {
  try {
    const entry = db
      .prepare(
        `SELECT qe.*, p.name as product_name, p.sku
         FROM queue_entries qe JOIN products p ON p.id = qe.product_id WHERE qe.id = ?`
      )
      .get(req.params.id) as { product_id: number; status: string } | undefined;
    if (!entry) return res.status(404).json({ error: "Queue entry not found" });
    const position = (db.prepare(
      `SELECT COUNT(*) as c FROM queue_entries WHERE product_id = ? AND status = 'WAITING' AND id <= ?`
    ).get(entry.product_id, req.params.id) as { c: number }).c;
    res.json({ ...entry, position });
  } catch (err) {
    next(err);
  }
});

// Cross-product summary for the admin dashboard landing page
router.get("/dashboard/summary", (req, res, next) => {
  try {
    const products = db.prepare(`SELECT id, name, sku, stock, is_flash_deal FROM products WHERE storefront_visible = 1`).all() as
      { id: number; name: string; sku: string; stock: number; is_flash_deal: number }[];
    const perProduct = products.map((p) => {
      const reserved = (db.prepare(
        `SELECT COALESCE(SUM(qty),0) as q FROM reservations WHERE product_id = ? AND status IN ('RESERVED','PAYMENT_PENDING')`
      ).get(p.id) as { q: number }).q;
      const queueSize = (db.prepare(
        `SELECT COUNT(*) as c FROM queue_entries WHERE product_id = ? AND status = 'WAITING'`
      ).get(p.id) as { c: number }).c;
      const sold = (db.prepare(`SELECT COALESCE(SUM(qty),0) as q FROM flash_orders WHERE product_id = ?`).get(p.id) as { q: number }).q;
      const revenue = (db.prepare(
        `SELECT COALESCE(SUM(fo.qty * pr.unit_price),0) as r FROM flash_orders fo JOIN products pr ON pr.id = fo.product_id WHERE fo.product_id = ?`
      ).get(p.id) as { r: number }).r;
      return { ...p, available: Math.max(0, p.stock - reserved), reserved, queueSize, sold, revenue };
    });
    const totals = perProduct.reduce(
      (acc, p) => {
        acc.reserved += p.reserved;
        acc.queueSize += p.queueSize;
        acc.sold += p.sold;
        acc.revenue += p.revenue;
        return acc;
      },
      { reserved: 0, queueSize: 0, sold: 0, revenue: 0 }
    );
    const customerCount = (db.prepare(`SELECT COUNT(*) as c FROM customers`).get() as { c: number }).c;
    res.json({ products: perProduct, totals, customerCount });
  } catch (err) {
    next(err);
  }
});
router.get("/orders/all", (req, res, next) => {
  try {
    const rows = db
      .prepare(
        `SELECT fo.*, p.name as product_name, p.sku
         FROM flash_orders fo JOIN products p ON p.id = fo.product_id
         ORDER BY fo.id DESC LIMIT 200`
      )
      .all();
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/buy-now", buyNowLimiter, (req, res, next) => {
  try {
    const { productId, customerName, qty = 1, customerCity, idempotencyKey } = req.body || {};
    if (!productId || !customerName) return res.status(400).json({ error: "productId and customerName are required" });
    const outcome = buyNow(Number(productId), String(customerName), Number(qty), customerCity, idempotencyKey);
    res.status(201).json(outcome);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/pay", (req, res, next) => {
  try {
    const { outcome } = req.body || {};
    if (outcome !== "success" && outcome !== "fail") {
      return res.status(400).json({ error: "outcome must be 'success' or 'fail'" });
    }
    const reservation = confirmPayment(Number(req.params.id), outcome);
    res.json(reservation);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/cancel", (req, res, next) => {
  try {
    releaseReservation(Number(req.params.id), "CANCELLED");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put("/config/:productId", (req, res, next) => {
  try {
    const { reservationSeconds, maxRetries = 2 } = req.body || {};
    setConfig(Number(req.params.productId), Number(reservationSeconds), Number(maxRetries));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
