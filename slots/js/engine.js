// Математика автомата без экрана: ленты барабанов, остановка, помощники, подсчёт выигрыша,
// исходы «Выбери сундук» и джекпот-игры. Тот же код гоняет tools/sim.mjs для проверки отдачи —
// поэтому здесь ни DOM, ни звука. Весь исход вращения решается сразу, экран его только показывает.
import { REGULAR, MULT_SYMS, GIFT_WILD_CHANCE, STREAK, JACKPOT_ODDS, PICK } from './machines.js';

export const REELS = 5;
export const ROWS = 3;

// 20 линий: номер ряда (0 — верх) на каждом из 5 барабанов
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 2, 2, 0],
];

// не бывают на линиях и не заменяются WILD
const NON_LINE = ['scatter', 'jackpot', 'pick', ...MULT_SYMS];
// эти не ставим ближе 3 клеток к такому же — на барабане в окне их не больше одного
const SPACED = ['scatter', 'jackpot', 'pick'];
// во что превращается «?»: чаще в мелкие символы
const MYSTERY_POOL = { h1: 1, h2: 2, h3: 3, l1: 4, l2: 5, l3: 5, l4: 6 };

// Повторяемый генератор для раскладки лент (одна и та же лента у всех и в проверке)
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Честный случай для игры: криптослучай браузера
export function fairRandom() {
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return u[0] / 4294967296;
}

function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weighted(table, rnd) {
  const entries = Object.entries(table);
  let x = rnd() * entries.reduce((s, [, v]) => s + v, 0);
  for (const [k, v] of entries) { if ((x -= v) < 0) return k; }
  return entries[entries.length - 1][0];
}

// Ленты: символы по весам, перемешаны; стопки (machine.stacks) стоят подряд.
// fs = true — ленты бесплатных вращений (machine.fsWeights), если у автомата они свои.
export function buildStrips(machine, fs = false) {
  const weights = (fs && machine.fsWeights) || machine.weights;
  const rnd = seeded(machine.seed + (fs ? 7 : 0));
  const strips = [];
  for (let r = 0; r < REELS; r++) {
    const tokens = [];
    for (const [sym, w] of Object.entries(weights)) {
      const k = machine.stacks?.[sym] || 1;
      for (let i = 0; i < w[r]; i += k) tokens.push(Array(Math.min(k, w[r] - i)).fill(sym));
    }
    let strip;
    for (let attempt = 0; ; attempt++) {
      strip = shuffle(tokens.slice(), rnd).flat();
      if (spacedOk(strip)) break;
      if (attempt > 20000) throw new Error('не удалось расставить ленту ' + r);
    }
    strips.push(strip);
  }
  return strips;
}

function spacedOk(strip) {
  const n = strip.length;
  for (let i = 0; i < n; i++) {
    if (!SPACED.includes(strip[i])) continue;
    for (let d = 1; d < ROWS; d++) if (strip[(i + d) % n] === strip[i]) return false;
  }
  return true;
}

// Множитель i-го бесплатного вращения (с нуля) и множитель за WILD в линии
export function fsMultipliers(machine, i) {
  const fs = machine.fs;
  if (fs.mode === 'mult') return { fsMult: fs.mult, wildMult: 1 };
  if (fs.mode === 'wildMult') return { fsMult: 1, wildMult: fs.mult };
  if (fs.mode === 'grow') return { fsMult: Math.min(fs.start + fs.step * i, fs.max || 99), wildMult: 1 };
  return { fsMult: 1, wildMult: 1 };
}

// Горячая серия: сколько выигрышей подряд было до этого вращения → множитель
export function streakMultiplier(streak) {
  for (const [n, k] of STREAK) if (streak >= n) return k;
  return 1;
}

export function spinStops(strips, rnd = fairRandom) {
  return strips.map((s) => Math.floor(rnd() * s.length));
}

// Видимое окно: grid[барабан][ряд]
export function windowAt(strips, stops) {
  return strips.map((s, r) => {
    const col = [];
    for (let row = 0; row < ROWS; row++) col.push(s[(stops[r] + row) % s.length]);
    return col;
  });
}

const cellsOf = (grid, test) => {
  const out = [];
  grid.forEach((col, r) => col.forEach((s, row) => { if (test(s)) out.push([r, row]); }));
  return out;
};

// Подсчёт линий и бонуса на готовом окне.
// mult — множитель всего выигрыша, wildMult — множитель за каждый WILD в линии.
export function evaluate(machine, grid, { lineBet, totalBet, mult = 1, wildMult = 1 }) {
  const lineWins = [];
  let total = 0;
  LINES.forEach((line, li) => {
    const syms = line.map((row, r) => grid[r][row]);
    let target = null;
    for (const s of syms) { if (s !== 'wild') { target = s; break; } }
    if (!target || NON_LINE.includes(target)) return;
    let count = 0, wilds = 0;
    for (const s of syms) {
      if (s === target || s === 'wild') { count++; if (s === 'wild') wilds++; } else break;
    }
    const pay = machine.pay[target]?.[count] || 0;
    if (!pay) return;
    const k = mult * (wildMult > 1 && wilds ? wildMult ** wilds : 1);
    const amount = pay * lineBet * k;
    total += amount;
    lineWins.push({ line: li, sym: target, count, wilds, mult: k, amount, cells: line.slice(0, count).map((row, r) => [r, row]) });
  });
  const sc = cellsOf(grid, (s) => s === 'scatter');
  const scatter = { count: sc.length, cells: sc, amount: 0, fs: 0 };
  if (sc.length >= 3) {
    const n = Math.min(sc.length, 5);
    scatter.amount = (machine.scatterPay[n] || 0) * totalBet * mult;
    scatter.fs = machine.freeSpins[n] || 0;
    total += scatter.amount;
  }
  return { lineWins, scatter, total };
}

