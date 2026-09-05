/**
 * scripts/generate-daily-short.js
 * Lumaris — дневен Shorts pipeline, ВТОРИ pivot (07.09.2026, виж project
 * memory "Проект 8"): ЕДНО видео на ден (не 4 паралелни slot-а както в
 * първата версия от 06.09.2026), 7 фиксирани теми — по една на ден от
 * седмицата — по изрична молба на собственика: "по един шортс всеки ден,
 * 7 различни теми... 3-те най-късметлийски зодии днес/понеделник, 3-те
 * зодии, които трябва да внимават/вторник...".
 *
 * Всяка тема е закотвена в РЕАЛНА, различна астрологична логика (виж
 * `angle` във WEEKLY_THEMES по-долу) — Gemini получава реалните дневни
 * транзити и тази инструкция и САМО ТОГАВА избира кои 3 знака пасват най-
 * добре (виж generateWeeklyHookShortScript в api/_lib/gemini.js за пълния
 * промпт/парсинг) — знаците НЕ се разкриват в заглавие/thumbnail/hook,
 * само в разказа, за да остане "проверка дали моят знак е сред трите"
 * закачката работеща.
 *
 * Употреба:
 *   GEMINI_API_KEY=... ASTROLOGY_API_USER_ID=... ASTROLOGY_API_KEY=... \
 *   node scripts/generate-daily-short.js [YYYY-MM-DD]
 *
 * Резултат (в repo корена, кешира се от workflow-а по дата — виж бележката
 * в daily-shorts.yml защо кешът пази само между retry-та в РАМКИТЕ на
 * същия ден, не между различни дни):
 *   data/script.json — {date, theme, themeLabel, signs:[{sign,reason}], title, thumbnailText, hook, narration, description}
 *   audio/short.wav
 *   bg/short.png
 */

const fs = require("fs");
const path = require("path");

const { getDailyTransits } = require("../api/_lib/astrology");
const { generateWeeklyHookShortScript } = require("../api/_lib/gemini");
const { generateSpeech } = require("../api/_lib/tts");
const { generateSocialImage } = require("../api/_lib/content-gen");

const PLANET_NAMES_EN = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

function summarizeTransitsEnglish(transitData) {
  if (!Array.isArray(transitData) || transitData.length === 0) {
    return "the current major planetary transits";
  }
  return transitData
    .filter((p) => PLANET_NAMES_EN.includes(p.name))
    .map((p) => `${p.name} in ${p.sign}${p.isRetro === "true" || p.isRetro === true ? " (retrograde)" : ""}`)
    .join(", ");
}

/**
 * 7 фиксирани дневни теми, по една на ден от седмицата (JS Date#getUTCDay():
 * 0=неделя...6=събота). `angle` влиза директно в Gemini промпта като
 * инструкция как да подбере трите знака от реалните транзити на деня —
 * умишлено различна конкретна астрологична логика за всяка тема (не само
 * различен етикет), за да си остане честно "реални данни, различен ъгъл",
 * не произволно генериран списък.
 */
const WEEKLY_THEMES = [
  {
    day: 0, // Sunday
    key: "week-ahead",
    label: "The 3 Signs Walking Into The Strongest Week",
    angle:
      "Pick the 3 signs whose outlook is turning most favorable right as a new week begins — a slower or outer-planet aspect stabilizing, or a faster planet moving into a genuinely helpful position for them — signs entering a real multi-day stretch of momentum, not just a good single day.",
  },
  {
    day: 1, // Monday
    key: "luckiest",
    label: "The 3 Luckiest Signs Today",
    angle:
      "Pick the 3 signs most favored by today's easiest aspects (trines/sextiles) or by a benefic planet (Jupiter/Venus) well-placed for them — specific, real astrological luck, not generic positivity.",
  },
  {
    day: 2, // Tuesday
    key: "watch-out",
    label: "3 Signs That Need To Watch Out Today",
    angle:
      "Pick the 3 signs facing the toughest aspects today (squares/oppositions, a hard conjunction, a retrograde affecting their ruler) — genuine caution, framed constructively (what to watch for and how to handle it well), never fear-mongering.",
  },
  {
    day: 3, // Wednesday
    key: "big-conversation",
    label: "3 Signs About To Have A Big Conversation",
    angle:
      "Pick the 3 signs most touched by Mercury's position or aspects today — communication, decisions, contracts, a text or call that actually matters.",
  },
  {
    day: 4, // Thursday
    key: "money-moves",
    label: "3 Signs Whose Money Is About To Move",
    angle:
      "Pick the 3 signs most touched by Jupiter or by aspects relevant to finances today — an opportunity, a raise, an unexpected expense, a good window for a financial decision.",
  },
  {
    day: 5, // Friday
    key: "love-surprise",
    label: "3 Signs Getting A Love Surprise This Weekend",
    angle:
      "Pick the 3 signs most touched by Venus's position or aspects today — romance, a reconnection, a new spark, a relationship conversation — framed toward the coming weekend.",
  },
  {
    day: 6, // Saturday
    key: "slow-down",
    label: "3 Signs Who Should Slow Down Today",
    angle:
      "Pick the 3 signs most touched by Saturn or by a retrograde planet today — burnout risk, overcommitment, a real need for rest or boundaries — framed as caring advice, never punishment.",
  },
];

