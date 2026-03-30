const { MedicalRecord, BodyComposition, ClinicalConstraint } = require("../models");

async function createClinicalBundle(patientId, payload) {
  const record = await MedicalRecord.create({
    patient_id: patientId,
    primary_disease: payload.primary_disease ?? null,
    severity: payload.severity ?? null,
    systolic_bp: payload.systolic_bp ?? null,
    diastolic_bp: payload.diastolic_bp ?? null,
    glucose: payload.glucose ?? null,
    cholesterol: payload.cholesterol ?? null,
  });

  if (payload.body_composition) {
    await BodyComposition.create({
      record_id: record.id,
      fat_pct: payload.body_composition.fat_pct ?? null,
      water_pct: payload.body_composition.water_pct ?? null,
      muscle_mass_kg: payload.body_composition.muscle_mass_kg ?? null,
      visceral_fat_level: payload.body_composition.visceral_fat_level ?? null,
    });
  }

  if (Array.isArray(payload.constraints) && payload.constraints.length > 0) {
    await ClinicalConstraint.bulkCreate(
      payload.constraints.map((c) => ({
        record_id: record.id,
        type: c.type,
        value: c.value,
      })),
    );
  }

  return await getClinicalBundleByRecordId(record.id);
}

async function getLatestClinicalBundle(patientId) {
  const record = await MedicalRecord.findOne({
    where: { patient_id: patientId },
    order: [["recorded_at", "DESC"]],
  });
  if (!record) return null;
  return await getClinicalBundleByRecordId(record.id);
}

async function getClinicalBundleByRecordId(recordId) {
  return await MedicalRecord.findByPk(recordId, {
    include: [
      { model: BodyComposition, as: "body_composition" },
      { model: ClinicalConstraint, as: "clinical_constraints" },
    ],
  });
}

module.exports = {
  createClinicalBundle,
  getLatestClinicalBundle,
};

