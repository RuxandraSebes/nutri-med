const dietPlanRepository = require("../repositories/dietPlanRepository");
const { validateApprovedPlan } = require("./safetyValidation");
const { consolidateShoppingList } = require("./shoppingListBuilder");
const {
  requestMatrix,
  getMatrixJobStatus,
  suggestIngredientSwaps,
  applyIngredientSwap,
} = require("../src/aiClient");

const {
  assembleOrchestratorInput,
  assertCanAccessPatientPlan,
} = require("./recommendationClient");
const { ragMatrixToPlanShape, rowToApi } = require("./planShape");
const { resolveTargetMacrosForAi } = require("./targetMacros");

async function startPlanGeneration(patientId, opts = {}) {
  const target_macros = await resolveTargetMacrosForAi(patientId, opts);
  return requestMatrix(patientId, { target_macros });
}

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

  const persistedTargets = await resolveTargetMacrosForAi(patientId, {
    target_macros:
      opts.target_macros ||
      plan.target_macros ||
      ragResult.tdee ||
      null,
  });

  const created = await dietPlanRepository.createPlan({
    patient_id: patientId,
    specialist_id: opts.specialist_id ?? null,
    status: "pending",
    clinical_strategy: plan.clinical_strategy,
    meal_matrix: plan.meal_matrix,
    shopping_list: plan.shopping_list,
    llm_outputs: plan.llm_outputs,
    target_macros: persistedTargets,
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
      target_macros: persistedTargets,
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

  const meal_matrix = edited.meal_matrix ?? row.meal_matrix;
  const assembled = await assembleOrchestratorInput(patientId);
  const target_macros =
    edited.target_macros ??
    row.target_macros ??
    (await resolveTargetMacrosForAi(patientId, {}));
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
  resolveTargetMacrosForAi,
  startPlanGeneration,
  completePlanFromJob,
  getLatestPlan,
  approveLatestPlan,
  updateDraftPlan,
  discardDraftPlan,
  suggestPlanIngredientSwaps,
  applyPlanIngredientSwap,
  assertCanAccessPatientPlan,
};
