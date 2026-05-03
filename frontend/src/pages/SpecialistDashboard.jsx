import { useCallback, useEffect, useState } from "react";
import Badge, { ConstraintPill } from "../components/UI/Badge.jsx";
import ClinicalInputForm from "../components/ClinicalInputForm.jsx";
import MealMatrix from "../components/MealMatrix.jsx";
import PatientInsightView from "../components/PatientInsightView.jsx";
import {
  medicalApi,
  patientApi,
  recommendationApi,
} from "../api/baseFetch.js";
import { pollUntilMatrixDone } from "../api/recommendationApi.js";
import { Progress } from "@/components/shadcn/progress.jsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/shadcn/tabs.jsx";
import "./SpecialistDashboard.css";

function MatrixGenerationBanner({ elapsedSec }) {
  const pseudoProgress = Math.min(
    94,
    8 + Math.min(elapsedSec, 720) / 10,
  );
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
      <Progress value={pseudoProgress} className="h-2.5" />
      <p className="mt-2 text-xs text-amber-900">
        Generating meal matrix… {elapsedSec}s elapsed
      </p>
    </div>
  );
}

function splitList(s) {
  return String(s || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function BiomarkerCard({ label, value, unit, normalRange }) {
  const hasVal = value !== null && value !== undefined && value !== "";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">
        {hasVal ? value : "–"}
        {hasVal && (
          <span className="text-sm font-normal text-slate-500">{unit}</span>
        )}
      </div>
      {normalRange ? (
        <div className="mt-1 text-[11px] text-slate-400">
          Normal: {normalRange}
        </div>
      ) : null}
    </div>
  );
}

function SavedClinicalObject({ result }) {
  if (!result) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">
          Saved clinical object
        </h3>
        <Badge variant="green" dot>
          Saved
        </Badge>
      </div>
      <div className="mt-4 grid gap-4">
        <div className="flex flex-wrap gap-2">
          {(result.primary_disease || result.icd10) && (
            <Badge variant="blue">{result.primary_disease || result.icd10}</Badge>
          )}
          {result.severity && (
            <Badge
              variant={
                String(result.severity).toLowerCase() === "severe" ||
                String(result.severity).toLowerCase() === "high"
                  ? "red"
                  : String(result.severity).toLowerCase() === "moderate"
                    ? "amber"
                    : "green"
              }
            >
              {result.severity}
            </Badge>
          )}
        </div>
        {result.biomarkers && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Biometric markers
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <BiomarkerCard
                label="Systolic BP"
                value={result.biomarkers.systolic_bp}
                unit=" mmHg"
                normalRange="90–120"
              />
              <BiomarkerCard
                label="Diastolic BP"
                value={result.biomarkers.diastolic_bp}
                unit=" mmHg"
                normalRange="60–80"
              />
              <BiomarkerCard
                label="Glucose"
                value={result.biomarkers.glucose}
                unit=" mg/dL"
                normalRange="70–99"
              />
              <BiomarkerCard
                label="Cholesterol"
                value={result.biomarkers.cholesterol}
                unit=" mg/dL"
                normalRange="< 200"
              />
            </div>
          </div>
        )}
        {result.body_composition && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Body composition
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <BiomarkerCard
                label="Body fat %"
                value={
                  result.body_composition.body_fat_percentage ??
                  result.body_composition.fat_pct
                }
                unit="%"
              />
              <BiomarkerCard
                label="Water %"
                value={
                  result.body_composition.body_water_percentage ??
                  result.body_composition.water_pct
                }
                unit="%"
              />
              <BiomarkerCard
                label="Muscle mass"
                value={result.body_composition.muscle_mass_kg}
                unit=" kg"
              />
              <BiomarkerCard
                label="Visceral fat"
                value={result.body_composition.visceral_fat_level}
                unit=""
              />
              <BiomarkerCard
                label="Metabolic age"
                value={result.body_composition.metabolic_age}
                unit=""
              />
            </div>
          </div>
        )}
        {result.clinical_constraints?.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Clinical constraints
            </div>
            <div className="flex flex-wrap gap-2">
              {result.clinical_constraints.map((c, i) => (
                <ConstraintPill key={i} type={c.type} value={c.value} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

  const runSearch = useCallback(async () => {
    setSearchBusy(true);
    try {
      const { patients } = await patientApi.search(dashboardData.searchQ);
      setDashboardData((d) => ({
        ...d,
        searchResults: patients || [],
      }));
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
        setDashboardData((d) => ({
          ...d,
          searchResults: patients || [],
        })),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const rid = dashboardData.selectedRecordId;
    if (!rid) {
      setDashboardData((d) => ({ ...d, patientView: null }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await patientApi.getForSpecialist(rid);
        if (!cancelled)
          setDashboardData((prev) => ({ ...prev, patientView: p }));
      } catch {
        if (!cancelled)
          setDashboardData((prev) => ({ ...prev, patientView: null }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dashboardData.selectedRecordId]);

  useEffect(() => {
    setDashboardData((d) => ({
      ...d,
      journalReview: null,
      decision: null,
    }));
  }, [dashboardData.selectedRecordId]);

  useEffect(() => {
    if (!matrixJobInfo) {
      setMatrixElapsedSec(0);
      return;
    }
    const t0 = matrixJobInfo.startedAt;
    const id = setInterval(() => {
      setMatrixElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [matrixJobInfo]);

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
    setDashboardData((d) => ({
      ...d,
      result: null,
      plan: null,
      decision: null,
    }));
    try {
      const comorb = splitList(comorbiditiesText);
      const genetic = splitList(geneticText);
      const clinical_assessment = {
        primary_disease: primaryDisease || null,
        severity: severity || null,
        comorbidities: comorb.length ? comorb : ["None"],
        genetic_risk_factors: genetic.length ? genetic : [],
      };
      const bp = systolic && diastolic ? `${systolic}/${diastolic}` : null;
      const biometric_markers = {
        blood_pressure_mmhg: bp,
        glucose_mg_dl: glucose === "" ? null : Number(glucose),
        cholesterol_mg_dl: cholesterol === "" ? null : Number(cholesterol),
      };
      const body_composition = {
        body_fat_percentage: fatPct === "" ? null : Number(fatPct),
        body_water_percentage: waterPct === "" ? null : Number(waterPct),
        muscle_mass_kg: muscleKg === "" ? null : Number(muscleKg),
        visceral_fat_level: visceral === "" ? null : Number(visceral),
        metabolic_age: metabolicAge === "" ? null : Number(metabolicAge),
      };
      const strict_constraints = {
        allergies: splitList(allergiesText),
        dietary_restrictions: splitList(restrictionsText),
        mandatory_clinical_notes: mandatoryNotes.trim() || null,
      };
      const payload = {
        clinical_assessment,
        biometric_markers,
        body_composition,
        strict_constraints,
      };
      const specObj = await medicalApi.saveClinical(selectedRecordId, payload);
      setDashboardData((d) => ({ ...d, result: specObj }));

      setPlanActionMsg("Starting meal matrix job…");
      const start = await recommendationApi.generatePlan(selectedRecordId, {});
      const matrixJobId = start.jobId;
      setMatrixJobInfo({ startedAt: Date.now() });
      setPlanActionMsg("Generating meal matrix…");
      await pollUntilMatrixDone(matrixJobId);
      setMatrixJobInfo(null);
      setPlanActionMsg("Saving draft plan…");
      const planData = await recommendationApi.completePlan(selectedRecordId, {
        jobId: matrixJobId,
      });
      setDashboardData((d) => ({
        ...d,
        plan: planData,
        journalReview: planData.plan?.llm_outputs ?? null,
      }));
      setPlanActionMsg("");
      setActiveTab("meal");
    } catch (e) {
      setMatrixJobInfo(null);
      setError(
        e.message ||
          "Failed to submit — if a job was started, check logs or retry saving the draft later.",
      );
      setPlanActionMsg("");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftToServer() {
    const { selectedRecordId, plan, journalReview } = dashboardData;
    if (!selectedRecordId || !plan?.plan) {
      setPlanActionMsg("Generate a plan first.");
      return;
    }
    setPlanActionBusy(true);
    setPlanActionMsg("");
    setApproveSafetyError("");
    try {
      await recommendationApi.updateDraft(selectedRecordId, {
        llm_outputs: journalReview,
        clinical_strategy: plan.plan.clinical_strategy,
        meal_matrix: plan.plan.meal_matrix,
        shopping_list: plan.plan.shopping_list,
        target_macros: plan.plan.target_macros,
      });
      setPlanActionMsg("Draft saved.");
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
    setPlanActionMsg("");
    setApproveSafetyError("");
    try {
      setPlanActionMsg("Regenerating matrix…");
      const start = await recommendationApi.regeneratePlan(
        selectedRecordId,
        {},
      );
      const regenJobId = start.jobId;
      setMatrixJobInfo({ startedAt: Date.now() });
      await pollUntilMatrixDone(regenJobId);
      setMatrixJobInfo(null);
      const planData = await recommendationApi.completePlan(selectedRecordId, {
        jobId: regenJobId,
      });
      setDashboardData((d) => ({
        ...d,
        plan: planData,
        decision: null,
        journalReview: planData.plan?.llm_outputs ?? null,
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
    const { selectedRecordId, plan, journalReview } = dashboardData;
    await recommendationApi.approvePlan(selectedRecordId, {
      llm_outputs: journalReview,
      clinical_strategy: plan.plan.clinical_strategy,
      meal_matrix: plan.plan.meal_matrix,
    });
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

  return (
    <div className="specialistDashboardPage flex flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">
          Specialist Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter clinical data for the patient. The system generates an AI-assisted
          diet matrix for your review and approval.
        </p>
      </header>

      {matrixJobInfo ? (
        <MatrixGenerationBanner elapsedSec={matrixElapsedSec} />
      ) : null}

      {approveSafetyError ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm"
          role="alert"
        >
          <strong>Safety check:</strong> {approveSafetyError}
        </div>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          <TabsTrigger value="workspace" className="text-xs sm:text-sm">
            Workspace (input)
          </TabsTrigger>
          <TabsTrigger value="insights" className="text-xs sm:text-sm">
            Patient insights
          </TabsTrigger>
          <TabsTrigger value="meal" className="text-xs sm:text-sm">
            Meal plan review
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="mt-6 flex flex-col gap-6">
          <ClinicalInputForm
            dashboardData={dashboardData}
            setDashboardData={setDashboardData}
            searchBusy={searchBusy}
            onSearch={runSearch}
            submit={submit}
            busy={busy}
            error={error}
          />
          <SavedClinicalObject result={dashboardData.result} />
        </TabsContent>

        <TabsContent value="insights" className="mt-6">
          <PatientInsightView
            dashboardData={dashboardData}
            setDashboardData={setDashboardData}
            journalBusy={journalBusy}
            setJournalBusy={setJournalBusy}
            journalError={journalError}
            setJournalError={setJournalError}
          />
        </TabsContent>

        <TabsContent value="meal" className="mt-6">
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
                details?.errors?.join?.("\n") || e.message || "Approval blocked";
              setApproveSafetyError(msg);
            }}
            planActionBusy={planActionBusy}
            planActionMsg={planActionMsg}
            saveDraftToServer={saveDraftToServer}
            regenerateDraft={regenerateDraft}
            discardDraft={discardDraft}
          />

          {dashboardData.decision ? (
            <div
              className={`mx-auto mt-4 max-w-6xl rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm ${
                dashboardData.decision === "approve"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : dashboardData.decision === "reject"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {dashboardData.decision === "approve"
                ? "✓ Plan approved (macros computed)."
                : dashboardData.decision === "reject"
                  ? "✕ Plan rejected."
                  : "✎ Plan flagged for modification."}
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
