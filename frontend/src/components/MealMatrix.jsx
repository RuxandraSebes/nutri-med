import { useState } from "react";
import Button from "./UI/Button.jsx";
import { StatusBadge } from "./UI/Badge.jsx";
import { inputClass, labelClass } from "./specialistStyles.js";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MEALS = ["Breakfast", "Morning Snack", "Lunch", "Dinner"];
const MEAL_TIME = {
  Breakfast: "08:00",
  "Morning Snack": "10:30",
  Lunch: "13:00",
  Dinner: "19:00",
};
const MEAL_COLOR = {
  Breakfast: { bg: "#eef2ff", color: "#6366f1", border: "#c7d2fe" },
  "Morning Snack": { bg: "#f0f9ff", color: "#0ea5e9", border: "#bae6fd" },
  Lunch: { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  Dinner: { bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
};

/* ── helpers ─────────────────────────────────────────────────────────────────── */
function parseNum(raw) {
  if (raw === "" || raw == null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function ShadBtn({
  children,
  variant = "secondary",
  size = "sm",
  disabled,
  onClick,
  className = "",
}) {
  const styles = {
    secondary: {
      background: "#f1f5f9",
      color: "#0f172a",
      border: "1.5px solid #e2e8f0",
    },
    outline: {
      background: "transparent",
      color: "#0f172a",
      border: "1.5px solid #e2e8f0",
    },
    destructive: {
      background: "#fef2f2",
      color: "#dc2626",
      border: "1.5px solid #fecaca",
    },
    primary: {
      background: "#6366f1",
      color: "#fff",
      border: "1.5px solid #6366f1",
    },
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: size === "sm" ? "6px 12px" : "9px 16px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all .15s",
        opacity: disabled ? 0.5 : 1,
        ...(styles[variant] || styles.secondary),
      }}
    >
      {children}
    </button>
  );
}

/* ── macro badges row ─────────────────────────────────────────────────────────── */
function MacroBadges({ p, c, f, kcal }) {
  const fmt = (v) => (v != null && v !== "" ? Number(v).toFixed(1) : "—");
  const fmtKcal = (v) => (v != null && v !== "" ? Number(v).toFixed(0) : "—");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
      {[
        { label: "P", val: `${fmt(p)}g`, bg: "#eff6ff", color: "#1d4ed8" },
        { label: "C", val: `${fmt(c)}g`, bg: "#fffbeb", color: "#b45309" },
        { label: "F", val: `${fmt(f)}g`, bg: "#fef2f2", color: "#dc2626" },
        { label: "kcal", val: fmtKcal(kcal), bg: "#f0fdf4", color: "#15803d" },
      ].map(({ label, val, bg, color }) => (
        <span
          key={label}
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 5,
            background: bg,
            color,
          }}
        >
          {label !== "kcal" ? `${label} ` : ""}
          {val}
          {label === "kcal" ? " kcal" : ""}
        </span>
      ))}
    </div>
  );
}

