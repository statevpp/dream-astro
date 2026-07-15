/**
 * _lib/stripe.js
 * Stripe клиент + помощни функции за Checkout Sessions (еднократни продукти)
 * и Subscriptions (5.99€/мес или 49€/год абонамент — виж ревизия 14.07.2026 г.
 * в 07_project_dreamcatcher_growth_plan.md Раздел 7).
 *
 * ВАЖНО — прочети преди да пуснеш Stripe акаунта:
 *   Stripe флагва бизнес описания с думи като "psychic", "fortune telling",
 *   "occult" като high-risk и може да замрази акаунта. Използвай ПОСЛЕДОВАТЕЛНО
 *   "astrology consultation / self-discovery content" във всяко поле —
 *   бизнес описание, sиte URL мета данни, имейл темплейти. Виж Раздел 3 (Premortem)
 *   в 07_project_dreamcatcher_growth_plan.md.
 *
 * ПРОМО ПЕРИОДИ: allow_promotion_codes: true е включено на всички checkout
 * сесии по-долу — собственикът пуска/спира промо кодове директно от Stripe
 * Dashboard -> Product catalog -> Coupons/Promotion codes, без redeploy на код.
 *
 * TODO преди деплой:
 *   1. Регистрирай Stripe акаунт, довърши business profile с внимателно описание
 *      ("astrology & self-discovery content platform").
 *   2. Създай Products/Prices в Stripe Dashboard: 4 еднократни (5/15/25/20/30€ —
 *      виж price map по-долу) + 2 recurring prices: 5.99€/мес и 49€/год.
 *   3. Сложи STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, и съответните PRICE_ID-та в env.
 */

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_MISSING", { apiVersion: "2024-06-20" });

const PRICE_IDS = {
  dream: process.env.STRIPE_PRICE_DREAM,
  horoscope: process.env.STRIPE_PRICE_HOROSCOPE,
  natal: process.env.STRIPE_PRICE_NATAL,
  compat: process.env.STRIPE_PRICE_COMPAT,
  business: process.env.STRIPE_PRICE_BUSINESS,
  subscription: process.env.STRIPE_PRICE_SUBSCRIPTION,             // 5.99 €/мес
  subscriptionAnnual: process.env.STRIPE_PRICE_SUBSCRIPTION_ANNUAL, // 49 €/год
};

async function createOneTimeCheckout({ type, email, successUrl, cancelUrl, metadata }) {
  const priceId = PRICE_IDS[type];
  if (!priceId) throw new Error(`Липсва STRIPE_PRICE_${type.toUpperCase()} в env — виж api/README_DEPLOY.md`);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata,
  });
  return session;
}

/**
 * plan: "monthly" | "annual". trialDays по подразбиране 30 (виж Раздел 7.1 от
 * growth плана — намалено от първоначалните 90). Картата се въвежда сега,
 * Stripe таксува автоматично след trialDays — истинско "auto-convert", не
 * ръчен процес от наша страна.
 */
async function createSubscriptionCheckout({ email, plan = "monthly", successUrl, cancelUrl, trialDays = 30, metadata }) {
  const priceId = plan === "annual" ? PRICE_IDS.subscriptionAnnual : PRICE_IDS.subscription;
  if (!priceId) {
    throw new Error(
      plan === "annual"
        ? "Липсва STRIPE_PRICE_SUBSCRIPTION_ANNUAL в env — виж api/README_DEPLOY.md"
        : "Липсва STRIPE_PRICE_SUBSCRIPTION в env — виж api/README_DEPLOY.md"
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: Math.max(0, trialDays),
      metadata: { plan, ...metadata },
    },
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { plan, ...metadata },
  });
  return session;
}

/**
 * Stripe Billing Portal — стандартният начин съществуващ абонат сам да смени
 * план (месечен <-> годишен), да обнови картата си, или да откаже. Ползва се
 * от Ден-25/Ден-30 имейлите вместо custom checkout hack за "upgrade".
 * Изисква еднократна активация на Billing Portal в Stripe Dashboard ->
 * Settings -> Billing -> Customer portal (link Prices-те, за да са избираеми).
 */
async function createBillingPortalSession({ customerId, returnUrl }) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session;
}

function constructWebhookEvent(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET не е зададен в env");
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

module.exports = {
  stripe, PRICE_IDS, createOneTimeCheckout, createSubscriptionCheckout,
  createBillingPortalSession, constructWebhookEvent,
};
