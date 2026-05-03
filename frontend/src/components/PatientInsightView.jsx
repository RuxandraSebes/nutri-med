import { aiApi } from "../api/baseFetch.js";

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
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  diary:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  alert:
    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
};

function mapJournalAnalysisToReview(analysisText) {
  const text = String(analysisText || "").trim();
  if (!text) return null;
  const scoreMatch = text.match(/SCORE:\s*([^\n]+)/i);
  const analysisMatch = text.match(/ANALYSIS:\s*([^\n]+)/i);
  const improvedMatch = text.split(/IMPROVED VERSION:/i)[1];
  const clinical = [
    scoreMatch ? `**Score**: ${scoreMatch[1].trim()}/10` : null,
    analysisMatch ? `**Clinical note**: ${analysisMatch[1].trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    clinical_logic: clinical || "No specific clinical summary provided.",
    culinary_creative: improvedMatch ? improvedMatch.trim() : text,
    rag_retrieval:
      "Guidance generated from 24h food journal and clinical context.",
  };
}

function splitList(s) {
  return String(s || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function Spinner({ size = 14 }) {
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

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13.5 }}>
      <span style={{ color: "var(--sd-text-3)", minWidth: 170, flexShrink: 0 }}>
        {label}
      </span>
      <span
        style={{ color: "var(--sd-text)", fontWeight: 500, lineHeight: 1.5 }}
      >
        {value}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function PatientInsightView({
  dashboardData,
  setDashboardData,
  journalBusy,
  setJournalBusy,
  journalError,
  setJournalError,
}) {
  const { patientView, plan, journalReview } = dashboardData;

  async function analyzeJournal() {
    setJournalBusy(true);
    setJournalError("");
    try {
      const diary = patientView.daily_log?.["24h_food_diary_text"] || "";
      const payload = {
        journalEntries: diary,
        patientDetails: {
          patient_id: patientView.patient_id,
          demographics: patientView.demographics,
          lifestyle: patientView.lifestyle,
          preferences: patientView.preferences,
        },
        specialistDetails: {
          primary_disease: dashboardData.primaryDisease,
          severity: dashboardData.severity,
          comorbidities: splitList(dashboardData.comorbiditiesText),
        },
      };
      const data = await aiApi.analyzeJournal(payload);
      const mapped = mapJournalAnalysisToReview(data?.analysis || "");
      if (!mapped) throw new Error("AI returned empty analysis");
      setDashboardData((prev) => ({ ...prev, journalReview: mapped }));
    } catch (e) {
      setJournalError(e.message || "Could not analyze journal");
    } finally {
      setJournalBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        maxWidth: 900,
      }}
    >
      {/* ── Intro ── */}
      <div className="sd-insight-intro">
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--sd-text)",
            marginBottom: 6,
          }}
        >
          Patient insights
        </div>
        <p
          style={{
            fontSize: 13.5,
            color: "var(--sd-text-2)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Cross-check the 24h diary with lifestyle and preferences before
          approving a plan. Journal analysis drafts editable guidance you can
          refine in the fields below.
        </p>
      </div>

      {/* ── Patient profile ── */}
      {patientView ? (
        <div className="sd-insight-card">
          <div className="sd-insight-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="sd-card-icon">
                <Icon d={I.user} size={14} />
              </div>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--sd-text)",
                }}
              >
                Patient profile
              </span>
            </div>
            <span className="sd-badge sd-badge-indigo">
              {patientView.patient_id}
            </span>
          </div>

          <div className="sd-insight-card-body">
            {/* Demographics */}
            {patientView.demographics && (
              <div>
                <div className="sd-label" style={{ marginBottom: 8 }}>
                  Demographics
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <InfoRow
                    label="Age"
                    value={
                      patientView.demographics.age != null
                        ? `${patientView.demographics.age} yr`
                        : null
                    }
                  />
                  <InfoRow
                    label="Gender"
                    value={patientView.demographics.gender}
                  />
                  <InfoRow
                    label="Height"
                    value={
                      patientView.demographics.height_cm != null
                        ? `${patientView.demographics.height_cm} cm`
                        : null
                    }
                  />
                  <InfoRow
                    label="Weight"
                    value={
                      patientView.demographics.weight_kg != null
                        ? `${patientView.demographics.weight_kg} kg`
                        : null
                    }
                  />
                  <InfoRow label="BMI" value={patientView.demographics.bmi} />
                </div>
              </div>
            )}

            {/* Lifestyle */}
            {patientView.lifestyle && (
              <div>
                <div className="sd-label" style={{ marginBottom: 8 }}>
                  Lifestyle
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <InfoRow
                    label="Physical activity"
                    value={patientView.lifestyle.physical_activity_level}
                  />
                  <InfoRow
                    label="Weekly exercise"
                    value={
                      patientView.lifestyle.weekly_exercise_hours != null
                        ? `${patientView.lifestyle.weekly_exercise_hours} h/wk`
                        : null
                    }
                  />
                  <InfoRow
                    label="Daily steps"
                    value={patientView.lifestyle.daily_steps_reported}
                  />
                  <InfoRow
                    label="Sleep quality"
                    value={patientView.lifestyle.sleep_quality_subjective}
                  />
                  <InfoRow
                    label="Alcohol"
                    value={patientView.lifestyle.alcohol_consumption}
                  />
                  <InfoRow
                    label="Smoking"
                    value={patientView.lifestyle.smoking_habit}
                  />
                </div>
              </div>
            )}

            {/* Preferences */}
            {patientView.preferences && (
              <div>
                <div className="sd-label" style={{ marginBottom: 8 }}>
                  Preferences
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <InfoRow
                    label="Preferred cuisine"
                    value={patientView.preferences.preferred_cuisine}
                  />
                  <InfoRow
                    label="Cultural / religious"
                    value={
                      patientView.preferences.cultural_religious_restrictions
                    }
                  />
                  <InfoRow
                    label="Food aversions"
                    value={
                      Array.isArray(patientView.preferences.food_aversions) &&
                      patientView.preferences.food_aversions.length > 0
                        ? patientView.preferences.food_aversions.join(", ")
                        : null
                    }
                  />
                  <InfoRow
                    label="Health goal"
                    value={patientView.preferences.goal}
                  />
                </div>
              </div>
            )}

            {/* 24h diary (read-only) */}
            {patientView.daily_log?.["24h_food_diary_text"] && (
              <div>
                <div className="sd-label" style={{ marginBottom: 8 }}>
                  24h food diary
                </div>
                <div className="sd-diary-readonly">
                  {patientView.daily_log["24h_food_diary_text"]}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="sd-empty">
          <div className="sd-empty-icon">
            <Icon d={I.user} size={26} stroke="#94a3b8" sw={1.5} />
          </div>
          <div className="sd-empty-title">No patient selected</div>
          <div className="sd-empty-sub">
            Search and select a patient in the Workspace tab.
          </div>
        </div>
      )}

      {/* ── Journal analysis ── */}
      {patientView?.daily_log?.["24h_food_diary_text"] ? (
        <div className="sd-insight-card">
          <div className="sd-insight-card-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="sd-card-icon" style={{ background: "#ecfdf5" }}>
                <Icon d={I.bolt} size={14} stroke="#10b981" />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--sd-text)",
                  }}
                >
                  Journal analysis
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--sd-text-3)",
                    marginTop: 1,
                  }}
                >
                  AI-powered · editable before saving
                </div>
              </div>
            </div>
            <span className="sd-badge sd-badge-gray">
              {plan?.status ?? "draft"}
            </span>
          </div>

          <div className="sd-insight-card-body">
            <button
              type="button"
              className="sd-btn sd-btn-primary"
              onClick={analyzeJournal}
              disabled={journalBusy}
            >
              {journalBusy ? (
                <Spinner />
              ) : (
                <Icon d={I.bolt} size={13} stroke="currentColor" />
              )}
              Analyze food journal
            </button>

            {journalError && (
              <div className="sd-alert sd-alert-error">
                <Icon d={I.alert} size={14} />
                {journalError}
              </div>
            )}

            {journalReview ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  marginTop: 6,
                }}
              >
                {[
                  {
                    key: "clinical_logic",
                    label: "Diet rules & priorities",
                    accent: "#6366f1",
                  },
                  {
                    key: "culinary_creative",
                    label: "Meal ideas",
                    accent: "#10b981",
                  },
                  {
                    key: "rag_retrieval",
                    label: "Reference guidance",
                    accent: "#0ea5e9",
                  },
                ].map(({ key, label, accent }) => (
                  <div
                    key={key}
                    className="sd-llm-field"
                    style={{ borderLeftColor: accent }}
                  >
                    <label
                      className="sd-label"
                      style={{ color: accent, marginBottom: 6 }}
                    >
                      {label}
                    </label>
                    <textarea
                      className="sd-input"
                      rows={key === "clinical_logic" ? 6 : 5}
                      value={journalReview[key] || ""}
                      onChange={(e) =>
                        setDashboardData((prev) => ({
                          ...prev,
                          journalReview: {
                            ...(prev.journalReview || {}),
                            [key]: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              !journalBusy && (
                <p
                  style={{
                    fontSize: 13.5,
                    fontStyle: "italic",
                    color: "var(--sd-text-3)",
                    marginTop: 4,
                  }}
                >
                  Run analysis to populate editable guidance fields.
                </p>
              )
            )}
          </div>
        </div>
      ) : patientView ? (
        <div
          style={{
            background: "var(--sd-bg)",
            border: "1.5px dashed var(--sd-border)",
            borderRadius: "var(--sd-radius)",
            padding: "40px 24px",
            textAlign: "center",
            fontSize: 13.5,
            color: "var(--sd-text-3)",
          }}
        >
          This patient has no 24h food diary entry yet.
        </div>
      ) : null}
    </div>
  );
}
