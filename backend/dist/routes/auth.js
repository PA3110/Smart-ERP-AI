"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const db_1 = require("../db");
const errors_1 = require("../utils/errors");
const errorHandler_1 = require("../middleware/errorHandler");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
router.post("/login", (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = db_1.db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get(email);
    if (!user)
        throw new errors_1.ApiError(401, "Invalid email or password");
    const ok = bcryptjs_1.default.compareSync(password, user.password_hash);
    if (!ok)
        throw new errors_1.ApiError(401, "Invalid email or password");
    const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h",
    });
    res.json({ token, user: payload });
}));
router.get("/me", auth_1.requireAuth, (0, errorHandler_1.asyncHandler)(async (req, res) => {
    res.json({ user: req.user });
}));
exports.default = router;
