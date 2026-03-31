const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE)
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, "")
    : "http://localhost:3000";

// ── Token helpers ─────────────────────────────────────────────────────────────
const STORAGE_KEY = "nutrimed_token";
let _token =
  typeof localStorage !== "undefined"
    ? localStorage.getItem(STORAGE_KEY)
    : null;

export function setAuthToken(token) {
  _token = token;
  if (typeof localStorage !== "undefined") {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  }
}
export function getAuthToken() {
  return _token;
}
export function clearAuthToken() {
  _token = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
export async function baseFetch(path, options = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = {
    accept: "application/json",
    ...(options.headers || {}),
  };

  if (_token) headers["authorization"] = `Bearer ${_token}`;

  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    headers["content-type"] = headers["content-type"] || "application/json";
    body = JSON.stringify(body);
  }

  const resp = await fetch(url, { ...options, headers, body });
  const contentType = resp.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await resp.json().catch(() => null) : await resp.text();

  if (!resp.ok) {
    const msg = (data && data.error) || `Request failed ${resp.status}`;
    const err = new Error(msg);
    err.status = resp.status;
    err.data   = data;
    throw err;
  }

  return data;
}

// ── Service-specific helpers ──────────────────────────────────────────────────

export const authApi = {
  register: (body) =>
    baseFetch("/api/auth/register", { method: "POST", body }),
  login: (body) => baseFetch("/api/auth/login", { method: "POST", body }),
  me: () => baseFetch("/api/auth/me"),
};

// Patient service
export const patientApi = {
  bootstrap: () =>
    baseFetch("/api/patients/patients/bootstrap", { method: "POST" }),
  getMe: () => baseFetch("/api/patients/patients/me"),
  putMe: (body) =>
    baseFetch("/api/patients/patients/me", { method: "PUT", body }),
  search: (q) =>
    baseFetch(
      `/api/patients/patients/search${q != null && q !== "" ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  getForSpecialist: (recordId) =>
    baseFetch(`/api/patients/patients/for-specialist/${recordId}`),
  getProfile: (userId) =>
    baseFetch(`/api/patients/patients/${userId}/profile`),
  upsertProfile: (userId, payload) =>
    baseFetch(`/api/patients/patients/${userId}/profile`, {
      method: "POST",
      body: payload,
    }),
};

// Medical service
export const medicalApi = {
  saveClinical: (patientId, payload) =>
    baseFetch(`/api/medical/patients/${patientId}/clinical`, { method: "POST", body: payload }),
  getSpecialistObject: (patientId) =>
    baseFetch(`/api/medical/patients/${patientId}/specialist-object`),
};

// Recommendation service
export const recommendationApi = {
  generatePlan: (patientId, payload) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan`, {
      method: "POST",
      body: payload || {},
    }),
  getLatestPlan: (patientId) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan`),
  approvePlan: (patientId, payload = {}) =>
    baseFetch(`/api/recommendations/patients/${patientId}/plan/approve`, {
      method: "PATCH",
      body: payload || {},
    }),
};

// AI service (direct — port 3000 forwarded or separate)
export const aiApi = {
  analyzeJournal: (foodEntry) =>
    baseFetch("/api/ai/analyze-journal", { method: "POST", body: { foodEntry } }),
};
