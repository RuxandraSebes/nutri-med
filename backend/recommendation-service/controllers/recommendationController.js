const recommendationService = require("../services/recommendationService");

async function generatePlan(req, res) {
  const patientId = Number(req.params.patientId);
  if (!Number.isFinite(patientId)) {
    return res.status(400).json({ error: "Invalid patientId" });
  }
  const result = await recommendationService.generateAndStorePlan(patientId, {
    specialist_id: req.body?.specialist_id,
  });
  res.json(result);
}

async function getLatest(req, res) {
  const patientId = Number(req.params.patientId);
  if (!Number.isFinite(patientId)) {
    return res.status(400).json({ error: "Invalid patientId" });
  }
  const plan = await recommendationService.getLatestPlan(patientId);
  if (!plan) return res.status(404).json({ error: "Not found" });
  res.json(plan);
}

module.exports = {
  generatePlan,
  getLatest,
};

