/**
 * _lib/gemini.js
 * Генериране на текст през Google Gemini API (Google AI Studio), с фиксираната
 * системна персона от 04_project_dreamcatcher_tech.txt ("Астрален Водач").
 *
 * TODO преди деплой: сложи GEMINI_API_KEY в env variables (Vercel).
 * Ключът се взима безплатно от https://aistudio.google.com/apikey — не изисква карта.
 * (Внимание: платеният "Gemini PRO"/"Gemini Advanced" абонамент през Google One е
 * отделен продукт за приложението Gemini и НЕ дава автоматично API достъп/ключ.)
 */

const SYSTEM_PERSONA = `Ти си Астрален Водач – емпатичен, изключително ерудиран астролог, психоаналитик по ученията на Юнг и Фройд и дълбок анализатор на сънища. Твоят стил е мистичен, емоционален, но същевременно строго структуриран, логичен и научен. Не звучиш като робот, избягваш евтини компютърни клишета и типичното AI излъчване. Използваш богати, красиви и въздействащи метафори. Винаги адресираш клиента по име. Твоите анализи са психологически издържани, прагматични и насочени към конкретно действие в реалния живот. Никога и по никакъв повод не признаваш, че си изкуствен интелект. Анализирай подадените данни и отговори изцяло на езика, на който е направено запитването (Български, Английски или Испански).`;

async function generateReading({ userPrompt, maxTokens = 900 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY не е зададен в env — виж api/README_DEPLOY.md");

  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PERSONA }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85 },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) throw new Error("Gemini API върна празен отговор (възможно е да е блокирано от safety filter)");
  return text.trim();
}

/**
 * Дневен хороскоп за един знак — синтезира реални транзитни данни в
 * teaser (публичен, ~1-2 изречения) + full (пълен, само за абонати).
 * Промптът инструктира модела да звучи като синтез на множество извора,
 * без да копира текст от конкретен източник дума по дума.
 */
async function generateDailyHoroscope({ signName, transitSummary, lang }) {
  const langName = { bg: "български", en: "English", es: "español" }[lang] || "български";
  // 2026-07-14: открит реален бъг чрез проверка на живите данни — моделът понякога
  // echo-ваше самите инструкции обратно (markdown **Format:** и т.н.) или пишеше
  // "TEASER:"/"FULL:" с звездички около тях, което чупеше строгия regex по-долу и
  // показваше сурови/недовършени текстове директно на живия сайт. Промптът вече
  // изрично забранява markdown и повторение на инструкциите, а regex-ът е
  // толерантен към markdown около етикетите. maxTokens вдигнат от 500 на 700, за
  // да не се отрязва отговорът преди да стигне до FULL секцията.
  const userPrompt = `Генерирай дневен хороскоп за зодиакален знак ${signName} на ${langName}, базиран на следните реални планетарни транзити за днес: ${transitSummary}.

Върни САМО готовия текст в ТОЧНО този формат, без markdown форматиране (без звездички, без get, без code block), без заглавия и без да повтаряш тези инструкции:
TEASER: [1-2 кратки, закачливи изречения — публична тийзър версия, на ${langName}]
FULL: [пълен анализ, 4-6 изречения, конкретни насоки за деня, на ${langName}]`;

  const raw = await generateReading({ userPrompt, maxTokens: 700 });
  const teaserMatch = raw.match(/\**\s*TEASER:?\s*\**\s*([\s\S]*?)\n+\**\s*FULL:?/i);
  const fullMatch = raw.match(/\**\s*FULL:?\s*\**\s*([\s\S]*)$/i);

  if (teaserMatch && fullMatch) {
    return { teaser: finalizeTeaser(teaserMatch[1]), full: fullMatch[1].trim() };
  }

  // Fallback ако моделът не спази формата: не режем сурово на 140 символа (това
  // показваше счупени, недовършени изречения на сайта) — вместо това пускаме
  // целия текст като "full" и отрязваме "teaser" на границата на изречение.
  console.warn(`[gemini] TEASER/FULL формат не съвпадна за ${signName}/${lang}, ползвам fallback. Суров отговор: ${raw.slice(0, 200)}`);
  const cleaned = raw.replace(/\**\s*(TEASER|FULL):?\s*\**/gi, "").trim();
  const sentenceEnd = cleaned.slice(0, 220).search(/[.!?][^.!?]*$/);
  const teaserFallback = sentenceEnd > 20 ? cleaned.slice(0, sentenceEnd + 1) : cleaned.slice(0, 160);
  return { teaser: finalizeTeaser(teaserFallback), full: cleaned };
}

/**
 * Финално почистване на teaser текста преди да влезе в базата/сайта:
 * 2026-07-14 — открито на живия сайт: дори при успешен regex match понякога
 * оставаше остатъчен етикет "TEASER:"/"Format:" или недовършен ред от модела.
 * Тук гарантираме резултатът, който клиентът РЕАЛНО вижда: без етикети/маркери,
 * без markdown, започва с главна буква, завършва с многоточие "...".
 */
function finalizeTeaser(text) {
  let t = (text || "").trim();
  // Махни остатъчни етикети/markdown навсякъде в текста (не само в началото),
  // защото моделът понякога ги вмъква по средата при echo на инструкциите.
  t = t.replace(/\**\s*(TEASER|FULL|Format)\s*:?\s*\**/gi, "").trim();
  // Махни увиснали backtick/code-block остатъци и водещи тирета/звездички.
  t = t.replace(/^[`*\-\s]+/, "").replace(/[`*\s]+$/, "").trim();
  if (!t) return "...";
  // Главна буква в началото (запазва кирилица/латиница коректно).
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // Свали existing многоточие/точки в края, после добави точно "..." веднъж.
  t = t.replace(/[.…]+\s*$/, "").trim();
  return t + "...";
}

module.exports = { generateReading, generateDailyHoroscope, SYSTEM_PERSONA };
