import { baseFetch } from "./baseFetch.js";

export async function pollUntilMatrixDone(jobId, options = {}) {
  const intervalMs = options.intervalMs ?? 8000;
  const timeoutMs = options.timeoutMs ?? 1200000;
  const onTick = options.onTick;
  const onPoll = options.onPoll;
  const path = `/api/ai/matrix-status/${encodeURIComponent(jobId)}`;
  const deadline = Date.now() + timeoutMs;
  const pollStart = Date.now();

  while (Date.now() < deadline) {
    if (onTick) {
      onTick(Math.floor((Date.now() - pollStart) / 1000));
    }
    const data = await baseFetch(path, { cache: "no-store" });
    if (onPoll) {
      onPoll(data);
    }
    if (data.status === "done") return data;
    if (data.status === "error") {
      const err = new Error(data.error || "Matrix generation failed");
      err.status = 422;
      throw err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Matrix generation timed out after ${timeoutMs} ms`);
}

export const recommendationApi = {
  generatePlan: (patientId, payload) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan`, {
      method: "POST",
      body: payload || {},
    }),
  completePlan: (patientId, payload) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan/complete`, {
      method: "POST",
      body: payload || {},
    }),
  regeneratePlan: (patientId, payload) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan/regenerate`, {
      method: "POST",
      body: payload || {},
    }),
  updateDraft: (patientId, payload) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan/draft`, {
      method: "PATCH",
      body: payload || {},
    }),
  discardDraft: (patientId) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan/draft`, {
      method: "DELETE",
    }),
  getLatestPlan: (patientId) => baseFetch(`/api/recommendations/patients/${patientId}/plan`),
  approvePlan: (patientId, payload = {}) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan/approve`, {
      method: "PATCH",
      body: payload || {},
    }),
  suggestIngredientSwaps: (patientId, payload) =>
    baseFetch(
      `/api/recommendations/patients/${patientId}/plan/ingredient-swaps`,
      { method: "POST", body: payload || {} },
    ),
  applyIngredientSwap: (patientId, payload) =>
    baseFetch(
      `/api/recommendations/patients/${patientId}/plan/ingredient-swap`,
      { method: "POST", body: payload || {} },
    ),
};

