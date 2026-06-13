import { useCallback, useEffect, useRef, useState } from "react";
import ClinicalInputForm from "../components/ClinicalInputForm.jsx";
import MealMatrix from "../components/MealMatrix.jsx";
import PatientInsightView from "../components/PatientInsightView.jsx";
import { medicalApi, patientApi, recommendationApi } from "../api/baseFetch.js";
import { pollUntilMatrixDone } from "../api/recommendationApi.js";
import {
  normalizePlanForDashboard,
  planHasMatrix,
} from "../utils/planShape.js";
import "./SpecialistDashboard.css";

/* ── tiny icon helper ─────────────────────────────────────────────────────── */
function Icon({
  d,
  size = 16,
  stroke = "currentColor",
  fill = "none",
  sw = 2,
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
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
  workspace:
    "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18",
  insights:
    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  meal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  check: "M20 6 9 17l-5-5",
  alert:
    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  saved:
    "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8",
  bio: "M22 12h-4l-3 9L9 3l-3 9H2",
  body: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
};

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

/* ── Generation banner ──────────────────────────────────────────────────── */
function MatrixGenerationBanner({ elapsedSec }) {
  const pct = Math.min(94, 8 + Math.min(elapsedSec, 720) / 10);
  return (
    <div className="sd-gen-banner">
      <div className="sd-gen-bar-track">
        <div className="sd-gen-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="sd-gen-label">
        Generating meal matrix… {elapsedSec}s elapsed — this usually takes
        60–120 s
      </div>
    </div>
  );
}

/* ── Biomarker tile ─────────────────────────────────────────────────────── */
function BiomarkerTile({ label, value, unit, normalRange }) {
  const hasVal = value !== null && value !== undefined && value !== "";
  return (
    <div className="sd-biomarker-tile">
      <div className="sd-biomarker-label">{label}</div>
      <div className="sd-biomarker-value">
        {hasVal ? value : <span style={{ color: "#cbd5e1" }}>—</span>}
        {hasVal && <span className="sd-biomarker-unit">&nbsp;{unit}</span>}
      </div>
      {normalRange && (
        <div className="sd-biomarker-range">Normal: {normalRange}</div>
      )}
    </div>
  );
}

/* ── Saved clinical object ──────────────────────────────────────────────── */
function SavedClinicalObject({ result }) {
  if (!result) return null;

  const severityVariant = (() => {
    const s = String(result.severity || "").toLowerCase();
    if (s === "severe" || s === "high") return "sd-badge-red";
    if (s === "moderate") return "sd-badge-amber";
    return "sd-badge-green";
  })();

  return (
    <div className="sd-saved-obj">
      <div className="sd-saved-obj-header">
        <div>
          <div
            style={{ fontSize: 14, fontWeight: 700, color: "var(--sd-text)" }}
          >
            Saved clinical object
          </div>
          <div
            style={{ fontSize: 12, color: "var(--sd-text-3)", marginTop: 2 }}
          >
            Persisted to patient record · used for AI matrix generation
          </div>
        </div>
        <span className="sd-badge sd-badge-green">
          <span className="sd-badge-dot" style={{ background: "#22c55e" }} />
          Saved
        </span>
      </div>

      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(result.primary_disease || result.icd10) && (
            <span className="sd-badge sd-badge-indigo">
              {result.primary_disease || result.icd10}
            </span>
          )}
          {result.severity && (
            <span className={`sd-badge ${severityVariant}`}>
              {result.severity}
            </span>
          )}
        </div>

        {/* Biomarkers */}
        {result.biomarkers && (
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                color: "var(--sd-text-3)",
                marginBottom: 8,
              }}
            >
              Biometric markers
            </div>
            <div className="sd-biomarker-grid">
              <BiomarkerTile
                label="Systolic BP"
                value={result.biomarkers.systolic_bp}
                unit="mmHg"
                normalRange="90–120"
              />
              <BiomarkerTile
                label="Diastolic BP"
                value={result.biomarkers.diastolic_bp}
                unit="mmHg"
                normalRange="60–80"
              />
              <BiomarkerTile
                label="Glucose"
                value={result.biomarkers.glucose}
                unit="mg/dL"
                normalRange="70–99"
              />
              <BiomarkerTile
                label="Cholesterol"
                value={result.biomarkers.cholesterol}
                unit="mg/dL"
                normalRange="< 200"
              />
            </div>
          </div>
        )}

        {/* Body composition */}
        {result.body_composition && (
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                color: "var(--sd-text-3)",
                marginBottom: 8,
              }}
            >
              Body composition
            </div>
            <div className="sd-biomarker-grid">
              <BiomarkerTile
                label="Body fat"
                value={
                  result.body_composition.body_fat_percentage ??
                  result.body_composition.fat_pct
                }
                unit="%"
              />
              <BiomarkerTile
                label="Water"
                value={
                  result.body_composition.body_water_percentage ??
                  result.body_composition.water_pct
                }
                unit="%"
              />
              <BiomarkerTile
                label="Muscle mass"
                value={result.body_composition.muscle_mass_kg}
                unit="kg"
              />
              <BiomarkerTile
                label="Visceral fat"
                value={result.body_composition.visceral_fat_level}
                unit=""
              />
              <BiomarkerTile
                label="Metabolic age"
                value={result.body_composition.metabolic_age}
                unit="yr"
              />
            </div>
          </div>
        )}

        {/* Constraints */}
        {result.clinical_constraints?.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".07em",
                color: "var(--sd-text-3)",
                marginBottom: 8,
              }}
            >
              Clinical constraints
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {result.clinical_constraints.map((c, i) => (
                <span
                  key={i}
                  className={`sd-pill ${c.type === "allergy" ? "sd-pill-allergy" : "sd-pill-restriction"}`}
                >
                  <span style={{ fontSize: 10 }}>
                    {c.type === "allergy" ? "⚠" : "⊘"}
                  </span>
                  {c.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function splitList(s) {
  return String(s || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const TABS = [
  { id: "workspace", label: "Workspace", icon: I.workspace },
  { id: "insights", label: "Patient insights", icon: I.insights },
  { id: "meal", label: "Meal plan review", icon: I.meal },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function SpecialistDashboard() {
  const [dashboardData, setDashboardData] = useState({
    searchQ: "",
    searchResults: [],
    selectedRecordId: null,
    patientView: null,
    primaryDisease: "",
    severity: "Moderate",
    comorbiditiesText: "None",
    geneticText: "",
    systolic: "",
    diastolic: "",
    glucose: "",
    cholesterol: "",
    fatPct: "",
    waterPct: "",
    muscleKg: "",
    visceral: "",
    metabolicAge: "",
    allergiesText: "",
    restrictionsText: "",
    mandatoryNotes: "",
    result: null,
    plan: null,
    decision: null,
    journalReview: null,
  });

  const [tdeeGoal, setTdeeGoal] = useState("maintenance");
  const activeTdeeTargetsRef = useRef(null);
  const onTdeeTargetsChange = useCallback((targets) => {
    activeTdeeTargetsRef.current = targets;
  }, []);

  const [activeTab, setActiveTab] = useState("workspace");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [planActionBusy, setPlanActionBusy] = useState(false);
  const [planActionMsg, setPlanActionMsg] = useState("");
  const [approveSafetyError, setApproveSafetyError] = useState("");
  const [matrixJobInfo, setMatrixJobInfo] = useState(null);
  const [matrixElapsedSec, setMatrixElapsedSec] = useState(0);
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalError, setJournalError] = useState("");
  const [planLoading, setPlanLoading] = useState(false);

  /* ── search ─────────────────────────────────────────────────────────── */
  const runSearch = useCallback(async () => {
    setSearchBusy(true);
    try {
      const { patients } = await patientApi.search(dashboardData.searchQ);
      setDashboardData((d) => ({ ...d, searchResults: patients || [] }));
    } catch (e) {
      setError(e.message || "Search failed");
    } finally {
      setSearchBusy(false);
    }
  }, [dashboardData.searchQ]);

  useEffect(() => {
    patientApi
      .search("")
      .then(({ patients }) =>
        setDashboardData((d) => ({ ...d, searchResults: patients || [] })),
      )
      .catch(() => {});
  }, []);

  /* ── load patient view ──────────────────────────────────────────────── */
  useEffect(() => {
    const rid = dashboardData.selectedRecordId;
    if (!rid) {
      setDashboardData((d) => ({ ...d, patientView: null, plan: null, result: null }));
      setPlanLoading(false);
      return;
    }
    let cancelled = false;
    setPlanLoading(true);
    (async () => {
      const [patientRes, specialistRes, latestPlanRes] = await Promise.allSettled([
        patientApi.getForSpecialist(rid),
        medicalApi.getSpecialistObject(rid),
        recommendationApi.getLatestPlan(rid),
      ]);
      if (cancelled) return;

      const patientView =
        patientRes.status === "fulfilled" ? patientRes.value : null;
      const specialistObject =
        specialistRes.status === "fulfilled" ? specialistRes.value : null;
      const latestPlanRaw =
        latestPlanRes.status === "fulfilled" ? latestPlanRes.value : null;
      const latestPlan = normalizePlanForDashboard(latestPlanRaw);

      const biomarkers = specialistObject?.biomarkers || {};
      const body = specialistObject?.body_composition || {};
      const constraints = Array.isArray(specialistObject?.clinical_constraints)
        ? specialistObject.clinical_constraints
        : [];
      const allergyValues = constraints
        .filter((c) => c?.type === "allergy")
        .map((c) => String(c.value || "").trim())
        .filter(Boolean);
      const restrictionValues = constraints
        .filter((c) => c?.type === "restriction")
        .map((c) => String(c.value || "").trim())
        .filter(Boolean);
      const noteValues = constraints
        .filter((c) => c?.type === "note")
        .map((c) => String(c.value || "").trim())
        .filter(Boolean);

      setDashboardData((prev) => ({
        ...prev,
        patientView,
        plan: latestPlan,
        result: specialistObject,
        primaryDisease:
          specialistObject?.primary_disease ??
          specialistObject?.icd10 ??
          "",
        severity: specialistObject?.severity ?? "Moderate",
        comorbiditiesText: Array.isArray(specialistObject?.comorbidities)
          ? specialistObject.comorbidities.join("\n")
          : "None",
        geneticText: Array.isArray(specialistObject?.genetic_risk_factors)
          ? specialistObject.genetic_risk_factors.join("\n")
          : "",
        systolic:
          biomarkers?.systolic_bp != null ? String(biomarkers.systolic_bp) : "",
        diastolic:
          biomarkers?.diastolic_bp != null ? String(biomarkers.diastolic_bp) : "",
        glucose: biomarkers?.glucose != null ? String(biomarkers.glucose) : "",
        cholesterol:
          biomarkers?.cholesterol != null ? String(biomarkers.cholesterol) : "",
        fatPct:
          (body?.body_fat_percentage ?? body?.fat_pct) != null
            ? String(body?.body_fat_percentage ?? body?.fat_pct)
            : "",
        waterPct:
          (body?.body_water_percentage ?? body?.water_pct) != null
            ? String(body?.body_water_percentage ?? body?.water_pct)
            : "",
        muscleKg: body?.muscle_mass_kg != null ? String(body.muscle_mass_kg) : "",
        visceral:
          body?.visceral_fat_level != null ? String(body.visceral_fat_level) : "",
        metabolicAge:
          body?.metabolic_age != null ? String(body.metabolic_age) : "",
        allergiesText: allergyValues.join("\n"),
        restrictionsText: restrictionValues.join("\n"),
        mandatoryNotes: noteValues.join("\n"),
        decision: null,
      }));
      const savedGoal =
        latestPlan?.plan?.target_macros?.goal ??
        latestPlan?.target_macros?.goal;
      if (
        savedGoal === "loss" ||
        savedGoal === "maintenance" ||
        savedGoal === "gain"
      ) {
        setTdeeGoal(savedGoal);
      }

      if (planHasMatrix(latestPlan)) {
        setActiveTab("meal");
      }
      setPlanLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardData.selectedRecordId]);

  /* ── elapsed timer ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!matrixJobInfo) {
      setMatrixElapsedSec(0);
      return;
    }
    const t0 = matrixJobInfo.startedAt;
    const id = setInterval(
      () => setMatrixElapsedSec(Math.floor((Date.now() - t0) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [matrixJobInfo]);

  /* ── submit ─────────────────────────────────────────────────────────── */
  async function submit() {
    const {
      selectedRecordId,
      primaryDisease,
      severity,
      comorbiditiesText,
      geneticText,
      systolic,
      diastolic,
      glucose,
      cholesterol,
      fatPct,
      waterPct,
      muscleKg,
      visceral,
      metabolicAge,
      allergiesText,
      restrictionsText,
      mandatoryNotes,
    } = dashboardData;

    if (!selectedRecordId) {
      setError("Select a patient first.");
      return;
    }

    setBusy(true);
    setError("");
    setApproveSafetyError("");
    setDashboardData((d) => ({
      ...d,
      result: null,
      plan: null,
      decision: null,
    }));

    try {
      const comorb = splitList(comorbiditiesText);
      const genetic = splitList(geneticText);
      const bp = systolic && diastolic ? `${systolic}/${diastolic}` : null;

      const payload = {
        clinical_assessment: {
          primary_disease: primaryDisease || null,
          severity: severity || null,
          comorbidities: comorb.length ? comorb : ["None"],
          genetic_risk_factors: genetic.length ? genetic : [],
        },
        biometric_markers: {
          blood_pressure_mmhg: bp,
          glucose_mg_dl: glucose === "" ? null : Number(glucose),
          cholesterol_mg_dl: cholesterol === "" ? null : Number(cholesterol),
        },
        body_composition: {
          body_fat_percentage: fatPct === "" ? null : Number(fatPct),
          body_water_percentage: waterPct === "" ? null : Number(waterPct),
          muscle_mass_kg: muscleKg === "" ? null : Number(muscleKg),
          visceral_fat_level: visceral === "" ? null : Number(visceral),
          metabolic_age: metabolicAge === "" ? null : Number(metabolicAge),
        },
        strict_constraints: {
          allergies: splitList(allergiesText),
          dietary_restrictions: splitList(restrictionsText),
          mandatory_clinical_notes: mandatoryNotes.trim() || null,
        },
      };

      const specObj = await medicalApi.saveClinical(selectedRecordId, payload);
      setDashboardData((d) => ({ ...d, result: specObj }));

      setPlanActionMsg("Starting meal matrix job…");
      const target_macros = activeTdeeTargetsRef.current;
      const start = await recommendationApi.generatePlan(selectedRecordId, {
        target_macros,
      });
      setMatrixJobInfo({ startedAt: Date.now() });
      setPlanActionMsg("Generating meal matrix…");
      await pollUntilMatrixDone(start.jobId);
      setMatrixJobInfo(null);
      setPlanActionMsg("Saving draft plan…");
      const planData = await recommendationApi.completePlan(selectedRecordId, {
        jobId: start.jobId,
      });
      setDashboardData((d) => ({
        ...d,
        plan: normalizePlanForDashboard(planData),
      }));
      setPlanActionMsg("");
      setActiveTab("meal");
    } catch (e) {
      setMatrixJobInfo(null);
      setError(e.message || "Submit failed — check logs or retry.");
      setPlanActionMsg("");
    } finally {
      setBusy(false);
    }
  }

  /* ── plan actions ───────────────────────────────────────────────────── */
  async function saveDraftToServer() {
    const { selectedRecordId, plan } = dashboardData;
    if (!selectedRecordId || !plan?.plan) {
      setPlanActionMsg("Generate a plan first.");
      return;
    }
    setPlanActionBusy(true);
    setPlanActionMsg("");
    setApproveSafetyError("");
    try {
      await recommendationApi.updateDraft(selectedRecordId, {
        clinical_strategy: plan.plan.clinical_strategy,
        meal_matrix: plan.plan.meal_matrix,
        shopping_list: plan.plan.shopping_list,
        target_macros:
          activeTdeeTargetsRef.current ?? plan.plan.target_macros,
      });
      const refreshed = await recommendationApi.getLatestPlan(selectedRecordId);
      setDashboardData((d) => ({
        ...d,
        plan: normalizePlanForDashboard(refreshed),
      }));
      setPlanActionMsg(
        plan.status === "approved" ? "Changes saved." : "Draft saved.",
      );
    } catch (e) {
      setPlanActionMsg(e.message || "Save failed");
    } finally {
      setPlanActionBusy(false);
    }
  }

  async function regenerateDraft() {
    const { selectedRecordId } = dashboardData;
    if (!selectedRecordId) return;
    setPlanActionBusy(true);
    setPlanActionMsg("Regenerating matrix…");
    setApproveSafetyError("");
    try {
      const start = await recommendationApi.regeneratePlan(selectedRecordId, {
        target_macros: activeTdeeTargetsRef.current,
      });
      setMatrixJobInfo({ startedAt: Date.now() });
      await pollUntilMatrixDone(start.jobId);
      setMatrixJobInfo(null);
      const planData = await recommendationApi.completePlan(selectedRecordId, {
        jobId: start.jobId,
      });
      setDashboardData((d) => ({
        ...d,
        plan: normalizePlanForDashboard(planData),
        decision: null,
      }));
      setPlanActionMsg("New AI draft generated.");
    } catch (e) {
      setMatrixJobInfo(null);
      setPlanActionMsg(e.message || "Regenerate failed");
    } finally {
      setPlanActionBusy(false);
    }
  }

  async function approvePlanFromDashboard() {
    const { selectedRecordId, plan } = dashboardData;
    await recommendationApi.approvePlan(selectedRecordId, {
      clinical_strategy: plan.plan.clinical_strategy,
      meal_matrix: plan.plan.meal_matrix,
    });
    const refreshed = await recommendationApi.getLatestPlan(selectedRecordId);
    setDashboardData((d) => ({
      ...d,
      plan: normalizePlanForDashboard(refreshed),
    }));
  }

  async function discardDraft() {
    const { selectedRecordId } = dashboardData;
    if (!selectedRecordId) return;
    if (
      !window.confirm("Discard the current draft plan? This cannot be undone.")
    )
      return;
    setPlanActionBusy(true);
    setPlanActionMsg("");
    setApproveSafetyError("");
    try {
      await recommendationApi.discardDraft(selectedRecordId);
      setDashboardData((d) => ({
        ...d,
        plan: null,
        journalReview: null,
        decision: null,
      }));
      setPlanActionMsg("Draft discarded.");
    } catch (e) {
      setPlanActionMsg(e.message || "Discard failed");
    } finally {
      setPlanActionBusy(false);
    }
  }

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <div className="sd-page">
      {/* ── Header ── */}
      <div className="sd-page-header">
        <div>
          <h1 className="sd-page-title">Specialist Dashboard</h1>
          <p className="sd-page-subtitle">
            Enter clinical data · generate AI meal matrix · review and publish
          </p>
        </div>
      </div>

      {/* ── Generation banner ── */}
      {matrixJobInfo && (
        <MatrixGenerationBanner elapsedSec={matrixElapsedSec} />
      )}

      {/* ── Safety / approval error ── */}
      {approveSafetyError && (
        <div className="sd-alert sd-alert-error" role="alert">
          <Icon d={I.alert} size={15} />
          <div>
            <strong>Safety check:</strong> {approveSafetyError}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="sd-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`sd-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon d={tab.icon} size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════ TAB: WORKSPACE ═══════ */}
      {activeTab === "workspace" && (
        <div className="sd-tab-content">
          <div className="sd-clinical-wrap">
            <ClinicalInputForm
              dashboardData={dashboardData}
              setDashboardData={setDashboardData}
              searchBusy={searchBusy}
              onSearch={runSearch}
              submit={submit}
              busy={busy}
              error={error}
              tdeeGoal={tdeeGoal}
              setTdeeGoal={setTdeeGoal}
              onTdeeTargetsChange={onTdeeTargetsChange}
            />
            {dashboardData.result && (
              <SavedClinicalObject result={dashboardData.result} />
            )}
          </div>
        </div>
      )}

      {/* ═══════ TAB: PATIENT INSIGHTS ═══════ */}
      {activeTab === "insights" && (
        <div className="sd-tab-content">
          <PatientInsightView
            dashboardData={dashboardData}
            setDashboardData={setDashboardData}
            journalBusy={journalBusy}
            setJournalBusy={setJournalBusy}
            journalError={journalError}
            setJournalError={setJournalError}
          />
        </div>
      )}

      {/* ═══════ TAB: MEAL PLAN REVIEW ═══════ */}
      {activeTab === "meal" && (
        <div className="sd-tab-content">
          {planLoading ? (
            <div className="sd-empty">
              <Spinner size={28} />
              <div className="sd-empty-title" style={{ marginTop: 12 }}>
                Loading meal plan…
              </div>
            </div>
          ) : (
            <>
          <MealMatrix
            dashboardData={dashboardData}
            setDashboardData={setDashboardData}
            selectedRecordId={dashboardData.selectedRecordId}
            patientLabel={dashboardData.patientView?.patient_id || "Patient"}
            onApprove={approvePlanFromDashboard}
            onDecision={(decision) =>
              setDashboardData((d) => ({ ...d, decision }))
            }
            onApproveError={(e) => {
              const details = e?.data?.details;
              const msg =
                details?.errors?.join?.("\n") ||
                e.message ||
                "Approval blocked";
              setApproveSafetyError(msg);
            }}
            planActionBusy={planActionBusy}
            planActionMsg={planActionMsg}
            saveDraftToServer={saveDraftToServer}
            regenerateDraft={regenerateDraft}
            discardDraft={discardDraft}
          />

          {dashboardData.decision && (
            <div
              className={`sd-alert sd-decision-follow ${
                dashboardData.decision === "approve"
                  ? "sd-alert-success"
                  : dashboardData.decision === "reject"
                    ? "sd-alert-error"
                    : "sd-alert-info"
              }`}
            >
              <Icon d={I.check} size={15} />
              {dashboardData.decision === "approve"
                ? "Plan approved and published."
                : dashboardData.decision === "reject"
                  ? "Plan rejected."
                  : "Plan flagged for modification."}
            </div>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
