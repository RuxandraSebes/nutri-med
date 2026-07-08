import Spinner from "./UI/Spinner.jsx";
import { roundPortionG } from "../utils/portionRules.js";

export function mealKeyFor(dayData, meal) {
  if (!dayData) return meal;
  if (dayData[meal]) return meal;
  if (meal === "Snack" && dayData["Morning Snack"]) return "Morning Snack";
  return meal;
}

export function getMealBlock(dayData, meal) {
  const key = mealKeyFor(dayData, meal);
  return dayData?.[key] || { foods: [] };
}

export function parseNum(raw) {
  if (raw === "" || raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function StatusBadge({ status }) {
  const cfg = {
    pending: { cls: "sd-badge-amber", label: "Pending Review", dot: "#f59e0b" },
    approved: { cls: "sd-badge-green", label: "Approved", dot: "#22c55e" },
    rejected: { cls: "sd-badge-red", label: "Rejected", dot: "#ef4444" },
    modify: { cls: "sd-badge-amber", label: "Modify", dot: "#f59e0b" },
  }[status] ?? { cls: "sd-badge-gray", label: status, dot: "#94a3b8" };

  return (
    <span className={`sd-badge ${cfg.cls}`}>
      <span className="sd-badge-dot" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

export function Btn({ children, variant = "secondary", disabled, onClick, loading }) {
  const v =
    {
      secondary: "sd-btn-secondary",
      outline: "sd-btn-ghost",
      destructive: "sd-btn-danger",
      primary: "sd-btn-primary",
      green: "sd-btn-green",
      ghost: "sd-btn-ghost",
      warning: "sd-btn-warning",
      danger: "sd-btn-danger",
    }[variant] ?? "sd-btn-secondary";

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`sd-btn sd-btn-sm ${v}`}
    >
      {loading ? <Spinner size={13} /> : null}
      {children}
    </button>
  );
}

export function MacroBadges({ p, c, f, kcal }) {
  const fmt = (v) => (v != null && v !== "" ? Number(v).toFixed(1) : "-");
  const fmtK = (v) => (v != null && v !== "" ? Number(v).toFixed(0) : "-");
  return (
    <div className="sd-macro-badges">
      <span className="sd-macro-chip sd-macro-p">P {fmt(p)}g</span>
      <span className="sd-macro-chip sd-macro-c">C {fmt(c)}g</span>
      <span className="sd-macro-chip sd-macro-f">F {fmt(f)}g</span>
      <span className="sd-macro-chip sd-macro-kcal">{fmtK(kcal)} kcal</span>
    </div>
  );
}

export function FoodRow({ day, meal, index, food, onPatchFood }) {
  return (
    <div className="sd-food-row">
      <div
        className="sd-food-grid-2"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}
      >
        <div style={{ gridColumn: "1/-1" }}>
          <label className="sd-label">Food name</label>
          <input
            className="sd-input"
            value={food.name ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "name", e.target.value)
            }
          />
        </div>
        <div>
          <label className="sd-label">Portion (g)</label>
          <input
            className="sd-input"
            inputMode="decimal"
            value={food.portion_g ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "portion_g", e.target.value)
            }
            onBlur={(e) => {
              const rounded = roundPortionG(food.name, e.target.value);
              if (rounded && rounded !== Number(food.portion_g)) {
                onPatchFood(day, meal, index, "portion_g", String(rounded));
              }
            }}
          />
        </div>
        <div>
          <label className="sd-label">Note</label>
          <input
            className="sd-input"
            value={food.notes ?? food.note ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "notes", e.target.value)
            }
          />
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 7,
          marginTop: 7,
        }}
      >
        {[
          { key: "protein_g", label: "Protein (g)" },
          { key: "carbs_g", label: "Carbs (g)" },
          { key: "fat_g", label: "Fat (g)" },
          { key: "kcal", label: "Kcal" },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="sd-label">{label}</label>
            <input
              className="sd-input"
              inputMode="decimal"
              value={food[key] ?? ""}
              onChange={(e) =>
                onPatchFood(day, meal, index, key, e.target.value)
              }
            />
          </div>
        ))}
      </div>
      <MacroBadges
        p={food.protein_g}
        c={food.carbs_g}
        f={food.fat_g}
        kcal={food.kcal}
      />
    </div>
  );
}
