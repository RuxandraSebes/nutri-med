const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://ai-service:5001";

const REQUEST_TIMEOUT_MS = 20000;
const POLL_REQUEST_TIMEOUT_MS = 60000;
const SWAP_REQUEST_TIMEOUT_MS = Number(
  process.env.AI_SWAP_REQUEST_TIMEOUT_MS || 180000,
);

function baseUrl() {
  return AI_SERVICE_URL.replace(/\/$/, "");
}

async function fetchWithTimeout(
  url,
  init = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      const e = new Error(`Request timed out after ${timeoutMs}ms`);
      e.status = 504;
      e.code = "TIMEOUT";
      throw e;
    }
    throw new Error(`Fetch failed: ${err.message}`);
  } finally {
    clearTimeout(tid);
  }
}

async function safeParseJSON(resp) {
  const text = await resp.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function parseErrorResponse(resp) {
  const data = await safeParseJSON(resp);
  if (typeof data === "string") return data;
  if (data.error) return data.error;
  if (data.message) return data.message;
  return JSON.stringify(data);
}

async function getMatrixJobStatus(jobId) {
  const url = `${baseUrl()}/matrix-status/${encodeURIComponent(jobId)}`;
  const resp = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: { accept: "application/json" },
    },
    POLL_REQUEST_TIMEOUT_MS,
  );
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const errText =
      typeof data === "object" && data.error ? data.error : JSON.stringify(data);
    throw new Error(`matrix-status HTTP ${resp.status}: ${errText}`);
  }
  return data;
}

async function requestMatrix(patientId, opts = {}) {
  const url = `${baseUrl()}/generate-matrix`;
  if (
    !opts.target_macros ||
    typeof opts.target_macros !== "object" ||
    opts.target_macros.kcal == null
  ) {
    throw new Error(
      "target_macros with kcal/protein_g/carbs_g/fat_g is required (computed by recommendation-service tdee.js)",
    );
  }
  const body = {
    patientId: Number(patientId),
    targetMacros: opts.target_macros,
  };

  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (resp.status !== 202) {
    const errText = await parseErrorResponse(resp);
    throw new Error(
      `AI /generate-matrix expected 202, got ${resp.status}: ${errText}`,
    );
  }

  const data = await resp.json();
  if (!data.jobId) {
    throw new Error("Missing jobId from AI service");
  }

  console.log(`[AI] Job started: ${data.jobId}`);

  return { jobId: data.jobId, status: data.status || "pending" };
}

async function suggestIngredientSwaps(patientId, oldName) {
  const url = `${baseUrl()}/suggest-ingredient-swaps`;
  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        patientId: Number(patientId),
        oldName: String(oldName),
      }),
    },
    SWAP_REQUEST_TIMEOUT_MS,
  );
  const data = await safeParseJSON(resp);
  if (!resp.ok) {
    const err = new Error(
      data?.error || `suggest-ingredient-swaps HTTP ${resp.status}`,
    );
    err.status = resp.status;
    throw err;
  }
  return data;
}

async function applyIngredientSwap(mealMatrix, oldName, replacement) {
  const url = `${baseUrl()}/apply-ingredient-swap`;
  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mealMatrix,
        oldName: String(oldName),
        replacement,
      }),
    },
    SWAP_REQUEST_TIMEOUT_MS,
  );
  const data = await safeParseJSON(resp);
  if (!resp.ok) {
    const err = new Error(
      data?.error || `apply-ingredient-swap HTTP ${resp.status}`,
    );
    err.status = resp.status;
    throw err;
  }
  return data;
}

module.exports = {
  requestMatrix,
  getMatrixJobStatus,
  suggestIngredientSwaps,
  applyIngredientSwap,
};
