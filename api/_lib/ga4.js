/**
 * _lib/ga4.js
 * Сървърна GA4 Measurement Protocol интеграция — за реални conversion събития
 * (purchase, sign_up), които не зависят от клиентския gtag.js (ad-blockers,
 * затворен таб преди redirect, и т.н. губят клиентските събития; webhook-ът
 * винаги гърми, защото Stripe реално го вика).
 *
 * Изисква два env var-а (виж .env.example):
 *   GA4_MEASUREMENT_ID  — публичният G-XXXXXXX ID (същият, който е в index.html)
 *   GA4_API_SECRET       — създава се в GA4 Admin -> Data Streams -> избери стрийма
 *                           -> Measurement Protocol API secrets -> Create
 *
 * Ако някой от двата липсва, функцията е тих no-op (не хвърля грешка) — за да
 * не строши webhook-а по средата на реален Stripe payment flow, докато secret-ът
 * не е сложен в Vercel env vars.
 */

const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";

/**
 * Изпраща едно GA4 събитие през Measurement Protocol.
 * @param {string} clientId — стабилен идентификатор на "потребител"; тъй като
 *   нямаме клиентския _ga cookie тук (сървърен контекст), ползваме email hash
 *   или Stripe customer/session id — достатъчно за attribution по event count,
 *   не за perfect user-stitching с клиентските GA сесии.
 * @param {string} eventName — GA4 recommended event, напр. "purchase", "sign_up".
 * @param {object} params — event params (currency, value, items, и т.н.).
 */
async function sendGA4Event(clientId, eventName, params = {}) {
  const measurementId = process.env.GA4_MEASUREMENT_ID || "G-6F4FYP4N1Q";
  const apiSecret = process.env.GA4_API_SECRET;
  if (!apiSecret) {
    console.warn(`[ga4] GA4_API_SECRET не е зададен — пропускам "${eventName}" (виж .env.example).`);
    return;
  }

  const url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: clientId || `server.${Date.now()}.${Math.random().toString(36).slice(2)}`,
    events: [{ name: eventName, params }],
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // GA4 MP връща 2xx дори при невалиден payload (validation е само debug endpoint) —
    // логваме статус за видимост, но не хвърляме, за да не строшим webhook-а.
    if (!res.ok) console.warn(`[ga4] "${eventName}" отговори ${res.status}`);
  } catch (err) {
    console.warn(`[ga4] Неуспешно изпращане на "${eventName}":`, err.message);
  }
}

module.exports = { sendGA4Event };
