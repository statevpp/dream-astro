/**
 * scripts/generate-daily-short.js
 * Lumaris — дневен ЕДИНИЧЕН Shorts pipeline стъпка (генерира скрипт + говор
 * + фон за ЕДИН зодиакален знак). Замества стария 12-в-едно дългоформатен
 * generate-youtube-episode.js (виж git history) — pivot решен на 04.09.2026
 * (виж project memory "Проект 8"): Lumaris трябва да е СЪЩАТА архитектура
 * като сестринския канал Proof in Numbers (statevpp/proof-in-numbers) —
 * малки, самостоятелни клипове, публикувани автоматично всеки ден, вместо
 * един дълъг ръчно-качван епизод.
 *
 * Матрица от 4 паралелни GitHub Actions job-а на ден (SIGN_SLOT=1..4, виж
 * .github/workflows/daily-shorts.yml) — всеки генерира ЕДИН клип за ЕДИН
 * знак. Ротацията по-долу гарантира, че за 3 последователни дни се покриват
 * и 12-те знака точно веднъж, без два slot-а в един и същи ден да съвпаднат.
 *
 * Употреба:
 *   GEMINI_API_KEY=... ASTROLOGY_API_USER_ID=... ASTROLOGY_API_KEY=... \
 *   SIGN_SLOT=1 node scripts/generate-daily-short.js [YYYY-MM-DD]
 *
 * Резултат (в repo корена, същите пътища се кешират от workflow-а по дата+
 * slot — виж бележката в daily-shorts.yml за защо кеша НЕ пази между
 * различни дни, само между retry-та в рамките на СЪЩИЯ ден, огледално на
 * proof-in-numbers/.github/workflows/daily-short.yml):
 *   data/script.json   — {sign, title, thumbnailText, hook, narration, description}
 *   audio/short.wav
 *   bg/short.png
 */

const fs = require("fs");
const path = require("path");

const { getDailyTransits } = require("../api/_lib/astrology");
const { generateYoutubeShortScript, YOUTUBE_SIGN_ORDER } = require("../api/_lib/gemini");
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

// Фиксирана начална дата на ротацията (денят, в който тръгна тази
// архитектура) — НЕ днешна дата, за да е ротацията стабилна и предвидима
// занапред, вместо да зависи от кога точно се пуска скриптът всеки ден.
const ROTATION_EPOCH = Date.UTC(2026, 8, 6); // 2026-09-06 (месеците са 0-based в Date.UTC)
const SLOTS_PER_DAY = 4;

function pickSign(dateISO, slot) {
  const dayMs = Date.UTC(...dateISO.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const daysSinceEpoch = Math.floor((dayMs - ROTATION_EPOCH) / 86400000);
  // Не блокираме на отрицателни/бъдещи дати — modulo тук винаги трябва да е
  // неотрицателен, JS % може да върне отрицателно за отрицателен ляв операнд.
  const rawIndex = daysSinceEpoch * SLOTS_PER_DAY + (slot - 1);
  const index = ((rawIndex % YOUTUBE_SIGN_ORDER.length) + YOUTUBE_SIGN_ORDER.length) % YOUTUBE_SIGN_ORDER.length;
  return YOUTUBE_SIGN_ORDER[index];
}

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const slot = Number(process.env.SIGN_SLOT);
  if (!slot || slot < 1 || slot > SLOTS_PER_DAY) {
    throw new Error(`SIGN_SLOT трябва да е число 1-${SLOTS_PER_DAY} (получено: "${process.env.SIGN_SLOT}")`);
  }

  const dataDir = path.join(__dirname, "..", "data");
  const audioDir = path.join(__dirname, "..", "audio");
  const bgDir = path.join(__dirname, "..", "bg");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(bgDir, { recursive: true });

  const scriptPath = path.join(dataDir, "script.json");

  // Ephemeral GitHub Actions runner-и — на РЕТРАЙ СЪЩИЯ ден (кешираният
  // data/audio/bg от actions/cache@v4, виж workflow-а) този файл вече
  // съществува → пропускаме пре-генерирането (същия принцип, доказан вече в
  // proof-in-numbers/scripts/fetch_stat.py и generate_script.py).
  if (fs.existsSync(scriptPath)) {
    console.log(`[generate-daily-short] ${scriptPath} вече съществува (кеш от по-раншен опит днес) — пропускам генерирането.`);
    return;
  }

  const sign = pickSign(date, slot);
  console.log(`[generate-daily-short] Дата: ${date}, SIGN_SLOT: ${slot} → знак: ${sign}`);

  console.log("[1/4] Взимам реални планетарни транзити...");
  const transitData = await getDailyTransits(date);
  const transitSummary = summarizeTransitsEnglish(transitData);
  console.log(`   ${transitSummary}`);

  console.log(`[2/4] Генерирам скрипта за ${sign} (Gemini, Lumaris персона)...`);
  const { title, thumbnailText, hook, narration, description } = await generateYoutubeShortScript({
    date,
    sign,
    transitSummary,
  });
  console.log(`   TITLE: ${title}`);
  console.log(`   THUMBNAIL: ${thumbnailText}`);

  fs.writeFileSync(
    scriptPath,
    JSON.stringify({ date, slot, sign, transitSummary, title, thumbnailText, hook, narration, description }, null, 2),
    "utf8"
  );

  console.log("[3/4] Генерирам говор (Gemini TTS)...");
  const wav = await generateSpeech({ text: narration });
  fs.writeFileSync(path.join(audioDir, "short.wav"), wav);
  console.log(`   ${wav.length} bytes`);

  console.log("[4/4] Генерирам фонов визуал (Nano Banana 2)...");
  const scenePrompt = `an abstract cosmic scene evoking the zodiac sign ${sign} (its symbol/energy suggested subtly through color and shape, NOT a literal illustration of the animal/figure), no text, no people`;
  const { buffer } = await generateSocialImage({ prompt: scenePrompt });
  fs.writeFileSync(path.join(bgDir, "short.png"), buffer);
  console.log(`   ${buffer.length} bytes`);

  console.log("\n=== Готово: скрипт + говор + фон генерирани, следва assemble-short.sh ===");
}

main().catch((err) => {
  console.error("ГРЕШКА в generate-daily-short.js:", err);
  process.exit(1);
});
