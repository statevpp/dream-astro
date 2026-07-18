/* =====================================================================
   i18n.js — превод на интерфейса BG / EN / ES
   Демо текстовете за зодиите (ZODIAC_TEASERS) са PLACEHOLDER — в реалния
   деплой /api/horoscope/today ги връща от backend-а (виж api/README).
   ===================================================================== */

const I18N = {

bg: {
  "meta.title": "Lumaris — Хороскопи, Натални Карти, Тълкуване на Сънища",
  "brand.name": "Lumaris",
  "nav.horoscopes": "Хороскопи",
  "nav.services": "Услуги",
  "nav.about": "За нас",
  "nav.faq": "FAQ",
  "nav.contact": "Контакти",
  "nav.subscribe": "Абонирай се",
  "hero.eyebrow": "Основано на реални планетарни транзити",
  "hero.title": "Хороскопът, който наистина се сбъдва",
  "hero.subtitle": "Дневни, месечни и годишни прогнози, синтезирани от няколко астрологични извора и реални астрономически данни — не генерични клишета.",
  "hero.cta_primary": "Вземи безплатен седмичен хороскоп",
  "hero.cta_secondary": "Разгледай дневните хороскопи",
  "hero.trust": "Без задължения. Без спам. Отказ по всяко време.",
  "horo.title": "Дневен хороскоп — днес",
  "horo.subtitle": "Кратка версия е безплатна за всички. Пълният анализ (дневен + месечен + годишен) е само за абонати.",
  "horo.locked": "Отключи пълния анализ",
  "services.title": "Персонални услуги",
  "services.subtitle": "Генерирани индивидуално за теб срещу твоите реални рождени данни.",
  "svc.dream.title": "Тълкуване на сън",
  "svc.dream.desc": "Опиши съня си — получаваш дълбок психоаналитичен анализ, обвързан с текущите транзити спрямо твоята натална карта.",
  "svc.dream.duration": "⏱ до 1 час (автоматично)",
  "svc.horoscope.title": "Моментен хороскоп",
  "svc.horoscope.desc": "Фокусиран анализ за конкретен предстоящ период — седмица, месец или важно събитие.",
  "svc.horoscope.duration": "⏱ до 3 часа (автоматично)",
  "svc.natal.title": "Пълна натална карта",
  "svc.natal.desc": "Пълен астрологичен профил — личност, силни/слаби страни, житейски насоки, синтезиран в кратък PDF за телефон.",
  "svc.natal.duration": "⏱ до 6 часа (автоматично)",
  "svc.compat.title": "Съвместимост на партньори",
  "svc.compat.desc": "Синастрия между двама души — къде си пасвате, къде ще има триене, и как да го управлявате.",
  "svc.compat.duration": "⏱ до 6 часа (автоматично)",
  "svc.business.title": "Бизнес астрология",
  "svc.business.desc": "Кога да стартираш, кога да сключваш сделки, кога да изчакаш — базирано на твоята натална карта и текущите транзити.",
  "svc.business.duration": "⏱ до 12 часа (автоматично)",
  "svc.sub.title": "Пълен абонамент",
  "svc.sub.desc": "Пълни дневни, месечни и годишни хороскопи за твоя знак, без чакане, без лимит.",
  "svc.sub.price": "5.99 €/мес",
  "svc.sub.duration": "⏱ безплатно 1 месец · или 49 €/год",
  "svc.order": "Поръчай сега",
  "svc.featured": "Най-поръчвано",
  "svc.subscribe": "Абонирай се безплатно",
  "plan.monthly": "Месечно — 5.99 €/мес, след 1 месец безплатно",
  "plan.annual": "Годишно — 49 €/год (спестяваш ~32%)",
  "about.title": "За нас",
  "about.p1": "Lumaris съчетава реални астрономически изчисления (планетарни транзити спрямо твоята натална карта) с дълбок психоаналитичен подход по Юнг и Фройд към символиката на сънищата.",
  "about.p2": "Всеки анализ преминава през синтез на множество астрологични извори, за да избегнем генеричните, шаблонни прогнози, които виждаш навсякъде другаде.",
  "about.p3": "Конфиденциалността е приоритет — личните ти данни се използват единствено за изготвяне на твоя анализ.",
  "faq.title": "Често задавани въпроси",
  "contact.title": "Контакти",
  "contact.email_label": "Имейл",
  "contact.lang_label": "Езици",
  "contact.social_label": "Последвай ни",
  "footer.rights": "Всички права запазени.",
  "sub_modal.title": "Безплатен седмичен хороскоп",
  "sub_modal.subtitle": "1 месец безплатно. После 5.99 €/мес или 49 €/год — можеш да откажеш по всяко време.",
  "sub_modal.submit": "Абонирай ме безплатно",
  "order_modal.title": "Заявка за услуга",
  "order_modal.price_label": "Цена:",
  "order_modal.payment_note": "Плащането се извършва сигурно през Stripe веднага след потвърждение на формата.",
  "order_modal.submit": "Продължи към плащане",
  "form.name": "Име", "form.email": "Имейл", "form.sign": "Твоят зодиакален знак",
  "form.terms": "Съгласявам се с <a href=\"/terms.html\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--accent-2);text-decoration:underline;\" onclick=\"event.stopPropagation()\">общите условия</a> и <a href=\"/privacy.html\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--accent-2);text-decoration:underline;\" onclick=\"event.stopPropagation()\">политиката за поверителност</a>",
  "form.dream_desc": "Опиши съня си подробно (мин. 100 символа)",
  "form.birthdate": "Дата на раждане", "form.birthtime": "Точен час на раждане",
  "form.birthplace": "Място на раждане (град, държава)", "form.fullname": "Три имена",
  "form.questions_opt": "Конкретни въпроси (по избор)",
  "form.period": "За какъв период", "form.period_week": "Седмица", "form.period_month": "Месец", "form.period_event": "Конкретно събитие",
  "form.person1": "Първи човек", "form.person2": "Втори човек",
  "form.business_focus": "Фокус (стартиране на бизнес / сделка / инвестиция и т.н.)",
  "success.title": "Благодарим!", "success.text": "Заявката е изпратена успешно.", "success.close": "Затвори",
  "success.order_upsell_text": "Резултатът е на път към имейла ти. Между другото — искаш ли всяка седмица личен хороскоп, безплатно за 30 дни?",
  "success.upsell_cta": "Вземи безплатен седмичен хороскоп",
},

en: {
  "meta.title": "Lumaris — Horoscopes, Natal Charts, Dream Interpretation",
  "brand.name": "Lumaris",
  "nav.horoscopes": "Horoscopes", "nav.services": "Services", "nav.about": "About", "nav.faq": "FAQ", "nav.contact": "Contact",
  "nav.subscribe": "Subscribe",
  "hero.eyebrow": "Grounded in real planetary transits",
  "hero.title": "The horoscope that actually comes true",
  "hero.subtitle": "Daily, monthly and yearly forecasts synthesized from multiple astrological sources and real astronomical data — not generic clichés.",
  "hero.cta_primary": "Get your free weekly horoscope",
  "hero.cta_secondary": "See today's horoscopes",
  "hero.trust": "No commitment. No spam. Cancel anytime.",
  "horo.title": "Today's Horoscope",
  "horo.subtitle": "A short version is free for everyone. The full analysis (daily + monthly + yearly) is subscriber-only.",
  "horo.locked": "Unlock full analysis",
  "services.title": "Personal Services",
  "services.subtitle": "Generated individually for you from your real birth data.",
  "svc.dream.title": "Dream Interpretation",
  "svc.dream.desc": "Describe your dream — get a deep psychoanalytic reading tied to current transits against your natal chart.",
  "svc.dream.duration": "⏱ within 1 hour (automated)",
  "svc.horoscope.title": "Instant Horoscope",
  "svc.horoscope.desc": "A focused reading for a specific upcoming period — a week, a month, or an important event.",
  "svc.horoscope.duration": "⏱ within 3 hours (automated)",
  "svc.natal.title": "Full Natal Chart",
  "svc.natal.desc": "A complete astrological profile — personality, strengths/weaknesses, life direction, synthesized into a short mobile-friendly PDF.",
  "svc.natal.duration": "⏱ within 6 hours (automated)",
  "svc.compat.title": "Partner Compatibility",
  "svc.compat.desc": "Synastry between two people — where you fit, where friction will show up, and how to manage it.",
  "svc.compat.duration": "⏱ within 6 hours (automated)",
  "svc.business.title": "Business Astrology",
  "svc.business.desc": "When to launch, when to close deals, when to wait — based on your natal chart and current transits.",
  "svc.business.duration": "⏱ within 12 hours (automated)",
  "svc.sub.title": "Full Subscription",
  "svc.sub.desc": "Full daily, monthly and yearly horoscopes for your sign, no waiting, no limits.",
  "svc.sub.price": "€5.99/mo",
  "svc.sub.duration": "⏱ free for 1 month · or €49/yr",
  "svc.order": "Order now", "svc.featured": "Most popular", "svc.subscribe": "Subscribe for free",
  "plan.monthly": "Monthly — €5.99/mo, free for 1 month first",
  "plan.annual": "Annual — €49/yr (save ~32%)",
  "about.title": "About Us",
  "about.p1": "Lumaris combines real astronomical calculations (planetary transits against your natal chart) with a deep Jungian/Freudian psychoanalytic approach to dream symbolism.",
  "about.p2": "Every reading is synthesized across multiple astrological sources, to avoid the generic, templated forecasts you see everywhere else.",
  "about.p3": "Privacy is a priority — your personal data is used solely to produce your reading.",
  "faq.title": "Frequently Asked Questions",
  "contact.title": "Contact", "contact.email_label": "Email", "contact.lang_label": "Languages", "contact.social_label": "Follow us",
  "footer.rights": "All rights reserved.",
  "sub_modal.title": "Free Weekly Horoscope",
  "sub_modal.subtitle": "1 month free. Then €5.99/mo or €49/yr — cancel anytime.",
  "sub_modal.submit": "Subscribe me for free",
  "order_modal.title": "Service Request",
  "order_modal.price_label": "Price:",
  "order_modal.payment_note": "Payment is processed securely via Stripe right after you confirm the form.",
  "order_modal.submit": "Continue to payment",
  "form.name": "Name", "form.email": "Email", "form.sign": "Your zodiac sign",
  "form.terms": "I agree to the <a href=\"/terms.html\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--accent-2);text-decoration:underline;\" onclick=\"event.stopPropagation()\">terms of use</a> and <a href=\"/privacy.html\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--accent-2);text-decoration:underline;\" onclick=\"event.stopPropagation()\">privacy policy</a>",
  "form.dream_desc": "Describe your dream in detail (min. 100 characters)",
  "form.birthdate": "Date of birth", "form.birthtime": "Exact time of birth",
  "form.birthplace": "Place of birth (city, country)", "form.fullname": "Full name",
  "form.questions_opt": "Specific questions (optional)",
  "form.period": "For which period", "form.period_week": "Week", "form.period_month": "Month", "form.period_event": "Specific event",
  "form.person1": "First person", "form.person2": "Second person",
  "form.business_focus": "Focus (launching a business / a deal / an investment, etc.)",
  "success.title": "Thank you!", "success.text": "Your request was sent successfully.", "success.close": "Close",
  "success.order_upsell_text": "Your result is on its way to your inbox. By the way — want a personal horoscope every week, free for 30 days?",
  "success.upsell_cta": "Get your free weekly horoscope",
},

es: {
  "meta.title": "Lumaris — Horóscopos, Cartas Natales, Interpretación de Sueños",
  "brand.name": "Lumaris",
  "nav.horoscopes": "Horóscopos", "nav.services": "Servicios", "nav.about": "Nosotros", "nav.faq": "FAQ", "nav.contact": "Contacto",
  "nav.subscribe": "Suscríbete",
  "hero.eyebrow": "Basado en tránsitos planetarios reales",
  "hero.title": "El horóscopo que de verdad se cumple",
  "hero.subtitle": "Pronósticos diarios, mensuales y anuales sintetizados a partir de varias fuentes astrológicas y datos astronómicos reales — no clichés genéricos.",
  "hero.cta_primary": "Consigue tu horóscopo semanal gratis",
  "hero.cta_secondary": "Ver los horóscopos de hoy",
  "hero.trust": "Sin compromiso. Sin spam. Cancela cuando quieras.",
  "horo.title": "Horóscopo de hoy",
  "horo.subtitle": "La versión corta es gratis para todos. El análisis completo (diario + mensual + anual) es solo para suscriptores.",
  "horo.locked": "Desbloquea el análisis completo",
  "services.title": "Servicios Personales",
  "services.subtitle": "Generados individualmente para ti a partir de tus datos de nacimiento reales.",
  "svc.dream.title": "Interpretación de Sueños",
  "svc.dream.desc": "Describe tu sueño — recibe un análisis psicoanalítico profundo vinculado a los tránsitos actuales frente a tu carta natal.",
  "svc.dream.duration": "⏱ en menos de 1 hora (automático)",
  "svc.horoscope.title": "Horóscopo Instantáneo",
  "svc.horoscope.desc": "Un análisis enfocado para un período próximo específico — una semana, un mes o un evento importante.",
  "svc.horoscope.duration": "⏱ en menos de 3 horas (automático)",
  "svc.natal.title": "Carta Natal Completa",
  "svc.natal.desc": "Un perfil astrológico completo — personalidad, fortalezas/debilidades, dirección de vida, sintetizado en un PDF breve para el móvil.",
  "svc.natal.duration": "⏱ en menos de 6 horas (automático)",
  "svc.compat.title": "Compatibilidad de Pareja",
  "svc.compat.desc": "Sinastría entre dos personas — dónde encajáis, dónde habrá fricción, y cómo manejarla.",
  "svc.compat.duration": "⏱ en menos de 6 horas (automático)",
  "svc.business.title": "Astrología de Negocios",
  "svc.business.desc": "Cuándo lanzar, cuándo cerrar acuerdos, cuándo esperar — basado en tu carta natal y los tránsitos actuales.",
  "svc.business.duration": "⏱ en menos de 12 horas (automático)",
  "svc.sub.title": "Suscripción Completa",
  "svc.sub.desc": "Horóscopos diarios, mensuales y anuales completos para tu signo, sin esperas, sin límites.",
  "svc.sub.price": "5.99 €/mes",
  "svc.sub.duration": "⏱ gratis el primer mes · o 49 €/año",
  "svc.order": "Pedir ahora", "svc.featured": "Más popular", "svc.subscribe": "Suscríbete gratis",
  "plan.monthly": "Mensual — 5.99 €/mes, gratis el primer mes",
  "plan.annual": "Anual — 49 €/año (ahorras ~32%)",
  "about.title": "Sobre Nosotros",
  "about.p1": "Lumaris combina cálculos astronómicos reales (tránsitos planetarios frente a tu carta natal) con un profundo enfoque psicoanalítico junguiano/freudiano hacia la simbología de los sueños.",
  "about.p2": "Cada análisis se sintetiza a partir de múltiples fuentes astrológicas, para evitar los pronósticos genéricos y plantillados que ves en todas partes.",
  "about.p3": "La privacidad es una prioridad — tus datos personales se usan únicamente para elaborar tu análisis.",
  "faq.title": "Preguntas Frecuentes",
  "contact.title": "Contacto", "contact.email_label": "Correo", "contact.lang_label": "Idiomas", "contact.social_label": "Síguenos",
  "footer.rights": "Todos los derechos reservados.",
  "sub_modal.title": "Horóscopo Semanal Gratis",
  "sub_modal.subtitle": "1 mes gratis. Después 5.99 €/mes o 49 €/año — cancela cuando quieras.",
  "sub_modal.submit": "Suscribirme gratis",
  "order_modal.title": "Solicitud de Servicio",
  "order_modal.price_label": "Precio:",
  "order_modal.payment_note": "El pago se procesa de forma segura vía Stripe justo después de confirmar el formulario.",
  "order_modal.submit": "Continuar al pago",
  "form.name": "Nombre", "form.email": "Correo", "form.sign": "Tu signo zodiacal",
  "form.terms": "Acepto los <a href=\"/terms.html\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--accent-2);text-decoration:underline;\" onclick=\"event.stopPropagation()\">términos de uso</a> y la <a href=\"/privacy.html\" target=\"_blank\" rel=\"noopener\" style=\"color:var(--accent-2);text-decoration:underline;\" onclick=\"event.stopPropagation()\">política de privacidad</a>",
  "form.dream_desc": "Describe tu sueño en detalle (mín. 100 caracteres)",
  "form.birthdate": "Fecha de nacimiento", "form.birthtime": "Hora exacta de nacimiento",
  "form.birthplace": "Lugar de nacimiento (ciudad, país)", "form.fullname": "Nombre completo",
  "form.questions_opt": "Preguntas específicas (opcional)",
  "form.period": "Para qué período", "form.period_week": "Semana", "form.period_month": "Mes", "form.period_event": "Evento específico",
  "form.person1": "Primera persona", "form.person2": "Segunda persona",
  "form.business_focus": "Enfoque (lanzar un negocio / un trato / una inversión, etc.)",
  "success.title": "¡Gracias!", "success.text": "Tu solicitud se envió correctamente.", "success.close": "Cerrar",
  "success.order_upsell_text": "Tu resultado va de camino a tu correo. Por cierto — ¿quieres un horóscopo personal cada semana, gratis durante 30 días?",
  "success.upsell_cta": "Consigue tu horóscopo semanal gratis",
},
};

