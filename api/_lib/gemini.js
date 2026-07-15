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
  // 2026-07-15 (четвърта итерация, истинската причина): чрез get_runtime_logs
  // се видя, че моделът понякога буквално "разсъждава на глас" преди да стигне
  // до реалния текст — пише стъпки от рода "3. **Drafting the Text...**" вместо
  // направо TEASER:/FULL:. Колкото повече изрични правила съдържа промптът,
  // толкова по-често моделът влиза в този режим и никога не достига чистия
  // формат в token бюджета. Затова промптът е върнат близо до оригиналната,
  // по-проста версия. Защитата (isValidForLang + чист fallback при провал, БЕЗ
  // retry — retry-ят удряше 60s Vercel timeout, виж по-старата версия на този
  // файл) е запазена като застраховка за редките случаи.
  const userPrompt = `Генерирай дневен хороскоп за зодиакален знак ${signName} на ${langName}, базиран на следните реални планетарни транзити за днес: ${transitSummary}.

Върни САМО готовия текст в ТОЧНО този формат, без markdown форматиране (без звездички, без заглавия, без code block), без допълнителни обяснения и без да повтаряш тези инструкции:
TEASER: [1-2 кратки, закачливи изречения — публична тийзър версия, на ${langName}]
FULL: [пълен анализ, 4-6 изречения, конкретни насоки за деня, на ${langName}]`;

  const FALLBACK_TEXT = {
    bg: { teaser: "Днешната енергия за теб се оформя — провери отново съвсем скоро...", full: "Днешният анализ за този знак временно не е наличен. Опитай отново по-късно или разгледай другите знаци." },
    en: { teaser: "Today's energy is still forming for you — check back shortly...", full: "Today's reading for this sign is temporarily unavailable. Please try again later." },
    es: { teaser: "La energía de hoy para ti se está formando — vuelve pronto...", full: "La lectura de hoy para este signo no está disponible temporalmente. Inténtalo de nuevo más tarde." },
  };

  const raw = await generateReading({ userPrompt, maxTokens: 1000 });
  const teaserMatch = raw.match(/\**\s*TEASER:?\s*\**\s*([\s\S]*?)\n+\**\s*FULL:?/i);
  const fullMatch = raw.match(/\**\s*FULL:?\s*\**\s*([\s\S]*)$/i);

  if (teaserMatch && fullMatch) {
    const teaser = finalizeTeaser(teaserMatch[1]);
    const full = fullMatch[1].trim();
    if (isValidForLang(teaser, lang) && isValidForLang(full, lang)) {
      return { teaser, full };
    }
    console.warn(`[gemini] ${signName}/${lang}: TEASER/FULL намерени, но текстът не е на ${langName}, ползвам fallback (без retry). Суров отговор: ${raw.slice(0, 200)}`);
    return FALLBACK_TEXT[lang] || FALLBACK_TEXT.bg;
  }

  console.warn(`[gemini] ${signName}/${lang}: TEASER/FULL формат не съвпадна, ползвам fallback (без retry). Суров отговор: ${raw.slice(0, 200)}`);
  return FALLBACK_TEXT[lang] || FALLBACK_TEXT.bg;
}

/**
 * Груба, но ефективна проверка дали текстът реално е на очаквания език —
 * пази срещу случаите, в които Gemini изцяло игнорира инструкцията за език.
 * Не е лингвистично прецизна, но лови точно проблемния случай: отговор
 * основно на английски, докато е поискан bg/es.
 */
function isValidForLang(text, lang) {
  const t = (text || "").trim();
  if (!t) return false;
  if (lang === "en") return true; // английски винаги минава

  const cyrillicCount = (t.match(/[Ѐ-ӿ]/g) || []).length;
  const latinLetterCount = (t.match(/[a-zA-Z]/g) || []).length;

  if (lang === "bg") {
    return cyrillicCount > 0 && cyrillicCount >= latinLetterCount * 0.5;
  }

  if (lang === "es") {
    const englishJargon = /\b(house|retrograde|ascendant|angle|concept|psychoanalytic)\b/i;
    return !englishJargon.test(t);
  }

  return true;
}

/**
 * Финално почистване на teaser текста преди да влезе в базата/сайта:
 * гарантира резултатът, който клиентът РЕАЛНО вижда: без етикети/маркери,
 * без markdown, започва с главна буква, завършва с многоточие "...".
 */
function finalizeTeaser(text) {
  let t = (text || "").trim();
  t = t.replace(/\**\s*(TEASER|FULL|Format)\s*:?\s*\**/gi, "").trim();
  t = t.replace(/^[`*\-\s]+/, "").replace(/[`*\s]+$/, "").trim();
  if (!t) return "...";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  t = t.replace(/[.…]+\s*$/, "").trim();
  return t + "...";
}

module.exports = { generateReading, generateDailyHoroscope, SYSTEM_PERSONA };
