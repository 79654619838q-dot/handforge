import { prisma } from "../lib/prisma.js";
import { hamming } from "../lib/image.js";
import { config } from "../config.js";

/**
 * Слой 1 и 2 антифрода: свойства файла и дубликаты.
 * Возвращает { ok, reasonCode, message, fraud } — всё до вызова vision-модели.
 */
export async function preCheck({ user, metrics, clientMeta, submissionId }) {
  const r = config.rules;

  if (metrics.bytes < r.minUploadBytes) {
    return fail("LOW_QUALITY", "Файл слишком мал — вероятно, это не снимок камеры");
  }
  if (metrics.width < 640 || metrics.height < 480) {
    return fail("LOW_QUALITY", "Разрешение ниже 640×480");
  }
  const ratio = metrics.width / metrics.height;
  if (ratio < 0.4 || ratio > 2.5) {
    return fail("LOW_QUALITY", "Необычное соотношение сторон кадра");
  }
  if (metrics.blurScore < r.blurMinScore) {
    return fail("BLURRY", "Кадр смазан. Держите телефон неподвижно и снимите ещё раз");
  }
  if (metrics.brightness < 18 || metrics.brightness > 245) {
    return fail("LOW_QUALITY", "Кадр слишком тёмный или засвечен");
  }
  if ((clientMeta?.elapsedMs ?? 99999) < r.minElapsedMs) {
    return fail("LOW_QUALITY", "Кадр отправлен слишком быстро после открытия камеры");
  }

  const editors = ["photoshop", "lightroom", "snapseed", "facetune", "gimp", "picsart", "midjourney", "dall"];
  const software = String(metrics.exif?.software || "").toLowerCase();
  if (software && editors.some((e) => software.includes(e))) {
    return fail("EDITED", "В метаданных снимка указан графический редактор", {
      type: "EDITED",
      severity: 30,
      details: { software: metrics.exif.software },
    });
  }

  const dup = await findDuplicate(user.id, metrics.phash, submissionId);
  if (dup) {
    return fail(
      "DUPLICATE",
      dup.own
        ? "Это фото уже отправлялось раньше"
        : "Такое фото уже есть в игре у другого игрока",
      {
        type: dup.own ? "DUPLICATE" : "STOLEN_PHOTO",
        severity: dup.own ? 15 : 25,
        details: { matchedSubmissionId: dup.id, distance: dup.distance },
      }
    );
  }

  return { ok: true };
}

function fail(reasonCode, message, fraud = null) {
  return { ok: false, reasonCode, message, fraud };
}

/**
 * Поиск дубликата по dHash.
 * SQLite: сравнение в приложении по свежему окну. PostgreSQL: заменить на
 * bit_count(phash # $1) с индексом (см. docs/02-database.md).
 */
async function findDuplicate(userId, phash, excludeSubmissionId) {
  const threshold = config.rules.duplicateHamming;
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);

  const rows = await prisma.submission.findMany({
    where: {
      createdAt: { gte: since },
      status: { in: ["APPROVED", "PENDING"] },
      ...(excludeSubmissionId ? { id: { not: excludeSubmissionId } } : {}),
    },
    select: { id: true, phash: true, userId: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  for (const row of rows) {
    const distance = hamming(phash, row.phash);
    if (distance <= threshold) {
      return { id: row.id, distance, own: row.userId === userId };
    }
  }
  return null;
}

/** Слой 4: поведенческие аномалии. Считается после сохранения сабмита. */
export async function behaviourCheck(userId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const subs = await prisma.submission.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { createdAt: true, status: true, clientMeta: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const events = [];

  const fast = subs.filter((s) => {
    try {
      return (JSON.parse(s.clientMeta || "{}").elapsedMs ?? 1e9) < 20000;
    } catch {
      return false;
    }
  });
  if (fast.length >= 5) {
    events.push({
      type: "SPEED_ANOMALY",
      severity: 20,
      details: { count: fast.length, window: "24h" },
    });
  }

  const rejected = subs.filter((s) => s.status === "REJECTED").length;
  if (subs.length >= 10 && rejected / subs.length > 0.7) {
    events.push({
      type: "SPEED_ANOMALY",
      severity: 10,
      details: { rejectRate: Math.round((rejected / subs.length) * 100) },
    });
  }

  for (const e of events) await registerFraud(userId, null, e);
  return events;
}

export async function registerFraud(userId, submissionId, event) {
  await prisma.fraudEvent.create({
    data: {
      userId,
      submissionId,
      type: event.type,
      severity: event.severity ?? 10,
      details: JSON.stringify(event.details ?? {}),
    },
  });
  const user = await prisma.user.update({
    where: { id: userId },
    data: { riskScore: { increment: event.severity ?? 10 } },
  });
  if (user.riskScore >= config.rules.banRiskThreshold && !user.banned) {
    await prisma.user.update({
      where: { id: userId },
      data: { banned: true, banReason: "Автоблокировка антифрода, требуется проверка модератором" },
    });
  }
  return user;
}