/* Зодиакални знаци: символ + имена по език + PLACEHOLDER teaser (demo) */
const ZODIAC_SIGNS = [
  { id:"aries", symbol:"♈", bg:"Овен", en:"Aries", es:"Aries" },
  { id:"taurus", symbol:"♉", bg:"Телец", en:"Taurus", es:"Tauro" },
  { id:"gemini", symbol:"♊", bg:"Близнаци", en:"Gemini", es:"Géminis" },
  { id:"cancer", symbol:"♋", bg:"Рак", en:"Cancer", es:"Cáncer" },
  { id:"leo", symbol:"♌", bg:"Лъв", en:"Leo", es:"Leo" },
  { id:"virgo", symbol:"♍", bg:"Дева", en:"Virgo", es:"Virgo" },
  { id:"libra", symbol:"♎", bg:"Везни", en:"Libra", es:"Libra" },
  { id:"scorpio", symbol:"♏", bg:"Скорпион", en:"Scorpio", es:"Escorpio" },
  { id:"sagittarius", symbol:"♐", bg:"Стрелец", en:"Sagittarius", es:"Sagitario" },
  { id:"capricorn", symbol:"♑", bg:"Козирог", en:"Capricorn", es:"Capricornio" },
  { id:"aquarius", symbol:"♒", bg:"Водолей", en:"Aquarius", es:"Acuario" },
  { id:"pisces", symbol:"♓", bg:"Риби", en:"Pisces", es:"Piscis" },
];

