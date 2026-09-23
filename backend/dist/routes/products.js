"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../db");
const errors_1 = require("../utils/errors");
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
const productSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Product name is required"),
    sku: zod_1.z.string().min(1, "SKU is required"),
    category: zod_1.z.string().optional(),
    unit_price: zod_1.z.number().nonnegative(),
    stock: zod_1.z.number().int().nonnegative().optional(),
    min_stock: zod_1.z.number().int().nonnegative().optional(),
    location: zod_1.z.string().optional(),
});
router.get("/", (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const offset = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const lowStock = req.query.lowStock === "true";
    const clauses = [];
    const params = [];
    if (search) {
        clauses.push("(name LIKE ? OR sku LIKE ? OR category LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (lowStock)
        clauses.push("stock <= min_stock");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = db_1.db.prepare(`SELECT COUNT(*) as c FROM products ${where}`).get(...params).c;
    const rows = db_1.db
        .prepare(`SELECT * FROM products ${where} ORDER BY name ASC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset);
    res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
}));
router.get("/:id", (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const product = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!product)
        throw new errors_1.ApiError(404, "Product not found");
    res.json(product);
}));
router.get("/:id/movements", (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const rows = db_1.db
        .prepare("SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC")
        .all(req.params.id);
    res.json(rows);
}));
router.post("/", (0, auth_1.requireRole)("Admin", "Warehouse"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const data = productSchema.parse(req.body);
    const existingSku = db_1.db.prepare("SELECT id FROM products WHERE sku = ?").get(data.sku);
    if (existingSku)
        throw new errors_1.ApiError(409, "A product with this SKU already exists");
    const result = db_1.db
        .prepare(`INSERT INTO products (name, sku, category, unit_price, stock, min_stock, location)
         VALUES (@name, @sku, @category, @unit_price, @stock, @min_stock, @location)`)
        .run({
        name: data.name,
        sku: data.sku,
        category: data.category || null,
        unit_price: data.unit_price,
        stock: data.stock ?? 0,
        min_stock: data.min_stock ?? 0,
        location: data.location || null,
    });
    if ((data.stock ?? 0) > 0) {
        db_1.db.prepare("INSERT INTO stock_movements (product_id, qty_change, movement_type, reason, created_by) VALUES (?, ?, 'IN', 'Initial stock', ?)").run(result.lastInsertRowid, data.stock, req.user.id);
    }
    const product = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(product);
}));
router.put("/:id", (0, auth_1.requireRole)("Admin", "Warehouse"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const existing = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!existing)
        throw new errors_1.ApiError(404, "Product not found");
    const data = productSchema.partial().omit({ stock: true }).parse(req.body);
    const merged = { ...existing, ...data };
    db_1.db.prepare(`UPDATE products SET name=@name, sku=@sku, category=@category, unit_price=@unit_price,
       min_stock=@min_stock, location=@location, updated_at=datetime('now') WHERE id=@id`).run({ ...merged, id: req.params.id });
    const updated = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    res.json(updated);
}));
// Manual stock adjustment (IN or OUT), separate from sales challans
const adjustSchema = zod_1.z.object({
    qty: zod_1.z.number().int().positive(),
    movement_type: zod_1.z.enum(["IN", "OUT"]),
    reason: zod_1.z.string().min(1, "Reason is required"),
});
router.post("/:id/stock", (0, auth_1.requireRole)("Admin", "Warehouse"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { qty, movement_type, reason } = adjustSchema.parse(req.body);
    const product = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!product)
        throw new errors_1.ApiError(404, "Product not found");
    const delta = movement_type === "IN" ? qty : -qty;
    const newStock = product.stock + delta;
    if (newStock < 0) {
        throw new errors_1.ApiError(400, `Insufficient stock. Current stock is ${product.stock}, cannot reduce by ${qty}`);
    }
    const tx = db_1.db.transaction(() => {
        db_1.db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?").run(newStock, product.id);
        db_1.db.prepare("INSERT INTO stock_movements (product_id, qty_change, movement_type, reason, created_by) VALUES (?, ?, ?, ?, ?)").run(product.id, qty, movement_type, reason, req.user.id);
    });
    tx();
    const updated = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    res.json(updated);
}));
exports.default = router;
