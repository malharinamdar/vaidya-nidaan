import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Spinner } from "./ui";

// Guards every workspace route: no token -> sign in (and come back afterwards).
export default function PrivateRoute({ children }) {
  const { token, loading } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  return children;
}
