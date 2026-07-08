const express = require("express");
const morgan = require("morgan");
const { Agent, fetch: undiciFetch } = require("undici");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept",
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

const services = {
  patient: process.env.PATIENT_SERVICE_URL || "http://localhost:3001",
  medical: process.env.MEDICAL_SERVICE_URL || "http://localhost:3002",
  recommendation:
    process.env.RECOMMENDATION_SERVICE_URL || "http://localhost:3003",
  auth: process.env.AUTH_SERVICE_URL || "http://localhost:3010",
  ai: process.env.AI_SERVICE_URL || "http://localhost:5001",
};
const PROXY_TIMEOUT_MS = Number(
  process.env.GATEWAY_PROXY_TIMEOUT_MS || 1200000,
);

const proxyDispatcher = new Agent({
  headersTimeout: PROXY_TIMEOUT_MS,
  bodyTimeout: PROXY_TIMEOUT_MS,
  connectTimeout: Math.min(120000, PROXY_TIMEOUT_MS),
});

function proxyFetchErrorDetail(err) {
  const parts = [];
  if (err && typeof err === "object" && "message" in err) {
    parts.push(String(err.message));
  }
  const c = err && typeof err === "object" && "cause" in err ? err.cause : null;
  if (c && typeof c === "object" && "message" in c) {
    parts.push(`cause: ${String(c.message)}`);
    if (c.code) parts.push(`code: ${c.code}`);
  }
  return parts.filter(Boolean).join(" - ") || String(err);
}

function filterRequestHeaders(headers) {
  const filtered = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!v) continue;
    const key = k.toLowerCase();
    if (key === "host" || key === "content-length") continue;
    filtered[k] = v;
  }
  return filtered;
}

function filterResponseHeaders(headers) {
  const filtered = {};
  for (const [k, v] of headers.entries()) {
    const key = k.toLowerCase();
    if (key === "transfer-encoding") continue;
    filtered[k] = v;
  }
  return filtered;
}

function createFetchProxy({ prefix, targetBaseUrl }) {
  return async (req, res) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    try {
      const downstreamPath = req.originalUrl.startsWith(prefix)
        ? req.originalUrl.slice(prefix.length) || "/"
        : req.originalUrl;

      const url = new URL(downstreamPath, targetBaseUrl);
      const method = req.method.toUpperCase();

      const init = {
        method,
        headers: filterRequestHeaders(req.headers),
        signal: controller.signal,
        dispatcher: proxyDispatcher,
      };

      if (method !== "GET" && method !== "HEAD") {
        if (req.body !== undefined && req.body !== null) {
          init.body =
            typeof req.body === "string" ? req.body : JSON.stringify(req.body);
          init.headers["content-type"] =
            init.headers["content-type"] || "application/json";
        }
      }

      const resp = await undiciFetch(url, init);
      const buf = Buffer.from(await resp.arrayBuffer());

      res.status(resp.status);
      const outHeaders = filterResponseHeaders(resp.headers);
      const noStorePoll =
        typeof downstreamPath === "string" &&
        downstreamPath.includes("matrix-status");
      for (const [k, v] of Object.entries(outHeaders)) {
        if (noStorePoll) {
          const lk = k.toLowerCase();
          if (lk === "etag" || lk === "last-modified") continue;
        }
        res.setHeader(k, v);
      }
      if (noStorePoll) {
        res.setHeader(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, private",
        );
        res.setHeader("Pragma", "no-cache");
      }
      res.send(buf);
    } catch (err) {
      console.error("Gateway proxy error:", err);
      const causeCode =
        err &&
        typeof err === "object" &&
        err.cause &&
        typeof err.cause === "object" &&
        err.cause.code;
      const isUndiciHeadersTimeout = causeCode === "UND_ERR_HEADERS_TIMEOUT";
      const isTimeout =
        (err && typeof err === "object" && err.name === "AbortError") ||
        isUndiciHeadersTimeout;
      const detail = proxyFetchErrorDetail(err).slice(0, 500);
      res.status(isTimeout ? 504 : 502).json({
        error: isTimeout ? "Gateway timeout" : "Bad gateway",
        detail,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

app.use(
  "/api/auth",
  createFetchProxy({ prefix: "/api/auth", targetBaseUrl: services.auth }),
);
app.use(
  "/api/patients",
  createFetchProxy({
    prefix: "/api/patients",
    targetBaseUrl: services.patient,
  }),
);
app.use(
  "/api/medical",
  createFetchProxy({ prefix: "/api/medical", targetBaseUrl: services.medical }),
);
app.use(
  "/api/recommendations",
  createFetchProxy({
    prefix: "/api/recommendations",
    targetBaseUrl: services.recommendation,
  }),
);
app.use(
  "/api/ai",
  createFetchProxy({
    prefix: "/api/ai",
    targetBaseUrl: services.ai,
  }),
);

app.get("/health", (req, res) => {
  res.json({ status: "Gateway is running", timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
});
