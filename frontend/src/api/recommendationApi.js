import { baseFetch } from "./baseFetch.js";

export const recommendationApi = {
  generatePlan: (patientId, payload) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan`, {
      method: "POST",
      body: payload || {},
    }),
  getLatestPlan: (patientId) => baseFetch(`/api/recommendations/patients/${patientId}/plan`),
  approvePlan: (patientId, payload = {}) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan/approve`, {
      method: "PATCH",
      body: payload || {},
    }),
};

