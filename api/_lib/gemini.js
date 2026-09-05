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
        //
        // 2026-09-05 (ПОПРАВКА — открито през Vercel runtime error логовете:
        // "/api/cron/generate-daily-horoscopes" гърми с 400 INVALID_ARGUMENT
        // "Thinking level MINIMAL is not supported for this model" на ВСЯКА
        // дневна заявка от 2026-08-14 насам, 3 седмици сайтът да не е
        // обновявал нито един хороскоп): gemini-flash-latest пак се е
        // търкулнал версия (сега Gemini 3.8 Flash), която повече не приема
        // thinkingLevel "minimal" — само по-старите 3.6/3.5 Flash го
        // поддържаха. "low" е новият най-нисък поддържан режим (най-близък
        // до "изключено мислене", виж ai.google.dev/gemini-api/docs/
        // generate-content/thinking). Ако Google пак смени модела занапред и
        // това отново гръмне, провери СЪЩАТА страница за актуалния списък
        // поддържани thinkingLevel стойности за конкретния модел, преди да
        // предполагаш каквото и да е.
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85, thinkingConfig: { thinkingLevel: "low" } },
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

function isValidForLang(text, lang) {
  const t = (text || "").trim();
  if (!t) return false;
  if (lang === "en") return true;

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

function finalizeTeaser(text) {
  let t = (text || "").trim();
  t = t.replace(/\**\s*(TEASER|FULL|Format)\s*:?\s*\**/gi, "").trim();
  t = t.replace(/^[`*\-\s]+/, "").replace(/[`*\s]+$/, "").trim();
  if (!t) return "...";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  t = t.replace(/[.…]+\s*$/, "").trim();
  return t + "...";
}

const YOUTUBE_SIGN_ORDER = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

/**
 * Дневен YouTube/TikTok скрипт за Lumaris — всичките 12 знака в ЕДНО видео
 * (~4-6 мин, СТАРИЯТ Phase 1 формат от youtube-strategiya.md). ОСТАВЕН
 * непокътнат за референция/евентуален бъдещ дългоформатен спин-off, но
 * НЕ Е активно ползван от 06.09.2026 насам — виж generateYoutubeShortScript
 * по-долу за текущата (per-sign Shorts) архитектура, огледална на
 * statevpp/proof-in-numbers.
 */
async function generateYoutubeScript({ date, signsData }) {
  if (!Array.isArray(signsData) || signsData.length !== 12) {
    throw new Error("generateYoutubeScript очаква signsData с точно 12 елемента");
  }

  const transitsBlock = signsData.map(({ sign, transitSummary }) => `${sign}: ${transitSummary}`).join("\n");
  const signLabels = YOUTUBE_SIGN_ORDER.map((s) => `${s.toUpperCase()}: [2-3 spoken sentences for ${s}, specific to its transit below, practical and quotable]`).join("\n");

  const userPrompt = `Write today's (${date}) daily horoscope video script for all 12 zodiac signs, based on these real transits:
${transitsBlock}

Return ONLY the following, no markdown, no extra commentary, in EXACTLY this format with these exact labels, one per line, nothing before TITLE and nothing after DESCRIPTION:

TITLE: [a YouTube title under 60 characters, the strongest hook or keyword near the front — e.g. what's most dramatic astrologically today. Prefer concrete specifics (a planet name, a sign, "retrograde") over vague words like "energy" or "vibes" — specifics outperform vagueness in search and in the thumbnail/title pairing.]
THUMBNAIL: [3-4 words max, ALL CAPS, punchy, what would go on the video thumbnail — must work standing completely alone with no other context, and must not just repeat the title verbatim]
INTRO: [a cold open hook, 1-2 spoken sentences that echo the title's promise — do not say "welcome back" or any generic channel intro, jump straight into what's happening in the sky today]
${signLabels}
OUTRO: [a short spoken outro, 2-3 sentences, that invites viewers to get their own personalized reading at dream-astro.com and to subscribe for tomorrow's rundown]
DESCRIPTION: [a complete, publish-ready YouTube description, 120-200 words, plain text, no markdown, no headers. Structure: (1) First 1-2 sentences are the strongest hook, written to stand alone — this is the only part visible before the viewer clicks "more", so it must not depend on anything after it, and should not just repeat the title word-for-word. (2) Then 2-4 sentences expanding on today's most notable transit and what it practically means for the signs it touches most. (3) Then a clear, natural call-to-action line pointing to https://dream-astro.com for a personalized reading. (4) Then a short line inviting a subscribe for tomorrow's rundown. (5) On its own final line, 6-8 relevant hashtags, mixing broad discovery tags (#horoscope #astrology #zodiac #dailyhoroscope) with 2-3 tags specific to today's actual transit (e.g. #mercuryretrograde, #cancerseason, #fullmoon — only ones that are actually true today). Sound like a knowledgeable person wrote it, not a template — vary the phrasing from a generic "daily horoscope for all 12 signs" line every day.]`;

  const raw = await generateReading({ userPrompt, maxTokens: 3000, systemPersona: LUMARIS_PERSONA });

  const titleMatch = raw.match(/TITLE:?\s*([\s\S]*?)\n+THUMBNAIL:?/i);
  const thumbMatch = raw.match(/THUMBNAIL:?\s*([\s\S]*?)\n+INTRO:?/i);
  const introMatch = raw.match(new RegExp(`INTRO:?\\s*([\\s\\S]*?)\\n+${YOUTUBE_SIGN_ORDER[0].toUpperCase()}:?`, "i"));
  const outroMatch = raw.match(/OUTRO:?\s*([\s\S]*?)\n+DESCRIPTION:?/i);
  const descriptionMatch = raw.match(/DESCRIPTION:?\s*([\s\S]*)$/i);

  const signs = [];
  for (let i = 0; i < YOUTUBE_SIGN_ORDER.length; i++) {
    const sign = YOUTUBE_SIGN_ORDER[i];
    const nextLabel = i + 1 < YOUTUBE_SIGN_ORDER.length ? YOUTUBE_SIGN_ORDER[i + 1].toUpperCase() : "OUTRO";
    const re = new RegExp(`${sign.toUpperCase()}:?\\s*([\\s\\S]*?)\\n+${nextLabel}:?`, "i");
    const m = raw.match(re);
    if (m) signs.push({ sign, text: m[1].trim() });
  }

  if (!titleMatch || !thumbMatch || !introMatch || !outroMatch || !descriptionMatch || signs.length !== 12) {
    throw new Error(`generateYoutubeScript: неочакван формат от Gemini (намерени ${signs.length}/12 знака). Суров отговор: ${raw.slice(0, 500)}`);
  }

  return {
    title: titleMatch[1].trim(),
    thumbnailText: thumbMatch[1].trim(),
    intro: introMatch[1].trim(),
    signs,
    outro: outroMatch[1].trim(),
    description: descriptionMatch[1].trim(),
  };
}

/**
 * Единичен кратък (Shorts) скрипт за ЕДИН зодиакален знак — pivot от
 * 04-06.09.2026 (виж project memory "Проект 8" / Task3 Addendum): Lumaris
 * спира дневния 12-в-едно дълъг епизод (generateYoutubeScript по-горе,
 * оставен за референция) и минава на СЪЩАТА архитектура като сестринския
 * канал Proof in Numbers (statevpp/proof-in-numbers) — кратки,
 * самостоятелни клипове, всеки за ЕДИН знак, публикувани автоматично.
 *
 * Връща {title, thumbnailText, hook, narration, description} — нарочно
 * СЪЩАТА форма като Proof in Numbers' generate_script.py изход (hook +
 * narration + title + thumbnail_text + description), за да може
 * scripts/upload_youtube.js да остане структурно огледален между двата
 * repo-та (по-лесно за поддръжка, по-малко изненади при бъдещи промени в
 * единия да се пренасят в другия).
 */
async function generateYoutubeShortScript({ date, sign, transitSummary }) {
  const userPrompt = `Write a single, self-contained 30-45 second YouTube Shorts script for the zodiac sign ${sign}, for today (${date}), based on this real planetary transit: ${transitSummary}.

Return ONLY the following, no markdown, no extra commentary, in EXACTLY this format with these exact labels, one per line, nothing before TITLE and nothing after DESCRIPTION:

TITLE: [a YouTube title under 60 characters, ${sign} near the front, the single most specific/dramatic thing happening astrologically today for this sign — avoid vague words like "energy" or "vibes", prefer a concrete planet/aspect/outcome]
THUMBNAIL: [3-4 words max, ALL CAPS, punchy, must work standing completely alone with no other context, must not just repeat the title verbatim]
HOOK: [one punchy opening sentence, max 20 words, that names the sign and the single most surprising thing about today's transit for it — this plays first, it has to earn the next 30 seconds]
NARRATION: [the full spoken script for ${sign} INCLUDING the hook restated naturally as the opening line, 30-45 seconds when read aloud (roughly 80-110 words), plain sentences a 12-year-old would understand, written for the EAR not the eye, no markdown, no stage directions, ends with a natural one-line nudge toward a personalized reading without sounding like an ad]
DESCRIPTION: [2-3 sentences for the YouTube description, plain text, mentions the sign and today's transit by name, ends with a short mention that a personalized reading is available at dream-astro.com]`;

  const raw = await generateReading({ userPrompt, maxTokens: 900, systemPersona: LUMARIS_PERSONA });

  const titleMatch = raw.match(/TITLE:?\s*([\s\S]*?)\n+THUMBNAIL:?/i);
  const thumbMatch = raw.match(/THUMBNAIL:?\s*([\s\S]*?)\n+HOOK:?/i);
  const hookMatch = raw.match(/HOOK:?\s*([\s\S]*?)\n+NARRATION:?/i);
  const narrationMatch = raw.match(/NARRATION:?\s*([\s\S]*?)\n+DESCRIPTION:?/i);
  const descriptionMatch = raw.match(/DESCRIPTION:?\s*([\s\S]*)$/i);

  if (!titleMatch || !thumbMatch || !hookMatch || !narrationMatch || !descriptionMatch) {
    throw new Error(`generateYoutubeShortScript(${sign}): неочакван формат от Gemini. Суров отговор: ${raw.slice(0, 500)}`);
  }

  return {
    title: titleMatch[1].trim(),
    thumbnailText: thumbMatch[1].trim(),
    hook: hookMatch[1].trim(),
    narration: narrationMatch[1].trim(),
    description: descriptionMatch[1].trim(),
  };
}

/**
 * Дневен "hook" Shorts скрипт за Lumaris — ВТОРИ pivot (05-07.09.2026, виж
 * project memory "Проект 8"), замества per-sign generateYoutubeShortScript
 * по-горе (оставена непокътната за референция). По изрична молба на
 * собственика: ЕДНО видео на ден (не 4), 7 фиксирани теми — по една на
 * ден от седмицата (виж WEEKLY_THEMES в scripts/generate-daily-short.js) —
 * всяка от вида "3-те най-... днес", БЕЗ да се разкриват трите знака в
 * заглавие/thumbnail/hook (цялата идея е зрителят да не знае дали неговият
 * знак е сред трите, докато не изгледа/чуе разказа).
 *
 * Подборът на трите знака НЕ Е произволен и НЕ Е твърд алгоритъм в кода —
 * Gemini получава РЕАЛНИТЕ дневни транзити (transitSummary, същите данни,
 * ползвани навсякъде другаде в тази верига) и инструкция каква конкретна
 * астрологична логика (`theme.angle`) да приложи, за да подбере трите
 * знака — същия принцип като generateDailyHoroscope на сайта (реални
 * данни, синтезирани от модела, никога изцяло измислени от него).
 * normalizeSign() по-долу гарантира, че връщането съдържа само валидни,
 * различни знаци от YOUTUBE_SIGN_ORDER — "fail loud", ако не.
 */
async function generateWeeklyHookShortScript({ date, theme, transitSummary }) {
  const userPrompt = `Today is ${date}. Today's video theme is: "${theme.label}".
Based on these real planetary transits for today: ${transitSummary}

Your job: using real astrological reasoning (${theme.angle}), choose EXACTLY 3 zodiac signs that genuinely fit today's theme best given the transits above. Do not pick signs at random — ground each pick in something actually true about today's chart (an aspect, a sign placement, a retrograde). Then write a single self-contained 40-60 second YouTube Shorts script built around suspense: the title and hook name the CATEGORY (e.g. "the 3 luckiest signs today") but do NOT reveal which 3 signs made the list — that reveal happens only inside the narration, sign by sign, so a viewer who doesn't know if their sign is included has a reason to keep watching.

Return ONLY the following, no markdown, no extra commentary, in EXACTLY this format with these exact labels, one per line, nothing before TITLE and nothing after DESCRIPTION:

TITLE: [a YouTube title under 60 characters, built from "${theme.label}" but reworded naturally — must NOT name any of the 3 chosen signs, the whole point is viewers don't know if they're on the list]
THUMBNAIL: [3-4 words max, ALL CAPS, punchy, must NOT reveal any of the 3 signs, must work standing alone]
HOOK: [one punchy opening sentence, max 20 words, that states the category/theme and creates urgency to find out — must not reveal any of the 3 signs yet]
SIGN1: [the first zodiac sign name only, e.g. "Aries" — nothing else on this line]
REASON1: [1 spoken sentence, real-astrology-grounded reason this sign made today's list, referencing the actual transit above]
SIGN2: [the second zodiac sign name only]
REASON2: [1 spoken sentence, real-astrology-grounded reason this sign made today's list]
SIGN3: [the third zodiac sign name only]
REASON3: [1 spoken sentence, real-astrology-grounded reason this sign made today's list]
NARRATION: [the FULL spoken script, 40-60 seconds when read aloud (roughly 110-160 words): open with the HOOK restated naturally, then reveal and explain SIGN1/REASON1, SIGN2/REASON2, SIGN3/REASON3 in an engaging order (build suspense, e.g. save the most surprising for last), close with a natural one-line nudge toward a personalized reading at dream-astro.com without sounding like an ad. Plain sentences, written for the EAR not the eye, no markdown, no stage directions, no sign names in the very first sentence.]
DESCRIPTION: [a complete YouTube description, 60-100 words, plain text: restate the theme without naming the 3 signs in the first line (keep the curiosity for the video itself), then a short line inviting a personalized reading at https://dream-astro.com, then on its own final line 6-8 relevant hashtags mixing #horoscope #astrology #zodiac #dailyhoroscope with 2-3 specific to today's actual transit.]`;

  const raw = await generateReading({ userPrompt, maxTokens: 1200, systemPersona: LUMARIS_PERSONA });

  const field = (label, nextLabel) => raw.match(new RegExp(`${label}:?\\s*([\\s\\S]*?)\\n+${nextLabel}:?`, "i"));
  const titleMatch = field("TITLE", "THUMBNAIL");
  const thumbMatch = field("THUMBNAIL", "HOOK");
  const hookMatch = field("HOOK", "SIGN1");
  const sign1Match = field("SIGN1", "REASON1");
  const reason1Match = field("REASON1", "SIGN2");
  const sign2Match = field("SIGN2", "REASON2");
  const reason2Match = field("REASON2", "SIGN3");
  const sign3Match = field("SIGN3", "REASON3");
  const reason3Match = field("REASON3", "NARRATION");
  const narrationMatch = field("NARRATION", "DESCRIPTION");
  const descriptionMatch = raw.match(/DESCRIPTION:?\s*([\s\S]*)$/i);

  const allMatches = [titleMatch, thumbMatch, hookMatch, sign1Match, reason1Match, sign2Match, reason2Match, sign3Match, reason3Match, narrationMatch, descriptionMatch];
  if (allMatches.some((m) => !m)) {
    throw new Error(`generateWeeklyHookShortScript(${theme.key}): неочакван формат от Gemini. Суров отговор: ${raw.slice(0, 500)}`);
  }

  const normalizeSign = (signRaw) => {
    const clean = signRaw.trim().replace(/[^a-zA-Z]/g, "");
    const found = YOUTUBE_SIGN_ORDER.find((s) => s.toLowerCase() === clean.toLowerCase());
    if (!found) throw new Error(`generateWeeklyHookShortScript(${theme.key}): "${signRaw.trim()}" не е валиден зодиакален знак. Суров отговор: ${raw.slice(0, 500)}`);
    return found;
  };

  const signs = [
    { sign: normalizeSign(sign1Match[1]), reason: reason1Match[1].trim() },
    { sign: normalizeSign(sign2Match[1]), reason: reason2Match[1].trim() },
    { sign: normalizeSign(sign3Match[1]), reason: reason3Match[1].trim() },
  ];
  if (new Set(signs.map((s) => s.sign)).size !== 3) {
    throw new Error(`generateWeeklyHookShortScript(${theme.key}): Gemini избра дублиращи се знаци: ${signs.map((s) => s.sign).join(", ")}`);
  }

  return {
    title: titleMatch[1].trim(),
    thumbnailText: thumbMatch[1].trim(),
    hook: hookMatch[1].trim(),
    signs,
    narration: narrationMatch[1].trim(),
    description: descriptionMatch[1].trim(),
  };
}

module.exports = {
  generateReading,
  generateDailyHoroscope,
  generateYoutubeScript,
  generateYoutubeShortScript,
  generateWeeklyHookShortScript,
  YOUTUBE_SIGN_ORDER,
  SYSTEM_PERSONA,
  LUMARIS_PERSONA,
};
