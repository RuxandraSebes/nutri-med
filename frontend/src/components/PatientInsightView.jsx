import Button from "./UI/Button.jsx";
import Badge from "./UI/Badge.jsx";
import { inputClass, labelClass } from "./specialistStyles.js";
import { aiApi } from "../api/baseFetch.js";

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
      "Guidance generated based on 24h food journal and clinical context.",
  };
}

function splitList(s) {
  return String(s || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Tab 2: patient demographics, diary, and editable journal-based review.
 */
export default function PatientInsightView({
  dashboardData,
  setDashboardData,
  journalBusy,
  setJournalBusy,
  journalError,
  setJournalError,
}) {
  const patientView = dashboardData.patientView;
  const plan = dashboardData.plan;
  const journalReview = dashboardData.journalReview;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="rounded-xl border border-slate-200 border-l-4 border-l-indigo-500 bg-slate-50/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Patient insights
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Use this view as a research workspace: cross-check the 24h diary with
          lifestyle and preferences before you approve a plan. Journal analysis
          drafts editable guidance you can refine in the fields below.
        </p>
      </div>

      {patientView && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              Patient profile
            </h3>
            <Badge variant="blue">{patientView.patient_id}</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <p>
              <span className="text-slate-500">Demographics: </span>
              {patientView.demographics?.age != null && (
                <span>Age {patientView.demographics.age} · </span>
              )}
              {patientView.demographics?.gender && (
                <span>{patientView.demographics.gender} · </span>
              )}
              {patientView.demographics?.height_cm != null && (
                <span>{patientView.demographics.height_cm} cm · </span>
              )}
              {patientView.demographics?.weight_kg != null && (
                <span>{patientView.demographics.weight_kg} kg</span>
              )}
              {patientView.demographics?.bmi != null && (
                <span> · BMI {patientView.demographics.bmi}</span>
              )}
            </p>
            {patientView.lifestyle && (
              <p>
                <span className="text-slate-500">Lifestyle: </span>
                {patientView.lifestyle.physical_activity_level && (
                  <span>
                    {patientView.lifestyle.physical_activity_level} activity ·{" "}
                  </span>
                )}
                {patientView.lifestyle.weekly_exercise_hours != null && (
                  <span>
                    {patientView.lifestyle.weekly_exercise_hours}h/wk exercise ·{" "}
                  </span>
                )}
                {patientView.lifestyle.daily_steps_reported != null && (
                  <span>
                    {patientView.lifestyle.daily_steps_reported} steps/day ·{" "}
                  </span>
                )}
                {patientView.lifestyle.sleep_quality_subjective && (
                  <span>
                    Sleep: {patientView.lifestyle.sleep_quality_subjective} ·{" "}
                  </span>
                )}
                {patientView.lifestyle.alcohol_consumption && (
                  <span>
                    Alcohol: {patientView.lifestyle.alcohol_consumption} ·{" "}
                  </span>
                )}
                {patientView.lifestyle.smoking_habit && (
                  <span>Smoking: {patientView.lifestyle.smoking_habit}</span>
                )}
              </p>
            )}
            {patientView.preferences && (
              <p>
                <span className="text-slate-500">Preferences: </span>
                {patientView.preferences.preferred_cuisine && (
                  <span>{patientView.preferences.preferred_cuisine} cuisine · </span>
                )}
                {Array.isArray(patientView.preferences.food_aversions) &&
                  patientView.preferences.food_aversions.length > 0 && (
                    <span>
                      Aversions:{" "}
                      {patientView.preferences.food_aversions.join(", ")} ·{" "}
                    </span>
                  )}
                {patientView.preferences.cultural_religious_restrictions && (
                  <span>
                    {patientView.preferences.cultural_religious_restrictions} ·{" "}
                  </span>
                )}
                {patientView.preferences.goal && (
                  <span>Goal: {patientView.preferences.goal}</span>
                )}
              </p>
            )}
            {patientView.daily_log?.["24h_food_diary_text"] && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  24h food diary
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-800">
                  {patientView.daily_log["24h_food_diary_text"]}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {patientView?.daily_log?.["24h_food_diary_text"] ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              Journal analysis
            </h3>
            <Badge variant="gray">{plan?.status ?? "draft"}</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Generate structured guidance from the diary, then edit fields before
            saving the draft or publishing.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              loading={journalBusy}
              disabled={journalBusy}
              onClick={async () => {
                setJournalBusy(true);
                setJournalError("");
                try {
                  const diary =
                    patientView.daily_log?.["24h_food_diary_text"] || "";
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
                  setDashboardData((prev) => ({
                    ...prev,
                    journalReview: mapped,
                  }));
                } catch (e) {
                  setJournalError(e.message || "Could not analyze journal");
                } finally {
                  setJournalBusy(false);
                }
              }}
            >
              Analyze food journal
            </Button>
          </div>

          {journalError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {journalError}
            </div>
          ) : null}

          {journalReview ? (
            <div className="mt-6 grid gap-4">
              <label className="block">
                <span className={labelClass}>Diet rules &amp; priorities</span>
                <textarea
                  className={inputClass}
                  rows={6}
                  value={journalReview.clinical_logic || ""}
                  onChange={(e) =>
                    setDashboardData((prev) => ({
                      ...prev,
                      journalReview: {
                        ...(prev.journalReview || {}),
                        clinical_logic: e.target.value,
                      },
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className={labelClass}>Meal ideas</span>
                <textarea
                  className={inputClass}
                  rows={5}
                  value={journalReview.culinary_creative || ""}
                  onChange={(e) =>
                    setDashboardData((prev) => ({
                      ...prev,
                      journalReview: {
                        ...(prev.journalReview || {}),
                        culinary_creative: e.target.value,
                      },
                    }))
                  }
                />
              </label>
              <label className="block">
                <span className={labelClass}>Reference guidance</span>
                <textarea
                  className={inputClass}
                  rows={5}
                  value={journalReview.rag_retrieval || ""}
                  onChange={(e) =>
                    setDashboardData((prev) => ({
                      ...prev,
                      journalReview: {
                        ...(prev.journalReview || {}),
                        rag_retrieval: e.target.value,
                      },
                    }))
                  }
                />
              </label>
            </div>
          ) : (
            <p className="mt-6 text-sm italic text-slate-500">
              Run analysis to populate editable guidance fields.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Select a patient with a 24h food diary to unlock journal analysis.
        </div>
      )}
    </div>
  );
}
