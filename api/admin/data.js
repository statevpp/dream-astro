/**
 * GET /api/admin/data
 * Връща всички абонати (trial/active/cancelled) и всички еднократни поръчки —
 * минимален админ изглед, докато няма пълноценна CRM система.
 *
 * Защита: споделен таен ключ в header `x-admin-secret`, сравнен с ADMIN_SECRET
 * env variable. Това НЕ е пълноценна auth система с роли/потребители — за един
 * собственик е достатъчно, но не пускай този ключ на никого другиго и не го
 * commit-вай в git. Генерирай стойност както за AUTH_SECRET/CRON_SECRET:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * TODO преди деплой: сложи ADMIN_SECRET в env variables (Vercel), после
 * отвори /admin.html и въведи същата стойност при първо зареждане.
 */

const { getAllSubscribers, getAllOrders, getRecentContentJobs } = require("../_lib/db");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const secret = process.env.ADMIN_SECRET;
  if (!secret) return res.status(500).json({ error: "ADMIN_SECRET не е зададен в env — виж api/README_DEPLOY.md" });
  if (req.headers["x-admin-secret"] !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const [subscribers, orders, contentJobs] = await Promise.all([
      getAllSubscribers(),
      getAllOrders(),
      getRecentContentJobs(50),
    ]);

    const summary = {
      totalSubscribers: subscribers.length,
      trial: subscribers.filter((s) => s.status === "trial").length,
      active: subscribers.filter((s) => s.status === "active").length,
      cancelled: subscribers.filter((s) => s.status === "cancelled").length,
      totalOrders: orders.length,
      paidOrders: orders.filter((o) => o.status === "paid" || o.status === "delivered").length,
      revenueFromOneTimeOrders: orders
        .filter((o) => o.status === "paid" || o.status === "delivered")
        .reduce((sum, o) => sum + Number(o.price_eur || 0), 0),
    };

    return res.status(200).json({ summary, subscribers, orders, contentJobs });
  } catch (err) {
    console.error("[admin/data]", err);
    return res.status(500).json({ error: "internal error", detail: String(err) });
  }
};
