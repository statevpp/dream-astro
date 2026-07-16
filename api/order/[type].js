/**
 * POST /api/order/:type   (type = dream | horoscope | natal | compat | business)
 * Body: { lang, fields: {...} }
 * Валидира входа, създава pending поръчка в DB, връща Stripe Checkout URL.
 * Реалното генериране на анализа става в webhooks/stripe.js СЛЕД успешно плащане
 * (никога преди — не искаме да плащаме OpenAI/astrology API кредити за
 * неплатени заявки).
 */

const { createOneTimeCheckout } = require("../_lib/stripe");
const { createOrder } = require("../_lib/db");

const VALID_TYPES = ["dream", "horoscope", "natal", "compat", "business"];
const PRICES_EUR = { dream: 5, horoscope: 15, natal: 25, compat: 20, business: 30 };

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { type } = req.query;
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: "invalid product type" });

  const { lang, fields } = req.body || {};
  const email = fields?.["form.email"] || fields?.email;
  if (!email) return res.status(400).json({ error: "missing email" });

  try {
    const { rows } = await createOrder({ type, email, lang: lang || "bg", fields, priceEur: PRICES_EUR[type] });
    const orderId = rows[0].id;

    const siteUrl = process.env.SITE_URL || "https://dream-astro.com";
    const session = await createOneTimeCheckout({
      type, email,
      successUrl: `${siteUrl}/?order=success`,
      cancelUrl: `${siteUrl}/?order=cancelled`,
      metadata: { orderId: String(orderId), type },
    });

    return res.status(200).json({ checkoutUrl: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "internal error", detail: String(err) });
  }
};
