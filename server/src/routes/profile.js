import { Router } from "express";
import { z } from "zod";
import { prisma, fromJson, toJson } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { publicUser } from "../services/verification.js";
import { levelProgress } from "../services/scoring.js";

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get("/", async (req, res, next) => {
  try {
    const [byCategory, recent, achievementsCount, rank, tasksTotal] = await Promise.all([
      prisma.submission.findMany({
        where: { userId: req.user.id, status: "APPROVED" },
        select: { task: { select: { category: true } }, score: true },
      }),
      prisma.submission.count({
        where: { userId: req.user.id, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } },
      }),
      prisma.userAchievement.count({ where: { userId: req.user.id } }),
      prisma.user.count({ where: { points: { gt: req.user.points }, banned: false } }),
      prisma.task.count({ where: { active: true } }),
    ]);

    const categories = {};
    for (const s of byCategory) {
      const c = s.task.category;
      categories[c] = categories[c] || { count: 0, score: 0 };
      categories[c].count++;
      categories[c].score += s.score;
    }

    const accuracy = req.user.submissionsTotal
      ? Math.round((req.user.submissionsApproved / req.user.submissionsTotal) * 100)
      : 0;

    res.json({
      user: publicUser(req.user),
      settings: fromJson(req.user.settings, {}),
      progress: levelProgress(req.user.xp),
      stats: { accuracy, weekSubmissions: recent, achievements: achievementsCount, rank: rank + 1, categories, tasksTotal },
    });
  } catch (err) {
    next(err);
  }
});

profileRouter.patch("/", async (req, res, next) => {
  try {
    const body = z
      .object({
        username: z.string().min(3).max(20).optional(),
        avatarColor: z.string().max(9).optional(),
        settings: z.record(z.any()).optional(),
      })
      .parse(req.body);

    const data = {};
    if (body.username) data.username = body.username;
    if (body.avatarColor) data.avatarColor = body.avatarColor;
    if (body.settings) data.settings = toJson({ ...fromJson(req.user.settings, {}), ...body.settings });

    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ user: publicUser(user), settings: fromJson(user.settings, {}) });
  } catch (err) {
    next(err);
  }
});

profileRouter.get("/stats", async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 864e5);
    const subs = await prisma.submission.findMany({
      where: { userId: req.user.id, createdAt: { gte: since } },
      select: { createdAt: true, status: true, score: true },
      orderBy: { createdAt: "asc" },
    });

    const byDay = {};
    for (const s of subs) {
      const day = new Date(s.createdAt).toISOString().slice(0, 10);
      byDay[day] = byDay[day] || { day, total: 0, approved: 0, score: 0 };
      byDay[day].total++;
      if (s.status === "APPROVED") {
        byDay[day].approved++;
        byDay[day].score += s.score;
      }
    }
    res.json({ days: Object.values(byDay) });
  } catch (err) {
    next(err);
  }
});
