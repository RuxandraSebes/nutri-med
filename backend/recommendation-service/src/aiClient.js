/**
 * Bulletproof async client for NutriMed AI service
 * Handles:
 * - timeouts separately for POST vs polling
 * - retry on transient errors (fetch failed, timeout)
 * - safe JSON parsing
 * - resilient polling loop
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://ai-service:5001";

// Timeouts
const REQUEST_TIMEOUT_MS = 20000; // POST (matrix job start)
const POLL_REQUEST_TIMEOUT_MS = 60000; // GET status
/** Ollama swap suggestions often take 60–120s on CPU; matrix POST stays at 20s. */
const SWAP_REQUEST_TIMEOUT_MS = Number(
  process.env.AI_SWAP_REQUEST_TIMEOUT_MS || 180000,
);

// Polling behavior
const DEFAULT_INTERVAL_MS = 8000;
/** Must cover slow CPU Ollama + 3 parallel matrix batches (often 5–20+ min). */
const DEFAULT_TIMEOUT_MS = 1200000; // 20 min
const DEFAULT_MAX_ATTEMPTS = 200;

function baseUrl() {
  return AI_SERVICE_URL.replace(/\/$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Single GET /matrix-status/:jobId (for finalize step; no polling loop).
 */
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

/**
 * Start matrix generation
 */
async function requestMatrix(patientId, opts = {}) {
  const url = `${baseUrl()}/generate-matrix`;
  const body = { patientId: Number(patientId) };
  if (opts.target_macros != null) {
    body.targetMacros = opts.target_macros;
  }

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

/**
 * Poll matrix status with retry + resilience
 */
async function pollMatrix(jobId, options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const started = Date.now();
  let attempt = 0;

  while (attempt < maxAttempts) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Matrix job ${jobId} timed out (${timeoutMs} ms)`);
    }

    attempt++;
    const url = `${baseUrl()}/matrix-status/${encodeURIComponent(jobId)}`;

    let resp;

    try {
      resp = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: { accept: "application/json" },
        },
        POLL_REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      console.warn(
        `[AI] Poll attempt ${attempt} failed (network/timeout): ${err.message}`,
      );
      await sleep(intervalMs);
      continue; // retry instead of crashing
    }

    if (resp.status === 404) {
      const errText = await parseErrorResponse(resp);
      throw new Error(`Matrix job not found: ${jobId} — ${errText}`);
    }

    if (!resp.ok) {
      const errText = await parseErrorResponse(resp);
      console.warn(
        `[AI] Poll attempt ${attempt} got HTTP ${resp.status}: ${errText}`,
      );
      await sleep(intervalMs);
      continue; // retry
    }

    let data;
    try {
      data = await resp.json();
    } catch (err) {
      console.warn(`[AI] Invalid JSON on poll attempt ${attempt}`);
      await sleep(intervalMs);
      continue;
    }

    const status = data.status;

    console.log(`[AI] Poll ${attempt}: status=${status}`);

    if (status === "done") {
      if (!data.result) {
        throw new Error(`Job ${jobId} done but result missing`);
      }
      return data.result;
    }

    if (status === "error") {
      const errMsg = data.error || "Unknown matrix error";
      throw new Error(`Matrix job ${jobId} failed: ${errMsg}`);
    }

    // pending / running → continue polling
    await sleep(intervalMs);
  }

  throw new Error(
    `Matrix job ${jobId} exceeded maxAttempts=${maxAttempts} without completion`,
  );
}

/**
 * High-level function
 */
async function generateMatrix(patientId, pollOptions = {}) {
  try {
    const { target_macros, ...pollOpts } = pollOptions;
    const { jobId } = await requestMatrix(patientId, { target_macros });
    return await pollMatrix(jobId, pollOpts);
  } catch (err) {
    console.error("[AI] generateMatrix failed:", err.message);
    throw err; // lăsăm caller să decidă fallback
  }
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
  pollMatrix,
  generateMatrix,
  suggestIngredientSwaps,
  applyIngredientSwap,
};
