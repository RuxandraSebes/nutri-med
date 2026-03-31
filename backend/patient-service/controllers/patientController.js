const patientService = require("../services/patientService");
const patientRepository = require("../repositories/patientRepository");

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

async function bootstrap(req, res, next) {
  try {
    const data = await patientService.bootstrapPatient(req.auth.userId);
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function getMe(req, res, next) {
  try {
    const data = await patientService.getMyProfile(req.auth.userId);
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function putMe(req, res, next) {
  try {
    const data = await patientService.updateMyProfile(
      req.auth.userId,
      req.body || {},
    );
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function search(req, res, next) {
  try {
    const q = req.query.q;
    const list = await patientService.searchPatients(q);
    res.json({ patients: list });
  } catch (e) {
    next(e);
  }
}

async function getForSpecialist(req, res, next) {
  try {
    const id = Number(req.params.patientId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid patient id" });
    }
    const data = await patientService.getProfileByInternalId(id);
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (e) {
    next(e);
  }
}

async function getInternalIdByUser(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const id = await patientRepository.getIdByUserId(userId);
    if (id == null) return res.status(404).json({ error: "Not found" });
    res.json({ record_id: id });
  } catch (e) {
    next(e);
  }
}

/** By DB primary key — for recommendation/medical services (same Docker network). */
async function getInternalByRecordId(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    const data = await patientService.getProfileByInternalId(id);
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  } catch (e) {
    next(e);
  }
}

module.exports = {
  upsertProfile,
  getProfile,
  bootstrap,
  getMe,
  putMe,
  search,
  getForSpecialist,
  getInternalByRecordId,
  getInternalIdByUser,
};
