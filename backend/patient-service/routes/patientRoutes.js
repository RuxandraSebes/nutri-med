const express = require("express");
const patientController = require("../controllers/patientController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/internal/patients/:id", patientController.getInternalByRecordId);
router.get(
  "/internal/patients/by-user/:userId",
  patientController.getInternalIdByUser,
);

router.post(
  "/patients/bootstrap",
  requireAuth("patient"),
  patientController.bootstrap,
);
router.get("/patients/me", requireAuth("patient"), patientController.getMe);
router.put("/patients/me", requireAuth("patient"), patientController.putMe);

router.get(
  "/patients/search",
  requireAuth("specialist"),
  patientController.search,
);
router.get(
  "/patients/for-specialist/:patientId",
  requireAuth("specialist"),
  patientController.getForSpecialist,
);

router.post("/patients/:userId/profile", (req, res, next) =>
  patientController.upsertProfile(req, res).catch(next),
);
router.get("/patients/:userId/profile", (req, res, next) =>
  patientController.getProfile(req, res).catch(next),
);

module.exports = router;
