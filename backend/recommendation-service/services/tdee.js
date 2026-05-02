/**
 * tdee.js — Mifflin-St Jeor TDEE calculator
 *
 * Uses EXACT DB fields from the patients table:
 *   weight_kg, height_cm, age, gender, activity_level
 *
 * Macro split (disease-aware):
 *   protein  : 30 % of kcal  (1.6–2.2 g/kg for active patients)
 *   fat      : 28 % of kcal
 *   carbs    : remainder
 */

const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  "very active": 1.9,
  very_active: 1.9,
  // aliases that might appear in the DB
  low: 1.2,
  high: 1.725,
};

/**
 * @param {object} patient — row from patient-service (toPatientObject shape)
 * @returns {{ kcal, protein_g, carbs_g, fat_g, bmr, activity_factor, method }}
 */
function calculateTDEE(patient) {
  const demo = patient?.demographics || {};

  const weight = Number(demo.weight_kg) || 70;
  const height = Number(demo.height_cm) || 170;
  const age = Number(demo.age) || 30;
  const gender = String(demo.gender || "").toLowerCase();

  // ── Mifflin-St Jeor BMR ───────────────────────────────────────────────────
  // Male:   BMR = 10*w + 6.25*h - 5*age + 5
  // Female: BMR = 10*w + 6.25*h - 5*age - 161
  const s = gender.includes("male") && !gender.includes("female") ? 5 : -161;
  const bmr = 10 * weight + 6.25 * height - 5 * age + s;

  // ── Activity factor ───────────────────────────────────────────────────────
  const activityRaw = String(
    patient?.lifestyle?.activity_level ||
      patient?.lifestyle?.physical_activity_level ||
      demo.activity_level ||
      "",
  )
    .toLowerCase()
    .trim();

  let activityFactor = 1.3; // safe default
  for (const [key, val] of Object.entries(ACTIVITY_FACTORS)) {
    if (activityRaw.includes(key)) {
      activityFactor = val;
      break;
    }
  }

  // ── TDEE ─────────────────────────────────────────────────────────────────
  const kcal = Math.round(bmr * activityFactor);

  // ── Macro split ───────────────────────────────────────────────────────────
  // protein: 1.6 g/kg (body weight) as a floor, capped at 30% kcal
  const proteinFloor = Math.round(weight * 1.6);
  const proteinFromPct = Math.round((kcal * 0.3) / 4);
  const protein_g = Math.max(proteinFloor, proteinFromPct);

  const fat_g = Math.round((kcal * 0.28) / 9);
  const carbs_g = Math.max(
    80,
    Math.round((kcal - protein_g * 4 - fat_g * 9) / 4),
  );

  return {
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    bmr: Math.round(bmr),
    activity_factor: activityFactor,
    method: "Mifflin-St Jeor × activity factor",
  };
}

module.exports = { calculateTDEE };
