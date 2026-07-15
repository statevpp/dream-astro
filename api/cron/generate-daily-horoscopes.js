/**
 * api/cron/generate-daily-horoscopes.js
 * Vercel Cron endpoint — пуска се веднъж дневно (виж vercel.json).
 * За всеки от 12-те знака: взима реални транзитни данни, генерира
 * teaser (публичен) + full (само за абонати) текст на BG/EN/ES, записва в DB.
 *
 * Защита: Vercel Cron праща header "Authorization: Bearer $CRON_SECRET" —
 * провери го за да не може произволен посетител да тригерне генерирането
 * (всяко извикване коства Gemini + astrology API кредити).
 */

const { getDailyTransits } = require("../_lib/astrology");
const { generateDailyHoroscope } = require("../_lib/gemini");
const { upsertHoroscope } = require("../_lib/db");

const SIGNS = ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"];
const LANGS = ["bg", "en", "es"];

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const today = new Date().toISOString().slice(0, 10);

  let transitData;
  try {
    transitData = await getDailyTransits(today);
  } catch (err) {
    console.error("Транзитни данни неуспешни:", err);
    return res.status(502).json({ error: "astrology API unavailable", detail: String(err) });
  }

  // 12 знака × 3 езика = 36 комбинации. Пуснати последователно (await в двоен for),
  // това взимаше >60 секунди общо и удряше Vercel function timeout-а (открито на
  // 2026-07-14 чрез get_runtime_logs — "Task timed out after 60 seconds", а не бъг
  // в самите Gemini/astrology извиквания). Транзитните данни са едни и същи за
  // всички знаци (fetch-нати веднъж по-горе), само Gemini текстът е per sign+lang —
  // затова тези 36 извиквания са напълно независими и могат да вървят паралелно.
  // Обработваме на партиди (BATCH_SIZE наведнъж), за да не удряме rate limit на
  // Gemini/astrology API-тата с всичките 36 едновременно.
  const jobs = [];
  for (const sign of SIGNS) {
    const transitSummary = summarizeTransitForSign(transitData, sign);
    for (const lang of LANGS) {
      jobs.push({ sign, lang, transitSummary });
    }
  }

  const BATCH_SIZE = 6;
  const results = [];
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batch = jobs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async ({ sign, lang, transitSummary }) => {
        const { teaser, full } = await generateDailyHoroscope({ signName: sign, transitSummary, lang });
        await upsertHoroscope({ date: today, sign, lang, teaser, full });
        return { sign, lang };
      })
    );
    batchResults.forEach((r, idx) => {
      const { sign, lang } = batch[idx];
      if (r.status === "fulfilled") {
        results.push({ sign, lang, ok: true });
      } else {
        console.error(`Грешка при ${sign}/${lang}:`, r.reason);
        results.push({ sign, lang, ok: false, error: String(r.reason) });
      }
    });
  }

  return res.status(200).json({ date: today, results });
};

/**
 * Извлича кратко, четимо резюме на транзитите за конкретен знак от суровия
 * astrology API отговор. Точната форма на transitData зависи от доставчика —
 * адаптирай според реалния JSON формат при интеграция.
 */
/**
 * transitData е масив от планети от /planets/tropical (виж _lib/astrology.js),
 * еднакъв за всичките 12 знака (реалните планетарни позиции днес не зависят от
 * знака) — самото persoаализиране по знак става от Gemini промпта (signName).
 * Форматира кратко, четимо резюме: "Слънце в Рак, Луна в Рак (ретрограден: не)...".
 */
function summarizeTransitForSign(transitData, sign) {
  if (!Array.isArray(transitData) || transitData.length === 0) {
    return `основни планетарни транзити на текущата дата`;
  }
  const NAME_BG = {
    Sun: "Слънце", Moon: "Луна", Mercury: "Меркурий", Venus: "Венера", Mars: "Марс",
    Jupiter: "Юпитер", Saturn: "Сатурн", Uranus: "Уран", Neptune: "Нептун", Pluto: "Плутон",
  };
  const SIGN_BG = {
    Aries: "Овен", Taurus: "Телец", Gemini: "Близнаци", Cancer: "Рак", Leo: "Лъв", Virgo: "Дева",
    Libra: "Везни", Scorpio: "Скорпион", Sagittarius: "Стрелец", Capricorn: "Козирог",
    Aquarius: "Водолей", Pisces: "Риби",
  };
  return transitData
    .filter((p) => NAME_BG[p.name])
    .map((p) => `${NAME_BG[p.name]} в ${SIGN_BG[p.sign] || p.sign}${p.isRetro === "true" || p.isRetro === true ? " (ретрограден)" : ""}`)
    .join(", ");
}
