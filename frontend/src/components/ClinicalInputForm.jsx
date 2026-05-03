import { useState } from "react";
import Button from "./UI/Button.jsx";

/* ── shared classes ─────────────────────────────────────────────────────────── */
const INPUT =
  "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 transition-shadow";
const LABEL =
  "block text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5";

/* ── section wrapper ────────────────────────────────────────────────────────── */
function Section({ icon, title, children }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1.5px solid #e2e8f0",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 20px",
          borderBottom: "1px solid #f1f5f9",
          background: "#fafafa",
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: "#eef2ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6366f1"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={icon} />
          </svg>
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
          {title}
        </span>
      </div>
      <div style={{ padding: "18px 20px", display: "grid", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

/* ── metric card input ──────────────────────────────────────────────────────── */
function MetricCard({
  label,
  unit,
  value,
  onChange,
  placeholder,
  normalRange,
}) {
  const [focused, setFocused] = useState(false);
  const hasValue = value !== "" && value !== null && value !== undefined;

  return (
    <div
      style={{
        background: focused ? "#fafbff" : "#fff",
        border: `1.5px solid ${focused ? "#a5b4fc" : "#e2e8f0"}`,
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: focused
          ? "0 0 0 3px rgba(99,102,241,.1)"
          : "0 1px 2px rgba(0,0,0,.04)",
        transition: "all .15s",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".06em",
          color: "#94a3b8",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <input
          type="number"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            padding: 0,
            fontSize: 18,
            fontWeight: 800,
            color: "#0f172a",
            background: "transparent",
            letterSpacing: "-.02em",
            minWidth: 0,
          }}
        />
        {unit && (
          <span
            style={{
              fontSize: 12,
              color: "#94a3b8",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {normalRange && (
        <div style={{ marginTop: 5, fontSize: 11, color: "#94a3b8" }}>
          Normal: {normalRange}
        </div>
      )}
    </div>
  );
}

/* ── patient search result row ──────────────────────────────────────────────── */
function PatientRow({ patient, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        textAlign: "left",
        padding: "11px 14px",
        border: `1.5px solid ${selected ? "#6366f1" : "#e2e8f0"}`,
        borderRadius: 10,
        background: selected ? "#eef2ff" : "#fff",
        boxShadow: selected ? "0 0 0 3px rgba(99,102,241,.12)" : "none",
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 99,
            flexShrink: 0,
            background: selected ? "#6366f1" : "#e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 800,
            color: selected ? "#fff" : "#64748b",
          }}
        >
          {(patient.public_patient_id || `#${patient.id}`)[0]}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            {patient.public_patient_id || `#${patient.id}`}
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Record ID {patient.id}
          </div>
        </div>
      </div>
      {selected && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6366f1"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function ClinicalInputForm({
  dashboardData,
  setDashboardData,
  searchBusy,
  onSearch,
  submit,
  busy,
  error,
}) {
  const d = dashboardData;
  const set = (patch) => setDashboardData((prev) => ({ ...prev, ...patch }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 900,
      }}
    >
      {/* ── Find patient ── */}
      <div
        style={{
          background: "#fff",
          border: "1.5px solid #e2e8f0",
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 22px",
            borderBottom: "1px solid #f1f5f9",
            background: "#fafafa",
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "#eef2ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
              Find patient
            </div>
            <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 1 }}>
              Search by public ID or numeric record ID
            </div>
          </div>
        </div>
        <div
          style={{
            padding: "18px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <input
              className={INPUT}
              placeholder="e.g. PT-00001 or record ID…"
              value={d.searchQ}
              onChange={(e) => set({ searchQ: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              style={{ flex: 1 }}
            />
            <Button
              variant="primary"
              loading={searchBusy}
              onClick={onSearch}
              style={{ flexShrink: 0 }}
            >
              Search
            </Button>
          </div>

          {d.searchResults?.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                maxHeight: 240,
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {d.searchResults.map((p) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  selected={d.selectedRecordId === p.id}
                  onClick={() => set({ selectedRecordId: p.id })}
                />
              ))}
            </div>
          )}

          {d.selectedRecordId && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                background: "#f0fdf4",
                border: "1.5px solid #bbf7d0",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                color: "#15803d",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Record #{d.selectedRecordId} selected
            </div>
          )}
        </div>
      </div>

      {/* ── Clinical input form ── */}
      <div
        style={{
          background: "#fff",
          border: "1.5px solid #e2e8f0",
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            padding: "16px 22px",
            borderBottom: "1px solid #f1f5f9",
            background: "#fafafa",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
              Clinical input
            </div>
            <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 1 }}>
              Complete all sections, then submit to generate the AI meal matrix.
            </div>
          </div>
          {!d.selectedRecordId && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                color: "#b45309",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
              </svg>
              Select a patient first
            </div>
          )}
        </div>

        <div
          style={{
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            maxHeight: "68vh",
            overflowY: "auto",
          }}
        >
          {/* Diagnosis */}
          <Section
            icon="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
            title="Diagnosis"
          >
            <div>
              <label className={LABEL}>Primary disease / ICD-10 label</label>
              <input
                className={INPUT}
                value={d.primaryDisease}
                onChange={(e) => set({ primaryDisease: e.target.value })}
                placeholder="e.g. PCOS, Type 2 Diabetes"
              />
            </div>
            <div>
              <label className={LABEL}>Severity</label>
              <select
                className={INPUT}
                value={d.severity}
                onChange={(e) => set({ severity: e.target.value })}
              >
                <option value="Mild">Mild</option>
                <option value="Moderate">Moderate</option>
                <option value="Severe">Severe</option>
                <option value="High">High</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>
                Comorbidities (one per line or comma-separated)
              </label>
              <textarea
                className={INPUT}
                rows={2}
                value={d.comorbiditiesText}
                onChange={(e) => set({ comorbiditiesText: e.target.value })}
                placeholder="None"
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className={LABEL}>Genetic / family risk factors</label>
              <textarea
                className={INPUT}
                rows={2}
                value={d.geneticText}
                onChange={(e) => set({ geneticText: e.target.value })}
                placeholder="Type 2 Diabetes in family history"
                style={{ resize: "vertical" }}
              />
            </div>
          </Section>

          {/* Biometric markers */}
          <Section icon="M22 12h-4l-3 9L9 3l-3 9H2" title="Biometric markers">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))",
                gap: 10,
              }}
            >
              <MetricCard
                label="Systolic BP"
                unit="mmHg"
                normalRange="90–120"
                value={d.systolic}
                onChange={(e) => set({ systolic: e.target.value })}
                placeholder="120"
              />
              <MetricCard
                label="Diastolic BP"
                unit="mmHg"
                normalRange="60–80"
                value={d.diastolic}
                onChange={(e) => set({ diastolic: e.target.value })}
                placeholder="80"
              />
              <MetricCard
                label="Fasting glucose"
                unit="mg/dL"
                normalRange="70–99"
                value={d.glucose}
                onChange={(e) => set({ glucose: e.target.value })}
                placeholder="92"
              />
              <MetricCard
                label="Total cholesterol"
                unit="mg/dL"
                normalRange="< 200"
                value={d.cholesterol}
                onChange={(e) => set({ cholesterol: e.target.value })}
                placeholder="185"
              />
            </div>
          </Section>

          {/* Body composition */}
          <Section
            icon="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            title="Body composition"
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
                gap: 10,
              }}
            >
              <MetricCard
                label="Body fat"
                unit="%"
                value={d.fatPct}
                onChange={(e) => set({ fatPct: e.target.value })}
                placeholder="22.5"
              />
              <MetricCard
                label="Water"
                unit="%"
                value={d.waterPct}
                onChange={(e) => set({ waterPct: e.target.value })}
                placeholder="55.0"
              />
              <MetricCard
                label="Muscle mass"
                unit="kg"
                value={d.muscleKg}
                onChange={(e) => set({ muscleKg: e.target.value })}
                placeholder="42.1"
              />
              <MetricCard
                label="Visceral fat"
                unit="index"
                value={d.visceral}
                onChange={(e) => set({ visceral: e.target.value })}
                placeholder="6"
              />
              <MetricCard
                label="Metabolic age"
                unit="yr"
                value={d.metabolicAge}
                onChange={(e) => set({ metabolicAge: e.target.value })}
                placeholder="24"
              />
            </div>
          </Section>

          {/* Clinical constraints */}
          <Section
            icon="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
            title="Clinical constraints"
          >
            <div>
              <label className={LABEL}>Allergies (comma or newline)</label>
              <textarea
                className={INPUT}
                rows={2}
                value={d.allergiesText}
                onChange={(e) => set({ allergiesText: e.target.value })}
                placeholder="e.g. Peanuts, Shellfish"
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className={LABEL}>Dietary restrictions</label>
              <textarea
                className={INPUT}
                rows={2}
                value={d.restrictionsText}
                onChange={(e) => set({ restrictionsText: e.target.value })}
                placeholder="e.g. Low_Sugar, Anti_Inflammatory"
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className={LABEL}>Mandatory clinical notes</label>
              <textarea
                className={INPUT}
                rows={3}
                value={d.mandatoryNotes}
                onChange={(e) => set({ mandatoryNotes: e.target.value })}
                placeholder="Prioritize high-fiber foods; avoid processed sugars…"
                style={{ resize: "vertical" }}
              />
            </div>
          </Section>
        </div>

        {/* Submit bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            padding: "16px 22px",
            borderTop: "1px solid #f1f5f9",
            background: "#fafafa",
          }}
        >
          <Button
            variant="green"
            loading={busy}
            disabled={!d.selectedRecordId}
            onClick={submit}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Submit &amp; generate plan
          </Button>
          {!d.selectedRecordId && (
            <span style={{ fontSize: 13, color: "#94a3b8" }}>
              Select a patient above to enable submission
            </span>
          )}
          {error && (
            <span
              style={{
                fontSize: 13,
                color: "#dc2626",
                fontWeight: 600,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 7,
                padding: "5px 10px",
              }}
            >
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
