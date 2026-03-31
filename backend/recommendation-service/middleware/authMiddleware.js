const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-change-me-in-production";

function requireAuth(...allowedRoles) {
  return (req, res, next) => {
    try {
      const h = req.headers.authorization;
      if (!h || !h.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const token = h.slice(7);
      const payload = jwt.verify(token, JWT_SECRET);
      req.auth = {
        userId: Number(payload.sub),
        role: payload.role,
      };
      if (!Number.isFinite(req.auth.userId)) {
        return res.status(401).json({ error: "Invalid token" });
      }
      if (
        allowedRoles.length &&
        !allowedRoles.includes(req.auth.role)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
}

module.exports = { requireAuth };
