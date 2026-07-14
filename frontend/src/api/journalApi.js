import { baseFetch } from "./baseFetch.js";

export const journalApi = {
  requestReview: (patientId) =>
    baseFetch(`/api/recommendations/patients/${patientId}/journal-review`, {
      method: "POST",
    }),
  regenerateReview: (patientId) =>
    baseFetch(
      `/api/recommendations/patients/${patientId}/journal-review/regenerate`,
      { method: "POST" },
    ),
  updateDraft: (patientId, payload) =>
    baseFetch(
      `/api/recommendations/patients/${patientId}/journal-review/draft`,
      { method: "PATCH", body: payload || {} },
    ),
  approveReview: (patientId, payload) =>
    baseFetch(
      `/api/recommendations/patients/${patientId}/journal-review/approve`,
      { method: "PATCH", body: payload || {} },
    ),
  declineReview: (patientId) =>
    baseFetch(`/api/recommendations/patients/${patientId}/journal-review`, {
      method: "DELETE",
    }),
  getLatestReview: (patientId) =>
    baseFetch(`/api/recommendations/patients/${patientId}/journal-review`),
};
