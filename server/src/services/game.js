import { prisma } from "../lib/prisma.js";

/** Текущее состояние игры с учётом истечения времени. */
export async function getGameStatus() {
  const row = await prisma.gameSession.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main", active: false },
  });

  const expired = row.active && row.endsAt && new Date(row.endsAt) <= new Date();
  if (expired) {
    await prisma.gameSession.update({ where: { id: "main" }, data: { active: false } });
    return { active: false, startedAt: row.startedAt, endsAt: row.endsAt, verificationMode: row.verificationMode };
  }

  return { active: row.active, startedAt: row.startedAt, endsAt: row.endsAt, verificationMode: row.verificationMode };
}

export async function startGame(durationMinutes) {
  const now = new Date();
  const endsAt = durationMinutes ? new Date(now.getTime() + durationMinutes * 60_000) : null;
  return prisma.gameSession.upsert({
    where: { id: "main" },
    update: { active: true, startedAt: now, endsAt },
    create: { id: "main", active: true, startedAt: now, endsAt },
  });
}

export async function stopGame() {
  return prisma.gameSession.upsert({
    where: { id: "main" },
    update: { active: false },
    create: { id: "main", active: false },
  });
}

/** Режим проверки фото: AI_ONLY | AI_PLUS_ADMIN | MANUAL_ONLY. */
export async function getVerificationMode() {
  const row = await prisma.gameSession.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main", active: false },
  });
  return row.verificationMode;
}

export async function setVerificationMode(mode) {
  return prisma.gameSession.upsert({
    where: { id: "main" },
    update: { verificationMode: mode },
    create: { id: "main", active: false, verificationMode: mode },
  });
}
