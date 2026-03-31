const { Op } = require("sequelize");
const { Patient } = require("../models");

async function upsertByUserId(userId, payload) {
  const existing = await Patient.findOne({ where: { user_id: userId } });
  if (existing) {
    await existing.update(payload);
    return existing.reload();
  }
  return await Patient.create({ user_id: userId, ...payload });
}

async function getByUserId(userId) {
  return await Patient.findOne({ where: { user_id: userId } });
}

async function getIdByUserId(userId) {
  const row = await Patient.findOne({
    where: { user_id: userId },
    attributes: ["id"],
  });
  return row ? row.id : null;
}

async function getById(id) {
  return await Patient.findByPk(id);
}

async function searchByQuery(q) {
  const term = (q || "").trim();
  if (!term) {
    return await Patient.findAll({
      limit: 50,
      order: [["created_at", "DESC"]],
      attributes: ["id", "public_patient_id", "age", "gender", "created_at"],
    });
  }
  const num = Number(term);
  const or = [{ public_patient_id: { [Op.like]: `%${term}%` } }];
  if (Number.isFinite(num) && num > 0 && String(num) === term) {
    or.push({ id: num });
  }
  return await Patient.findAll({
    where: { [Op.or]: or },
    limit: 25,
    attributes: ["id", "public_patient_id", "age", "gender", "created_at"],
  });
}

module.exports = {
  upsertByUserId,
  getByUserId,
  getIdByUserId,
  getById,
  searchByQuery,
};
