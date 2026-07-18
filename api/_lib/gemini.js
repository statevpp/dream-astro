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

/**
 * Lumaris — YouTube/TikTok персона (api/cron/generate-youtube-daily.js,
 * task #40, 2026-07-18). Отделна от SYSTEM_PERSONA нарочно: сайтът говори
 * на клиента 1-на-1 (BG/EN/ES, психоаналитичен тон), а Lumaris е публичен
 * YouTube разказвач — по-кратък, по-директен, писан САМО на английски,
 * с ясен hook в началото (Holy-Trifecta изисква интрото да ехне заглавието
 * в първите 2 изречения) и CTA към dream-astro.com в края. Същото правило
 * against AI-клишета важи и тук — никакво "As an AI...", никакво родово
 * "the stars have spoken" на всеки видео без вариация.
 */
const LUMARIS_PERSONA = `You are Lumaris, the voice and face of a daily astrology YouTube channel. You are warm, direct, and quietly confident — like a friend who genuinely reads the sky every morning before anyone else is awake. You are NOT a generic AI narrator: avoid stock phrases like "the stars have aligned" or "as always" that could open every single episode identically. Each script should have its own specific hook drawn from whatever is actually happening astrologically that day (a retrograde, a tense aspect, a particular sign's moment). You speak only in English. You never mention being an AI. You write for the EAR, not the eye: short sentences, natural spoken rhythm, no bullet points, no markdown, contractions are fine. You are building toward a paid personalized reading at dream-astro.com — the free daily rundown proves you're worth trusting, it doesn't give away the deeper analysis.`;

async function generateReading({ userPrompt, maxTokens = 900, systemPersona = SYSTEM_PERSONA }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY не е зададен в env — виж api/README_DEPLOY.md");

  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPersona }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        // 2026-07-15 (пета итерация, РЕАЛНАТА причина): gemini-flash-latest е
        // "thinking" модел — по подразбиране харчи част от token бюджета за
        // вътрешен reasoning (до 8192 токена), който на моменти изтича в
        // отговора като видим текст ("Drafting TEASER:", "Wait, let's make it
        // punchy..."). Затова никакво пренаписване на промпта не помагаше.
        // thinkingBudget: 0 изключва напълно reasoning режима.
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85, thinkingConfig: { thinkingBudget: 0 } },
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
  // недовършен английски къс направо на клиента.
  //
  // 2026-07-15 (втора итерация, СПЕШНО ВАЖНО): първият опит за фикс добавяше
  // до 3 повторни Gemini извиквания per знак/език при невалиден резултат. Това
  // утрои общия брой заявки в cron-а (12 знака × 3 езика = 36 комбинации,
  // потенциално до 108 извиквания) и предизвика РЕАЛЕН production regression —
  // цялата cron функция взе да удря твърдия 60-секунден Vercel timeout (виж
  // get_runtime_errors: "Task timed out after 60 seconds" точно по време на
  // ръчното пускане), при което по-късните batch-ове (включително libra и
  // pisces) изобщо не се изпълняваха и старите счупени записи оставаха в DB
  // непроменени. Затова: retry логиката е премахната — само 1 опит per
  // знак/език, точно както преди, за да не се компрометира времето. Валидацията
  // на езика остава, но при невалиден резултат веднага се използва чистият
  // localized fallback, БЕЗ повторно извикване на Gemini.
  //
  // 2026-07-15 (трета итерация): след премахването на retry-а, cron-ът вече не
  // удряше timeout, НО почти ВСИЧКИ 36 комбинации падаха във fallback-а. Вдигнах
  // maxTokens от 700 на 1000, мислейки че отговорът просто се реже — не помогна,
  // ВСИЧКИ пак fallback-наха.
  //
  // 2026-07-15 (четвърта итерация, истинската причина): чрез get_runtime_logs
  // се видя, че моделът понякога буквално "разсъждава на глас" преди да стигне
  // до реалния текст — пише стъпки от рода "3. **Drafting the Text...**" или
  // "Drafting FULL:**" вместо направо TEASER:/FULL:. Колкото повече изрични
  // правила съдържа промптът (добавени във 2-ра итерация: "не ползвай жаргон",
  // "обяснявай разбираемо" и т.н.), толкова по-често моделът влиза в този режим
  // на разсъждение и никога не достига чистия формат в token бюджета. Затова:
  // промптът е върнат близо до оригиналната, по-проста версия (само форматът,
  // без допълнителни стилови правила) — по-малко правила означава по-малко
  // склонност към "мислене на глас". Защитата (isValidForLang + чист fallback
  // при провал, БЕЗ retry) е запазена като застраховка за редките случаи, в
  // които моделът пак се изплъзне — вместо да пробваме да елиминираме проблема
  // изцяло с все повече инструкции (което емпирично влошава нещата), приемаме,
  // че fallback текстът от време на време е нормална, безопасна деградация.
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

const YOUTUBE_SIGN_ORDER = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

