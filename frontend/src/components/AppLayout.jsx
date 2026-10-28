import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const USER_LINKS = [
  { to: "/user/dashboard", label: "Dashboard" },
  { to: "/user/find", label: "Find parking" },
  { to: "/user/bookings", label: "My bookings" },
];

const OWNER_LINKS = [
  { to: "/owner/dashboard", label: "Overview" },
  { to: "/owner/locations", label: "Locations" },
  { to: "/owner/slots", label: "Slots" },
  { to: "/owner/reservations", label: "Reservations" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const isOwner = user?.role === "owner";
  const links = isOwner ? OWNER_LINKS : USER_LINKS;
  const home = isOwner ? "/owner/dashboard" : "/user/dashboard";

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    navigate(isOwner ? "/owner/login" : "/user/login", { replace: true });
  }

  return (
    <div className={`shell${isOwner ? " shell--owner" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="topbar">
        <div className="topbar__inner">
          <NavLink to={home} className="brand" aria-label="SmartPark home">
            <span className="brand__mark" aria-hidden="true">
              P
            </span>
            <span className="brand__text">
              SmartPark
              <span className="brand__role">{isOwner ? "Owner console" : "User"}</span>
            </span>
          </NavLink>

          <nav className="topnav" aria-label="Main navigation">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `topnav__link${isActive ? " topnav__link--active" : ""}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="topbar__account">
            <span className="topbar__name">{user?.business_name || user?.name}</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? "Signing out…" : "Log out"}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="page">
        <Outlet />
      </main>

      <footer className="site-foot">
        <p>
          SmartPark college project · Availability is refreshed from the local SQLite database every
          5 seconds. No real parking sensors, payments or external services are connected.
        </p>
      </footer>
    </div>
  );
}
