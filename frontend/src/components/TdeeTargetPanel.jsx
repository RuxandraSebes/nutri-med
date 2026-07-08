import { useEffect, useMemo } from "react";
import { applyGoalToTdee, calculateTDEE } from "../utils/tdee.js";

const GOALS = [
  { id: "loss", label: "Weight loss", hint: "−500 kcal / day" },
  { id: "maintenance", label: "Maintenance", hint: "Base TDEE" },
  { id: "gain", label: "Weight gain", hint: "+500 kcal / day" },
];

function MacroTile({ label, value, unit }) {
  return (
    <div className="sd-tdee-macro">
      <div className="sd-tdee-macro-label">{label}</div>
      <div className="sd-tdee-macro-value">
        {value}
        <span className="sd-tdee-macro-unit">{unit}</span>
      </div>
    </div>
  );
}

export default function TdeeTargetPanel({
  patientView,
  tdeeGoal,
  setTdeeGoal,
  onTargetsChange,
}) {
  const maintenance = useMemo(() => {
    if (!patientView) return null;
    return calculateTDEE(patientView);
  }, [patientView]);

  const active = useMemo(() => {
    if (!maintenance) return null;
    return applyGoalToTdee(maintenance, tdeeGoal || "maintenance");
  }, [maintenance, tdeeGoal]);

  useEffect(() => {
    if (active && onTargetsChange) onTargetsChange(active);
  }, [active, onTargetsChange]);

  if (!patientView) {
    return (
      <div className="sd-tdee-panel sd-tdee-panel-empty">
        Select a patient to preview calculated TDEE and caloric targets.
      </div>
    );
  }

  if (!maintenance) return null;

  return (
    <div className="sd-tdee-panel">
      <div className="sd-tdee-panel-header">
        <div>
          <div className="sd-tdee-panel-title">Caloric target (TDEE)</div>
          <div className="sd-tdee-panel-sub">
            Approve the daily energy target before generating the meal matrix.
          </div>
        </div>
        <div className="sd-tdee-base">
          <span className="sd-tdee-base-label">Base TDEE</span>
          <span className="sd-tdee-base-value">{maintenance.kcal} kcal</span>
          <span className="sd-tdee-base-meta">
            BMR {maintenance.bmr} · activity ×{maintenance.activity_factor}
          </span>
        </div>
      </div>

      <div className="sd-tdee-goal-row" role="tablist" aria-label="Weight goal">
        {GOALS.map(({ id, label, hint }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tdeeGoal === id}
            className={`sd-tdee-goal-btn ${tdeeGoal === id ? "active" : ""}`}
            onClick={() => setTdeeGoal(id)}
          >
            <span className="sd-tdee-goal-label">{label}</span>
            <span className="sd-tdee-goal-hint">{hint}</span>
          </button>
        ))}
      </div>

      {active && (
        <div className="sd-tdee-active">
          <div className="sd-tdee-kcal-hero">
            <span className="sd-tdee-kcal-num">{active.kcal}</span>
            <span className="sd-tdee-kcal-unit">kcal / day</span>
          </div>
          <div className="sd-tdee-macros">
            <MacroTile label="Protein" value={active.protein_g} unit="g" />
            <MacroTile label="Carbs" value={active.carbs_g} unit="g" />
            <MacroTile label="Fat" value={active.fat_g} unit="g" />
          </div>
          <p className="sd-tdee-footnote">
            These values are computed in the backend (tdee.js) and sent to the
            AI when you generate the plan - the AI service does not recalculate
            TDEE. Matrix: 4 meals per day; breakfast, lunch, and dinner each
            have 3 foods (protein, carb, vegetable); snack has 1 food. No food
            repeats within the same day; each food may appear at most twice in
            the week.
          </p>
        </div>
      )}
    </div>
  );
}
