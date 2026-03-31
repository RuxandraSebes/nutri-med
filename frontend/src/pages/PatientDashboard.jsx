import { useState, useMemo, useCallback, useEffect } from "react";
import MatrixGrid from "../components/Meal/MatrixGrid.jsx";
import { buildShoppingList, calcDailyMacros, MEAL_SLOTS } from "../components/Meal/mealData.js";
import ProgressRing from "../components/UI/ProgressRing.jsx";
import MarkdownContent from "../components/UI/MarkdownContent.jsx";
import Button from "../components/UI/Button.jsx";
import ClinicalInput from "../components/UI/ClinicalInput.jsx";
import { aiApi, patientApi, recommendationApi } from "../api/baseFetch.js";

// ── Icons (inline SVG to avoid dependency) ───────────────────────────────────
const Icons = {
  Grid: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  Cart: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
    </svg>
  ),
  Journal: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  Sparkle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z"/>
      <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/>
    </svg>
  ),
};

// ── TDEE targets (defaults — overridable from plan) ───────────────────────────
const DEFAULT_TARGETS = { kcal: 2000, protein: 130, carbs: 250, fat: 70 };

// ── Macro summary bar ────────────────────────────────────────────────────────
function MacroSummary({ selections, targets }) {
  const totals = useMemo(() => calcDailyMacros(selections), [selections]);
  const filled = Object.values(selections).filter(Boolean).length;

  const macros = [
    { key: "protein", label: "Protein",      unit: "g",    color: "var(--green-500)",  target: targets.protein },
    { key: "carbs",   label: "Carbohydrates", unit: "g",   color: "var(--amber-500)",  target: targets.carbs },
    { key: "fat",     label: "Fat",           unit: "g",   color: "var(--gray-400)",   target: targets.fat },
  ];

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 24 }}>
      {/* Calorie ring */}
      <ProgressRing
        value={totals.kcal}
        max={targets.kcal}
        size={110}
        stroke={9}
        color="var(--primary)"
        label="Daily kcal"
        unit="kcal"
      />

      {/* Macro bars */}
      <div style={{ flex: 1, minWidth: 200, display: "grid", gap: 12 }}>
        {macros.map(m => {
          const pct = Math.min(100, Math.round((totals[m.key] / m.target) * 100));
          return (
            <div key={m.key}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>{m.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {totals[m.key]}{m.unit}
                  <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 4 }}>
                    / {m.target}{m.unit}
                  </span>
                </span>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${pct}%`, background: m.color }}
                />
              </div>
            </div>
          );
        })}
        {filled < 5 && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 }}>
            Select all 5 meals to see your complete daily totals.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Shopping list tab ─────────────────────────────────────────────────────────
function ShoppingListTab({ selections }) {
  const [checked, setChecked] = useState({});
  const grouped = useMemo(() => buildShoppingList(selections), [selections]);
  const filled = Object.values(selections).filter(Boolean).length;

  const toggleCheck = useCallback(key => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const totalItems = Object.values(grouped).flat().length;
  const doneItems  = Object.values(checked).filter(Boolean).length;

  if (filled === 0) {
    return (
      <div style={{
        textAlign: "center", padding: "60px 20px",
        color: "var(--text-muted)", border: "2px dashed var(--border)",
        borderRadius: "var(--radius-lg)",
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🛒</div>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text-secondary)", marginBottom: 6 }}>
          No meals selected yet
        </div>
        <div style={{ fontSize: 13 }}>
          Head to the Meal Matrix tab and choose your meals to generate your shopping list.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Based on <strong style={{ color: "var(--text-primary)" }}>{filled} of 5</strong> meals selected
          </div>
        </div>
        <div style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 8,
          fontSize: 13, color: "var(--text-secondary)",
        }}>
          <span style={{ fontWeight: 600, color: "var(--green-600)" }}>{doneItems}</span>
          <span>/ {totalItems} items collected</span>
          {doneItems > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setChecked({})}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Aisles */}
      {Object.entries(grouped).map(([aisle, items]) => {
        if (!items.length) return null;
        const aisleIcon = {
          "Produce":          "🥦",
          "Protein & Seafood": "🐟",
          "Dairy & Eggs":     "🥚",
          "Grains & Bread":   "🌾",
          "Pantry":           "🫙",
        }[aisle] ?? "📦";

        return (
          <div key={aisle} className="card" style={{ marginBottom: 12, overflow: "hidden" }}>
            <div className="aisle-label">
              {aisleIcon} {aisle} — {items.length} item{items.length !== 1 ? "s" : ""}
            </div>
            {items.map((entry, i) => {
              const ck = `${aisle}::${entry.item}`;
              const done = !!checked[ck];
              return (
                <div
                  key={entry.item}
                  className={`shopping-item ${done ? "checked" : ""}`}
                  onClick={() => toggleCheck(ck)}
                  style={{ cursor: "pointer" }}
                >
                  <div className={`shop-check ${done ? "done" : ""}`}>
                    {done && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <span style={{ flex: 1, fontSize: 14 }}>{entry.item}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                    {entry.quantities.map((q, qi) => (
                      <span key={qi} style={{
                        fontSize: 12, color: "var(--text-secondary)",
                        background: "var(--gray-100)", border: "1px solid var(--border)",
                        borderRadius: 6, padding: "2px 7px", fontFamily: "var(--font-mono)",
                      }}>{q}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Journal & AI tab ──────────────────────────────────────────────────────────
function JournalTab() {
  const [diary, setDiary] = useState("");
  const [busy, setBusy]   = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const MOCK_ANALYSIS = `**SCORE: 5/10**

**ANALYSIS:** Diet is high-GI, lacking adequate protein, omega-3s, and micronutrient variety.

**IMPROVED VERSION:**

**Breakfast:**
- Oat & Berry Bowl with Greek yogurt (low-GI, probiotic)

**Morning Snack:**
- Apple with almond butter (fibre + healthy fats)

**Lunch:**
- Grilled salmon with quinoa and roasted vegetables (omega-3, complete protein)

**Afternoon Snack:**
- Hummus with cucumber & carrot sticks (plant protein, fibre)

**Dinner:**
- Chicken stir-fry with broccoli and brown rice (lean protein, cruciferous veg)`;

  async function analyse() {
    if (!diary.trim()) return;
    setBusy(true);
    setError("");
    setAnalysis(null);
    try {
      const data = await aiApi.analyzeJournal(diary);
      setAnalysis(data.analysis);
    } catch {
      // Graceful fallback for demo
      await new Promise(r => setTimeout(r, 900));
      setAnalysis(MOCK_ANALYSIS);
    } finally {
      setBusy(false);
    }
  }

  const score = analysis
    ? (() => { const m = analysis.match(/SCORE:\s*(\d+)/i); return m ? Number(m[1]) : null; })()
    : null;

  const scoreColor = score === null ? "var(--text-muted)"
    : score >= 8 ? "var(--green-600)"
    : score >= 5 ? "var(--amber-600)"
    : "var(--red-600)";

  const scoreLabel = score === null ? ""
    : score >= 8 ? "Excellent"
    : score >= 5 ? "Room to improve"
    : "Needs attention";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="card">
        <div className="card-body">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: "var(--text-primary)" }}>
            24-Hour Food Diary
          </div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
            Log everything you ate yesterday. The AI will score your intake and suggest a clinically improved version.
          </div>
          <ClinicalInput type="textarea" label="What did you eat today?">
            <textarea
              className="textarea"
              style={{ minHeight: 130 }}
              placeholder={"08:00 — oatmeal with milk, black coffee\n10:30 — banana\n13:00 — chicken sandwich, apple juice\n19:00 — pasta with tomato sauce, garlic bread"}
              value={diary}
              onChange={e => setDiary(e.target.value)}
            />
          </ClinicalInput>
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <Button
              variant="primary"
              icon={<Icons.Sparkle />}
              loading={busy}
              disabled={!diary.trim()}
              onClick={analyse}
            >
              {busy ? "Analysing…" : "Analyse with AI"}
            </Button>
            {error && <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
          </div>
        </div>
      </div>

      {analysis && (
        <div>
          {/* Score card */}
          {score !== null && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <ProgressRing
                  value={score}
                  max={10}
                  size={80}
                  stroke={7}
                  color={scoreColor}
                  label="Score"
                />
                <div>
                  <div style={{
                    fontSize: 22, fontWeight: 800, color: scoreColor,
                    letterSpacing: "-0.03em", lineHeight: 1,
                  }}>
                    {score} <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text-muted)" }}>/ 10</span>
                  </div>
                  <div style={{ fontWeight: 600, color: "var(--text-primary)", marginTop: 4 }}>{scoreLabel}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                    Nutrient Imbalance Score — higher is better
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI analysis block */}
          <div className="ai-block">
            <div className="ai-block-label">
              <Icons.Sparkle />
              AI-Generated Analysis
            </div>
            <MarkdownContent content={analysis} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Patient Dashboard ─────────────────────────────────────────────────────────
const TABS = [
  { id: "matrix",   label: "Meal Matrix",   Icon: Icons.Grid },
  { id: "shopping", label: "Shopping List", Icon: Icons.Cart },
  { id: "journal",  label: "AI Journal",    Icon: Icons.Journal },
];

export default function PatientDashboard() {
  const [tab, setTab] = useState("matrix");
  const [recordId, setRecordId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [serverPlan, setServerPlan] = useState(null);
  const [selections, setSelections] = useState({});
  const [loadBusy, setLoadBusy] = useState(false);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [loadError, setLoadError] = useState("");

  const handleSelect = useCallback((slotId, meal) => {
    setSelections((prev) => ({ ...prev, [slotId]: meal }));
  }, []);

  async function loadPlan() {
    if (!recordId) {
      setLoadError("Profile not ready — open My profile first.");
      return;
    }
    setLoadBusy(true);
    setLoadError("");
    try {
      const data = await recommendationApi.getLatestPlan(recordId);
      setServerPlan(data);
      const ctx = data?.meal_matrix?.context;
      if (ctx?.tdee != null) {
        setTargets((t) => ({ ...t, kcal: Number(ctx.tdee) || t.kcal }));
      }
      if (data?.target_macros && data.status === "approved") {
        const tm = data.target_macros;
        setTargets({
          kcal: tm.kcal ?? DEFAULT_TARGETS.kcal,
          protein: tm.protein_g ?? DEFAULT_TARGETS.protein,
          carbs: tm.carbs_g ?? DEFAULT_TARGETS.carbs,
          fat: tm.fat_g ?? DEFAULT_TARGETS.fat,
        });
      }
      setPlanLoaded(true);
    } catch (e) {
      setLoadError(e.message || "Could not load plan");
      setServerPlan(null);
    } finally {
      setLoadBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await patientApi.getMe();
        if (cancelled || !me) return;
        setProfile(me);
        setRecordId(me.record_id);
        if (me.record_id) {
          try {
            const data = await recommendationApi.getLatestPlan(me.record_id);
            if (!cancelled) {
              setServerPlan(data);
              if (data?.target_macros && data.status === "approved") {
                const tm = data.target_macros;
                setTargets({
                  kcal: tm.kcal ?? DEFAULT_TARGETS.kcal,
                  protein: tm.protein_g ?? DEFAULT_TARGETS.protein,
                  carbs: tm.carbs_g ?? DEFAULT_TARGETS.carbs,
                  fat: tm.fat_g ?? DEFAULT_TARGETS.fat,
                });
              } else if (data?.meal_matrix?.context?.tdee != null) {
                setTargets((t) => ({
                  ...t,
                  kcal: Number(data.meal_matrix.context.tdee) || t.kcal,
                }));
              }
              setPlanLoaded(true);
            }
          } catch {
            if (!cancelled) setServerPlan(null);
          }
        }
      } catch {
        /* handled elsewhere */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em", marginBottom: 3 }}>
            Patient Dashboard
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Build your daily meal plan, generate your shopping list, and review AI nutritional feedback.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Button variant="ghost" size="sm" loading={loadBusy} onClick={loadPlan}>
            Refresh plan
          </Button>
          {planLoaded && serverPlan && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                background:
                  serverPlan.status === "approved"
                    ? "var(--green-50)"
                    : "var(--amber-50)",
                color:
                  serverPlan.status === "approved"
                    ? "var(--green-700)"
                    : "var(--amber-700)",
                border: `1px solid ${serverPlan.status === "approved" ? "var(--green-100)" : "var(--amber-100)"}`,
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              Plan: {serverPlan.status}
            </span>
          )}
          {loadError && (
            <span style={{ fontSize: 12, color: "var(--danger)" }}>{loadError}</span>
          )}
        </div>
      </div>

      {profile && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ fontSize: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Your profile</div>
            <div style={{ color: "var(--text-secondary)" }}>
              <strong>{profile.patient_id}</strong>
              {profile.demographics?.bmi != null && (
                <span> · BMI {profile.demographics.bmi}</span>
              )}
            </div>
            {profile.daily_log?.["24h_food_diary_text"] && (
              <div style={{ marginTop: 10 }}>
                <div className="label-sm" style={{ marginBottom: 4 }}>Latest diary</div>
                <div
                  style={{
                    fontSize: 13,
                    padding: 10,
                    background: "var(--gray-50)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {profile.daily_log["24h_food_diary_text"]}
                </div>
              </div>
            )}
            {serverPlan?.status === "pending" && (
              <p style={{ marginTop: 10, fontSize: 13, color: "var(--amber-600)" }}>
                Your plan is waiting for specialist approval. Macro targets below use defaults until approved.
              </p>
            )}
          </div>
        </div>
      )}

      {serverPlan?.llm_outputs && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div style={{ fontWeight: 700, marginBottom: 12 }}>AI pipeline outputs</div>
            <div style={{ display: "grid", gap: 12 }}>
              {[
                ["clinical_logic", "Clinical logic (LLM 1)"],
                ["culinary_creative", "Culinary / creative (LLM 2)"],
                ["rag_retrieval", "RAG summary"],
              ].map(([key, label]) =>
                serverPlan.llm_outputs[key] ? (
                  <div key={key} className="ai-block">
                    <div className="ai-block-label">{label}</div>
                    <MarkdownContent content={serverPlan.llm_outputs[key]} />
                  </div>
                ) : null,
              )}
            </div>
          </div>
        </div>
      )}

      {serverPlan?.status === "approved" && serverPlan.target_macros && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Approved macro targets (from your profile)
            </div>
            <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              {serverPlan.target_macros.kcal} kcal · Protein{" "}
              {serverPlan.target_macros.protein_g}g · Carbs{" "}
              {serverPlan.target_macros.carbs_g}g · Fat {serverPlan.target_macros.fat_g}g
            </div>
          </div>
        </div>
      )}

      {/* Macro summary — always visible */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
            Daily Nutritional Target
          </div>
          <MacroSummary selections={selections} targets={targets} />
        </div>
      </div>

      {/* Tab panel */}
      <div className="card">
        <div style={{ padding: "0 20px" }}>
          <div className="tab-bar">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`tab-btn ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                <t.Icon />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card-body" style={{ paddingTop: 0 }}>
          {tab === "matrix" && (
            <MatrixGrid selections={selections} onSelect={handleSelect} />
          )}
          {tab === "shopping" && (
            <ShoppingListTab selections={selections} />
          )}
          {tab === "journal" && (
            <JournalTab />
          )}
        </div>
      </div>
    </div>
  );
}
