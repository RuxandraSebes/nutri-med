const express = require("express");
const recommendationController = require("../controllers/recommendationController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/patients/:patientId/plan/complete",
  requireAuth("specialist"),
  recommendationController.completePlan,
);

router.post(
  "/patients/:patientId/plan",
  requireAuth("specialist"),
  recommendationController.generatePlan,
);

router.post(
  "/patients/:patientId/plan/regenerate",
  requireAuth("specialist"),
  recommendationController.regeneratePlan,
);

router.patch(
  "/patients/:patientId/plan/draft",
  requireAuth("specialist"),
  recommendationController.updateDraft,
);

router.delete(
  "/patients/:patientId/plan/draft",
  requireAuth("specialist"),
  recommendationController.discardDraft,
);

router.get(
  "/patients/:patientId/plan",
  requireAuth("patient", "specialist"),
  recommendationController.getLatest,
);

router.patch(
  "/patients/:patientId/plan/approve",
  requireAuth("specialist"),
  recommendationController.approvePlan,
);

module.exports = router;
