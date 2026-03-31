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

module.exports = {
  createPlan,
  getLatestPlanRow,
};
