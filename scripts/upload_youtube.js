#!/usr/bin/env node
/**
 * scripts/upload_youtube.js
 * Качва output/short.mp4 в YouTube чрез Data API v3, с метаданни от
 * data/script.json — Node еквивалент на sister repo-то
 * proof-in-numbers/scripts/upload_youtube.py, НАРОЧНО структурно огледален
 * (същите имена на функции/логика доколкото езикът позволява), за да е
 * лесно двата pipeline-а да се поддържат заедно.
 *
 * 07.09.2026 (втори pivot, виж project memory "Проект 8"): script.json вече
 * няма единично поле `sign` — вместо ЕДИН знак на видео, всяко видео носи
 * `signs: [{sign, reason}, ...]` (точно 3, избрани от generate-daily-short.js
 * според дневната тема). Тагирането по-долу събира тагове за И ТРИТЕ знака.
 *
 * ВАЖНО — научено от РЕАЛЕН production инцидент в proof-in-numbers на
 * 04.09.2026 (виж git history и project memory "Проект 8"): ephemeral
 * GitHub Actions runner-и + actions/cache спестява преплащане на Gemini при
 * same-day retry, НО без изрична idempotency проверка, retry-то би качило
 * ВТОРО копие на СЪЩОТО видео в YouTube. Затова marker file-ът по-долу е
 * вграден ОТ ДЕНЯ, В КОЙТО ТОЗИ СКРИПТ Е НАПИСАН, не добавен наужким по-
 * късно като poправка — точно обратното на грешката в sister repo-то.
 *
 * Изисква следните GitHub Actions secrets:
 *   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN
 * (виж SETUP_YOUTUBE.md за еднократния OAuth setup — ОТДЕЛЕН Google Cloud
 * проект от proof-in-numbers, нарочно, за да не делят двата канала един и
 * същ 10 000 units/ден YouTube Data API квота — виж бележката там).
 *
 * privacyStatus: контролира се от YOUTUBE_PRIVACY_STATUS env. Daily workflow-ът
 * задава "public" за автоматично публикуване; fallback-ът остава "private" за
 * други извиквания без изрично подадена настройка.
 */

const fs = require("fs");
const path = require("path");

const PRIVACY_STATUS = process.env.YOUTUBE_PRIVACY_STATUS || "private";

// Marker, записан след успешно качване, ВЪТРЕ в data/ — СЪЩАТА директория,
// която workflow-ът вече кешира по дата+slot (виж .github/workflows/
// daily-shorts.yml) — така кеш-restore на retry автоматично връща и
// "вече качено" сигнала, без нужда от отделен кеш ключ/стъпка.
const UPLOAD_MARKER_PATH = path.join(__dirname, "..", "data", "uploaded_video_id.json");
const SCRIPT_JSON_PATH = path.join(__dirname, "..", "data", "script.json");
const VIDEO_PATH = path.join(__dirname, "..", "output", "short.mp4");

// Допълнителни тагове по знак — просто категоризация, помага на YouTube да
// показва клипа на подходяща аудитория; аналог на PILLAR_TAGS в
// proof-in-numbers/scripts/upload_youtube.py.
const SIGN_TAGS = {
  aries: ["aries", "ariessign"],
  taurus: ["taurus", "taurussign"],
  gemini: ["gemini", "geminisign"],
  cancer: ["cancer", "cancersign"],
  leo: ["leo", "leosign"],
  virgo: ["virgo", "virgosign"],
  libra: ["libra", "librasign"],
  scorpio: ["scorpio", "scorpiosign"],
  sagittarius: ["sagittarius", "sagittariussign"],
  capricorn: ["capricorn", "capricornsign"],
  aquarius: ["aquarius", "aquariussign"],
  pisces: ["pisces", "piscessign"],
};

function alreadyUploadedToday() {
  if (!fs.existsSync(UPLOAD_MARKER_PATH)) return null;
  return JSON.parse(fs.readFileSync(UPLOAD_MARKER_PATH, "utf8"));
}

async function getAccessToken() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN не са зададени в env");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`OAuth token refresh грешка: ${res.status} ${await res.text()}`);
  const json = await res.json();
  if (!json.access_token) throw new Error(`OAuth token refresh не върна access_token: ${JSON.stringify(json)}`);
  return json.access_token;
}

/**
 * Единично multipart/related качване (metadata JSON част + видео binary
 * част) — по-просто от пълния resumable upload протокол, достатъчно
 * надеждно за малки Shorts файлове (типично няколко MB, <60 сек клип).
 * Google's videos.insert приема uploadType=multipart точно за такъв случай.
 */
async function uploadVideoMultipart({ accessToken, metadata, videoBuffer }) {
  const boundary = `lumaris_upload_${Date.now()}`;
  const metadataPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    "utf8"
  );
  const videoPartHeader = Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`, "utf8");
  const closingBoundary = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([metadataPart, videoPartHeader, videoBuffer, closingBoundary]);

  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    }
  );
  if (!res.ok) throw new Error(`YouTube videos.insert грешка: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const prior = alreadyUploadedToday();
  if (prior) {
    console.log(
      `[upload_youtube] ПРОПУСКАМ качване — днешното видео вече е публикувано като ${prior.video_id} ` +
        `("${prior.title}") в ${prior.uploaded_at}. Кеш-възстановените audio/bg/script за днес са същите, ` +
        `повторно качване би създало дубликат. Ако наистина искаш ново видео за днес, изтрий ${UPLOAD_MARKER_PATH} първо.`
    );
    return;
  }

  const script = JSON.parse(fs.readFileSync(SCRIPT_JSON_PATH, "utf8"));
  const videoBuffer = fs.readFileSync(VIDEO_PATH);

  const signTags = (Array.isArray(script.signs) ? script.signs : []).flatMap(
    (s) => SIGN_TAGS[String(s.sign || "").toLowerCase()] || []
  );
  const tags = ["shorts", "horoscope", "astrology", "zodiac", "dailyhoroscope", "lumaris", ...signTags];

  const metadata = {
    snippet: {
      title: script.title,
      description: `${script.description}\n\n#Shorts`,
      tags,
      categoryId: "24", // Entertainment
    },
    status: {
      privacyStatus: PRIVACY_STATUS,
      selfDeclaredMadeForKids: false,
    },
  };

  console.log(`[upload_youtube] Качвам "${script.title}" (${videoBuffer.length} bytes, privacyStatus=${PRIVACY_STATUS})...`);
  const accessToken = await getAccessToken();
  const response = await uploadVideoMultipart({ accessToken, metadata, videoBuffer });

  const videoId = response.id;
  if (!videoId) throw new Error(`YouTube API отговори без video id: ${JSON.stringify(response).slice(0, 500)}`);
  console.log(`[upload_youtube] Качено видео id: ${videoId} (privacyStatus=${PRIVACY_STATUS})`);

  // Записваме маркера ВЕДНАГА след успешното качване — преди каквато и да е
  // допълнителна (по избор) стъпка след това, точно както в
  // proof-in-numbers/scripts/upload_youtube.py, за да не остане run-ът
  // "недовършен и презаписваем" заради нещо второстепенно.
  fs.writeFileSync(
    UPLOAD_MARKER_PATH,
    JSON.stringify(
      {
        video_id: videoId,
        title: script.title,
        theme: script.theme,
        signs: (Array.isArray(script.signs) ? script.signs : []).map((s) => s.sign),
        uploaded_at: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

main().catch((err) => {
  console.error("ГРЕШКА в upload_youtube.js:", err);
  process.exit(1);
});
