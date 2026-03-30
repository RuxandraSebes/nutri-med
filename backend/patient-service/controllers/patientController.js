const patientService = require("../services/patientService");

async function upsertProfile(req, res) {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  const payload = req.body || {};
  const patient = await patientService.upsertPatientProfile(userId, payload);
  res.json(patient);
}

async function getProfile(req, res) {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  const patient = await patientService.getPatientProfile(userId);
  if (!patient) return res.status(404).json({ error: "Not found" });
  res.json(patient);
}

module.exports = {
  upsertProfile,
  getProfile,
};

