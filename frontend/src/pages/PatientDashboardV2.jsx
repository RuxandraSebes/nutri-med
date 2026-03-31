import { useEffect, useMemo, useState } from "react";
import MarkdownContent from "../components/UI/MarkdownContent.jsx";
import Button from "../components/UI/Button.jsx";
import { patientApi, recommendationApi } from "../api/baseFetch.js";
import "./PatientDashboardV2.css";

function SectionTitle({ children }) {
  return (
    <div className="section-title" style={{ fontSize: 15 }}>
      {children}
    </div>
  );
}

export default function PatientDashboardV2() {
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [diaryDraft, setDiaryDraft] = useState("");
  const [diarySaving, setDiarySaving] = useState(false);
  const [diaryMsg, setDiaryMsg] = useState("");

  const recordId = profile?.record_id;
  const canLoad = !!recordId;
  const isApproved = plan?.status === "approved";

  const targetsSummary = useMemo(() => {
    if (!plan?.target_macros) return null;
    const tm = plan.target_macros;
    return `${tm.kcal} kcal · Protein ${tm.protein_g}g · Carbs ${tm.carbs_g}g · Fat ${tm.fat_g}g`;
  }, [plan]);

  async function refresh() {
    if (!canLoad) return;
    setBusy(true);
    setError("");
    try {
      const data = await recommendationApi.getLatestPlan(recordId);
      setPlan(data);
    } catch (e) {
      setError(e.message || "Could not load plan");
      setPlan(null);
    } finally {
      setBusy(false);
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
          const p = await recommendationApi.getLatestPlan(me.record_id);
          if (!cancelled) setPlan(p);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Could not load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveDiary() {
    setDiarySaving(true);
    setDiaryMsg("");
    setError("");
    try {
      const updated = await patientApi.putMe({
        daily_log: { "24h_food_diary_text": diaryDraft.trim() || null },
      });
      setProfile(updated);
      setDiaryMsg("Saved.");
    } catch (e) {
      setError(e.message || "Could not save diary");
    } finally {
      setDiarySaving(false);
    }
  }

  return (
    <div className="patientDashboardPage">
      <div
        style={{
          marginBottom: 24,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "var(--text-primary)",
              letterSpacing: "-0.03em",
              marginBottom: 3,
            }}
          >
            Patient dashboard
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
            Your specialist-approved diet rules, meal plan, and shopping list.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Button
            variant="ghost"
            size="sm"
            loading={busy}
            onClick={refresh}
            disabled={!canLoad}
          >
            Refresh
          </Button>
          {plan?.status ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                background:
                  plan.status === "approved" ? "var(--green-50)" : "var(--amber-50)",
                color:
                  plan.status === "approved" ? "var(--green-700)" : "var(--amber-700)",
                border: `1px solid ${
                  plan.status === "approved" ? "var(--green-100)" : "var(--amber-100)"
                }`,
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              Status: {plan.status}
            </span>
          ) : null}
          {error ? <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span> : null}
        </div>
      </div>

      {profile ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ fontSize: 14, display: "grid", gap: 12 }}>
            <div style={{ fontWeight: 700 }}>
              Your profile{" "}
              {profile.patient_id ? (
                <span style={{ fontWeight: 600, color: "var(--text-secondary)", marginLeft: 8 }}>
                  {profile.patient_id}
                </span>
              ) : null}
            </div>

            <div>
              <div className="label-sm" style={{ marginBottom: 6 }}>
                24h food diary
              </div>
              <textarea
                className="textarea"
                rows={5}
                value={diaryDraft}
                onChange={(e) => setDiaryDraft(e.target.value)}
                placeholder="Breakfast: … Lunch: … Dinner: …"
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <Button variant="primary" size="sm" loading={diarySaving} onClick={saveDiary}>
                  Save diary
                </Button>
                {diaryMsg ? (
                  <span style={{ fontSize: 13, color: "var(--green-700)", fontWeight: 600 }}>{diaryMsg}</span>
                ) : null}
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  The specialist will review this entry.
                </span>
              </div>
            </div>

            {plan?.status === "pending" ? (
              <div style={{ fontSize: 13, color: "var(--amber-600)", fontWeight: 600 }}>
                Waiting for specialist approval. Update your diary in “My profile”.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isApproved && targetsSummary ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <SectionTitle>Approved daily targets</SectionTitle>
            <div style={{ marginTop: 10, color: "var(--text-secondary)", fontSize: 14 }}>
              {targetsSummary}
            </div>
          </div>
        </div>
      ) : null}

      {isApproved && plan.llm_outputs ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <SectionTitle>Next steps (diet plan)</SectionTitle>

            {plan.llm_outputs.clinical_logic ? (
              <div className="ai-block">
                <div className="ai-block-label">Diet rules & priorities</div>
                <MarkdownContent content={plan.llm_outputs.clinical_logic} />
              </div>
            ) : null}

            {plan.llm_outputs.culinary_creative ? (
              <div className="ai-block">
                <div className="ai-block-label">Meal ideas</div>
                <MarkdownContent content={plan.llm_outputs.culinary_creative} />
              </div>
            ) : null}

            {plan.llm_outputs.rag_retrieval ? (
              <div className="ai-block">
                <div className="ai-block-label">Reference guidance</div>
                <MarkdownContent content={plan.llm_outputs.rag_retrieval} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {isApproved && plan.meal_matrix?.meals ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <SectionTitle>Generated meals</SectionTitle>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
              }}
            >
              {plan.meal_matrix.meals.map((m, i) => (
                <div
                  key={`${m.time}-${i}`}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 14px",
                    borderBottom:
                      i < plan.meal_matrix.meals.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: "var(--primary)",
                      background: "var(--primary-light)",
                      border: "1px solid var(--primary-mid)",
                      borderRadius: 5,
                      padding: "2px 7px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.time}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{m.name}</span>
                  {m.notes ? (
                    <span
                      style={{
                        marginLeft: "auto",
                        color: "var(--text-muted)",
                        fontStyle: "italic",
                        fontSize: 12,
                      }}
                    >
                      {m.notes}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isApproved && Array.isArray(plan.shopping_list) ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <SectionTitle>Ingredients to buy</SectionTitle>
            <div style={{ display: "grid", gap: 10 }}>
              {plan.shopping_list.map((it, i) => (
                <div
                  key={`${it.item}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 12px",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{it.item}</div>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                    }}
                  >
                    {it.qty}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

