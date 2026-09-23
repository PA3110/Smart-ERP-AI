"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./db");
const auth_1 = __importDefault(require("./routes/auth"));
const customers_1 = __importDefault(require("./routes/customers"));
const products_1 = __importDefault(require("./routes/products"));
const challans_1 = __importDefault(require("./routes/challans"));
const flashSale_1 = __importDefault(require("./routes/flashSale"));
const aiInsights_1 = __importDefault(require("./routes/aiInsights"));
const storefront_1 = __importDefault(require("./routes/storefront"));
const flashSaleService_1 = require("./services/flashSaleService");
const errorHandler_1 = require("./middleware/errorHandler");
dotenv_1.default.config();
if (!process.env.JWT_SECRET) {
    console.warn("WARNING: JWT_SECRET is not set. Using an insecure default for development only.");
    process.env.JWT_SECRET = "dev_insecure_secret_change_me";
}
(0, db_1.initSchema)();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express_1.default.json());
app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));
app.use("/auth", auth_1.default);
app.use("/customers", customers_1.default);
app.use("/products", products_1.default);
app.use("/challans", challans_1.default);
app.use("/flash-sale", flashSale_1.default);
app.use("/ai-insights", aiInsights_1.default);
app.use("/storefront", storefront_1.default);
// Storefront (customer-facing) and Admin dashboard (ops) UIs, both served as
// static Stitch/Nexora-styled pages — the storefront at "/", the admin app at "/admin".
app.use(express_1.default.static(path_1.default.join(__dirname, "../public")));
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
// Expire reservations whose payment window has run out, and advance the queue.
// Runs every second; in production this would be a proper scheduled job, but
// for a single-process demo a simple interval is sufficient and correct
// because sweepExpired() itself is wrapped in atomic per-reservation transactions.
setInterval(() => {
    try {
        (0, flashSaleService_1.sweepExpired)();
    }
    catch (err) {
        console.error("sweepExpired failed:", err);
    }
}, 1000);
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Vivek ERP System listening on http://localhost:${PORT}`);
    console.log(`Reservation console: http://localhost:${PORT}/`);
});
