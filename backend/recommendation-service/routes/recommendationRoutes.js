const express = require("express");
const recommendationController = require("../controllers/recommendationController");

const router = express.Router();

// POST /patients/:patientId/plan -> orchestrator fetches objects + stores plan
router.post("/patients/:patientId/plan", (req, res, next) =>
  recommendationController.generatePlan(req, res).catch(next),
);

// GET /patients/:patientId/plan -> latest stored plan
router.get("/patients/:patientId/plan", (req, res, next) =>
  recommendationController.getLatest(req, res).catch(next),
);

module.exports = router;

