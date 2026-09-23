import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage } from "../api/client";
import { StatusTag } from "../components/StatusTag";
import { useAuth } from "../context/AuthContext";

interface Customer {
  id: number;
  name: string;
  mobile: string;
  email: string | null;
  business_name: string | null;
  gst_number: string | null;
  customer_type: string;
  address: string | null;
  status: string;
  followup_date: string | null;
  notes: string | null;
}

const emptyForm = {
  name: "",
  mobile: "",
  email: "",
  business_name: "",
  gst_number: "",
  customer_type: "Retail",
  address: "",
  status: "Lead",
  followup_date: "",
  notes: "",
};

export default function CustomersPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("Admin", "Sales");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/customers", { params: { search, status, limit: 50 } });
      setCustomers(res.data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ ...c, email: c.email || "", business_name: c.business_name || "", gst_number: c.gst_number || "", address: c.address || "", followup_date: c.followup_date || "", notes: c.notes || "" });
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editing) {
        await api.put(`/customers/${editing.id}`, form);
      } else {
        await api.post("/customers", form);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <div className="desc">Track leads, active accounts and follow-ups.</div>
        </div>
        {canEdit && (
          <button className="btn btn-amber" onClick={openAdd}>
            + Add customer
          </button>
        )}
      </div>

      <div className="panel panel-pad" style={{ marginBottom: 16 }}>
        <div className="field-row">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Search</label>
            <input
              placeholder="Search by name, mobile, business, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, maxWidth: 200 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="Lead">Lead</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : customers.length === 0 ? (
          <div className="empty-state">No customers match your search yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Business</th>
                <th>Mobile</th>
                <th>Type</th>
                <th>Status</th>
                <th>Follow-up</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/customers/${c.id}`}>{c.name}</Link></td>
                  <td>{c.business_name || "—"}</td>
                  <td className="mono">{c.mobile}</td>
                  <td>{c.customer_type}</td>
                  <td><StatusTag status={c.status} /></td>
                  <td>{c.followup_date || "—"}</td>
                  <td>
                    {canEdit && (
                      <button className="btn btn-sm" onClick={() => openEdit(c)}>Edit</button>
                    )}
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
            <h2>{editing ? "Edit customer" : "Add customer"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="field-row">
                <div className="field">
                  <label>Customer name *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label>Mobile number *</label>
                  <input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="field">
                  <label>Business name</label>
                  <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>GST number</label>
                  <input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} />
                </div>
                <div className="field">
                  <label>Customer type</label>
                  <select value={form.customer_type} onChange={(e) => setForm({ ...form, customer_type: e.target.value })}>
                    <option>Retail</option>
                    <option>Wholesale</option>
                    <option>Distributor</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Address</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option>Lead</option>
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </div>
                <div className="field">
                  <label>Follow-up date</label>
                  <input type="date" value={form.followup_date} onChange={(e) => setForm({ ...form, followup_date: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? "Save changes" : "Add customer"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
