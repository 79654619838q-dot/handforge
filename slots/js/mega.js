// «Королевский покер» — математика без экрана (как engine.js, тот же код гоняет tools/sim.mjs).
// 6 барабанов, у каждого при каждом вращении от 2 до 7 карт: способов выигрыша — произведение высот,
// до 7^6 = 117 649. Выигрыш — одинаковые карты на соседних барабанах начиная с левого, в любых рядах;
// Джокер заменяет любую карту. Масть на выигрыш не влияет — она нужна только для роял-флеша.
// Каскад: выигравшие карты сгорают, оставшиеся падают вниз, сверху приходят новые (продолжение ленты);
// в бесплатных вращениях каждое падение добавляет +1 к множителю, и он не сбрасывается до конца раунда.
// Джокер бывает с множителем ×2/×3/×5: каждый способ через него умножается — выигрыш карты умножается
// на произведение (по барабанам) сумм множителей её клеток (обычная карта считается за 1).
// Роял-флеш: 10, валет, дама, король и туз одной масти на пяти барабанах подряд слева направо.
import { GIFT_WILD_CHANCE, JACKPOT_ODDS, MAGNET_SCATTER } from './machines.js';
import { seeded, fairRandom, jackpotBoard, pickBoard, streakMultiplier } from './engine.js';

export const REELS = 6;
export const MIN_ROWS = 2, MAX_ROWS = 7;
export const ASPECT = 3 / 2;            // окно барабанов: ширина к высоте
export const SUITS = ['s', 'h', 'd', 'c']; // пики, червы, бубны, трефы
export const SUIT_NAME = { s: 'пик', h: 'червей', d: 'бубен', c: 'треф' };
export const SUIT_SIGN = { s: '♠', h: '♥', d: '♦', c: '♣' };
// карты с мастью: туз, король, дама, валет, десятка, девятка; фишки (h1) — без масти
export const SUITED = ['h2', 'h3', 'l1', 'l2', 'l3', 'l4'];
export const PAYING = ['h1', 'h2', 'h3', 'l1', 'l2', 'l3', 'l4'];
// роял-флеш слева направо: 10, В, Д, К, Т
export const ROYAL = ['l3', 'l2', 'l1', 'h3', 'h2'];
// Джокеры: множитель способа
export const JOKER = { wild: 1, w2: 2, w3: 3, w5: 5 };
const NON_WAY = ['scatter', 'jackpot', 'pick'];

export const rankOf = (c) => (c.length === 3 && SUITED.includes(c.slice(0, 2)) ? c.slice(0, 2) : c);
export const suitOf = (c) => (c.length === 3 ? c[2] : '');
const isRegular = (c) => PAYING.includes(rankOf(c));

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

// Ленты: карты по весам, у каждой — масть (поровну, вперемешку); бонус, корона и сундук не ближе
// MAX_ROWS клеток к такому же — в окне барабана их не больше одного.
export function buildStrips(m, mode = false) {
  const fs = mode === true || mode === 'fs';
  let weights = (fs && m.fsWeights) || m.weights;
  if (mode === 'magnet') weights = { ...weights, scatter: weights.scatter.map((x) => x * MAGNET_SCATTER) };
  const rnd = seeded(m.seed + (fs ? 7 : 0) + (mode === 'magnet' ? 13 : 0));
  const strips = [];
  for (let r = 0; r < REELS; r++) {
    const tokens = [];
    for (const [sym, w] of Object.entries(weights)) {
      if (SUITED.includes(sym)) {
        const suits = shuffle(Array.from({ length: w[r] }, (_, i) => SUITS[i % 4]), rnd);
        for (const s of suits) tokens.push(sym + s);
      } else for (let i = 0; i < w[r]; i++) tokens.push(sym);
    }
    let strip;
    for (let attempt = 0; ; attempt++) {
      strip = shuffle(tokens.slice(), rnd);
      if (spacedOk(strip)) break;
      if (attempt > 50000) throw new Error('не удалось расставить ленту ' + r);
    }
    strips.push(strip);
  }
  return strips;
}

function spacedOk(strip) {
  const n = strip.length;
  for (let i = 0; i < n; i++) {
    if (!NON_WAY.includes(strip[i])) continue;
    for (let d = 1; d < MAX_ROWS; d++) if (strip[(i + d) % n] === strip[i]) return false;
  }
  return true;
}

const mod = (a, n) => ((a % n) + n) % n;
export const waysOf = (heights) => heights.reduce((a, b) => a * b, 1);

// окно: grid[барабан][ряд], ряд 0 — верхний; top — клетка ленты в верхнем ряду
export function windowAt(strips, stops, heights) {
  return strips.map((s, r) => Array.from({ length: heights[r] }, (_, i) => s[mod(stops[r] + i, s.length)]));
}

export function spinStops(m, strips, rnd = fairRandom) {
  return {
    stops: strips.map((s) => Math.floor(rnd() * s.length)),
    heights: strips.map(() => Number(weighted(m.heights, rnd))),
  };
}

const cellsOf = (grid, test) => {
  const out = [];
  grid.forEach((col, r) => col.forEach((s, row) => { if (test(s)) out.push([r, row]); }));
  return out;
};

// Выигрыши по способам на готовом окне. Сумма — в монетах (без округления), mult — множитель всего.
export function evalWays(m, grid, bet, mult = 1) {
  const wins = [];
  for (const sym of PAYING) {
    let weightedWays = 1, ways = 1, n = 0;
    const cells = [];
    for (let r = 0; r < REELS; r++) {
      let sum = 0, cnt = 0;
      grid[r].forEach((c, row) => {
        const j = JOKER[c];
        if (j || rankOf(c) === sym) { sum += j || 1; cnt++; cells.push([r, row]); }
      });
      if (!cnt) break;
      weightedWays *= sum; ways *= cnt; n++;
    }
    const pay = m.pay[sym]?.[n] || 0;
    if (!pay) continue;
    // клетки только с тех барабанов, что вошли в выигрыш
    const used = cells.filter(([r]) => r < n);
    const jm = weightedWays / ways; // средний множитель джокеров на способ
    wins.push({ sym, count: n, ways, jokerMult: jm, mult, amount: pay * bet * weightedWays * mult, cells: used });
  }
  return wins;
}

