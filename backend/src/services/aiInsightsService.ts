import { db } from "../db";
import { ApiError } from "../utils/errors";
import { availableStock } from "./flashSaleService";

export interface AIInsight {
  id: number;
  product_id: number;
  generated_at: string;
  current_stock: number;
  available_stock: number;
  demand_hits: number;
  burn_rate_per_sec: number;
  depletion_seconds: number | null;
  stockout_risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  forecasted_demand: number;
  recommended_reorder_qty: number;
  justification: string; // JSON-encoded string[]
  status: "PENDING" | "APPROVED" | "MODIFIED" | "REJECTED";
  decided_qty: number | null;
  decided_by: string | null;
  decided_at: string | null;
}

function secondsSince(sqliteDatetime: string): number {
  // SQLite's datetime('now') returns "YYYY-MM-DD HH:MM:SS[.SSS]" (space-separated, UTC,
  // no timezone marker) — not ISO-8601. Naively appending "Z" to that string produces an
  // invalid Date (space where 'T' belongs), which silently yields NaN and, downstream,
  // an attempt to bind NaN into a NOT NULL REAL column — a real bug found while testing.
  const iso = sqliteDatetime.includes("T") ? sqliteDatetime : sqliteDatetime.replace(" ", "T") + "Z";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 1;
  return Math.max(1, ms / 1000);
}

/**
 * Every number here is derived from real rows in this product's own tables —
 * reservations, queue_entries, flash_orders, audit_log — not randomized.
 * That's the "explain WHY" requirement from the brief: each output traces
 * back to a specific count you can verify against /flash-sale/state/:id.
 */
export function generateInsight(productId: number, decidedByDefault?: string): AIInsight {
  const product = db.prepare(`SELECT id, name, sku, stock, min_stock FROM products WHERE id = ?`).get(productId) as
    | { id: number; name: string; sku: string; stock: number; min_stock: number }
    | undefined;
  if (!product) throw new ApiError(404, "Product not found");

  const available = availableStock(productId);

  const reset = db
    .prepare(`SELECT created_at FROM audit_log WHERE product_id = ? AND event_type = 'DEMO_RESET' ORDER BY id DESC LIMIT 1`)
    .get(productId) as { created_at: string } | undefined;
  const windowStart = reset?.created_at
    ?? (db.prepare(`SELECT MIN(requested_at) as t FROM reservations WHERE product_id = ?`).get(productId) as { t: string | null }).t
    ?? new Date().toISOString();
  const elapsedSeconds = secondsSince(windowStart);

  const reservedCount = (db.prepare(
    `SELECT COALESCE(SUM(qty),0) as q FROM reservations WHERE product_id = ? AND status IN ('RESERVED','PAYMENT_PENDING')`
  ).get(productId) as { q: number }).q;
  const queueWaiting = (db.prepare(
    `SELECT COALESCE(SUM(qty),0) as q FROM queue_entries WHERE product_id = ? AND status = 'WAITING'`
  ).get(productId) as { q: number }).q;
  const allocatedTotal = (db.prepare(
    `SELECT COALESCE(SUM(qty),0) as q FROM flash_orders WHERE product_id = ?`
  ).get(productId) as { q: number }).q;
  const totalDemandHits = (db.prepare(
    `SELECT COUNT(*) as c FROM reservations WHERE product_id = ?`
  ).get(productId) as { c: number }).c
  + (db.prepare(`SELECT COUNT(*) as c FROM queue_entries WHERE product_id = ?`).get(productId) as { c: number }).c;

  // Burn rate: units actually sold per second; fall back to reservation velocity
  // if nothing has sold yet (early in a flash sale, allocations lag reservations).
  const rawBurnRate = allocatedTotal > 0 ? allocatedTotal / elapsedSeconds : reservedCount / elapsedSeconds;
  const burnRate = Number.isFinite(rawBurnRate) ? rawBurnRate : 0; // defense-in-depth against any future NaN source
  const depletionSeconds = burnRate > 0 && available > 0 ? available / burnRate : available === 0 ? 0 : null;

  let stockoutRisk: AIInsight["stockout_risk"];
  if (available === 0 && (queueWaiting > 0 || reservedCount > 0)) stockoutRisk = "CRITICAL";
  else if (available <= (product.min_stock || 0)) stockoutRisk = "HIGH";
  else if (available <= (product.min_stock || 0) * 2) stockoutRisk = "MEDIUM";
  else stockoutRisk = "LOW";

  // Forecasted demand for the *next* cycle: what we've already seen (unmet + fulfilled),
  // since that's the best available signal for how much this SKU is wanted right now.
  const forecastedDemand = queueWaiting + reservedCount + allocatedTotal;
  const safetyBuffer = Math.max(product.min_stock || 0, Math.ceil(forecastedDemand * 0.1));
  const recommendedReorderQty = Math.max(0, forecastedDemand - available) + safetyBuffer;

  const justification = [
    `${totalDemandHits} purchase attempts recorded against ${product.stock + allocatedTotal} original units.`,
    `${queueWaiting} customers currently unmet in the queue (WAITING).`,
    `${reservedCount} units held in active reservations, ${allocatedTotal} already sold/allocated.`,
    burnRate > 0
      ? `Observed burn rate ${burnRate.toFixed(2)} units/sec over the last ${Math.round(elapsedSeconds)}s.`
      : `No sales velocity yet — recommendation based on reservation/queue demand only.`,
    `Reorder = unmet demand (${forecastedDemand - available >= 0 ? forecastedDemand - available : 0}) + safety buffer (${safetyBuffer}, from min-stock/10% of demand).`,
  ];

  const info = db
    .prepare(
      `INSERT INTO ai_insights
        (product_id, current_stock, available_stock, demand_hits, burn_rate_per_sec, depletion_seconds,
         stockout_risk, forecasted_demand, recommended_reorder_qty, justification, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`
    )
    .run(
      productId,
      product.stock,
      available,
      totalDemandHits,
      burnRate,
      depletionSeconds,
      stockoutRisk,
      forecastedDemand,
      recommendedReorderQty,
      JSON.stringify(justification)
    );

  db.prepare(
    `INSERT INTO audit_log (event_type, entity_type, entity_id, product_id, details) VALUES ('AI_FORECAST_GENERATED','ai_insight', ?, ?, ?)`
  ).run(info.lastInsertRowid, productId, JSON.stringify({ stockoutRisk, recommendedReorderQty }));

  return db.prepare(`SELECT * FROM ai_insights WHERE id = ?`).get(info.lastInsertRowid) as AIInsight;
}

