import { useState } from "react";

import TdeeTargetPanel from "./TdeeTargetPanel.jsx";

function Icon({ d, size = 15, stroke = "#6366f1", sw = 2.2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  check: "M20 6 9 17l-5-5",
  alert:
    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  diag: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2",
  pulse: "M22 12h-4l-3 9L9 3l-3 9H2",
  body: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
  notes:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
};

function Section({ iconPath, title, children }) {
  return (
    <div className="sd-section">
      <div className="sd-section-head">
        <div className="sd-section-icon">
          <Icon d={iconPath} size={14} />
        </div>
        <span className="sd-section-title">{title}</span>
      </div>
      <div className="sd-section-body">{children}</div>
    </div>
  );
}

function MetricCard({
  label,
  unit,
  value,
  onChange,
  placeholder,
  normalRange,
}) {
  return (
    <div className="sd-metric-card">
      <div className="sd-metric-label">{label}</div>
      <div className="sd-metric-input-row">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="sd-metric-input"
        />
        {unit && <span className="sd-metric-unit">{unit}</span>}
      </div>
      {normalRange && (
        <div className="sd-metric-range">Normal: {normalRange}</div>
      )}
    </div>
  );
}

function PatientRow({ patient, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sd-patient-row ${selected ? "selected" : ""}`}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          className="sd-patient-avatar"
          style={{
            background: selected ? "#6366f1" : "#e2e8f0",
            color: selected ? "#fff" : "#64748b",
          }}
        >
          {(patient.public_patient_id || `#${patient.id}`)[0]}
        </div>
        <div style={{ textAlign: "left" }}>
          <div
            style={{ fontSize: 13.5, fontWeight: 700, color: "var(--sd-text)" }}
          >
            {patient.public_patient_id || `#${patient.id}`}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--sd-text-3)" }}>
            Record ID {patient.id}
          </div>
        </div>
      </div>
      {selected && <Icon d={ICONS.check} size={15} stroke="#6366f1" sw={2.5} />}
    </button>
  );
}

