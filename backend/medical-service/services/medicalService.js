const medicalRepository = require("../repositories/medicalRepository");

function toSpecialistObject(record) {
  if (!record) return null;
  return {
    patient_id: record.patient_id,
    medical_record_id: record.id,
    icd10: record.primary_disease,
    severity: record.severity,
    biomarkers: {
      systolic_bp: record.systolic_bp,
      diastolic_bp: record.diastolic_bp,
      glucose: record.glucose,
      cholesterol: record.cholesterol,
    },
    body_composition: record.body_composition
      ? {
          fat_pct: record.body_composition.fat_pct,
          water_pct: record.body_composition.water_pct,
          muscle_mass_kg: record.body_composition.muscle_mass_kg,
          visceral_fat_level: record.body_composition.visceral_fat_level,
        }
      : null,
    clinical_constraints: Array.isArray(record.clinical_constraints)
      ? record.clinical_constraints.map((c) => ({
          type: c.type,
          value: c.value,
        }))
      : [],
    recorded_at: record.recorded_at,
  };
}

async function saveClinicalData(patientId, payload) {
  const record = await medicalRepository.createClinicalBundle(patientId, payload);
  return toSpecialistObject(record);
}

async function getLatestSpecialistObject(patientId) {
  const record = await medicalRepository.getLatestClinicalBundle(patientId);
  return toSpecialistObject(record);
}

module.exports = {
  saveClinicalData,
  getLatestSpecialistObject,
};

