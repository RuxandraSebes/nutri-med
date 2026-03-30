const express = require("express");
const medicalController = require("../controllers/medicalController");

const router = express.Router();

// POST /patients/:patientId/clinical -> saves medical_records + body_composition + constraints
router.post("/patients/:patientId/clinical", (req, res, next) =>
  medicalController.saveClinical(req, res).catch(next),
);

// GET /patients/:patientId/specialist-object -> consolidated dynamic object
router.get("/patients/:patientId/specialist-object", (req, res, next) =>
  medicalController.getLatest(req, res).catch(next),
);

module.exports = router;

