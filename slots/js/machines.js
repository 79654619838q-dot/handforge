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
// 02.10.2026 новые автоматы (открываются за монеты, чем дороже — тем щедрее), 2 млн вращений, без Гранда:
//   «Сладкая страна» 89%, «Сага викингов» 91%, «Золото ацтеков» 94%; «Купить бонус» везде отдаёт меньше 50.
//   Усилители (`node slots/tools/sim.mjs 2000000 --boost`) возвращают в среднем: «Двойной выигрыш» 79–91% цены,
//   «Магнит» 74–90%, «Горячая рука» 76–90%, «Дождь WILD» 71–88% — ни один не окупается полностью.
// 03.10.2026 «Королевский покер» (js/mega.js, 117 649 способов, каскады), 3 млн вращений, ставка 100:
//   без Гранда 92,7%, с Грандом ≈ 99,9%; бесплатные раз в 179 (42× за раунд, «Купить бонус» отдаёт 42 из 50),
//   роял-флеш раз в ~860, сундуки раз в 410, джекпот-игра раз в 217. Отдача сильно зависит от раскладки лент:
//   смена любого веса перемешивает ленты заново — после правки обязательно перепрогнать 2–3 млн вращений.
//   Усилители здесь: «Двойной» 84% цены, «Магнит» 68%, «Горячая рука» 91%, «Дождь WILD» 28%.

// Номер версии картинок: картинки кэшируются браузером на неделю — после замены файлов увеличить
export const V = '?v=8';
export const asset = (path) => 'assets/' + path + V;

