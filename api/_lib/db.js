/**
 * _lib/db.js
 * Тънка обвивка над Postgres (Vercel Postgres или Supabase — и двата дават
 * безплатен starter tier). Използва @vercel/postgres синтаксис — ако решиш
 * Supabase вместо Vercel Postgres, смени клиента тук (интерфейсът на
 * функциите по-долу може да остане същият).
 *
 * TODO преди деплой:
 *   1. Създай Postgres база (Vercel Postgres таб в проекта, или Supabase).
 *   2. Сложи POSTGRES_URL в env variables.
 *   3. Пусни SQL-а от db/schema.sql (виж README_DEPLOY.md) за да създадеш таблиците.
 */

const { sql } = require("@vercel/postgres");

/* ---------- Subscribers (free trial -> paid абонамент) ---------- */

async function upsertSubscriber({ name, email, sign, lang }) {
  return sql`
    INSERT INTO subscribers (email, name, sign, lang, trial_started_at, status)
    VALUES (${email}, ${name}, ${sign}, ${lang}, NOW(), 'trial')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, sign = EXCLUDED.sign, lang = EXCLUDED.lang
    RETURNING *;
  `;
}

async function getSubscriberByEmail(email) {
  const { rows } = await sql`SELECT * FROM subscribers WHERE email = ${email} LIMIT 1;`;
  return rows[0] || null;
}

async function setSubscriberStatus(email, status, stripeCustomerId, extra = {}) {
  const { plan, stripeSubscriptionId } = extra;
  return sql`
    UPDATE subscribers SET
      status = ${status},
      stripe_customer_id = ${stripeCustomerId},
      plan = COALESCE(${plan || null}, plan),
      stripe_subscription_id = COALESCE(${stripeSubscriptionId || null}, stripe_subscription_id),
      updated_at = NOW()
    WHERE email = ${email};
  `;
}

/**
 * Subscription webhook събития (customer.subscription.updated/deleted) носят
 * само Stripe customer/subscription ID-та, не email — затова се търси по
 * stripe_subscription_id, записан при checkout.session.completed.
 */
async function setSubscriberBySubscriptionId(stripeSubscriptionId, { status, plan } = {}) {
  return sql`
    UPDATE subscribers SET
      status = COALESCE(${status || null}, status),
      plan = COALESCE(${plan || null}, plan),
      updated_at = NOW()
    WHERE stripe_subscription_id = ${stripeSubscriptionId};
  `;
}

/**
 * Абонати, чийто trial_started_at е точно daysElapsed дни назад (по дата, не
 * по час) — за Ден-14/Ден-25 email cron-а. Само status='trial', за да не
 * пращаме отново на вече активни/отказани абонати.
 */
async function getSubscribersAtTrialDay(daysElapsed) {
  const { rows } = await sql`
    SELECT * FROM subscribers
    WHERE status = 'trial'
      AND trial_started_at::date = (CURRENT_DATE - ${daysElapsed}::int)
  `;
  return rows;
}

/**
 * Атомарен "claim" за Ден-30 имейла (виж webhooks/stripe.js ->
 * invoice.payment_succeeded). UPDATE ... WHERE first_charge_email_sent_at IS
 * NULL RETURNING * гарантира, че при дублирано Stripe webhook събитие (Stripe
 * изрично предупреждава, че може да се случи) писмото се праща само веднъж,
 * без race condition спрямо реда, в който пристигат другите webhook събития.
 */
async function claimFirstChargeEmail(stripeSubscriptionId) {
  const { rows } = await sql`
    UPDATE subscribers SET first_charge_email_sent_at = NOW()
    WHERE stripe_subscription_id = ${stripeSubscriptionId} AND first_charge_email_sent_at IS NULL
    RETURNING *;
  `;
  return rows[0] || null; // null означава: вече е пратено (или абонатът не е намерен)
}

async function isActiveSubscriber(email) {
  const sub = await getSubscriberByEmail(email);
  if (!sub) return false;
  return sub.status === "trial" || sub.status === "active";
}

/* ---------- Daily horoscopes cache ---------- */

async function upsertHoroscope({ date, sign, lang, teaser, full }) {
  return sql`
    INSERT INTO horoscopes (date, sign, lang, teaser, full_text)
    VALUES (${date}, ${sign}, ${lang}, ${teaser}, ${full})
    ON CONFLICT (date, sign, lang) DO UPDATE SET teaser = EXCLUDED.teaser, full_text = EXCLUDED.full_text;
  `;
}

async function getTodayTeasers(date, lang) {
  const { rows } = await sql`SELECT sign, teaser FROM horoscopes WHERE date = ${date} AND lang = ${lang};`;
  return rows;
}

async function getFullHoroscope(date, sign, lang) {
  const { rows } = await sql`SELECT full_text FROM horoscopes WHERE date = ${date} AND sign = ${sign} AND lang = ${lang} LIMIT 1;`;
  return rows[0]?.full_text || null;
}

/* ---------- One-time orders (dream / natal / compat / business / horoscope) ---------- */

async function createOrder({ type, email, lang, fields, priceEur, stripeSessionId }) {
  return sql`
    INSERT INTO orders (type, email, lang, fields, price_eur, stripe_session_id, status)
    VALUES (${type}, ${email}, ${lang}, ${JSON.stringify(fields)}, ${priceEur}, ${stripeSessionId}, 'pending')
    RETURNING id;
  `;
}

async function markOrderPaid(stripeSessionId) {
  return sql`UPDATE orders SET status = 'paid', paid_at = NOW() WHERE stripe_session_id = ${stripeSessionId} RETURNING *;`;
}

async function markOrderDelivered(orderId) {
  return sql`UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = ${orderId};`;
}

module.exports = {
  upsertSubscriber, getSubscriberByEmail, setSubscriberStatus, setSubscriberBySubscriptionId,
  getSubscribersAtTrialDay, claimFirstChargeEmail, isActiveSubscriber,
  upsertHoroscope, getTodayTeasers, getFullHoroscope,
  createOrder, markOrderPaid, markOrderDelivered,
};
