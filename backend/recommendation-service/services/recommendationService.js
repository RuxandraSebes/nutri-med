const dietPlanRepository = require("../repositories/dietPlanRepository");
const { calculateTDEE } = require("./tdee");

const PATIENT_SERVICE_URL =
  process.env.PATIENT_SERVICE_URL || "http://localhost:3001";
const MEDICAL_SERVICE_URL =
  process.env.MEDICAL_SERVICE_URL || "http://localhost:3002";
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:5001";

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
  ).catch(() => null); // medical data is optional at plan-generation time

  return { patient, specialist };
}

/**
 * Call the Python AI service to generate the 7×4 RAG nutrition matrix.
 * Falls back to stub plan if AI service is unavailable.
 */
async function callRagMatrix(patientId) {
  const url = `${AI_SERVICE_URL}/generate-matrix`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ patientId }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `AI service /generate-matrix failed ${resp.status}: ${text}`,
    );
  }

  return await resp.json();
}

/**
 * Convert the RAG matrix response into the internal plan shape.
 */
function ragMatrixToPlanShape(ragResult, patient) {
  const { matrix, tdee, clinical_notes, foods_used } = ragResult;

  // Build a flat meal list for the "meal_matrix.meals" field (first day preview)
  const MEAL_TIMES = {
    Breakfast: "08:00",
    "Morning Snack": "10:30",
    Lunch: "13:00",
    Dinner: "19:00",
  };

  const DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  // Flatten for the meal_matrix.meals array (first day for UI compat)
  const firstDay = matrix[DAYS[0]] || {};
  const meals = Object.entries(firstDay)
    .filter(([key]) => key !== "day_total_kcal")
    .map(([mealName, mealData]) => ({
      time: MEAL_TIMES[mealName] || "00:00",
      name: (mealData.foods || []).map((f) => f.name).join(" + "),
      notes: `${mealData.meal_kcal || 0} kcal`,
      foods: mealData.foods || [],
    }));

  // Build shopping list from foods_used
  const shopping_list = (foods_used || []).map((item) => ({
    item,
    qty: "as needed",
  }));

  return {
    clinical_strategy:
      clinical_notes || "RAG-generated personalized nutrition plan.",
    meal_matrix: {
      day: "7-day plan",
      meals,
      weekly: matrix,
      context: {
        activity_level: patient?.lifestyle?.activity_level || null,
        tdee: tdee?.kcal || null,
      },
    },
    shopping_list,
    llm_outputs: {
      clinical_logic: clinical_notes || "",
      culinary_creative:
        "Meal plan generated using RAG with nutritional database context.",
      rag_retrieval: `Foods used from nutritional database: ${(foods_used || []).slice(0, 10).join(", ")}${foods_used?.length > 10 ? "…" : ""}`,
    },
    target_macros: tdee || null,
  };
}

/**
 * Stub plan fallback (used when AI service is unavailable).
 */
function buildStubPlan({ patient, specialist }) {
  const strat = `Nutrition strategy for ${specialist?.primary_disease || specialist?.icd10 || "general"} — pending specialist approval. (Stub: AI service unavailable)`;
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
      clinical_logic: "Dietary rules based on your clinical assessment.",
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

  let plan;
  let ragResult = null;

  // ── Try RAG first ──────────────────────────────────────────────────────────
  try {
    ragResult = await callRagMatrix(patientId);
    plan = ragMatrixToPlanShape(ragResult, assembled.patient);
    console.log(
      `[recommendation] RAG matrix generated for patientId=${patientId}`,
    );
  } catch (ragErr) {
    console.warn(
      `[recommendation] RAG matrix failed, falling back to stub plan: ${ragErr.message}`,
    );
    // ── Fallback: stub plan ──────────────────────────────────────────────────
    plan = buildStubPlan(assembled);

    // Compute TDEE for context even in stub mode
    const tdee = calculateTDEE(assembled.patient);
    plan.meal_matrix.context = {
      ...plan.meal_matrix.context,
      tdee: tdee.kcal,
    };
  }

  // ── Always compute TDEE from DB fields for target_macros ──────────────────
  const tdee = calculateTDEE(assembled.patient);

  const created = await dietPlanRepository.createPlan({
    patient_id: patientId,
    specialist_id: opts.specialist_id ?? null,
    status: "pending",
    clinical_strategy: plan.clinical_strategy,
    meal_matrix: plan.meal_matrix,
    shopping_list: plan.shopping_list,
    llm_outputs: plan.llm_outputs,
    target_macros: plan.target_macros || tdee,
  });

  return {
    plan_id: created.id,
    input: assembled,
    rag: ragResult
      ? { status: "success", tdee: ragResult.tdee }
      : { status: "stub_fallback" },
    plan: {
      clinical_strategy: plan.clinical_strategy,
      meal_matrix: plan.meal_matrix,
      shopping_list: plan.shopping_list,
      llm_outputs: plan.llm_outputs,
      target_macros: plan.target_macros || tdee,
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
  const target_macros = calculateTDEE(assembled.patient);

  const update = {
    status: "approved",
    specialist_id: specialistUserId,
    target_macros,
  };

  if (edited?.llm_outputs) update.llm_outputs = edited.llm_outputs;
  if (edited?.clinical_strategy)
    update.clinical_strategy = edited.clinical_strategy;
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
