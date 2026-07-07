import { baseFetch } from "./baseFetch.js";

export const patientApi = {
  bootstrap: () => baseFetch("/api/patients/patients/bootstrap", { method: "POST" }),
  getMe: () => baseFetch("/api/patients/patients/me"),
  putMe: (body) => baseFetch("/api/patients/patients/me", { method: "PUT", body }),
  search: (q) =>
    baseFetch(
      `/api/patients/patients/search${
        q != null && q !== "" ? `?q=${encodeURIComponent(q)}` : ""
      }`,
    ),
  getForSpecialist: (recordId) =>
    baseFetch(`/api/patients/patients/for-specialist/${recordId}`),
};

