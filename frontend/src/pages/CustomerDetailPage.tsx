import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { StatusTag } from "../components/StatusTag";
import { useAuth } from "../context/AuthContext";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const canEdit = hasRole("Admin", "Sales");
  const [customer, setCustomer] = useState<any>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await api.get(`/customers/${id}`);
    setCustomer(res.data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addFollowup(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/customers/${id}/followups`, { note });
      setNote("");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  if (!customer) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/customers" style={{ fontSize: 13, color: "var(--text-muted)" }}>← Back to customers</Link>
          <h1 style={{ marginTop: 4 }}>{customer.name}</h1>
          <div className="desc">{customer.business_name || "No business name on file"}</div>
        </div>
        <StatusTag status={customer.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="panel panel-pad">
          <div className="section-title">Details</div>
          <dl style={{ margin: 0, fontSize: 14, lineHeight: 2 }}>
            <div><strong>Mobile:</strong> <span className="mono">{customer.mobile}</span></div>
            <div><strong>Email:</strong> {customer.email || "—"}</div>
            <div><strong>GST number:</strong> {customer.gst_number || "—"}</div>
            <div><strong>Type:</strong> {customer.customer_type}</div>
            <div><strong>Address:</strong> {customer.address || "—"}</div>
            <div><strong>Follow-up date:</strong> {customer.followup_date || "—"}</div>
            <div><strong>Notes:</strong> {customer.notes || "—"}</div>
          </dl>
        </div>

        <div className="panel panel-pad">
          <div className="section-title">Follow-up history</div>
          {error && <div className="alert alert-error">{error}</div>}
          {canEdit && (
            <form onSubmit={addFollowup} style={{ marginBottom: 16 }}>
              <div className="field">
                <textarea
                  rows={2}
                  placeholder="Log a call, visit, or update…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required
                />
              </div>
              <button className="btn btn-primary btn-sm">Add follow-up</button>
            </form>
          )}
          {customer.followups.length === 0 ? (
            <div className="empty-state">No follow-ups logged yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {customer.followups.map((f: any) => (
                <div key={f.id} style={{ borderLeft: "3px solid var(--amber)", paddingLeft: 10 }}>
                  <div style={{ fontSize: 13 }}>{f.note}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{f.created_at}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
