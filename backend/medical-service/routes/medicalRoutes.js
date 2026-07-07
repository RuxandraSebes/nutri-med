const express = require("express");
const medicalController = require("../controllers/medicalController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/patients/:patientId/specialist-object", (req, res, next) =>
  medicalController.getLatest(req, res).catch(next),
);

router.post(
  "/patients/:patientId/clinical",
  requireAuth("specialist"),
  (req, res, next) => medicalController.saveClinical(req, res).catch(next),
);

module.exports = router;
