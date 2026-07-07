const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userRepository = require("../repositories/userRepository");

const JWT_SECRET = process.env.JWT_SECRET || "dev-change-me-in-production";
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "7d";

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );
}

function toPublicUser(user) {
  return { id: user.id, email: user.email, role: user.role };
}

async function register({ email, password, role }) {
  if (!email || !password || !role) {
    const err = new Error("email, password, and role are required");
    err.status = 400;
    throw err;
  }
  if (!["patient", "specialist"].includes(role)) {
    const err = new Error("role must be patient or specialist");
    err.status = 400;
    throw err;
  }
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    const err = new Error("Email already registered");
    err.status = 409;
    throw err;
  }
  const password_hash = await bcrypt.hash(password, 10);
  const user = await userRepository.createUser({ email, password_hash, role });
  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

async function login({ email, password }) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const err = new Error("Invalid email or password");
    err.status = 401;
    throw err;
  }
  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

async function me(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }
  return toPublicUser(user);
}

module.exports = {
  register,
  login,
  me,
  JWT_SECRET,
};
