import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { ApiError } from "../utils/errors";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { computeIntent } from "../services/customerIntentService";

const router = Router();
router.use(requireAuth);

const customerSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  mobile: z.string().min(6, "A valid mobile number is required"),
  email: z.string().email().optional().or(z.literal("")).optional(),
  business_name: z.string().optional(),
  gst_number: z.string().optional(),
  customer_type: z.enum(["Retail", "Wholesale", "Distributor"]),
  address: z.string().optional(),
  status: z.enum(["Lead", "Active", "Inactive"]).optional(),
  followup_date: z.string().optional().nullable(),
  notes: z.string().optional(),
});

// GET /customers?search=&status=&page=&limit=
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt((req.query.page as string) || "1"));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || "20")));
    const offset = (page - 1) * limit;
    const search = ((req.query.search as string) || "").trim();
    const status = (req.query.status as string) || "";

    const clauses: string[] = [];
    const params: any[] = [];

    if (search) {
      clauses.push("(name LIKE ? OR mobile LIKE ? OR business_name LIKE ? OR email LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const total = (db.prepare(`SELECT COUNT(*) as c FROM customers ${where}`).get(...params) as any).c;
    const rows = db
      .prepare(`SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);

    res.json({ data: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    if (!customer) throw new ApiError(404, "Customer not found");
    const followups = db
      .prepare("SELECT * FROM customer_followups WHERE customer_id = ? ORDER BY created_at DESC")
      .all(req.params.id);
    res.json({ ...customer, followups });
  })
);

router.post(
  "/",
  requireRole("Admin", "Sales"),
  asyncHandler(async (req, res) => {
    const data = customerSchema.parse(req.body);
    const result = db
      .prepare(
        `INSERT INTO customers (name, mobile, email, business_name, gst_number, customer_type, address, status, followup_date, notes, created_by)
         VALUES (@name, @mobile, @email, @business_name, @gst_number, @customer_type, @address, @status, @followup_date, @notes, @created_by)`
      )
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
        created_by: req.user!.id,
      });
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(customer);
  })
);

router.put(
  "/:id",
  requireRole("Admin", "Sales"),
  asyncHandler(async (req, res) => {
    const existing = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    if (!existing) throw new ApiError(404, "Customer not found");
    const data = customerSchema.partial().parse(req.body);
    const merged = { ...(existing as any), ...data };
    db.prepare(
      `UPDATE customers SET name=@name, mobile=@mobile, email=@email, business_name=@business_name,
       gst_number=@gst_number, customer_type=@customer_type, address=@address, status=@status,
       followup_date=@followup_date, notes=@notes, updated_at=datetime('now') WHERE id=@id`
    ).run({ ...merged, id: req.params.id });
    const updated = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    res.json(updated);
  })
);

router.post(
  "/:id/followups",
  requireRole("Admin", "Sales"),
  asyncHandler(async (req, res) => {
    const note = z.object({ note: z.string().min(1) }).parse(req.body).note;
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    if (!customer) throw new ApiError(404, "Customer not found");
    const result = db
      .prepare("INSERT INTO customer_followups (customer_id, note, created_by) VALUES (?, ?, ?)")
      .run(req.params.id, note, req.user!.id);
    const followup = db.prepare("SELECT * FROM customer_followups WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(followup);
  })
);

router.get(
  "/:id/intent",
  asyncHandler(async (req, res) => {
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
    if (!customer) throw new ApiError(404, "Customer not found");
    const result = computeIntent(Number(req.params.id));
    res.json(result);
  })
);

export default router;
