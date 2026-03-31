const { MedicalRecord, BodyComposition, ClinicalConstraint } = require("../models");

function normalizeSeverity(s) {
  if (s == null || s === "") return null;
  const x = String(s).toLowerCase();
  if (x === "mild" || x === "low") return "mild";
  if (x === "moderate" || x === "medium") return "moderate";
  if (x === "severe" || x === "high") return "severe";
  return String(s);
}

function normalizeClinicalPayload(payload) {
  const raw = payload || {};
  const out = { ...raw };

  if (raw.clinical_assessment) {
    const ca = raw.clinical_assessment;
    out.primary_disease = ca.primary_disease ?? out.primary_disease;
    out.severity = normalizeSeverity(ca.severity ?? out.severity);
  }

  if (raw.biometric_markers) {
    const bm = raw.biometric_markers;
    const bp = bm.blood_pressure_mmhg;
    if (bp && typeof bp === "string") {
      const parts = bp.split("/").map((p) => p.trim());
      if (parts.length === 2) {
        const sys = parseFloat(parts[0]);
        const dia = parseFloat(parts[1]);
        if (Number.isFinite(sys)) out.systolic_bp = sys;
        if (Number.isFinite(dia)) out.diastolic_bp = dia;
      }
    }
    if (bm.glucose_mg_dl != null) out.glucose = bm.glucose_mg_dl;
    if (bm.cholesterol_mg_dl != null) out.cholesterol = bm.cholesterol_mg_dl;
    if (bm.nutrient_imbalance_score != null) {
      out.nutrient_imbalance_score = bm.nutrient_imbalance_score;
    }
  }

  if (raw.body_composition) {
    const bc = raw.body_composition;
    out.body_composition = {
      fat_pct: bc.body_fat_percentage ?? bc.fat_pct ?? null,
      water_pct: bc.body_water_percentage ?? bc.water_pct ?? null,
      muscle_mass_kg: bc.muscle_mass_kg ?? null,
      visceral_fat_level: bc.visceral_fat_level ?? null,
      metabolic_age: bc.metabolic_age ?? null,
    };
  }

  const extraConstraints = [];
  if (raw.strict_constraints) {
    const sc = raw.strict_constraints;
    (sc.allergies || []).forEach((a) =>
      extraConstraints.push({ type: "allergy", value: String(a) }),
    );
    (sc.dietary_restrictions || []).forEach((a) =>
      extraConstraints.push({ type: "restriction", value: String(a) }),
    );
    if (sc.mandatory_clinical_notes) {
      extraConstraints.push({
        type: "restriction",
        value: `Clinical note: ${sc.mandatory_clinical_notes}`,
      });
    }
  }

  const existing = Array.isArray(raw.constraints) ? raw.constraints : [];
  out.constraints = [...existing, ...extraConstraints];

  out.specialist_form_json = {
    clinical_assessment: raw.clinical_assessment || null,
    biometric_markers: raw.biometric_markers || null,
    body_composition: raw.body_composition || null,
    strict_constraints: raw.strict_constraints || null,
  };

  if (!out.severity && raw.severity) {
    out.severity = normalizeSeverity(raw.severity);
  }

  return out;
}

async function createClinicalBundle(patientId, payload) {
  const p = normalizeClinicalPayload(payload);

  const record = await MedicalRecord.create({
    patient_id: patientId,
    primary_disease: p.primary_disease ?? null,
    severity: p.severity ?? null,
    systolic_bp: p.systolic_bp ?? null,
    diastolic_bp: p.diastolic_bp ?? null,
    glucose: p.glucose ?? null,
    cholesterol: p.cholesterol ?? null,
    nutrient_imbalance_score: p.nutrient_imbalance_score ?? null,
    specialist_form_json: p.specialist_form_json ?? null,
  });

  if (p.body_composition) {
    await BodyComposition.create({
      record_id: record.id,
      fat_pct: p.body_composition.fat_pct ?? null,
      water_pct: p.body_composition.water_pct ?? null,
      muscle_mass_kg: p.body_composition.muscle_mass_kg ?? null,
      visceral_fat_level: p.body_composition.visceral_fat_level ?? null,
      metabolic_age: p.body_composition.metabolic_age ?? null,
    });
  }

  if (Array.isArray(p.constraints) && p.constraints.length > 0) {
    await ClinicalConstraint.bulkCreate(
      p.constraints.map((c) => ({
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
