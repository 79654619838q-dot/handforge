import { prisma, fromJson } from "../lib/prisma.js";
import { config } from "../config.js";
import { analyzeImage, makeThumb, prepareForAI } from "../lib/image.js";
import { storage } from "./storage.js";
import { preCheck, behaviourCheck, registerFraud } from "./antifraud.js";
import { calcScore, levelForXp } from "./scoring.js";
import { checkAchievements } from "./achievements.js";
import { verifyPhoto } from "./ai.js";
import { getVerificationMode } from "./game.js";

const FLAG_REASONS = {
  screen_or_print: ["SCREEN_PHOTO", "Это снимок экрана или распечатки, а не реального объекта"],
  ai_generated: ["AI_GENERATED", "Изображение похоже на сгенерированное нейросетью"],
  edited: ["EDITED", "Обнаружены следы монтажа"],
  blurry: ["BLURRY", "Объект в кадре не разобрать"],
  night_unclear: ["LOW_QUALITY", "Слишком темно, объект не различим"],
};
const FRAUD_FLAGS = ["screen_or_print", "ai_generated", "edited"];

/**
 * Полный цикл проверки. Порядок: локальные метрики → антифрод → решение по режиму.
 * Режим (AI_ONLY | AI_PLUS_ADMIN | MANUAL_ONLY) настраивается в админке
 * (вкладка «Игра») и хранится в GameSession.verificationMode.
 * Возвращает объект ответа для роута.
 */
