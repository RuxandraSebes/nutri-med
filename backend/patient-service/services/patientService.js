const patientRepository = require("../repositories/patientRepository");

function toPatientObject(row) {
  if (!row) return null;
  return {
    patient_id: row.id,
    user_id: row.user_id,
    demographics: {
      age: row.age,
      gender: row.gender,
      height_cm: row.height_cm,
      weight_kg: row.weight_kg,
    },
    lifestyle: {
      activity_level: row.activity_level,
      preferred_cuisine: row.preferred_cuisine,
    },
    created_at: row.created_at,
  };
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
  upsertPatientProfile,
  getPatientProfile,
};

