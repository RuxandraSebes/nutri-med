const express = require("express");
const patientController = require("../controllers/patientController");

const router = express.Router();

// POST /patients/:userId/profile  -> upsert (demographics + lifestyle)
router.post("/patients/:userId/profile", (req, res, next) =>
  patientController.upsertProfile(req, res).catch(next),
);

// GET /patients/:userId/profile -> assembled patient object
router.get("/patients/:userId/profile", (req, res, next) =>
  patientController.getProfile(req, res).catch(next),
);

module.exports = router;

