const { DietPlan } = require("../models");

async function createPlan(payload) {
  return await DietPlan.create(payload);
}

async function getLatestPlanRow(patientId) {
  return await DietPlan.findOne({
    where: { patient_id: patientId },
    order: [["created_at", "DESC"]],
  });
}

async function getLatestApprovedPlanRow(patientId) {
  return await DietPlan.findOne({
    where: { patient_id: patientId, status: "approved" },
    order: [["created_at", "DESC"]],
  });
}

async function deletePendingPlansForPatient(patientId) {
  return await DietPlan.destroy({
    where: { patient_id: patientId, status: "pending" },
  });
}

module.exports = {
  createPlan,
  getLatestPlanRow,
  getLatestApprovedPlanRow,
  deletePendingPlansForPatient,
};
