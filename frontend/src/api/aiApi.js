import { baseFetch } from "./baseFetch.js";

export const aiApi = {
  analyzeJournal: (payload) =>
    baseFetch("/api/ai/analyze-journal", {
      method: "POST",
      body: payload,
    }),
};