/*
 * Fallback текст, докато /api/horoscope/today все още няма генерирани данни
 * за днес (напр. преди първото успешно пускане на дневния cron) — виж
 * renderZodiacGrid() по-долу, което първо показва това, после презаписва с
 * реалния API отговор ако има такъв. Умишлено НЕ съдържа думата "DEMO" —
 * това е production-facing текст, не dev бележка.
 */
const ZODIAC_TEASER_FALLBACK = {
  bg: "Дневният хороскоп за днес се генерира — провери отново след малко.",
  en: "Today's horoscope is being generated — check back shortly.",
  es: "El horóscopo de hoy se está generando — vuelve a comprobarlo pronto.",
};

const FAQ_ITEMS = {
  bg: [
    ["Колко бързо получавам резултата?", "Тълкуване на сън и моментен хороскоп — до няколко часа. Натална карта, съвместимост и бизнес анализ — до 6-12 часа. Всичко е автоматизирано, без чакане на човешки график."],
    ["Как се извършва плащането?", "Сигурно през Stripe, директно на сайта — карта или локални методи, според държавата ти."],
    ["Какво включва абонаментът?", "Пълен достъп до дневния, месечния и годишния хороскоп за твоя знак, без ограничения, докато е активен."],
    ["Как се генерират хороскопите?", "На база реални изчислени планетарни транзити спрямо всеки знак, синтезирани в четим анализ — не случаен генеричен текст."],
    ["Мога ли да откажа абонамента?", "Да, по всяко време от линка във всеки имейл или от настройките на профила."],
    ["Какво ако не знам точния си час на раждане?", "Натална карта, съвместимост и бизнес анализ изискват точен час за максимална прецизност — ако не го знаеш, все пак можем да генерираме с приблизителен, с бележка за по-ниска точност на определени детайли."],
  ],
  en: [
    ["How fast do I get my result?", "Dream interpretation and instant horoscope — within a few hours. Natal chart, compatibility and business analysis — within 6-12 hours. Everything is automated, no human queue."],
    ["How does payment work?", "Securely via Stripe, right on the site — card or local payment methods depending on your country."],
    ["What does the subscription include?", "Full access to the daily, monthly and yearly horoscope for your sign, unlimited, while active."],
    ["How are the horoscopes generated?", "From real calculated planetary transits for each sign, synthesized into a readable analysis — not generic random text."],
    ["Can I cancel my subscription?", "Yes, anytime from the link in any email or from your account settings."],
    ["What if I don't know my exact birth time?", "Natal chart, compatibility and business analysis need an exact time for maximum precision — if you don't know it, we can still generate a reading with an approximate time, flagged as lower precision on certain details."],
  ],
  es: [
    ["¿Qué tan rápido recibo mi resultado?", "Interpretación de sueños y horóscopo instantáneo — en unas horas. Carta natal, compatibilidad y análisis de negocios — en 6-12 horas. Todo es automático, sin cola humana."],
    ["¿Cómo funciona el pago?", "De forma segura vía Stripe, directamente en el sitio — tarjeta o métodos locales según tu país."],
    ["¿Qué incluye la suscripción?", "Acceso completo al horóscopo diario, mensual y anual de tu signo, sin límites, mientras esté activa."],
    ["¿Cómo se generan los horóscopos?", "A partir de tránsitos planetarios reales calculados para cada signo, sintetizados en un análisis legible — no texto genérico aleatorio."],
    ["¿Puedo cancelar mi suscripción?", "Sí, en cualquier momento desde el enlace de cualquier correo o desde la configuración de tu cuenta."],
    ["¿Y si no sé mi hora exacta de nacimiento?", "Carta natal, compatibilidad y análisis de negocios necesitan una hora exacta para máxima precisión — si no la sabes, podemos generar igualmente con una hora aproximada, marcando menor precisión en ciertos detalles."],
  ],
};

