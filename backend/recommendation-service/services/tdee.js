const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  "very active": 1.9,
  very_active: 1.9,
  low: 1.2,
  high: 1.725,
};

function calculateTDEE(patient) {
  const demo = patient?.demographics || {};

  const weight = Number(demo.weight_kg) || 70;
  const height = Number(demo.height_cm) || 170;
  const age = Number(demo.age) || 30;
  const gender = String(demo.gender || "").toLowerCase();

  const s = gender.includes("male") && !gender.includes("female") ? 5 : -161;
  const bmr = 10 * weight + 6.25 * height - 5 * age + s;

  const activityRaw = String(
    patient?.lifestyle?.activity_level ||
      patient?.lifestyle?.physical_activity_level ||
      demo.activity_level ||
      "",
  )
    .toLowerCase()
    .trim();

  let activityFactor = 1.3;
  for (const [key, val] of Object.entries(ACTIVITY_FACTORS)) {
    if (activityRaw.includes(key)) {
      activityFactor = val;
      break;
    }
  }

  const kcal = Math.round(bmr * activityFactor);

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
    weight_kg: weight,
  };
}

const GOAL_KCAL_DELTA = {
  loss: -500,
  maintenance: 0,
  gain: 500,
};

function applyGoalToTdee(maintenanceTdee, goal) {
  const base = maintenanceTdee || {};
  const maintenanceKcal = Number(base.kcal) || 2000;
  const g = goal === "loss" || goal === "gain" ? goal : "maintenance";
  const delta = GOAL_KCAL_DELTA[g] ?? 0;
  let kcal = maintenanceKcal + delta;
  if (g === "loss") kcal = Math.max(1200, kcal);

  const weight = Number(base.weight_kg) || 70;
  const proteinFloor = Math.round(weight * 1.6);
  const proteinFromPct = Math.round((kcal * 0.3) / 4);
  const protein_g = Math.max(proteinFloor, proteinFromPct);
  const fat_g = Math.round((kcal * 0.28) / 9);
  const carbs_g = Math.max(
    80,
    Math.round((kcal - protein_g * 4 - fat_g * 9) / 4),
  );

  return {
    ...base,
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    goal: g,
    maintenance_kcal: maintenanceKcal,
    method: `${base.method || "Mifflin-St Jeor"} → ${g}`,
    target_source: "specialist_dashboard",
  };
}

module.exports = { calculateTDEE, applyGoalToTdee, GOAL_KCAL_DELTA };
