/**
 * GET /api/horoscope/today?lang=bg
 * Публичен endpoint — връща само teaser текстовете за днес, за всички 12 знака.
 */

const { getTodayTeasers } = require("../_lib/db");

module.exports = async (req, res) => {
  const lang = (req.query.lang || "bg").toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  try {
    const rows = await getTodayTeasers(today, lang);
    return res.status(200).json({ date: today, lang, horoscopes: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "internal error" });
  }
};
