/**
 * _lib/blob.js
 * Тънка обвивка над Vercel Blob storage — тук се качват генерираните
 * седмични визуали/видеа (те са бинарни файлове, не могат да седят в Postgres
 * колона по разумен начин).
 *
 * TODO преди деплой (аналогично на Vercel Postgres настройката в
 * README_DEPLOY.md т.3):
 *   1. Vercel Dashboard -> проекта -> Storage таб -> Create Database -> Blob.
 *   2. Vercel автоматично добавя BLOB_READ_WRITE_TOKEN в Environment Variables
 *      — не е нужно да го копираш ръчно, само да провериш че съществува.
 *   3. npm install (добавя @vercel/blob от package.json).
 */

const { put } = require("@vercel/blob");

/**
 * Качва буфер (изображение/видео) в Blob storage под публичен URL.
 * pathPrefix напр. "weekly-content/2026-07-20/leo-quote.png"
 */
async function uploadContentBuffer(pathPrefix, buffer, contentType) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN не е зададен — виж api/README_DEPLOY.md (Vercel Blob setup)");

  const blob = await put(pathPrefix, buffer, {
    access: "public",
    contentType,
    token,
    addRandomSuffix: false,
  });
  return blob.url;
}

module.exports = { uploadContentBuffer };
