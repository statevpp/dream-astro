/**
 * scripts/generate-youtube-episode.js
 * Пълен, end-to-end orchestrator за дневния Lumaris YouTube/TikTok епизод.
 *
 * ЗАЩО ТОВА НЕ Е Vercel CRON (за разлика от generate-daily-horoscopes.js):
 * тръгва от реалната production поука в тоя проект — cron-ът за хороскопите
 * УДРЯ 60-секундния Vercel timeout само с 36 бързи текстови Gemini извиквания
 * (виж историята в _lib/gemini.js). Този pipeline е много по-тежък: 1 текст
 * извикване + 14 TTS извиквания + 14 image извиквания + локално ffmpeg
 * рендиране (реално CPU-bound, отнема истинско време, не просто мрежово
 * чакане) — категорично не се събира в никакъв Vercel function timeout, а и
 * Vercel serverless рънтаймът няма ffmpeg бинар по подразбиране. Затова този
 * скрипт е обикновен Node процес, предназначен да се пуска ИЛИ ръчно (за POC
 * епизода, задача #42), ИЛИ през GitHub Actions (.github/workflows/
 * youtube-daily.yml) — Ubuntu runner-ите на GH Actions имат ffmpeg
 * предварително инсталиран и лимит от часове, не секунди.
 *
 * НЕ ПУБЛИКУВА НИЩО автоматично — генерира готов .mp4 + title/thumbnail
 * текст локално, качването в YouTube/TikTok си остава ръчно (потвърдено:
 * няма upload API конектор за нито едната платформа, виж youtube-strategiya.md).
 *
 * Употреба:
 *   GEMINI_API_KEY=... ASTROLOGY_API_USER_ID=... ASTROLOGY_API_KEY=... \
 *     node scripts/generate-youtube-episode.js [YYYY-MM-DD]
 *
 * Резултат в out/lumaris/<date>/:
 *   episode-landscape.mp4  (1920x1080, за YouTube)
 *   episode-portrait.mp4   (1080x1920, за TikTok/YouTube Shorts)
 *   title.txt, thumbnail.txt, description.txt
 *   audio/*.wav, bg/*.png  (междинни файлове — оставени за преглед/дебъг)
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { getDailyTransits } = require("../api/_lib/astrology");
const { generateYoutubeScript, YOUTUBE_SIGN_ORDER } = require("../api/_lib/gemini");
const { generateSpeech } = require("../api/_lib/tts");
const { generateSocialImage } = require("../api/_lib/content-gen");

// English планета/знак имена — ОТДЕЛНО от BG мапинга в
// generate-daily-horoscopes.js (виж бележката в gemini.js
// generateYoutubeScript за причината: два различни изхода, два отделни
// мапинга, за да не се преплитат случайно при бъдещи промени).
const PLANET_NAMES_EN = ["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto"];

function summarizeTransitsEnglish(transitData) {
  if (!Array.isArray(transitData) || transitData.length === 0) {
    return "the current major planetary transits";
  }
  return transitData
    .filter((p) => PLANET_NAMES_EN.includes(p.name))
    .map((p) => `${p.name} in ${p.sign}${p.isRetro === "true" || p.isRetro === true ? " (retrograde)" : ""}`)
    .join(", ");
}

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const outDir = path.join(__dirname, "..", "out", "lumaris", date);
  const audioDir = path.join(outDir, "audio");
  const bgDir = path.join(outDir, "bg");
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(bgDir, { recursive: true });

  console.log(`[1/5] Взимам реални планетарни транзити за ${date}...`);
  const transitData = await getDailyTransits(date);
  // Транзитите са едни и същи за всичките 12 знака (виж бележката в
  // astrology.js) — само едно резюме за целия ден, персонализирането по
  // знак става от самия Gemini промпт (сравни с summarizeTransitForSign в
  // generate-daily-horoscopes.js, което прави абсолютно същото за сайта).
  const transitSummary = summarizeTransitsEnglish(transitData);
  const signsData = YOUTUBE_SIGN_ORDER.map((sign) => ({ sign, transitSummary }));

  console.log("[2/5] Генерирам скрипта (Gemini, Lumaris персона)...");
  const { title, thumbnailText, intro, signs, outro } = await generateYoutubeScript({ date, signsData });
  console.log(`      TITLE: ${title}`);
  console.log(`      THUMBNAIL: ${thumbnailText}`);

  fs.writeFileSync(path.join(outDir, "title.txt"), title, "utf8");
  fs.writeFileSync(path.join(outDir, "thumbnail.txt"), thumbnailText, "utf8");
  fs.writeFileSync(
    path.join(outDir, "description.txt"),
    `${title}\n\nYour daily horoscope for all 12 zodiac signs.\n\nWant a personalized reading? Visit https://dream-astro.com\n\n#horoscope #astrology #zodiac #dailyhoroscope`,
    "utf8"
  );

  // Сегменти в реда, в който assemble-youtube-video.sh ги очаква:
  // 00=intro, 01-12=12-те знака, 13=outro.
  const segments = [
    { idx: "00", key: "intro", text: intro },
    ...signs.map((s, i) => ({ idx: String(i + 1).padStart(2, "0"), key: s.sign.toLowerCase(), text: s.text })),
    { idx: "13", key: "outro", text: outro },
  ];

  console.log(`[3/5] Генерирам ${segments.length} говорни сегмента (Gemini TTS)...`);
  for (const seg of segments) {
    const wavPath = path.join(audioDir, `${seg.idx}-${seg.key}.wav`);
    if (fs.existsSync(wavPath)) {
      console.log(`      ${seg.idx}-${seg.key}: вече съществува, пропускам (изтрий файла ако искаш пре-генериране)`);
      continue;
    }
    const wav = await generateSpeech({ text: seg.text });
    fs.writeFileSync(wavPath, wav);
    console.log(`      ${seg.idx}-${seg.key}: ${wav.length} bytes`);
  }

  console.log(`[4/5] Генерирам ${segments.length} фонови визуала (Nano Banana 2)...`);
  for (const seg of segments) {
    const pngPath = path.join(bgDir, `${seg.idx}-${seg.key}.png`);
    if (fs.existsSync(pngPath)) {
      console.log(`      ${seg.idx}-${seg.key}: вече съществува, пропускам`);
      continue;
    }
    const scenePrompt =
      seg.key === "intro"
        ? "a wide cosmic establishing shot, swirling nebula, no text, no people"
        : seg.key === "outro"
        ? "a warm inviting cosmic scene suggesting a personal reading awaits, no text, no people"
        : `an abstract cosmic scene evoking the zodiac sign ${seg.key} (its symbol/energy suggested subtly through color and shape, NOT a literal illustration of the animal/figure), no text, no people`;
    // generateSocialImage-ът е писан за BG промпт стил на сайта (виж
    // content-gen.js) — тук подаваме английски описания директно, функцията
    // просто ги вгражда в BRAND_STYLE обвивката, езикът на входния prompt
    // не пречи на Gemini image модела.
    const { buffer } = await generateSocialImage({ prompt: scenePrompt });
    fs.writeFileSync(pngPath, buffer);
    console.log(`      ${seg.idx}-${seg.key}: ${buffer.length} bytes`);
  }

  console.log("[5/5] Монтирам финалното видео (ffmpeg)...");
  const assembleScript = path.join(__dirname, "assemble-youtube-video.sh");
  const landscapeOut = path.join(outDir, "episode-landscape.mp4");
  const portraitOut = path.join(outDir, "episode-portrait.mp4");

  execFileSync(assembleScript, [outDir, landscapeOut], { stdio: "inherit" });
  execFileSync(assembleScript, [outDir, portraitOut, "--portrait"], { stdio: "inherit" });

  console.log("\n=== ГОТОВО (изисква ръчна проверка преди качване) ===");
  console.log(`Landscape (YouTube): ${landscapeOut}`);
  console.log(`Portrait (TikTok/Shorts): ${portraitOut}`);
  console.log(`Title: ${title}`);
  console.log(`Thumbnail text: ${thumbnailText}`);
  console.log("\nСЛЕДВАЩА СТЪПКА: изгледай и двата видео файла ръчно, провери звук/визуал/timing,");
  console.log("после качи ръчно в YouTube Studio и TikTok (няма API конектор за автоматично публикуване).");
}

main().catch((err) => {
  console.error("ГРЕШКА в generate-youtube-episode.js:", err);
  process.exit(1);
});

