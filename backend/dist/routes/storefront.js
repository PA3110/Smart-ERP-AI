"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const flashSaleService_1 = require("../services/flashSaleService");
const router = (0, express_1.Router)();
function discountPct(mrp, price) {
    if (!mrp || mrp <= price)
        return null;
    return Math.round(((mrp - price) / mrp) * 100);
}
router.get("/products", (req, res, next) => {
    try {
        const rows = db_1.db
            .prepare(`SELECT id, name, sku, category, unit_price, mrp, emoji, rating, review_count, is_flash_deal, description, stock
         FROM products WHERE storefront_visible = 1 ORDER BY is_flash_deal DESC, id ASC`)
            .all();
        const withAvailability = rows.map((p) => ({
            ...p,
            available: (0, flashSaleService_1.availableStock)(p.id),
            discountPct: discountPct(p.mrp, p.unit_price),
        }));
        res.json(withAvailability);
    }
    catch (err) {
        next(err);
    }
});
router.get("/products/:id", (req, res, next) => {
    try {
        const product = db_1.db
            .prepare(`SELECT id, name, sku, category, unit_price, mrp, emoji, rating, review_count, is_flash_deal, description, stock
         FROM products WHERE id = ? AND storefront_visible = 1`)
            .get(req.params.id);
        if (!product)
            return res.status(404).json({ error: "Product not found" });
        const available = (0, flashSaleService_1.availableStock)(product.id);
        const queueSize = db_1.db.prepare(`SELECT COUNT(*) as c FROM queue_entries WHERE product_id = ? AND status = 'WAITING'`).get(product.id).c;
        res.json({
            ...product,
            available,
            discountPct: discountPct(product.mrp, product.unit_price),
            demand: { queueSize, highDemand: product.is_flash_deal === 1 && available <= 10 },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
