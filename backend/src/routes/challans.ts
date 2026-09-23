import { Router } from "express";
import { z } from "zod";
import { db, nextChallanNumber } from "../db";
import { ApiError } from "../utils/errors";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  product_id: z.number().int().positive(),
  qty: z.number().int().positive(),
});

const createChallanSchema = z.object({
  customer_id: z.number().int().positive(),
  items: z.array(itemSchema).min(1, "At least one product line is required"),
  status: z.enum(["Draft", "Confirmed"]).optional(),
});

function getChallanFull(id: number | bigint) {
  const challan = db.prepare("SELECT * FROM challans WHERE id = ?").get(id) as any;
  if (!challan) return null;
  const items = db.prepare("SELECT * FROM challan_items WHERE challan_id = ?").all(id);
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(challan.customer_id);
  return { ...challan, customer, items };
}

// Confirms a challan: reduces stock atomically, never allowing negative stock.
function confirmChallan(challanId: number, userId: number) {
  const challan = db.prepare("SELECT * FROM challans WHERE id = ?").get(challanId) as any;
  if (!challan) throw new ApiError(404, "Challan not found");
  if (challan.status !== "Draft") {
    throw new ApiError(400, `Only Draft challans can be confirmed. Current status: ${challan.status}`);
  }

  const items = db.prepare("SELECT * FROM challan_items WHERE challan_id = ?").all(challanId) as any[];
  if (items.length === 0) throw new ApiError(400, "Cannot confirm a challan with no items");

  // Lock-step check: verify all products have sufficient stock BEFORE mutating anything.
  const shortages: string[] = [];
  for (const item of items) {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id) as any;
    if (!product) {
      shortages.push(`Product "${item.product_name_snapshot}" no longer exists`);
      continue;
    }
    if (product.stock < item.qty) {
      shortages.push(
        `"${product.name}" (SKU ${product.sku}): requested ${item.qty}, available ${product.stock}`
      );
    }
  }
  if (shortages.length > 0) {
    throw new ApiError(400, `Insufficient stock for one or more products: ${shortages.join("; ")}`);
  }

  const tx = db.transaction(() => {
    for (const item of items) {
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id) as any;
      const newStock = product.stock - item.qty;
      if (newStock < 0) {
        // Defensive re-check inside the transaction in case of concurrent writes.
        throw new ApiError(400, `Stock for "${product.name}" changed and is no longer sufficient`);
      }
      db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?").run(
        newStock,
        product.id
      );
      db.prepare(
        "INSERT INTO stock_movements (product_id, qty_change, movement_type, reason, created_by) VALUES (?, ?, 'OUT', ?, ?)"
      ).run(product.id, item.qty, `Sales challan ${challan.challan_number}`, userId);
    }
    db.prepare(
      "UPDATE challans SET status = 'Confirmed', confirmed_at = datetime('now') WHERE id = ?"
    ).run(challanId);
  });
  tx();
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || "";
    const customerId = (req.query.customer_id as string) || "";

    const clauses: string[] = [];
    const params: any[] = [];
    if (status) {
      clauses.push("c.status = ?");
      params.push(status);
    }
    if (customerId) {
      clauses.push("c.customer_id = ?");
      params.push(customerId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const total = (
      db.prepare(`SELECT COUNT(*) as cnt FROM challans c ${where}`).get(...params) as any
    ).cnt;
    const rows = db
      .prepare(
        `SELECT c.*, cu.name as customer_name FROM challans c
         JOIN customers cu ON cu.id = c.customer_id
         ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const full = getChallanFull(Number(req.params.id));
    if (!full) throw new ApiError(404, "Challan not found");
    res.json(full);
  })
);

router.post(
  "/",
  requireRole("Admin", "Sales"),
  asyncHandler(async (req, res) => {
    const data = createChallanSchema.parse(req.body);

    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(data.customer_id);
    if (!customer) throw new ApiError(404, "Customer not found");

    // Build product snapshots (name, SKU, price at time of challan creation).
    const enrichedItems = data.items.map((item) => {
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id) as any;
      if (!product) throw new ApiError(404, `Product with id ${item.product_id} not found`);
      return { ...item, product };
    });

    const totalQty = enrichedItems.reduce((sum, i) => sum + i.qty, 0);
    const challanNumber = nextChallanNumber();

    const tx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO challans (challan_number, customer_id, status, total_qty, created_by)
           VALUES (?, ?, 'Draft', ?, ?)`
        )
        .run(challanNumber, data.customer_id, totalQty, req.user!.id);

      const challanId = result.lastInsertRowid as number;

      const insertItem = db.prepare(
        `INSERT INTO challan_items (challan_id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, qty)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const item of enrichedItems) {
        insertItem.run(challanId, item.product_id, item.product.name, item.product.sku, item.product.unit_price, item.qty);
      }

      if (data.status === "Confirmed") {
        confirmChallan(challanId, req.user!.id);
      }

      return challanId;
    });

    const challanId = tx();
    res.status(201).json(getChallanFull(challanId));
  })
);

// Replace items on a Draft challan (Draft only).
router.put(
  "/:id",
  requireRole("Admin", "Sales"),
  asyncHandler(async (req, res) => {
    const challan = db.prepare("SELECT * FROM challans WHERE id = ?").get(req.params.id) as any;
    if (!challan) throw new ApiError(404, "Challan not found");
    if (challan.status !== "Draft") {
      throw new ApiError(400, "Only Draft challans can be edited");
    }
    const data = z.object({ items: z.array(itemSchema).min(1) }).parse(req.body);

    const enrichedItems = data.items.map((item) => {
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id) as any;
      if (!product) throw new ApiError(404, `Product with id ${item.product_id} not found`);
      return { ...item, product };
    });
    const totalQty = enrichedItems.reduce((sum, i) => sum + i.qty, 0);

    const tx = db.transaction(() => {
      db.prepare("DELETE FROM challan_items WHERE challan_id = ?").run(challan.id);
      const insertItem = db.prepare(
        `INSERT INTO challan_items (challan_id, product_id, product_name_snapshot, sku_snapshot, unit_price_snapshot, qty)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const item of enrichedItems) {
        insertItem.run(challan.id, item.product_id, item.product.name, item.product.sku, item.product.unit_price, item.qty);
      }
      db.prepare("UPDATE challans SET total_qty = ? WHERE id = ?").run(totalQty, challan.id);
    });
    tx();

    res.json(getChallanFull(challan.id));
  })
);

