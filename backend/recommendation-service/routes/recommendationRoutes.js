const express = require("express");
const recommendationController = require("../controllers/recommendationController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post(
  "/patients/:patientId/plan",
  requireAuth("specialist"),
  recommendationController.generatePlan,
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
