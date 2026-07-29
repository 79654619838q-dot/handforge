import { prisma, fromJson } from "../lib/prisma.js";

/**
 * Правила декларативные — новое достижение добавляется строкой в БД.
 * Типы: approved_count | streak | speed_ratio | category_sweep | time_window |
 *       difficulty_count | clean_run
 */
export async function checkAchievements(userId, context = {}) {
  const [user, all, owned] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.achievement.findMany(),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true } }),
  ]);
  if (!user) return [];

  const ownedIds = new Set(owned.map((o) => o.achievementId));
  const unlocked = [];

  for (const ach of all) {
    if (ownedIds.has(ach.id)) continue;
    const rule = fromJson(ach.rule, {});
    if (await matches(rule, user, context)) {
      await prisma.userAchievement.create({ data: { userId, achievementId: ach.id } });
      if (ach.points > 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { points: { increment: ach.points } },
        });
      }
      await prisma.notification.create({
        data: {
          userId,
          type: "ACHIEVEMENT",
          title: "Новое достижение",
          body: ach.title,
          data: JSON.stringify({ code: ach.code }),
        },
      });
      unlocked.push({ code: ach.code, title: ach.title, description: ach.description, icon: ach.icon });
    }
  }
  return unlocked;
}

async function matches(rule, user, ctx) {
  switch (rule.type) {
    case "approved_count":
      return user.submissionsApproved >= rule.value;
    case "streak":
      return user.streak >= rule.value;
    case "speed_ratio":
      return (ctx.usedRatio ?? 1) <= rule.value;
    case "difficulty_count": {
      const count = await prisma.submission.count({
        where: { userId: user.id, status: "APPROVED", task: { difficulty: rule.difficulty } },
      });
      return count >= rule.value;
    }
    case "time_window": {
      const hour = new Date().getHours();
      if (hour < rule.from || hour >= rule.to) return false;
      const subs = await prisma.submission.findMany({
        where: { userId: user.id, status: "APPROVED" },
        select: { createdAt: true },
      });
      const inWindow = subs.filter((s) => {
        const h = new Date(s.createdAt).getHours();
        return h >= rule.from && h < rule.to;
      });
      return inWindow.length >= rule.value;
    }
    case "category_sweep": {
      const rows = await prisma.submission.findMany({
        where: { userId: user.id, status: "APPROVED" },
        select: { task: { select: { category: true } } },
      });
      const set = new Set(rows.map((r) => r.task.category));
      return set.size >= (rule.value || 8);
    }
    case "clean_run": {
      const last = await prisma.submission.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: rule.value,
        select: { status: true },
      });
      return last.length >= rule.value && last.every((s) => s.status === "APPROVED");
    }
    default:
      return false;
  }
}
