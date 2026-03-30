import { useState } from "react";
import { apiFetch } from "../lib/api.js";

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <div className="label">{label}</div>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </label>
  );
}

function Input(props) {
  return (
    <input {...props} className={["input", props.className || ""].join(" ")} />
  );
}

export default function PatientDashboard() {
  const [patientId, setPatientId] = useState("1");
  const [diary, setDiary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);

  async function generatePlan() {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(
        `/api/recommendations/patients/${encodeURIComponent(patientId)}/plan`,
        {
          method: "POST",
          body: {
            diary_24h: diary || null,
          },
        },
      );
      setPlan(data);
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadLatestPlan() {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch(
        `/api/recommendations/patients/${encodeURIComponent(patientId)}/plan`,
      );
      setPlan(data);
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="cardBody">
          <div className="title">Patient Dashboard</div>
          <div className="subtitle">
            24h diary + generated plan display (meal matrix + shopping list).
          </div>

        <div className="formGrid" style={{ marginTop: 14 }}>
          <Field label="Patient ID">
            <Input
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            />
          </Field>

          <Field
            label="24h Food diary"
            hint="Stored/used later in AI pipeline; currently only sent as part of request."
          >
            <textarea
              className="textarea"
              placeholder="e.g. 08:00 oatmeal; 13:00 salad; 19:00 fish…"
              value={diary}
              onChange={(e) => setDiary(e.target.value)}
            />
          </Field>

          <div className="buttonRow">
            <button
              type="button"
              className="btn btnSuccess"
              onClick={generatePlan}
              disabled={busy}
            >
              {busy ? "Working…" : "Generate plan"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={loadLatestPlan}
              disabled={busy}
            >
              Load latest plan
            </button>
          </div>

          {error ? (
            <div className="danger">Error: {error}</div>
          ) : null}
        </div>
      </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="sectionTitle">Latest plan payload</div>
          <div style={{ marginTop: 12 }}>
            <pre className="pre mono">{JSON.stringify(plan, null, 2)}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