/* ── food row (editable) ──────────────────────────────────────────────────────── */
function FoodRow({ day, meal, index, food, onPatchFood }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1.5px solid #e2e8f0",
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: "0 1px 2px rgba(0,0,0,.04)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ gridColumn: "1/-1" }}>
          <label className={labelClass}>Food name</label>
          <input
            className={inputClass}
            value={food.name ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "name", e.target.value)
            }
          />
        </div>
        <div>
          <label className={labelClass}>Portion (g)</label>
          <input
            className={inputClass}
            inputMode="decimal"
            value={food.portion_g ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "portion_g", e.target.value)
            }
          />
        </div>
        <div>
          <label className={labelClass}>Note</label>
          <input
            className={inputClass}
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
          gap: 8,
          marginTop: 8,
        }}
      >
        {[
          { key: "protein_g", label: "Protein (g)" },
          { key: "carbs_g", label: "Carbs (g)" },
          { key: "fat_g", label: "Fat (g)" },
          { key: "kcal", label: "Kcal" },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className={labelClass}>{label}</label>
            <input
              className={inputClass}
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
  const inner = plan?.plan;
  const mm = inner?.meal_matrix;
  const weekly = mm?.weekly;

  function patchPlan(updater) {
    setDashboardData((d) => {
      const nextPlan =
        typeof updater === "function" ? updater(d.plan) : updater;
      return { ...d, plan: nextPlan };
    });
  }

  function onPatchFood(day, meal, foodIndex, field, raw) {
    patchPlan((p) => {
      if (!p?.plan?.meal_matrix?.weekly?.[day]?.[meal]) return p;
      const weeklyPrev = p.plan.meal_matrix.weekly;
      const dayObj = { ...weeklyPrev[day] };
      const mealObj = { ...dayObj[meal] };
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
      dayObj[meal] = mealObj;
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
      if (!p?.plan?.meal_matrix?.weekly?.[day]?.[meal]) return p;
      const weeklyPrev = p.plan.meal_matrix.weekly;
      const dayObj = {
        ...weeklyPrev[day],
        [meal]: { ...weeklyPrev[day][meal], [field]: raw },
      };
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

  if (!plan) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "60px 24px",
          background: "#fff",
          border: "1.5px dashed #e2e8f0",
          borderRadius: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "#f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          </svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
          No draft plan yet
        </div>
        <div style={{ fontSize: 13.5, color: "#94a3b8" }}>
          Use the <strong style={{ color: "#0f172a" }}>Workspace</strong> tab to
          submit clinical data and generate a meal matrix.
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
          : "pending";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        paddingBottom: 24,
      }}
    >
      {/* ── Sticky workflow bar ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "rgba(255,255,255,.95)",
          backdropFilter: "blur(8px)",
          border: "1.5px solid #e2e8f0",
          borderRadius: 16,
          boxShadow: "0 4px 16px rgba(0,0,0,.08)",
          overflow: "hidden",
        }}
      >
        {/* top row: plan info + approve/reject */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            padding: "14px 20px",
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              Plan #{plan.plan_id ?? plan.id} — specialist review
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#64748b",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {patientLabel} (record #{selectedRecordId})
              {inner?.clinical_strategy
                ? ` · ${inner.clinical_strategy.slice(0, 100)}${inner.clinical_strategy.length > 100 ? "…" : ""}`
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
            <Button
              variant="ghost"
              size="sm"
              loading={actionBusy === "reject"}
              onClick={() => decide("reject")}
              style={{ color: "#dc2626", borderColor: "#fecaca" }}
            >
              Reject
            </Button>
            <Button
              variant="warning"
              size="sm"
              loading={actionBusy === "modify"}
              onClick={() => decide("modify")}
            >
              Modify
            </Button>
            <Button
              variant="green"
              size="sm"
              loading={actionBusy === "approve"}
              onClick={() => decide("approve")}
              disabled={!!decision}
            >
              Approve &amp; publish
            </Button>
          </div>
        </div>

        {/* bottom row: draft actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
            padding: "10px 20px",
            borderTop: "1px solid #f1f5f9",
            background: "#fafafa",
          }}
        >
          <ShadBtn
            variant="secondary"
            disabled={planActionBusy}
            onClick={saveDraftToServer}
          >
            Save draft
          </ShadBtn>
          <ShadBtn
            variant="outline"
            disabled={planActionBusy}
            onClick={regenerateDraft}
          >
            Regenerate plan
          </ShadBtn>
          <ShadBtn
            variant="destructive"
            disabled={planActionBusy}
            onClick={discardDraft}
          >
            Discard draft
          </ShadBtn>
          {planActionMsg && (
            <span style={{ fontSize: 12.5, color: "#64748b", marginLeft: 4 }}>
              {planActionMsg}
            </span>
          )}
        </div>
      </div>

      {/* ── Clinical strategy ── */}
      <div
        style={{
          background: "#f5f3ff",
          border: "1.5px solid #ddd6fe",
          borderLeft: "4px solid #6366f1",
          borderRadius: 14,
          padding: "18px 22px",
          boxShadow: "0 1px 3px rgba(0,0,0,.05)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".07em",
            color: "#6366f1",
            marginBottom: 10,
          }}
        >
          Strategic guidance (clinical notes)
        </div>
        <p style={{ fontSize: 12.5, color: "#7c3aed", marginBottom: 12 }}>
          Editable summary aligned with the generated matrix; approved text may
          be visible to patients.
        </p>
        <textarea
          className={inputClass}
          style={{ minHeight: 110, borderColor: "#ddd6fe", background: "#fff" }}
          value={inner?.clinical_strategy ?? ""}
          onChange={(e) =>
            patchPlan((p) => ({
              ...p,
              plan: { ...p.plan, clinical_strategy: e.target.value },
            }))
          }
        />
      </div>

      {/* ── Supplementary LLM outputs ── */}
      {inner?.llm_outputs && (
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #e2e8f0",
            borderRadius: 14,
            padding: "20px 22px",
            boxShadow: "0 1px 3px rgba(0,0,0,.05)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#0f172a",
              marginBottom: 14,
            }}
          >
            Supplementary LLM outputs
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["clinical_logic", "Diet rules & priorities", "#6366f1"],
              ["culinary_creative", "Meal ideas", "#10b981"],
              ["rag_retrieval", "Reference guidance", "#0ea5e9"],
            ].map(([key, lbl, accent]) =>
              inner.llm_outputs[key] != null ? (
                <div
                  key={key}
                  style={{
                    borderLeft: `3px solid ${accent}`,
                    paddingLeft: 14,
                  }}
                >
                  <label className={labelClass} style={{ color: accent }}>
                    {lbl}
                  </label>
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={inner.llm_outputs[key] || ""}
                    onChange={(e) =>
                      patchPlan((p) => ({
                        ...p,
                        plan: {
                          ...p.plan,
                          llm_outputs: {
                            ...p.plan.llm_outputs,
                            [key]: e.target.value,
                          },
                        },
                      }))
                    }
                  />
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      {/* ── Weekly matrix ── */}
      {weekly ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
            gap: 16,
          }}
        >
          {DAYS.map((day) => (
            <div
              key={day}
              style={{
                background: "#fff",
                border: "1.5px solid #e2e8f0",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              }}
            >
              {/* day header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  borderBottom: "1px solid #f1f5f9",
                  background: "#fafafa",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#0f172a",
                    letterSpacing: "-.02em",
                  }}
                >
                  {day}
                </span>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  <span>Total:</span>
                  <input
                    style={{
                      width: 68,
                      textAlign: "right",
                      border: "1.5px solid #e2e8f0",
                      borderRadius: 7,
                      padding: "3px 8px",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#0f172a",
                      background: "#fff",
                      outline: "none",
                    }}
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
                  <span>kcal</span>
                </div>
              </div>

              {/* meals */}
              <div
                style={{
                  padding: "14px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {MEALS.map((meal) => {
                  const block = weekly[day]?.[meal] || { foods: [] };
                  const foods = block.foods || [];
                  const col = MEAL_COLOR[meal];
                  return (
                    <div
                      key={meal}
                      style={{
                        border: "1.5px solid #f1f5f9",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#fafafa",
                      }}
                    >
                      {/* meal header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                          padding: "10px 12px",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: 6,
                            border: `1px solid ${col.border}`,
                            background: col.bg,
                            color: col.color,
                          }}
                        >
                          <input
                            style={{
                              background: "transparent",
                              border: "none",
                              outline: "none",
                              fontSize: "inherit",
                              fontWeight: "inherit",
                              color: "inherit",
                              width: 46,
                              textAlign: "center",
                              cursor: "text",
                            }}
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
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: ".05em",
                            color: "#475569",
                          }}
                        >
                          {meal}
                        </span>
                        <div
                          style={{
                            marginLeft: "auto",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>
                            kcal
                          </span>
                          <input
                            style={{
                              width: 60,
                              border: "1.5px solid #e2e8f0",
                              borderRadius: 6,
                              padding: "2px 6px",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#0f172a",
                              background: "#fff",
                              textAlign: "right",
                              outline: "none",
                            }}
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

                      {/* food rows */}
                      <div
                        style={{
                          padding: "10px 12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
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
                              color: "#94a3b8",
                              fontStyle: "italic",
                              padding: "4px 0",
                            }}
                          >
                            No foods listed — add via regenerate.
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
        <div
          style={{
            background: "#fffbeb",
            border: "1.5px solid #fde68a",
            borderRadius: 14,
            padding: "20px 22px",
          }}
        >
          <p
            style={{
              fontSize: 13.5,
              color: "#92400e",
              marginBottom: 16,
              fontWeight: 600,
            }}
          >
            Full weekly matrix unavailable — editing flat meal preview.
            Regenerate for the 7-day grid.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {mm.meals.map((m, i) => (
              <div
                key={i}
                style={{
                  background: "#fff",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 12,
                  padding: "14px 16px",
                  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <label className={labelClass}>Time</label>
                    <input
                      className={inputClass}
                      style={{ width: 100 }}
                      value={m.time ?? ""}
                      onChange={(e) =>
                        onPatchFlatMeal(i, "time", e.target.value)
                      }
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label className={labelClass}>Meal name</label>
                    <input
                      className={inputClass}
                      value={m.name ?? ""}
                      onChange={(e) =>
                        onPatchFlatMeal(i, "name", e.target.value)
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Notes / kcal line</label>
                  <input
                    className={inputClass}
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
                        marginTop: 12,
                        borderTop: "1px solid #f1f5f9",
                        paddingTop: 12,
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
            ))}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #e2e8f0",
            borderRadius: 14,
            padding: "32px 24px",
            textAlign: "center",
            fontSize: 14,
            color: "#94a3b8",
          }}
        >
          No meal rows in this draft.
        </div>
      )}
    </div>
  );
}
