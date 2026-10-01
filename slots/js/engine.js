// Математика автомата без экрана: ленты барабанов, остановка, подсчёт выигрыша.
// Тот же код гоняет tools/sim.mjs для проверки отдачи — поэтому здесь ни DOM, ни звука.

export const REELS = 5;
export const ROWS = 3;

// 20 линий: номер ряда (0 — верх) на каждом из 5 барабанов
export const LINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 2, 2, 0],
];

const SPECIAL = ['scatter', 'jackpot'];

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

// Ленты: символы по весам, перемешаны; «Бонус» и «Джекпот» стоят не ближе 3 клеток к своему же —
// значит в окне из 3 рядов каждого из них не больше одного на барабане.
export function buildStrips(machine) {
  const rnd = seeded(machine.seed);
  const strips = [];
  for (let r = 0; r < REELS; r++) {
    let strip = [];
    for (const [sym, w] of Object.entries(machine.weights)) for (let i = 0; i < w[r]; i++) strip.push(sym);
    for (let attempt = 0; ; attempt++) {
      for (let i = strip.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [strip[i], strip[j]] = [strip[j], strip[i]];
      }
      if (spacedOk(strip)) break;
      if (attempt > 5000) throw new Error('не удалось расставить ленту ' + r);
    }
    strips.push(strip);
  }
  return strips;
}

function spacedOk(strip) {
  const n = strip.length;
  for (let i = 0; i < n; i++) {
    if (!SPECIAL.includes(strip[i])) continue;
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

// Остановка: верхняя видимая клетка каждого барабана
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

// Подсчёт. opts.lineBet — ставка на линию, opts.totalBet — общая,
// opts.fsMult — множитель всех выигрышей (бесплатные вращения), opts.wildMult — множитель за каждый WILD в линии.
export function evaluate(machine, grid, { lineBet, totalBet, fsMult = 1, wildMult = 1 }) {
  const lineWins = [];
  let total = 0;
  LINES.forEach((line, li) => {
    const syms = line.map((row, r) => grid[r][row]);
    let target = null;
    for (const s of syms) { if (s !== 'wild') { target = s; break; } }
    if (!target || SPECIAL.includes(target)) return;
    let count = 0, wilds = 0;
    for (const s of syms) {
      if (s === target || s === 'wild') { count++; if (s === 'wild') wilds++; } else break;
    }
    const pay = machine.pay[target]?.[count] || 0;
    if (!pay) return;
    const mult = fsMult * (wildMult > 1 && wilds ? wildMult ** wilds : 1);
    const amount = pay * lineBet * mult;
    total += amount;
    lineWins.push({ line: li, sym: target, count, wilds, mult, amount, cells: line.slice(0, count).map((row, r) => [r, row]) });
  });

  const find = (sym) => {
    const cells = [];
    grid.forEach((col, r) => col.forEach((s, row) => { if (s === sym) cells.push([r, row]); }));
    return cells;
  };
  const sc = find('scatter');
  const scatter = { count: sc.length, cells: sc, amount: 0, fs: 0 };
  if (sc.length >= 3) {
    const n = Math.min(sc.length, 5);
    scatter.amount = (machine.scatterPay[n] || 0) * totalBet * fsMult;
    scatter.fs = machine.freeSpins[n] || 0;
    total += scatter.amount;
  }
  const jp = find('jackpot');
  const jackpot = { count: jp.length, cells: jp, hit: jp.length >= REELS };

  return { lineWins, scatter, jackpot, total };
}

// Сколько клеток «особых» символов уже легло на первых k барабанах — для «ожидания» на остальных
export function countSpecialOnReels(grid, sym, upto) {
  let n = 0;
  for (let r = 0; r < upto; r++) if (grid[r].includes(sym)) n++;
  return n;
}
