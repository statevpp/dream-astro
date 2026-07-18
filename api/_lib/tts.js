/**
 * _lib/tts.js
 * Gemini native text-to-speech (TTS) — за Lumaris YouTube/TikTok видеата.
 * Използва СЪЩИЯ GEMINI_API_KEY, който вече покрива текст (_lib/gemini.js) и
 * изображения/видео (_lib/content-gen.js) — няма нужда от отделен billing.
 *
 * API: generateContent с responseModalities:["AUDIO"] (legacy/stable REST
 * форма, документирана на
 * ai.google.dev/gemini-api/docs/generate-content/speech-generation към
 * 2026-06-23; verify-нато директно от документацията преди писане на този
 * файл, а не от training data, тъй като TTS е нова функционалност за проекта).
 * Отговорът е СУРОВ PCM (24kHz, mono, 16-bit signed little-endian) в
 * base64 — НЕ е готов .wav файл, затова pcmToWav() добавя RIFF хедър ръчно
 * (чист JS, без нужда от ffmpeg/npm пакет само за това).
 *
 * Ценообразуване (проверено чрез search преди избора на модел): Gemini 2.5
 * Flash Preview TTS ~$0.50/1M вход + $10/1M изход токена — доста по-евтино
 * от 3.1 Flash TTS Preview (~$1/$20). За дневни YouTube скриптове (няколко
 * хиляди токена говор на ден) разликата е реална на месечна база, затова
 * 2.5 Flash Preview TTS е подразбиращият се модел. Override чрез
 * GEMINI_TTS_MODEL, ако по-късно поискаме по-новия 3.1 (по-добро качество/
 * streaming поддръжка).
 *
 * Документацията изрично предупреждава: моделът РЯДКО връща текстови токени
 * вместо аудио (произволен ~малък процент от заявките), което чупи заявката
 * с 500 грешка — затова тук има 1 автоматичен retry (не повече — поуката от
 * generate-daily-horoscopes.js по-горе в проекта е, че прекалено много
 * retry-та в批 контекст може да удари Vercel timeout; тук TTS се вика само
 * веднъж на видео, не 36 пъти наведнъж, така че 1 retry е безопасен).
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const SAMPLE_RATE = 24000; // фиксирано от Gemini TTS изхода, не е конфигурируемо
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// "Informative" тон по каталога на Google — пасва на mystic-but-grounded
// астрологичен разказвач. Override чрез GEMINI_TTS_VOICE ако по-късно решим
// да пробваме друг глас (напр. "Enceladus" за по-breathy/мистичен вариант,
// "Umbriel" за по-спокоен easy-going тон).
const DEFAULT_VOICE = "Charon";

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY не е зададен в env — виж api/README_DEPLOY.md");
  return key;
}

function ttsModel() {
  return process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
}

/**
 * Обвива суров 16-bit PCM буфер в стандартен .wav файл (44-байтов RIFF
 * хедър + данните). Чист JS, без зависимости — ffmpeg приема .wav директно
 * при монтажа (виж планирания assemble-video.sh скрипт).
 */
function pcmToWav(pcmBuffer, { channels = CHANNELS, sampleRate = SAMPLE_RATE, bitsPerSample = BITS_PER_SAMPLE } = {}) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  header.writeUInt16LE(1, 20); // audio format = 1 (PCM, не компресиран)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Единичен Gemini generateContent извикване с responseModalities:["AUDIO"].
 * Връща суровия base64 PCM string от inlineData.data, или хвърля грешка.
 */
async function callTtsApi({ prompt, speechConfig }) {
  const model = ttsModel();
  const res = await fetch(`${BASE_URL}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini TTS API error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const part = json?.candidates?.[0]?.content?.parts?.[0];
  const data = part?.inlineData?.data;
  if (!data) {
    // Документираният "occasional text token returns" случай — моделът е
    // върнал текст вместо аудио. Хвърляме грешка, за да сработи retry-ят.
    const textFallback = part?.text ? ` (моделът върна текст вместо аудио: "${part.text.slice(0, 120)}")` : "";
    throw new Error(`Gemini TTS не върна аудио данни${textFallback}`);
  }
  return data;
}

/**
 * Генерира еднoгласово аудио от текст/промпт. text може да е чист скрипт
 * ИЛИ пълен "Director's Notes" промпт (Audio Profile/Scene/Style/Transcript
 * — виж коментара в generateYoutubeVoicePrompt в gemini.js за конкретния
 * формат, ползван за Lumaris) — TTS моделът третира всичко като инструкция
 * + текст за изговаряне, затова не се налага отделен параметър.
 * Връща готов .wav Buffer.
 */
async function generateSpeech({ text, voiceName = process.env.GEMINI_TTS_VOICE || DEFAULT_VOICE }) {
  const speechConfig = {
    voiceConfig: { prebuiltVoiceConfig: { voiceName } },
  };

  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const base64Pcm = await callTtsApi({ prompt: text, speechConfig });
      const pcmBuffer = Buffer.from(base64Pcm, "base64");
      return pcmToWav(pcmBuffer);
    } catch (err) {
      lastErr = err;
      console.warn(`[tts] generateSpeech опит ${attempt}/2 неуспешен: ${err.message}`);
    }
  }
  throw lastErr;
}

/**
 * Двугласово аудио (напр. intro/outro диалог с втори "co-host" глас, ако
 * по-нататък решим да разнообразим формата). speakers: [{speaker, voiceName}, ...]
 * (максимум 2, ограничение на самия Gemini API). text трябва да съдържа
 * репликите с етикет "SpeakerName: ..." ред по ред, точно с имената от
 * speakers[].speaker.
 */
async function generateMultiSpeakerSpeech({ text, speakers }) {
  if (!Array.isArray(speakers) || speakers.length < 2) {
    throw new Error("generateMultiSpeakerSpeech изисква поне 2 speakers");
  }
  const speechConfig = {
    multiSpeakerVoiceConfig: {
      speakerVoiceConfigs: speakers.map(({ speaker, voiceName }) => ({
        speaker,
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      })),
    },
  };

  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const base64Pcm = await callTtsApi({ prompt: text, speechConfig });
      const pcmBuffer = Buffer.from(base64Pcm, "base64");
      return pcmToWav(pcmBuffer);
    } catch (err) {
      lastErr = err;
      console.warn(`[tts] generateMultiSpeakerSpeech опит ${attempt}/2 неуспешен: ${err.message}`);
    }
  }
  throw lastErr;
}

module.exports = { generateSpeech, generateMultiSpeakerSpeech, pcmToWav, DEFAULT_VOICE };
