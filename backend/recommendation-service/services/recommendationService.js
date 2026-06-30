const dietPlanRepository = require("../repositories/dietPlanRepository");
const { calculateTDEE } = require("./tdee");
const { validateApprovedPlan } = require("./safetyValidation");
const { consolidateShoppingList } = require("./shoppingListBuilder");
const {
  generateMatrix,
  requestMatrix,
  getMatrixJobStatus,
  suggestIngredientSwaps,
  applyIngredientSwap,
} = require("../src/aiClient");

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
  ).catch(() => null); // medical data is optional at plan-generation time

  return { patient, specialist };
}

/**
 * Call the Python AI service (async job + poll) for the 7×4 RAG nutrition matrix.
 * Falls back to stub plan if AI service is unavailable.
 */
async function callRagMatrix(patientId) {
  // Parallel Ollama batches on CPU often exceed 4–5 minutes; default 20 min.
  const timeoutMs = Number(process.env.AI_MATRIX_POLL_TIMEOUT_MS || 1200000);
  const intervalMs = Number(process.env.AI_MATRIX_POLL_INTERVAL_MS || 8000);
  const maxAttempts = Number(process.env.AI_MATRIX_POLL_MAX_ATTEMPTS || 200);
  return generateMatrix(patientId, { timeoutMs, intervalMs, maxAttempts });
}

/**
 * Convert the RAG matrix response into the internal plan shape.
 */
