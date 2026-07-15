/**
 * POST /api/subscribe
 * Body: { name, email, sign, lang, plan }   (plan: "monthly" | "annual", по подразбиране "monthly")
 *
 * Безплатният lead magnet — 1 месец безплатен седмичен хороскоп (виж ревизия
 * 14.07.2026 г. в 07_project_dreamcatcher_growth_plan.md Раздел 7 — намалено
 * от първоначалните 3 месеца), после автоматичен преход към 5.99€/мес или
 * 49€/год (Ден 1/14/25/30 фунията в 03_project_dreamcatcher_business.txt).
 *
 * Картата се въвежда СЕГА през Stripe Checkout (subscription mode с
 * trial_period_days) — това е единственият начин "автоматичното" таксуване
 * на Ден 30 да е реално, не само маркетингов текст. Ако Stripe не е
 * конфигуриран (env липсва — демо среда преди деплой), лийдът пак се
 * записва и получава magic-link достъп до безплатното съдържание, само
 * checkoutUrl отсъства от отговора.
 */

const { upsertSubscriber } = require("./_lib/db");
const { createMagicLinkToken } = require("./_lib/auth");
const { sendMagicLinkEmail } = require("./_lib/email");
const { createSubscriptionCheckout } = require("./_lib/stripe");

const TRIAL_DAYS = 30;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { name, email, sign, lang, plan } = req.body || {};
  if (!name || !email || !sign) return res.status(400).json({ error: "missing fields" });
  const selectedPlan = plan === "annual" ? "annual" : "monthly";

  try {
    const { rows } = await upsertSubscriber({ name, email, sign, lang: lang || "bg" });
    const subscriber = rows[0];

    // Едно приветствено писмо, обединяващо линка за вход + Ден-1 офертата за
    // тълкуване на сън (виж _lib/email.js — преди се пращаха 2 отделни имейла
    // при регистрация, което потребителите намираха за досадно — обединено
    // на 13.07.2026 г.). Ден 14/25 се пращат от api/cron/send-trial-sequence.js,
    // Ден 30 (потвърждение на таксуване) — от invoice.payment_succeeded в
    // api/webhooks/stripe.js.
    const siteUrl = process.env.SITE_URL || "https://astral-guide.com";
    const token = createMagicLinkToken(email);
    const magicLinkUrl = `${siteUrl}/api/auth/verify?token=${token}`;
    await sendMagicLinkEmail(email, magicLinkUrl, lang, `${siteUrl}/?service=dream#services`, name);

    let checkoutUrl = null;
    try {
      // Остатъчни дни от trial-а — важно ако някой се презапише след като вече
      // е стартирал trial (напр. отворил е magic-link-а по-късно). За нов
      // абонат subscriber.trial_started_at ≈ сега -> пълните 30 дни.
      const elapsedDays = subscriber?.trial_started_at
        ? Math.floor((Date.now() - new Date(subscriber.trial_started_at).getTime()) / 86400000)
        : 0;
      const remainingTrialDays = Math.max(0, TRIAL_DAYS - elapsedDays);

      const session = await createSubscriptionCheckout({
        email,
        plan: selectedPlan,
        trialDays: remainingTrialDays,
        successUrl: `${siteUrl}/?subscription=success`,
        cancelUrl: `${siteUrl}/?subscription=cancelled`,
      });
      checkoutUrl = session.url;
    } catch (stripeErr) {
      // Stripe/env невключен още (пред-деплой демо) — не гърми целия request,
      // лийдът и magic-link-ът вече са записани по-горе.
      console.warn("[subscribe] createSubscriptionCheckout неуспешен (очаквано преди Stripe деплой):", stripeErr.message);
    }

    return res.status(200).json({ ok: true, checkoutUrl });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "internal error", detail: String(err) });
  }
};
