/**
 * _lib/fulfill-order.js
 * Извиква се от webhooks/stripe.js СЛЕД потвърдено плащане.
 * За всеки тип продукт: взима астрологични данни -> генерира текст през
 * Gemini -> прави PDF -> изпраща имейл -> маркира поръчката като доставена.
 */

const { getNatalChart, getSynastry, resolveBirthLocation, buildChartInput } = require("./astrology");
const { generateReading } = require("./gemini");
const { generateReadingPdf } = require("./pdf");
const { sendOrderResultEmail } = require("./email");
const { markOrderDelivered } = require("./db");

async function fulfillOrder(order) {
  const { id, type, email, lang, fields } = order;
  let bodyText, title;

  switch (type) {
    case "dream":
      title = titleFor("dream", lang);
      bodyText = await generateReading({
        userPrompt: `Направи дълбок психоаналитичен анализ (по Юнг/Фройд) на следния сън, на ${langName(lang)}: "${fields.dreamDescription}". Адресирай човека по име: ${fields.name}.`,
        maxTokens: 700,
      });
      break;

    case "horoscope":
      title = titleFor("horoscope", lang);
      bodyText = await generateReading({
        userPrompt: `Направи фокусиран хороскоп за периода "${fields.period}" за човек с рождена дата ${fields.birthDate}, име ${fields.name}, на ${langName(lang)}.`,
        maxTokens: 600,
      });
      break;

    case "natal": {
      // fields.birthPlace идва като суров текст от формата ("Sofia, Bulgaria") —
      // геокодираме го тук (сървърна страна) в lat/lon/tzOffset преди да викнем
      // natal_chart. Виж _lib/astrology.js -> resolveBirthLocation/geocodePlace.
      const { lat, lon, tzOffset } = await resolveBirthLocation({
        date: fields.birthDate, placeText: fields.birthPlace,
      });
      const chart = await getNatalChart({
        date: fields.birthDate, time: fields.birthTime, lat, lon, tzOffset,
      });
      title = titleFor("natal", lang);
      bodyText = await generateReading({
        userPrompt: `Синтезирай пълна натална карта в четим, кратък анализ (не 30-странична бюрокрация) за ${fields.name}, на ${langName(lang)}. Сурови astro данни: ${JSON.stringify(chart)}. Допълнителни въпроси: ${fields.questions || "няма"}.`,
        maxTokens: 1200,
      });
      break;
    }

    case "compat": {
      // Всеки от двамата се геокодира поотделно от суровия birthPlace текст,
      // после се сглобява в input формата, която synastry_report очаква.
      const personA = await buildChartInput({
        date: fields.person1BirthDate, time: fields.person1BirthTime, placeText: fields.person1BirthPlace,
      });
      const personB = await buildChartInput({
        date: fields.person2BirthDate, time: fields.person2BirthTime, placeText: fields.person2BirthPlace,
      });
      const synastry = await getSynastry(personA, personB);
      title = titleFor("compat", lang);
      bodyText = await generateReading({
        userPrompt: `Направи анализ на съвместимостта (синастрия) между ${fields.person1Name || "първия човек"} и ${fields.person2Name || "втория човек"}, на ${langName(lang)}. Данни: ${JSON.stringify(synastry)}.`,
        maxTokens: 900,
      });
      break;
    }

    case "business":
      title = titleFor("business", lang);
      bodyText = await generateReading({
        userPrompt: `Направи бизнес-астрологичен анализ за ${fields.name} (рождена дата ${fields.birthDate}, час ${fields.birthTime}, място ${fields.birthPlace}), фокус: "${fields.businessFocus}", на ${langName(lang)}. Кажи конкретни благоприятни/неблагоприятни прозорци във времето.`,
        maxTokens: 900,
      });
      break;

    default:
      throw new Error(`unknown order type: ${type}`);
  }

  const clientName = fields.name || fields.person1Name || "";
  const pdf = await generateReadingPdf({ title, bodyText, clientName });
  await sendOrderResultEmail(email, title, `<p>${bodyText.replace(/\n/g, "<br>")}</p>`, pdf, lang);
  await markOrderDelivered(id);
}

function titleFor(type, lang) {
  const map = {
    dream: { bg: "Тълкуване на сън", en: "Dream Interpretation", es: "Interpretación de Sueños" },
    horoscope: { bg: "Моментен хороскоп", en: "Instant Horoscope", es: "Horóscopo Instantáneo" },
    natal: { bg: "Пълна натална карта", en: "Full Natal Chart", es: "Carta Natal Completa" },
    compat: { bg: "Съвместимост на партньори", en: "Partner Compatibility", es: "Compatibilidad de Pareja" },
    business: { bg: "Бизнес астрология", en: "Business Astrology", es: "Astrología de Negocios" },
  };
  return map[type][lang] || map[type].bg;
}

function langName(lang) {
  return { bg: "български", en: "English", es: "español" }[lang] || "български";
}

module.exports = { fulfillOrder };
