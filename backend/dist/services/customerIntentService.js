"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cityForIndex = cityForIndex;
exports.findOrCreateCustomer = findOrCreateCustomer;
exports.computeIntent = computeIntent;
const db_1 = require("../db");
const DEMO_CITIES = ["Bangalore", "Hyderabad", "Chennai", "Delhi", "Mumbai", "Kolkata"];
function cityForIndex(i) {
    return DEMO_CITIES[i % DEMO_CITIES.length];
}
/**
 * Every flash-sale "buyer" is a real row in the customers table, not a throwaway string —
 * so purchase history, cancellations, and intent all persist and compound across sales,
 * exactly like a real e-commerce CRM.
 */
function findOrCreateCustomer(name, city) {
    const existing = db_1.db.prepare(`SELECT id FROM customers WHERE name = ? COLLATE NOCASE`).get(name);
    if (existing)
        return existing.id;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, ".");
    const mobile = "9" + String(Math.floor(1000000000 + Math.random() * 8999999999)).slice(0, 9);
    const info = db_1.db
        .prepare(`INSERT INTO customers (name, mobile, email, customer_type, address, status)
       VALUES (?, ?, ?, 'Retail', ?, 'Active')`)
        .run(name, mobile, `${slug}@demo.local`, city || null);
    return Number(info.lastInsertRowid);
}
/**
 * Explainable, deterministic — every factor is a real count from this customer's own
 * reservation history across every product, not a random score.
 */
function computeIntent(customerId) {
    const row = db_1.db
        .prepare(`SELECT
         SUM(CASE WHEN status = 'FULFILLED' THEN 1 ELSE 0 END) as fulfilled,
         SUM(CASE WHEN status = 'PAYMENT_FAILED' THEN 1 ELSE 0 END) as paymentFailed,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
         SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) as expired,
         COUNT(*) as totalAttempts
       FROM reservations WHERE customer_id = ?`)
        .get(customerId);
    const factors = {
        fulfilled: row.fulfilled || 0,
        paymentFailed: row.paymentFailed || 0,
        cancelled: row.cancelled || 0,
        expired: row.expired || 0,
        totalAttempts: row.totalAttempts || 0,
    };
    const negatives = factors.paymentFailed + factors.cancelled;
    let intent;
    let explanation;
    if (factors.totalAttempts === 0) {
        intent = "MEDIUM";
        explanation = "No purchase history yet — new customers are scored neutrally, not penalized.";
    }
    else if (factors.fulfilled >= 1 && negatives === 0) {
        intent = "HIGH";
        explanation = `${factors.fulfilled} completed purchase(s), zero payment failures or cancellations.`;
    }
    else if (negatives >= 2 && factors.fulfilled === 0) {
        intent = "LOW";
        explanation = `${negatives} payment failure(s)/cancellations against ${factors.fulfilled} completed purchases.`;
    }
    else if (factors.expired >= 3 && factors.fulfilled === 0) {
        intent = "LOW";
        explanation = `${factors.expired} reservations expired without payment, no completed purchases.`;
    }
    else {
        intent = "MEDIUM";
        explanation = `Mixed history: ${factors.fulfilled} fulfilled, ${negatives} failed/cancelled, ${factors.expired} expired.`;
    }
    return { intent, factors, explanation };
}
