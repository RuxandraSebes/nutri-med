import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import Button from "../components/UI/Button.jsx";
import ClinicalInput from "../components/UI/ClinicalInput.jsx";
import "./Login.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await login(email, password);
      navigate(
        u.role === "specialist"
          ? "/specialist"
          : u.role === "patient"
            ? "/patient"
            : from,
        { replace: true },
      );
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="loginPage">
      <div className="card">
        <div className="card-body loginCardBody">
          <h1 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
            Sign in
          </h1>
          <p className="subtitle" style={{ marginBottom: 24 }}>
            Nutri-Med clinical nutrition platform
          </p>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
            <ClinicalInput
              label="Email"
              type="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <label className="field">
              <span className="field-label">Password</span>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error ? (
              <div className="danger" style={{ fontSize: 14 }}>
                {error}
              </div>
            ) : null}
            <Button variant="primary" loading={busy} type="submit">
              Log in
            </Button>
          </form>
          <p style={{ marginTop: 20, fontSize: 14, color: "var(--text-secondary)" }}>
            No account?{" "}
            <Link to="/register" style={{ color: "var(--primary)", fontWeight: 600 }}>
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
