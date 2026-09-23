import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/customers", label: "Customers" },
  { to: "/products", label: "Products & Stock" },
  { to: "/challans", label: "Sales Challans" },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="mark">DEPOT</div>
          <div className="sub">ERP &amp; CRM Operations</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>{user?.name}</div>
          <span className="role-tag">{user?.role}</span>
          <button onClick={handleLogout}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
            Wholesale &amp; Distribution Operations Portal
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Signed in as <strong style={{ color: "var(--ink)" }}>{user?.name}</strong>
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
