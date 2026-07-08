export function MatrixGenerationBanner({ elapsedSec }) {
  const pct = Math.min(94, 8 + Math.min(elapsedSec, 720) / 10);
  return (
    <div className="sd-gen-banner">
      <div className="sd-gen-bar-track">
        <div className="sd-gen-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="sd-gen-label">
        Generating meal matrix… {elapsedSec}s elapsed
      </div>
    </div>
  );
}

export function BiomarkerTile({ label, value, unit, normalRange }) {
  const hasVal = value !== null && value !== undefined && value !== "";
  return (
    <div className="sd-biomarker-tile">
      <div className="sd-biomarker-label">{label}</div>
      <div className="sd-biomarker-value">
        {hasVal ? value : <span style={{ color: "#cbd5e1" }}>-</span>}
        {hasVal && <span className="sd-biomarker-unit">&nbsp;{unit}</span>}
      </div>
      {normalRange && (
        <div className="sd-biomarker-range">Normal: {normalRange}</div>
      )}
    </div>
  );
}

export function SavedClinicalObject({ result }) {
  if (!result) return null;

  const severityVariant = (() => {
    const s = String(result.severity || "").toLowerCase();
    if (s === "severe" || s === "high") return "sd-badge-red";
    if (s === "moderate") return "sd-badge-amber";
    return "sd-badge-green";
  })();

  return (
    <div className="sd-saved-obj">
      <div className="sd-saved-obj-header">
        <div>
          <div
            style={{ fontSize: 14, fontWeight: 700, color: "var(--sd-text)" }}
          >
            Saved clinical object
          </div>
          <div
            style={{ fontSize: 12, color: "var(--sd-text-3)", marginTop: 2 }}
          >
            Persisted to patient record · used for AI matrix generation
          </div>
        </div>
        <span className="sd-badge sd-badge-green">
          <span className="sd-badge-dot" style={{ background: "#22c55e" }} />
          Saved
        </span>
      </div>

      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(result.primary_disease || result.icd10) && (
            <span className="sd-badge sd-badge-indigo">
              {result.primary_disease || result.icd10}
            </span>
          )}
          {result.severity && (
            <span className={`sd-badge ${severityVariant}`}>
              {result.severity}
            </span>
          )}
        </div>

        {result.biomarkers && (
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                color: "var(--sd-text-3)",
                marginBottom: 8,
              }}
            >
              Biometric markers
            </div>
            <div className="sd-biomarker-grid">
              <BiomarkerTile
                label="Systolic BP"
                value={result.biomarkers.systolic_bp}
                unit="mmHg"
                normalRange="90-120"
              />
              <BiomarkerTile
                label="Diastolic BP"
                value={result.biomarkers.diastolic_bp}
                unit="mmHg"
                normalRange="60-80"
              />
              <BiomarkerTile
                label="Glucose"
                value={result.biomarkers.glucose}
                unit="mg/dL"
                normalRange="70-99"
              />
              <BiomarkerTile
                label="Cholesterol"
                value={result.biomarkers.cholesterol}
                unit="mg/dL"
                normalRange="< 200"
              />
            </div>
          </div>
        )}

        {result.body_composition && (
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                color: "var(--sd-text-3)",
                marginBottom: 8,
              }}
            >
              Body composition
            </div>
            <div className="sd-biomarker-grid">
              <BiomarkerTile
                label="Body fat"
                value={
                  result.body_composition.body_fat_percentage ??
                  result.body_composition.fat_pct
                }
                unit="%"
              />
              <BiomarkerTile
                label="Water"
                value={
                  result.body_composition.body_water_percentage ??
                  result.body_composition.water_pct
                }
                unit="%"
              />
              <BiomarkerTile
                label="Muscle mass"
                value={result.body_composition.muscle_mass_kg}
                unit="kg"
              />
              <BiomarkerTile
                label="Visceral fat"
                value={result.body_composition.visceral_fat_level}
                unit=""
              />
              <BiomarkerTile
                label="Metabolic age"
                value={result.body_composition.metabolic_age}
                unit="yr"
              />
            </div>
          </div>
        )}

        {result.clinical_constraints?.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                color: "var(--sd-text-3)",
                marginBottom: 8,
              }}
            >
              Clinical constraints
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {result.clinical_constraints.map((c, i) => (
                <span
                  key={i}
                  className={`sd-pill ${c.type === "allergy" ? "sd-pill-allergy" : "sd-pill-restriction"}`}
                >
                  {c.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function splitList(s) {
  return String(s || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