export default function ClinicalInputForm({
  dashboardData,
  setDashboardData,
  searchBusy,
  onSearch,
  submit,
  busy,
  error,
  tdeeGoal,
  setTdeeGoal,
  onTdeeTargetsChange,
}) {
  const d = dashboardData;
  const set = (patch) => setDashboardData((prev) => ({ ...prev, ...patch }));

  return (
    <div className="sd-clinical-inner">
      <div className="sd-card">
        <div className="sd-card-header">
          <div className="sd-card-icon">
            <Icon d={ICONS.search} size={15} />
          </div>
          <div>
            <div className="sd-card-title">Find patient</div>
            <div className="sd-card-subtitle">
              Search by public ID or numeric record ID
            </div>
          </div>
        </div>

        <div className="sd-card-body">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="sd-input"
              placeholder="e.g. PT-00001 or record ID…"
              value={d.searchQ}
              onChange={(e) => set({ searchQ: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="sd-btn sd-btn-primary"
              onClick={onSearch}
              disabled={searchBusy}
              style={{ flexShrink: 0 }}
            >
              {searchBusy ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="sd-spin"
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity=".2" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
              ) : null}
              Search
            </button>
          </div>

          {d.searchResults?.length > 0 && (
            <div className="sd-patient-results">
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
                padding: "9px 13px",
                background: "#f0fdf4",
                border: "1.5px solid #bbf7d0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                color: "#15803d",
              }}
            >
              <Icon d={ICONS.check} size={14} stroke="#22c55e" sw={2.5} />
              Record #{d.selectedRecordId} selected
              {(d.plan?.plan?.meal_matrix?.weekly ||
                d.plan?.meal_matrix?.weekly) &&
                " · meal plan loaded"}
            </div>
          )}
        </div>
      </div>

      <div className="sd-card">
        <div className="sd-card-header">
          <div className="sd-card-icon">
            <Icon d={ICONS.diag} size={15} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="sd-card-title">Clinical input</div>
            <div className="sd-card-subtitle">
              Complete all sections · AI generates meal matrix on submit
            </div>
          </div>
          {!d.selectedRecordId && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 7,
                padding: "5px 11px",
                fontSize: 12,
                fontWeight: 600,
                color: "#b45309",
              }}
            >
              <Icon d={ICONS.alert} size={12} stroke="#f59e0b" />
              Select a patient first
            </span>
          )}
        </div>

        <div className="sd-card-body">
          <Section iconPath={ICONS.diag} title="Diagnosis">
            <div>
              <label className="sd-label">Primary disease / ICD-10 label</label>
              <input
                className="sd-input"
                value={d.primaryDisease}
                onChange={(e) => set({ primaryDisease: e.target.value })}
                placeholder="e.g. PCOS, Type 2 Diabetes"
              />
            </div>
            <div>
              <label className="sd-label">Severity</label>
              <select
                className="sd-input"
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
              <label className="sd-label">
                Comorbidities (one per line or comma-separated)
              </label>
              <textarea
                className="sd-input"
                rows={2}
                value={d.comorbiditiesText}
                onChange={(e) => set({ comorbiditiesText: e.target.value })}
                placeholder="None"
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className="sd-label">Genetic / family risk factors</label>
              <textarea
                className="sd-input"
                rows={2}
                value={d.geneticText}
                onChange={(e) => set({ geneticText: e.target.value })}
                placeholder="Type 2 Diabetes in family history"
                style={{ resize: "vertical" }}
              />
            </div>
          </Section>

          <Section iconPath={ICONS.pulse} title="Biometric markers">
            <div className="sd-metric-grid">
              <MetricCard
                label="Systolic BP"
                unit="mmHg"
                normalRange="90-120"
                value={d.systolic}
                onChange={(e) => set({ systolic: e.target.value })}
                placeholder="120"
              />
              <MetricCard
                label="Diastolic BP"
                unit="mmHg"
                normalRange="60-80"
                value={d.diastolic}
                onChange={(e) => set({ diastolic: e.target.value })}
                placeholder="80"
              />
              <MetricCard
                label="Fasting glucose"
                unit="mg/dL"
                normalRange="70-99"
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

          <Section iconPath={ICONS.body} title="Body composition">
            <div className="sd-metric-grid">
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

          <Section iconPath={ICONS.notes} title="Clinical constraints">
            <div>
              <label className="sd-label">Allergies (comma or newline)</label>
              <textarea
                className="sd-input"
                rows={2}
                value={d.allergiesText}
                onChange={(e) => set({ allergiesText: e.target.value })}
                placeholder="e.g. Peanuts, Shellfish"
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className="sd-label">Dietary restrictions</label>
              <textarea
                className="sd-input"
                rows={2}
                value={d.restrictionsText}
                onChange={(e) => set({ restrictionsText: e.target.value })}
                placeholder="e.g. Low_Sugar, Anti_Inflammatory"
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className="sd-label">Mandatory clinical notes</label>
              <textarea
                className="sd-input"
                rows={3}
                value={d.mandatoryNotes}
                onChange={(e) => set({ mandatoryNotes: e.target.value })}
                placeholder="Prioritise high-fibre foods; avoid processed sugars…"
                style={{ resize: "vertical" }}
              />
            </div>
          </Section>

          <TdeeTargetPanel
            patientView={d.patientView}
            tdeeGoal={tdeeGoal}
            setTdeeGoal={setTdeeGoal}
            onTargetsChange={onTdeeTargetsChange}
          />
        </div>

        <div className="sd-card-footer">
          <button
            type="button"
            className="sd-btn sd-btn-green"
            disabled={!d.selectedRecordId || busy}
            onClick={submit}
          >
            {busy ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="sd-spin"
              >
                <circle cx="12" cy="12" r="10" strokeOpacity=".2" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : (
              <Icon d={ICONS.bolt} size={14} stroke="currentColor" />
            )}
            Submit &amp; generate plan
          </button>

          {!d.selectedRecordId && (
            <span style={{ fontSize: 12.5, color: "var(--sd-text-3)" }}>
              Select a patient above to enable submission
            </span>
          )}

          {error && (
            <span
              style={{
                fontSize: 12.5,
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
