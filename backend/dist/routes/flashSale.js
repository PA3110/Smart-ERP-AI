"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const flashSaleService_1 = require("../services/flashSaleService");
const customerIntentService_1 = require("../services/customerIntentService");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// Big-sale-day protection: caps abusive/bot-style hammering of the hottest endpoint
// without blocking genuine concurrent shoppers (limit is per-IP, generous for real traffic).
const buyNowLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many purchase attempts from this connection. Please slow down and try again." },
});
// Reset/seed the demo product and start a fresh scenario
router.post("/simulate", (req, res, next) => {
    try {
        const { productName = "iPhone 17 Pro", sku = "FLASH-DEMO-1", stock = 10, customers = 100, reservationSeconds = 30, } = req.body || {};
        const product = (0, flashSaleService_1.resetDemo)(productName, sku, Number(stock), Number(reservationSeconds));
        const results = { reserved: 0, queued: 0 };
        for (let i = 1; i <= Number(customers); i++) {
            // Round-robin real cities so warehouse allocation has real geography to work with.
            const city = (0, customerIntentService_1.cityForIndex)(i);
            const outcome = (0, flashSaleService_1.buyNow)(product.id, `Customer ${i}`, 1, city);
            if (outcome.type === "reserved")
                results.reserved++;
            else
                results.queued++;
        }
        res.json({ product, results, state: (0, flashSaleService_1.getState)(product.id) });
    }
    catch (err) {
        next(err);
    }
});
// Explicit reset without launching a new wave of buyers (mirrors a real "reset demo" admin action)
router.post("/:productId/reset", (req, res, next) => {
    try {
        const productId = Number(req.params.productId);
        const product = db_1.db.prepare(`SELECT name, sku, stock FROM products WHERE id = ?`).get(productId);
        if (!product)
            return res.status(404).json({ error: "Product not found" });
        const { stock = product.stock, reservationSeconds = 30 } = req.body || {};
        const updated = (0, flashSaleService_1.resetDemo)(product.name, product.sku, Number(stock), Number(reservationSeconds));
        res.json({ product: updated, state: (0, flashSaleService_1.getState)(updated.id) });
    }
    catch (err) {
        next(err);
    }
});
router.get("/state/:productId", (req, res, next) => {
    try {
        res.json((0, flashSaleService_1.getState)(Number(req.params.productId)));
    }
    catch (err) {
        next(err);
    }
});
// Narrow, customer-facing view of a single reservation — used by the storefront's
// "My Order" status page so a shopper only sees their own order, not the whole
// admin state (queue of everyone else, full audit trail, etc).
router.get("/reservation/:id", (req, res, next) => {
    try {
        const reservation = db_1.db
            .prepare(`SELECT r.*, p.name as product_name, p.sku, p.unit_price, p.emoji
         FROM reservations r JOIN products p ON p.id = r.product_id WHERE r.id = ?`)
            .get(req.params.id);
        if (!reservation)
            return res.status(404).json({ error: "Reservation not found" });
        const order = db_1.db.prepare(`SELECT * FROM flash_orders WHERE reservation_id = ?`).get(req.params.id);
        res.json({ ...reservation, order: order || null });
    }
    catch (err) {
        next(err);
    }
});
// Single queue-entry status (for a shopper waiting in line, before they have a reservation yet)
router.get("/queue-entry/:id", (req, res, next) => {
    try {
        const entry = db_1.db
            .prepare(`SELECT qe.*, p.name as product_name, p.sku
         FROM queue_entries qe JOIN products p ON p.id = qe.product_id WHERE qe.id = ?`)
            .get(req.params.id);
        if (!entry)
            return res.status(404).json({ error: "Queue entry not found" });
        const position = db_1.db.prepare(`SELECT COUNT(*) as c FROM queue_entries WHERE product_id = ? AND status = 'WAITING' AND id <= ?`).get(entry.product_id, req.params.id).c;
        res.json({ ...entry, position });
    }
    catch (err) {
        next(err);
    }
});
// Cross-product summary for the admin dashboard landing page
router.get("/dashboard/summary", (req, res, next) => {
    try {
        const products = db_1.db.prepare(`SELECT id, name, sku, stock, is_flash_deal FROM products WHERE storefront_visible = 1`).all();
        const perProduct = products.map((p) => {
            const reserved = db_1.db.prepare(`SELECT COALESCE(SUM(qty),0) as q FROM reservations WHERE product_id = ? AND status IN ('RESERVED','PAYMENT_PENDING')`).get(p.id).q;
            const queueSize = db_1.db.prepare(`SELECT COUNT(*) as c FROM queue_entries WHERE product_id = ? AND status = 'WAITING'`).get(p.id).c;
            const sold = db_1.db.prepare(`SELECT COALESCE(SUM(qty),0) as q FROM flash_orders WHERE product_id = ?`).get(p.id).q;
            const revenue = db_1.db.prepare(`SELECT COALESCE(SUM(fo.qty * pr.unit_price),0) as r FROM flash_orders fo JOIN products pr ON pr.id = fo.product_id WHERE fo.product_id = ?`).get(p.id).r;
            return { ...p, available: Math.max(0, p.stock - reserved), reserved, queueSize, sold, revenue };
        });
        const totals = perProduct.reduce((acc, p) => {
            acc.reserved += p.reserved;
            acc.queueSize += p.queueSize;
            acc.sold += p.sold;
            acc.revenue += p.revenue;
            return acc;
        }, { reserved: 0, queueSize: 0, sold: 0, revenue: 0 });
        const customerCount = db_1.db.prepare(`SELECT COUNT(*) as c FROM customers`).get().c;
        res.json({ products: perProduct, totals, customerCount });
    }
    catch (err) {
        next(err);
    }
});
router.get("/orders/all", (req, res, next) => {
    try {
        const rows = db_1.db
            .prepare(`SELECT fo.*, p.name as product_name, p.sku
         FROM flash_orders fo JOIN products p ON p.id = fo.product_id
         ORDER BY fo.id DESC LIMIT 200`)
            .all();
        res.json(rows);
    }
    catch (err) {
        next(err);
    }
});
router.post("/buy-now", buyNowLimiter, (req, res, next) => {
    try {
        const { productId, customerName, qty = 1, customerCity, idempotencyKey } = req.body || {};
        if (!productId || !customerName)
            return res.status(400).json({ error: "productId and customerName are required" });
        const outcome = (0, flashSaleService_1.buyNow)(Number(productId), String(customerName), Number(qty), customerCity, idempotencyKey);
        res.status(201).json(outcome);
    }
    catch (err) {
        next(err);
    }
});
router.post("/:id/pay", (req, res, next) => {
    try {
        const { outcome } = req.body || {};
        if (outcome !== "success" && outcome !== "fail") {
            return res.status(400).json({ error: "outcome must be 'success' or 'fail'" });
        }
        const reservation = (0, flashSaleService_1.confirmPayment)(Number(req.params.id), outcome);
        res.json(reservation);
    }
    catch (err) {
        next(err);
    }
});
router.post("/:id/cancel", (req, res, next) => {
    try {
        (0, flashSaleService_1.releaseReservation)(Number(req.params.id), "CANCELLED");
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.put("/config/:productId", (req, res, next) => {
    try {
        const { reservationSeconds, maxRetries = 2 } = req.body || {};
        (0, flashSaleService_1.setConfig)(Number(req.params.productId), Number(reservationSeconds), Number(maxRetries));
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
