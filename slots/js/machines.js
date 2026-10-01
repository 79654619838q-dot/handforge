// Автоматы: символы, выплаты, правила бесплатных вращений и «фирменные» помощники.
// Картинки символов — assets/<автомат>/<символ>.webp (из ChatGPT, см. tools/build_assets.py);
// пока файла нет, барабан рисует запасной значок (emoji на цветной плашке).
//
// Выплаты линий — в ставках на линию (общая ставка / 20) за 3, 4, 5 одинаковых слева направо.
// Выплаты «Бонуса» — в общих ставках за 3, 4, 5 штук в любом месте.
// Отдача выверена прогоном tools/sim.mjs — после правки чисел или весов прогнать заново и записать итог сюда.
// 01.10.2026 (все три помощника в каждом автомате), 2 млн вращений на автомат, ставка 100:
//   без Гранда 87–90%, с Грандом ≈ 97–99,5% (Гранд при больших ставках весит меньше); выигрыш в 28% вращений;
//   бесплатные раз в ~193 (40–47 ставок за раунд, «Купить бонус» за 50 отдаёт в среднем 39–47);
//   сундуки раз в ~440 (24 ставки), джекпот-игра раз в ~120, Гранд раз в 6–7 тыс.; подарок WILD раз в 40.
//   Ценность бесплатных резко растёт с их числом (липкие WILD копятся): +2 вращения ≈ +40% — менять осторожно.

// Номер версии картинок: картинки кэшируются браузером на неделю — после замены файлов увеличить
export const V = '?v=1';
export const asset = (path) => 'assets/' + path + V;

// Общие для всех автоматов значки
const C = (file) => asset(`common/${file}.webp`);
export const COMMON = {
  logo: asset('common/logo.webp'),
  coin: C('coin'), gift: C('gift'), pile: C('pile'), crown: C('jackpot'),
  chestOpen: C('chest_open'), wheel: C('wheel'), medal: C('medal'), star: C('star'), fire: C('fire'), bolt: C('bolt'),
};
const SHARED_SYMBOLS = {
  jackpot: { name: 'Корона', img: C('jackpot'), emoji: '👑', color: '#f5c542', label: 'ДЖЕКПОТ' },
  pick:    { name: 'Сундук', img: C('chest'), emoji: '🧰', color: '#b8741a', label: 'СУНДУК' },
  x2:      { name: 'Множитель ×2', img: C('orb'), emoji: '', color: '#ffb02e', mult: 2, text: '×2' },
  x3:      { name: 'Множитель ×3', img: C('orb'), emoji: '', color: '#ff7a2e', mult: 3, text: '×3' },
  x5:      { name: 'Множитель ×5', img: C('orb'), emoji: '', color: '#ff3e6a', mult: 5, text: '×5' },
  mystery: { name: 'Таинственный «?»', img: C('mystery'), emoji: '❓', color: '#7a3dff', text: '?' },
};
export const MULT_SYMS = ['x2', 'x3', 'x5'];
export const REGULAR = ['h1', 'h2', 'h3', 'l1', 'l2', 'l3', 'l4'];

// веса символов на барабанах (сколько штук на ленте)
//                1  2  3  4  5
const BASE_W = {
  h1:           [6, 6, 6, 6, 6],
  h2:           [8, 8, 8, 8, 8],
  h3:           [10, 10, 10, 10, 10],
  l1:           [12, 12, 12, 12, 12],
  l2:           [14, 14, 14, 14, 14],
  l3:           [14, 14, 14, 14, 14],
  l4:           [16, 16, 16, 16, 16],
  wild:         [0, 3, 3, 3, 3],   // на первом барабане WILD нет
  scatter:      [2, 3, 3, 3, 2],
  jackpot:      [3, 3, 3, 3, 3],
  pick:         [4, 0, 4, 0, 4],   // сундуки только на 1, 3, 5 барабанах
  x2:           [0, 0, 1, 0, 0],
  x3:           [0, 0, 0, 1, 0],
  x5:           [0, 1, 0, 0, 0],
};
const w = (over) => ({ ...BASE_W, ...over });

// k — масштаб выплат автомата (подбирается прогоном sim.mjs)
const scale = (pay, k) => Object.fromEntries(Object.entries(pay).map(([id, a]) => [id, a.map((v) => (v ? Math.max(1, Math.round(v * k)) : 0))]));
const PAY = {
  h1: [0, 0, 0, 30, 110, 550],
  h2: [0, 0, 0, 18, 70, 280],
  h3: [0, 0, 0, 15, 40, 175],
  l1: [0, 0, 0, 7, 20, 80],
  l2: [0, 0, 0, 6, 18, 70],
  l3: [0, 0, 0, 5, 14, 50],
  l4: [0, 0, 0, 4, 10, 35],
};

const EGYPT_K = 1.15, PIRATE_K = 1.28, SPACE_K = 1.15;

