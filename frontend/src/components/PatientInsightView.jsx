import { useEffect, useState } from "react";
import { journalApi } from "../api/baseFetch.js";

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
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  refresh:
    "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
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

export default function PatientInsightView({ dashboardData }) {
  const { patientView, selectedRecordId } = dashboardData;
  const diaryText = patientView?.daily_log?.["24h_food_diary_text"] || "";

  const [review, setReview] = useState(null);
  const [editScore, setEditScore] = useState("");
  const [editNotes, setEditNotes] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  function syncEditState(r) {
    setEditScore(r?.score ?? "");
    setEditNotes(
      Array.isArray(r?.food_notes)
        ? r.food_notes.map((n) => ({ food: n.food || "", note: n.note || "" }))
        : [],
    );
  }

  useEffect(() => {
    setReview(null);
    syncEditState(null);
    setActionError("");
    if (!selectedRecordId) return;
    let cancelled = false;
    setReviewLoading(true);
    journalApi
      .getLatestReview(selectedRecordId)
      .then((r) => {
        if (!cancelled) {
          setReview(r);
          syncEditState(r);
        }
      })
      .catch((e) => {
        if (!cancelled && e.status !== 404) setActionError(e.message);
      })
      .finally(() => {
        if (!cancelled) setReviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRecordId]);

  function currentEditedPayload() {
    return {
      score: editScore === "" ? null : Number(editScore),
      food_notes: editNotes.filter((n) => n.food.trim() || n.note.trim()),
    };
  }

  async function requestOrRegenerate() {
    if (!selectedRecordId) return;
    setActionBusy(true);
    setActionError("");
    setSavedMsg("");
    try {
      const fn = review
        ? journalApi.regenerateReview
        : journalApi.requestReview;
      const r = await fn(selectedRecordId);
      setReview(r);
      syncEditState(r);
    } catch (e) {
      setActionError(e.message || "Could not analyze journal");
    } finally {
      setActionBusy(false);
    }
  }

  async function saveEdits() {
    if (!selectedRecordId || !review) return;
    setActionBusy(true);
    setActionError("");
    setSavedMsg("");
    try {
      const r = await journalApi.updateDraft(
        selectedRecordId,
        currentEditedPayload(),
      );
      setReview(r);
      syncEditState(r);
      setSavedMsg("Edits saved.");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (e) {
      setActionError(e.message || "Could not save edits");
    } finally {
      setActionBusy(false);
    }
  }

  async function approve() {
    if (!selectedRecordId) return;
    setActionBusy(true);
    setActionError("");
    setSavedMsg("");
    try {
      const r = await journalApi.approveReview(
        selectedRecordId,
        currentEditedPayload(),
      );
      setReview(r);
      syncEditState(r);
    } catch (e) {
      setActionError(e.message || "Could not approve review");
    } finally {
      setActionBusy(false);
    }
  }

  async function decline() {
    if (!selectedRecordId) return;
    setActionBusy(true);
    setActionError("");
    setSavedMsg("");
    try {
      await journalApi.declineReview(selectedRecordId);
      setReview(null);
      syncEditState(null);
    } catch (e) {
      setActionError(e.message || "Could not decline review");
    } finally {
      setActionBusy(false);
    }
  }

  function updateNoteField(index, field, value) {
    setEditNotes((prev) =>
      prev.map((n, i) => (i === index ? { ...n, [field]: value } : n)),
    );
  }

  function removeNote(index) {
    setEditNotes((prev) => prev.filter((_, i) => i !== index));
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
          Cross-check the 24h diary with lifestyle and preferences.
        </p>
      </div>

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

            {diaryText && (
              <div>
                <div className="sd-label" style={{ marginBottom: 8 }}>
                  24h food diary
                </div>
                <div className="sd-diary-readonly">{diaryText}</div>
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

      {diaryText ? (
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
                  Journal review
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--sd-text-3)",
                    marginTop: 1,
                  }}
                >
                  AI-powered · score + per-food notes only
                </div>
              </div>
            </div>
            <span
              className={`sd-badge ${
                review?.status === "approved"
                  ? "sd-badge-green"
                  : review
                    ? "sd-badge-amber"
                    : "sd-badge-gray"
              }`}
            >
              {review?.status ?? "no review"}
            </span>
          </div>

          <div className="sd-insight-card-body">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="sd-btn sd-btn-primary"
                onClick={requestOrRegenerate}
                disabled={actionBusy || reviewLoading}
              >
                {actionBusy ? (
                  <Spinner />
                ) : (
                  <Icon
                    d={review ? I.refresh : I.bolt}
                    size={13}
                    stroke="currentColor"
                  />
                )}
                {review ? "Regenerate" : "Analyze food journal"}
              </button>

              {review && (
                <button
                  type="button"
                  className="sd-btn sd-btn-secondary"
                  onClick={saveEdits}
                  disabled={actionBusy}
                >
                  <Icon d={I.check} size={13} />
                  Save edits
                </button>
              )}

              {review?.status === "pending" && (
                <>
                  <button
                    type="button"
                    className="sd-btn sd-btn-green"
                    onClick={approve}
                    disabled={actionBusy}
                  >
                    <Icon d={I.check} size={13} />
                    Approve
                  </button>
                  <button
                    type="button"
                    className="sd-btn sd-btn-danger"
                    onClick={decline}
                    disabled={actionBusy}
                  >
                    <Icon d={I.x} size={13} />
                    Decline
                  </button>
                </>
              )}
            </div>

            {actionError && (
              <div className="sd-alert sd-alert-error">
                <Icon d={I.alert} size={14} />
                {actionError}
              </div>
            )}

            {savedMsg && (
              <div className="sd-alert sd-alert-success">{savedMsg}</div>
            )}

            {reviewLoading ? (
              <div style={{ marginTop: 10 }}>
                <Spinner size={20} />
              </div>
            ) : review ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  marginTop: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label className="sd-label" style={{ margin: 0 }}>
                    Score
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="sd-input"
                    style={{ width: 70 }}
                    value={editScore}
                    onChange={(e) => setEditScore(e.target.value)}
                  />
                  <span style={{ fontSize: 12, color: "var(--sd-text-3)" }}>
                    / 10
                  </span>
                </div>

                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {editNotes.map((n, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "var(--sd-bg)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          flex: 1,
                        }}
                      >
                        <input
                          type="text"
                          className="sd-input"
                          style={{ fontWeight: 700 }}
                          value={n.food}
                          onChange={(e) =>
                            updateNoteField(i, "food", e.target.value)
                          }
                          placeholder="Food"
                        />
                        <textarea
                          className="sd-input"
                          rows={2}
                          value={n.note}
                          onChange={(e) =>
                            updateNoteField(i, "note", e.target.value)
                          }
                          placeholder="Clinical note"
                        />
                      </div>
                      <button
                        type="button"
                        className="sd-btn sd-btn-ghost"
                        onClick={() => removeNote(i)}
                        disabled={actionBusy}
                        title="Remove this note"
                      >
                        <Icon d={I.x} size={13} />
                      </button>
                    </div>
                  ))}
                  {editNotes.length === 0 && (
                    <p
                      style={{
                        fontSize: 13.5,
                        fontStyle: "italic",
                        color: "var(--sd-text-3)",
                      }}
                    >
                      No per-food notes returned.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              !actionBusy && (
                <p
                  style={{
                    fontSize: 13.5,
                    fontStyle: "italic",
                    color: "var(--sd-text-3)",
                    marginTop: 4,
                  }}
                >
                  Run analysis to generate a score and per-food notes.
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
