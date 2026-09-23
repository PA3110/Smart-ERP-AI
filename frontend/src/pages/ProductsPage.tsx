import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, apiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface Product {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  unit_price: number;
  stock: number;
  min_stock: number;
  location: string | null;
}

const emptyForm = { name: "", sku: "", category: "", unit_price: "0", stock: "0", min_stock: "0", location: "" };

export default function ProductsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("Admin", "Warehouse");
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [error, setError] = useState("");

  const [stockModalProduct, setStockModalProduct] = useState<Product | null>(null);
  const [stockForm, setStockForm] = useState({ qty: "", movement_type: "IN", reason: "" });
  const [stockError, setStockError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/products", { params: { search, lowStock: lowStockOnly, limit: 100 } });
      setProducts(res.data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, lowStockOnly]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ ...p, unit_price: String(p.unit_price), min_stock: String(p.min_stock), category: p.category || "", location: p.location || "" });
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = {
      ...form,
      unit_price: parseFloat(form.unit_price) || 0,
      stock: editing ? undefined : parseInt(form.stock) || 0,
      min_stock: parseInt(form.min_stock) || 0,
    };
    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, payload);
      } else {
        await api.post("/products", payload);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function openStock(p: Product) {
    setStockModalProduct(p);
    setStockForm({ qty: "", movement_type: "IN", reason: "" });
    setStockError("");
  }

  async function submitStock(e: FormEvent) {
    e.preventDefault();
    if (!stockModalProduct) return;
    setStockError("");
    try {
      await api.post(`/products/${stockModalProduct.id}/stock`, {
        qty: parseInt(stockForm.qty),
        movement_type: stockForm.movement_type,
        reason: stockForm.reason,
      });
      setStockModalProduct(null);
      load();
    } catch (err) {
      setStockError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Products &amp; Stock</h1>
          <div className="desc">Manage the catalog and track stock movements.</div>
        </div>
        {canEdit && (
          <button className="btn btn-amber" onClick={openAdd}>+ Add product</button>
        )}
      </div>

      <div className="panel panel-pad" style={{ marginBottom: 16 }}>
        <div className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Search</label>
            <input placeholder="Search by name, SKU, category…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, paddingBottom: 8 }}>
            <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} style={{ width: "auto" }} />
            Low stock only
          </label>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : products.length === 0 ? (
          <div className="empty-state">No products found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Unit price</th>
                <th>Stock</th>
                <th>Min. alert</th>
                <th>Location</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td className="mono">{p.sku}</td>
                  <td>{p.category || "—"}</td>
                  <td>₹{p.unit_price.toFixed(2)}</td>
                  <td style={{ color: p.stock <= p.min_stock ? "var(--red)" : undefined, fontWeight: p.stock <= p.min_stock ? 600 : 400 }}>
                    {p.stock}
                  </td>
                  <td>{p.min_stock}</td>
                  <td>{p.location || "—"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    {canEdit && <button className="btn btn-sm" onClick={() => openEdit(p)}>Edit</button>}
                    {canEdit && <button className="btn btn-sm" onClick={() => openStock(p)}>Adjust stock</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? "Edit product" : "Add product"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="field-row">
                <div className="field">
                  <label>Product name *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>SKU / code *</label>
                  <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} disabled={!!editing} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Category</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
                <div className="field">
                  <label>Unit price *</label>
                  <input required type="number" step="0.01" min="0" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                </div>
              </div>
              <div className="field-row">
                {!editing && (
                  <div className="field">
                    <label>Opening stock</label>
                    <input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                  </div>
                )}
                <div className="field">
                  <label>Minimum stock alert qty *</label>
                  <input required type="number" min="0" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Location / warehouse</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? "Save changes" : "Add product"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stockModalProduct && (
        <div className="modal-backdrop" onClick={() => setStockModalProduct(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Adjust stock — {stockModalProduct.name}</h2>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              Current stock: <strong>{stockModalProduct.stock}</strong>
            </div>
            {stockError && <div className="alert alert-error">{stockError}</div>}
            <form onSubmit={submitStock}>
              <div className="field-row">
                <div className="field">
                  <label>Movement type</label>
                  <select value={stockForm.movement_type} onChange={(e) => setStockForm({ ...stockForm, movement_type: e.target.value })}>
                    <option value="IN">IN (stock received)</option>
                    <option value="OUT">OUT (stock removed)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Quantity *</label>
                  <input required type="number" min="1" value={stockForm.qty} onChange={(e) => setStockForm({ ...stockForm, qty: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Reason *</label>
                <input required placeholder="e.g. Purchase order received, Damaged goods" value={stockForm.reason} onChange={(e) => setStockForm({ ...stockForm, reason: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setStockModalProduct(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
