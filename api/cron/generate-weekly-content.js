/**
 * api/cron/generate-weekly-content.js
 * Vercel Cron — веднъж седмично (виж vercel.json), генерира AI визуали (Nano
 * Banana 2) + стартира AI видео клипове (Veo 3.1) за социалния пайплайн.
 *
 * Умишлено ИЗОЛИРАН от generate-daily-horoscopes.js / плащанията — това е
 * маркетингов, не платежно-критичен пайплайн. Ако нещо тук гръмне, абонатите
 * не усещат нищо; хороскоп cron-ът и Stripe webhook-овете не зависят от този
 * файл по никакъв начин.
 *
 * Флоу:
 *  1. Ротира през 12-те знака по ISO седмица, за да не се повтарят темите.
 *  2. За 4 избрани знака: генерира кратък BG цитат (същия Gemini текст модел,
 *     вече хардънат в _lib/gemini.js) -> подава го в Nano Banana 2 за
 *     квадратна quote-карта -> качва в Blob -> запис в content_jobs (ready).
 *  3. За 2 атмосферни видео теми: САМО стартира Veo операцията (асинхронно,
 *     не чака) -> запис в content_jobs (processing, operation_name). Реалното
 *     сваляне/финализиране е в poll-weekly-content.js (отделен cron), за да
 *     не удряме 60-сек maxDuration лимита (виж историята с timeout-а на
 *     хороскоп cron-а по-горе в проекта).
 *
 * Защита: same Bearer $CRON_SECRET pattern като generate-daily-horoscopes.js.
 * Ръчен тест: curl -X POST https://<домейн>/api/cron/generate-weekly-content \
 *             -H "Authorization: Bearer $CRON_SECRET"
 */

const { generateReading } = require("../_lib/gemini");
const { generateSocialImage, startVideoGeneration } = require("../_lib/content-gen");
const { uploadContentBuffer } = require("../_lib/blob");
const { createContentJob, markContentJobProcessing, markContentJobReady, markContentJobFailed } = require("../_lib/db");

const SIGNS = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"];
const SIGN_BG = {
  aries: "Овен", taurus: "Телец", gemini: "Близнаци", cancer: "Рак", leo: "Лъв", virgo: "Дева",
  libra: "Везни", scorpio: "Скорпион", sagittarius: "Стрелец", capricorn: "Козирог",
  aquarius: "Водолей", pisces: "Риби",
};

const IMAGES_PER_WEEK = 4;
const VIDEO_THEMES = [
  "бавно въртяща се арматилна сфера (astrolabe) от злато и стъкло, обградена от малки звезди",
  "мека мъглявина от лилави и златни частици, които бавно се движат като течен звезден прах",
];

function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/** Избира IMAGES_PER_WEEK знака, ротирайки през всичките 12 по ISO седмица, без повторение седмица-за-седмица. */
function pickSignsForWeek(weekNum) {
  const start = (weekNum * IMAGES_PER_WEEK) % SIGNS.length;
  const picked = [];
  for (let i = 0; i < IMAGES_PER_WEEK; i++) picked.push(SIGNS[(start + i) % SIGNS.length]);
  return picked;
}

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const today = new Date();
  const weekOf = today.toISOString().slice(0, 10);
  const weekNum = isoWeekNumber(today);
  const signsThisWeek = pickSignsForWeek(weekNum);

  const results = { images: [], videos: [] };

  // --- 1) Изображения: цитат (текст) -> Nano Banana 2 -> Blob (последователно,
  // за да не удряме image API rate limit-а с твърде много паралелни заявки —
  // 4 изображения х (1 текст + 1 image call) е напълно безопасно за 60s.
  for (const sign of signsThisWeek) {
    const signNameBg = SIGN_BG[sign];
    let job;
    try {
      job = await createContentJob({ weekOf, kind: "image", label: `${sign}-quote`, prompt: null });
      const quotePrompt = `Напиши ЕДНО кратко, вдъхновяващо, поетично изречение (максимум 12 думи) на български за зодия ${signNameBg}, в стила на мъдър астролог. Без обяснения, само самото изречение, без кавички.`;
      const quote = await generateReading({ userPrompt: quotePrompt, maxTokens: 60 });
      const imagePrompt = `Zodiac spotlight карта за "${signNameBg}" (${sign}). Включи символа/съзвездието на знака като елегантен, тънък линеен елемент. Добави следния текст четливо в картинката, на български, с елегантен шрифт: "${quote.replace(/"/g, "")}"`;

      const { buffer, mimeType } = await generateSocialImage({ prompt: imagePrompt });
      const ext = mimeType.includes("png") ? "png" : "jpg";
      const url = await uploadContentBuffer(`weekly-content/${weekOf}/${sign}-quote.${ext}`, buffer, mimeType);
      await markContentJobReady(job.id, url);
      results.images.push({ sign, status: "ready", url });
    } catch (err) {
      console.error(`[weekly-content] изображение за ${sign} неуспешно:`, err);
      if (job) await markContentJobFailed(job.id, String(err));
      results.images.push({ sign, status: "failed", error: String(err) });
    }
  }

  // --- 2) Видео: само СТАРТИРАМЕ операциите, не чакаме (виж бележката по-горе).
  for (const theme of VIDEO_THEMES) {
    let job;
    try {
      job = await createContentJob({ weekOf, kind: "video", label: theme.slice(0, 40), prompt: theme });
      const operationName = await startVideoGeneration({ prompt: theme });
      await markContentJobProcessing(job.id, operationName);
      results.videos.push({ theme, status: "processing", operationName });
    } catch (err) {
      console.error(`[weekly-content] видео старт неуспешен за "${theme}":`, err);
      if (job) await markContentJobFailed(job.id, String(err));
      results.videos.push({ theme, status: "failed", error: String(err) });
    }
  }

  return res.status(200).json({ weekOf, weekNum, results });
};
