import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { ApiError } from "../utils/errors";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  sku: z.string().min(1, "SKU is required"),
  category: z.string().optional(),
  unit_price: z.number().nonnegative(),
  stock: z.number().int().nonnegative().optional(),
  min_stock: z.number().int().nonnegative().optional(),
  location: z.string().optional(),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));
    const offset = (page - 1) * limit;
    const search = ((req.query.search as string) || "").trim();
    const lowStock = req.query.lowStock === "true";

    const clauses: string[] = [];
    const params: any[] = [];
    if (search) {
      clauses.push("(name LIKE ? OR sku LIKE ? OR category LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (lowStock) clauses.push("stock <= min_stock");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const total = (db.prepare(`SELECT COUNT(*) as c FROM products ${where}`).get(...params) as any).c;
    const rows = db
      .prepare(`SELECT * FROM products ${where} ORDER BY name ASC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);
    res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!product) throw new ApiError(404, "Product not found");
    res.json(product);
  })
);

router.get(
  "/:id/movements",
  asyncHandler(async (req, res) => {
    const rows = db
      .prepare("SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC")
      .all(req.params.id);
    res.json(rows);
  })
);

router.post(
  "/",
  requireRole("Admin", "Warehouse"),
  asyncHandler(async (req, res) => {
    const data = productSchema.parse(req.body);
    const existingSku = db.prepare("SELECT id FROM products WHERE sku = ?").get(data.sku);
    if (existingSku) throw new ApiError(409, "A product with this SKU already exists");

    const result = db
      .prepare(
        `INSERT INTO products (name, sku, category, unit_price, stock, min_stock, location)
         VALUES (@name, @sku, @category, @unit_price, @stock, @min_stock, @location)`
      )
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
      db.prepare(
        "INSERT INTO stock_movements (product_id, qty_change, movement_type, reason, created_by) VALUES (?, ?, 'IN', 'Initial stock', ?)"
      ).run(result.lastInsertRowid, data.stock, req.user!.id);
    }

    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(product);
  })
);

router.put(
  "/:id",
  requireRole("Admin", "Warehouse"),
  asyncHandler(async (req, res) => {
    const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    if (!existing) throw new ApiError(404, "Product not found");
    const data = productSchema.partial().omit({ stock: true }).parse(req.body);
    const merged = { ...(existing as any), ...data };
    db.prepare(
      `UPDATE products SET name=@name, sku=@sku, category=@category, unit_price=@unit_price,
       min_stock=@min_stock, location=@location, updated_at=datetime('now') WHERE id=@id`
    ).run({ ...merged, id: req.params.id });
    const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    res.json(updated);
  })
);

// Manual stock adjustment (IN or OUT), separate from sales challans
const adjustSchema = z.object({
  qty: z.number().int().positive(),
  movement_type: z.enum(["IN", "OUT"]),
  reason: z.string().min(1, "Reason is required"),
});

router.post(
  "/:id/stock",
  requireRole("Admin", "Warehouse"),
  asyncHandler(async (req, res) => {
    const { qty, movement_type, reason } = adjustSchema.parse(req.body);
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id) as any;
    if (!product) throw new ApiError(404, "Product not found");

    const delta = movement_type === "IN" ? qty : -qty;
    const newStock = product.stock + delta;
    if (newStock < 0) {
      throw new ApiError(400, `Insufficient stock. Current stock is ${product.stock}, cannot reduce by ${qty}`);
    }

    const tx = db.transaction(() => {
      db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?").run(
        newStock,
        product.id
      );
      db.prepare(
        "INSERT INTO stock_movements (product_id, qty_change, movement_type, reason, created_by) VALUES (?, ?, ?, ?, ?)"
      ).run(product.id, qty, movement_type, reason, req.user!.id);
    });
    tx();

    const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    res.json(updated);
  })
);

export default router;
