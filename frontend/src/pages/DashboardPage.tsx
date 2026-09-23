import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { StatusTag } from "../components/StatusTag";

export default function DashboardPage() {
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [recentChallans, setRecentChallans] = useState<any[]>([]);

  useEffect(() => {
    api.get("/customers", { params: { limit: 1 } }).then((r) => setCustomerCount(r.data.total));
    api.get("/products", { params: { limit: 1 } }).then((r) => setProductCount(r.data.total));
    api.get("/products", { params: { lowStock: true, limit: 10 } }).then((r) => setLowStock(r.data.data));
    api.get("/challans", { params: { limit: 6 } }).then((r) => setRecentChallans(r.data.data));
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="desc">A snapshot of customers, stock and recent sales activity.</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total customers</div>
          <div className="value">{customerCount ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Products tracked</div>
          <div className="value">{productCount ?? "—"}</div>
        </div>
        <div className="stat-card">
          <div className="label">Products below minimum stock</div>
          <div className="value">{lowStock.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Recent challans</div>
          <div className="value">{recentChallans.length}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="panel panel-pad">
          <div className="section-title">Low stock alerts</div>
          {lowStock.length === 0 ? (
            <div className="empty-state">Nothing below minimum stock right now.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Stock</th>
                  <th>Minimum</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to="/products">{p.name}</Link>
                      <div className="mono" style={{ color: "var(--text-muted)" }}>{p.sku}</div>
                    </td>
                    <td>{p.stock}</td>
                    <td>{p.min_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel panel-pad">
          <div className="section-title">Recent sales challans</div>
          {recentChallans.length === 0 ? (
            <div className="empty-state">No challans created yet.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Challan</th>
                  <th>Customer</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentChallans.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/challans/${c.id}`} className="mono">{c.challan_number}</Link>
                    </td>
                    <td>{c.customer_name}</td>
                    <td><StatusTag status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
