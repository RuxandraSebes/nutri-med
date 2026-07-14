const express = require("express");
const journalController = require("../controllers/journalController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/patients/:patientId/journal-review",
  requireAuth("specialist"),
  journalController.requestReview,
);

router.post(
  "/patients/:patientId/journal-review/regenerate",
  requireAuth("specialist"),
  journalController.regenerateReview,
);

router.patch(
  "/patients/:patientId/journal-review/draft",
  requireAuth("specialist"),
  journalController.updateDraft,
);

router.patch(
  "/patients/:patientId/journal-review/approve",
  requireAuth("specialist"),
  journalController.approveReview,
);

router.delete(
  "/patients/:patientId/journal-review",
  requireAuth("specialist"),
  journalController.declineReview,
);

router.get(
  "/patients/:patientId/journal-review",
  requireAuth("patient", "specialist"),
  journalController.getLatest,
);

module.exports = router;