export async function processSubmission({ user, assignment, task, buffer, clientMeta }) {
  const startedAt = Date.now();
  const metrics = await analyzeImage(buffer);

  // Сохраняем всегда: отклонённые сабмиты — материал для калибровки антифрода
  const submission = await prisma.submission.create({
    data: {
      userId: user.id,
      taskId: task.id,
      assignmentId: assignment.id,
      photoKey: "",
      width: metrics.width,
      height: metrics.height,
      bytes: metrics.bytes,
      phash: metrics.phash,
      blurScore: metrics.blurScore,
      brightness: metrics.brightness,
      exif: JSON.stringify(metrics.exif),
      clientMeta: JSON.stringify(clientMeta || {}),
      status: "PENDING",
    },
  });

  const origKey = storage.buildKey(user.id, submission.id, "orig");
  const thumbKey = storage.buildKey(user.id, submission.id, "thumb");
  await storage.put(origKey, buffer);
  await storage.put(thumbKey, await makeThumb(buffer));
  await prisma.submission.update({ where: { id: submission.id }, data: { photoKey: origKey } });

  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { attempts: { increment: 1 } },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { submissionsTotal: { increment: 1 } },
  });

  // Дальше assignment.attempts должен отражать реальное состояние в БД (после +1 выше)
  const current = { ...assignment, attempts: assignment.attempts + 1 };

  // --- Слои 1-2: локальные проверки ---
  const pre = await preCheck({ user, metrics, clientMeta, submissionId: submission.id });
  if (!pre.ok) {
    if (pre.fraud) await registerFraud(user.id, submission.id, pre.fraud);
    return reject({ submission, assignment: current, user, task, reasonCode: pre.reasonCode, reasons: [pre.message], startedAt });
  }

  const pending = (message) => {
    const attemptsLeft = Math.max(0, config.rules.maxAttempts - current.attempts);
    return prisma.submission
      .update({ where: { id: submission.id }, data: { status: "PENDING", latencyMs: Date.now() - startedAt } })
      .then(() => ({ submissionId: submission.id, status: "PENDING", message, attemptsLeft }));
  };

  const mode = await getVerificationMode();

  // --- Слой 3а: только модератор — ИИ вообще не вызываем ---
  if (mode === "MANUAL_ONLY") {
    return pending("Фото отправлено на проверку модератору. Придёт уведомление, когда решение будет готово. Попытка не потрачена.");
  }

  // --- Слой 3б: ИИ (AI_ONLY или AI_PLUS_ADMIN) ---
  const criteria = fromJson(task.criteria, {});
  let verdict;
  try {
    const aiImage = await prepareForAI(buffer);
    verdict = await verifyPhoto({
      task,
      criteria,
      imageBuffer: aiImage,
      signals: { ...metrics, elapsedMs: clientMeta?.elapsedMs ?? null },
    });

    const r = config.rules;
    if (verdict.match && verdict.confidence >= r.confidenceArbiter && verdict.confidence < r.confidenceApprove) {
      try {
        verdict = await verifyPhoto({
          task,
          criteria,
          imageBuffer: aiImage,
          signals: { ...metrics, elapsedMs: clientMeta?.elapsedMs ?? null },
          model: config.models.arbiter,
        });
        verdict.arbiter = true;
      } catch {
        /* остаёмся с первым вердиктом */
      }
    }
  } catch (err) {
    // ИИ недоступен — в любом режиме доберёт модератор, игрока не наказываем
    return pending("Проверка ИИ временно недоступна — фото передано модератору. Попытка не потрачена.");
  }

  const flagHit = Object.entries(verdict.flags).find(([, v]) => v);
  if (flagHit) {
    const [reasonCode, message] = FLAG_REASONS[flagHit[0]] || ["LOW_QUALITY", "Фото не прошло проверку"];
    if (FRAUD_FLAGS.includes(flagHit[0])) {
      await registerFraud(user.id, submission.id, {
        type: reasonCode === "SCREEN_PHOTO" ? "SCREEN_PHOTO" : reasonCode,
        severity: 30,
        details: { confidence: verdict.confidence, reasons: verdict.reasons },
      });
      if (mode === "AI_PLUS_ADMIN") {
        await prisma.submission.update({
          where: { id: submission.id },
          data: { status: "PENDING", confidence: verdict.confidence, aiVerdict: JSON.stringify(verdict), latencyMs: Date.now() - startedAt },
        });
        return {
          submissionId: submission.id,
          status: "PENDING",
          message: `ИИ засомневался (${message}) — решение примет модератор. Попытка не потрачена.`,
          attemptsLeft: Math.max(0, config.rules.maxAttempts - current.attempts),
        };
      }
    }
    return reject({ submission, assignment: current, user, task, reasonCode, reasons: [message, ...verdict.reasons], verdict, startedAt });
  }

  // --- Слой 4: погранично неуверенный вердикт — в AI_PLUS_ADMIN отдаём модератору ---
  const r = config.rules;
  const uncertain = verdict.confidence >= r.confidenceArbiter && verdict.confidence < r.confidenceApprove;
  if (mode === "AI_PLUS_ADMIN" && uncertain) {
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "PENDING", confidence: verdict.confidence, aiVerdict: JSON.stringify(verdict), latencyMs: Date.now() - startedAt },
    });
    return {
      submissionId: submission.id,
      status: "PENDING",
      message: "ИИ не до конца уверен — решение примет модератор. Попытка не потрачена.",
      attemptsLeft: Math.max(0, config.rules.maxAttempts - current.attempts),
    };
  }

  if (!verdict.match || verdict.confidence < r.confidenceApprove) {
    return reject({
      submission,
      assignment: current,
      user,
      task,
      reasonCode: "NO_MATCH",
      reasons: verdict.reasons.length ? verdict.reasons : ["Объект задания не найден в кадре"],
      verdict,
      startedAt,
    });
  }

  return approve({ submission, assignment: current, user, task, verdict, startedAt });
}

