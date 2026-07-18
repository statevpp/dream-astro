/**
 * _lib/content-gen.js
 * Генериране на визуали (Nano Banana 2) и видео (Veo 3.1) за седмичния социален
 * пайплайн, през същия GEMINI_API_KEY, който вече ползва _lib/gemini.js за
 * текстовете (виж api/_lib/gemini.js — един и същ ключ покрива текст+
 * изображения+видео, няма нужда от отделен billing setup).
 *
 * Марков стил (взет директно от css/style.css, за визуална консистентност
 * между сайта и социалните визуали): дълбок космически тъмносин/лилав фон
 * (#0b0a1a/#141228), лавандулов акцент (#c9a4ff), златен акцент (#ffd580),
 * светъл текст (#f2eefc). Винаги описваме тази палитра изрично в промпта,
 * вместо да разчитаме модела да познае "astrology aesthetic" сам.
 *
 * 2026-07-18: текстът в картинките е сменен от български на английски (виж
 * бележката в generate-weekly-content.js) — всички социални публикации
 * (FB/TikTok) вече излизат само на английски, независимо от езика на сайта.
 *
 * ВАЖНО за надеждност (виж бележките в _lib/gemini.js по-горе в проекта за
 * реални production инциденти с retry цикли и timeout): видео генерирането е
 * АСИНХРОННО (predictLongRunning + poll) и НЕ трябва да се изчаква вътре в
 * една Vercel функция — submit-ваме операцията тук и я поллваме от отделен
 * cron (api/cron/poll-weekly-content.js), за да не удряме 60-секундния
 * maxDuration лимит, който вече чупи хороскоп cron-а веднъж (виж историята).
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_MODEL = "gemini-3.1-flash-image"; // Nano Banana 2
const VIDEO_MODEL = "veo-3.1-generate-preview"; // Veo 3.1 (fast/preview endpoint)

const BRAND_STYLE = `дълбок космически тъмносин фон (почти черен, с лек лилав отенък), фина лилава мъглявина и звезди на заден план, елегантен лавандулов (#c9a4ff) и златен (#ffd580) акцентен цвят, минималистичен мистичен стил, без прекалено много елементи, изчистена композиция с достатъчно празно място за текст отгоре или отдолу`;

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY не е зададен в env — виж api/README_DEPLOY.md");
  return key;
}

/**
 * Генерира едно социално изображение (напр. zodiac spotlight карта с цитат).
 * Връща { buffer, mimeType } — готово за качване в Blob storage от извикващия.
 * Синхронно извикване (обичайно 5-15 сек) — безопасно вътре в Vercel функция.
 */
async function generateSocialImage({ prompt }) {
  const fullPrompt = `Create a square (1:1) social media image for an Instagram/Facebook post on an astrology theme. Style: ${BRAND_STYLE}. Content: ${prompt}. If you include text in the image, it must be in ENGLISH, easily readable, elegant font, no spelling mistakes.`;

  const res = await fetch(`${BASE_URL}/models/${IMAGE_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }),
  });
  if (!res.ok) throw new Error(`Nano Banana image API error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data);
  if (!imgPart) throw new Error("Nano Banana не върна изображение (възможно е safety filter блокиране)");
  return {
    buffer: Buffer.from(imgPart.inlineData.data, "base64"),
    mimeType: imgPart.inlineData.mimeType || "image/png",
  };
}

/**
 * Стартира АСИНХРОННА видео генерация (Veo 3.1, вертикален формат за
 * TikTok/Reels/Shorts). НЕ чака резултата — връща operation name веднага,
 * за да се запише в DB и да се проследи от отделния poll cron.
 * "Fast"/по-евтиният preview endpoint се ползва по подразбиране (виж
 * veo-3.1-generate-preview) — достатъчен за 15-20 сек атмосферни клипове.
 */
async function startVideoGeneration({ prompt, aspectRatio = "9:16" }) {
  const fullPrompt = `Атмосферен, мистичен космически видео клип: ${BRAND_STYLE}. Сцена: ${prompt}. Плавно, бавно движение на камерата, без рязки резки, без текст в кадъра (текстът ще се добави отделно при монтажа), без хора/лица, кинематографично осветление, ~8 секунди.`;

  const res = await fetch(`${BASE_URL}/models/${VIDEO_MODEL}:predictLongRunning`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: fullPrompt }],
      parameters: { aspectRatio },
    }),
  });
  if (!res.ok) throw new Error(`Veo API error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.name) throw new Error(`Veo API не върна operation name: ${JSON.stringify(json).slice(0, 300)}`);
  return json.name; // напр. "operations/xxxxx"
}

/**
 * Проверява статуса на видео операция. Връща:
 *  - { done: false } ако все още се обработва
 *  - { done: true, videoUri } ако е готово
 *  - { done: true, error } ако е неуспешно
 */
async function checkVideoOperation(operationName) {
  const res = await fetch(`${BASE_URL}/${operationName}`, {
    headers: { "x-goog-api-key": apiKey() },
  });
  if (!res.ok) throw new Error(`Veo poll error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.done) return { done: false };
  if (json.error) return { done: true, error: json.error.message || JSON.stringify(json.error) };
  const videoUri = json.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!videoUri) return { done: true, error: "Veo завърши, но липсва video.uri в отговора" };
  return { done: true, videoUri };
}

/** Изтегля готовото видео от Google-овия временен URI (изисква същия API key header). */
async function downloadVideo(videoUri) {
  const res = await fetch(videoUri, { headers: { "x-goog-api-key": apiKey() } });
  if (!res.ok) throw new Error(`Видео download грешка: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

module.exports = { generateSocialImage, startVideoGeneration, checkVideoOperation, downloadVideo };
