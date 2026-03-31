import { baseFetch } from "./baseFetch.js";

export const aiApi = {
  analyzeJournal: (foodEntry) =>
    baseFetch("/api/ai/analyze-journal", {
      method: "POST",
      body: { foodEntry },
    }),
};

