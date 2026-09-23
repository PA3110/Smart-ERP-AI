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
const itemSchema = zod_1.z.object({
    product_id: zod_1.z.number().int().positive(),
    qty: zod_1.z.number().int().positive(),
});
const createChallanSchema = zod_1.z.object({
    customer_id: zod_1.z.number().int().positive(),
    items: zod_1.z.array(itemSchema).min(1, "At least one product line is required"),
    status: zod_1.z.enum(["Draft", "Confirmed"]).optional(),
});
function getChallanFull(id) {
    const challan = db_1.db.prepare("SELECT * FROM challans WHERE id = ?").get(id);
    if (!challan)
        return null;
    const items = db_1.db.prepare("SELECT * FROM challan_items WHERE challan_id = ?").all(id);
    const customer = db_1.db.prepare("SELECT * FROM customers WHERE id = ?").get(challan.customer_id);
    return { ...challan, customer, items };
}
// Confirms a challan: reduces stock atomically, never allowing negative stock.
function confirmChallan(challanId, userId) {
    const challan = db_1.db.prepare("SELECT * FROM challans WHERE id = ?").get(challanId);
    if (!challan)
        throw new errors_1.ApiError(404, "Challan not found");
    if (challan.status !== "Draft") {
        throw new errors_1.ApiError(400, `Only Draft challans can be confirmed. Current status: ${challan.status}`);
    }
    const items = db_1.db.prepare("SELECT * FROM challan_items WHERE challan_id = ?").all(challanId);
    if (items.length === 0)
        throw new errors_1.ApiError(400, "Cannot confirm a challan with no items");
    // Lock-step check: verify all products have sufficient stock BEFORE mutating anything.
    const shortages = [];
    for (const item of items) {
        const product = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id);
        if (!product) {
            shortages.push(`Product "${item.product_name_snapshot}" no longer exists`);
            continue;
        }
        if (product.stock < item.qty) {
            shortages.push(`"${product.name}" (SKU ${product.sku}): requested ${item.qty}, available ${product.stock}`);
        }
    }
    if (shortages.length > 0) {
        throw new errors_1.ApiError(400, `Insufficient stock for one or more products: ${shortages.join("; ")}`);
    }
    const tx = db_1.db.transaction(() => {
        for (const item of items) {
            const product = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id);
            const newStock = product.stock - item.qty;
            if (newStock < 0) {
                // Defensive re-check inside the transaction in case of concurrent writes.
                throw new errors_1.ApiError(400, `Stock for "${product.name}" changed and is no longer sufficient`);
            }
            db_1.db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?").run(newStock, product.id);
            db_1.db.prepare("INSERT INTO stock_movements (product_id, qty_change, movement_type, reason, created_by) VALUES (?, ?, 'OUT', ?, ?)").run(product.id, item.qty, `Sales challan ${challan.challan_number}`, userId);
        }
        db_1.db.prepare("UPDATE challans SET status = 'Confirmed', confirmed_at = datetime('now') WHERE id = ?").run(challanId);
    });
    tx();
}
router.get("/", (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const offset = (page - 1) * limit;
    const status = req.query.status || "";
    const customerId = req.query.customer_id || "";
    const clauses = [];
    const params = [];
    if (status) {
        clauses.push("c.status = ?");
        params.push(status);
    }
    if (customerId) {
        clauses.push("c.customer_id = ?");
        params.push(customerId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = db_1.db.prepare(`SELECT COUNT(*) as cnt FROM challans c ${where}`).get(...params).cnt;
    const rows = db_1.db
        .prepare(`SELECT c.*, cu.name as customer_name FROM challans c
         JOIN customers cu ON cu.id = c.customer_id
         ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset);
    res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
}));
router.get("/:id", (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const full = getChallanFull(Number(req.params.id));
    if (!full)
        throw new errors_1.ApiError(404, "Challan not found");
    res.json(full);
}));
router.post("/", (0, auth_1.requireRole)("Admin", "Sales"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const data = createChallanSchema.parse(req.body);
    const customer = db_1.db.prepare("SELECT * FROM customers WHERE id = ?").get(data.customer_id);
    if (!customer)
        throw new errors_1.ApiError(404, "Customer not found");
    // Build product snapshots (name, SKU, price at time of challan creation).
    const enrichedItems = data.items.map((item) => {
        const product = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id);
        if (!product)
            throw new errors_1.ApiError(404, `Product with id ${item.product_id} not found`);
        return { ...item, product };
    });
    const totalQty = enrichedItems.reduce((sum, i) => sum + i.qty, 0);
    const challanNumber = (0, db_1.nextChallanNumber)();
    const tx = db_1.db.transaction(() => {
        const result = db_1.db
            .prepare(`INSERT INTO challans (challan_number, customer_id, status, total_qty, created_by)
           VALUES (?, ?, 'Draft', ?, ?)`)
            .run(challanNumber, data.customer_id, totalQty, req.user.id);
        const challanId = result.lastInsertRowid;
        const insertItem = db_1.db.prepare(`INSERT INTO challan_items (challan_id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, qty)
         VALUES (?, ?, ?, ?, ?, ?)`);
        for (const item of enrichedItems) {
            insertItem.run(challanId, item.product_id, item.product.name, item.product.sku, item.product.unit_price, item.qty);
        }
        if (data.status === "Confirmed") {
            confirmChallan(challanId, req.user.id);
        }
        return challanId;
    });
    const challanId = tx();
    res.status(201).json(getChallanFull(challanId));
}));
// Replace items on a Draft challan (Draft only).
router.put("/:id", (0, auth_1.requireRole)("Admin", "Sales"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const challan = db_1.db.prepare("SELECT * FROM challans WHERE id = ?").get(req.params.id);
    if (!challan)
        throw new errors_1.ApiError(404, "Challan not found");
    if (challan.status !== "Draft") {
        throw new errors_1.ApiError(400, "Only Draft challans can be edited");
    }
    const data = zod_1.z.object({ items: zod_1.z.array(itemSchema).min(1) }).parse(req.body);
    const enrichedItems = data.items.map((item) => {
        const product = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id);
        if (!product)
            throw new errors_1.ApiError(404, `Product with id ${item.product_id} not found`);
        return { ...item, product };
    });
    const totalQty = enrichedItems.reduce((sum, i) => sum + i.qty, 0);
    const tx = db_1.db.transaction(() => {
        db_1.db.prepare("DELETE FROM challan_items WHERE challan_id = ?").run(challan.id);
        const insertItem = db_1.db.prepare(`INSERT INTO challan_items (challan_id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, qty)
         VALUES (?, ?, ?, ?, ?, ?)`);
        for (const item of enrichedItems) {
            insertItem.run(challan.id, item.product_id, item.product.name, item.product.sku, item.product.unit_price, item.qty);
        }
        db_1.db.prepare("UPDATE challans SET total_qty = ? WHERE id = ?").run(totalQty, challan.id);
    });
    tx();
    res.json(getChallanFull(challan.id));
}));
router.post("/:id/confirm", (0, auth_1.requireRole)("Admin", "Sales", "Warehouse"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    confirmChallan(Number(req.params.id), req.user.id);
    res.json(getChallanFull(Number(req.params.id)));
}));
router.post("/:id/cancel", (0, auth_1.requireRole)("Admin", "Sales"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const challan = db_1.db.prepare("SELECT * FROM challans WHERE id = ?").get(req.params.id);
    if (!challan)
        throw new errors_1.ApiError(404, "Challan not found");
    if (challan.status === "Cancelled")
        throw new errors_1.ApiError(400, "Challan is already cancelled");
    const tx = db_1.db.transaction(() => {
        // If it was already confirmed, restock the products.
        if (challan.status === "Confirmed") {
            const items = db_1.db.prepare("SELECT * FROM challan_items WHERE challan_id = ?").all(challan.id);
            for (const item of items) {
                const product = db_1.db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id);
                if (product) {
                    db_1.db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?").run(item.qty, product.id);
                    db_1.db.prepare("INSERT INTO stock_movements (product_id, qty_change, movement_type, reason, created_by) VALUES (?, ?, 'IN', ?, ?)").run(product.id, item.qty, `Cancelled challan ${challan.challan_number}`, req.user.id);
                }
            }
        }
        db_1.db.prepare("UPDATE challans SET status = 'Cancelled' WHERE id = ?").run(challan.id);
    });
    tx();
    res.json(getChallanFull(challan.id));
}));
exports.default = router;
