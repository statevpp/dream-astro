/**
 * _lib/pdf.js
 * Генериране на кратък, четим-на-телефон PDF от текстов анализ, чрез pdf-lib
 * (по-лек и по-бърз в serverless среда от Puppeteer/HTML-to-PDF).
 *
 * npm install pdf-lib
 */

const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

async function generateReadingPdf({ title, bodyText, clientName }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([420, 640]); // мобилно-приятелски пропорции
  const margin = 36;
  let y = 640 - margin;

  page.drawText(title, { x: margin, y, size: 20, font, color: rgb(0.14, 0.1, 0.3) });
  y -= 30;
  if (clientName) {
    page.drawText(clientName, { x: margin, y, size: 12, font: bodyFont, color: rgb(0.4, 0.35, 0.55) });
    y -= 26;
  }

  const maxWidth = 420 - margin * 2;
  const words = bodyText.split(/\s+/);
  let line = "";
  const lineHeight = 15;

  for (const word of words) {
    const testLine = line ? line + " " + word : word;
    const width = bodyFont.widthOfTextAtSize(testLine, 11);
    if (width > maxWidth) {
      if (y < margin + lineHeight) {
        page = doc.addPage([420, 640]);
        y = 640 - margin;
      }
      page.drawText(line, { x: margin, y, size: 11, font: bodyFont, color: rgb(0.1, 0.1, 0.15) });
      y -= lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) page.drawText(line, { x: margin, y, size: 11, font: bodyFont, color: rgb(0.1, 0.1, 0.15) });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

module.exports = { generateReadingPdf };
