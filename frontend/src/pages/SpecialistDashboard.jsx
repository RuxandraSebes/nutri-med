import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../components/UI/Button.jsx";
import Badge, { ConstraintPill, StatusBadge } from "../components/UI/Badge.jsx";
import ClinicalInput from "../components/UI/ClinicalInput.jsx";
import MarkdownContent from "../components/UI/MarkdownContent.jsx";
import {
  aiApi,
  medicalApi,
  patientApi,
  recommendationApi,
} from "../api/baseFetch.js";
import { pollUntilMatrixDone } from "../api/recommendationApi.js";
import { Button as ShadButton } from "@/components/shadcn/button.jsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/card.jsx";
import "./SpecialistDashboard.css";

// ── Step config ───────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Diagnosis", short: "Dx" },
  { id: 2, label: "Biomarkers", short: "Bio" },
  { id: 3, label: "Composition", short: "Comp" },
  { id: 4, label: "Constraints", short: "Rx" },
];

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step, total }) {
  return (
    <div style={{ display: "flex", align: "center", gap: 0 }}>
      {STEPS.map((s, i) => {
        const done = s.id < step;
        const current = s.id === step;
        return (
          <div
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              flex: i < STEPS.length - 1 ? 1 : 0,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                  background: done
                    ? "var(--nutrition)"
                    : current
                      ? "var(--primary)"
                      : "var(--gray-200)",
                  color: done || current ? "#fff" : "var(--text-muted)",
                  transition: "background 0.2s",
                }}
              >
                {done ? "✓" : s.id}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: current ? 700 : 500,
                  color: current
                    ? "var(--primary)"
                    : done
                      ? "var(--nutrition)"
                      : "var(--text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: done ? "var(--nutrition)" : "var(--border)",
                  margin: "0 6px",
                  marginBottom: 18,
                  transition: "background 0.3s",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Validation sticky bar ─────────────────────────────────────────────────────
function ValidationBar({
  plan,
  patientLabel,
  recordId,
  onDecision,
  onApprove,
  onApproveError,
}) {
  const [busy, setBusy] = useState(null);

  async function decide(action) {
    if (action === "approve" && onApprove) {
      setBusy("approve");
      try {
        await onApprove();
        onDecision("approve");
      } catch (e) {
        if (onApproveError) onApproveError(e);
        else console.error(e);
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy(action);
    await new Promise((r) => setTimeout(r, 400));
    onDecision(action);
    setBusy(null);
  }

  if (!plan) return null;

  return (
    <div className="validation-bar" style={{ marginBottom: 0 }}>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: "var(--text-primary)",
          }}
        >
          Plan #{plan.plan_id ?? plan.id} pending specialist review
        </div>
        <div
          style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}
        >
          {patientLabel} (record #{recordId}) ·{" "}
          {plan.plan?.clinical_strategy ?? plan.clinical_strategy ?? "–"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <StatusBadge status="pending" />
        <Button
          variant="ghost"
          size="sm"
          loading={busy === "reject"}
          onClick={() => decide("reject")}
          style={{ color: "var(--red-600)", borderColor: "var(--red-100)" }}
        >
          Reject
        </Button>
        <Button
          variant="warning"
          size="sm"
          loading={busy === "modify"}
          onClick={() => decide("modify")}
        >
          Modify
        </Button>
        <Button
          variant="green"
          size="sm"
          loading={busy === "approve"}
          onClick={() => decide("approve")}
        >
          Approve & publish
        </Button>
      </div>
    </div>
  );
}

// ── Biometric card display ────────────────────────────────────────────────────
function BiomarkerCard({ label, value, unit, normalRange }) {
  const hasVal = value !== null && value !== undefined && value !== "";
  return (
    <div className="stat-card">
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div className="stat-value" style={{ color: "var(--text-primary)" }}>
        {hasVal ? value : "–"}
        {hasVal && <span className="stat-unit">{unit}</span>}
      </div>
      {normalRange && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Normal: {normalRange}
        </div>
      )}
    </div>
  );
}

// ── Specialist Dashboard ──────────────────────────────────────────────────────
function splitList(s) {
  return String(s || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function mapJournalAnalysisToReview(analysisText) {
  const text = String(analysisText || "").trim();
  if (!text) return null;

  // Extragere scor, analiză și versiunea îmbunătățită folosind regex
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
export default function SpecialistDashboard() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [plan, setPlan] = useState(null);
  const [decision, setDecision] = useState(null);
  const [planActionBusy, setPlanActionBusy] = useState(false);
  const [planActionMsg, setPlanActionMsg] = useState("");
  const [approveSafetyError, setApproveSafetyError] = useState("");

  const [searchQ, setSearchQ] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [patientView, setPatientView] = useState(null);

  const [primaryDisease, setPrimaryDisease] = useState("");
  const [severity, setSeverity] = useState("Moderate");
  const [comorbiditiesText, setComorbiditiesText] = useState("None");
  const [geneticText, setGeneticText] = useState("");

  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [glucose, setGlucose] = useState("");
  const [cholesterol, setCholesterol] = useState("");

  const [fatPct, setFatPct] = useState("");
  const [waterPct, setWaterPct] = useState("");
  const [muscleKg, setMuscleKg] = useState("");
  const [visceral, setVisceral] = useState("");
  const [metabolicAge, setMetabolicAge] = useState("");

  const [allergiesText, setAllergiesText] = useState("");
  const [restrictionsText, setRestrictionsText] = useState("");
  const [mandatoryNotes, setMandatoryNotes] = useState("");

  // Specialist journal review (generated from patient's diary, editable, then approved)
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalError, setJournalError] = useState("");
  const [journalReview, setJournalReview] = useState(null);

  const runSearch = useCallback(async () => {
    setSearchBusy(true);
    try {
      const { patients } = await patientApi.search(searchQ);
      setSearchResults(patients || []);
    } catch (e) {
      setError(e.message || "Search failed");
    } finally {
      setSearchBusy(false);
    }
  }, [searchQ]);

  useEffect(() => {
    patientApi
      .search("")
      .then(({ patients }) => setSearchResults(patients || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRecordId) {
      setPatientView(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await patientApi.getForSpecialist(selectedRecordId);
        if (!cancelled) setPatientView(p);
      } catch {
        if (!cancelled) setPatientView(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRecordId]);

  useEffect(() => {
    // When the draft plan is generated, prefill the editable journal review
    // with the server-generated llm outputs (can be edited by the specialist).
    const seeded = plan?.plan?.llm_outputs;
    if (seeded) setJournalReview(seeded);
  }, [plan]);

  useEffect(() => {
    // Switching patients should reset the draft.
    setJournalReview(null);
    setDecision(null);
  }, [selectedRecordId]);

  const canNext = useMemo(() => {
    if (step === 1) return selectedRecordId != null;
    return true;
  }, [step, selectedRecordId]);

  async function submit() {
    if (!selectedRecordId) {
      setError("Select a patient first.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setPlan(null);
    setDecision(null);
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
      setResult(specObj);

      setPlanActionMsg("Starting meal matrix job…");
      const start = await recommendationApi.generatePlan(selectedRecordId, {});
      setPlanActionMsg("Generating matrix (this may take several minutes)…");
      await pollUntilMatrixDone(start.jobId);
      setPlanActionMsg("Saving draft plan…");
      const planData = await recommendationApi.completePlan(selectedRecordId, {
        jobId: start.jobId,
      });
      setPlan(planData);
      setPlanActionMsg("");
      setStep(1);
    } catch (e) {
      setError(e.message || "Failed to submit");
      setPlanActionMsg("");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftToServer() {
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
    if (!selectedRecordId) return;
    setPlanActionBusy(true);
    setPlanActionMsg("");
    setApproveSafetyError("");
    try {
      setPlanActionMsg("Regenerating matrix…");
      const start = await recommendationApi.regeneratePlan(selectedRecordId, {});
      await pollUntilMatrixDone(start.jobId);
      const planData = await recommendationApi.completePlan(selectedRecordId, {
        jobId: start.jobId,
      });
      setPlan(planData);
      setDecision(null);
      setPlanActionMsg("New AI draft generated.");
    } catch (e) {
      setPlanActionMsg(e.message || "Regenerate failed");
    } finally {
      setPlanActionBusy(false);
    }
  }

  async function discardDraft() {
    if (!selectedRecordId) return;
    if (
      !window.confirm(
        "Discard the current draft plan? This cannot be undone.",
      )
    )
      return;
    setPlanActionBusy(true);
    setPlanActionMsg("");
    setApproveSafetyError("");
    try {
      await recommendationApi.discardDraft(selectedRecordId);
      setPlan(null);
      setJournalReview(null);
      setDecision(null);
      setPlanActionMsg("Draft discarded.");
    } catch (e) {
      setPlanActionMsg(e.message || "Discard failed");
    } finally {
      setPlanActionBusy(false);
    }
  }

  return (
    <div className="specialistDashboardPage">
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.03em",
            marginBottom: 3,
          }}
        >
          Specialist Dashboard
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Enter clinical data for the patient. The system will generate an
          AI-assisted diet plan for your review.
        </p>
      </div>

      {/* Validation sticky bar */}
      {plan && !decision && selectedRecordId && (
        <ValidationBar
          plan={plan}
          recordId={selectedRecordId}
          patientLabel={patientView?.patient_id || "Patient"}
          onDecision={setDecision}
          onApprove={() =>
            recommendationApi.approvePlan(selectedRecordId, {
              llm_outputs: journalReview,
              clinical_strategy: plan?.plan?.clinical_strategy,
              meal_matrix: plan?.plan?.meal_matrix,
            })
          }
          onApproveError={(e) => {
            const details = e?.data?.details;
            const msg =
              details?.errors?.join?.("\n") ||
              e.message ||
              "Approval blocked";
            setApproveSafetyError(msg);
          }}
        />
      )}

      {approveSafetyError ? (
        <div
          className="mb-3 rounded-lg border border-[var(--red-100)] bg-[var(--red-50)] px-4 py-3 text-sm text-[var(--red-700)]"
          role="alert"
        >
          <strong>Safety check:</strong> {approveSafetyError}
        </div>
      ) : null}

      {plan && selectedRecordId ? (
        <Card className="mb-4 border-[var(--border)] bg-[var(--surface)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Draft plan actions</CardTitle>
            <CardDescription>
              Save your edits, regenerate a new AI draft, or discard before
              publishing.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <ShadButton
              type="button"
              variant="secondary"
              disabled={planActionBusy}
              onClick={saveDraftToServer}
            >
              Save draft
            </ShadButton>
            <ShadButton
              type="button"
              variant="outline"
              disabled={planActionBusy}
              onClick={regenerateDraft}
            >
              Regenerate plan
            </ShadButton>
            <ShadButton
              type="button"
              variant="destructive"
              disabled={planActionBusy}
              onClick={discardDraft}
            >
              Discard draft
            </ShadButton>
            {planActionMsg ? (
              <span className="text-sm text-[var(--text-secondary)] self-center">
                {planActionMsg}
              </span>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {decision && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            marginBottom: 12,
            borderRadius: "var(--radius-md)",
            background:
              decision === "approve"
                ? "var(--green-50)"
                : decision === "reject"
                  ? "var(--red-50)"
                  : "var(--amber-50)",
            border: `1px solid ${decision === "approve" ? "var(--green-100)" : decision === "reject" ? "var(--red-100)" : "var(--amber-100)"}`,
            color:
              decision === "approve"
                ? "var(--green-700)"
                : decision === "reject"
                  ? "var(--red-600)"
                  : "var(--amber-600)",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          <span>
            {decision === "approve" ? "✓" : decision === "reject" ? "✕" : "✎"}
          </span>
          Plan{" "}
          {decision === "approve"
            ? "approved (macros computed)"
            : decision === "reject"
              ? "rejected"
              : "flagged for modification"}
          .
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="section-title">Find patient</div>
        </div>
        <div className="card-body">
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <input
              className="input"
              style={{ flex: 1, minWidth: 200 }}
              placeholder="Search by public ID (e.g. PT-…) or numeric record id"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
            <Button variant="primary" loading={searchBusy} onClick={runSearch}>
              Search
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div
              style={{
                display: "grid",
                gap: 6,
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedRecordId(p.id)}
                  className="nav-link"
                  style={{
                    justifyContent: "space-between",
                    textAlign: "left",
                    border:
                      selectedRecordId === p.id
                        ? "2px solid var(--primary)"
                        : "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {p.public_patient_id || `#${p.id}`}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    id {p.id}
                  </span>
                </button>
              ))}
            </div>
          )}
          {selectedRecordId && (
            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                color: "var(--green-600)",
                fontWeight: 600,
              }}
            >
              Selected record #{selectedRecordId}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* ── Left: input form ─────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="section-title">Clinical Input</div>
              <div className="section-subtitle">
                Step {step} of {STEPS.length} — {STEPS[step - 1].label}
              </div>
            </div>
          </div>
          <div className="card-body">
            <div style={{ marginBottom: 20 }}>
              <StepBar step={step} total={STEPS.length} />
            </div>

            {/* ── Step 1: Diagnosis ── */}
            {step === 1 && (
              <div style={{ display: "grid", gap: 14 }}>
                {!selectedRecordId && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--amber-600)",
                      fontWeight: 600,
                    }}
                  >
                    Use “Find patient” above before entering clinical data.
                  </div>
                )}
                <ClinicalInput
                  label="Primary disease / ICD-10 label"
                  hint="e.g. PCOS, E11"
                  value={primaryDisease}
                  onChange={(e) => setPrimaryDisease(e.target.value)}
                  placeholder="PCOS"
                />
                <ClinicalInput
                  label="Severity"
                  type="select"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="Mild">Mild</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Severe">Severe</option>
                  <option value="High">High</option>
                </ClinicalInput>
                <label className="field">
                  <span className="field-label">
                    Comorbidities (one per line or comma-separated)
                  </span>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={comorbiditiesText}
                    onChange={(e) => setComorbiditiesText(e.target.value)}
                    placeholder="None"
                  />
                </label>
                <label className="field">
                  <span className="field-label">
                    Genetic / family risk factors
                  </span>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={geneticText}
                    onChange={(e) => setGeneticText(e.target.value)}
                    placeholder="Type 2 Diabetes in family history"
                  />
                </label>
              </div>
            )}

            {/* ── Step 2: Biomarkers ── */}
            {step === 2 && (
              <div style={{ display: "grid", gap: 14 }}>
                <div className="grid-2">
                  <ClinicalInput
                    label="Systolic"
                    unit="mmHg"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    placeholder="120"
                  />
                  <ClinicalInput
                    label="Diastolic"
                    unit="mmHg"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    placeholder="80"
                  />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    paddingBottom: 2,
                    borderBottom: "1px solid var(--border)",
                    marginTop: 4,
                  }}
                >
                  Metabolic panel
                </div>
                <div className="grid-2">
                  <ClinicalInput
                    label="Fasting glucose"
                    unit="mg/dL"
                    value={glucose}
                    onChange={(e) => setGlucose(e.target.value)}
                    placeholder="92"
                  />
                  <ClinicalInput
                    label="Total cholesterol"
                    unit="mg/dL"
                    value={cholesterol}
                    onChange={(e) => setCholesterol(e.target.value)}
                    placeholder="185"
                  />
                </div>
              </div>
            )}

            {/* ── Step 3: Body composition ── */}
            {step === 3 && (
              <div style={{ display: "grid", gap: 14 }}>
                <div className="grid-2">
                  <ClinicalInput
                    label="Body Fat %"
                    unit="%"
                    value={fatPct}
                    onChange={(e) => setFatPct(e.target.value)}
                    placeholder="22.5"
                  />
                  <ClinicalInput
                    label="Water %"
                    unit="%"
                    value={waterPct}
                    onChange={(e) => setWaterPct(e.target.value)}
                    placeholder="55.0"
                  />
                </div>
                <div className="grid-2">
                  <ClinicalInput
                    label="Muscle Mass"
                    unit="kg"
                    value={muscleKg}
                    onChange={(e) => setMuscleKg(e.target.value)}
                    placeholder="42.1"
                  />
                  <ClinicalInput
                    label="Visceral fat level"
                    value={visceral}
                    onChange={(e) => setVisceral(e.target.value)}
                    placeholder="6"
                    hint="Smart scale"
                  />
                </div>
                <ClinicalInput
                  label="Metabolic age"
                  value={metabolicAge}
                  onChange={(e) => setMetabolicAge(e.target.value)}
                  placeholder="24"
                />
              </div>
            )}

            {/* ── Step 4: Constraints ── */}
            {step === 4 && (
              <div style={{ display: "grid", gap: 14 }}>
                <label className="field">
                  <span className="field-label">
                    Allergies (comma or newline)
                  </span>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={allergiesText}
                    onChange={(e) => setAllergiesText(e.target.value)}
                    placeholder="Peanuts"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Dietary restrictions</span>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={restrictionsText}
                    onChange={(e) => setRestrictionsText(e.target.value)}
                    placeholder="Low_Sugar, Anti_Inflammatory"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Mandatory clinical notes</span>
                  <textarea
                    className="textarea"
                    rows={3}
                    value={mandatoryNotes}
                    onChange={(e) => setMandatoryNotes(e.target.value)}
                    placeholder="Prioritize high-fiber foods…"
                  />
                </label>
              </div>
            )}

            {/* Navigation */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 20,
                alignItems: "center",
              }}
            >
              <Button
                variant="ghost"
                disabled={step === 1 || busy}
                onClick={() => setStep((s) => Math.max(1, s - 1))}
              >
                ← Back
              </Button>
              {step < STEPS.length ? (
                <Button
                  variant="primary"
                  disabled={!canNext || busy}
                  onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
                >
                  Next →
                </Button>
              ) : (
                <Button variant="green" loading={busy} onClick={submit}>
                  Submit & Generate Plan
                </Button>
              )}
              {error && (
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--danger)",
                    marginLeft: 8,
                  }}
                >
                  {error}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: results ───────────────────────────────────────────────── */}
        <div style={{ display: "grid", gap: 16 }}>
          {patientView && (
            <div className="card">
              <div className="card-header">
                <div className="section-title" style={{ fontSize: 15 }}>
                  Patient profile & journal
                </div>
                <Badge variant="blue">{patientView.patient_id}</Badge>
              </div>
              <div
                className="card-body"
                style={{ fontSize: 13, display: "grid", gap: 10 }}
              >
                <div>
                  <span style={{ color: "var(--text-muted)" }}>
                    Demographics:{" "}
                  </span>
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
                </div>
                {patientView.lifestyle && (
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>
                      Lifestyle:{" "}
                    </span>
                    {patientView.lifestyle.physical_activity_level && (
                      <span>
                        {patientView.lifestyle.physical_activity_level} activity
                        ·{" "}
                      </span>
                    )}
                    {patientView.lifestyle.weekly_exercise_hours != null && (
                      <span>
                        {patientView.lifestyle.weekly_exercise_hours}h/wk
                        exercise ·{" "}
                      </span>
                    )}
                    {patientView.lifestyle.daily_steps_reported != null && (
                      <span>
                        {patientView.lifestyle.daily_steps_reported} steps/day
                        ·{" "}
                      </span>
                    )}
                    {patientView.lifestyle.sleep_quality_subjective && (
                      <span>
                        Sleep: {patientView.lifestyle.sleep_quality_subjective}{" "}
                        ·{" "}
                      </span>
                    )}
                    {patientView.lifestyle.alcohol_consumption && (
                      <span>
                        Alcohol: {patientView.lifestyle.alcohol_consumption}{" "}
                        ·{" "}
                      </span>
                    )}
                    {patientView.lifestyle.smoking_habit && (
                      <span>
                        Smoking: {patientView.lifestyle.smoking_habit}
                      </span>
                    )}
                  </div>
                )}
                {patientView.preferences && (
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>
                      Preferences:{" "}
                    </span>
                    {patientView.preferences.preferred_cuisine && (
                      <span>
                        {patientView.preferences.preferred_cuisine} cuisine
                        ·{" "}
                      </span>
                    )}
                    {Array.isArray(patientView.preferences.food_aversions) &&
                      patientView.preferences.food_aversions.length > 0 && (
                        <span>
                          Aversions:{" "}
                          {patientView.preferences.food_aversions.join(", ")}{" "}
                          ·{" "}
                        </span>
                      )}
                    {patientView.preferences
                      .cultural_religious_restrictions && (
                      <span>
                        {
                          patientView.preferences
                            .cultural_religious_restrictions
                        }{" "}
                        ·{" "}
                      </span>
                    )}
                    {patientView.preferences.goal && (
                      <span>Goal: {patientView.preferences.goal}</span>
                    )}
                  </div>
                )}
                {patientView.daily_log?.["24h_food_diary_text"] && (
                  <div>
                    <div className="label-sm" style={{ marginBottom: 4 }}>
                      24h food diary
                    </div>
                    <div
                      style={{
                        padding: 10,
                        background: "var(--gray-50)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {patientView.daily_log["24h_food_diary_text"]}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Specialist editable journal review */}
          {patientView?.daily_log?.["24h_food_diary_text"] && (
            <div className="card">
              <div className="card-header">
                <div className="section-title" style={{ fontSize: 15 }}>
                  Specialist review (editable)
                </div>
                <Badge variant="gray">{plan?.status ?? "draft"}</Badge>
              </div>
              <div className="card-body" style={{ display: "grid", gap: 12 }}>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  Use the patient diary to generate a proposed dietary plan,
                  then edit and approve to make it visible to the patient.
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button
                    variant="primary"
                    loading={journalBusy}
                    onClick={async () => {
                      setJournalBusy(true);
                      setJournalError("");
                      try {
                        const diary =
                          patientView.daily_log?.["24h_food_diary_text"] || "";

                        // PAYLOAD CORECT: Trimitem textul jurnalului + contextul pacientului
                        const payload = {
                          journalEntries: diary,
                          patientDetails: {
                            patient_id: patientView.patient_id,
                            demographics: patientView.demographics,
                            lifestyle: patientView.lifestyle,
                            preferences: patientView.preferences,
                          },
                          specialistDetails: {
                            primary_disease: primaryDisease,
                            severity: severity,
                            comorbidities: splitList(comorbiditiesText),
                          },
                        };

                        // Apelăm API-ul (ruta /api/ai/analyze-journal este gestionată în aiApi.analyzeJournal)
                        const data = await aiApi.analyzeJournal(payload);

                        const mapped = mapJournalAnalysisToReview(
                          data?.analysis || "",
                        );
                        if (!mapped) {
                          throw new Error("AI returned empty analysis");
                        }
                        setJournalReview(mapped);
                      } catch (e) {
                        setJournalError(
                          e.message || "Could not analyze journal",
                        );
                      } finally {
                        setJournalBusy(false);
                      }
                    }}
                    disabled={
                      !patientView.daily_log?.["24h_food_diary_text"] ||
                      journalBusy
                    }
                  >
                    Analyze food journal
                  </Button>
                </div>

                {journalError ? (
                  <div className="danger">{journalError}</div>
                ) : null}

                {journalReview ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <label className="field">
                      <span className="field-label">
                        Diet rules & priorities
                      </span>
                      <textarea
                        className="textarea"
                        rows={6}
                        value={journalReview.clinical_logic || ""}
                        onChange={(e) =>
                          setJournalReview((prev) => ({
                            ...(prev || {}),
                            clinical_logic: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Meal ideas</span>
                      <textarea
                        className="textarea"
                        rows={5}
                        value={journalReview.culinary_creative || ""}
                        onChange={(e) =>
                          setJournalReview((prev) => ({
                            ...(prev || {}),
                            culinary_creative: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span className="field-label">Reference guidance</span>
                      <textarea
                        className="textarea"
                        rows={5}
                        value={journalReview.rag_retrieval || ""}
                        onChange={(e) =>
                          setJournalReview((prev) => ({
                            ...(prev || {}),
                            rag_retrieval: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    Click “Generate review” to draft the proposed diet guidance.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Specialist object */}
          <div className="card">
            <div className="card-header">
              <div className="section-title" style={{ fontSize: 15 }}>
                Specialist Object
              </div>
              {result && (
                <Badge variant="green" dot>
                  Saved
                </Badge>
              )}
            </div>
            <div className="card-body">
              {result ? (
                <div style={{ display: "grid", gap: 14 }}>
                  {/* ICD-10 + severity */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(result.primary_disease || result.icd10) && (
                      <Badge variant="blue">
                        {result.primary_disease || result.icd10}
                      </Badge>
                    )}
                    {result.severity && (
                      <Badge
                        variant={
                          String(result.severity).toLowerCase() === "severe" ||
                          String(result.severity).toLowerCase() === "high"
                            ? "red"
                            : String(result.severity).toLowerCase() ===
                                "moderate"
                              ? "amber"
                              : "green"
                        }
                      >
                        {result.severity}
                      </Badge>
                    )}
                  </div>

                  {/* Biomarkers */}
                  {result.biomarkers && (
                    <div>
                      <div className="label-sm" style={{ marginBottom: 8 }}>
                        Biometric Markers
                      </div>
                      <div className="grid-2">
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

                  {/* Body composition */}
                  {result.body_composition && (
                    <div>
                      <div className="label-sm" style={{ marginBottom: 8 }}>
                        Body Composition
                      </div>
                      <div className="grid-2">
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

                  {/* Constraints */}
                  {result.clinical_constraints?.length > 0 && (
                    <div>
                      <div className="label-sm" style={{ marginBottom: 8 }}>
                        Clinical Constraints
                      </div>
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
                      >
                        {result.clinical_constraints.map((c, i) => (
                          <ConstraintPill
                            key={i}
                            type={c.type}
                            value={c.value}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px 16px",
                    color: "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  Submit clinical data to see the consolidated specialist
                  object.
                </div>
              )}
            </div>
          </div>

          {/* Generated plan */}
          {plan && (
            <div className="card">
              <div className="card-header">
                <div className="section-title" style={{ fontSize: 15 }}>
                  Generated Plan
                </div>
                <StatusBadge
                  status={
                    decision === "approve"
                      ? "approved"
                      : decision === "reject"
                        ? "rejected"
                        : decision === "modify"
                          ? "modify"
                          : "pending"
                  }
                />
              </div>
              <div className="card-body" style={{ display: "grid", gap: 12 }}>
                {plan.plan?.clinical_strategy && (
                  <div className="ai-block">
                    <div className="ai-block-label">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
                      </svg>
                      Clinical Strategy
                    </div>
                    <MarkdownContent content={plan.plan.clinical_strategy} />
                  </div>
                )}

                {plan.plan?.llm_outputs && (
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      ["clinical_logic", "Diet rules & priorities"],
                      ["culinary_creative", "Meal ideas"],
                      ["rag_retrieval", "Reference guidance"],
                    ].map(([key, label]) =>
                      plan.plan.llm_outputs[key] ? (
                        <div key={key} className="ai-block">
                          <div className="ai-block-label">{label}</div>
                          <MarkdownContent
                            content={plan.plan.llm_outputs[key]}
                          />
                        </div>
                      ) : null,
                    )}
                  </div>
                )}

                {plan.plan?.meal_matrix?.meals && (
                  <div>
                    <div className="label-sm" style={{ marginBottom: 8 }}>
                      Generated meal plan
                    </div>
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                        overflow: "hidden",
                      }}
                    >
                      {plan.plan.meal_matrix.meals.map((m, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: 12,
                            alignItems: "center",
                            padding: "9px 14px",
                            borderBottom:
                              i < plan.plan.meal_matrix.meals.length - 1
                                ? "1px solid var(--border)"
                                : "none",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
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
                          <span style={{ fontSize: 14 }}>{m.name}</span>
                          {m.notes && (
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--text-muted)",
                                marginLeft: "auto",
                                fontStyle: "italic",
                              }}
                            >
                              {m.notes}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
