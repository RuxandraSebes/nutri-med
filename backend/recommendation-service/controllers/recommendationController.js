const recommendationService = require("../services/recommendationService");

async function generatePlan(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const result = await recommendationService.generateAndStorePlan(patientId, {
      specialist_id: req.auth?.userId ?? req.body?.specialist_id,
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function getLatest(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    await recommendationService.assertCanAccessPatientPlan(
      req.auth,
      patientId,
    );
    const plan = await recommendationService.getLatestPlan(patientId);
    if (!plan) return res.status(404).json({ error: "Not found" });
    res.json(plan);
  } catch (e) {
    next(e);
  }
}

async function approvePlan(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const edited = {
      llm_outputs: req.body?.llm_outputs,
      clinical_strategy: req.body?.clinical_strategy,
      meal_matrix: req.body?.meal_matrix,
      shopping_list: req.body?.shopping_list,
    };
    const updated = await recommendationService.approveLatestPlan(
      patientId,
      req.auth.userId,
      edited,
    );
    res.json(updated);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  generatePlan,
  getLatest,
  approvePlan,
};
