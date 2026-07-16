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
    // subscribers/orders са критични за панела — ако някое от тях гръмне,
    // целият панел трябва да гръмне (както преди).
    const [subscribers, orders] = await Promise.all([getAllSubscribers(), getAllOrders()]);

    // contentJobs идва от отделна таблица (content_jobs), добавена по-късно
    // за AI визуал/видео пайплайна. Ако таблицата още не е създадена в
    // продукционната база (миграцията от db/schema.sql не е пусната), не
    // трябва това да събаря целия админ панел — просто показваме празен списък
    // и бележка, вместо 500 грешка при логин.
    let contentJobs = [];
    let contentJobsError = null;
    try {
      contentJobs = await getRecentContentJobs(50);
    } catch (err) {
      console.error("[admin/data] contentJobs недостъпни (вероятно липсва таблица content_jobs — виж db/schema.sql):", err);
      contentJobsError = "Таблицата content_jobs още не е създадена в базата — пусни db/schema.sql веднъж.";
    }

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

    return res.status(200).json({ summary, subscribers, orders, contentJobs, contentJobsError });
  } catch (err) {
    console.error("[admin/data]", err);
    return res.status(500).json({ error: "internal error", detail: String(err) });
  }
};
