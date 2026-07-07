require("dotenv").config();
const express = require("express");

const { sequelize } = require("./models");
const patientRoutes = require("./routes/patientRoutes");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "patient-service ok", timestamp: new Date() });
});

app.use("/", patientRoutes);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Server error" });
});

const PORT = process.env.PATIENT_SERVICE_PORT || process.env.PORT || 3001;

async function start() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  app.listen(PORT, () => console.log(`patient-service on :${PORT}`));
}

start().catch((err) => {
  console.error("patient-service failed to start:", err);
  process.exit(1);
});

