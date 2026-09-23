import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { StatusTag } from "../components/StatusTag";
import { useAuth } from "../context/AuthContext";

export default function ChallanDetailPage() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [challan, setChallan] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await api.get(`/challans/${id}`);
    setChallan(res.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function confirm() {
    setError("");
    setBusy(true);
    try {
      await api.post(`/challans/${id}/confirm`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm) return;
    setError("");
    setBusy(true);
    try {
      await api.post(`/challans/${id}/cancel`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!challan) return <div className="empty-state">Loading…</div>;

  const canConfirm = challan.status === "Draft" && hasRole("Admin", "Sales", "Warehouse");
  const canCancel = challan.status !== "Cancelled" && hasRole("Admin", "Sales");
  const total = challan.items.reduce((sum: number, i: any) => sum + i.qty * i.unit_price_snapshot, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/challans" style={{ fontSize: 13, color: "var(--text-muted)" }}>← Back to challans</Link>
          <h1 className="mono" style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 24 }}>{challan.challan_number}</h1>
          <div className="desc">For {challan.customer.name} {challan.customer.business_name ? `(${challan.customer.business_name})` : ""}</div>
        </div>
        <StatusTag status={challan.status} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel panel-pad" style={{ marginBottom: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Product (snapshot)</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Line total</th>
            </tr>
          </thead>
          <tbody>
            {challan.items.map((item: any) => (
              <tr key={item.id}>
                <td>{item.product_name_snapshot}</td>
                <td className="mono">{item.sku_snapshot}</td>
                <td>{item.qty}</td>
                <td>₹{item.unit_price_snapshot.toFixed(2)}</td>
                <td>₹{(item.qty * item.unit_price_snapshot).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ textAlign: "right", marginTop: 10, fontWeight: 600 }}>
          Total: ₹{total.toFixed(2)} ({challan.total_qty} units)
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {canConfirm && (
          <button className="btn btn-primary" disabled={busy} onClick={confirm}>Confirm challan (reduces stock)</button>
        )}
        {canCancel && (
          <button className="btn btn-danger" disabled={busy} onClick={cancel}>Cancel challan</button>
        )}
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 16 }}>
        Created by user #{challan.created_by} on {challan.created_at}
        {challan.confirmed_at && <> · Confirmed on {challan.confirmed_at}</>}
      </div>
    </div>
  );
}
