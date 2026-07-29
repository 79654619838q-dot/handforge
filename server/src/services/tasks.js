import { prisma, toJson } from "../lib/prisma.js";
import { config } from "../config.js";
import { generateTasks } from "./ai.js";
import { basePoints } from "./scoring.js";
import crypto from "node:crypto";

/** Наполнение пула. Вызывается cron-ом и вручную из админки. */
export async function refillPool({ count = 12, city = null } = {}) {
  const existing = await prisma.task.findMany({ select: { title: true }, take: 200, orderBy: { createdAt: "desc" } });
  const drafts = await generateTasks({ count, city, exclude: existing.map((t) => t.title) });

  const norm = (s) => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
  const known = new Set(existing.map((t) => norm(t.title)));

  const created = [];
  for (const d of drafts) {
    if (known.has(norm(d.title))) continue;
    known.add(norm(d.title));
    created.push(
      await prisma.task.create({
        data: {
          title: d.title,
          description: d.description,
          category: d.category,
          difficulty: d.difficulty,
          points: basePoints(d.difficulty),
          timeLimitSec: d.timeLimitSec,
          criteria: toJson(d.criteria),
          source: "AI",
        },
      })
    );
  }
  return created;
}

export async function ensurePool() {
  const active = await prisma.task.count({ where: { active: true } });
  if (active < config.rules.taskPoolMin) {
    const need = Math.min(24, config.rules.taskPoolMin - active);
    return refillPool({ count: need });
  }
  return [];
}

/** Подбор следующего задания: сложность по уровню, приоритет невиданным. */
export async function pickTaskFor(user, { excludeIds = [] } = {}) {
  const maxDifficulty = user.level >= 5 ? 5 : user.level >= 3 ? 4 : 3;

  const seen = await prisma.assignment.findMany({
    where: { userId: user.id },
    select: { taskId: true },
    take: 200,
    orderBy: { issuedAt: "desc" },
  });
  const seenIds = new Set([...seen.map((s) => s.taskId), ...excludeIds]);

  const pool = await prisma.task.findMany({
    where: { active: true, difficulty: { lte: maxDifficulty } },
    take: 300,
  });
  const fresh = pool.filter((t) => !seenIds.has(t.id));
  const source = fresh.length ? fresh : pool;
  if (!source.length) return null;
  return source[Math.floor(Math.random() * source.length)];
}

export async function issueAssignment(user, task) {
  await prisma.assignment.updateMany({
    where: { userId: user.id, status: "ACTIVE" },
    data: { status: "CANCELLED", closedAt: new Date() },
  });

  return prisma.assignment.create({
    data: {
      userId: user.id,
      taskId: task.id,
      nonce: crypto.randomBytes(16).toString("hex"),
      expiresAt: new Date(Date.now() + task.timeLimitSec * 1000),
    },
    include: { task: true },
  });
}

/** Закрывает просроченные выдачи. Вызывается при чтении и по cron. */
export async function expireStale(userId = null) {
  const where = { status: "ACTIVE", expiresAt: { lt: new Date() } };
  if (userId) where.userId = userId;
  await prisma.assignment.updateMany({ where, data: { status: "EXPIRED", closedAt: new Date() } });
}
