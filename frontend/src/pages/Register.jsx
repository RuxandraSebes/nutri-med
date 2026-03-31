import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";
import Button from "../components/UI/Button.jsx";
import ClinicalInput from "../components/UI/ClinicalInput.jsx";
import "./Register.css";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("patient");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await register({ email, password, role });
      navigate(
        u.role === "specialist" ? "/specialist" : "/patient",
        { replace: true },
      );
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="registerPage">
      <div className="card">
        <div className="card-body registerCardBody">
          <h1 className="title" style={{ fontSize: 22, marginBottom: 8 }}>
            Create account
          </h1>
          <p className="subtitle" style={{ marginBottom: 24 }}>
            Register as a patient or specialist (doctor / dietitian).
          </p>
          <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
            <ClinicalInput
              label="Email"
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
                autoComplete="new-password"
                required
                minLength={6}
              />
            </label>
            <ClinicalInput
              label="I am a"
              type="select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="patient">Patient</option>
              <option value="specialist">Specialist</option>
            </ClinicalInput>
            {error ? (
              <div className="danger" style={{ fontSize: 14 }}>
                {error}
              </div>
            ) : null}
            <Button variant="primary" loading={busy} type="submit">
              Register
            </Button>
          </form>
          <p style={{ marginTop: 20, fontSize: 14, color: "var(--text-secondary)" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
