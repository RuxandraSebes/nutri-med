import { useMemo, useState } from "react";
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

function Select(props) {
  return (
    <select
      {...props}
      className={["select", props.className || ""].join(" ")}
    />
  );
}

export default function SpecialistDashboard() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const [patientId, setPatientId] = useState("1");
  const [icd10, setIcd10] = useState("");
  const [severity, setSeverity] = useState("mild");

  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [glucose, setGlucose] = useState("");
  const [cholesterol, setCholesterol] = useState("");

  const [fatPct, setFatPct] = useState("");
  const [waterPct, setWaterPct] = useState("");
  const [muscleKg, setMuscleKg] = useState("");
  const [visceral, setVisceral] = useState("");

  const [constraintType, setConstraintType] = useState("allergy");
  const [constraintValue, setConstraintValue] = useState("");
  const [constraints, setConstraints] = useState([]);

  const canNext = useMemo(() => {
    if (step === 1) return String(patientId).trim().length > 0;
    return true;
  }, [step, patientId]);

  async function submit() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload = {
        primary_disease: icd10 || null,
        severity: severity || null,
        systolic_bp: systolic || null,
        diastolic_bp: diastolic || null,
        glucose: glucose || null,
        cholesterol: cholesterol || null,
        body_composition: {
          fat_pct: fatPct || null,
          water_pct: waterPct || null,
          muscle_mass_kg: muscleKg || null,
          visceral_fat_level: visceral || null,
        },
        constraints,
      };

      const data = await apiFetch(
        `/api/medical/patients/${encodeURIComponent(patientId)}/clinical`,
        {
          method: "POST",
          body: payload,
        },
      );

      setResult(data);
      setStep(1);
    } catch (e) {
      setError(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="cardHeader">
          <div>
            <div className="title">Specialist Dashboard</div>
            <div className="subtitle">
              Multi-step clinical input → posts to API Gateway → Medical Service
              returns consolidated specialist object.
            </div>
          </div>
          <div className="stepper" aria-label={`Step ${step} of 3`}>
            <div className={["stepDot", step >= 1 ? "active" : ""].join(" ")} />
            <div className={["stepDot", step >= 2 ? "active" : ""].join(" ")} />
            <div className={["stepDot", step >= 3 ? "active" : ""].join(" ")} />
            <div className="badge">Step {step}/3</div>
          </div>
        </div>

        <div className="cardBody">
          {step === 1 ? (
            <div className="formGrid two">
              <Field label="Patient ID">
                <Input
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  placeholder="e.g. 1"
                />
              </Field>
              <Field
                label="ICD-10 / Primary disease"
                hint="Stored in medical_records.primary_disease"
              >
                <Input
                  value={icd10}
                  onChange={(e) => setIcd10(e.target.value)}
                  placeholder="e.g. E11 (Type 2 diabetes)"
                />
              </Field>
              <Field label="Severity">
                <Select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="mild">mild</option>
                  <option value="moderate">moderate</option>
                  <option value="severe">severe</option>
                </Select>
              </Field>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="formGrid two">
              <Field label="Systolic BP">
                <Input
                  value={systolic}
                  onChange={(e) => setSystolic(e.target.value)}
                  placeholder="e.g. 120"
                />
              </Field>
              <Field label="Diastolic BP">
                <Input
                  value={diastolic}
                  onChange={(e) => setDiastolic(e.target.value)}
                  placeholder="e.g. 80"
                />
              </Field>
              <Field label="Glucose">
                <Input
                  value={glucose}
                  onChange={(e) => setGlucose(e.target.value)}
                  placeholder="e.g. 95"
                />
              </Field>
              <Field label="Cholesterol">
                <Input
                  value={cholesterol}
                  onChange={(e) => setCholesterol(e.target.value)}
                  placeholder="e.g. 180"
                />
              </Field>

              <div className="sectionTitle">
                Body composition
              </div>
              <Field label="fat_pct">
                <Input
                  value={fatPct}
                  onChange={(e) => setFatPct(e.target.value)}
                  placeholder="e.g. 22.5"
                />
              </Field>
              <Field label="water_pct">
                <Input
                  value={waterPct}
                  onChange={(e) => setWaterPct(e.target.value)}
                  placeholder="e.g. 55.0"
                />
              </Field>
              <Field label="muscle_mass_kg">
                <Input
                  value={muscleKg}
                  onChange={(e) => setMuscleKg(e.target.value)}
                  placeholder="e.g. 35.2"
                />
              </Field>
              <Field label="visceral_fat_level">
                <Input
                  value={visceral}
                  onChange={(e) => setVisceral(e.target.value)}
                  placeholder="e.g. 10"
                />
              </Field>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="formGrid">
              <div className="formGrid three">
                <Field label="Type">
                  <Select
                    value={constraintType}
                    onChange={(e) => setConstraintType(e.target.value)}
                  >
                    <option value="allergy">allergy</option>
                    <option value="restriction">restriction</option>
                  </Select>
                </Field>
                <Field label="Value">
                  <Input
                    value={constraintValue}
                    onChange={(e) => setConstraintValue(e.target.value)}
                    placeholder="e.g. peanuts / low sodium"
                  />
                </Field>
                <div style={{ display: "flex", alignItems: "end" }}>
                  <button
                    type="button"
                    className="btn btnPrimary"
                    onClick={() => {
                      const v = constraintValue.trim();
                      if (!v) return;
                      setConstraints((xs) => [
                        ...xs,
                        { type: constraintType, value: v },
                      ]);
                      setConstraintValue("");
                    }}
                  >
                    Add constraint
                  </button>
                </div>
              </div>

              <div className="pillList">
                <div className="sectionTitle">
                  Constraints ({constraints.length})
                </div>
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  {constraints.length === 0 ? (
                    <div className="hint">
                      No constraints added yet.
                    </div>
                  ) : (
                    constraints.map((c, idx) => (
                      <div
                        key={`${c.type}-${c.value}-${idx}`}
                        className="pillItem"
                      >
                        <div>
                          <span className="badge" style={{ marginRight: 10 }}>
                            {c.type}
                          </span>
                          <span>{c.value}</span>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            setConstraints((xs) =>
                              xs.filter((_, i) => i !== idx),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="actions">
            <div className="buttonRow">
            <button
              type="button"
              className="btn"
              disabled={step === 1 || busy}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
            >
              Back
            </button>
            {step < 3 ? (
              <button
                type="button"
                className="btn btnPrimary"
                disabled={!canNext || busy}
                onClick={() => setStep((s) => Math.min(3, s + 1))}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="btn btnSuccess"
                disabled={busy}
                onClick={submit}
              >
                {busy ? "Submitting…" : "Submit clinical data"}
              </button>
            )}
          </div>

          {error ? (
            <div className="danger">Error: {error}</div>
          ) : null}
        </div>
      </div>
      </div>

      <div className="card">
        <div className="cardBody">
          <div className="sectionTitle">Consolidated specialist object</div>
          <div style={{ marginTop: 12 }}>
        <pre className="pre mono">
          {JSON.stringify(result, null, 2)}
        </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

