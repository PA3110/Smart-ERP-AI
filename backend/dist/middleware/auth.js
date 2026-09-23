"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errors_1 = require("../utils/errors");
function requireAuth(req, _res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        throw new errors_1.ApiError(401, "Missing or invalid Authorization header");
    }
    const token = header.slice("Bearer ".length);
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    }
    catch {
        throw new errors_1.ApiError(401, "Invalid or expired token");
    }
}
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user)
            throw new errors_1.ApiError(401, "Not authenticated");
        if (!roles.includes(req.user.role)) {
            throw new errors_1.ApiError(403, `Forbidden: requires role ${roles.join(" or ")}`);
        }
        next();
    };
}
