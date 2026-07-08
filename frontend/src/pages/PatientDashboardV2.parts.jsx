import { useState } from "react";
import Icon from "../components/UI/Icon.jsx";
import Spinner from "../components/UI/Spinner.jsx";
import IngredientSwapModal from "../components/IngredientSwapModal.jsx";

export const Icons = {
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  calendar:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  check: "M20 6 9 17l-5-5",
  refresh:
    "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  heart:
    "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
  info: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8h.01M11 12h1v4h1",
  alert:
    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  flame:
    "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z",
  cart: "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  swap: "M16 3h5v5M4 20 21 4M21 16v5h-5M15 15l6 6M4 4l5 5",
  clock:
    "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  note: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
};

export function Btn({
  children,
  variant = "ghost",
  size = "md",
  loading,
  disabled,
  onClick,
  className = "",
}) {
  const base = "pd-btn";
  const v =
    {
      primary: "pd-btn-primary",
      ghost: "pd-btn-ghost",
      danger: "pd-btn-danger",
      green: "pd-btn-green",
    }[variant] ?? "pd-btn-ghost";
  const s = size === "sm" ? "pd-btn-sm" : size === "lg" ? "pd-btn-lg" : "";
  return (
    <button
      className={`${base} ${v} ${s} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Spinner size={14} /> : null}
      {children}
    </button>
  );
}

export function StatusPill({ status }) {
  const cfg = {
    approved: {
      bg: "#f0fdf4",
      color: "#15803d",
      border: "#bbf7d0",
      dot: "#22c55e",
      label: "Approved",
    },
    pending: {
      bg: "#fffbeb",
      color: "#b45309",
      border: "#fde68a",
      dot: "#f59e0b",
      label: "Pending Review",
    },
    draft: {
      bg: "#f8fafc",
      color: "#64748b",
      border: "#e2e8f0",
      dot: "#94a3b8",
      label: "Draft",
    },
  }[status] ?? {
    bg: "#f8fafc",
    color: "#64748b",
    border: "#e2e8f0",
    dot: "#94a3b8",
    label: status,
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 99,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: cfg.dot,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  );
}

export function DailyMacroBanner({ targetMacros }) {
  if (!targetMacros) return null;
  const { kcal, protein_g, carbs_g, fat_g } = targetMacros;
  const items = [
    {
      label: "Calories",
      value: kcal,
      unit: "kcal",
      bg: "#f0fdf4",
      color: "#15803d",
      border: "#bbf7d0",
      icon: Icons.flame,
    },
    {
      label: "Protein",
      value: protein_g,
      unit: "g",
      bg: "#eff6ff",
      color: "#1d4ed8",
      border: "#bfdbfe",
      icon: Icons.bolt,
    },
    {
      label: "Carbs",
      value: carbs_g,
      unit: "g",
      bg: "#fffbeb",
      color: "#b45309",
      border: "#fde68a",
      icon: Icons.star,
    },
    {
      label: "Fat",
      value: fat_g,
      unit: "g",
      bg: "#fef2f2",
      color: "#dc2626",
      border: "#fecaca",
      icon: Icons.heart,
    },
  ];
  return (
    <div className="pd-macro-banner">
      {items.map(({ label, value, unit, bg, color, border, icon }) => (
        <div
          key={label}
          className="pd-macro-tile"
          style={{ background: bg, borderColor: border }}
        >
          <div className="pd-macro-tile-icon" style={{ color }}>
            <Icon d={icon} size={18} />
          </div>
          <div>
            <div className="pd-macro-value" style={{ color }}>
              {value ?? "-"}
              <span className="pd-macro-unit">{unit}</span>
            </div>
            <div className="pd-macro-label">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MealTimelineRow({ meal, index }) {
  const colors = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];
  const color = colors[index % colors.length];
  return (
    <div className="pd-meal-row">
      <div className="pd-meal-time-col">
        <div
          className="pd-meal-time-badge"
          style={{ background: `${color}15`, color, borderColor: `${color}30` }}
        >
          {meal.time}
        </div>
        <div
          className="pd-meal-connector"
          style={{ background: `${color}25` }}
        />
      </div>
      <div className="pd-meal-card">
        <div className="pd-meal-name">{meal.name}</div>
        {meal.notes && <div className="pd-meal-note">{meal.notes}</div>}
        {Array.isArray(meal.foods) && meal.foods.length > 0 && (
          <div className="pd-meal-foods">
            {meal.foods.map((f, i) => (
              <div key={i} className="pd-food-row">
                <span className="pd-food-name">{f.name}</span>
                {f.portion_g && (
                  <span className="pd-food-qty">{f.portion_g}g</span>
                )}
                <div className="pd-food-macros">
                  {f.protein_g != null && (
                    <span className="pd-macro-chip blue">P {f.protein_g}g</span>
                  )}
                  {f.carbs_g != null && (
                    <span className="pd-macro-chip amber">C {f.carbs_g}g</span>
                  )}
                  {f.fat_g != null && (
                    <span className="pd-macro-chip red">F {f.fat_g}g</span>
                  )}
                  {f.kcal != null && (
                    <span className="pd-macro-chip green">{f.kcal} kcal</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DayCard({ day, dayData }) {
  const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];
  const MEAL_TIMES = {
    Breakfast: "08:00",
    Lunch: "13:00",
    Dinner: "19:00",
    Snack: "15:30",
    "Morning Snack": "15:30",
  };
  const mealColors = {
    Breakfast: "#6366f1",
    Snack: "#0ea5e9",
    "Morning Snack": "#0ea5e9",
    Lunch: "#10b981",
    Dinner: "#f59e0b",
  };

  function mealBlock(meal) {
    if (dayData?.[meal]) return dayData[meal];
    if (meal === "Snack" && dayData?.["Morning Snack"]) {
      return dayData["Morning Snack"];
    }
    return null;
  }

  return (
    <div className="pd-day-card">
      <div className="pd-day-header">
        <span className="pd-day-name">{day}</span>
        {dayData?.day_total_kcal && (
          <span className="pd-day-kcal">{dayData.day_total_kcal} kcal</span>
        )}
      </div>
      <div className="pd-day-meals">
        {MEALS.map((meal) => {
          const block = mealBlock(meal);
          const foods = block?.foods || [];
          const color = mealColors[meal];
          return (
            <div key={meal} className="pd-day-meal-block">
              <div className="pd-day-meal-header">
                <span
                  className="pd-day-meal-tag"
                  style={{
                    color,
                    background: `${color}12`,
                    borderColor: `${color}25`,
                  }}
                >
                  {MEAL_TIMES[meal]}
                </span>
                <span className="pd-day-meal-name">{meal}</span>
                {block?.meal_kcal && (
                  <span className="pd-day-meal-kcal">
                    {block.meal_kcal} kcal
                  </span>
                )}
              </div>
              {foods.length > 0 ? (
                <ul className="pd-day-food-list">
                  {foods.map((f, i) => (
                    <li key={i} className="pd-day-food-item">
                      <span className="pd-day-food-name">{f.name}</span>
                      {f.portion_g && (
                        <span className="pd-day-food-portion">
                          {f.portion_g}g
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pd-day-food-empty">-</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ShoppingList({ items, recordId, onPlanUpdated, onSwapError }) {
  const [checked, setChecked] = useState({});
  const [swapTarget, setSwapTarget] = useState(null);
  const toggle = (key) =>
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!Array.isArray(items) || items.length === 0) {
    return (
      <EmptyState
        icon={Icons.cart}
        title="No shopping list"
        subtitle="Approve a plan to see ingredients"
      />
    );
  }

  const grouped = items.reduce((acc, item) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();
  const total = items.length;
  const done = Object.values(checked).filter(Boolean).length;

  function handleSwapApplied(row, alt) {
    const oldName = swapTarget;
    setSwapTarget(null);
    if (onPlanUpdated) {
      onPlanUpdated(row, { oldName, alt });
    }
  }

  return (
    <div className="pd-shopping-wrap">
      <div className="pd-shopping-progress">
        <div className="pd-shopping-progress-bar">
          <div
            className="pd-shopping-progress-fill"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
        <span className="pd-shopping-progress-label">
          {done} / {total} items
        </span>
        {done > 0 && (
          <Btn size="sm" variant="ghost" onClick={() => setChecked({})}>
            Reset
          </Btn>
        )}
      </div>

      {categories.map((cat) => (
        <div key={cat} className="pd-shopping-group">
          <div className="pd-shopping-group-label">{cat}</div>
          {grouped[cat].map((item, i) => {
            const key = `${cat}-${item.item}-${i}`;
            const isChecked = !!checked[key];
            return (
              <div
                key={key}
                className={`pd-shopping-item ${isChecked ? "checked" : ""}`}
                onClick={() => toggle(key)}
                role="checkbox"
                aria-checked={isChecked}
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && toggle(key)}
              >
                <div className={`pd-check-box ${isChecked ? "done" : ""}`}>
                  {isChecked && (
                    <Icon d={Icons.check} size={11} strokeWidth={3} />
                  )}
                </div>
                <span className="pd-item-name">{item.item}</span>
                <span className="pd-item-qty">{item.qty}</span>
                {recordId ? (
                  <button
                    type="button"
                    className="pd-shopping-swap-btn"
                    title={`Swap ${item.item}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwapTarget(item.item);
                    }}
                  >
                    <Icon d={Icons.swap} size={13} />
                    Swap
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}

      {swapTarget && recordId ? (
        <IngredientSwapModal
          theme="pd"
          patientId={recordId}
          oldName={swapTarget}
          onClose={() => setSwapTarget(null)}
          onApplied={handleSwapApplied}
          onError={onSwapError}
        />
      ) : null}
    </div>
  );
}

export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="pd-empty">
      <div className="pd-empty-icon">
        <Icon d={icon} size={28} stroke="var(--pd-muted)" strokeWidth={1.5} />
      </div>
      <div className="pd-empty-title">{title}</div>
      {subtitle && <div className="pd-empty-subtitle">{subtitle}</div>}
    </div>
  );
}

