/**
 * Калибровка порогов антифрода на реальных фотографиях.
 *
 *   node scripts/calibrate.mjs ./photos     — разбор папки со снимками
 *   node scripts/calibrate.mjs              — самопроверка на синтетике
 *
 * Что делать с результатом:
 *  - BLUR_MIN_SCORE ставьте ниже минимума по колонке «резкость» среди ваших нормальных фото,
 *    иначе получите ложные отказы (главная причина оттока игроков);
 *  - DUPLICATE_HAMMING — выше максимума в «дубли» и ниже минимума в «разные».
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { analyzeImage, hamming } from "../src/lib/image.js";

const dir = process.argv[2];

const pad = (v, n) => String(v).padEnd(n);
const fmt = (n) => String(Math.round(n * 100) / 100);

async function analyzeFolder(folder) {
  const files = (await fs.readdir(folder)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  if (!files.length) return console.log("В папке нет изображений.");

  const rows = [];
  for (const f of files) {
    const buffer = await fs.readFile(path.join(folder, f));
    const m = await analyzeImage(buffer);
    rows.push({ file: f, ...m });
  }

  console.log(`\n${pad("файл", 28)}${pad("размер", 12)}${pad("резкость", 12)}${pad("яркость", 10)}хэш`);
  console.log("-".repeat(80));
  for (const r of rows) {
    console.log(
      pad(r.file.slice(0, 26), 28) +
        pad(`${r.width}x${r.height}`, 12) +
        pad(fmt(r.blurScore), 12) +
        pad(fmt(r.brightness), 10) +
        r.phash
    );
  }

  const blur = rows.map((r) => r.blurScore).sort((a, b) => a - b);
  console.log(`\nРезкость: мин ${fmt(blur[0])}, медиана ${fmt(blur[Math.floor(blur.length / 2)])}, макс ${fmt(blur.at(-1))}`);
  console.log(`Рекомендуемый BLUR_MIN_SCORE: ${Math.max(10, Math.floor(blur[0] * 0.6))}`);

  let min = 64;
  let pair = null;
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const d = hamming(rows[i].phash, rows[j].phash);
      if (d < min) { min = d; pair = [rows[i].file, rows[j].file]; }
    }
  if (pair) console.log(`Ближайшая пара разных фото: ${min} (${pair.join(" / ")}). DUPLICATE_HAMMING держите ниже.`);
}

async function selfTest() {
  const w = 1200, h = 900;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const sky = y < h * 0.5 ? 200 - y / 6 : 90;
      const box = x > 300 && x < 600 && y > 400 && y < 700 ? 60 : 0;
      const circle = Math.hypot(x - 900, y - 300) < 120 ? 120 : 0;
      raw[i] = Math.max(0, sky - box + circle);
      raw[i + 1] = Math.max(0, sky - box * 0.4);
      raw[i + 2] = Math.max(0, sky * 0.9 - circle * 0.5);
    }

  const base = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  const origin = await analyzeImage(base);

  const variants = {
    "ресайз 800 + q60": await sharp(base).resize(800).jpeg({ quality: 60 }).toBuffer(),
    "ресайз 480": await sharp(base).resize(480).jpeg({ quality: 80 }).toBuffer(),
    "кроп 5%": await sharp(base).extract({ left: 60, top: 45, width: w - 120, height: h - 90 }).jpeg().toBuffer(),
    "поворот 3°": await sharp(base).rotate(3).jpeg().toBuffer(),
    "зеркало (другая сцена)": await sharp(base).flop().jpeg().toBuffer(),
    "сильное размытие": await sharp(base).blur(12).jpeg().toBuffer(),
  };

  console.log(`\nОригинал: резкость ${fmt(origin.blurScore)}, хэш ${origin.phash}\n`);
  console.log(`${pad("преобразование", 26)}${pad("хэмминг", 10)}резкость`);
  console.log("-".repeat(50));
  for (const [name, buffer] of Object.entries(variants)) {
    const m = await analyzeImage(buffer);
    console.log(pad(name, 26) + pad(hamming(origin.phash, m.phash), 10) + fmt(m.blurScore));
  }
  console.log("\nСинтетика гладкая, поэтому резкость занижена. Для настройки порогов используйте реальные фото:");
  console.log("  node scripts/calibrate.mjs ./photos");
}

(dir ? analyzeFolder(dir) : selfTest()).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
