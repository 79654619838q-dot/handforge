import { Router } from "express";
import crypto from "node:crypto";
import { prisma, fromJson } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { notFound, badRequest } from "../lib/errors.js";
import { expireStale } from "../services/tasks.js";
import { getGameStatus } from "../services/game.js";

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

const shape = (a) => ({
  id: a.id,
  nonce: a.nonce,
  status: a.status,
  attempts: a.attempts,
  attemptsLeft: Math.max(0, config.rules.maxAttempts - a.attempts),
  issuedAt: a.issuedAt,
  expiresAt: a.expiresAt,
  task: {
    id: a.task.id,
    title: a.task.title,
    description: a.task.description,
    category: a.task.category,
    difficulty: a.task.difficulty,
    points: a.task.points,
    timeLimitSec: a.task.timeLimitSec,
    criteria: fromJson(a.task.criteria, {}),
  },
});

assignmentsRouter.get("/active", async (req, res, next) => {
  try {
    await expireStale(req.user.id);
    const assignment = await prisma.assignment.findFirst({
      where: { userId: req.user.id, status: "ACTIVE" },
      include: { task: true },
      orderBy: { issuedAt: "desc" },
    });
    res.json({ assignment: assignment ? shape(assignment) : null });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.post("/:id/cancel", async (req, res, next) => {
  try {
    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.id, userId: req.user.id, status: "ACTIVE" },
    });
    if (!assignment) throw notFound("Активное задание не найдено");

    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: "CANCELLED", closedAt: new Date() },
    });
    await prisma.user.update({ where: { id: req.user.id }, data: { streak: 0 } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Токен сессии камеры: без него сабмит не принимается. */
assignmentsRouter.post("/:id/capture-session", async (req, res, next) => {
  try {
    const game = await getGameStatus();
    if (!game.active) throw badRequest("GAME_STOPPED", "Игра сейчас не идёт");
    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.id, userId: req.user.id, status: "ACTIVE" },
    });
    if (!assignment) throw notFound("Активное задание не найдено");
    if (new Date(assignment.expiresAt) < new Date()) {
      throw badRequest("TASK_EXPIRED", "Время задания истекло");
    }

    const ttl = config.rules.captureTokenTtlSec;
    const session = await prisma.captureSession.create({
      data: {
        userId: req.user.id,
        assignmentId: assignment.id,
        token: crypto.randomBytes(24).toString("hex"),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    res.status(201).json({ captureToken: session.token, ttl });
  } catch (err) {
    next(err);
  }
});
