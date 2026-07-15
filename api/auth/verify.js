/**
 * GET /api/auth/verify?token=...
 * Проверява magic-link token-а и пренасочва потребителя обратно към сайта
 * с token-а в URL fragment, откъдето app.js го взима и пази в localStorage.
 */

const { verifyToken } = require("../_lib/auth");

module.exports = async (req, res) => {
  const { token } = req.query;
  const payload = token && verifyToken(token);

  if (!payload) {
    return res.redirect(302, `${process.env.SITE_URL || "/"}?auth=invalid`);
  }

  return res.redirect(302, `${process.env.SITE_URL || "/"}#access_token=${encodeURIComponent(token)}`);
};
