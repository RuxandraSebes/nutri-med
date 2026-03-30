const { Patient } = require("../models");

async function upsertByUserId(userId, payload) {
  const existing = await Patient.findOne({ where: { user_id: userId } });
  if (existing) {
    await existing.update(payload);
    return existing;
  }
  return await Patient.create({ user_id: userId, ...payload });
}

async function getByUserId(userId) {
  return await Patient.findOne({ where: { user_id: userId } });
}

module.exports = {
  upsertByUserId,
  getByUserId,
};

