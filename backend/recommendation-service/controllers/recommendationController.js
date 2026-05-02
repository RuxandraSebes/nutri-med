const recommendationService = require("../services/recommendationService");

async function generatePlan(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const { jobId, status } = await recommendationService.startPlanGeneration(
      patientId,
    );
    return res.status(202).json({
      jobId,
      status: status || "pending",
      pollUrl: `/api/ai/matrix-status/${jobId}`,
      completeUrl: `/api/recommendations/patients/${patientId}/plan/complete`,
      message:
        "Matrix generation started. Poll pollUrl until status is done, then POST completeUrl with { jobId }.",
    });
  } catch (e) {
    next(e);
  }
}

async function completePlan(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const jobId = req.body?.jobId;
    if (!jobId || typeof jobId !== "string") {
      return res.status(400).json({ error: "Missing or invalid jobId" });
    }
    const result = await recommendationService.completePlanFromJob(
      patientId,
      jobId,
      {
        specialist_id: req.auth?.userId ?? req.body?.specialist_id,
      },
    );
    res.json(result);
  } catch (e) {
    if (e && typeof e.status === "number") {
      return res.status(e.status).json({
        error: e.message || "Request failed",
        ...(e.data && typeof e.data === "object" ? e.data : {}),
      });
    }
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
    const plan = await recommendationService.getLatestPlan(
      patientId,
      req.auth,
    );
    if (!plan) {
      return res.status(404).json({
        error:
          req.auth?.role === "patient"
            ? "No published plan yet"
            : "Not found",
      });
    }
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

async function updateDraft(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const updated = await recommendationService.updateDraftPlan(
      patientId,
      req.body || {},
    );
    res.json(updated);
  } catch (e) {
    next(e);
  }
}

async function regeneratePlan(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const { jobId, status } = await recommendationService.startPlanGeneration(
      patientId,
    );
    return res.status(202).json({
      jobId,
      status: status || "pending",
      pollUrl: `/api/ai/matrix-status/${jobId}`,
      completeUrl: `/api/recommendations/patients/${patientId}/plan/complete`,
      message:
        "Matrix generation started. Poll pollUrl until status is done, then POST completeUrl with { jobId }.",
    });
  } catch (e) {
    next(e);
  }
}

async function discardDraft(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const result = await recommendationService.discardDraftPlan(patientId);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  generatePlan,
  completePlan,
  getLatest,
  approvePlan,
  updateDraft,
  regeneratePlan,
  discardDraft,
};
