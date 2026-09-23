"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const index_1 = require("./index");
const warehouseAllocationService_1 = require("../services/warehouseAllocationService");
(0, index_1.initSchema)();
const users = [
    { name: "Admin User", email: "admin@erp.local", password: "Admin@123", role: "Admin" },
    { name: "Sales User", email: "sales@erp.local", password: "Sales@123", role: "Sales" },
    { name: "Warehouse User", email: "warehouse@erp.local", password: "Warehouse@123", role: "Warehouse" },
    { name: "Accounts User", email: "accounts@erp.local", password: "Accounts@123", role: "Accounts" },
];
const insertUser = index_1.db.prepare("INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
for (const u of users) {
    const hash = bcryptjs_1.default.hashSync(u.password, 10);
    insertUser.run(u.name, u.email, hash, u.role);
}
const existingProducts = index_1.db.prepare("SELECT COUNT(*) as c FROM products").get();
if (existingProducts.c === 0) {
    const insertProduct = index_1.db.prepare(`INSERT INTO products (name, sku, category, unit_price, mrp, stock, min_stock, location, emoji, rating, review_count, is_flash_deal, storefront_visible, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    // Back-office / B2B catalog (unchanged from the original ERP-CRM base)
    insertProduct.run("PVC Pipe 1 inch", "PVC-1IN", "Pipes", 120.5, null, 500, 50, "Warehouse A", null, null, 0, 0, 0, null);
    insertProduct.run("PVC Pipe 2 inch", "PVC-2IN", "Pipes", 210.0, null, 300, 40, "Warehouse A", null, null, 0, 0, 0, null);
    insertProduct.run("Copper Wire 1.5mm", "WIRE-1.5", "Electrical", 45.0, null, 1000, 100, "Warehouse B", null, null, 0, 0, 0, null);
    insertProduct.run("LED Bulb 9W", "LED-9W", "Electrical", 85.0, null, 20, 30, "Warehouse B", null, null, 0, 0, 0, null);
    // Consumer storefront catalog — Big Billion Day style: a mix of deeply-discounted,
    // limited-stock flash deals (the ones that trigger the reservation/queue engine)
    // and ordinary, well-stocked catalog items sold alongside them.
    insertProduct.run("iPhone 17 Pro (256GB, Obsidian)", "FLASH-IPH17-256", "Smartphones", 79999, 149900, 10, 5, "Multi-warehouse", "📱", 4.6, 18420, 1, 1, "6.3\" Super Retina XDR display, A19 Pro chip, titanium frame. Today's Big Billion Day deal — extremely limited stock.");
    insertProduct.run("Samsung Galaxy S26 Ultra (512GB)", "FLASH-SGS26-512", "Smartphones", 94999, 139999, 6, 5, "Multi-warehouse", "📱", 4.5, 9876, 1, 1, "512GB storage, 200MP camera, S-Pen included. Flash deal — while stock lasts.");
    insertProduct.run("Sony WH-1000XM6 Headphones", "FLASH-SONY-XM6", "Audio", 19990, 34990, 15, 5, "Multi-warehouse", "🎧", 4.7, 5231, 1, 1, "Industry-leading noise cancellation. Limited festival-day stock.");
    insertProduct.run("LG 55\" 4K OLED Smart TV", "TV-LG-55OLED", "Televisions", 89999, 159999, 120, 15, "Multi-warehouse", "📺", 4.4, 3120, 0, 1, "Self-lit OLED pixels, Dolby Vision, webOS smart platform.");
    insertProduct.run("boAt Airdopes 401 ANC", "AUD-BOAT-401", "Audio", 1499, 4990, 850, 100, "Multi-warehouse", "🎧", 4.1, 42110, 0, 1, "Active noise cancellation, 40H playback. Everyday low price.");
    insertProduct.run("Instant Pot Duo 6L", "APP-IPOT-6L", "Home Appliances", 6499, 12995, 300, 40, "Multi-warehouse", "🍲", 4.5, 15680, 0, 1, "7-in-1 multi-cooker: pressure cook, slow cook, sauté, steam.");
    insertProduct.run("Dell XPS 14 Laptop (32GB/1TB)", "LAP-DELL-XPS14", "Laptops", 154990, 189990, 40, 8, "Multi-warehouse", "💻", 4.6, 2210, 0, 1, "14\" 3K OLED touch display, Intel Core Ultra 9, 32GB RAM.");
    // Distribute each storefront product's stock across the real warehouse network
    // so the allocation engine has real per-warehouse batches to route orders through.
    const storefrontProducts = index_1.db.prepare("SELECT id, stock FROM products WHERE storefront_visible = 1").all();
    for (const p of storefrontProducts)
        (0, warehouseAllocationService_1.seedBatchesForProduct)(p.id, p.stock);
}
const existingCustomers = index_1.db.prepare("SELECT COUNT(*) as c FROM customers").get();
if (existingCustomers.c === 0) {
    const insertCustomer = index_1.db.prepare(`INSERT INTO customers (name, mobile, email, business_name, gst_number, customer_type, address, status, followup_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertCustomer.run("Ramesh Traders", "9876543210", "ramesh@traders.com", "Ramesh Traders Pvt Ltd", "27ABCDE1234F1Z5", "Wholesale", "MIDC, Pune", "Active", null, "Regular bulk buyer of pipes.");
    insertCustomer.run("Sunrise Electricals", "9123456780", "contact@sunrise.com", "Sunrise Electricals", null, "Distributor", "Andheri, Mumbai", "Lead", "2026-09-10", "Interested in electrical items, needs a quote.");
}
console.log("Seed complete.");
console.log("Demo logins:");
users.forEach((u) => console.log(`  ${u.role}: ${u.email} / ${u.password}`));