export const MACHINES = [
  {
    id: 'egypt',
    title: 'Сокровища фараона',
    tagline: 'Гробницы, золото и древние боги',
    seed: 1101,
    weights: w({ wild: [0, 1, 1, 1, 0], mystery: [3, 3, 3, 3, 3] }),
    // в бесплатных вращениях свои ленты
    fsWeights: w({ wild: [0, 2, 2, 2, 0], mystery: [3, 3, 3, 3, 3] }),
    pay: scale(PAY, EGYPT_K),
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 10, 12, 15],
    features: { expand: true, sticky: true, mystery: true },
    stacks: { mystery: 3 },
    feature: 'WILD на весь барабан, липкие WILD в бесплатных вращениях и таинственный «?»',
    fs: { mode: 'mult', mult: 3, text: 'Все выигрыши ×3, маски прилипают до конца раунда' },
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
    weights: w({ wild: [0, 1, 1, 1, 0], mystery: [3, 3, 3, 3, 3] }),
    fsWeights: w({ wild: [0, 2, 2, 2, 0], mystery: [3, 3, 3, 3, 3] }),
    pay: scale(PAY, PIRATE_K),
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 8, 10, 12],
    features: { expand: true, sticky: true, mystery: true },
    stacks: { mystery: 3 },
    feature: 'WILD на весь барабан, липкие WILD в бесплатных вращениях и таинственный «?»',
    fs: { mode: 'wildMult', mult: 2, text: 'Капитаны прилипают до конца раунда, и каждый в линии удваивает её' },
    symbols: {
      wild:    { name: 'Капитан', emoji: '🏴‍☠️', color: '#8a2b2b', label: 'WILD' },
      scatter: { name: 'Карта сокровищ', emoji: '🗺️', color: '#d9b26a', label: 'БОНУС' },
      h1: { name: 'Галеон', emoji: '⛵', color: '#3b2a1e' },
      h2: { name: 'Попугай', emoji: '🦜', color: '#c0392b' },
      h3: { name: 'Сундук с золотом', emoji: '💰', color: '#b8860b' },
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
    // «?» стоят стопками по 3 — бывает, что весь барабан превращается в один символ
    weights: w({ wild: [0, 1, 1, 1, 0], mystery: [3, 3, 3, 3, 3] }),
    fsWeights: w({ wild: [0, 2, 2, 2, 0], mystery: [3, 3, 3, 3, 3] }),
    pay: scale(PAY, SPACE_K),
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 7, 9, 11],
    features: { expand: true, sticky: true, mystery: true },
    stacks: { mystery: 3 },
    feature: 'WILD на весь барабан, липкие WILD в бесплатных вращениях и таинственный «?»',
    fs: { mode: 'grow', start: 1, step: 1, text: 'Множитель растёт с каждым вращением: ×1, ×2, ×3…, WILD прилипают' },
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
  for (const [id, s] of Object.entries(SHARED_SYMBOLS)) if (m.weights[id]?.some((x) => x > 0)) m.symbols[id] = s;
}

export const byId = (id) => MACHINES.find((m) => m.id === id);

// Ставки (всего за вращение, 20 линий) и стартовые деньги
export const BETS = [20, 40, 100, 200, 500, 1000, 2000];
export const DEFAULT_BET = 100;
export const START_BALANCE = 10000;
export const GIFT = 10000;

// Общие для всех помощники
export const GIFT_WILD_CHANCE = 1 / 40;   // «Подарок»: на барабаны прилетают 2–4 WILD (только в обычной игре)
export const STREAK = [[4, 3], [2, 2]];   // горячая серия: после 2 выигрышей подряд ×2, после 4 — ×3
export const BUY_BONUS = 50;              // «Купить бонус» = 50 ставок → бесплатные вращения как за 3 бонуса

// Четыре джекпота. Мини/Малый/Большой — во столько-то ставок, Гранд — общий растущий.
export const JACKPOTS = [
  { id: 'mini', name: 'Мини', bet: 3, color: '#5ad1ff' },
  { id: 'minor', name: 'Малый', bet: 10, color: '#7dff6a' },
  { id: 'major', name: 'Большой', bet: 50, color: '#ff8ff0' },
  { id: 'grand', name: 'Гранд', bet: 0, color: '#ffd84a' },
];
// шансы джекпотов в джекпот-игре по числу корон (3, 4); 5 корон — сразу Гранд
export const JACKPOT_ODDS = {
  3: { mini: 0.635, minor: 0.25, major: 0.10, grand: 0.015 },
  4: { mini: 0.20, minor: 0.40, major: 0.30, grand: 0.10 },
};
export const JACKPOT_SEED = 50000;
export const JACKPOT_SHARE = 0.02;

// «Выбери сундук»: 12 сундуков, внутри призы (в ставках), «×2 ко всему» и два «Забрать»
export const PICK = { size: 12, prizes: [1, 1, 2, 2, 3, 3, 4, 5, 6, 8, 10, 15], double: 1, collect: 2 };
