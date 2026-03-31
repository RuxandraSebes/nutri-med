import { Link, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";
import { AuthProvider, useAuth } from "./contexts/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import SpecialistDashboard from "./pages/SpecialistDashboard.jsx";
import PatientDashboard from "./pages/PatientDashboardV2.jsx";
import PatientProfilePage from "./pages/PatientProfilePage.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";

function HomeRedirect() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "specialist") return <Navigate to="/specialist" replace />;
  if (user.role === "patient") return <Navigate to="/patient" replace />;
  return <Navigate to="/login" replace />;
}

function Shell({ children }) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const active = (to) => pathname.startsWith(to);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" style={{ textDecoration: "none" }}>
            <div className="brand-mark">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4z" />
                <path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" />
                <line x1="12" y1="10" x2="12" y2="14" />
              </svg>
            </div>
            Nutri-Med
          </Link>

          <nav className="topbar-nav">
            {user?.role === "specialist" && (
              <Link
                to="/specialist"
                className={`nav-link ${active("/specialist") ? "active" : ""}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  width="16"
                  height="16"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                Specialist
              </Link>
            )}
            {user?.role === "patient" && (
              <>
                <Link
                  to="/patient"
                  className={`nav-link ${active("/patient") && !active("/patient/profile") ? "active" : ""}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    width="16"
                    height="16"
                  >
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                  Dashboard
                </Link>
                <Link
                  to="/patient/profile"
                  className={`nav-link ${active("/patient/profile") ? "active" : ""}`}
                >
                  My profile
                </Link>
              </>
            )}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!user ? (
              <>
                <Link to="/login" className="nav-link">
                  Log in
                </Link>
                <Link
                  to="/register"
                  className="nav-link active"
                  style={{ border: "1px solid var(--primary-mid)" }}
                >
                  Register
                </Link>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={user.email}
                >
                  {user.email}
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    ({user.role})
                  </span>
                </span>
                <button
                  type="button"
                  className="nav-link"
                  onClick={() => logout()}
                  style={{ border: "none", cursor: "pointer" }}
                >
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="page-container">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/specialist"
              element={
                <ProtectedRoute roles={["specialist"]}>
                  <SpecialistDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <PatientDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient/profile"
              element={
                <ProtectedRoute roles={["patient"]}>
                  <PatientProfilePage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Shell>
      </AuthProvider>
    </ThemeProvider>
  );
}
