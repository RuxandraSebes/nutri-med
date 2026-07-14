const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://ai-service:5001";

const REQUEST_TIMEOUT_MS = Number(
  process.env.AI_JOURNAL_REQUEST_TIMEOUT_MS || 180000,
);

function baseUrl() {
  return AI_SERVICE_URL.replace(/\/$/, "");
}

async function analyzeJournal({ diaryText, patientDetails, specialistDetails }) {
  const url = `${baseUrl()}/analyze-journal`;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        journalEntries: diaryText,
        patientDetails,
        specialistDetails,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      const e = new Error(`Journal analysis timed out after ${REQUEST_TIMEOUT_MS}ms`);
      e.status = 504;
      throw e;
    }
    throw new Error(`Fetch failed: ${err.message}`);
  } finally {
    clearTimeout(tid);
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.success === false) {
    const err = new Error(data?.error || `analyze-journal HTTP ${resp.status}`);
    err.status = resp.status >= 400 ? resp.status : 502;
    throw err;
  }
  return { score: data.score, food_notes: data.food_notes || [] };
}

module.exports = { analyzeJournal };
