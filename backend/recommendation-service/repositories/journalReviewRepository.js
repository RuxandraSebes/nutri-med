const { JournalReview } = require("../models");

async function createReview(payload) {
  return await JournalReview.create(payload);
}

async function getLatestReviewRow(patientId) {
  return await JournalReview.findOne({
    where: { patient_id: patientId },
    order: [["created_at", "DESC"]],
  });
}

async function getLatestApprovedReviewRow(patientId) {
  return await JournalReview.findOne({
    where: { patient_id: patientId, status: "approved" },
    order: [["created_at", "DESC"]],
  });
}

async function deletePendingReviewsForPatient(patientId) {
  return await JournalReview.destroy({
    where: { patient_id: patientId, status: "pending" },
  });
}

module.exports = {
  createReview,
  getLatestReviewRow,
  getLatestApprovedReviewRow,
  deletePendingReviewsForPatient,
};
