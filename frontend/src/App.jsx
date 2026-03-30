import { Link, Route, Routes, Navigate, useLocation } from "react-router-dom";
import SpecialistDashboard from "./pages/SpecialistDashboard.jsx";
import PatientDashboard from "./pages/PatientDashboard.jsx";

function Shell({ children }) {
  const location = useLocation();
  const active = (path) => location.pathname.startsWith(path);
  return (
    <div className="appShell">
      <header className="topbar">
        <div className="topbarInner">
          <div className="brand">
            <div className="brandMark" aria-hidden="true" />
            <div>Nutri-Med</div>
          </div>
          <nav className="nav">
            <Link data-active={active("/specialist")} to="/specialist">
              Specialist
            </Link>
            <Link data-active={active("/patient")} to="/patient">
              Patient
            </Link>
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/specialist" replace />} />
        <Route path="/specialist" element={<SpecialistDashboard />} />
        <Route path="/patient" element={<PatientDashboard />} />
      </Routes>
    </Shell>
  );
}

