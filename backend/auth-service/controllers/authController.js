const jwt = require("jsonwebtoken");
const authService = require("../services/authService");

async function register(req, res, next) {
  try {
    const { email, password, role } = req.body || {};
    const result = await authService.register({ email, password, role });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const result = await authService.login({ email, password });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = h.slice(7);
    const payload = jwt.verify(token, authService.JWT_SECRET);
    req.user = {
      id: Number(payload.sub),
      email: payload.email,
      role: payload.role,
    };
    if (!Number.isFinite(req.user.id)) {
      return res.status(401).json({ error: "Invalid token" });
    }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

async function getMe(req, res, next) {
  try {
    const user = await authService.me(req.user.id);
    res.json(user);
  } catch (e) {
    next(e);
  }
}

module.exports = { register, login, getMe, requireAuth };
