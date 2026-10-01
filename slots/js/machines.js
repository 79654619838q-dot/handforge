// Автоматы: символы, выплаты, правила бесплатных вращений.
// Картинки символов — assets/<автомат>/<символ>.webp (из ChatGPT, см. tools/build_assets.py);
// пока файла нет, барабан рисует запасной значок (emoji на цветной плашке).
//
// Выплаты линий — в ставках на линию (общая ставка / 20) за 3, 4, 5 одинаковых слева направо.
// Выплаты «Бонуса» — в общих ставках за 3, 4, 5 штук в любом месте.
// Отдача выверена прогоном tools/sim.mjs — после правки чисел или весов прогнать заново и записать итог сюда.
// 01.10.2026, 2 млн вращений на автомат, ставка 100: без джекпота 80–84%, с джекпотом ≈ 96–101%
// (джекпот при больших ставках весит меньше); выигрыш в 35% вращений, бесплатные раз в ~120,
// джекпот раз в ~3 400 вращений.

// Номер версии картинок: картинки кэшируются браузером на неделю — после замены файлов увеличить
export const V = '?v=1';
export const asset = (path) => 'assets/' + path + V;

// Общие для всех автоматов значки
export const COMMON = {
  jackpot: { name: 'Джекпот', img: asset('common/jackpot.webp'), emoji: '👑', color: '#f5c542', label: 'ДЖЕКПОТ' },
};

// веса символов на барабанах (сколько штук на ленте); wild на первом барабане нет
const W = {
  //        1   2   3   4   5
  h1:      [3,  3,  3,  3,  3],
  h2:      [4,  4,  4,  4,  4],
  h3:      [5,  5,  5,  5,  5],
  l1:      [6,  6,  6,  6,  6],
  l2:      [7,  7,  7,  7,  7],
  l3:      [8,  8,  8,  8,  8],
  l4:      [8,  8,  8,  8,  8],
  wild:    [0,  2,  2,  2,  2],
  scatter: [1,  2,  2,  2,  1],
  jackpot: [3,  3,  3,  3,  3],
};

const PAY = {
  h1: [0, 0, 0, 50, 200, 1000],
  h2: [0, 0, 0, 30, 120, 500],
  h3: [0, 0, 0, 25, 80, 300],
  l1: [0, 0, 0, 12, 40, 150],
  l2: [0, 0, 0, 10, 30, 120],
  l3: [0, 0, 0, 8, 24, 80],
  l4: [0, 0, 0, 6, 18, 60],
};

export const MACHINES = [
  {
    id: 'egypt',
    title: 'Сокровища фараона',
    tagline: 'Гробницы, золото и древние боги',
    seed: 1101,
    weights: W,
    pay: PAY,
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 15, 20, 25],
    // все выигрыши в бесплатных вращениях ×3
    fs: { mode: 'mult', mult: 3, text: 'Все выигрыши ×3' },
    symbols: {
      wild:    { name: 'Маска фараона', emoji: '🗿', color: '#e8b33a', label: 'WILD' },
      scatter: { name: 'Пирамида', emoji: '🔺', color: '#f0d27a', label: 'БОНУС' },
      h1: { name: 'Клеопатра', emoji: '👸', color: '#c9a227' },
      h2: { name: 'Анубис', emoji: '🐺', color: '#3a3a5c' },
      h3: { name: 'Око Гора', emoji: '👁️', color: '#2a62c9' },
      l1: { name: 'Анх', emoji: '☥', color: '#c23b3b' },
      l2: { name: 'Скарабей', emoji: '🪲', color: '#1f9e8a' },
      l3: { name: 'Лотос', emoji: '🪷', color: '#4a7fd6' },
      l4: { name: 'Кошка Бастет', emoji: '🐈‍⬛', color: '#3b3048' },
    },
  },
  {
    id: 'pirate',
    title: 'Остров пиратов',
    tagline: 'Сундуки, корабли и карта сокровищ',
    seed: 2202,
    weights: W,
    pay: PAY,
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 12, 16, 20],
    // каждый капитан в выигрышной линии утраивает её (два — ×9)
    fs: { mode: 'wildMult', mult: 3, text: 'Каждый капитан в линии утраивает выигрыш' },
    symbols: {
      wild:    { name: 'Капитан', emoji: '🏴‍☠️', color: '#8a2b2b', label: 'WILD' },
      scatter: { name: 'Карта сокровищ', emoji: '🗺️', color: '#d9b26a', label: 'БОНУС' },
      h1: { name: 'Галеон', emoji: '⛵', color: '#3b2a1e' },
      h2: { name: 'Попугай', emoji: '🦜', color: '#c0392b' },
      h3: { name: 'Сундук', emoji: '💰', color: '#b8860b' },
      l1: { name: 'Череп и сабли', emoji: '☠️', color: '#555' },
      l2: { name: 'Компас', emoji: '🧭', color: '#a07a3a' },
      l3: { name: 'Подзорная труба', emoji: '🔭', color: '#7a5a2a' },
      l4: { name: 'Якорь', emoji: '⚓', color: '#2c4a63' },
    },
  },
  {
    id: 'space',
    title: 'Звёздная удача',
    tagline: 'Ракеты, пришельцы и далёкие планеты',
    seed: 3303,
    weights: W,
    pay: PAY,
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 8, 12, 15],
    // множитель растёт на 1 с каждым бесплатным вращением: ×1, ×2, ×3…
    fs: { mode: 'grow', start: 1, step: 1, text: 'Множитель растёт с каждым вращением: ×1, ×2, ×3…' },
    symbols: {
      wild:    { name: 'Космонавт', emoji: '👨‍🚀', color: '#d4a017', label: 'WILD' },
      scatter: { name: 'Чёрная дыра', emoji: '🌀', color: '#6a3dc9', label: 'БОНУС' },
      h1: { name: 'Ракета', emoji: '🚀', color: '#c0392b' },
      h2: { name: 'Пришелец', emoji: '👽', color: '#27ae60' },
      h3: { name: 'НЛО', emoji: '🛸', color: '#7f8c8d' },
      l1: { name: 'Сатурн', emoji: '🪐', color: '#e67e22' },
      l2: { name: 'Робот', emoji: '🤖', color: '#2c7fb8' },
      l3: { name: 'Метеорит', emoji: '☄️', color: '#d35400' },
      l4: { name: 'Кристалл', emoji: '💎', color: '#8e44ad' },
    },
  },
];

for (const m of MACHINES) {
  for (const [id, s] of Object.entries(m.symbols)) s.img ||= asset(`${m.id}/${id}.webp`);
  m.symbols.jackpot = COMMON.jackpot;
}

export const byId = (id) => MACHINES.find((m) => m.id === id);

// Ставки (всего за вращение, 20 линий) и стартовые деньги
export const BETS = [20, 40, 100, 200, 500, 1000, 2000];
export const DEFAULT_BET = 100;
export const START_BALANCE = 10000;
export const GIFT = 10000;
// Джекпот общий для всех автоматов: стартует с JACKPOT_SEED и растёт на долю каждой ставки
export const JACKPOT_SEED = 50000;
export const JACKPOT_SHARE = 0.02;
