/**
 * GET /api/horoscope/full?sign=leo&lang=bg
 * Защитен endpoint — само за активни абонати (trial или платени).
 * Изисква Authorization: Bearer <magic-link token> (виж _lib/auth.js).
 */

const { getEmailFromRequest } = require("../_lib/auth");
const { isActiveSubscriber, getFullHoroscope } = require("../_lib/db");

module.exports = async (req, res) => {
  const email = getEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: "not authenticated" });

  const active = await isActiveSubscriber(email);
  if (!active) return res.status(402).json({ error: "subscription required" });

  const { sign, lang = "bg" } = req.query;
  if (!sign) return res.status(400).json({ error: "missing sign" });

  const today = new Date().toISOString().slice(0, 10);
  const full = await getFullHoroscope(today, sign, lang);
  if (!full) return res.status(404).json({ error: "not generated yet" });

  return res.status(200).json({ sign, lang, date: today, full });
};
