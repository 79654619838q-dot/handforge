// Звания детектива — по сумме звёзд за все дела (максимум 90).
export const RANKS = [
  { stars: 0, name: 'Стажёр' },
  { stars: 3, name: 'Младший детектив' },
  { stars: 8, name: 'Детектив' },
  { stars: 15, name: 'Старший детектив' },
  { stars: 24, name: 'Инспектор' },
  { stars: 36, name: 'Старший инспектор' },
  { stars: 50, name: 'Майор угрозыска' },
  { stars: 66, name: 'Полковник угрозыска' },
  { stars: 82, name: 'Легенда розыска' },
];

export function rankOf(stars) {
  let i = 0;
  while (i + 1 < RANKS.length && stars >= RANKS[i + 1].stars) i++;
  const next = RANKS[i + 1] || null;
  return { i, name: RANKS[i].name, next, need: next ? next.stars - stars : 0 };
}
