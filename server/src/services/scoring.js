/** Очки, уровни, серии. Формулы описаны в docs/07-gameplay.md. */

export const basePoints = (difficulty) => difficulty * difficulty * 10 + 20;

export function calcScore({ task, assignment, streak, now = new Date() }) {
  const base = task.points || basePoints(task.difficulty);

  const total = task.timeLimitSec * 1000;
  const used = Math.max(0, now.getTime() - new Date(assignment.issuedAt).getTime());
  const ratio = Math.min(1, used / total);
  // первые 20% времени → множитель 1.3, к концу → 1.0
  const speedMultiplier = ratio <= 0.2 ? 1.3 : Math.max(1, 1.3 - ((ratio - 0.2) / 0.8) * 0.3);

  const streakBonus = Math.min(streak, 10) * 5;
  const speedPart = Math.round(base * speedMultiplier) - base;
  const score = Math.round(base * speedMultiplier) + streakBonus;

  return {
    score,
    breakdown: {
      base,
      speed: speedPart,
      streak: streakBonus,
      speedMultiplier: Math.round(speedMultiplier * 100) / 100,
      usedRatio: Math.round(ratio * 100) / 100,
    },
  };
}

export const xpForLevel = (level) => Math.round(100 * Math.pow(level, 1.6));

export function levelForXp(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1) && level < 100) level++;
  return level;
}

export function levelProgress(xp) {
  const level = levelForXp(xp);
  const current = level === 1 ? 0 : xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    current: xp - current,
    needed: next - current,
    percent: Math.min(100, Math.round(((xp - current) / (next - current)) * 100)),
  };
}