function ragMatrixToPlanShape(ragResult, patient) {
  const { matrix, tdee, clinical_notes, foods_used } = ragResult;

  // Build a flat meal list for the "meal_matrix.meals" field (first day preview)
  const MEAL_TIMES = {
    Breakfast: "08:00",
    Lunch: "13:00",
    Dinner: "19:00",
    Snack: "15:30",
    "Morning Snack": "15:30",
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
    llm_outputs: null,
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
    llm_outputs: null,
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

/**
 * Start AI matrix job only (no polling). Frontend polls GET .../api/ai/matrix-status/:jobId.
 */
async function startPlanGeneration(patientId, opts = {}) {
  return requestMatrix(patientId, { target_macros: opts.target_macros });
}

/**
 * After matrix job is done, persist diet plan from AI job result.
 */
async function completePlanFromJob(patientId, jobId, opts = {}) {
  const statusBody = await getMatrixJobStatus(jobId);

  if (statusBody.status === "pending" || statusBody.status === "running") {
    const err = new Error("Matrix job has not finished yet");
    err.status = 409;
    err.data = { status: statusBody.status };
    throw err;
  }
  if (statusBody.status === "error") {
    const err = new Error(statusBody.error || "Matrix generation failed");
    err.status = 422;
    throw err;
  }
  if (statusBody.status !== "done" || !statusBody.result) {
    const err = new Error("Unexpected matrix job response");
    err.status = 502;
    throw err;
  }

  const ragResult = statusBody.result;
  if (
    ragResult.patient_id != null &&
    Number(ragResult.patient_id) !== Number(patientId)
  ) {
    const err = new Error("Matrix result does not match requested patient");
    err.status = 400;
    throw err;
  }

  await dietPlanRepository.deletePendingPlansForPatient(patientId);

  const assembled = await assembleOrchestratorInput(patientId);

  let plan;
  try {
    plan = ragMatrixToPlanShape(ragResult, assembled.patient);
    console.log(
      `[recommendation] RAG matrix finalized from job ${jobId} patientId=${patientId}`,
    );
  } catch (mapErr) {
    const err = new Error(mapErr.message || "Failed to map matrix to plan");
    err.status = 422;
    throw err;
  }

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
    rag: { status: "success", tdee: ragResult.tdee, jobId },
    plan: {
      clinical_strategy: plan.clinical_strategy,
      meal_matrix: plan.meal_matrix,
      shopping_list: plan.shopping_list,
      llm_outputs: plan.llm_outputs,
      target_macros: plan.target_macros || tdee,
    },
  };
}

async function generateAndStorePlan(patientId, opts = {}) {
  await dietPlanRepository.deletePendingPlansForPatient(patientId);

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

async function getLatestPlan(patientId, auth) {
  if (auth?.role === "patient") {
    const row = await dietPlanRepository.getLatestApprovedPlanRow(patientId);
    return rowToApi(row);
  }
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
  if (row.status !== "pending") {
    const err = new Error("Latest plan is not in draft/review state");
    err.status = 409;
    throw err;
  }

  const assembled = await assembleOrchestratorInput(patientId);
  const target_macros = calculateTDEE(assembled.patient);

  const meal_matrix = edited.meal_matrix ?? row.meal_matrix;
  const safety = validateApprovedPlan(
    assembled.patient,
    assembled.specialist,
    meal_matrix,
  );
  if (!safety.ok) {
    const err = new Error(safety.errors[0] || "Safety validation failed");
    err.status = 400;
    err.data = { errors: safety.errors, warnings: safety.warnings };
    throw err;
  }

  const mergedShopping = consolidateShoppingList(meal_matrix);

  const update = {
    status: "approved",
    specialist_id: specialistUserId,
    target_macros,
    shopping_list: mergedShopping,
    meal_matrix,
    clinical_strategy:
      edited.clinical_strategy !== undefined
        ? edited.clinical_strategy
        : row.clinical_strategy,
    llm_outputs:
      edited.llm_outputs !== undefined ? edited.llm_outputs : row.llm_outputs,
  };

  await row.update(update);
  const api = rowToApi(await row.reload());
  return { ...api, safety_warnings: safety.warnings };
}

async function updateDraftPlan(patientId, patch = {}) {
  const row = await dietPlanRepository.getLatestPlanRow(patientId);
  if (!row) {
    const err = new Error("No plan found to update");
    err.status = 404;
    throw err;
  }
  if (row.status !== "pending" && row.status !== "approved") {
    const err = new Error("Latest plan cannot be edited in its current state");
    err.status = 409;
    throw err;
  }
  const u = {};
  if (patch.clinical_strategy != null) u.clinical_strategy = patch.clinical_strategy;
  if (patch.meal_matrix != null) u.meal_matrix = patch.meal_matrix;
  if (patch.shopping_list != null) u.shopping_list = patch.shopping_list;
  if (patch.llm_outputs != null) u.llm_outputs = patch.llm_outputs;
  if (patch.target_macros != null) u.target_macros = patch.target_macros;
  await row.update(u);
  return rowToApi(await row.reload());
}

async function discardDraftPlan(patientId) {
  const n = await dietPlanRepository.deletePendingPlansForPatient(patientId);
  if (!n) {
    const err = new Error("No draft plan to discard");
    err.status = 404;
    throw err;
  }
  return { discarded: n };
}

async function suggestPlanIngredientSwaps(patientId, oldName) {
  const row = await dietPlanRepository.getLatestPlanRow(patientId);
  if (!row) {
    const err = new Error("No plan found");
    err.status = 404;
    throw err;
  }
  if (row.status !== "approved") {
    const err = new Error("Ingredient swaps are available only on approved plans");
    err.status = 409;
    throw err;
  }
  if (!oldName || !String(oldName).trim()) {
    const err = new Error("Missing oldName");
    err.status = 400;
    throw err;
  }
  return suggestIngredientSwaps(patientId, String(oldName).trim());
}

async function applyPlanIngredientSwap(patientId, oldName, replacement) {
  const row = await dietPlanRepository.getLatestPlanRow(patientId);
  if (!row) {
    const err = new Error("No plan found");
    err.status = 404;
    throw err;
  }
  if (row.status !== "approved") {
    const err = new Error("Only an approved plan can be updated with ingredient swaps");
    err.status = 409;
    throw err;
  }
  if (!oldName || !String(oldName).trim()) {
    const err = new Error("Missing oldName");
    err.status = 400;
    throw err;
  }
  if (!replacement || typeof replacement !== "object") {
    const err = new Error("Missing replacement");
    err.status = 400;
    throw err;
  }

  const result = await applyIngredientSwap(
    row.meal_matrix,
    String(oldName).trim(),
    replacement,
  );
  const meal_matrix = result.meal_matrix;
  const shopping_list = consolidateShoppingList(meal_matrix);

  await row.update({ meal_matrix, shopping_list });
  return rowToApi(await row.reload());
}

module.exports = {
  assembleOrchestratorInput,
  startPlanGeneration,
  completePlanFromJob,
  generateAndStorePlan,
  getLatestPlan,
  approveLatestPlan,
  updateDraftPlan,
  discardDraftPlan,
  suggestPlanIngredientSwaps,
  applyPlanIngredientSwap,
  assertCanAccessPatientPlan,
};
