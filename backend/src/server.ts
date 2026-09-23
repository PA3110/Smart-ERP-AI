import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import { initSchema } from "./db";
import authRoutes from "./routes/auth";
import customerRoutes from "./routes/customers";
import productRoutes from "./routes/products";
import challanRoutes from "./routes/challans";
import flashSaleRoutes from "./routes/flashSale";
import aiInsightsRoutes from "./routes/aiInsights";
import storefrontRoutes from "./routes/storefront";
import { sweepExpired } from "./services/flashSaleService";
import { errorHandler, notFound } from "./middleware/errorHandler";

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET is not set. Using an insecure default for development only.");
  process.env.JWT_SECRET = "dev_insecure_secret_change_me";
}

initSchema();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/auth", authRoutes);
app.use("/customers", customerRoutes);
app.use("/products", productRoutes);
app.use("/challans", challanRoutes);
app.use("/flash-sale", flashSaleRoutes);
app.use("/ai-insights", aiInsightsRoutes);
app.use("/storefront", storefrontRoutes);

// Storefront (customer-facing) and Admin dashboard (ops) UIs, both served as
// static Stitch/Nexora-styled pages — the storefront at "/", the admin app at "/admin".
app.use(express.static(path.join(__dirname, "../public")));

app.use(notFound);
app.use(errorHandler);

// Expire reservations whose payment window has run out, and advance the queue.
// Runs every second; in production this would be a proper scheduled job, but
// for a single-process demo a simple interval is sufficient and correct
// because sweepExpired() itself is wrapped in atomic per-reservation transactions.
setInterval(() => {
  try {
    sweepExpired();
  } catch (err) {
    console.error("sweepExpired failed:", err);
  }
}, 1000);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Vivek ERP System listening on http://localhost:${PORT}`);
  console.log(`Reservation console: http://localhost:${PORT}/`);
});