// роял-флеш на окне: 10-В-Д-К-Т одной масти на пяти барабанах подряд слева направо
export function findRoyal(grid) {
  for (let r0 = 0; r0 + ROYAL.length <= REELS; r0++) {
    for (const s of SUITS) {
      const cells = [];
      for (let i = 0; i < ROYAL.length; i++) {
        const row = grid[r0 + i].indexOf(ROYAL[i] + s);
        if (row < 0) { cells.length = 0; break; }
        cells.push([r0 + i, row]);
      }
      if (cells.length) return { suit: s, cells };
    }
  }
  return null;
}

// Полный исход вращения со всеми каскадами.
// fs — { i, mult } в бесплатных вращениях или null; streak — выигрышей подряд до этого вращения.
export function resolveSpin(m, strips, { rnd = fairRandom, stops = null, bet, fs = null, streak = 0, noGift = false, forceGift = false, boostMult = 1, giftChance = GIFT_WILD_CHANCE } = {}) {
  let heights;
  if (stops && stops.heights) ({ stops, heights } = stops);
  else if (stops) heights = strips.map(() => 4);
  else ({ stops, heights } = spinStops(m, strips, rnd));
  const raw = windowAt(strips, stops, heights);
  let grid = raw.map((c) => c.slice());
  const fx = { mystery: null, gift: [], expand: [], sticky: [], newSticky: [] };

  // «Подарок»: на барабаны 2–6 прилетают 2–4 Джокера (только в обычной игре)
  if (!fs && !noGift && (forceGift || rnd() < giftChance)) {
    const cand = shuffle(cellsOf(grid, isRegular).filter(([r]) => r > 0), rnd);
    fx.gift = cand.slice(0, 2 + Math.floor(rnd() * 3));
    for (const [r, row] of fx.gift) grid[r][row] = 'wild';
  }

  const sMult = fs ? 1 : streakMultiplier(streak);
  const base = sMult * (fs ? 1 : boostMult);
  let fsMult = fs ? (fs.mult || 1) : 1;
  const fsStart = fsMult;
  const tops = stops.slice();
  const steps = [];
  let total = 0, royal = null;
  for (let k = 0; k < 60; k++) {
    const mult = base * fsMult;
    const wins = evalWays(m, grid, bet, mult);
    let royalHere = null;
    if (!royal) {
      const f = findRoyal(grid);
      if (f) { royal = royalHere = { ...f, amount: m.royal * bet * mult, step: k }; }
    }
    if (!wins.length && !royalHere) break;
    const raw = wins.reduce((a, w) => a + w.amount, 0) + (royalHere ? royalHere.amount : 0);
    const stepTotal = raw > 0 ? Math.max(1, Math.round(raw)) : 0;
    total += stepTotal;
    const removed = new Set();
    for (const w of wins) for (const [r, row] of w.cells) removed.add(r + ',' + row);
    const step = { grid: grid.map((c) => c.slice()), wins, royal: royalHere, mult, total: stepTotal, removed: [...removed] };
    steps.push(step);
    if (!removed.size) break; // только роял-флеш без выигрыша по способам (джокеров нет) — падать нечему
    // сгоревшие клетки убираем, остальное падает вниз, сверху — продолжение ленты
    const next = [];
    for (let r = 0; r < REELS; r++) {
      const keep = grid[r].filter((_, row) => !removed.has(r + ',' + row));
      const need = grid[r].length - keep.length;
      const s = strips[r];
      const incoming = Array.from({ length: need }, (_, i) => s[mod(tops[r] - need + i, s.length)]);
      tops[r] -= need;
      next.push(incoming.concat(keep));
    }
    step.next = next.map((c) => c.slice());
    grid = next;
    if (fs) fsMult += 1;
  }

  // бонус, короны и сундуки никогда не сгорают — считаем на последнем окне (каскад может их принести)
  const sc = cellsOf(grid, (s) => s === 'scatter');
  const scatter = { count: sc.length, cells: sc, amount: 0, fs: 0 };
  if (sc.length >= 3) {
    const n = Math.min(sc.length, 6);
    scatter.amount = (m.scatterPay[n] || 0) * bet * base * (fs ? fsMult : 1);
    scatter.fs = m.freeSpins[n] || 0;
    total += scatter.amount;
  }
  const crowns = cellsOf(grid, (s) => s === 'jackpot');
  let jackpot = null;
  if (crowns.length >= 5) jackpot = { tier: 'grand', crowns: 5, board: jackpotBoard('grand', rnd) };
  else if (crowns.length >= 3) {
    const tier = weighted(JACKPOT_ODDS[Math.min(4, crowns.length)], rnd);
    jackpot = { tier, crowns: crowns.length, board: jackpotBoard(tier, rnd) };
  }
  const pickCells = cellsOf(grid, (s) => s === 'pick');
  const pick = pickCells.length >= 3 ? pickBoard(rnd) : null;

  return {
    stops, heights, ways: waysOf(heights), raw, grid, fx, steps, royal,
    lineWins: [], scatter, total,
    mult: { cells: [], sum: 0, streak: sMult, fs: fsStart, all: base * fsStart },
    fsMultEnd: fsMult,
    crowns, jackpot, pickCells, pick,
  };
}
