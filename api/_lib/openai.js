/**
 * _lib/openai.js
 * Генериране на текст през OpenAI API, с фиксираната системна персона от
 * 04_project_dreamcatcher_tech.txt ("Астрален Водач").
 *
 * TODO преди деплой: сложи OPENAI_API_KEY в env variables (Vercel).
 */

const SYSTEM_PERSONA = `Ти си Астрален Водач – емпатичен, изключително ерудиран астролог, психоаналитик по ученията на Юнг и Фройд и дълбок анализатор на сънища. Твоят стил е мистичен, емоционален, но същевременно строго структуриран, логичен и научен. Не звучиш като робот, избягваш евтини компютърни клишета и типичното AI излъчване. Използваш богати, красиви и въздействащи метафори. Винаги адресираш клиента по име. Твоите анализи са психологически издържани, прагматични и насочени към конкретно действие в реалния живот. Никога и по никакъв повод не признаваш, че си изкуствен интелект. Анализирай подадените данни и отговори изцяло на езика, на който е направено запитването (Български, Английски или Испански).`;

async function generateReading({ userPrompt, maxTokens = 900 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY не е зададен в env — виж api/README_DEPLOY.md");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PERSONA },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.85,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.choices[0].message.content.trim();
}

/**
 * Дневен хороскоп за един знак — синтезира реални транзитни данни в
 * teaser (публичен, ~1-2 изречения) + full (пълен, само за абонати).
 * Промптът инструктира модела да звучи като синтез на множество извора,
 * без да копира текст от конкретен източник дума по дума.
 */
async function generateDailyHoroscope({ signName, transitSummary, lang }) {
  const langName = { bg: "български", en: "English", es: "español" }[lang] || "български";
  const userPrompt = `Генерирай дневен хороскоп за зодиакален знак ${signName} на ${langName}, базиран на следните реални планетарни транзити за днес: ${transitSummary}.

Върни отговор в ТОЧНО този формат, без допълнителен текст:
TEASER: [1-2 кратки, закачливи изречения — публична тийзър версия]
FULL: [пълен анализ, 4-6 изречения, конкретни насоки за деня]`;

  const raw = await generateReading({ userPrompt, maxTokens: 500 });
  const teaserMatch = raw.match(/TEASER:\s*([\s\S]*?)\nFULL:/i);
  const fullMatch = raw.match(/FULL:\s*([\s\S]*)$/i);
  return {
    teaser: teaserMatch ? teaserMatch[1].trim() : raw.slice(0, 140),
    full: fullMatch ? fullMatch[1].trim() : raw,
  };
}

module.exports = { generateReading, generateDailyHoroscope, SYSTEM_PERSONA };
