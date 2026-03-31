const medicalRepository = require("../repositories/medicalRepository");

function toSpecialistObject(record) {
  if (!record) return null;
  const form = record.specialist_form_json || {};
  return {
    patient_id: record.patient_id,
    medical_record_id: record.id,
    icd10: record.primary_disease,
    primary_disease: record.primary_disease,
    severity: record.severity,
    clinical_assessment: form.clinical_assessment || {
      primary_disease: record.primary_disease,
      severity: record.severity,
      comorbidities: [],
      genetic_risk_factors: [],
    },
    biometric_markers: form.biometric_markers || {
      blood_pressure_mmhg:
        record.systolic_bp != null && record.diastolic_bp != null
          ? `${record.systolic_bp}/${record.diastolic_bp}`
          : null,
      cholesterol_mg_dl: record.cholesterol,
      glucose_mg_dl: record.glucose,
    },
    biomarkers: {
      systolic_bp: record.systolic_bp,
      diastolic_bp: record.diastolic_bp,
      glucose: record.glucose,
      cholesterol: record.cholesterol,
    },
    body_composition: record.body_composition
      ? {
          body_fat_percentage: record.body_composition.fat_pct,
          body_water_percentage: record.body_composition.water_pct,
          muscle_mass_kg: record.body_composition.muscle_mass_kg,
          visceral_fat_level: record.body_composition.visceral_fat_level,
          metabolic_age: record.body_composition.metabolic_age,
          fat_pct: record.body_composition.fat_pct,
          water_pct: record.body_composition.water_pct,
        }
      : form.body_composition || null,
    strict_constraints: form.strict_constraints || null,
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
  const record = await medicalRepository.createClinicalBundle(
    patientId,
    payload,
  );
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
