import sharp from "sharp";
import exifReader from "exif-reader";

/**
 * Метрики изображения, считаются локально до обращения к ИИ.
 * Дают ~30% отсева и стоят доли миллисекунды против секунд у vision-модели.
 */
export async function analyzeImage(buffer) {
  const image = sharp(buffer, { failOn: "none" });
  const meta = await image.metadata();

  let exif = null;
  if (meta.exif) {
    try {
      const parsed = exifReader(meta.exif);
      exif = {
        software: parsed?.Image?.Software ?? null,
        make: parsed?.Image?.Make ?? null,
        model: parsed?.Image?.Model ?? null,
        dateTime: parsed?.Photo?.DateTimeOriginal ?? null,
      };
    } catch {
      exif = null;
    }
  }

  const { blurScore, brightness } = await sharpnessAndBrightness(buffer);
  const phash = await dHash(buffer);

  return {
    width: meta.width || 0,
    height: meta.height || 0,
    format: meta.format,
    bytes: buffer.length,
    exif,
    blurScore,
    brightness,
    phash,
  };
}

/** Дисперсия Лапласиана — стандартная метрика резкости. Ниже ~60 кадр смазан. */
async function sharpnessAndBrightness(buffer) {
  const size = 512;
  const { data, info } = await sharp(buffer, { failOn: "none" })
    .grayscale()
    .resize(size, size, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  let brightSum = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      brightSum += data[i];
      const lap =
        -4 * data[i] + data[i - 1] + data[i + 1] + data[i - w] + data[i + w];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return {
    blurScore: Math.round(variance * 100) / 100,
    brightness: Math.round((brightSum / count) * 100) / 100,
  };
}

/** 64-битный difference hash. Устойчив к ресайзу и перекодированию. */
async function dHash(buffer) {
  const { data } = await sharp(buffer, { failOn: "none" })
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits += left > right ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    let xor = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

/** Подготовка кадра для vision-модели: длинная сторона 1568px, JPEG q82. */
export async function prepareForAI(buffer) {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(1568, 1568, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/** Аватарка профиля: квадрат, обрезка по центру. */
export async function makeAvatar(buffer) {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(320, 320, { fit: "cover" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Превью для истории и админки. */
export async function makeThumb(buffer) {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
}
