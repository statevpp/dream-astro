/**
 * _lib/astrology.js
 * Обвивка около реален astrology/ephemeris API (напр. AstrologyAPI.com или
 * Prokerala Astrology API). Целта е да заменим "проверка на данни от
 * астролози" (правно рисково — copyright/ToS при скрейпинг) с реални
 * астрономически изчисления (планетарни позиции/транзити) — легитимно
 * лицензирано през API, не скрейпинг.
 *
 * TODO преди деплой:
 *   - Регистрирай акаунт в astrologyapi.com или prokerala.com
 *   - Сложи ASTROLOGY_API_USER_ID / ASTROLOGY_API_KEY в env variables (Vercel)
 *   - Провери точния endpoint формат в тяхната документация — базовите
 *     примери тук са структурно верни, но полетата могат да се различават
 *     леко между двата доставчика.
 */

const BASE_URL = process.env.ASTROLOGY_API_BASE_URL || "https://json.astrologyapi.com/v1";

function authHeaders() {
  const userId = process.env.ASTROLOGY_API_USER_ID;
  const apiKey = process.env.ASTROLOGY_API_KEY;
  if (!userId || !apiKey) {
    throw new Error("ASTROLOGY_API_USER_ID / ASTROLOGY_API_KEY не са зададени в env — виж api/README_DEPLOY.md");
  }
  const token = Buffer.from(`${userId}:${apiKey}`).toString("base64");
  return { Authorization: `Basic ${token}`, "Content-Type": "application/json" };
}

/**
 * Дневни планетарни позиции за дадена дата (използва се за всички 12 знака).
 * Ползва /planets/tropical (не /planets/transit — този endpoint не съществува
 * в AstrologyAPI.com, връща 404; открито при директно тестване на 2026-07-14).
 * Референтна точка е фиксирана на обяд Гринуич (lat/lon/tzone = 0) — планетарните
 * позиции сами по себе си не зависят от локация, само домовете/асцендентът биха
 * зависили, а тях не ползваме за общия дневен хороскоп по знак.
 */
async function getDailyTransits(dateISO) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const res = await fetch(`${BASE_URL}/planets/tropical`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ day, month, year, hour: 12, min: 0, lat: 0, lon: 0, tzone: 0 }),
  });
  if (!res.ok) throw new Error(`astrology API transit error: ${res.status}`);
  return res.json();
}

/** Пълна натална карта по рождени данни */
async function getNatalChart({ date, time, lat, lon, tzOffset }) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, min] = (time || "12:00").split(":").map(Number);
  const res = await fetch(`${BASE_URL}/natal_chart`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ day, month, year, hour, min, lat, lon, tzone: tzOffset }),
  });
  if (!res.ok) throw new Error(`astrology API natal_chart error: ${res.status}`);
  return res.json();
}

/** Синастрия (съвместимост) между две натални карти */
async function getSynastry(personA, personB) {
  const res = await fetch(`${BASE_URL}/synastry_report`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ person_a: personA, person_b: personB }),
  });
  if (!res.ok) throw new Error(`astrology API synastry error: ${res.status}`);
  return res.json();
}

/**
 * Геокодиране на свободен текст ("София, България") -> lat/lon/timezone.
 * Ползва вградения geo_details endpoint на AstrologyAPI.com — включен без
 * доплащане във всеки план (виж https://astrologyapi.com/docs/api-ref/geodetails),
 * така че не е нужен отделен geocoding provider (OpenCage и др. са платени
 * извън малък free trial). Ако решиш да минеш на Prokerala вместо
 * AstrologyAPI.com, тази функция трябва да се пренапише — Prokerala няма
 * собствен geocoding endpoint (виж бележката в README_DEPLOY.md).
 */
async function geocodePlace(placeText) {
  if (!placeText || !placeText.trim()) {
    throw new Error("geocodePlace: празно място на раждане");
  }
  const res = await fetch(`${BASE_URL}/geo_details`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ place: placeText.trim(), maxRows: 1 }),
  });
  if (!res.ok) throw new Error(`astrology API geo_details error: ${res.status}`);
  const data = await res.json();
  const match = data && Array.isArray(data.geonames) ? data.geonames[0] : null;
  if (!match) {
    throw new Error(`geocodePlace: няма намерено място за "${placeText}" — провери изписването (напр. "Sofia, Bulgaria" на латиница дава по-сигурен резултат от кирилица)`);
  }
  const lat = Number(match.latitude);
  const lon = Number(match.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`geocodePlace: невалидни координати за "${placeText}"`);
  }
  return {
    placeName: match.place_name,
    lat,
    lon,
    timezoneId: match.timezone_id, // IANA име, напр. "Europe/Sofia" — не числов offset
    countryCode: match.country_code,
  };
}

/**
 * Превръща IANA timezone id (напр. "Europe/Sofia") в числов UTC offset за
 * КОНКРЕТНА дата (не "сега") — важно, защото natal_chart/synastry endpoint-ите
 * искат числов offset (tzone), а geo_details връща само IANA името. Изчислен
 * спрямо реалната дата на раждане, за да е верен и при исторически DST
 * правила (Node's Intl/tzdata го поддържа коректно "из кутията").
 */
function tzOffsetForDate(timezoneId, dateISO) {
  if (!timezoneId) return 0;
  const refDate = new Date(`${dateISO || new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezoneId,
    timeZoneName: "longOffset",
  }).formatToParts(refDate);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";
  const m = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec(tzPart);
  if (!m) return 0;
  const hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) / 60 : 0;
  return hours < 0 ? hours - minutes : hours + minutes;
}

/**
 * Геокодира текст на място + връща lat/lon/tzOffset, готови за
 * getNatalChart/getSynastry. Единствената точка, през която трябва да мине
 * "място на раждане" текст от формата преди да стигне до astro изчисленията.
 */
async function resolveBirthLocation({ date, placeText }) {
  const place = await geocodePlace(placeText);
  const tzOffset = tzOffsetForDate(place.timezoneId, date);
  return { lat: place.lat, lon: place.lon, tzOffset, placeName: place.placeName, timezoneId: place.timezoneId };
}

/** Изгражда input обект във формàта, който synastry_report очаква за всеки от двамата (person_a/person_b) */
async function buildChartInput({ date, time, placeText }) {
  const { lat, lon, tzOffset } = await resolveBirthLocation({ date, placeText });
  const [year, month, day] = date.split("-").map(Number);
  const [hour, min] = (time || "12:00").split(":").map(Number);
  return { day, month, year, hour, min, lat, lon, tzone: tzOffset };
}

module.exports = {
  getDailyTransits, getNatalChart, getSynastry,
  geocodePlace, tzOffsetForDate, resolveBirthLocation, buildChartInput,
};
