import { useState } from "react";

/* ── Icon helper ────────────────────────────────────────────────────────── */
function Icon({ d, size = 15, stroke = "currentColor", sw = 2 }) {
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

const I = {
  check: "M20 6 9 17l-5-5",
  calendar:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  regen:
    "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
};

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];
const MEAL_TIME = {
  Breakfast: "08:00",
  Lunch: "13:00",
  Dinner: "19:00",
  Snack: "15:30",
  "Morning Snack": "15:30",
};
const MEAL_COLOR = {
  Breakfast: { bg: "#eef2ff", color: "#6366f1", border: "#c7d2fe" },
  Snack: { bg: "#f0f9ff", color: "#0ea5e9", border: "#bae6fd" },
  "Morning Snack": { bg: "#f0f9ff", color: "#0ea5e9", border: "#bae6fd" },
  Lunch: { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  Dinner: { bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
};

function mealKeyFor(dayData, meal) {
  if (!dayData) return meal;
  if (dayData[meal]) return meal;
  if (meal === "Snack" && dayData["Morning Snack"]) return "Morning Snack";
  return meal;
}

function getMealBlock(dayData, meal) {
  const key = mealKeyFor(dayData, meal);
  return dayData?.[key] || { foods: [] };
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
function parseNum(raw) {
  if (raw === "" || raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function Spinner({ size = 13 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="sd-spin"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity=".2" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

/* ── Status badge ────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
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

/* ── Action button ───────────────────────────────────────────────────────── */
function Btn({ children, variant = "secondary", disabled, onClick, loading }) {
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
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

/* ── Macro badges ────────────────────────────────────────────────────────── */
function MacroBadges({ p, c, f, kcal }) {
  const fmt = (v) => (v != null && v !== "" ? Number(v).toFixed(1) : "—");
  const fmtK = (v) => (v != null && v !== "" ? Number(v).toFixed(0) : "—");
  return (
    <div className="sd-macro-badges">
      <span className="sd-macro-chip sd-macro-p">P {fmt(p)}g</span>
      <span className="sd-macro-chip sd-macro-c">C {fmt(c)}g</span>
      <span className="sd-macro-chip sd-macro-f">F {fmt(f)}g</span>
      <span className="sd-macro-chip sd-macro-kcal">{fmtK(kcal)} kcal</span>
    </div>
  );
}

/* ── Food row (editable) ─────────────────────────────────────────────────── */
function FoodRow({ day, meal, index, food, onPatchFood }) {
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

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function MealMatrix({
  dashboardData,
  setDashboardData,
  selectedRecordId,
  patientLabel,
  onDecision,
  onApprove,
  onApproveError,
  planActionBusy,
  planActionMsg,
  saveDraftToServer,
  regenerateDraft,
  discardDraft,
}) {
  const [actionBusy, setActionBusy] = useState(null);

  const plan = dashboardData.plan;
  const decision = dashboardData.decision;
  const inner = plan?.plan ?? plan;
  const mm = inner?.meal_matrix ?? plan?.meal_matrix;
  const weekly = mm?.weekly;
  const apiStatus = plan?.status ?? inner?.status;
  const isPublished = apiStatus === "approved";

  function patchPlan(updater) {
    setDashboardData((d) => {
      const nextPlan =
        typeof updater === "function" ? updater(d.plan) : updater;
      return { ...d, plan: nextPlan };
    });
  }

  function onPatchFood(day, meal, foodIndex, field, raw) {
    patchPlan((p) => {
      const weeklyPrev = p.plan?.meal_matrix?.weekly;
      const dayPrev = weeklyPrev?.[day];
      const mk = mealKeyFor(dayPrev, meal);
      if (!dayPrev?.[mk]) return p;
      const dayObj = { ...dayPrev };
      const mealObj = { ...dayObj[mk] };
      const foods = [...(mealObj.foods || [])];
      const prev = foods[foodIndex] || {};
      let nextVal = raw;
      if (
        ["portion_g", "kcal", "protein_g", "carbs_g", "fat_g"].includes(field)
      ) {
        nextVal =
          raw === ""
            ? 0
            : Number.isFinite(Number(raw))
              ? Math.round(Number(raw) * 100) / 100
              : prev[field];
      }
      foods[foodIndex] = { ...prev, [field]: nextVal };
      mealObj.foods = foods;
      mealObj.meal_kcal =
        Math.round(foods.reduce((s, f) => s + parseNum(f.kcal), 0) * 10) / 10;
      dayObj[mk] = mealObj;
      let dayTotal = 0;
      for (const m of MEALS) dayTotal += parseNum(dayObj[m]?.meal_kcal);
      dayObj.day_total_kcal = Math.round(dayTotal * 10) / 10;
      return {
        ...p,
        plan: {
          ...p.plan,
          meal_matrix: {
            ...p.plan.meal_matrix,
            weekly: { ...weeklyPrev, [day]: dayObj },
          },
        },
      };
    });
  }

  function onPatchMealMeta(day, meal, field, raw) {
    patchPlan((p) => {
      const w = p.plan?.meal_matrix?.weekly;
      const dayPrev = w?.[day];
      const mk = mealKeyFor(dayPrev, meal);
      if (!dayPrev?.[mk]) return p;
      const dayObj = { ...dayPrev, [mk]: { ...dayPrev[mk], [field]: raw } };
      return {
        ...p,
        plan: {
          ...p.plan,
          meal_matrix: {
            ...p.plan.meal_matrix,
            weekly: { ...w, [day]: dayObj },
          },
        },
      };
    });
  }

  function onPatchFlatMeal(i, field, raw) {
    patchPlan((p) => {
      const matrix = p.plan.meal_matrix;
      const meals = [...(matrix.meals || [])];
      meals[i] = { ...meals[i], [field]: raw };
      return { ...p, plan: { ...p.plan, meal_matrix: { ...matrix, meals } } };
    });
  }

  async function decide(action) {
    if (action === "approve") {
      setActionBusy("approve");
      try {
        if (onApprove) await onApprove();
        onDecision("approve");
      } catch (e) {
        if (onApproveError) onApproveError(e);
        else console.error(e);
      } finally {
        setActionBusy(null);
      }
      return;
    }
    setActionBusy(action);
    await new Promise((r) => setTimeout(r, 200));
    onDecision(action);
    setActionBusy(null);
  }

  /* ── empty state ── */
  if (!plan || !weekly) {
    return (
      <div className="sd-empty">
        <div className="sd-empty-icon">
          <Icon d={I.calendar} size={26} stroke="#94a3b8" sw={1.5} />
        </div>
        <div className="sd-empty-title">
          {selectedRecordId ? "No meal plan yet" : "Select a patient"}
        </div>
        <div className="sd-empty-sub">
          {selectedRecordId ? (
            <>
              This patient has no saved meal matrix. Use the{" "}
              <strong>Workspace</strong> tab to set clinical data and generate a
              plan.
            </>
          ) : (
            <>Choose a patient from the Workspace tab to load their plan.</>
          )}
        </div>
      </div>
    );
  }

  const status =
    decision === "approve"
      ? "approved"
      : decision === "reject"
        ? "rejected"
        : decision === "modify"
          ? "modify"
          : apiStatus || "pending";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        paddingBottom: 24,
      }}
    >
      {/* ── Sticky workflow bar ── */}
      <div className="sd-sticky-bar">
        {/* Top row: plan info + approve/reject */}
        <div className="sd-sticky-bar-top">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{ fontSize: 14, fontWeight: 700, color: "var(--sd-text)" }}
            >
              Plan #{plan.plan_id ?? plan.id} — specialist review
            </div>
            <div className="sd-sticky-plan-meta">
              {patientLabel} (record #{selectedRecordId})
              {inner?.clinical_strategy
                ? ` · ${inner.clinical_strategy.slice(0, 200)}${inner.clinical_strategy.length > 200 ? "…" : ""}`
                : ""}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <StatusBadge status={status} />
            <Btn
              variant="danger"
              loading={actionBusy === "reject"}
              onClick={() => decide("reject")}
            >
              Reject
            </Btn>
            <Btn
              variant="warning"
              loading={actionBusy === "modify"}
              onClick={() => decide("modify")}
            >
              Modify
            </Btn>
            <Btn
              variant="green"
              loading={actionBusy === "approve"}
              onClick={() => decide("approve")}
              disabled={!!decision || isPublished}
            >
              <Icon d={I.check} size={13} stroke="currentColor" sw={2.5} />
              {isPublished ? "Published" : "Approve & publish"}
            </Btn>
          </div>
        </div>

        {/* Bottom row: draft actions */}
        <div className="sd-sticky-bar-bottom">
          <Btn
            variant="secondary"
            disabled={planActionBusy}
            onClick={saveDraftToServer}
          >
            <Icon d={I.save} size={12} stroke="currentColor" />
            {isPublished ? "Save changes" : "Save draft"}
          </Btn>
          <Btn
            variant="outline"
            disabled={planActionBusy}
            onClick={regenerateDraft}
          >
            <Icon d={I.regen} size={12} stroke="currentColor" />
            Regenerate plan
          </Btn>
          <Btn
            variant="destructive"
            disabled={planActionBusy || isPublished}
            onClick={discardDraft}
          >
            <Icon d={I.trash} size={12} stroke="currentColor" />
            Discard draft
          </Btn>
          {planActionMsg && (
            <span
              style={{ fontSize: 12, color: "var(--sd-text-2)", marginLeft: 4 }}
            >
              {planActionMsg}
            </span>
          )}
        </div>
      </div>

      {/* ── Approved caloric target ── */}
      {inner?.target_macros && (
        <div className="sd-tdee-panel sd-tdee-panel-compact">
          <div className="sd-tdee-panel-header">
            <div>
              <div className="sd-tdee-panel-title">Approved caloric target</div>
              <div className="sd-tdee-panel-sub">
                Used for this matrix generation
              </div>
            </div>
            <div className="sd-tdee-kcal-hero">
              <span className="sd-tdee-kcal-num">{inner.target_macros.kcal}</span>
              <span className="sd-tdee-kcal-unit">kcal / day</span>
            </div>
          </div>
          <div className="sd-tdee-macros">
            <div className="sd-tdee-macro">
              <div className="sd-tdee-macro-label">Protein</div>
              <div className="sd-tdee-macro-value">
                {inner.target_macros.protein_g}
                <span className="sd-tdee-macro-unit">g</span>
              </div>
            </div>
            <div className="sd-tdee-macro">
              <div className="sd-tdee-macro-label">Carbs</div>
              <div className="sd-tdee-macro-value">
                {inner.target_macros.carbs_g}
                <span className="sd-tdee-macro-unit">g</span>
              </div>
            </div>
            <div className="sd-tdee-macro">
              <div className="sd-tdee-macro-label">Fat</div>
              <div className="sd-tdee-macro-value">
                {inner.target_macros.fat_g}
                <span className="sd-tdee-macro-unit">g</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Clinical strategy ── */}
      <div className="sd-strategy-box">
        <div className="sd-strategy-eyebrow">
          Strategic guidance (clinical notes)
        </div>
        <p style={{ fontSize: 12, color: "#7c3aed", marginBottom: 10 }}>
          Editable summary aligned with the matrix · approved text visible to
          patients.
        </p>
        <textarea
          className="sd-input"
          style={{ minHeight: 100, borderColor: "#ddd6fe", background: "#fff" }}
          value={inner?.clinical_strategy ?? ""}
          onChange={(e) =>
            patchPlan((p) => ({
              ...p,
              plan: { ...p.plan, clinical_strategy: e.target.value },
            }))
          }
        />
      </div>

      {/* ── Weekly matrix grid ── */}
      {weekly ? (
        <div className="sd-week-grid">
          {DAYS.map((day) => (
            <div key={day} className="sd-day-card">
              {/* Day header */}
              <div className="sd-day-header">
                <span className="sd-day-name">{day}</span>
                <div className="sd-day-kcal-input">
                  <span style={{ fontSize: 11, color: "var(--sd-text-3)" }}>
                    total
                  </span>
                  <input
                    className="sd-inline-input"
                    style={{ width: 64 }}
                    value={weekly[day]?.day_total_kcal ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchPlan((p) => {
                        const w = p.plan.meal_matrix.weekly;
                        const dayObj = {
                          ...w[day],
                          day_total_kcal: v === "" ? "" : Number(v),
                        };
                        return {
                          ...p,
                          plan: {
                            ...p.plan,
                            meal_matrix: {
                              ...p.plan.meal_matrix,
                              weekly: { ...w, [day]: dayObj },
                            },
                          },
                        };
                      });
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--sd-text-3)" }}>
                    kcal
                  </span>
                </div>
              </div>

              {/* Meals */}
              <div className="sd-day-meals">
                {MEALS.map((meal) => {
                  const block = getMealBlock(weekly[day], meal);
                  const foods = block.foods || [];
                  const col = MEAL_COLOR[meal];
                  return (
                    <div key={meal} className="sd-meal-block">
                      {/* Meal header */}
                      <div className="sd-meal-block-header">
                        <span
                          className="sd-meal-time-badge"
                          style={{
                            background: col.bg,
                            color: col.color,
                            borderColor: col.border,
                          }}
                        >
                          <input
                            className="sd-transparent-input"
                            style={{ width: 44 }}
                            value={block.slot_time ?? MEAL_TIME[meal] ?? ""}
                            onChange={(e) =>
                              onPatchMealMeta(
                                day,
                                meal,
                                "slot_time",
                                e.target.value,
                              )
                            }
                            aria-label={`${day} ${meal} time`}
                          />
                        </span>
                        <span className="sd-meal-type-label">{meal}</span>
                        <div
                          style={{
                            marginLeft: "auto",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10.5,
                              color: "var(--sd-text-3)",
                            }}
                          >
                            kcal
                          </span>
                          <input
                            className="sd-inline-input"
                            style={{ width: 56 }}
                            inputMode="decimal"
                            value={block.meal_kcal ?? ""}
                            onChange={(e) =>
                              onPatchMealMeta(
                                day,
                                meal,
                                "meal_kcal",
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value),
                              )
                            }
                          />
                        </div>
                      </div>

                      {/* Food rows */}
                      <div className="sd-meal-body">
                        {foods.length > 0 ? (
                          foods.map((food, idx) => (
                            <FoodRow
                              key={`${day}-${meal}-${idx}`}
                              day={day}
                              meal={meal}
                              index={idx}
                              food={food}
                              onPatchFood={onPatchFood}
                            />
                          ))
                        ) : (
                          <p
                            style={{
                              fontSize: 12,
                              color: "var(--sd-text-3)",
                              fontStyle: "italic",
                              padding: "4px 0",
                            }}
                          >
                            No foods listed — regenerate for data.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : mm?.meals?.length ? (
        /* ── Flat meals fallback ── */
        <div>
          <div className="sd-flat-warning">
            Full weekly matrix unavailable — editing flat meal preview.
            Regenerate for the 7-day grid.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {mm.meals.map((m, i) => (
              <div key={i} className="sd-card">
                <div className="sd-card-body">
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ width: 100 }}>
                      <label className="sd-label">Time</label>
                      <input
                        className="sd-input"
                        value={m.time ?? ""}
                        onChange={(e) =>
                          onPatchFlatMeal(i, "time", e.target.value)
                        }
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label className="sd-label">Meal name</label>
                      <input
                        className="sd-input"
                        value={m.name ?? ""}
                        onChange={(e) =>
                          onPatchFlatMeal(i, "name", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="sd-label">Notes / kcal line</label>
                    <input
                      className="sd-input"
                      value={m.notes ?? ""}
                      onChange={(e) =>
                        onPatchFlatMeal(i, "notes", e.target.value)
                      }
                    />
                  </div>
                  {Array.isArray(m.foods) &&
                    m.foods.map((food, fi) => (
                      <div
                        key={fi}
                        style={{
                          marginTop: 10,
                          borderTop: "1px solid var(--sd-border-light)",
                          paddingTop: 10,
                        }}
                      >
                        <FoodRow
                          day="Preview"
                          meal={String(i)}
                          index={fi}
                          food={food}
                          onPatchFood={(day, meal, idx, field, raw) => {
                            patchPlan((p) => {
                              const mealsArr = [
                                ...(p.plan.meal_matrix.meals || []),
                              ];
                              const row = { ...mealsArr[i] };
                              const fods = [...(row.foods || [])];
                              const prev = fods[idx] || {};
                              let nextVal = raw;
                              if (
                                [
                                  "portion_g",
                                  "kcal",
                                  "protein_g",
                                  "carbs_g",
                                  "fat_g",
                                ].includes(field)
                              ) {
                                nextVal =
                                  raw === ""
                                    ? 0
                                    : Number.isFinite(Number(raw))
                                      ? Math.round(Number(raw) * 100) / 100
                                      : prev[field];
                              }
                              fods[idx] = { ...prev, [field]: nextVal };
                              row.foods = fods;
                              mealsArr[i] = row;
                              return {
                                ...p,
                                plan: {
                                  ...p.plan,
                                  meal_matrix: {
                                    ...p.plan.meal_matrix,
                                    meals: mealsArr,
                                  },
                                },
                              };
                            });
                          }}
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="sd-empty">
          <div className="sd-empty-icon">
            <Icon d={I.calendar} size={26} stroke="#94a3b8" sw={1.5} />
          </div>
          <div className="sd-empty-title">No meal rows in this draft</div>
          <div className="sd-empty-sub">
            Regenerate to populate the meal matrix.
          </div>
        </div>
      )}
    </div>
  );
}
