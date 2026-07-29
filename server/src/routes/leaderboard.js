import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const leaderboardRouter = Router();
leaderboardRouter.use(requireAuth);

/**
 * Периоды: all — по денормализованным очкам, week/month — агрегация сабмитов.
 * В проде week/month переезжают в Redis ZSET (docs/01-architecture.md).
 */
leaderboardRouter.get("/", async (req, res, next) => {
  try {
    const period = ["week", "month", "all"].includes(req.query.period) ? req.query.period : "all";
    const limit = Math.min(100, Number(req.query.limit) || 50);

    if (period === "all") {
      const users = await prisma.user.findMany({
        where: { banned: false, riskScore: { lt: 40 } },
        orderBy: { points: "desc" },
        take: limit,
        select: { id: true, username: true, avatarColor: true, points: true, level: true, submissionsApproved: true },
      });
      const above = await prisma.user.count({
        where: { points: { gt: req.user.points }, banned: false, riskScore: { lt: 40 } },
      });
      return res.json({
        period,
        entries: users.map((u, i) => ({ rank: i + 1, ...u, score: u.points })),
        me: { rank: above + 1, score: req.user.points },
      });
    }

    const days = period === "week" ? 7 : 30;
    const since = new Date(Date.now() - days * 864e5);
    const grouped = await prisma.submission.groupBy({
      by: ["userId"],
      where: { status: "APPROVED", createdAt: { gte: since } },
      _sum: { score: true },
      orderBy: { _sum: { score: "desc" } },
      take: limit,
    });

    const users = await prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) }, banned: false, riskScore: { lt: 40 } },
      select: { id: true, username: true, avatarColor: true, level: true },
    });
    const map = new Map(users.map((u) => [u.id, u]));

    const entries = grouped
      .filter((g) => map.has(g.userId))
      .map((g, i) => ({ rank: i + 1, ...map.get(g.userId), score: g._sum.score || 0 }));

    const mine = entries.find((e) => e.id === req.user.id);
    const myScore = await prisma.submission.aggregate({
      where: { userId: req.user.id, status: "APPROVED", createdAt: { gte: since } },
      _sum: { score: true },
    });

    res.json({
      period,
      entries,
      me: { rank: mine?.rank ?? null, score: myScore._sum.score || 0 },
    });
  } catch (err) {
    next(err);
  }
});
