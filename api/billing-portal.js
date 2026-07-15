/**
 * POST /api/billing-portal
 * Body: { email }
 * Връща Stripe Billing Portal URL за съществуващ абонат — оттам сам сменя
 * план (месечен <-> годишен), обновява карта, или отказва абонамента.
 * Използва се от Ден-25/Ден-30 имейл линковете (виж cron/send-trial-sequence.js
 * и webhooks/stripe.js) и може да се закачи и за бутон "Управлявай абонамента"
 * на самия сайт зад magic-link автентикацията.
 */

const { getSubscriberByEmail } = require("./_lib/db");
const { createBillingPortalSession } = require("./_lib/stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "missing email" });

  try {
    const subscriber = await getSubscriberByEmail(email);
    if (!subscriber?.stripe_customer_id) {
      return res.status(404).json({ error: "no Stripe customer for this email yet" });
    }

    const siteUrl = process.env.SITE_URL || "https://astral-guide.com";
    const session = await createBillingPortalSession({
      customerId: subscriber.stripe_customer_id,
      returnUrl: `${siteUrl}/`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "internal error", detail: String(err) });
  }
};