let currentLang = "en"; // primary/default език след 2026-07-18 route fix-а — реално стойността винаги се презаписва веднага от applyLanguage() при зареждане на страницата, така че тук е само safe fallback

// Ключове, чиято стойност съдържа доверено HTML (линкове към terms/privacy) — за тях се ползва innerHTML вместо textContent.
const HTML_I18N_KEYS = new Set(["form.terms"]);

function applyLanguage(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const dict = I18N[lang] || I18N.bg;
    if (dict[key]) {
      if (HTML_I18N_KEYS.has(key)) el.innerHTML = dict[key];
      else el.textContent = dict[key];
    }
  });

  document.querySelectorAll(".lang-btn").forEach(b => b.classList.toggle("active", b.dataset.lang === lang));

  renderZodiacGrid();
  renderZodiacSelect();
  renderFaq();
}

function zodiacCardHtml(z, teaserText) {
  return `
    <div class="zodiac-card">
      <div class="zodiac-card-head">
        <span class="zodiac-symbol">${z.symbol}</span>
        <span class="zodiac-name">${z[currentLang] || z.bg}</span>
      </div>
      <p class="zodiac-teaser">${teaserText}</p>
      <div class="zodiac-lock" onclick="openSubscribeModal()">🔒 <span>${(I18N[currentLang]||I18N.bg)["horo.locked"]}</span></div>
    </div>
  `;
}

