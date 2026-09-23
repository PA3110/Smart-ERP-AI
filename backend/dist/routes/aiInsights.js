"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiInsightsService_1 = require("../services/aiInsightsService");
const router = (0, express_1.Router)();
// Generate a fresh recommendation from current live data
router.post("/:productId/generate", (req, res, next) => {
    try {
        const insight = (0, aiInsightsService_1.generateInsight)(Number(req.params.productId));
        res.status(201).json({ ...insight, justification: JSON.parse(insight.justification) });
    }
    catch (err) {
        next(err);
    }
});
router.get("/:productId/latest", (req, res, next) => {
    try {
        const insight = (0, aiInsightsService_1.getLatestInsight)(Number(req.params.productId));
        if (!insight)
            return res.status(404).json({ error: "No recommendation generated yet" });
        res.json({ ...insight, justification: JSON.parse(insight.justification) });
    }
    catch (err) {
        next(err);
    }
});
router.get("/:productId/history", (req, res, next) => {
    try {
        const rows = (0, aiInsightsService_1.listInsights)(Number(req.params.productId)).map((i) => ({ ...i, justification: JSON.parse(i.justification) }));
        res.json(rows);
    }
    catch (err) {
        next(err);
    }
});
router.post("/:id/decision", (req, res, next) => {
    try {
        const { decision, qty, decidedBy = "Inventory Manager" } = req.body || {};
        if (!["APPROVED", "MODIFIED", "REJECTED"].includes(decision)) {
            return res.status(400).json({ error: "decision must be APPROVED, MODIFIED, or REJECTED" });
        }
        const insight = (0, aiInsightsService_1.applyDecision)(Number(req.params.id), decision, qty ? Number(qty) : undefined, String(decidedBy));
        res.json({ ...insight, justification: JSON.parse(insight.justification) });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
