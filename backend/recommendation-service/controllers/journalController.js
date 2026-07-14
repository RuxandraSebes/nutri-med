const journalReviewService = require("../services/journalReviewService");
const { assertCanAccessPatientJournal } = require("../src/journalClient");

async function requestReview(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const review = await journalReviewService.generateReview(
      patientId,
      req.auth?.userId,
    );
    res.status(201).json(review);
  } catch (e) {
    if (e && typeof e.status === "number") {
      return res.status(e.status).json({ error: e.message || "Request failed" });
    }
    next(e);
  }
}

async function regenerateReview(req, res, next) {
  return requestReview(req, res, next);
}

async function updateDraft(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const review = await journalReviewService.updateDraftReview(
      patientId,
      req.body || {},
    );
    res.json(review);
  } catch (e) {
    if (e && typeof e.status === "number") {
      return res.status(e.status).json({ error: e.message || "Request failed" });
    }
    next(e);
  }
}

async function approveReview(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const edited = {
      score: req.body?.score,
      food_notes: req.body?.food_notes,
    };
    const review = await journalReviewService.approveReview(
      patientId,
      req.auth?.userId,
      edited,
    );
    res.json(review);
  } catch (e) {
    if (e && typeof e.status === "number") {
      return res.status(e.status).json({ error: e.message || "Request failed" });
    }
    next(e);
  }
}

async function declineReview(req, res, next) {
  try {
    const patientId = Number(req.params.patientId);
    if (!Number.isFinite(patientId)) {
      return res.status(400).json({ error: "Invalid patientId" });
    }
    const result = await journalReviewService.declineReview(patientId);
    res.json(result);
  } catch (e) {
    if (e && typeof e.status === "number") {
      return res.status(e.status).json({ error: e.message || "Request failed" });
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
    await assertCanAccessPatientJournal(req.auth, patientId);
    const review = await journalReviewService.getLatestReview(patientId, req.auth);
    if (!review) {
      return res.status(404).json({
        error:
          req.auth?.role === "patient"
            ? "No approved journal review yet"
            : "Not found",
      });
    }
    res.json(review);
  } catch (e) {
    if (e && typeof e.status === "number") {
      return res.status(e.status).json({ error: e.message || "Request failed" });
    }
    next(e);
  }
}

module.exports = {
  requestReview,
  regenerateReview,
  updateDraft,
  approveReview,
  declineReview,
  getLatest,
};
