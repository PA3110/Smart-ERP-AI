import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { StatusTag } from "../components/StatusTag";
import { useAuth } from "../context/AuthContext";

export default function ChallansPage() {
  const { hasRole } = useAuth();
  const canCreate = hasRole("Admin", "Sales");
  const [challans, setChallans] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/challans", { params: { status, limit: 50 } });
      setChallans(res.data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sales Challans</h1>
          <div className="desc">Draft, confirm, and track outgoing goods against stock.</div>
        </div>
        {canCreate && (
          <Link to="/challans/new" className="btn btn-amber">+ New challan</Link>
        )}
      </div>

      <div className="panel panel-pad" style={{ marginBottom: 16 }}>
        <div className="field" style={{ marginBottom: 0, maxWidth: 220 }}>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="Draft">Draft</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : challans.length === 0 ? (
          <div className="empty-state">No sales challans yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Challan #</th>
                <th>Customer</th>
                <th>Total qty</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {challans.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/challans/${c.id}`} className="mono">{c.challan_number}</Link></td>
                  <td>{c.customer_name}</td>
                  <td>{c.total_qty}</td>
                  <td><StatusTag status={c.status} /></td>
                  <td>{c.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
