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
  //
  // 2026-07-15: открит по-тежък вариант на същия проблем на живия сайт (Телец,
  // Лъв, Везни, Риби) — моделът изцяло игнорираше TEASER/FULL формата за bg
  // заявки и отговаряше на английски с astro-психоаналитичен жаргон и markdown
  // заглавия ("Psychoanalytic angle:*", "Mercury Retrograde in Cancer:* 10th
  // house..."). Старият fallback само чистеше етикетите TEASER/FULL и режеше
  // суровия текст — щом моделът никога не ги е писал, fallback-ът връщаше
  // недовършен английски къс направо на клиента. Сега: (1) промптът е още
  // по-стриктен и изрично забранява жаргон/английски/заглавия, (2) резултатът
  // се валидира — за bg/es проверяваме че текстът реално е на кирилица/испански,
  // не английски маркери — и при провал се прави повторен опит (до 3 общо), (3)
  // ако и след 3 опита резултатът е невалиден, връщаме чист, кратък, коректен
  // на съответния език placeholder вместо счупен/чужд текст.
  const basePrompt = (attempt) => `Генерирай дневен хороскоп за зодиакален знак ${signName} на ${langName}, базиран на следните реални планетарни транзити за днес: ${transitSummary}.

ЗАДЪЛЖИТЕЛНИ ПРАВИЛА:
- Целият текст ТРЯБВА да е само на ${langName} — нито дума на друг език.
- Не използвай астрологичен/технически жаргон като "house", "retrograde", "ascendant" на английски — обяснявай на разбираем битов език.
- Без markdown: без звездички, без заглавия, без bullet points, без code block.
- Не повтаряй тези инструкции и не пиши "Format:" или подобни.
${attempt > 1 ? "- ВАЖНО: предишен опит наруши тези правила (беше на грешен език или с жаргон/markdown). Спази ги стриктно този път." : ""}

Върни САМО готовия текст в ТОЧНО този формат:
TEASER: [1-2 кратки, закачливи изречения — публична тийзър версия, на ${langName}]
FULL: [пълен анализ, 4-6 изречения, конкретни насоки за деня, на ${langName}]`;

  const FALLBACK_TEXT = {
    bg: { teaser: "Днешната енергия за теб се оформя — провери отново съвсем скоро...", full: "Днешният анализ за този знак временно не е наличен. Опитай отново по-късно или разгледай другите знаци." },
    en: { teaser: "Today's energy is still forming for you — check back shortly...", full: "Today's reading for this sign is temporarily unavailable. Please try again later." },
    es: { teaser: "La energía de hoy para ti se está formando — vuelve pronto...", full: "La lectura de hoy para este signo no está disponible temporalmente. Inténtalo de nuevo más tarde." },
  };

  let lastRaw = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await generateReading({ userPrompt: basePrompt(attempt), maxTokens: 700 });
    lastRaw = raw;
    const teaserMatch = raw.match(/\**\s*TEASER:?\s*\**\s*([\s\S]*?)\n+\**\s*FULL:?/i);
    const fullMatch = raw.match(/\**\s*FULL:?\s*\**\s*([\s\S]*)$/i);

    if (teaserMatch && fullMatch) {
      const teaser = finalizeTeaser(teaserMatch[1]);
      const full = fullMatch[1].trim();
      if (isValidForLang(teaser, lang) && isValidForLang(full, lang)) {
        return { teaser, full };
      }
      console.warn(`[gemini] ${signName}/${lang} опит ${attempt}: TEASER/FULL намерени, но текстът не е на ${langName}. Повтарям.`);
      continue;
    }
    console.warn(`[gemini] ${signName}/${lang} опит ${attempt}: TEASER/FULL формат не съвпадна. Суров отговор: ${raw.slice(0, 200)}`);
  }

  // И трите опита се провалиха — не показваме счупен/чужд текст на клиента,
  // връщаме чист, коректен на езика placeholder. Логваме пълния суров отговор
  // за диагностика (get_runtime_logs), но той никога не стига до потребителя.
  console.error(`[gemini] ${signName}/${lang}: и 3-те опита се провалиха, ползвам localized fallback. Последен суров отговор: ${lastRaw.slice(0, 300)}`);
  return FALLBACK_TEXT[lang] || FALLBACK_TEXT.bg;
}

/**
 * Груба, но ефективна проверка дали текстът реално е на очаквания език —
 * пази срещу случаите, в които Gemini изцяло игнорира инструкцията за език
 * (виж бележката по-горе от 2026-07-15). Не е лингвистично прецизна, но лови
 * точно проблемния случай: отговор основно на английски, докато е поискан bg/es.
 */
function isValidForLang(text, lang) {
  const t = (text || "").trim();
  if (!t) return false;
  if (lang === "en") return true; // английски винаги минава

  const cyrillicCount = (t.match(/[Ѐ-ӿ]/g) || []).length;
  const latinLetterCount = (t.match(/[a-zA-Z]/g) || []).length;

  if (lang === "bg") {
    // За кратки текстове изискваме поне малко кирилица и тя да не е засенчена
    // от латиница (напр. изцяло английско изречение с по някоя случайна дума).
    return cyrillicCount > 0 && cyrillicCount >= latinLetterCount * 0.5;
  }

  if (lang === "es") {
    // Испанският дели азбука с английския, затова ловим типични английски
    // astro-жаргон думи, които се появиха в реалните счупени отговори.
    const englishJargon = /\b(house|retrograde|ascendant|angle|concept|psychoanalytic)\b/i;
    return !englishJargon.test(t);
  }

  return true;
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