export function getLatestInsight(productId: number): AIInsight | undefined {
  return db
    .prepare(`SELECT * FROM ai_insights WHERE product_id = ? ORDER BY id DESC LIMIT 1`)
    .get(productId) as AIInsight | undefined;
}

export function listInsights(productId: number, limit = 20): AIInsight[] {
  return db
    .prepare(`SELECT * FROM ai_insights WHERE product_id = ? ORDER BY id DESC LIMIT ?`)
    .all(productId, limit) as AIInsight[];
}

/**
 * Human-governance gate: the AI only recommends. Only this call (a person
 * clicking Approve/Modify/Reject) ever changes real stock.
 */
export const applyDecision = db.transaction(
  (insightId: number, decision: "APPROVED" | "MODIFIED" | "REJECTED", qty: number | undefined, decidedBy: string): AIInsight => {
    const insight = db.prepare(`SELECT * FROM ai_insights WHERE id = ?`).get(insightId) as AIInsight | undefined;
    if (!insight) throw new ApiError(404, "Insight not found");
    if (insight.status !== "PENDING") throw new ApiError(409, `This recommendation was already ${insight.status}`);

    const finalQty = decision === "REJECTED" ? 0 : (qty ?? insight.recommended_reorder_qty);

    db.prepare(
      `UPDATE ai_insights SET status = ?, decided_qty = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`
    ).run(decision, finalQty, decidedBy, insightId);

    if (decision !== "REJECTED" && finalQty > 0) {
      db.prepare(`UPDATE products SET stock = stock + ? WHERE id = ?`).run(finalQty, insight.product_id);
      db.prepare(
        `INSERT INTO stock_movements (product_id, qty_change, movement_type, reason, created_by)
         SELECT ?, ?, 'IN', ?, id FROM users WHERE email = ? LIMIT 1`
      ).run(insight.product_id, finalQty, `AI replenishment (${decision.toLowerCase()}) — insight #${insightId}`, decidedBy);
    }

    db.prepare(
      `INSERT INTO audit_log (event_type, entity_type, entity_id, product_id, details) VALUES (?, 'ai_insight', ?, ?, ?)`
    ).run(`AI_RECOMMENDATION_${decision}`, insightId, insight.product_id, JSON.stringify({ qty: finalQty, decidedBy }));

    return db.prepare(`SELECT * FROM ai_insights WHERE id = ?`).get(insightId) as AIInsight;
  }
);
