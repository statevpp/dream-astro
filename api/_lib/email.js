/**
 * _lib/email.js
 * Изпращане на имейли през Resend (препоръчан — прост API, добър free tier)
 * или замени с Brevo/MailerLite ако предпочиташ вградена CRM/автоматизация
 * последователност (Ден 1/14/25/30 — виж ревизия 14.07.2026 г. в
 * 07_project_dreamcatcher_growth_plan.md Раздел 7; оригинал в
 * 03_project_dreamcatcher_business.txt беше Ден 1/14/85).
 *
 * TODO преди деплой:
 *   1. Регистрирай домейн + акаунт в resend.com (или Brevo/MailerLite).
 *   2. Конфигурирай SPF/DKIM/DMARC за домейна (виж README_DEPLOY.md — GDPR/deliverability раздел).
 *   3. Сложи RESEND_API_KEY в env variables.
 *   4. Първите 14 дни ограничи изпращането до 20-30 имейла/ден (domain warming) —
 *      виж 04_project_dreamcatcher_tech.txt Раздел 2.
 */

async function sendEmail({ to, subject, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY не е зададен в env — виж api/README_DEPLOY.md");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Lumaris <hello@dream-astro.com>",
      to: [to],
      subject,
      html,
      attachments,
    }),
  });
  if (!res.ok) throw new Error(`Resend API error: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Приветствен имейл — обединява линка за вход (magic link) и Ден-1 офертата
 * за тълкуване на сън в едно писмо (вместо две отделни при регистрация —
 * виж бележка от 13.07.2026 г.: потребителите намират 2 имейла наведнъж
 * за досадно).
 */
async function sendMagicLinkEmail(to, magicLinkUrl, lang, dreamUrl, name) {
  const subjects = { bg: "Твоят достъп до Lumaris", en: "Your Lumaris access", es: "Tu acceso a Lumaris" };
  const greetName = name ? `, ${name}` : "";
  const bodies = {
    bg: `<p>Здравей${greetName}!</p>
<p>Ето линка за достъп до пълните ти хороскопи: <a href="${magicLinkUrl}">${magicLinkUrl}</a></p>
${dreamUrl ? `<p>Докато си тук: много хора носят с дни наред <strong>сън, който не излиза от главата им</strong>. Ако и на теб ти се е случвало — можем да го разгадаем. Дълбок психоаналитичен прочит по Юнг и Фройд, обвързан с текущите ти транзити, готов до час.</p>
<p><a href="${dreamUrl}">Разгадай съня си — 5 €</a></p>` : ""}
<p>Lumaris</p>`,
    en: `<p>Hi${greetName}!</p>
<p>Here's your access link to your full horoscopes: <a href="${magicLinkUrl}">${magicLinkUrl}</a></p>
${dreamUrl ? `<p>While you're here: a lot of people carry one thing around for days — <strong>a dream that won't leave their head</strong>. If that's you, we can decode it. A deep Jungian/Freudian reading, tied to your current transits, ready within the hour.</p>
<p><a href="${dreamUrl}">Decode your dream — €5</a></p>` : ""}
<p>Lumaris</p>`,
    es: `<p>¡Hola${greetName}!</p>
<p>Aquí tienes tu enlace de acceso a tus horóscopos completos: <a href="${magicLinkUrl}">${magicLinkUrl}</a></p>
${dreamUrl ? `<p>Mientras estás aquí: mucha gente carga durante días con lo mismo — <strong>un sueño que no se les va de la cabeza</strong>. Si te ha pasado, podemos descifrarlo. Un análisis psicoanalítico profundo, junguiano/freudiano, vinculado a tus tránsitos actuales, listo en una hora.</p>
<p><a href="${dreamUrl}">Descifra tu sueño — 5 €</a></p>` : ""}
<p>Lumaris</p>`,
  };
  return sendEmail({ to, subject: subjects[lang] || subjects.bg, html: bodies[lang] || bodies.bg });
}

/**
 * Upsell блок, добавен след резултата на всяка еднократна поръчка (сън/хороскоп/
 * натална карта/съвместимост/бизнес) — насочва към безплатния 30-дневен абонамент.
 * Линкът ?subscribe=1 се хваща от app.js (DOMContentLoaded) и директно отваря
 * модала за абонамент, без допълнителен клик (виж бележката в app.js, 16.07.2026 г.).
 */
function orderUpsellBlock(lang, siteUrl) {
  const l = ["bg", "en", "es"].includes(lang) ? lang : "bg";
  const url = `${siteUrl}/?subscribe=1`;
  const blocks = {
    bg: `<hr style="margin:24px 0;border:none;border-top:1px solid #eee;"><p>Хареса ли ти? Всяка седмица получаваш личен хороскоп — безплатно за 30 дни.</p><p><a href="${url}">Вземи безплатния седмичен хороскоп</a></p>`,
    en: `<hr style="margin:24px 0;border:none;border-top:1px solid #eee;"><p>Liked it? Get a personal horoscope every week — free for 30 days.</p><p><a href="${url}">Get your free weekly horoscope</a></p>`,
    es: `<hr style="margin:24px 0;border:none;border-top:1px solid #eee;"><p>¿Te ha gustado? Recibe tu horóscopo personal cada semana — gratis durante 30 días.</p><p><a href="${url}">Consigue tu horóscopo semanal gratis</a></p>`,
  };
  return blocks[l] || blocks.bg;
}

async function sendOrderResultEmail(to, subject, bodyHtml, pdfBuffer, lang) {
  const siteUrl = process.env.SITE_URL || "https://dream-astro.com";
  const html = bodyHtml + orderUpsellBlock(lang, siteUrl);
  const attachments = pdfBuffer ? [{ filename: "analysis.pdf", content: pdfBuffer.toString("base64") }] : undefined;
  return sendEmail({ to, subject, html, attachments });
}

/* =====================================================================
 * ДЕН 1 / 14 / 25 / 30 ФУНИЯ (виж 03_project_dreamcatcher_business.txt
 * Раздел 3 + 07_project_dreamcatcher_growth_plan.md Раздел 7).
 *
 * Ден 1  — изпраща се веднага от api/subscribe.js (виж sendSequenceEmail).
 * Ден 14 — изпраща се от cron-а api/cron/send-trial-sequence.js.
 * Ден 25 — изпраща се от същия cron; "напомняне 5 дни преди таксуване" +
 *          upsell към годишния план през Stripe Billing Portal линк.
 * Ден 30 — НЕ се изпраща от cron по брой дни (ненадежден таймер спрямо
 *          реалния billing цикъл на Stripe) — тригерва се от webhook
 *          събитието invoice.payment_succeeded в api/webhooks/stripe.js,
 *          така че съвпада точно с момента на реалното таксуване.
 * ===================================================================== */

const SEQUENCE_SUBJECTS = {
  day1: {
    bg: "{{name}}, ето първата ти връзка към звездите ✨",
    en: "{{name}}, here's your first link to the stars ✨",
    es: "{{name}}, aquí tienes tu primer vínculo con las estrellas ✨",
  },
  day14: {
    bg: "Ограничено: пълната ти натална карта — тази седмица",
    en: "Limited time: your full natal chart, this week",
    es: "Tiempo limitado: tu carta natal completa, esta semana",
  },
  day25: {
    bg: "5 дни до края на пробния период",
    en: "5 days left in your free trial",
    es: "Quedan 5 días de tu prueba gratis",
  },
  day30: {
    bg: "Абонаментът ти е активен ✨",
    en: "Your subscription is active ✨",
    es: "Tu suscripción está activa ✨",
  },
};

function sequenceEmailBody(day, lang, vars = {}) {
  const l = ["bg", "en", "es"].includes(lang) ? lang : "bg";
  const { name = "", dreamUrl = "", natalUrl = "", billingPortalUrl = "", planLabel = "", amount = "" } = vars;

  const bodies = {
    day1: {
      bg: `<p>Здравей, ${name},</p>
<p>Радваме се, че си тук. Всяка седмица ще получаваш своя личен хороскоп — базиран на реални планетарни транзити, не на генерични клишета.</p>
<p>Докато чакаш следващото писмо: много хора носят с дни наред <strong>сън, който не излиза от главата им</strong>. Ако и на теб ти се е случвало — можем да го разгадаем. Дълбок психоаналитичен прочит по Юнг и Фройд, обвързан с текущите ти транзити, готов до час.</p>
<p><a href="${dreamUrl}">Разгадай съня си — 5 €</a></p>
<p>До следващата седмица,<br>Lumaris</p>`,
      en: `<p>Hi ${name},</p>
<p>Glad you're here. Every week you'll get your personal horoscope — built on real planetary transits, not generic clichés.</p>
<p>While you wait for the next one: a lot of people carry one thing around for days — <strong>a dream that won't leave their head</strong>. If that's you, we can decode it. A deep Jungian/Freudian reading, tied to your current transits, ready within the hour.</p>
<p><a href="${dreamUrl}">Decode your dream — €5</a></p>
<p>Talk soon,<br>Lumaris</p>`,
      es: `<p>Hola ${name},</p>
<p>Nos alegra tenerte aquí. Cada semana recibirás tu horóscopo personal — basado en tránsitos planetarios reales, no en clichés genéricos.</p>
<p>Mientras esperas el próximo: mucha gente carga durante días con lo mismo — <strong>un sueño que no se les va de la cabeza</strong>. Si te ha pasado, podemos descifrarlo. Un análisis psicoanalítico profundo, junguiano/freudiano, vinculado a tus tránsitos actuales, listo en una hora.</p>
<p><a href="${dreamUrl}">Descifra tu sueño — 5 €</a></p>
<p>Hasta pronto,<br>Lumaris</p>`,
    },
    day14: {
      bg: `<p>Здравей, ${name},</p>
<p>От две седмици получаваш своя седмичен хороскоп — но той е само повърхността. Твоята <strong>пълна натална карта</strong> разкрива структурата отдолу: силните ти страни, слепите точки, и посоката, в която реално си устроен(а) да вървиш.</p>
<p>До края на седмицата тя е на специална цена от 25 €. Синтезирана е да се чете за минути на телефона ти, не 30 страници шаблон.</p>
<p><a href="${natalUrl}">Виж пълната си натална карта</a></p>
<p>Lumaris</p>`,
      en: `<p>Hi ${name},</p>
<p>You've had two weeks of your weekly horoscope — but that's just the surface. Your <strong>full natal chart</strong> reveals the structure underneath: your strengths, your blind spots, and the direction you're actually built to move in.</p>
<p>Through the end of this week it's €25 — synthesized to read in minutes on your phone, not a 30-page template.</p>
<p><a href="${natalUrl}">See your full natal chart</a></p>
<p>Lumaris</p>`,
      es: `<p>Hola ${name},</p>
<p>Llevas dos semanas recibiendo tu horóscopo semanal — pero eso es solo la superficie. Tu <strong>carta natal completa</strong> revela la estructura de fondo: tus fortalezas, tus puntos ciegos, y la dirección hacia la que realmente estás hecho/a para moverte.</p>
<p>Hasta el final de esta semana está a 25 € — sintetizada para leerse en minutos desde el móvil, no una plantilla de 30 páginas.</p>
<p><a href="${natalUrl}">Ver tu carta natal completa</a></p>
<p>Lumaris</p>`,
    },
    day25: {
      bg: `<p>Здравей, ${name},</p>
<p>Твоят безплатен месец приключва след 5 дни. Ако продължиш, абонаментът става 5.99 €/мес — пълен достъп до дневния, месечния и годишния ти хороскоп, без чакане.</p>
<p>Ако предпочиташ да платиш веднъж и да не мислиш за това цяла година: годишният план е 49 €/год — около 32% по-евтино от месечния, и можеш да го смениш сега, преди да ти начислим каквото и да е.</p>
<p><a href="${billingPortalUrl}">Премини на годишен план</a> · <a href="${billingPortalUrl}">Управлявай абонамента си</a></p>
<p>Няма скрити условия — можеш да откажеш по всяко време от същия линк.</p>
<p>Lumaris</p>`,
      en: `<p>Hi ${name},</p>
<p>Your free month ends in 5 days. If you continue, the subscription becomes €5.99/mo — full access to your daily, monthly and yearly horoscope, no waiting.</p>
<p>Prefer to pay once and forget about it for a year? The annual plan is €49/yr — about 32% cheaper than monthly, and you can switch now, before anything is charged.</p>
<p><a href="${billingPortalUrl}">Switch to annual</a> · <a href="${billingPortalUrl}">Manage your subscription</a></p>
<p>No hidden terms — you can cancel anytime from the same link.</p>
<p>Lumaris</p>`,
      es: `<p>Hola ${name},</p>
<p>Tu mes gratis termina en 5 días. Si continúas, la suscripción pasa a 5.99 €/mes — acceso completo a tu horóscopo diario, mensual y anual, sin esperas.</p>
<p>¿Prefieres pagar una vez y olvidarte durante un año? El plan anual es 49 €/año — casi un 32% más barato que el mensual, y puedes cambiarte ahora, antes de que se te cobre nada.</p>
<p><a href="${billingPortalUrl}">Cambiar a plan anual</a> · <a href="${billingPortalUrl}">Gestionar tu suscripción</a></p>
<p>Sin condiciones ocultas — puedes cancelar cuando quieras desde el mismo enlace.</p>
<p>Lumaris</p>`,
    },
    day30: {
      bg: `<p>Здравей, ${name},</p>
<p>Пробният ти период приключи и абонаментът (${planLabel}) вече е активен. Току-що беше таксувана сума от ${amount}.</p>
<p>Продължаваш да получаваш пълен достъп до дневния, месечния и годишния си хороскоп, без ограничения.</p>
<p><a href="${billingPortalUrl}">Управлявай абонамента си</a> (смяна на план, карта, или отказ по всяко време)</p>
<p>Lumaris</p>`,
      en: `<p>Hi ${name},</p>
<p>Your trial just ended and your subscription (${planLabel}) is now active. You were just charged ${amount}.</p>
<p>You'll keep getting full access to your daily, monthly and yearly horoscope, no limits.</p>
<p><a href="${billingPortalUrl}">Manage your subscription</a> (change plan, card, or cancel anytime)</p>
<p>Lumaris</p>`,
      es: `<p>Hola ${name},</p>
<p>Tu prueba acaba de terminar y tu suscripción (${planLabel}) ya está activa. Se te acaba de cobrar ${amount}.</p>
<p>Sigues teniendo acceso completo a tu horóscopo diario, mensual y anual, sin límites.</p>
<p><a href="${billingPortalUrl}">Gestiona tu suscripción</a> (cambiar plan, tarjeta, o cancelar cuando quieras)</p>
<p>Lumaris</p>`,
    },
  };

  return bodies[day][l];
}

/**
 * day: "day1" | "day14" | "day25" | "day30"
 * vars: { name, dreamUrl, natalUrl, billingPortalUrl, planLabel, amount } — само
 * релевантните за съответния ден се ползват, останалите се пренебрегват.
 */
async function sendSequenceEmail(day, to, lang, vars = {}) {
  const l = ["bg", "en", "es"].includes(lang) ? lang : "bg";
  const subjectTemplate = (SEQUENCE_SUBJECTS[day] && SEQUENCE_SUBJECTS[day][l]) || SEQUENCE_SUBJECTS[day].bg;
  const subject = subjectTemplate.replace("{{name}}", vars.name || "");
  const html = sequenceEmailBody(day, l, vars);
  return sendEmail({ to, subject, html });
}

module.exports = { sendEmail, sendMagicLinkEmail, sendOrderResultEmail, sendSequenceEmail };
