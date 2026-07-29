import { Router } from "express";
import { z } from "zod";
import { prisma, fromJson, toJson } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { notFound, badRequest } from "../lib/errors.js";
import { refillPool } from "../services/tasks.js";
import { basePoints } from "../services/scoring.js";
import { approve, reject } from "../services/verification.js";
import { storage } from "../services/storage.js";
import { getGameStatus, startGame, stopGame, setVerificationMode } from "../services/game.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("ADMIN", "MODERATOR"));

const audit = (actorId, action, target, details) =>
  prisma.auditLog.create({ data: { actorId, action, target, details: toJson(details) } });

adminRouter.get("/game", async (_req, res, next) => {
  try {
    res.json(await getGameStatus());
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/game/start", async (req, res, next) => {
  try {
    const { durationMinutes, taskMode } = z
      .object({
        durationMinutes: z.number().min(1).max(7 * 24 * 60).optional(),
        taskMode: z.enum(["SHARED", "EXCLUSIVE"]).optional(),
      })
      .parse(req.body || {});

    await startGame(durationMinutes || null);
    if (taskMode) await prisma.task.updateMany({ where: { active: true }, data: { mode: taskMode } });

    await audit(req.user.id, "GAME_START", null, { durationMinutes: durationMinutes || null, taskMode: taskMode || null });
    res.json(await getGameStatus());
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/game/stop", async (req, res, next) => {
  try {
    await stopGame();
    await audit(req.user.id, "GAME_STOP", null, null);
    res.json(await getGameStatus());
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/game/verification-mode", async (req, res, next) => {
  try {
    const { mode } = z
      .object({ mode: z.enum(["AI_ONLY", "AI_PLUS_ADMIN", "MANUAL_ONLY"]) })
      .parse(req.body || {});
    await setVerificationMode(mode);
    await audit(req.user.id, "VERIFICATION_MODE_SET", null, { mode });
    res.json(await getGameStatus());
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const day = new Date(Date.now() - 864e5);
    const online = new Date(Date.now() - 5 * 60_000);
    const [users, activeToday, onlineNow, tasksActive, fraudToday, pending] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastActiveAt: { gte: day } } }),
      prisma.user.count({ where: { lastActiveAt: { gte: online } } }),
      prisma.task.count({ where: { active: true } }),
      prisma.fraudEvent.count({ where: { createdAt: { gte: day } } }),
      prisma.submission.count({ where: { status: "PENDING" } }),
    ]);

    res.json({ users, activeToday, onlineNow, tasksActive, fraudToday, pending });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/tasks", async (_req, res, next) => {
  try {
    const tasks = await prisma.task.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    res.json({ tasks: tasks.map((t) => ({ ...t, criteria: fromJson(t.criteria, {}) })) });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/tasks/generate", async (req, res, next) => {
  try {
    const { count = 12, city = null } = req.body || {};
    const created = await refillPool({ count: Math.min(24, Number(count) || 12), city });
    await audit(req.user.id, "TASKS_GENERATE", null, { count: created.length, city });
    res.json({ created: created.length, tasks: created });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/tasks", async (req, res, next) => {
  try {
    const body = z
      .object({
        title: z.string().min(3),
        description: z.string().min(5),
        category: z.string(),
        difficulty: z.number().min(1).max(5),
        timeLimitSec: z.number().min(300).max(86400).optional(),
        mode: z.enum(["SHARED", "EXCLUSIVE"]).optional(),
        criteria: z.record(z.any()),
      })
      .parse(req.body);

    const task = await prisma.task.create({
      data: {
        ...body,
        points: basePoints(body.difficulty),
        timeLimitSec: body.timeLimitSec ?? 43200,
        criteria: toJson(body.criteria),
        source: "MANUAL",
      },
    });
    await audit(req.user.id, "TASK_CREATE", task.id, null);
    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/tasks/:id", async (req, res, next) => {
  try {
    const data = {};
    for (const key of ["title", "description", "category", "active", "difficulty", "timeLimitSec", "points", "mode"]) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    if (req.body.criteria) data.criteria = toJson(req.body.criteria);
    const task = await prisma.task.update({ where: { id: req.params.id }, data });
    await audit(req.user.id, "TASK_UPDATE", task.id, data);
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/tasks/:id", async (req, res, next) => {
  try {
    await prisma.task.update({ where: { id: req.params.id }, data: { active: false } });
    await audit(req.user.id, "TASK_DISABLE", req.params.id, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/submissions", async (req, res, next) => {
  try {
    const where = { hiddenFromAdmin: false };
    if (req.query.status) where.status = String(req.query.status);
    const items = await prisma.submission.findMany({
      where,
      include: {
        task: { select: { title: true } },
        user: { select: { username: true, riskScore: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({
      items: items.map((s) => ({
        id: s.id,
        status: s.status,
        reasonCode: s.reasonCode,
        confidence: s.confidence,
        score: s.score,
        blurScore: s.blurScore,
        createdAt: s.createdAt,
        latencyMs: s.latencyMs,
        task: s.task,
        user: s.user,
        ai: fromJson(s.aiVerdict, null),
        photoUrl: `/api/photos/${s.id}`,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Убрать уже проверенное фото из очереди админа — только скрывает его из
 * списка модератора. На очки не влияет и НЕ трогает ни саму запись, ни файл
 * фото — игрок должен по-прежнему видеть это фото в своей истории/профиле.
 */
adminRouter.delete("/submissions/:id", async (req, res, next) => {
  try {
    const s = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!s) throw notFound("Отправка не найдена");
    if (s.status === "PENDING") throw badRequest("STILL_PENDING", "Сначала примите решение — засчитать или отклонить");

    await prisma.submission.update({ where: { id: s.id }, data: { hiddenFromAdmin: true } });
    await audit(req.user.id, "SUBMISSION_DELETE", s.id, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Решение модератора по фото, ожидающему проверки (замена ИИ-вердикта).
 * Принимает только сабмиты в статусе PENDING — так исключается повторное начисление.
 */
adminRouter.post("/submissions/:id/override", async (req, res, next) => {
  try {
    const { status, note } = z
      .object({ status: z.enum(["APPROVED", "REJECTED"]), note: z.string().optional() })
      .parse(req.body);

    const s = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!s) throw notFound("Отправка не найдена");
    if (s.status !== "PENDING") throw badRequest("ALREADY_DECIDED", "Решение по этому фото уже принято");

    const [user, assignment, task] = await Promise.all([
      prisma.user.findUnique({ where: { id: s.userId } }),
      prisma.assignment.findUnique({ where: { id: s.assignmentId } }),
      prisma.task.findUnique({ where: { id: s.taskId } }),
    ]);
    if (status === "APPROVED" && assignment.status !== "ACTIVE") {
      throw badRequest("ASSIGNMENT_CLOSED", "Это задание у игрока уже закрыто другим фото");
    }
    const startedAt = new Date(s.createdAt).getTime();

    const result =
      status === "APPROVED"
        ? await approve({ submission: s, assignment, user, task, verdict: null, startedAt })
        : await reject({
            submission: s,
            assignment,
            user,
            task,
            reasonCode: "MANUAL_REJECTED",
            reasons: [note || "Не подходит по мнению модератора"],
            verdict: null,
            startedAt,
          });

    await audit(req.user.id, "SUBMISSION_DECIDE", s.id, { status, note });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/users", async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, username: true, email: true, role: true, points: true, level: true,
        submissionsTotal: true, submissionsApproved: true, riskScore: true, banned: true,
        banReason: true, lastActiveAt: true, createdAt: true,
      },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/users/:id/ban", async (req, res, next) => {
  try {
    const { banned = true, reason = "Нарушение правил" } = req.body || {};
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { banned, banReason: banned ? reason : null, ...(banned ? {} : { riskScore: 0 }) },
    });
    await audit(req.user.id, banned ? "USER_BAN" : "USER_UNBAN", user.id, { reason });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Полный сброс прогресса игрока: удаляет все его фото, отправки, задания,
 * достижения и обнуляет счётчики. Аккаунт (почта/пароль/бан) не трогает.
 */
adminRouter.post("/users/:id/reset", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw notFound("Игрок не найден");

    const submissions = await prisma.submission.findMany({
      where: { userId: user.id },
      select: { photoKey: true },
    });
    for (const s of submissions) {
      if (!s.photoKey) continue;
      await storage.remove(s.photoKey).catch(() => {});
      await storage.remove(s.photoKey.replace("-orig.jpg", "-thumb.jpg")).catch(() => {});
    }

    await prisma.submission.deleteMany({ where: { userId: user.id } });
    await prisma.captureSession.deleteMany({ where: { userId: user.id } });
    await prisma.assignment.deleteMany({ where: { userId: user.id } });
    await prisma.userAchievement.deleteMany({ where: { userId: user.id } });
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.fraudEvent.deleteMany({ where: { userId: user.id } });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        points: 0,
        xp: 0,
        level: 1,
        streak: 0,
        bestStreak: 0,
        submissionsTotal: 0,
        submissionsApproved: 0,
        riskScore: 0,
      },
    });

    await audit(req.user.id, "USER_RESET", user.id, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/fraud", async (_req, res, next) => {
  try {
    const events = await prisma.fraudEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { username: true, riskScore: true, banned: true } } },
    });
    res.json({ events: events.map((e) => ({ ...e, details: fromJson(e.details, {}) })) });
  } catch (err) {
    next(err);
  }
});
