require("dotenv").config();
const express = require("express");
const { sequelize } = require("./models");
const authRoutes = require("./routes/authRoutes");

const app = express();
app.use(express.json({ limit: "512kb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "auth-service ok", timestamp: new Date() });
});

app.use("/", authRoutes);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Server error" });
});

const PORT = process.env.AUTH_SERVICE_PORT || process.env.PORT || 3010;

async function start() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  app.listen(PORT, () => console.log(`auth-service on :${PORT}`));
}

start().catch((err) => {
  console.error("auth-service failed:", err);
  process.exit(1);
});
