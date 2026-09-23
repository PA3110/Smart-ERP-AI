"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const db_1 = require("../db");
const errors_1 = require("../utils/errors");
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const customerIntentService_1 = require("../services/customerIntentService");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
const customerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, "Customer name is required"),
    mobile: zod_1.z.string().min(6, "A valid mobile number is required"),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal("")).optional(),
    business_name: zod_1.z.string().optional(),
    gst_number: zod_1.z.string().optional(),
    customer_type: zod_1.z.enum(["Retail", "Wholesale", "Distributor"]),
    address: zod_1.z.string().optional(),
    status: zod_1.z.enum(["Lead", "Active", "Inactive"]).optional(),
    followup_date: zod_1.z.string().optional().nullable(),
    notes: zod_1.z.string().optional(),
});
// GET /customers?search=&status=&page=&limit=
router.get("/", (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20")));
    const offset = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const status = req.query.status || "";
    const clauses = [];
    const params = [];
    if (search) {
        clauses.push("(name LIKE ? OR mobile LIKE ? OR business_name LIKE ? OR email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
        clauses.push("status = ?");
        params.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = db_1.db.prepare(`SELECT COUNT(*) as c FROM customers ${where}`).get(...params).c;
    const rows = db_1.db
        .prepare(`SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset);
    res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
}));
router.get("/:id", (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const customer = db_1.db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    if (!customer)
        throw new errors_1.ApiError(404, "Customer not found");
    const followups = db_1.db
        .prepare("SELECT * FROM customer_followups WHERE customer_id = ? ORDER BY created_at DESC")
        .all(req.params.id);
    res.json({ ...customer, followups });
}));
router.post("/", (0, auth_1.requireRole)("Admin", "Sales"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const data = customerSchema.parse(req.body);
    const result = db_1.db
        .prepare(`INSERT INTO customers (name, mobile, email, business_name, gst_number, customer_type, address, status, followup_date, notes, created_by)
         VALUES (@name, @mobile, @email, @business_name, @gst_number, @customer_type, @address, @status, @followup_date, @notes, @created_by)`)
        .run({
        name: data.name,
        mobile: data.mobile,
        email: data.email || null,
        business_name: data.business_name || null,
        gst_number: data.gst_number || null,
        customer_type: data.customer_type,
        address: data.address || null,
        status: data.status || "Lead",
        followup_date: data.followup_date || null,
        notes: data.notes || null,
        created_by: req.user.id,
    });
    const customer = db_1.db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(customer);
}));
router.put("/:id", (0, auth_1.requireRole)("Admin", "Sales"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const existing = db_1.db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    if (!existing)
        throw new errors_1.ApiError(404, "Customer not found");
    const data = customerSchema.partial().parse(req.body);
    const merged = { ...existing, ...data };
    db_1.db.prepare(`UPDATE customers SET name=@name, mobile=@mobile, email=@email, business_name=@business_name,
       gst_number=@gst_number, customer_type=@customer_type, address=@address, status=@status,
       followup_date=@followup_date, notes=@notes, updated_at=datetime('now') WHERE id=@id`).run({ ...merged, id: req.params.id });
    const updated = db_1.db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    res.json(updated);
}));
router.post("/:id/followups", (0, auth_1.requireRole)("Admin", "Sales"), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const note = zod_1.z.object({ note: zod_1.z.string().min(1) }).parse(req.body).note;
    const customer = db_1.db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    if (!customer)
        throw new errors_1.ApiError(404, "Customer not found");
    const result = db_1.db
        .prepare("INSERT INTO customer_followups (customer_id, note, created_by) VALUES (?, ?, ?)")
        .run(req.params.id, note, req.user.id);
    const followup = db_1.db.prepare("SELECT * FROM customer_followups WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(followup);
}));
router.get("/:id/intent", (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const customer = db_1.db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    if (!customer)
        throw new errors_1.ApiError(404, "Customer not found");
    const result = (0, customerIntentService_1.computeIntent)(Number(req.params.id));
    res.json(result);
}));
exports.default = router;
