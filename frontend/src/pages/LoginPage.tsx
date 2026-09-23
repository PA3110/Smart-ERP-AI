import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../api/client";

const demoLogins = [
  { role: "Admin", email: "admin@erp.local", password: "Admin@123" },
  { role: "Sales", email: "sales@erp.local", password: "Sales@123" },
  { role: "Warehouse", email: "warehouse@erp.local", password: "Warehouse@123" },
  { role: "Accounts", email: "accounts@erp.local", password: "Accounts@123" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      const dest = location.state?.from?.pathname || "/";
      navigate(dest, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-mark">DEPOT</div>
        <div className="login-sub">Mini ERP + CRM Operations Portal</div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-demo">
          Demo logins (click to fill):
          <br />
          {demoLogins.map((d) => (
            <div key={d.role}>
              <button type="button" onClick={() => fillDemo(d.email, d.password)}>
                {d.role}: {d.email}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
