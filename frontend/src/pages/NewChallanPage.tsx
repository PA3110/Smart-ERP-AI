import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";

interface Line {
  product_id: number;
  qty: string;
}

export default function NewChallanPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ product_id: 0, qty: "" }]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/customers", { params: { limit: 200 } }).then((r) => setCustomers(r.data.data));
    api.get("/products", { params: { limit: 200 } }).then((r) => setProducts(r.data.data));
  }, []);

  function updateLine(i: number, field: keyof Line, value: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: field === "product_id" ? Number(value) : value } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { product_id: 0, qty: "" }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function productStock(id: number) {
    return products.find((p) => p.id === id)?.stock;
  }

  async function submit(status: "Draft" | "Confirmed", e: FormEvent) {
    e.preventDefault();
    setError("");
    const items = lines
      .filter((l) => l.product_id && l.qty)
      .map((l) => ({ product_id: l.product_id, qty: parseInt(l.qty) }));

    if (!customerId) {
      setError("Please select a customer");
      return;
    }
    if (items.length === 0) {
      setError("Add at least one product line");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/challans", { customer_id: Number(customerId), items, status });
      navigate(`/challans/${res.data.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>New Sales Challan</h1>
          <div className="desc">Select a customer and the products to dispatch.</div>
        </div>
      </div>

      <div className="panel panel-pad" style={{ maxWidth: 720 }}>
        {error && <div className="alert alert-error">{error}</div>}
        <form>
          <div className="field">
            <label>Customer *</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} {c.business_name ? `(${c.business_name})` : ""}</option>
              ))}
            </select>
          </div>

          <div className="section-title" style={{ fontSize: 16, marginTop: 20 }}>Products</div>
          <table className="data-table line-items-table">
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ width: 100 }}>Quantity</th>
                <th style={{ width: 90 }}>In stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <select value={line.product_id || ""} onChange={(e) => updateLine(i, "product_id", e.target.value)}>
                      <option value="">Select product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="number" min="1" value={line.qty} onChange={(e) => updateLine(i, "qty", e.target.value)} />
                  </td>
                  <td style={{ color: line.product_id && Number(line.qty) > (productStock(line.product_id) ?? Infinity) ? "var(--red)" : undefined }}>
                    {line.product_id ? productStock(line.product_id) : "—"}
                  </td>
                  <td>
                    {lines.length > 1 && (
                      <button type="button" className="btn btn-sm" onClick={() => removeLine(i)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-sm" onClick={addLine} style={{ marginTop: 10 }}>+ Add product line</button>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
            <button type="button" className="btn" disabled={submitting} onClick={(e) => submit("Draft", e)}>Save as draft</button>
            <button type="button" className="btn btn-primary" disabled={submitting} onClick={(e) => submit("Confirmed", e)}>
              Save &amp; confirm
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            Confirming reduces stock immediately. If any product doesn't have enough stock, the challan is rejected and nothing is changed.
          </div>
        </form>
      </div>
    </div>
  );
}
