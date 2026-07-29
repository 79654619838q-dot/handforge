import { Router } from "express";
import { prisma, fromJson } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { notFound, badRequest } from "../lib/errors.js";
import { issueAssignment, expireStale, ensurePool, pickTaskFor } from "../services/tasks.js";
import { getGameStatus } from "../services/game.js";

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const publicTask = (t) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  category: t.category,
  difficulty: t.difficulty,
  points: t.points,
  timeLimitSec: t.timeLimitSec,
  criteria: fromJson(t.criteria, {}),
});

tasksRouter.get("/", async (req, res, next) => {
  try {
    const game = await getGameStatus();
    if (!game.active) return res.json({ tasks: [], maxDifficulty: 0, gameActive: false });

    await ensurePool().catch(() => {});
    const maxDifficulty = req.user.level >= 5 ? 5 : req.user.level >= 3 ? 4 : 3;
    const where = { active: true, difficulty: { lte: maxDifficulty } };
    if (req.query.category) where.category = String(req.query.category);
    if (req.query.difficulty) where.difficulty = Number(req.query.difficulty);

    const done = await prisma.assignment.findMany({
      where: { userId: req.user.id, status: "DONE" },
      select: { taskId: true },
    });
    if (done.length) where.id = { notIn: done.map((d) => d.taskId) };

    const tasks = await prisma.task.findMany({ where, take: 60, orderBy: { createdAt: "desc" } });
    res.json({ tasks: tasks.map(publicTask), maxDifficulty, gameActive: true });
  } catch (err) {
    next(err);
  }
});

tasksRouter.get("/:id", async (req, res, next) => {
  try {
    const game = await getGameStatus();
    if (!game.active) throw badRequest("GAME_STOPPED", "Игра сейчас не идёт");
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFound("Задание не найдено");
    res.json({ task: publicTask(task) });
  } catch (err) {
    next(err);
  }
});

tasksRouter.post("/:id/accept", async (req, res, next) => {
  try {
    const game = await getGameStatus();
    if (!game.active) throw badRequest("GAME_STOPPED", "Игра сейчас не идёт — дождитесь старта");
    await expireStale(req.user.id);
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task || !task.active) throw notFound("Задание недоступно");
    if (task.difficulty > (req.user.level >= 5 ? 5 : req.user.level >= 3 ? 4 : 3)) {
      throw badRequest("LEVEL_TOO_LOW", "Это задание откроется на следующем уровне");
    }
    const already = await prisma.assignment.findFirst({
      where: { userId: req.user.id, taskId: task.id, status: "DONE" },
    });
    if (already) throw badRequest("ALREADY_DONE", "Вы уже выполнили это задание");

    const assignment = await issueAssignment(req.user, task);
    res.status(201).json({
      assignment: {
        id: assignment.id,
        nonce: assignment.nonce,
        issuedAt: assignment.issuedAt,
        expiresAt: assignment.expiresAt,
        attempts: assignment.attempts,
        task: publicTask(assignment.task),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Взять случайное подходящее задание — кнопка «Дайте любое». */
tasksRouter.post("/random/accept", async (req, res, next) => {
  try {
    const game = await getGameStatus();
    if (!game.active) throw badRequest("GAME_STOPPED", "Игра сейчас не идёт — дождитесь старта");
    await ensurePool().catch(() => {});
    const task = await pickTaskFor(req.user);
    if (!task) throw notFound("Пул заданий пуст. Админ может пополнить его в панели.");
    const assignment = await issueAssignment(req.user, task);
    res.status(201).json({
      assignment: {
        id: assignment.id,
        nonce: assignment.nonce,
        issuedAt: assignment.issuedAt,
        expiresAt: assignment.expiresAt,
        attempts: assignment.attempts,
        task: publicTask(assignment.task),
      },
    });
  } catch (err) {
    next(err);
  }
});
