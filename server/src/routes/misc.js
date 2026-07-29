import { Router } from "express";
import { prisma, fromJson } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const achievementsRouter = Router();
export const notificationsRouter = Router();

achievementsRouter.use(requireAuth);
notificationsRouter.use(requireAuth);

achievementsRouter.get("/", async (req, res, next) => {
  try {
    const [all, mine] = await Promise.all([
      prisma.achievement.findMany(),
      prisma.userAchievement.findMany({ where: { userId: req.user.id } }),
    ]);
    const unlocked = new Map(mine.map((m) => [m.achievementId, m.unlockedAt]));

    res.json({
      achievements: all.map((a) => ({
        code: a.code,
        title: a.title,
        description: a.description,
        icon: a.icon,
        points: a.points,
        rule: fromJson(a.rule, {}),
        unlockedAt: unlocked.get(a.id) || null,
        progress: progressFor(fromJson(a.rule, {}), req.user),
      })),
      unlockedCount: mine.length,
      total: all.length,
    });
  } catch (err) {
    next(err);
  }
});

function progressFor(rule, user) {
  if (rule.type === "approved_count") {
    return { current: user.submissionsApproved, target: rule.value };
  }
  if (rule.type === "streak") {
    return { current: user.bestStreak, target: rule.value };
  }
  return null;
}

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const items = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unread = items.filter((i) => !i.read).length;
    res.json({ items: items.map((i) => ({ ...i, data: fromJson(i.data, null) })), unread });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/read", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    await prisma.notification.updateMany({
      where: { userId: req.user.id, ...(ids ? { id: { in: ids } } : {}) },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
