/**
 * api/cron/poll-weekly-content.js
 * Vercel Cron — пуска се веднъж дневно (08:00, виж vercel.json), проверява
 * чакащите Veo видео операции от generate-weekly-content.js и качва готовите
 * видеа в Blob storage. Отделен от генериращия cron умишлено — Veo
 * генерирането отнема от секунди до няколко минути и не е гарантирано бързо,
 * затова не може да живее в една единствена 60-сек Vercel функция.
 *
 * ВАЖНО: честотата "веднъж дневно" НЕ Е избор заради удобство — Vercel Hobby
 * план technically отхвърля деплой на cron с по-честа честота от once/day
 * (проверено 16.07.2026, виж https://vercel.com/docs/cron-jobs/usage-and-pricing).
 * Ако проектът мине на Vercel Pro план, може да се смени на "стъпка от 15
 * минути" cron израз за по-бързо финализиране на видеата — но НЕ преди да е потвърдено, че планът
 * позволява по-честа честота, иначе целият деплой (не само този cron) може да
 * гръмне при push. Веднъж дневно е напълно достатъчно за седмичен пайплайн —
 * недовършените jobs просто изчакват следващото пускане, статусът остава
 * 'processing' междувременно, нищо не се губи.
 *
 * Ръчен тест: curl -X POST https://<домейн>/api/cron/poll-weekly-content \
 *             -H "Authorization: Bearer $CRON_SECRET"
 */

const { checkVideoOperation, downloadVideo } = require("../_lib/content-gen");
const { uploadContentBuffer } = require("../_lib/blob");
const { getProcessingContentJobs, markContentJobReady, markContentJobFailed } = require("../_lib/db");

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const pending = await getProcessingContentJobs();
  const results = [];

  for (const job of pending) {
    try {
      const status = await checkVideoOperation(job.operation_name);
      if (!status.done) {
        results.push({ id: job.id, status: "still-processing" });
        continue;
      }
      if (status.error) {
        await markContentJobFailed(job.id, status.error);
        results.push({ id: job.id, status: "failed", error: status.error });
        continue;
      }
      const buffer = await downloadVideo(status.videoUri);
      const today = new Date().toISOString().slice(0, 10);
      const url = await uploadContentBuffer(`weekly-content/${today}/video-${job.id}.mp4`, buffer, "video/mp4");
      await markContentJobReady(job.id, url);
      results.push({ id: job.id, status: "ready", url });
    } catch (err) {
      console.error(`[poll-weekly-content] job ${job.id} грешка:`, err);
      await markContentJobFailed(job.id, String(err));
      results.push({ id: job.id, status: "failed", error: String(err) });
    }
  }

  return res.status(200).json({ checked: pending.length, results });
};
