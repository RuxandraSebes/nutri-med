import { useState } from "react";
import Button from "./UI/Button.jsx";
import { StatusBadge } from "./UI/Badge.jsx";
import { Button as ShadButton } from "@/components/shadcn/button.jsx";
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

function MacroBadges({ p, c, f, kcal }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-blue-100 text-blue-700">
        P {p != null && p !== "" ? Number(p).toFixed(1) : "—"}g
      </span>
      <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-amber-100 text-amber-700">
        C {c != null && c !== "" ? Number(c).toFixed(1) : "—"}g
      </span>
      <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-red-100 text-red-700">
        F {f != null && f !== "" ? Number(f).toFixed(1) : "—"}g
      </span>
      <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-emerald-100 text-emerald-700">
        {kcal != null && kcal !== "" ? Number(kcal).toFixed(0) : "—"} kcal
      </span>
    </div>
  );
}

function FoodRow({ day, meal, index, food, onPatchFood }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={labelClass}>Food name</span>
          <input
            className={inputClass}
            value={food.name ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "name", e.target.value)
            }
          />
        </label>
        <label className="block">
          <span className={labelClass}>Portion (g)</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={food.portion_g ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "portion_g", e.target.value)
            }
          />
        </label>
        <label className="block">
          <span className={labelClass}>Clinical / prep note</span>
          <input
            className={inputClass}
            value={food.notes ?? food.note ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "notes", e.target.value)
            }
          />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block">
          <span className={labelClass}>Protein (g)</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={food.protein_g ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "protein_g", e.target.value)
            }
          />
        </label>
        <label className="block">
          <span className={labelClass}>Carbs (g)</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={food.carbs_g ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "carbs_g", e.target.value)
            }
          />
        </label>
        <label className="block">
          <span className={labelClass}>Fat (g)</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={food.fat_g ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "fat_g", e.target.value)
            }
          />
        </label>
        <label className="block">
          <span className={labelClass}>Energy (kcal)</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={food.kcal ?? ""}
            onChange={(e) =>
              onPatchFood(day, meal, index, "kcal", e.target.value)
            }
          />
        </label>
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

