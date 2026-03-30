require("dotenv").config();
const express = require("express");

const { sequelize } = require("./models");
const recommendationRoutes = require("./routes/recommendationRoutes");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "recommendation-service ok", timestamp: new Date() });
});

app.use("/", recommendationRoutes);

const PORT =
  process.env.RECOMMENDATION_SERVICE_PORT || process.env.PORT || 3003;

async function start() {
  await sequelize.authenticate();
  await sequelize.sync();
  app.listen(PORT, () => console.log(`recommendation-service on :${PORT}`));
}

start().catch((err) => {
  console.error("recommendation-service failed to start:", err);
  process.exit(1);
});

