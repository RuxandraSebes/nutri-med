import { baseFetch } from "./baseFetch.js";

export const medicalApi = {
  saveClinical: (patientId, payload) =>
    baseFetch(`/api/medical/patients/${patientId}/clinical`, {
      method: "POST",
      body: payload,
    }),
  getSpecialistObject: (patientId) =>
    baseFetch(`/api/medical/patients/${patientId}/specialist-object`),
};