/*
 * Рендира веднага с fallback текст (бърз, синхронен рендер — не блокира
 * страницата), после тихо презаписва с реалните teaser-и от
 * /api/horoscope/today, ако вече са генерирани за днешната дата от
 * api/cron/generate-daily-horoscopes.js. Ако извикването гръмне (напр.
 * бекендът все още не връща данни, или мрежова грешка) — остава fallback
 * текстът, страницата никога не показва грешка на потребителя.
 */
function renderZodiacGrid() {
  const grid = document.getElementById("zodiacGrid");
  if (!grid) return;
  const fallback = ZODIAC_TEASER_FALLBACK[currentLang] || ZODIAC_TEASER_FALLBACK.bg;
  const renderLang = currentLang;
  grid.innerHTML = ZODIAC_SIGNS.map(z => zodiacCardHtml(z, fallback)).join("");

  fetch(`/api/horoscope/today?lang=${renderLang}`)
    .then(res => (res.ok ? res.json() : null))
    .then(data => {
      if (!data || renderLang !== currentLang) return; // езикът е сменен междувременно — не пипай
      const bySign = {};
      (data.horoscopes || []).forEach(h => { bySign[h.sign] = h.teaser; });
      if (Object.keys(bySign).length === 0) return; // все още няма генерирани данни за днес
      grid.innerHTML = ZODIAC_SIGNS.map(z => zodiacCardHtml(z, bySign[z.id] || fallback)).join("");
    })
    .catch(err => console.warn("[horoscope] /api/horoscope/today неуспешен, оставаме на fallback текста:", err));
}

function renderZodiacSelect() {
  const sel = document.getElementById("subSign");
  if (!sel) return;
  sel.innerHTML = ZODIAC_SIGNS.map(z => `<option value="${z.id}">${z.symbol} ${z[currentLang] || z.bg}</option>`).join("");
}

function renderFaq() {
  const container = document.getElementById("faqContainer");
  if (!container) return;
  const items = FAQ_ITEMS[currentLang] || FAQ_ITEMS.bg;
  container.innerHTML = items.map(([q, a]) => `
    <div class="faq-item">
      <button class="faq-question" onclick="toggleFaq(this)">
        <span>${q}</span><span class="faq-icon">+</span>
      </button>
      <div class="faq-answer"><p>${a}</p></div>
    </div>
  `).join("");
}
