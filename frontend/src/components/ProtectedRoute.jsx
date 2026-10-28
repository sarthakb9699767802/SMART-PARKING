import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Guards a whole route branch.
 * - Waits while the stored token is being checked.
 * - Sends signed-out visitors to the correct login page.
 * - Sends a signed-in user to their own dashboard if they try the other role's pages.
 */
export default function ProtectedRoute({ role }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="page page--centered" role="status">
        <div className="feedback">
          <span className="spinner" aria-hidden="true" />
          <p>Checking your session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={role === "owner" ? "/owner/login" : "/user/login"}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  if (user.role !== role) {
    return <Navigate to={user.role === "owner" ? "/owner/dashboard" : "/user/dashboard"} replace />;
  }

  return <Outlet />;
}
