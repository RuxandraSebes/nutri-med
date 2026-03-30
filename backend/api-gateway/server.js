const express = require("express");
const morgan = require("morgan");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

const services = {
  patient: process.env.PATIENT_SERVICE_URL || "http://localhost:3001",
  medical: process.env.MEDICAL_SERVICE_URL || "http://localhost:3002",
  recommendation:
    process.env.RECOMMENDATION_SERVICE_URL || "http://localhost:3003",
};

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
    try {
      const downstreamPath = req.originalUrl.startsWith(prefix)
        ? req.originalUrl.slice(prefix.length) || "/"
        : req.originalUrl;

      const url = new URL(downstreamPath, targetBaseUrl);
      const method = req.method.toUpperCase();

      const init = {
        method,
        headers: filterRequestHeaders(req.headers),
      };

      if (method !== "GET" && method !== "HEAD") {
        if (req.body !== undefined && req.body !== null) {
          init.body =
            typeof req.body === "string" ? req.body : JSON.stringify(req.body);
          init.headers["content-type"] =
            init.headers["content-type"] || "application/json";
        }
      }

      const resp = await fetch(url, init);
      const buf = Buffer.from(await resp.arrayBuffer());

      res.status(resp.status);
      const outHeaders = filterResponseHeaders(resp.headers);
      for (const [k, v] of Object.entries(outHeaders)) res.setHeader(k, v);
      res.send(buf);
    } catch (err) {
      console.error("Gateway proxy error:", err);
      res.status(502).json({ error: "Bad gateway" });
    }
  };
}

app.use(
  "/api/patients",
  createFetchProxy({ prefix: "/api/patients", targetBaseUrl: services.patient }),
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

app.get("/health", (req, res) => {
  res.json({ status: "Gateway is running", timestamp: new Date() });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on http://localhost:${PORT}`);
});