/** assignment.attempts здесь всегда должен быть актуальным значением из БД. */
export async function approve({ submission, assignment, user, task, verdict, startedAt }) {
  const streak = user.streak + 1;
  const { score, breakdown } = calcScore({ task, assignment, streak });

  const xp = user.xp + score;
  const level = levelForXp(xp);
  const levelUp = level > user.level;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      points: { increment: score },
      xp,
      level,
      streak,
      bestStreak: Math.max(user.bestStreak, streak),
      submissionsApproved: { increment: 1 },
    },
  });

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: "APPROVED",
      confidence: verdict?.confidence ?? 1,
      aiVerdict: verdict ? JSON.stringify(verdict) : null,
      score,
      breakdown: JSON.stringify(breakdown),
      latencyMs: Date.now() - startedAt,
    },
  });
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { status: "DONE", closedAt: new Date() },
  });
  await prisma.task.update({ where: { id: task.id }, data: { usedCount: { increment: 1 } } });

  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "VERDICT",
      title: "Задание принято",
      body: `${task.title} — +${score} очков`,
      data: JSON.stringify({ submissionId: submission.id }),
    },
  });

  // Другие фото по этому же заданию, ждавшие решения, — закрываем сами,
  // иначе их ещё можно засчитать отдельно и начислить очки повторно.
  await prisma.submission.updateMany({
    where: { assignmentId: assignment.id, status: "PENDING", id: { not: submission.id } },
    data: { status: "REJECTED", reasonCode: "SUPERSEDED" },
  });

  if (task.mode === "EXCLUSIVE") await closeExclusiveTask(task, assignment.id);

  const unlocked = await checkAchievements(user.id, { usedRatio: breakdown.usedRatio });
  behaviourCheck(user.id).catch(() => {});

  return {
    submissionId: submission.id,
    status: "APPROVED",
    score,
    breakdown,
    levelUp,
    ai: publicVerdict(verdict),
    user: publicUser(updated),
    unlockedAchievements: unlocked,
  };
}

/**
 * Режим EXCLUSIVE: первый принятый ответ забирает задание — снимаем его
 * из пула и закрываем у всех остальных, кто ещё держит его как активное.
 */
async function closeExclusiveTask(task, wonAssignmentId) {
  const others = await prisma.assignment.findMany({
    where: { taskId: task.id, status: "ACTIVE", id: { not: wonAssignmentId } },
    select: { id: true, userId: true },
  });

  await prisma.task.update({ where: { id: task.id }, data: { active: false } });

  if (!others.length) return;
  await prisma.assignment.updateMany({
    where: { id: { in: others.map((a) => a.id) } },
    data: { status: "CANCELLED", closedAt: new Date() },
  });
  await prisma.notification.createMany({
    data: others.map((a) => ({
      userId: a.userId,
      type: "SYSTEM",
      title: "Задание больше недоступно",
      body: `«${task.title}» уже выполнил другой игрок — попробуйте другое задание`,
    })),
  });
}

/** assignment.attempts здесь всегда должен быть актуальным значением из БД. */
export async function reject({ submission, assignment, user, task, reasonCode, reasons, verdict, startedAt }) {
  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      status: "REJECTED",
      reasonCode,
      confidence: verdict?.confidence ?? 0,
      aiVerdict: verdict ? JSON.stringify(verdict) : null,
      latencyMs: Date.now() - startedAt,
    },
  });

  const left = Math.max(0, config.rules.maxAttempts - assignment.attempts);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { streak: 0 },
  });

  if (left <= 0) {
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: "FAILED", closedAt: new Date() },
    });
  }

  await prisma.notification.create({
    data: {
      userId: user.id,
      type: "VERDICT",
      title: "Не засчитано",
      body: `${task.title} — ${reasons[0] || "не подошло"}${left > 0 ? `. Осталось попыток: ${left}` : ""}`,
      data: JSON.stringify({ submissionId: submission.id }),
    },
  });

  behaviourCheck(user.id).catch(() => {});

  return {
    submissionId: submission.id,
    status: "REJECTED",
    reasonCode,
    reasons,
    attemptsLeft: left,
    taskClosed: left <= 0,
    ai: verdict ? publicVerdict(verdict) : null,
    user: publicUser(updated),
  };
}

const publicVerdict = (v) =>
  v && {
    match: v.match,
    confidence: v.confidence,
    detected: v.detected,
    extractedText: v.extracted_text,
    reasons: v.reasons,
    arbiter: Boolean(v.arbiter),
    mock: Boolean(v.mock),
  };

export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  username: u.username,
  role: u.role,
  avatarColor: u.avatarColor,
  avatarUrl: u.avatarUrl,
  points: u.points,
  xp: u.xp,
  level: u.level,
  streak: u.streak,
  bestStreak: u.bestStreak,
  submissionsTotal: u.submissionsTotal,
  submissionsApproved: u.submissionsApproved,
  createdAt: u.createdAt,
});
