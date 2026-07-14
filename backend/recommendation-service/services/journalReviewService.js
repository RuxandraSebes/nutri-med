const journalReviewRepository = require("../repositories/journalReviewRepository");
const { fetchPatientAndSpecialistContext } = require("../src/journalClient");
const { analyzeJournal } = require("../src/journalAiClient");

function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    patient_id: row.patient_id,
    specialist_id: row.specialist_id,
    status: row.status,
    score: row.score,
    food_notes: row.food_notes,
    created_at: row.created_at,
  };
}

async function generateReview(patientId, specialistUserId) {
  const { patient, specialist } = await fetchPatientAndSpecialistContext(patientId);
  const diaryText = patient?.daily_log?.["24h_food_diary_text"] || "";
  if (!diaryText.trim()) {
    const err = new Error("Patient has no 24h food diary entry yet");
    err.status = 400;
    throw err;
  }

  const patientDetails = {
    patient_id: patient?.patient_id,
    demographics: patient?.demographics,
    lifestyle: patient?.lifestyle,
    preferences: patient?.preferences,
  };
  const specialistDetails = {
    primary_disease: specialist?.primary_disease,
    severity: specialist?.severity,
    comorbidities: specialist?.comorbidities,
  };

  const { score, food_notes } = await analyzeJournal({
    diaryText,
    patientDetails,
    specialistDetails,
  });

  await journalReviewRepository.deletePendingReviewsForPatient(patientId);

  const created = await journalReviewRepository.createReview({
    patient_id: patientId,
    specialist_id: specialistUserId ?? null,
    status: "pending",
    score,
    food_notes,
    diary_snapshot: diaryText,
  });

  return rowToApi(created);
}

async function updateDraftReview(patientId, patch = {}) {
  const row = await journalReviewRepository.getLatestReviewRow(patientId);
  if (!row) {
    const err = new Error("No journal review found to update");
    err.status = 404;
    throw err;
  }
  if (row.status !== "pending" && row.status !== "approved") {
    const err = new Error("Latest journal review cannot be edited in its current state");
    err.status = 409;
    throw err;
  }
  const u = {};
  if (patch.score != null) u.score = Number(patch.score);
  if (patch.food_notes != null) u.food_notes = patch.food_notes;
  await row.update(u);
  return rowToApi(await row.reload());
}

async function approveReview(patientId, specialistUserId, edited = {}) {
  const row = await journalReviewRepository.getLatestReviewRow(patientId);
  if (!row) {
    const err = new Error("No journal review found");
    err.status = 404;
    throw err;
  }
  if (row.status !== "pending") {
    const err = new Error("Latest journal review is not pending");
    err.status = 409;
    throw err;
  }
  const update = { status: "approved", specialist_id: specialistUserId };
  if (edited.score != null) update.score = Number(edited.score);
  if (edited.food_notes != null) update.food_notes = edited.food_notes;
  await row.update(update);
  return rowToApi(await row.reload());
}

async function declineReview(patientId) {
  const n = await journalReviewRepository.deletePendingReviewsForPatient(patientId);
  if (!n) {
    const err = new Error("No pending journal review to decline");
    err.status = 404;
    throw err;
  }
  return { declined: n };
}

async function getLatestReview(patientId, auth) {
  if (auth?.role === "patient") {
    const row = await journalReviewRepository.getLatestApprovedReviewRow(patientId);
    return rowToApi(row);
  }
  const row = await journalReviewRepository.getLatestReviewRow(patientId);
  return rowToApi(row);
}

module.exports = {
  generateReview,
  updateDraftReview,
  approveReview,
  declineReview,
  getLatestReview,
};