// Общие для всех автоматов значки
const C = (file) => asset(`common/${file}.webp`);
export const COMMON = {
  logo: asset('common/logo.webp'),
  coin: C('coin'), gift: C('gift'), pile: C('pile'), crown: C('jackpot'),
  chestOpen: C('chest_open'), wheel: C('wheel'), medal: C('medal'), star: C('star'), fire: C('fire'), bolt: C('bolt'),
  boostX2: C('boost_x2'), magnet: C('magnet'), hot: C('hot'), rainWild: C('rain_wild'), lock: C('lock'), bag: C('bag'),
  wealth: C('wealth'), hourglass: C('hourglass'), trophy: C('trophy'),
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
// новые автоматы чем дороже, тем щедрее
const CANDY_K = 1.15, VIKING_K = 1.25, AZTEC_K = 1.4;
const BUNNY_K = 1.15;
// «Королевский покер»: способов бывает до 117 649, поэтому за один способ — малая доля ставки (масштаб по sim.mjs)
const POKER_K = 0.033;

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
  {
    id: 'bunny',
    title: 'Весёлые зайчики',
    tagline: 'Морковки, пасхальные яйца и весенняя поляна',
    seed: 7707,
    weights: w({ wild: [0, 1, 1, 1, 0], mystery: [3, 3, 3, 3, 3] }),
    fsWeights: w({ wild: [0, 2, 2, 2, 0], mystery: [3, 3, 3, 3, 3] }),
    pay: scale(PAY, BUNNY_K),
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 9, 11, 13],
    features: { expand: true, sticky: true, mystery: true },
    stacks: { mystery: 3 },
    feature: 'WILD на весь барабан, липкие WILD в бесплатных вращениях и таинственный «?»',
    // каждый новый зайчик-WILD в бесплатных вращениях добавляет +1 к множителю до конца раунда
    fs: { mode: 'collect', max: 10, text: 'Каждый новый зайчик-король добавляет +1 к множителю до конца раунда (до ×10), WILD прилипают' },
    symbols: {
      wild:    { name: 'Зайчик-король', emoji: '🐰', color: '#f5f5f5', label: 'WILD' },
      scatter: { name: 'Норка', emoji: '🕳️', color: '#7cb342', label: 'БОНУС' },
      h1: { name: 'Зайка с цветком', emoji: '🐇', color: '#f48fb1' },
      h2: { name: 'Зайка с морковкой', emoji: '🐇', color: '#a1887f' },
      h3: { name: 'Морковка', emoji: '🥕', color: '#ff9800' },
      l1: { name: 'Пасхальное яйцо', emoji: '🥚', color: '#ab47bc' },
      l2: { name: 'Корзинка', emoji: '🧺', color: '#8d6e63' },
      l3: { name: 'Клубника', emoji: '🍓', color: '#e53935' },
      l4: { name: 'Тюльпан', emoji: '🌷', color: '#fdd835' },
    },
  },

  // ===== открываются за монеты (price) =====
  {
    id: 'candy',
    title: 'Сладкая страна',
    tagline: 'Леденцы, кексы и мармеладные мишки',
    price: 50000,
    bets: [20, 40, 100, 200, 500, 1000, 2000, 5000, 10000],
    seed: 4404,
    weights: w({ wild: [0, 1, 1, 1, 0], mystery: [3, 3, 3, 3, 3] }),
    fsWeights: w({ wild: [0, 2, 2, 2, 0], mystery: [3, 3, 3, 3, 3] }),
    pay: scale(PAY, CANDY_K),
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 10, 12, 15],
    features: { expand: true, sticky: true, mystery: true },
    stacks: { mystery: 3 },
    feature: 'WILD на весь барабан, липкие WILD в бесплатных вращениях и таинственный «?»',
    // в каждом бесплатном вращении — свой случайный множитель
    fs: { mode: 'random', table: { 1: 35, 2: 30, 3: 17, 5: 12, 10: 5, 25: 1 }, text: 'В каждом вращении случайный множитель до ×25, WILD прилипают' },
    symbols: {
      wild:    { name: 'Радужный леденец', emoji: '🍭', color: '#ff5ab4', label: 'WILD' },
      scatter: { name: 'Пряничный домик', emoji: '🏠', color: '#c8762a', label: 'БОНУС' },
      h1: { name: 'Кекс', emoji: '🧁', color: '#ff7aa8' },
      h2: { name: 'Пончик', emoji: '🍩', color: '#a0522d' },
      h3: { name: 'Мармеладный мишка', emoji: '🧸', color: '#e53935' },
      l1: { name: 'Конфета', emoji: '🍬', color: '#1e88e5' },
      l2: { name: 'Макарон', emoji: '🍪', color: '#f48fb1' },
      l3: { name: 'Драже', emoji: '🫘', color: '#43a047' },
      l4: { name: 'Звёздочка', emoji: '⭐', color: '#fb8c00' },
    },
  },
  {
    id: 'viking',
    title: 'Сага викингов',
    tagline: 'Драккары, молот Тора и северное сияние',
    price: 150000,
    bets: [20, 40, 100, 200, 500, 1000, 2000, 5000, 10000, 20000],
    seed: 5505,
    weights: w({ wild: [0, 1, 1, 1, 0], mystery: [3, 3, 3, 3, 3] }),
    fsWeights: w({ wild: [0, 2, 2, 2, 0], mystery: [3, 3, 3, 3, 3] }),
    pay: scale(PAY, VIKING_K),
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 6, 8, 10],
    features: { expand: true, sticky: true, mystery: true },
    stacks: { mystery: 3 },
    feature: 'WILD на весь барабан, липкие WILD в бесплатных вращениях и таинственный «?»',
    fs: { mode: 'wildMult', mult: 3, text: 'WILD прилипают, и каждый в линии утраивает её' },
    symbols: {
      wild:    { name: 'Конунг', emoji: '🧔', color: '#8d6e63', label: 'WILD' },
      scatter: { name: 'Иггдрасиль', emoji: '🌳', color: '#2e7d32', label: 'БОНУС' },
      h1: { name: 'Валькирия', emoji: '🛡️', color: '#90a4ae' },
      h2: { name: 'Драккар', emoji: '⛵', color: '#6d4c41' },
      h3: { name: 'Молот Тора', emoji: '🔨', color: '#5c6bc0' },
      l1: { name: 'Щит', emoji: '🛡️', color: '#8d6e63' },
      l2: { name: 'Секира', emoji: '🪓', color: '#78909c' },
      l3: { name: 'Рог', emoji: '📯', color: '#a1887f' },
      l4: { name: 'Рунный камень', emoji: '🪨', color: '#546e7a' },
    },
  },
  {
    id: 'aztec',
    title: 'Золото ацтеков',
    tagline: 'Храмы джунглей, ягуары и пернатый змей',
    price: 500000,
    bets: [20, 40, 100, 200, 500, 1000, 2000, 5000, 10000, 25000, 50000],
    seed: 6606,
    weights: w({ wild: [0, 1, 1, 1, 0], mystery: [3, 3, 3, 3, 3] }),
    fsWeights: w({ wild: [0, 2, 2, 2, 0], mystery: [6, 6, 6, 6, 6] }),
    pay: scale(PAY, AZTEC_K),
    scatterPay: [0, 0, 0, 2, 10, 50],
    freeSpins: [0, 0, 0, 10, 12, 15],
    features: { expand: true, sticky: true, mystery: true },
    stacks: { mystery: 3 },
    feature: 'WILD на весь барабан, липкие WILD в бесплатных вращениях и таинственный «?»',
    fs: { mode: 'mult', mult: 2, text: 'Все выигрыши ×2, «?» вдвое больше, WILD прилипают' },
    symbols: {
      wild:    { name: 'Император', emoji: '🪶', color: '#e6a817', label: 'WILD' },
      scatter: { name: 'Пирамида-храм', emoji: '🛕', color: '#c9a227', label: 'БОНУС' },
      h1: { name: 'Камень солнца', emoji: '🌞', color: '#d4a017' },
      h2: { name: 'Маска ягуара', emoji: '🐆', color: '#e0a030' },
      h3: { name: 'Пернатый змей', emoji: '🐍', color: '#2e7d32' },
      l1: { name: 'Нефритовая маска', emoji: '🗿', color: '#26a69a' },
      l2: { name: 'Золотой идол', emoji: '🏺', color: '#c9a227' },
      l3: { name: 'Кинжал', emoji: '🗡️', color: '#455a64' },
      l4: { name: 'Кецаль', emoji: '🦜', color: '#43a047' },
    },
  },
  // 6 барабанов разной высоты, до 117 649 способов, каскады — свой движок js/mega.js и свои барабаны js/megareels.js
  {
    id: 'poker',
    title: 'Королевский покер',
    tagline: 'Карты, фишки и VIP-зал казино',
    price: 2000000,
    bets: [20, 40, 100, 200, 500, 1000, 2000, 5000, 10000, 25000, 50000, 100000, 200000],
    seed: 8808,
    mega: true,
    heights: { 2: 1, 3: 2, 4: 3, 5: 3, 6: 2, 7: 1 },   // сколько карт на барабане (по весам)
    //               1  2  3  4  5  6
    weights: {
      h1:      [16, 16, 16, 16, 16, 16],
      h2:      [24, 24, 24, 24, 24, 24],
      h3:      [24, 24, 24, 24, 24, 24],
      l1:      [24, 24, 24, 24, 24, 24],
      l2:      [24, 24, 24, 24, 24, 24],
      l3:      [24, 24, 24, 24, 24, 24],
      l4:      [24, 24, 24, 24, 24, 24],
      wild:    [0, 4, 4, 4, 4, 4],
      w2:      [0, 2, 1, 2, 1, 2],
      w3:      [0, 0, 1, 0, 1, 0],
      w5:      [0, 0, 0, 1, 0, 0],
      scatter: [2, 1, 2, 1, 1, 2],
      jackpot: [1, 2, 1, 2, 1, 2],
      pick:    [3, 0, 3, 0, 2, 0],
    },
    // выплата за способ, в общих ставках, за 3, 4, 5, 6 одинаковых карт
    pay: pokerPay({
      h1: [0, 0, 0, 0.5, 1, 2.5, 5],
      h2: [0, 0, 0, 0.4, 0.8, 1.5, 3],
      h3: [0, 0, 0, 0.3, 0.6, 1.2, 2.5],
      l1: [0, 0, 0, 0.2, 0.4, 0.8, 1.5],
      l2: [0, 0, 0, 0.15, 0.3, 0.6, 1.2],
      l3: [0, 0, 0, 0.1, 0.25, 0.5, 1],
      l4: [0, 0, 0, 0.1, 0.2, 0.4, 0.8],
    }),
    royal: 100,                              // роял-флеш, в ставках
    scatterPay: [0, 0, 0, 1, 5, 20, 100],
    freeSpins: [0, 0, 0, 8, 10, 12, 15],
    features: {},
    feature: '117 649 способов выиграть, каскад карт, Джокер с множителем до ×5 и роял-флеш',
    fs: { mode: 'cascade', text: 'Каждое падение карт добавляет +1 к множителю, и он не сбрасывается до конца раунда' },
    symbols: pokerSymbols(),
  },
];