router.post(
  "/:id/confirm",
  requireRole("Admin", "Sales", "Warehouse"),
  asyncHandler(async (req, res) => {
    confirmChallan(Number(req.params.id), req.user!.id);
    res.json(getChallanFull(Number(req.params.id)));
  })
);

router.post(
  "/:id/cancel",
  requireRole("Admin", "Sales"),
  asyncHandler(async (req, res) => {
    const challan = db.prepare("SELECT * FROM challans WHERE id = ?").get(req.params.id) as any;
    if (!challan) throw new ApiError(404, "Challan not found");
    if (challan.status === "Cancelled") throw new ApiError(400, "Challan is already cancelled");

    const tx = db.transaction(() => {
      // If it was already confirmed, restock the products.
      if (challan.status === "Confirmed") {
        const items = db.prepare("SELECT * FROM challan_items WHERE challan_id = ?").all(challan.id) as any[];
        for (const item of items) {
          const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id) as any;
          if (product) {
            db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?").run(
              item.qty,
              product.id
            );
            db.prepare(
              "INSERT INTO stock_movements (product_id, qty_change, movement_type, reason, created_by) VALUES (?, ?, 'IN', ?, ?)"
            ).run(product.id, item.qty, `Cancelled challan ${challan.challan_number}`, req.user!.id);
          }
        }
      }
      db.prepare("UPDATE challans SET status = 'Cancelled' WHERE id = ?").run(challan.id);
    });
    tx();

    res.json(getChallanFull(challan.id));
  })
);

export default router;
