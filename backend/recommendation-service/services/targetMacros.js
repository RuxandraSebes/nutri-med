const { calculateTDEE, applyGoalToTdee } = require("./tdee");
const { assembleOrchestratorInput } = require("./recommendationClient");

function normalizeTargetMacros(merged) {
  for (const key of ["kcal", "protein_g", "carbs_g", "fat_g"]) {
    const n = Number(merged[key]);
    if (!Number.isFinite(n)) {
      const err = new Error(`Invalid target_macros: missing or invalid ${key}`);
      err.status = 400;
      throw err;
    }
    merged[key] = Math.round(n);
  }
  if (merged.bmr != null) merged.bmr = Math.round(Number(merged.bmr));
  if (merged.activity_factor != null) {
    merged.activity_factor = Number(merged.activity_factor);
  }
  if (merged.maintenance_kcal != null) {
    merged.maintenance_kcal = Math.round(Number(merged.maintenance_kcal));
  }
  return merged;
}

async function resolveTargetMacrosForAi(patientId, opts = {}) {
  const assembled = await assembleOrchestratorInput(patientId);
  const computed = calculateTDEE(assembled.patient);
  const incoming =
    opts.target_macros && typeof opts.target_macros === "object"
      ? opts.target_macros
      : {};

  const hasDashboardGoal =
    incoming.goal === "loss" ||
    incoming.goal === "maintenance" ||
    incoming.goal === "gain";
  const hasDashboardKcal =
    incoming.kcal != null && Number(incoming.kcal) !== Number(computed.kcal);
  const fromDashboard =
    incoming.target_source === "specialist_dashboard" ||
    hasDashboardGoal ||
    hasDashboardKcal;

  let merged;
  if (fromDashboard) {
    if (hasDashboardGoal && incoming.kcal == null) {
      merged = applyGoalToTdee(computed, incoming.goal);
    } else {
      merged = {
        ...computed,
        ...incoming,
        maintenance_kcal:
          incoming.maintenance_kcal != null
            ? Number(incoming.maintenance_kcal)
            : computed.kcal,
        goal: incoming.goal || "maintenance",
        target_source: "specialist_dashboard",
      };
    }
  } else {
    merged = {
      ...computed,
      ...incoming,
      target_source: incoming.target_source || "backend_tdee.js",
    };
  }

  if (!merged.method) {
    merged.method = "Mifflin-St Jeor × activity factor (backend tdee.js)";
  }

  return normalizeTargetMacros(merged);
}

module.exports = {
  normalizeTargetMacros,
  resolveTargetMacrosForAi,
};