function pokerPay(pay) {
  return Object.fromEntries(Object.entries(pay).map(([id, a]) => [id, a.map((v) => +(v * POKER_K).toFixed(5))]));
}

// карты «Королевского покера»: у каждой карты своя масть (картинка poker/<ранг><масть>.webp)
function pokerSymbols() {
  const RANKS = { h2: ['Туз', 'A'], h3: ['Король', 'K'], l1: ['Дама', 'Q'], l2: ['Валет', 'J'], l3: ['Десятка', '10'], l4: ['Девятка', '9'] };
  const SUITS = { s: ['пик', '♠', '#26262e'], h: ['червей', '♥', '#c8102e'], d: ['бубен', '♦', '#c8102e'], c: ['треф', '♣', '#26262e'] };
  const joker = asset('poker/wild.webp');
  const out = {
    wild: { name: 'Джокер', emoji: '🃏', color: '#8e44ad', label: 'WILD' },
    w2: { name: 'Джокер ×2', emoji: '🃏', color: '#b0479e', label: 'WILD', mult: 2, text: '×2', img: joker },
    w3: { name: 'Джокер ×3', emoji: '🃏', color: '#d0386e', label: 'WILD', mult: 3, text: '×3', img: joker },
    w5: { name: 'Джокер ×5', emoji: '🃏', color: '#e8282e', label: 'WILD', mult: 5, text: '×5', img: joker },
    scatter: { name: 'Золотая фишка', emoji: '🪙', color: '#d4a017', label: 'БОНУС' },
    h1: { name: 'Стопка фишек', emoji: '💰', color: '#b71c1c' },
  };
  for (const [r, [name, short]] of Object.entries(RANKS)) {
    // карта без масти — для таблицы выплат и подписей (масть на выигрыш не влияет)
    out[r] = { name, emoji: short, color: '#f5efe0', img: asset(`poker/${r}s.webp`) };
    for (const [s, [sn, sign, col]] of Object.entries(SUITS)) out[r + s] = { name: `${name} ${sn}`, emoji: short + sign, color: col, card: true };
  }
  return out;
}