/**
 * Tab 3: editable weekly meal matrix, clinical strategy, sticky workflow actions.
 */
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

  function parseNum(raw) {
    if (raw === "" || raw == null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function onPatchFood(day, meal, foodIndex, field, raw) {
    patchPlan((p) => {
      if (!p?.plan?.meal_matrix?.weekly?.[day]?.[meal]) return p;
      const weeklyPrev = p.plan.meal_matrix.weekly;
      const dayObj = { ...weeklyPrev[day] };
      const mealObj = { ...dayObj[meal] };
      const foods = [...(mealObj.foods || [])];
      const prevFood = foods[foodIndex] || {};
      let nextVal = raw;
      if (
        ["portion_g", "kcal", "protein_g", "carbs_g", "fat_g"].includes(field)
      ) {
        nextVal =
          raw === ""
            ? 0
            : Number.isFinite(Number(raw))
              ? Math.round(Number(raw) * 100) / 100
              : prevFood[field];
      }
      foods[foodIndex] = { ...prevFood, [field]: nextVal };
      mealObj.foods = foods;
      const mealKcal = foods.reduce(
        (s, f) => s + parseNum(f.kcal),
        0,
      );
      mealObj.meal_kcal = Math.round(mealKcal * 10) / 10;
      dayObj[meal] = mealObj;
      let dayTotal = 0;
      for (const m of MEALS) {
        dayTotal += parseNum(dayObj[m]?.meal_kcal);
      }
      dayObj.day_total_kcal = Math.round(dayTotal * 10) / 10;
      const nextWeekly = { ...weeklyPrev, [day]: dayObj };
      return {
        ...p,
        plan: {
          ...p.plan,
          meal_matrix: {
            ...p.plan.meal_matrix,
            weekly: nextWeekly,
          },
        },
      };
    });
  }

  function onPatchMealMeta(day, meal, field, raw) {
    patchPlan((p) => {
      if (!p?.plan?.meal_matrix?.weekly?.[day]?.[meal]) return p;
      const weeklyPrev = p.plan.meal_matrix.weekly;
      const dayObj = { ...weeklyPrev[day] };
      const mealObj = { ...dayObj[meal], [field]: raw };
      dayObj[meal] = mealObj;
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
      const row = { ...meals[i], [field]: raw };
      meals[i] = row;
      return {
        ...p,
        plan: {
          ...p.plan,
          meal_matrix: { ...matrix, meals },
        },
      };
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
    await new Promise((r) => setTimeout(r, 300));
    onDecision(action);
    setActionBusy(null);
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-6xl rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-sm text-slate-600">
          No draft plan yet. Use{" "}
          <strong className="text-slate-900">Workspace</strong> to submit
          clinical data and generate a meal matrix.
        </p>
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-24">
      {/* Sticky workflow bar */}
      <div className="sticky top-0 z-30 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:mx-0 md:rounded-xl md:border md:border-slate-200">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">
              Plan #{plan.plan_id ?? plan.id} — specialist review
            </div>
            <div className="truncate text-xs text-slate-500">
              {patientLabel} (record #{selectedRecordId}) ·{" "}
              {(inner?.clinical_strategy || "").slice(0, 120)}
              {(inner?.clinical_strategy || "").length > 120 ? "…" : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <Button
              variant="ghost"
              size="sm"
              loading={actionBusy === "reject"}
              onClick={() => decide("reject")}
              className="text-red-600"
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
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <ShadButton
            type="button"
            variant="secondary"
            size="sm"
            disabled={planActionBusy}
            onClick={saveDraftToServer}
          >
            Save draft
          </ShadButton>
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            disabled={planActionBusy}
            onClick={regenerateDraft}
          >
            Regenerate plan
          </ShadButton>
          <ShadButton
            type="button"
            variant="destructive"
            size="sm"
            disabled={planActionBusy}
            onClick={discardDraft}
          >
            Discard draft
          </ShadButton>
          {planActionMsg ? (
            <span className="text-xs text-slate-500">{planActionMsg}</span>
          ) : null}
        </div>
      </div>

      {/* Strategic guidance */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-6 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-900">
          Strategic guidance (clinical notes)
        </h3>
        <p className="mt-1 text-xs text-indigo-700/90">
          Editable summary aligned with the generated matrix; patients may see
          approved strategy text.
        </p>
        <textarea
          className={`${inputClass} mt-4 min-h-[120px] border-indigo-200 bg-white`}
          value={inner?.clinical_strategy ?? ""}
          onChange={(e) =>
            patchPlan((p) => ({
              ...p,
              plan: {
                ...p.plan,
                clinical_strategy: e.target.value,
              },
            }))
          }
        />
      </div>

      {/* Optional llm_outputs — keep editable textareas */}
      {inner?.llm_outputs && (
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">
            Supplementary LLM outputs
          </h3>
          {[
            ["clinical_logic", "Diet rules & priorities"],
            ["culinary_creative", "Meal ideas"],
            ["rag_retrieval", "Reference guidance"],
          ].map(([key, lbl]) =>
            inner.llm_outputs[key] != null ? (
              <label key={key} className="block">
                <span className={labelClass}>{lbl}</span>
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
              </label>
            ) : null,
          )}
        </div>
      )}

      {/* Weekly matrix */}
      {weekly ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DAYS.map((day) => (
            <div
              key={day}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-base font-bold text-slate-900">{day}</h4>
                <span className="text-xs font-medium text-slate-500">
                  Day total:{" "}
                  <input
                    className="ml-1 w-20 rounded border border-slate-200 px-1.5 py-0.5 text-right text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500"
                    value={weekly[day]?.day_total_kcal ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchPlan((p) => {
                        const w = p.plan.meal_matrix.weekly;
                        const dayObj = { ...w[day], day_total_kcal: v === "" ? "" : Number(v) };
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
                  />{" "}
                  kcal
                </span>
              </div>
              <div className="flex flex-col gap-5">
                {MEALS.map((meal) => {
                  const block = weekly[day]?.[meal] || { foods: [] };
                  const foods = block.foods || [];
                  return (
                    <div
                      key={meal}
                      className="rounded-lg border border-slate-100 bg-slate-50/40 p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
                          {meal}
                        </span>
                        <span className="rounded border border-indigo-200 bg-white px-2 py-0.5 font-mono text-[11px] text-indigo-800">
                          <input
                            className="w-14 border-0 bg-transparent p-0 text-center text-[11px] focus:ring-0"
                            value={block.slot_time ?? MEAL_TIME[meal] ?? ""}
                            onChange={(e) =>
                              onPatchMealMeta(day, meal, "slot_time", e.target.value)
                            }
                            aria-label={`${day} ${meal} time`}
                          />
                        </span>
                      </div>
                      <label className="mb-2 block">
                        <span className={labelClass}>Meal kcal</span>
                        <input
                          className={inputClass}
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
                      </label>
                      <div className="space-y-3">
                        {foods.map((food, idx) => (
                          <FoodRow
                            key={`${day}-${meal}-${idx}`}
                            day={day}
                            meal={meal}
                            index={idx}
                            food={food}
                            onPatchFood={onPatchFood}
                          />
                        ))}
                        {foods.length === 0 ? (
                          <p className="text-xs italic text-slate-400">
                            No foods listed — add rows via regenerate or edit
                            upstream.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : mm?.meals?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
          <p className="mb-4 text-sm text-amber-900">
            Full weekly matrix unavailable — editing flat meal preview (stub or
            legacy). Regenerate with the AI service for the 7-day grid.
          </p>
          <div className="space-y-4">
            {mm.meals.map((m, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap gap-3">
                  <label className="block">
                    <span className={labelClass}>Time</span>
                    <input
                      className={inputClass}
                      value={m.time ?? ""}
                      onChange={(e) =>
                        onPatchFlatMeal(i, "time", e.target.value)
                      }
                    />
                  </label>
                  <label className="block min-w-[200px] flex-1">
                    <span className={labelClass}>Meal</span>
                    <input
                      className={inputClass}
                      value={m.name ?? ""}
                      onChange={(e) =>
                        onPatchFlatMeal(i, "name", e.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="mt-2 block">
                  <span className={labelClass}>Notes / kcal line</span>
                  <input
                    className={inputClass}
                    value={m.notes ?? ""}
                    onChange={(e) =>
                      onPatchFlatMeal(i, "notes", e.target.value)
                    }
                  />
                </label>
                {Array.isArray(m.foods) &&
                  m.foods.map((food, fi) => (
                    <div key={fi} className="mt-3 border-t border-slate-100 pt-3">
                      <FoodRow
                        day="Preview"
                        meal={String(i)}
                        index={fi}
                        food={food}
                        onPatchFood={(day, meal, idx, field, raw) => {
                          patchPlan((p) => {
                            const mealsArr = [...(p.plan.meal_matrix.meals || [])];
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
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No meal rows in this draft.
        </div>
      )}
    </div>
  );
}
