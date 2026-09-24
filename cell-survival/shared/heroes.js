// Герои для ботов: имя, тело (Rocketbox), пол. Общий файл для браузера и сервера комнат (без three.js).
// Полное описание героев (костюм, снаряжение, сила) — src/managers/heroes.js; id должны совпадать.
export const HERO_BOTS = [
  ['forge', 'Горн', 'Military_Male_01', 'male'], ['volta', 'Вольта', 'Sports_Female_02', 'female'],
  ['kronos', 'Кронос', 'Business_Male_05', 'male'], ['abyss', 'Бездна', 'Male_Adult_17', 'male'],
  ['frost', 'Стужа', 'Female_Adult_11', 'female'], ['phoenix', 'Феникс', 'Female_Adult_04', 'female'],
  ['bastion', 'Бастион', 'Military_Female_01', 'female'], ['neuron', 'Нейрон', 'Male_Adult_10', 'male'],
  ['graviton', 'Гравитон', 'Female_Adult_12', 'female'], ['rune', 'Руна', 'Female_Adult_07', 'female'],
  ['phantom', 'Призрак', 'Male_Adult_04', 'male'], ['mirage', 'Мираж', 'Business_Female_02', 'female'],
];
// бот-герой, которого ещё нет среди занятых имён
export function pickHeroBot(usedNames = new Set()) {
  const free = HERO_BOTS.filter(([, name]) => !usedNames.has(name));
  if (!free.length) return null;
  const [hero, name, person, gender] = free[Math.floor(Math.random() * free.length)];
  return { name, profile: { hero, person, gender, background: 'violet' } };
}