for (const m of MACHINES) {
  for (const [id, s] of Object.entries(m.symbols)) s.img ||= asset(`${m.id}/${id}.webp`);
  for (const [id, s] of Object.entries(SHARED_SYMBOLS)) if (m.weights[id]?.some((x) => x > 0)) m.symbols[id] = s;
}

export const byId = (id) => MACHINES.find((m) => m.id === id);

// Усилители из магазина. price — в ставках: усилитель работает при ставке, при которой куплен, или меньше.
// spins — на сколько обычных (платных) вращений. Цены выверены sim.mjs: усилитель возвращает 85–90% цены.
export const BOOSTERS = [
  { id: 'x2', name: 'Двойной выигрыш', text: 'Выигрыши на линиях и за бонус ×2', spins: 30, price: 20, icon: 'boostX2', emoji: '💰' },
  { id: 'magnet', name: 'Магнит бонусов', text: 'Знак «Бонус» выпадает намного чаще — бесплатные вращения чаще', spins: 40, price: 65, icon: 'magnet', emoji: '🧲' },
  { id: 'hot', name: 'Горячая рука', text: 'Горячая серия не сгорает при проигрыше', spins: 40, price: 48, icon: 'hot', emoji: '❤️‍🔥' },
  { id: 'wilds', name: 'Дождь WILD', text: 'Подарочные WILD прилетают в 5 раз чаще', spins: 50, price: 25, icon: 'rainWild', emoji: '🎁' },
];
export const MAGNET_SCATTER = 2;   // во сколько раз больше знаков «Бонус» на лентах под «Магнитом»
export const RAIN_WILD = 5;        // во сколько раз чаще подарочные WILD под «Дождём WILD»

// Ставки (всего за вращение, 20 линий) и стартовые деньги
export const BETS = [20, 40, 100, 200, 500, 1000, 2000];
export const betsOf = (m) => (m && m.bets) || BETS; // у новых автоматов ставки крупнее
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
// Гранд не меньше стольких ставок — иначе при крупной ставке он был бы меньше «Мини»
export const GRAND_MIN = 500;
export const JACKPOT_SHARE = 0.02;

// «Выбери сундук»: 12 сундуков, внутри призы (в ставках), «×2 ко всему» и два «Забрать»
export const PICK = { size: 12, prizes: [1, 1, 2, 2, 3, 3, 4, 5, 6, 8, 10, 15], double: 1, collect: 2 };
