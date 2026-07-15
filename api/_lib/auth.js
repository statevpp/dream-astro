/**
 * _lib/auth.js
 * Magic-link автентикация без пароли — прост JWT с 30-дневен живот,
 * подписан с AUTH_SECRET. Клиентът го пази в localStorage и го праща
 * като Authorization: Bearer <token> при заявки към /api/horoscope/full.
 *
 * npm install jsonwebtoken
 * TODO: сложи AUTH_SECRET (произволен дълъг string) в env variables.
 */

const jwt = require("jsonwebtoken");

function createMagicLinkToken(email) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET не е зададен в env — виж api/README_DEPLOY.md");
  return jwt.sign({ email }, secret, { expiresIn: "30d" });
}

function verifyToken(token) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET не е зададен в env");
  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

function getEmailFromRequest(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const payload = verifyToken(token);
  return payload?.email || null;
}

module.exports = { createMagicLinkToken, verifyToken, getEmailFromRequest };
