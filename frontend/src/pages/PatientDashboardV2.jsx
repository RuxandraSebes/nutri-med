import { useEffect, useMemo, useState } from "react";
import { patientApi, recommendationApi } from "../api/baseFetch.js";
import MarkdownContent from "../components/UI/MarkdownContent.jsx";
import "./PatientDashboardV2.css";

// ─── Icons ────────────────────────────────────────────────────────────────────
function Icon({
  d,
  size = 16,
  stroke = "currentColor",
  fill = "none",
  strokeWidth = 2,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const Icons = {
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
  clock:
    "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  note: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
};

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
function Spinner({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="pd-spin"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function Btn({
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

function StatusPill({ status }) {
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

// ─── Daily Macro Banner ────────────────────────────────────────────────────────
function DailyMacroBanner({ targetMacros }) {
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
              {value ?? "—"}
              <span className="pd-macro-unit">{unit}</span>
            </div>
            <div className="pd-macro-label">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Meal timeline row ────────────────────────────────────────────────────────
function MealTimelineRow({ meal, index }) {
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

// ─── Weekly matrix day card ───────────────────────────────────────────────────
function DayCard({ day, dayData }) {
  const MEALS = ["Breakfast", "Morning Snack", "Lunch", "Dinner"];
  const MEAL_TIMES = {
    Breakfast: "08:00",
    "Morning Snack": "10:30",
    Lunch: "13:00",
    Dinner: "19:00",
  };
  const mealColors = {
    Breakfast: "#6366f1",
    "Morning Snack": "#0ea5e9",
    Lunch: "#10b981",
    Dinner: "#f59e0b",
  };

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
          const block = dayData?.[meal];
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
                <p className="pd-day-food-empty">—</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shopping list ─────────────────────────────────────────────────────────────
function ShoppingList({ items }) {
  const [checked, setChecked] = useState({});
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

  // Group by category if available
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();
  const total = items.length;
  const done = Object.values(checked).filter(Boolean).length;

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
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, subtitle }) {
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

// ─── AI content block ─────────────────────────────────────────────────────────
function AiBlock({ label, icon, content, accentColor = "#10b981" }) {
  if (!content) return null;
  return (
    <div className="pd-ai-block" style={{ borderLeftColor: accentColor }}>
      <div className="pd-ai-label" style={{ color: accentColor }}>
        <Icon d={icon} size={13} />
        {label}
      </div>
      <div className="pd-ai-content">
        <MarkdownContent content={content} />
      </div>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: "today", label: "Today", icon: Icons.home },
  { id: "plan", label: "Diet Plan", icon: Icons.calendar },
  { id: "shopping", label: "Shopping", icon: Icons.cart },
  { id: "profile", label: "My Profile", icon: Icons.user },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function PatientDashboardV2() {
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("today");
  const [diaryDraft, setDiaryDraft] = useState("");
  const [diarySaving, setDiarySaving] = useState(false);
  const [diaryMsg, setDiaryMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const recordId = profile?.record_id;
  const isApproved = plan?.status === "approved";

  async function refresh() {
    if (!recordId) return;
    setRefreshing(true);
    try {
      const p = await recommendationApi.getLatestPlan(recordId);
      setPlan(p);
    } catch (e) {
      if (e.status !== 404) setError(e.message);
      else setPlan(null);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await patientApi.getMe();
        if (cancelled) return;
        setProfile(me);
        setDiaryDraft(me?.daily_log?.["24h_food_diary_text"] || "");
        if (me?.record_id) {
          try {
            const p = await recommendationApi.getLatestPlan(me.record_id);
            if (!cancelled) setPlan(p);
          } catch (pe) {
            if (!cancelled && pe.status !== 404) setError(pe.message);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveDiary() {
    setDiarySaving(true);
    setDiaryMsg("");
    try {
      const updated = await patientApi.putMe({
        daily_log: { "24h_food_diary_text": diaryDraft.trim() || null },
      });
      setProfile(updated);
      setDiaryMsg("Saved!");
      setTimeout(() => setDiaryMsg(""), 3000);
    } catch (e) {
      setError(e.message || "Could not save");
    } finally {
      setDiarySaving(false);
    }
  }

  const weekly = plan?.meal_matrix?.weekly ?? plan?.plan?.meal_matrix?.weekly;
  const meals = plan?.meal_matrix?.meals ?? plan?.plan?.meal_matrix?.meals;
  const llm = plan?.llm_outputs ?? plan?.plan?.llm_outputs;
  const shoppingList = plan?.shopping_list ?? plan?.plan?.shopping_list;
  const targetMacros = plan?.target_macros ?? plan?.plan?.target_macros;
  const clinicalStrategy =
    plan?.plan?.clinical_strategy ?? plan?.clinical_strategy;

  const DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  if (busy) {
    return (
      <div className="pd-loading">
        <Spinner size={32} />
        <span>Loading your dashboard…</span>
      </div>
    );
  }

  return (
    <div className="pd-root">
      {/* ── Page header ── */}
      <div className="pd-page-header">
        <div>
          <h1 className="pd-page-title">My Health Dashboard</h1>
          <p className="pd-page-subtitle">
            {profile?.patient_id ? (
              <>
                <span className="pd-patient-id">{profile.patient_id}</span> ·
                Your personalised nutrition plan
              </>
            ) : (
              "Your personalised nutrition plan"
            )}
          </p>
        </div>
        <div className="pd-header-actions">
          {plan?.status && <StatusPill status={plan.status} />}
          <Btn
            variant="ghost"
            size="sm"
            loading={refreshing}
            onClick={refresh}
            disabled={!recordId}
          >
            <Icon d={Icons.refresh} size={14} />
            Refresh
          </Btn>
        </div>
      </div>

      {error && (
        <div className="pd-alert pd-alert-error">
          <Icon d={Icons.alert} size={15} />
          {error}
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="pd-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`pd-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon d={tab.icon} size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* TAB: TODAY */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {activeTab === "today" && (
        <div className="pd-tab-content">
          {/* Macro targets */}
          {isApproved && targetMacros ? (
            <section className="pd-section">
              <div className="pd-section-header">
                <Icon d={Icons.bolt} size={16} stroke="#6366f1" />
                <h2 className="pd-section-title">Daily targets</h2>
              </div>
              <DailyMacroBanner targetMacros={targetMacros} />
            </section>
          ) : (
            <div className="pd-pending-card">
              <div className="pd-pending-icon">
                <Icon
                  d={Icons.info}
                  size={22}
                  stroke="#0ea5e9"
                  strokeWidth={1.5}
                />
              </div>
              <div>
                <div className="pd-pending-title">
                  {plan ? "Awaiting specialist approval" : "No plan yet"}
                </div>
                <div className="pd-pending-sub">
                  {plan
                    ? "Your specialist is reviewing your nutrition plan. Check back soon."
                    : "Your specialist will generate a personalised plan for you."}
                </div>
              </div>
            </div>
          )}

          {/* Clinical strategy */}
          {isApproved && clinicalStrategy && (
            <section className="pd-section">
              <div className="pd-section-header">
                <Icon d={Icons.note} size={16} stroke="#6366f1" />
                <h2 className="pd-section-title">Clinical strategy</h2>
              </div>
              <div className="pd-strategy-box">
                <MarkdownContent content={clinicalStrategy} />
              </div>
            </section>
          )}

          {/* 24h diary */}
          <section className="pd-section">
            <div className="pd-section-header">
              <Icon d={Icons.note} size={16} stroke="#6366f1" />
              <h2 className="pd-section-title">24h food diary</h2>
              <span className="pd-section-badge">
                {plan?.status === "pending" ? "Under review" : ""}
              </span>
            </div>
            <div className="pd-diary-card">
              <p className="pd-diary-hint">
                Log everything you've eaten today. Your specialist reviews this
                during plan creation.
              </p>
              <textarea
                className="pd-diary-textarea"
                rows={6}
                value={diaryDraft}
                onChange={(e) => setDiaryDraft(e.target.value)}
                placeholder="Breakfast: Oatmeal with berries and a coffee&#10;Lunch: Grilled chicken salad&#10;Dinner: Salmon with vegetables…"
              />
              <div className="pd-diary-footer">
                <Btn
                  variant="primary"
                  size="sm"
                  loading={diarySaving}
                  onClick={saveDiary}
                >
                  <Icon d={Icons.save} size={14} />
                  Save diary
                </Btn>
                {diaryMsg && <span className="pd-diary-saved">{diaryMsg}</span>}
                <span className="pd-diary-hint-small">
                  Your specialist reviews this entry.
                </span>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* TAB: DIET PLAN */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {activeTab === "plan" && (
        <div className="pd-tab-content">
          {!isApproved ? (
            <EmptyState
              icon={Icons.calendar}
              title="Plan not available"
              subtitle="Your specialist needs to approve a plan first"
            />
          ) : (
            <>
              {/* LLM outputs */}
              {llm && (
                <section className="pd-section">
                  <div className="pd-section-header">
                    <Icon d={Icons.leaf} size={16} stroke="#10b981" />
                    <h2 className="pd-section-title">Nutritional guidance</h2>
                  </div>
                  <div className="pd-ai-blocks">
                    <AiBlock
                      label="Diet rules & priorities"
                      icon={Icons.bolt}
                      content={llm.clinical_logic}
                      accentColor="#6366f1"
                    />
                    <AiBlock
                      label="Meal ideas"
                      icon={Icons.flame}
                      content={llm.culinary_creative}
                      accentColor="#10b981"
                    />
                    <AiBlock
                      label="Reference guidance"
                      icon={Icons.note}
                      content={llm.rag_retrieval}
                      accentColor="#0ea5e9"
                    />
                  </div>
                </section>
              )}

              {/* Flat meals timeline */}
              {meals?.length > 0 && (
                <section className="pd-section">
                  <div className="pd-section-header">
                    <Icon d={Icons.clock} size={16} stroke="#6366f1" />
                    <h2 className="pd-section-title">Daily meal schedule</h2>
                  </div>
                  <div className="pd-timeline">
                    {meals.map((m, i) => (
                      <MealTimelineRow
                        key={`${m.time}-${i}`}
                        meal={m}
                        index={i}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Weekly matrix */}
              {weekly && (
                <section className="pd-section">
                  <div className="pd-section-header">
                    <Icon d={Icons.calendar} size={16} stroke="#6366f1" />
                    <h2 className="pd-section-title">Weekly plan</h2>
                  </div>
                  <div className="pd-week-grid">
                    {DAYS.map((day) => (
                      <DayCard key={day} day={day} dayData={weekly[day]} />
                    ))}
                  </div>
                </section>
              )}

              {!meals?.length && !weekly && (
                <EmptyState
                  icon={Icons.calendar}
                  title="No meal data"
                  subtitle="Regenerate plan for full meal details"
                />
              )}
            </>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* TAB: SHOPPING */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {activeTab === "shopping" && (
        <div className="pd-tab-content">
          {!isApproved ? (
            <EmptyState
              icon={Icons.cart}
              title="No shopping list"
              subtitle="Approve a plan to see ingredients"
            />
          ) : (
            <section className="pd-section">
              <div className="pd-section-header">
                <Icon d={Icons.cart} size={16} stroke="#6366f1" />
                <h2 className="pd-section-title">Ingredients to buy</h2>
                <span className="pd-section-hint">
                  Tap items to check them off as you shop
                </span>
              </div>
              <ShoppingList items={shoppingList} />
            </section>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* TAB: PROFILE (read-only summary; full editing at /patient/profile) */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <div className="pd-tab-content">
          {!profile ? (
            <EmptyState
              icon={Icons.user}
              title="No profile data"
              subtitle="Complete your profile to help the specialist"
            />
          ) : (
            <>
              <section className="pd-section">
                <div className="pd-section-header">
                  <Icon d={Icons.user} size={16} stroke="#6366f1" />
                  <h2 className="pd-section-title">Demographics</h2>
                  <a href="/patient/profile" className="pd-section-link">
                    Edit profile →
                  </a>
                </div>
                <div className="pd-profile-grid">
                  {[
                    ["Age", profile.demographics?.age, "yr"],
                    ["Gender", profile.demographics?.gender],
                    ["Height", profile.demographics?.height_cm, "cm"],
                    ["Weight", profile.demographics?.weight_kg, "kg"],
                    ["BMI", profile.demographics?.bmi],
                  ]
                    .filter(([, v]) => v != null)
                    .map(([label, val, unit]) => (
                      <div key={label} className="pd-profile-tile">
                        <div className="pd-profile-tile-label">{label}</div>
                        <div className="pd-profile-tile-value">
                          {val}
                          {unit && (
                            <span className="pd-profile-unit"> {unit}</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </section>

              {profile.lifestyle && (
                <section className="pd-section">
                  <div className="pd-section-header">
                    <Icon d={Icons.heart} size={16} stroke="#6366f1" />
                    <h2 className="pd-section-title">Lifestyle</h2>
                  </div>
                  <div className="pd-profile-grid">
                    {[
                      ["Activity", profile.lifestyle.physical_activity_level],
                      [
                        "Exercise",
                        profile.lifestyle.weekly_exercise_hours,
                        "h/wk",
                      ],
                      ["Steps", profile.lifestyle.daily_steps_reported, "/day"],
                      ["Sleep", profile.lifestyle.sleep_quality_subjective],
                      ["Alcohol", profile.lifestyle.alcohol_consumption],
                      ["Smoking", profile.lifestyle.smoking_habit],
                    ]
                      .filter(([, v]) => v != null)
                      .map(([label, val, unit]) => (
                        <div key={label} className="pd-profile-tile">
                          <div className="pd-profile-tile-label">{label}</div>
                          <div className="pd-profile-tile-value">
                            {val}
                            {unit && (
                              <span className="pd-profile-unit">{unit}</span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              )}

              {profile.preferences && (
                <section className="pd-section">
                  <div className="pd-section-header">
                    <Icon d={Icons.star} size={16} stroke="#6366f1" />
                    <h2 className="pd-section-title">Preferences & goals</h2>
                  </div>
                  <div className="pd-profile-detail-card">
                    {profile.preferences.preferred_cuisine && (
                      <div className="pd-detail-row">
                        <span className="pd-detail-label">
                          Cuisine preference
                        </span>
                        <span className="pd-detail-value">
                          {profile.preferences.preferred_cuisine}
                        </span>
                      </div>
                    )}
                    {profile.preferences.cultural_religious_restrictions && (
                      <div className="pd-detail-row">
                        <span className="pd-detail-label">
                          Dietary restrictions
                        </span>
                        <span className="pd-detail-value">
                          {profile.preferences.cultural_religious_restrictions}
                        </span>
                      </div>
                    )}
                    {Array.isArray(profile.preferences.food_aversions) &&
                      profile.preferences.food_aversions.length > 0 && (
                        <div className="pd-detail-row">
                          <span className="pd-detail-label">
                            Food aversions
                          </span>
                          <span className="pd-detail-value">
                            {profile.preferences.food_aversions.join(", ")}
                          </span>
                        </div>
                      )}
                    {profile.preferences.goal && (
                      <div className="pd-detail-row">
                        <span className="pd-detail-label">Health goal</span>
                        <span className="pd-detail-value">
                          {profile.preferences.goal}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
