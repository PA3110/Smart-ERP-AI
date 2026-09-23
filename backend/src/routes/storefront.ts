import { Router } from "express";
import { db } from "../db";
import { availableStock } from "../services/flashSaleService";

const router = Router();

interface StorefrontProduct {
  id: number;
  name: string;
  sku: string;
  category: string;
  unit_price: number;
  mrp: number | null;
  emoji: string | null;
  rating: number | null;
  review_count: number;
  is_flash_deal: number;
  description: string | null;
  stock: number;
}

function discountPct(mrp: number | null, price: number): number | null {
  if (!mrp || mrp <= price) return null;
  return Math.round(((mrp - price) / mrp) * 100);
}

router.get("/products", (req, res, next) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, sku, category, unit_price, mrp, emoji, rating, review_count, is_flash_deal, description, stock
         FROM products WHERE storefront_visible = 1 ORDER BY is_flash_deal DESC, id ASC`
      )
      .all() as StorefrontProduct[];

    const withAvailability = rows.map((p) => ({
      ...p,
      available: availableStock(p.id),
      discountPct: discountPct(p.mrp, p.unit_price),
    }));

    res.json(withAvailability);
  } catch (err) {
    next(err);
  }
});

router.get("/products/:id", (req, res, next) => {
  try {
    const product = db
      .prepare(
        `SELECT id, name, sku, category, unit_price, mrp, emoji, rating, review_count, is_flash_deal, description, stock
         FROM products WHERE id = ? AND storefront_visible = 1`
      )
      .get(req.params.id) as StorefrontProduct | undefined;
    if (!product) return res.status(404).json({ error: "Product not found" });

    const available = availableStock(product.id);
    const queueSize = (db.prepare(
      `SELECT COUNT(*) as c FROM queue_entries WHERE product_id = ? AND status = 'WAITING'`
    ).get(product.id) as { c: number }).c;

    res.json({
      ...product,
      available,
      discountPct: discountPct(product.mrp, product.unit_price),
      demand: { queueSize, highDemand: product.is_flash_deal === 1 && available <= 10 },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
