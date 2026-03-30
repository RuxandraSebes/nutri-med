const dietPlanRepository = require("../repositories/dietPlanRepository");

const PATIENT_SERVICE_URL =
  process.env.PATIENT_SERVICE_URL || "http://localhost:3001";
const MEDICAL_SERVICE_URL =
  process.env.MEDICAL_SERVICE_URL || "http://localhost:3002";

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Fetch failed ${resp.status} ${url}: ${text}`);
  }
  return await resp.json();
}

async function assembleOrchestratorInput(patientId) {
  const patient = await fetchJson(
    `${PATIENT_SERVICE_URL}/patients/${patientId}/profile`,
  );
  const specialist = await fetchJson(
    `${MEDICAL_SERVICE_URL}/patients/${patientId}/specialist-object`,
  );
  return { patient, specialist };
}

function buildStubPlan({ patient, specialist }) {
  return {
    clinical_strategy: `Stub strategy for ICD-10 ${specialist.icd10 || "N/A"}`,
    meal_matrix: {
      day: "sample",
      meals: [
        { time: "08:00", name: "Oatmeal + yogurt", notes: "placeholder" },
        { time: "13:00", name: "Chicken salad", notes: "placeholder" },
        { time: "19:00", name: "Fish + vegetables", notes: "placeholder" },
      ],
      context: { activity_level: patient?.lifestyle?.activity_level || null },
    },
    shopping_list: [
      { item: "oats", qty: "500g" },
      { item: "yogurt", qty: "500g" },
      { item: "chicken breast", qty: "400g" },
      { item: "mixed salad", qty: "2 bags" },
      { item: "fish", qty: "400g" },
      { item: "vegetables", qty: "1kg" },
    ],
  };
}

async function generateAndStorePlan(patientId, opts = {}) {
  const assembled = await assembleOrchestratorInput(patientId);

  // Later: feed {patient, specialist} into AI pipeline.
  const plan = buildStubPlan(assembled);

  const created = await dietPlanRepository.createPlan({
    patient_id: patientId,
    specialist_id: opts.specialist_id ?? null,
    status: "pending",
    clinical_strategy: plan.clinical_strategy,
    meal_matrix: plan.meal_matrix,
    shopping_list: plan.shopping_list,
  });

  return { plan_id: created.id, input: assembled, plan };
}

async function getLatestPlan(patientId) {
  const row = await dietPlanRepository.getLatestPlan(patientId);
  if (!row) return null;
  return {
    id: row.id,
    patient_id: row.patient_id,
    specialist_id: row.specialist_id,
    status: row.status,
    clinical_strategy: row.clinical_strategy,
    meal_matrix: row.meal_matrix,
    shopping_list: row.shopping_list,
    created_at: row.created_at,
  };
}

module.exports = {
  assembleOrchestratorInput,
  generateAndStorePlan,
  getLatestPlan,
};

