/**
 * api/cron/send-trial-sequence.js
 * Vercel Cron endpoint — пуска се веднъж дневно (виж vercel.json), заедно с
 * generate-daily-horoscopes. Праща Ден-14 и Ден-25 имейлите от фунията
 * (виж 03_project_dreamcatcher_business.txt Раздел 3 + ревизия 14.07.2026 г.
 * в 07_project_dreamcatcher_growth_plan.md Раздел 7).
 *
 * Ден-1 се праща веднага от api/subscribe.js (не оттук).
 * Ден-30 се тригерва от webhook събитието invoice.payment_succeeded в
 * api/webhooks/stripe.js (по реалния billing момент, не по брой дни — виж
 * бележката там за защо).
 *
 * Защита: Vercel Cron праща header "Authorization: Bearer $CRON_SECRET".
 */

const { getSubscribersAtTrialDay } = require("../_lib/db");
const { sendSequenceEmail } = require("../_lib/email");
const { createBillingPortalSession } = require("../_lib/stripe");

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const siteUrl = process.env.SITE_URL || "https://dream-astro.com";
  const results = [];

  // ---- Ден 14: оферта за пълна натална карта ----
  try {
    const day14Subs = await getSubscribersAtTrialDay(14);
    for (const sub of day14Subs) {
      try {
        await sendSequenceEmail("day14", sub.email, sub.lang, {
          name: sub.name,
          natalUrl: `${siteUrl}/?service=natal#services`,
        });
        results.push({ day: 14, email: sub.email, ok: true });
      } catch (err) {
        console.error(`Ден-14 имейл неуспешен за ${sub.email}:`, err);
        results.push({ day: 14, email: sub.email, ok: false, error: String(err) });
      }
    }
  } catch (err) {
    console.error("Грешка при извличане на Ден-14 абонати:", err);
  }

  // ---- Ден 25: trial-ът изтича след 5 дни + upsell към годишен план ----
  try {
    const day25Subs = await getSubscribersAtTrialDay(25);
    for (const sub of day25Subs) {
      try {
        let billingPortalUrl = `${siteUrl}/`; // fallback ако Stripe все още не е конфигуриран
        if (sub.stripe_customer_id) {
          const portal = await createBillingPortalSession({
            customerId: sub.stripe_customer_id,
            returnUrl: `${siteUrl}/`,
          });
          billingPortalUrl = portal.url;
        }
        await sendSequenceEmail("day25", sub.email, sub.lang, { name: sub.name, billingPortalUrl });
        results.push({ day: 25, email: sub.email, ok: true });
      } catch (err) {
        console.error(`Ден-25 имейл неуспешен за ${sub.email}:`, err);
        results.push({ day: 25, email: sub.email, ok: false, error: String(err) });
      }
    }
  } catch (err) {
    console.error("Грешка при извличане на Ден-25 абонати:", err);
  }

  return res.status(200).json({ results });
};
