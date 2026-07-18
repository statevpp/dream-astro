/* =====================================================================
   app.js — навигация, модали, форми
   Формите извикват /api/subscribe и /api/order/[type] (виж api/README.md).
   Докато backend-ът не е деплойнат, fetch-ът ще фейлне тихо и UI-то пак
   показва success екран, за да може дизайнът да се тества визуално —
   виж коментарите в submitSubscribe / submitOrder.
   ===================================================================== */

const PRICES = { dream: "5 €", horoscope: "15 €", natal: "25 €", compat: "20 €", business: "30 €" };
// Числови стойности за GA4 event params (виж project_dreamcatcher_site_audit_2026_07_17
// в паметта — липсваше всякакъв conversion tracking отвъд pageview).
const PRICE_VALUES = { dream: 5, horoscope: 15, natal: 25, compat: 20, business: 30 };

/**
 * Тих wrapper около gtag — не хвърля, ако скриптът е блокиран (adblock) или
 * потребителят е отказал бисквитките (window['ga-disable-...'] спира
 * изпращането вътрешно в самия gtag, не тук).
 */
function trackEvent(name, params) {
  try {
    if (typeof gtag === "function") gtag("event", name, params);
  } catch (e) { /* без адблокери да чупят чекаута */ }
}

document.addEventListener("DOMContentLoaded", () => {
  // Прихващане на magic-link token от URL fragment (#access_token=...) — съхранява се
  // в localStorage и веднага се почиства адреса (history.replaceState), за да не стои
  // огромен, нечетлив token в адресната лента на браузъра.
  let pendingOrderUpsell = false;
  let pendingSubscribeOpen = false;

  if (window.location.hash && window.location.hash.indexOf("access_token=") !== -1) {
    const match = window.location.hash.match(/access_token=([^&]+)/);
    if (match) {
      try { localStorage.setItem("astralGuideToken", decodeURIComponent(match[1])); } catch (e) {}
    }
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } else if (window.location.search.indexOf("auth=invalid") !== -1) {
    history.replaceState(null, "", window.location.pathname);
  } else if (window.location.search.indexOf("order=success") !== -1) {
    // Връщане от Stripe след еднократна поръчка (viж api/order/[type].js successUrl) —
    // показваме success + upsell към безплатния абонамент (задача: upsell между
    // еднократни поръчки и абонамент, 16.07.2026 г.).
    pendingOrderUpsell = true;
    history.replaceState(null, "", window.location.pathname);
  } else if (window.location.search.indexOf("subscribe=1") !== -1) {
    // Линк от upsell секцията в имейла с резултата (viж _lib/email.js
    // sendOrderResultEmail) — директно отваря модала за абонамент.
    pendingSubscribeOpen = true;
    history.replaceState(null, "", window.location.pathname);
  }

  applyLanguage("bg");

  document.getElementById("langSwitch").addEventListener("click", (e) => {
    const btn = e.target.closest(".lang-btn");
    if (btn) applyLanguage(btn.dataset.lang);
  });

  document.getElementById("navBurger").addEventListener("click", () => {
    document.getElementById("navMenu").classList.toggle("open");
  });

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", (e) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth" }); }
    });
  });

  document.getElementById("footerYear").textContent = new Date().getFullYear();

  ["subscribeModal", "orderModal", "manageModal"].forEach(id => {
    document.getElementById(id).addEventListener("click", (e) => {
      if (e.target.id === id) closeModal(id);
    });
  });

  if (pendingOrderUpsell) showOrderSuccessUpsell();
  if (pendingSubscribeOpen) openSubscribeModal();
});

function openSubscribeModal() {
  document.getElementById("subscribeModal").classList.add("active");
  document.body.style.overflow = "hidden";
}

let currentOrderType = "";

function openOrderForm(type) {
  currentOrderType = type;
  document.querySelectorAll("#orderForm .dynamic-fields").forEach(f => f.classList.remove("active"));
  document.querySelectorAll("#orderForm .dynamic-fields input, #orderForm .dynamic-fields textarea, #orderForm .dynamic-fields select")
    .forEach(f => f.removeAttribute("required"));

  const fieldset = document.getElementById("fields-" + type);
  fieldset.classList.add("active");
  fieldset.querySelectorAll("input, textarea, select").forEach(f => {
    if (f.dataset.optional !== "true") f.setAttribute("required", "required");
  });

  document.getElementById("orderPrice").textContent = PRICES[type] || "—";
  const dict = I18N[currentLang] || I18N.bg;
  const titleKey = "svc." + type + ".title";
  document.getElementById("orderModalTitle").textContent = dict[titleKey] || dict["order_modal.title"];

  document.getElementById("orderModal").classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  document.getElementById(id).classList.remove("active");
  document.body.style.overflow = "auto";
}

function toggleFaq(button) {
  const item = button.parentElement;
  document.querySelectorAll(".faq-item").forEach(i => { if (i !== item) i.classList.remove("active"); });
  item.classList.toggle("active");
}

