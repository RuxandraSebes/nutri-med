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
// Keep these re-exports so the rest of the app doesn’t need to change.
export { authApi } from "./authApi.js";
export { patientApi } from "./patientApi.js";
export { medicalApi } from "./medicalApi.js";
export { recommendationApi } from "./recommendationApi.js";
export { aiApi } from "./aiApi.js";
