const medicalService = require("../services/medicalService");

async function saveClinical(req, res) {
  const patientId = Number(req.params.patientId);
  if (!Number.isFinite(patientId)) {
    return res.status(400).json({ error: "Invalid patientId" });
  }

  const payload = req.body || {};
  const specialistObject = await medicalService.saveClinicalData(patientId, payload);
  res.json(specialistObject);
}

async function getLatest(req, res) {
  const patientId = Number(req.params.patientId);
  if (!Number.isFinite(patientId)) {
    return res.status(400).json({ error: "Invalid patientId" });
  }

  const specialistObject = await medicalService.getLatestSpecialistObject(patientId);
  if (!specialistObject) return res.status(404).json({ error: "Not found" });
  res.json(specialistObject);
}

module.exports = {
  saveClinical,
  getLatest,
};