// Полный исход вращения.
// fs — состояние бесплатных вращений ({ i, sticky: ['r,row'] }) или null; streak — выигрышей подряд до этого.
export function resolveSpin(m, strips, { rnd = fairRandom, stops = null, bet, fs = null, streak = 0, noGift = false, forceGift = false } = {}) {
  stops ||= spinStops(strips, rnd);
  const raw = windowAt(strips, stops);
  const grid = raw.map((c) => c.slice());
  const fx = { mystery: null, gift: [], expand: [], sticky: [], newSticky: [] };

  // таинственный «?» — все превращаются в один символ
  if (m.features.mystery) {
    const cells = cellsOf(grid, (s) => s === 'mystery');
    if (cells.length) {
      const sym = weighted(MYSTERY_POOL, rnd);
      for (const [r, row] of cells) grid[r][row] = sym;
      fx.mystery = { sym, cells };
    }
  }
  // липкие WILD: прежние стоят на месте, новые прилипают
  if (fs && m.features.sticky) {
    const old = new Set(fs.sticky || []);
    for (const k of old) { const [r, row] = k.split(',').map(Number); grid[r][row] = 'wild'; }
    const now = cellsOf(grid, (s) => s === 'wild').map(([r, row]) => r + ',' + row);
    fx.sticky = now;
    fx.newSticky = now.filter((k) => !old.has(k));
  }
  // «Подарок»: на барабаны 2–5 прилетают 2–4 WILD
  if (!fs && !noGift && (forceGift || rnd() < GIFT_WILD_CHANCE)) {
    const cand = shuffle(cellsOf(grid, (s) => REGULAR.includes(s)).filter(([r]) => r > 0), rnd);
    fx.gift = cand.slice(0, 2 + Math.floor(rnd() * 3));
    for (const [r, row] of fx.gift) grid[r][row] = 'wild';
  }
  // маска фараона растягивается на весь барабан (подарочные WILD не растут)
  if (m.features.expand) {
    for (let r = 0; r < REELS; r++) {
      if (raw[r].includes('wild') && grid[r].some((s) => s !== 'wild' && !NON_LINE.includes(s))) {
        // бонус, корону и сундук WILD не закрывает — они нужны для своих игр
        grid[r] = grid[r].map((s) => (NON_LINE.includes(s) ? s : 'wild'));
        fx.expand.push(r);
      }
    }
  }

  const multCells = cellsOf(grid, (s) => MULT_SYMS.includes(s));
  const multSum = multCells.reduce((a, [r, row]) => a + m.symbols[grid[r][row]].mult, 0);
  const sMult = fs ? 1 : streakMultiplier(streak);
  const fsm = fs ? fsMultipliers(m, fs.i) : { fsMult: 1, wildMult: 1 };
  const mult = fsm.fsMult * (multSum || 1) * sMult;
  const e = evaluate(m, grid, { lineBet: bet / 20, totalBet: bet, mult, wildMult: fsm.wildMult });

  // короны → джекпот-игра (5 корон — сразу Гранд)
  const crowns = cellsOf(grid, (s) => s === 'jackpot');
  let jackpot = null;
  if (crowns.length >= 5) jackpot = { tier: 'grand', crowns: 5, board: jackpotBoard('grand', rnd) };
  else if (crowns.length >= 3) {
    const tier = weighted(JACKPOT_ODDS[crowns.length], rnd);
    jackpot = { tier, crowns: crowns.length, board: jackpotBoard(tier, rnd) };
  }
  // три сундука → «Выбери сундук»
  const pickCells = cellsOf(grid, (s) => s === 'pick');
  const pick = pickCells.length >= 3 ? pickBoard(rnd) : null;

  return {
    stops, raw, grid, fx,
    lineWins: e.lineWins, scatter: e.scatter, total: e.total,
    mult: { cells: multCells, sum: multSum, streak: sMult, fs: fsm.fsMult, all: mult },
    crowns, jackpot, pickCells, pick,
  };
}

// Джекпот-игра: 12 монет, у каждого джекпота по 3. Открываются по порядку раскладки — кто первым
// наберёт три одинаковых, тот и выигран. Раскладку подбираем так, чтобы первым набрался выпавший.
export function jackpotBoard(tier, rnd) {
  const tiers = ['mini', 'minor', 'major', 'grand'];
  for (;;) {
    const b = shuffle(tiers.flatMap((t) => [t, t, t]), rnd);
    const seen = {};
    for (let i = 0; i < b.length; i++) {
      seen[b[i]] = (seen[b[i]] || 0) + 1;
      if (seen[b[i]] === 3) { if (b[i] === tier) return { order: b, stop: i }; break; }
    }
  }
}

// «Выбери сундук»: 9 призов (в ставках), «×2 ко всему», два «Забрать». Первый сундук всегда с призом.
// Что лежит в каком сундуке — решено заранее, поэтому выбор игрока на выигрыш не влияет (честно).
export function pickBoard(rnd) {
  const prizes = shuffle(PICK.prizes.slice(), rnd).slice(0, PICK.size - PICK.double - PICK.collect);
  const b = shuffle([...prizes, ...Array(PICK.double).fill('x2'), ...Array(PICK.collect).fill('collect')], rnd);
  if (b[0] === 'collect' || b[0] === 'x2') {
    const j = b.findIndex((x) => typeof x === 'number');
    [b[0], b[j]] = [b[j], b[0]];
  }
  let sum = 0, dbl = 1, stop = b.length - 1;
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 'collect') { stop = i; break; }
    if (b[i] === 'x2') dbl = 2; else sum += b[i];
  }
  return { order: b, stop, total: sum * dbl, doubled: dbl > 1 };
}