function themeForDate(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return WEEKLY_THEMES[d.getUTCDay()];
}

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);

  const dataDir = path.join(__dirname, "..", "data");
  const audioDir = path.join(__dirname, "..", "audio");
  const bgDir = path.join(__dirname, "..", "bg");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(bgDir, { recursive: true });

  const scriptPath = path.join(dataDir, "script.json");

  // Ephemeral GitHub Actions runner-и — на РЕТРАЙ СЪЩИЯ ден (кешираният
  // data/audio/bg от actions/cache@v4, виж workflow-а) този файл вече
  // съществува → пропускаме пре-генерирането.
  if (fs.existsSync(scriptPath)) {
    console.log(`[generate-daily-short] ${scriptPath} вече съществува (кеш от по-раншен опит днес) — пропускам генерирането.`);
    return;
  }

  const theme = themeForDate(date);
  console.log(`[generate-daily-short] Дата: ${date} → тема на деня: "${theme.label}" (${theme.key})`);

  console.log("[1/4] Взимам реални планетарни транзити...");
  const transitData = await getDailyTransits(date);
  const transitSummary = summarizeTransitsEnglish(transitData);
  console.log(`   ${transitSummary}`);

  console.log("[2/4] Генерирам скрипта (Gemini избира 3-те знака от РЕАЛНИТЕ транзити + Lumaris персона)...");
  const { title, thumbnailText, hook, signs, narration, description } = await generateWeeklyHookShortScript({
    date,
    theme,
    transitSummary,
  });
  console.log(`   TITLE: ${title}`);
  console.log(`   THUMBNAIL: ${thumbnailText}`);
  console.log(`   Избрани знаци (не се разкриват в заглавие/thumbnail — само в narration): ${signs.map((s) => s.sign).join(", ")}`);

  fs.writeFileSync(
    scriptPath,
    JSON.stringify(
      { date, theme: theme.key, themeLabel: theme.label, transitSummary, title, thumbnailText, hook, signs, narration, description },
      null,
      2
    ),
    "utf8"
  );

  console.log("[3/4] Генерирам говор (Gemini TTS)...");
  const wav = await generateSpeech({ text: narration });
  fs.writeFileSync(path.join(audioDir, "short.wav"), wav);
  console.log(`   ${wav.length} bytes`);

  console.log("[4/4] Генерирам фонов визуал (Nano Banana 2)...");
  // Нарочно БЕЗ конкретен зодиакален символ (за разлика от първата версия,
  // 06.09.2026) — това видео е за 3 знака, разкрити само в говора, затова
  // фонът е неутрален "мистерия/разкритие", не насочва към нито един знак
  // предварително.
  const scenePrompt =
    "an abstract cosmic scene evoking mystery and anticipation — soft glowing constellations, gentle light suggesting an answer about to be revealed, no text, no people, no specific zodiac symbol or animal (this video covers multiple signs, none should be visually implied)";
  const { buffer } = await generateSocialImage({ prompt: scenePrompt });
  fs.writeFileSync(path.join(bgDir, "short.png"), buffer);
  console.log(`   ${buffer.length} bytes`);

  console.log("\n=== Готово: скрипт + говор + фон генерирани, следва assemble-short.sh ===");
}

main().catch((err) => {
  console.error("ГРЕШКА в generate-daily-short.js:", err);
  process.exit(1);
});
