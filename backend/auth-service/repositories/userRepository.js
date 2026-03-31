const { User } = require("../models");

async function findByEmail(email) {
  return await User.findOne({ where: { email: email.toLowerCase().trim() } });
}

async function createUser({ email, password_hash, role }) {
  return await User.create({
    email: email.toLowerCase().trim(),
    password_hash,
    role,
  });
}

async function findById(id) {
  return await User.findByPk(id);
}

module.exports = { findByEmail, createUser, findById };
