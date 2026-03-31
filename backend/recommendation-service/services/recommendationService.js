const dietPlanRepository = require("../repositories/dietPlanRepository");

const PATIENT_SERVICE_URL =
  process.env.PATIENT_SERVICE_URL || "http://localhost:3001";
const MEDICAL_SERVICE_URL =
  process.env.MEDICAL_SERVICE_URL || "http://localhost:3002";

async function fetchJson(url, init = {}) {
  const resp = await fetch(url, {
    ...init,
    headers: { accept: "application/json", ...init.headers },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Fetch failed ${resp.status} ${url}: ${text}`);
  }
  return await resp.json();
}

async function resolveOwnPatientRecordId(userId) {
  const j = await fetchJson(
    `${PATIENT_SERVICE_URL}/internal/patients/by-user/${userId}`,
  );
  return j.record_id;
}

async function assertCanAccessPatientPlan(auth, patientId) {
  if (auth.role === "specialist") return;
  if (auth.role !== "patient") {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
  const rid = await resolveOwnPatientRecordId(auth.userId);
  if (Number(rid) !== Number(patientId)) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }
}

async function assembleOrchestratorInput(patientId) {
  const patient = await fetchJson(
    `${PATIENT_SERVICE_URL}/internal/patients/${patientId}`,
  );
  const specialist = await fetchJson(
    `${MEDICAL_SERVICE_URL}/patients/${patientId}/specialist-object`,
  );
  return { patient, specialist };
}

function computeTargetMacros(patient) {
  const demo = patient?.demographics || {};
  const age = Number(demo.age) || 30;
  const h = Number(demo.height_cm) || 170;
  const w = Number(demo.weight_kg) || 70;
  const g = String(demo.gender || "").toLowerCase();
  const isMale = g.includes("male") && !g.includes("female");
  const s = isMale ? 5 : -161;
  const bmr = 10 * w + 6.25 * h - 5 * age + s;
  const act = String(
    patient?.lifestyle?.physical_activity_level ||
      patient?.lifestyle?.activity_level ||
      "",
  ).toLowerCase();
  let factor = 1.3;
  if (act.includes("sedentary") || act.includes("low")) factor = 1.2;
  if (act.includes("active") || act.includes("high")) factor = 1.55;
  if (act.includes("very") || act.includes("athlete")) factor = 1.725;
  const kcal = Math.round(bmr * factor);
  const protein = Math.round(w * 1.6);
  const fat = Math.round((kcal * 0.28) / 9);
  const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  return {
    kcal,
    protein_g: protein,
    carbs_g: Math.max(80, carbs),
    fat_g: fat,
    method: "Mifflin-St Jeor × activity factor (stub)",
  };
}

function buildStubPlan({ patient, specialist }) {
  const strat = `Nutrition strategy for ${specialist?.primary_disease || specialist?.icd10 || "general"} — pending specialist approval.`;
  return {
    clinical_strategy: strat,
    meal_matrix: {
      day: "sample",
      meals: [
        { time: "08:00", name: "Oatmeal + yogurt", notes: "placeholder" },
        { time: "13:00", name: "Chicken salad", notes: "placeholder" },
        { time: "19:00", name: "Fish + vegetables", notes: "placeholder" },
      ],
      context: {
        activity_level: patient?.lifestyle?.activity_level || null,
        tdee: null,
      },
    },
    shopping_list: [
      { item: "oats", qty: "500g" },
      { item: "yogurt", qty: "500g" },
      { item: "chicken breast", qty: "400g" },
      { item: "mixed salad", qty: "2 bags" },
      { item: "fish", qty: "400g" },
      { item: "vegetables", qty: "1kg" },
    ],
    llm_outputs: {
      clinical_logic:
        "Dietary rules based on your clinical assessment.",
      culinary_creative:
        "Meal ideas and ingredient mapping aligned with the dietary rules.",
      rag_retrieval:
        "Reference guidance summary (standards and nutrition considerations).",
    },
  };
}

function rowToApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    patient_id: row.patient_id,
    specialist_id: row.specialist_id,
    status: row.status,
    clinical_strategy: row.clinical_strategy,
    meal_matrix: row.meal_matrix,
    shopping_list: row.shopping_list,
    llm_outputs: row.llm_outputs,
    target_macros: row.target_macros,
    created_at: row.created_at,
  };
}

async function generateAndStorePlan(patientId, opts = {}) {
  const assembled = await assembleOrchestratorInput(patientId);
  const plan = buildStubPlan(assembled);
  const tdee = computeTargetMacros(assembled.patient);
  plan.meal_matrix.context = {
    ...plan.meal_matrix.context,
    tdee: tdee.kcal,
  };

  const created = await dietPlanRepository.createPlan({
    patient_id: patientId,
    specialist_id: opts.specialist_id ?? null,
    status: "pending",
    clinical_strategy: plan.clinical_strategy,
    meal_matrix: plan.meal_matrix,
    shopping_list: plan.shopping_list,
    llm_outputs: plan.llm_outputs,
    target_macros: null,
  });

  return {
    plan_id: created.id,
    input: assembled,
    plan: {
      clinical_strategy: plan.clinical_strategy,
      meal_matrix: plan.meal_matrix,
      shopping_list: plan.shopping_list,
      llm_outputs: plan.llm_outputs,
    },
  };
}

async function getLatestPlan(patientId) {
  const row = await dietPlanRepository.getLatestPlanRow(patientId);
  return rowToApi(row);
}

async function approveLatestPlan(patientId, specialistUserId, edited = {}) {
  const row = await dietPlanRepository.getLatestPlanRow(patientId);
  if (!row) {
    const err = new Error("No plan found");
    err.status = 404;
    throw err;
  }
  const assembled = await assembleOrchestratorInput(patientId);
  const target_macros = computeTargetMacros(assembled.patient);

  const update = {
    status: "approved",
    specialist_id: specialistUserId,
    target_macros,
  };

  // Specialist may optionally override the content (e.g. edited journal review).
  if (edited?.llm_outputs) update.llm_outputs = edited.llm_outputs;
  if (edited?.clinical_strategy) update.clinical_strategy = edited.clinical_strategy;
  if (edited?.meal_matrix) update.meal_matrix = edited.meal_matrix;
  if (edited?.shopping_list) update.shopping_list = edited.shopping_list;

  await row.update(update);
  return rowToApi(await row.reload());
}

module.exports = {
  assembleOrchestratorInput,
  generateAndStorePlan,
  getLatestPlan,
  approveLatestPlan,
  assertCanAccessPatientPlan,
};