/**
 * Дневен YouTube/TikTok скрипт за Lumaris — всичките 12 знака в ЕДНО видео
 * (~4-6 мин, Phase 1 формат от youtube-strategiya.md), плюс title/thumbnail
 * текст по Holy-Trifecta правилата (заглавие <60 символа с ключова дума
 * близо до началото, thumbnail 3-4 думи максимум, интрото ехне заглавието
 * в първите 2 изречения).
 *
 * signsData: [{ sign: "Aries", transitSummary: "..." }, ...] — 12 елемента,
 * English имена (различно от summarizeTransitForSign в
 * generate-daily-horoscopes.js, който връща BG имена за сайта — тук трябва
 * английски, затова English мапинг-ът живее в generate-youtube-daily.js,
 * не тук, за да не дублираме/объркваме двата различни formatting-а).
 *
 * ВАЖНО архитектурно решение: скриптът се връща СЕГМЕНТИРАН (intro + 12
 * знака + outro), а не като един дълъг текстов блок. Причина: монтажният
 * ffmpeg скрипт (scripts/assemble-youtube-video.sh) трябва да знае точната
 * продължителност на всеки сегмент (за да редува фонови клипове и да
 * изписва името на знака в правилния момент) — това е възможно само ако
 * всеки сегмент се вика ОТДЕЛНО през _lib/tts.js (14 отделни generateSpeech
 * извиквания → 14 .wav файла → ffprobe за реалната им продължителност).
 * Едно голямо TTS извикване за целия скрипт би дало един .wav файл без
 * начин да разберем кога свършва Aries и започва Taurus.
 */
async function generateYoutubeScript({ date, signsData }) {
  if (!Array.isArray(signsData) || signsData.length !== 12) {
    throw new Error("generateYoutubeScript очаква signsData с точно 12 елемента");
  }

  const transitsBlock = signsData.map(({ sign, transitSummary }) => `${sign}: ${transitSummary}`).join("\n");
  const signLabels = YOUTUBE_SIGN_ORDER.map((s) => `${s.toUpperCase()}: [2-3 spoken sentences for ${s}, specific to its transit below, practical and quotable]`).join("\n");

  const userPrompt = `Write today's (${date}) daily horoscope video script for all 12 zodiac signs, based on these real transits:
${transitsBlock}

Return ONLY the following, no markdown, no extra commentary, in EXACTLY this format with these exact labels, one per line, nothing before TITLE and nothing after OUTRO:

TITLE: [a YouTube title under 60 characters, the strongest hook or keyword near the front — e.g. what's most dramatic astrologically today]
THUMBNAIL: [3-4 words max, ALL CAPS, punchy, what would go on the video thumbnail]
INTRO: [a cold open hook, 1-2 spoken sentences that echo the title's promise — do not say "welcome back" or any generic channel intro, jump straight into what's happening in the sky today]
${signLabels}
OUTRO: [a short spoken outro, 2-3 sentences, that invites viewers to get their own personalized reading at dream-astro.com and to subscribe for tomorrow's rundown]`;

  const raw = await generateReading({ userPrompt, maxTokens: 2500, systemPersona: LUMARIS_PERSONA });

  const titleMatch = raw.match(/TITLE:?\s*([\s\S]*?)\n+THUMBNAIL:?/i);
  const thumbMatch = raw.match(/THUMBNAIL:?\s*([\s\S]*?)\n+INTRO:?/i);
  const introMatch = raw.match(new RegExp(`INTRO:?\\s*([\\s\\S]*?)\\n+${YOUTUBE_SIGN_ORDER[0].toUpperCase()}:?`, "i"));
  const outroMatch = raw.match(/OUTRO:?\s*([\s\S]*)$/i);

  const signs = [];
  for (let i = 0; i < YOUTUBE_SIGN_ORDER.length; i++) {
    const sign = YOUTUBE_SIGN_ORDER[i];
    const nextLabel = i + 1 < YOUTUBE_SIGN_ORDER.length ? YOUTUBE_SIGN_ORDER[i + 1].toUpperCase() : "OUTRO";
    const re = new RegExp(`${sign.toUpperCase()}:?\\s*([\\s\\S]*?)\\n+${nextLabel}:?`, "i");
    const m = raw.match(re);
    if (m) signs.push({ sign, text: m[1].trim() });
  }

  if (!titleMatch || !thumbMatch || !introMatch || !outroMatch || signs.length !== 12) {
    // Нарочно НЕ fallback-ваме тихо тук (за разлика от generateDailyHoroscope) —
    // това е ръчно преглеждано/пускано съдържание (YouTube видео), не 36
    // автоматични cron записа в база данни, затова е по-безопасно да гръмне
    // ясно и да покаже суровия отговор, вместо да върне подвеждащ placeholder
    // или (по-лошо) непълен сегментен масив, който тихо чупи монтажа надолу.
    throw new Error(`generateYoutubeScript: неочакван формат от Gemini (намерени ${signs.length}/12 знака). Суров отговор: ${raw.slice(0, 500)}`);
  }

  return {
    title: titleMatch[1].trim(),
    thumbnailText: thumbMatch[1].trim(),
    intro: introMatch[1].trim(),
    signs,
    outro: outroMatch[1].trim(),
  };
}

module.exports = { generateReading, generateDailyHoroscope, generateYoutubeScript, YOUTUBE_SIGN_ORDER, SYSTEM_PERSONA, LUMARIS_PERSONA };