/* ---------- Subscribe (free lead magnet -> real Stripe trial subscription) ---------- */
async function submitSubscribe(event) {
  event.preventDefault();
  const planInput = document.querySelector('input[name="subPlan"]:checked');
  const payload = {
    name: document.getElementById("subName").value,
    email: document.getElementById("subEmail").value,
    sign: document.getElementById("subSign").value,
    plan: planInput ? planInput.value : "monthly",
    lang: currentLang,
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("backend not deployed yet");
    const json = await res.json();
    if (json.checkoutUrl) {
      // Клиентско "намерение" събитие — реалната платена конверсия идва
      // сървърно от Stripe webhook-а (api/webhooks/stripe.js), за да не се
      // губи при adblock-ери или затворен таб преди Stripe redirect-а.
      trackEvent("sign_up", { method: "stripe_trial", plan: payload.plan });
      // Картата се въвежда сега през Stripe Checkout (trial subscription) —
      // виж api/subscribe.js за защо това замества "просто запиши имейла".
      window.location.href = json.checkoutUrl;
      return;
    }
  } catch (err) {
    // Backend не е деплойнат в тази демо среда — виж api/README_DEPLOY.md.
    console.warn("[DEMO] /api/subscribe не отговори — очаквано преди деплой на backend-а.", payload, err);
  }

  closeModal("subscribeModal");
  document.getElementById("subscribeForm").reset();
  showSuccess((I18N[currentLang] || I18N.bg)["success.text"]);
}

/* ---------- Product order ---------- */
async function submitOrder(event) {
  event.preventDefault();
  const fieldset = document.getElementById("fields-" + currentOrderType);
  const data = { type: currentOrderType, lang: currentLang, timestamp: new Date().toISOString(), fields: {} };

  fieldset.querySelectorAll("input, textarea, select").forEach((f, idx) => {
    // name= атрибутът е меродавен (виж index.html) — съвпада точно с ключовете,
    // които api/_lib/fulfill-order.js очаква (birthPlace, birthDate, name...).
    // Fallback-ът по label data-i18n остава само за евентуални нови полета
    // без name атрибут, за да не гърми тихо.
    const key = f.name || (f.previousElementSibling && f.previousElementSibling.tagName === "LABEL"
      ? f.previousElementSibling.getAttribute("data-i18n") || ("field_" + idx)
      : ("field_" + idx));
    data.fields[key] = f.value;
  });

  try {
    const res = await fetch(`/api/order/${currentOrderType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("backend not deployed yet");
    const json = await res.json();
    if (json.checkoutUrl) {
      // "generate_lead" — отделно от begin_checkout, за да Google Ads/Meta
      // lead-gen кампании имат чист lead-конверсия сигнал по вид услуга, без
      // да зависи от ecommerce funnel семантиката на begin_checkout (виж
      // т.1 от одита, project_dreamcatcher_site_audit_2026_07_17 в паметта).
      trackEvent("generate_lead", {
        service: currentOrderType,
        currency: "EUR",
        value: PRICE_VALUES[currentOrderType],
      });
      // Клиентско "намерение" събитие — реалната "purchase" конверсия идва
      // сървърно от Stripe webhook-а (checkout.session.completed), който
      // потвърждава реално платена сесия, не просто клик по бутона.
      trackEvent("begin_checkout", {
        currency: "EUR",
        value: PRICE_VALUES[currentOrderType],
        items: [{ item_name: currentOrderType }],
      });
      window.location.href = json.checkoutUrl; // Stripe Checkout redirect
      return;
    }
  } catch (err) {
    console.warn(`[DEMO] /api/order/${currentOrderType} не отговори — очаквано преди деплой на backend-а и Stripe.`, data, err);
  }

  closeModal("orderModal");
  document.getElementById("orderForm").reset();
  showSuccess((I18N[currentLang] || I18N.bg)["success.text"]);
}

/* ---------- Manage subscription (Stripe Billing Portal) ---------- */
function openManageModal() {
  document.getElementById("manageError").style.display = "none";
  document.getElementById("manageModal").classList.add("active");
  document.body.style.overflow = "hidden";
}

async function submitManage(event) {
  event.preventDefault();
  const email = document.getElementById("manageEmail").value;
  const errorEl = document.getElementById("manageError");
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalLabel = submitBtn.textContent;
  errorEl.style.display = "none";
  submitBtn.disabled = true;
  submitBtn.textContent = "Изчакай…";

  try {
    const res = await fetch("/api/billing-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    let json = {};
    try { json = await res.json(); } catch (e) {}

    if (res.ok && json.url) {
      window.location.href = json.url;
      return;
    }

    errorEl.textContent = res.status === 404
      ? "Не открихме абонамент с този имейл. Провери дали е същият, с който си се регистрирал."
      : "Възникна грешка. Опитай отново или пиши на info@dream-astro.com.";
    errorEl.style.display = "block";
  } catch (err) {
    console.warn("[billing-portal] заявката не мина.", err);
    errorEl.textContent = "Възникна грешка при връзката. Опитай отново или пиши на info@dream-astro.com.";
    errorEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
}

function showSuccess(text) {
  // По подразбиране upsell бутонът е скрит — само showOrderSuccessUpsell() го
  // включва изрично, за да не се показва при обикновени demo-fallback съобщения.
  const upsellBtn = document.getElementById("successUpsellBtn");
  if (upsellBtn) upsellBtn.style.display = "none";
  document.getElementById("successText").textContent = text;
  document.getElementById("successMessage").classList.add("active");
  document.body.style.overflow = "hidden";
}

/* ---------- Upsell след еднократна поръчка (връщане от Stripe) ---------- */
function showOrderSuccessUpsell() {
  const dict = I18N[currentLang] || I18N.bg;
  showSuccess(dict["success.order_upsell_text"] || dict["success.text"]);
  const btn = document.getElementById("successUpsellBtn");
  if (btn) btn.style.display = "block";
}
