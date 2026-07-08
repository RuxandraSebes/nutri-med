const crypto = require("crypto");
const patientRepository = require("../repositories/patientRepository");

function computeBmi(heightCm, weightKg) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  if (!h || !w || h <= 0) return null;
  const m = h / 100;
  const bmi = w / (m * m);
  return Math.round(bmi * 10) / 10;
}

function newPublicPatientId() {
  return `PT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function defaultProfileData() {
  return {
    demographics: {},
    lifestyle: {},
    preferences: {},
    daily_log: {},
  };
}

function toPatientObject(row) {
  if (!row) return null;
  const pd = row.profile_data || {};
  const demo = {
    age: row.age ?? pd.demographics?.age ?? null,
    gender: row.gender ?? pd.demographics?.gender ?? null,
    height_cm:
      row.height_cm != null
        ? Number(row.height_cm)
        : (pd.demographics?.height_cm ?? null),
    weight_kg:
      row.weight_kg != null
        ? Number(row.weight_kg)
        : (pd.demographics?.weight_kg ?? null),
    bmi: pd.demographics?.bmi ?? computeBmi(row.height_cm, row.weight_kg),
  };
  const lifestyle = {
    activity_level:
      row.activity_level ?? pd.lifestyle?.physical_activity_level ?? null,
    preferred_cuisine:
      row.preferred_cuisine ?? pd.preferences?.preferred_cuisine ?? null,
    ...pd.lifestyle,
    physical_activity_level:
      pd.lifestyle?.physical_activity_level ?? row.activity_level ?? null,
  };
  const preferences = pd.preferences || {};
  const daily_log = pd.daily_log || {};

  return {
    patient_id: row.public_patient_id || String(row.id),
    record_id: row.id,
    user_id: row.user_id,
    demographics: { ...demo, ...pd.demographics, bmi: demo.bmi },
    lifestyle,
    preferences,
    daily_log,
    created_at: row.created_at,
  };
}

async function bootstrapPatient(userId) {
  let row = await patientRepository.getByUserId(userId);
  if (row) {
    if (!row.public_patient_id) {
      await row.update({ public_patient_id: newPublicPatientId() });
      row = await row.reload();
    }
    return toPatientObject(row);
  }
  row = await patientRepository.upsertByUserId(userId, {
    public_patient_id: newPublicPatientId(),
    profile_data: defaultProfileData(),
  });
  return toPatientObject(row);
}

function mergeProfilePayload(row, body) {
  const pd = { ...defaultProfileData(), ...(row.profile_data || {}) };
  if (body.demographics) {
    pd.demographics = { ...pd.demographics, ...body.demographics };
  }
  if (body.lifestyle) {
    pd.lifestyle = { ...pd.lifestyle, ...body.lifestyle };
  }
  if (body.preferences) {
    pd.preferences = { ...pd.preferences, ...body.preferences };
  }
  if (body.daily_log) {
    pd.daily_log = { ...pd.daily_log, ...body.daily_log };
  }

  const updates = { profile_data: pd };
  const d = body.demographics || {};
  if (d.age != null) updates.age = Number(d.age);
  if (d.gender != null) updates.gender = String(d.gender);
  if (d.height_cm != null) updates.height_cm = d.height_cm;
  if (d.weight_kg != null) updates.weight_kg = d.weight_kg;

  const l = body.lifestyle || {};
  if (l.physical_activity_level != null) {
    updates.activity_level = String(l.physical_activity_level);
  }
  const p = body.preferences || {};
  if (p.preferred_cuisine != null) {
    updates.preferred_cuisine = String(p.preferred_cuisine);
  }

  const bmi = computeBmi(
    updates.height_cm ?? row.height_cm,
    updates.weight_kg ?? row.weight_kg,
  );
  if (bmi != null) {
    pd.demographics = { ...pd.demographics, bmi };
  }

  return updates;
}

async function updateMyProfile(userId, body) {
  const row = await patientRepository.getByUserId(userId);
  if (!row) {
    const err = new Error("Patient profile not found - call bootstrap first");
    err.status = 404;
    throw err;
  }
  const updates = mergeProfilePayload(row, body);
  await row.update(updates);
  return toPatientObject(await row.reload());
}

async function getMyProfile(userId) {
  const row = await patientRepository.getByUserId(userId);
  if (!row) return null;
  return toPatientObject(row);
}

async function getProfileByInternalId(internalId) {
  const row = await patientRepository.getById(internalId);
  if (!row) return null;
  return toPatientObject(row);
}

async function searchPatients(q) {
  const rows = await patientRepository.searchByQuery(q);
  return rows.map((r) => ({
    id: r.id,
    public_patient_id: r.public_patient_id,
    age: r.age,
    gender: r.gender,
    created_at: r.created_at,
  }));
}

async function upsertPatientProfile(userId, payload) {
  const patient = await patientRepository.upsertByUserId(userId, payload);
  return toPatientObject(patient);
}

async function getPatientProfile(userId) {
  const patient = await patientRepository.getByUserId(userId);
  return toPatientObject(patient);
}

module.exports = {
  bootstrapPatient,
  updateMyProfile,
  getMyProfile,
  getProfileByInternalId,
  searchPatients,
  upsertPatientProfile,
  getPatientProfile,
  toPatientObject,
  computeBmi,
};
