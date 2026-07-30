import { Router } from "express";
import { prisma, fromJson } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadPhoto } from "../middleware/upload.js";
import { submissionLimiter } from "../middleware/rateLimit.js";
import { badRequest, notFound } from "../lib/errors.js";
import { processSubmission } from "../services/verification.js";

export const submissionsRouter = Router();
submissionsRouter.use(requireAuth);

submissionsRouter.post("/", submissionLimiter, uploadPhoto, async (req, res, next) => {
  try {
    if (!req.file) throw badRequest("NO_PHOTO", "Фотография не приложена");

    const { assignmentId, nonce, captureToken } = req.body;
    let clientMeta = {};
    try {
      clientMeta = JSON.parse(req.body.clientMeta || "{}");
    } catch {
      clientMeta = {};
    }

    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, userId: req.user.id },
      include: { task: true },
    });
    if (!assignment) throw notFound("Задание не найдено");
    if (assignment.status !== "ACTIVE") throw badRequest("TASK_CLOSED", "Задание уже закрыто");
    if (assignment.nonce !== nonce) throw badRequest("BAD_NONCE", "Задание не совпадает с отправкой");
    if (new Date(assignment.expiresAt) < new Date()) {
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { status: "EXPIRED", closedAt: new Date() },
      });
      throw badRequest("TASK_EXPIRED", "Время задания истекло");
    }
    if (assignment.attempts >= config.rules.maxAttempts) {
      throw badRequest("NO_ATTEMPTS", "Попытки по этому заданию исчерпаны");
    }

    // Одноразовый токен сессии камеры
    const session = await prisma.captureSession.findUnique({ where: { token: captureToken || "" } });
    if (!session || session.assignmentId !== assignment.id || session.usedAt || session.expiresAt < new Date()) {
      throw badRequest("NO_CAPTURE_TOKEN", "Снимок не подтверждён сессией камеры. Откройте камеру в приложении.");
    }
    await prisma.captureSession.update({ where: { id: session.id }, data: { usedAt: new Date() } });

    const result = await processSubmission({
      user: req.user,
      assignment,
      task: assignment.task,
      buffer: req.file.buffer,
      clientMeta,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

submissionsRouter.delete("/:id", async (req, res, next) => {
  try {
    const s = await prisma.submission.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!s) throw notFound("Отправка не найдена");
    await prisma.submission.update({ where: { id: s.id }, data: { hiddenFromUser: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get("/history", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const take = 20;
    const [items, total] = await Promise.all([
      prisma.submission.findMany({
        where: { userId: req.user.id, hiddenFromUser: false },
        include: { task: { select: { title: true, category: true, difficulty: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.submission.count({ where: { userId: req.user.id, hiddenFromUser: false } }),
    ]);

    res.json({
      page,
      total,
      pages: Math.ceil(total / take),
      items: items.map((s) => ({
        id: s.id,
        status: s.status,
        reasonCode: s.reasonCode,
        score: s.score,
        confidence: s.confidence,
        createdAt: s.createdAt,
        task: s.task,
        thumbUrl: `/api/photos/${s.id}?variant=thumb`,
      })),
    });
  } catch (err) {
    next(err);
  }
});

submissionsRouter.get("/:id", async (req, res, next) => {
  try {
    const s = await prisma.submission.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { task: true },
    });
    if (!s) throw notFound("Отправка не найдена");
    res.json({
      submission: {
        id: s.id,
        status: s.status,
        reasonCode: s.reasonCode,
        score: s.score,
        breakdown: fromJson(s.breakdown, null),
        confidence: s.confidence,
        blurScore: s.blurScore,
        latencyMs: s.latencyMs,
        createdAt: s.createdAt,
        ai: fromJson(s.aiVerdict, null),
        task: { id: s.task.id, title: s.task.title, description: s.task.description },
        photoUrl: `/api/photos/${s.id}`,
      },
    });
  } catch (err) {
    next(err);
  }
});
