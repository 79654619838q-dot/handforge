// Движок испытаний. Один код для сервера комнат (hub/cell-server.js) и для одиночной игры
// в браузере с ботами (src/net/LocalSession.js). Ни DOM, ни three.js — только правила и таймеры.
// Правила — docs/CHALLENGES.md.

export const CHALLENGE_IDS = ['lastcell', 'doors', 'time', 'mines', 'memory', 'center', 'unique'];

export const CHALLENGE_META = {
  lastcell: { ru: 'Последняя клетка', en: 'Last Cell', skill: { ru: 'позиция', en: 'position' } },
  doors: { ru: 'Двери', en: 'Doors', skill: { ru: 'риск', en: 'risk' } },
  time: { ru: 'Останови время', en: 'Stop the Time', skill: { ru: 'чувство времени', en: 'timing' } },
  mines: { ru: 'Взрывное поле', en: 'Minefield', skill: { ru: 'стратегия и атака', en: 'strategy' } },
  memory: { ru: 'Запомни число', en: 'Memorize', skill: { ru: 'память', en: 'memory' } },
  center: { ru: 'Центр', en: 'Center', skill: { ru: 'точность', en: 'precision' } },
  unique: { ru: 'Уникальное число', en: 'Unique Number', skill: { ru: 'психология', en: 'psychology' } },
};

const INTRO_MS = 3500;
const END_MS = 6500;
const POINTS_PER_OUTLASTED = 10;
const WIN_BONUS = 30;

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = rnd(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };

// ---------------- Испытания ----------------
// Каждое: begin() → публичные данные раунда; act(pid, a) → принят ли ход; complete(pid) → сделал ли ход;
// autofill() — ходы за тех, кто не успел; resolve() → { eliminated, replay, reveal };
// over() — кончилось ли; winners().

class Base {
  constructor(match, ids, opts) {
    this.m = match;
    this.alive = ids.slice();
    this.start = ids.length;
    this.opts = opts || {};
    this.round = 0;
    this.moves = {};
    this.movedAt = {};
  }
  get solo() { return this.start === 1; }
  begin() { this.round += 1; this.moves = {}; this.movedAt = {}; return this.data(); }
  data() { return {}; }
  actMs() { return 30000; }
  showMs() { return 0; } // фаза «показа» перед ходом (Запомни число)
  revealMs() { return 5000; }
  record(pid, move) { this.moves[pid] = move; this.movedAt[pid] = this.m.now(); return true; }
  complete(pid) { return pid in this.moves; }
  autofill() {}
  over() { return this.alive.length <= 1; }
  winners() { return this.alive.slice(); }
  // что показывать игроку о ходах других до раскрытия
  visibleMoves() { return {}; }
  // «ровно один выбывает»: худший по сравнению cmp (больше = хуже); при равенстве — кто ходил позже
  worstOne(score) {
    let worst = null;
    for (const p of this.alive) {
      if (worst === null) { worst = p; continue; }
      const a = score(p), b = score(worst);
      if (a > b || (a === b && (this.movedAt[p] ?? Infinity) > (this.movedAt[worst] ?? Infinity))) worst = p;
    }
    return worst === null ? [] : [worst];
  }
}

// 1. Последняя клетка
class LastCell extends Base {
  constructor(m, ids, opts) {
    super(m, ids, opts);
    const want = opts.cells || 25;
    const n = Math.max(want, ids.length + 1);
    this.cells = Array.from({ length: n }, (_, i) => i);
    this.total = n;
    this.stand = {}; // pid → клетка (переходит из раунда в раунд)
  }
  data() { return { cells: this.cells.slice(), total: this.total }; }
  act(pid, a) {
    const c = a?.cell;
    if (!this.cells.includes(c)) return false;
    if (Object.entries(this.moves).some(([p, v]) => p !== pid && v === c)) return false; // клетку уже заняли
    return this.record(pid, c);
  }
  visibleMoves() { return { ...this.moves }; } // занятые клетки видны сразу — иначе не выбрать свободную
  autofill() {
    for (const p of this.alive) {
      if (p in this.moves) continue;
      const taken = new Set(Object.values(this.moves));
      const prev = this.stand[p];
      const c = prev !== undefined && this.cells.includes(prev) && !taken.has(prev) ? prev : pick(this.cells.filter((x) => !taken.has(x)));
      this.moves[p] = c; this.movedAt[p] = this.m.now();
    }
  }
  resolve() {
    Object.assign(this.stand, this.moves);
    const target = pick(this.cells);
    const eliminated = this.alive.filter((p) => this.moves[p] === target);
    this.cells = this.cells.filter((c) => c !== target);
    return { eliminated, replay: false, reveal: { target, stand: { ...this.moves } } };
  }
  over() { return this.alive.length <= 1 || this.cells.length <= 1; }
  revealMs() { return 9500; }
}

// 2. Двери
class Doors extends Base {
  constructor(m, ids, opts) {
    super(m, ids, opts);
    this.doors = this.solo ? Math.max(2, Math.min(10, opts.doors || 10)) : ids.length;
    this.startDoors = this.doors;
    this.passed = 0;
    this.finished = false;
  }
  begin() {
    if (!this.solo) this.doors = this.alive.length;
    this.death = rnd(this.doors);
    return super.begin();
  }
  data() { return { doors: this.doors, startDoors: this.startDoors, passed: this.passed }; }
  actMs() { return 20000; }
  act(pid, a) {
    const d = a?.door;
    if (!(d >= 0 && d < this.doors)) return false;
    if (Object.entries(this.moves).some(([p, v]) => p !== pid && v === d)) return false;
    return this.record(pid, d);
  }
  visibleMoves() { return { ...this.moves }; }
  autofill() {
    for (const p of this.alive) {
      if (p in this.moves) continue;
      const taken = new Set(Object.values(this.moves));
      const free = Array.from({ length: this.doors }, (_, i) => i).filter((i) => !taken.has(i));
      this.moves[p] = pick(free); this.movedAt[p] = this.m.now();
    }
  }
  resolve() {
    const eliminated = this.alive.filter((p) => this.moves[p] === this.death);
    if (this.solo && !eliminated.length) {
      this.passed += 1;
      if (this.doors <= 2) this.finished = true; else this.doors -= 1;
    }
    return { eliminated, replay: false, reveal: { death: this.death, doors: this.moves } };
  }
  over() { return this.solo ? this.alive.length === 0 || this.finished : this.alive.length <= 1; }
  revealMs() { return 11500; }
}

// 3. Останови время
class StopTime extends Base {
  begin() { this.target = 1 + rnd(20); return super.begin(); }
  data() { return { target: this.target }; }
  actMs() { return (this.target + 20) * 1000; }
  act(pid, a) {
    const ms = Number(a?.elapsed);
    if (!(ms >= 0 && ms < 120000)) return false;
    return this.record(pid, ms);
  }
  resolve() {
    const dev = (p) => (p in this.moves ? Math.abs(this.moves[p] - this.target * 1000) : Infinity);
    const eliminated = this.worstOne(dev);
    const results = {};
    for (const p of this.alive) results[p] = { elapsed: this.moves[p] ?? null, dev: Number.isFinite(dev(p)) ? dev(p) : null };
    return { eliminated, replay: false, reveal: { target: this.target, results } };
  }
  revealMs() { return 10000; }
}

// 4. Взрывное поле
class Mines extends Base {
  constructor(m, ids, opts) {
    super(m, ids, opts);
    this.size = ids.length > 12 ? 64 : 36;
  }
  data() { return { size: this.size }; }
  act(pid, a) {
    const s = a?.stand, b = a?.bomb;
    if (!(s >= 0 && s < this.size && b >= 0 && b < this.size)) return false;
    return this.record(pid, { stand: s, bomb: b });
  }
  autofill() {
    for (const p of this.alive) if (!(p in this.moves)) { this.moves[p] = { stand: rnd(this.size), bomb: rnd(this.size) }; this.movedAt[p] = this.m.now(); }
  }
  resolve() {
    const bombs = new Set(this.alive.map((p) => this.moves[p].bomb));
    let eliminated = this.alive.filter((p) => bombs.has(this.moves[p].stand));
    const replay = eliminated.length === this.alive.length; // все погибли — раунд не засчитан
    if (replay) eliminated = [];
    return { eliminated, replay, reveal: { moves: { ...this.moves }, bombs: [...bombs] } };
  }
  revealMs() { return 9500; }
}

// 5. Запомни число
class Memory extends Base {
  begin() {
    const digits = 3 + this.round; // round ещё не увеличен: 1-й раунд — 3 цифры
    this.number = String(1 + rnd(9)) + Array.from({ length: digits - 1 }, () => rnd(10)).join('');
    return super.begin();
  }
  get showSec() { return Math.max(0.6, 2 - 0.2 * (this.round - 1)); }
  data() { return { digits: this.number.length, showMs: this.showSec * 1000 }; }
  showData() { return { number: this.number }; }
  showMs() { return this.showSec * 1000; }
  actMs() { return 10000; }
  act(pid, a) {
    const ans = String(a?.answer ?? '').replace(/\D/g, '').slice(0, 20);
    this.record(pid, { answer: ans, ms: Number(a?.ms) || 0 });
    return true;
  }
  resolve() {
    const n = this.number;
    const score = (p) => {
      const mv = this.moves[p];
      if (!mv || !mv.answer) return 1e12;
      if (mv.answer === n) return mv.ms; // верно: хуже тот, кто дольше
      let ok = 0; for (let i = 0; i < n.length; i++) if (mv.answer[i] === n[i]) ok++;
      return 1e9 + (n.length - ok) * 1e6 + mv.ms; // неверно всегда хуже верного
    };
    const eliminated = this.worstOne(score);
    const results = {};
    for (const p of this.alive) results[p] = { answer: this.moves[p]?.answer ?? '', ok: this.moves[p]?.answer === n, ms: this.moves[p]?.ms ?? null };
    return { eliminated, replay: false, reveal: { number: n, results } };
  }
  revealMs() { return 9500; }
}

// 6. Центр
function polygonCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

function makeShape(round) {
  const kinds = ['circle', 'square', 'triangle', 'rhombus', 'pentagon', 'hexagon', 'irregular', 'concave'];
  const kind = round <= kinds.length ? kinds[round - 1] : pick(kinds.slice(4));
  // координаты поля 0..1000; фигура смещена случайно, чтобы центр не совпадал с серединой поля
  const ox = 360 + rnd(280), oy = 360 + rnd(280), R = 190 + rnd(90), rot = Math.random() * Math.PI * 2;
  let pts;
  const reg = (n) => Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * Math.PI * 2; return [ox + Math.cos(a) * R, oy + Math.sin(a) * R]; });
  switch (kind) {
    case 'circle': pts = Array.from({ length: 64 }, (_, i) => { const a = (i / 64) * Math.PI * 2; return [ox + Math.cos(a) * R, oy + Math.sin(a) * R]; }); break;
    case 'square': pts = reg(4); break;
    case 'triangle': pts = [[ox - R, oy + R * 0.7], [ox + R * 1.1, oy + R * 0.5], [ox - R * 0.2, oy - R]]; break; // разносторонний
    case 'rhombus': pts = [[ox, oy - R * 1.2], [ox + R * 0.7, oy], [ox, oy + R * 1.2], [ox - R * 0.7, oy]]; break;
    case 'pentagon': pts = reg(5); break;
    case 'hexagon': pts = reg(6); break;
    case 'irregular': pts = Array.from({ length: 7 }, (_, i) => { const a = rot + (i / 7) * Math.PI * 2; const r = R * (0.6 + Math.random() * 0.6); return [ox + Math.cos(a) * r, oy + Math.sin(a) * r]; }); break;
    default: pts = Array.from({ length: 12 }, (_, i) => { const a = rot + (i / 12) * Math.PI * 2; const r = R * (i % 2 ? 0.45 + Math.random() * 0.2 : 0.9 + Math.random() * 0.3); return [ox + Math.cos(a) * r, oy + Math.sin(a) * r]; });
  }
  pts = pts.map(([x, y]) => [Math.round(Math.min(980, Math.max(20, x))), Math.round(Math.min(980, Math.max(20, y)))]);
  return { kind, points: pts, center: polygonCentroid(pts) };
}

class Center extends Base {
  begin() { this.shape = makeShape(this.round + 1); return super.begin(); }
  data() { return { kind: this.shape.kind, points: this.shape.points }; } // центр — только после раскрытия
  actMs() { return 20000; }
  act(pid, a) {
    const x = Number(a?.x), y = Number(a?.y);
    if (!(x >= 0 && x <= 1000 && y >= 0 && y <= 1000)) return false;
    return this.record(pid, [x, y]);
  }
  resolve() {
    const [cx, cy] = this.shape.center;
    const dist = (p) => (p in this.moves ? Math.hypot(this.moves[p][0] - cx, this.moves[p][1] - cy) : Infinity);
    const eliminated = this.worstOne(dist);
    const results = {};
    for (const p of this.alive) results[p] = { point: this.moves[p] ?? null, dist: Number.isFinite(dist(p)) ? dist(p) : null };
    return { eliminated, replay: false, reveal: { center: [cx, cy], results } };
  }
  revealMs() { return 9500; }
}

// 7. Уникальное число
class Unique extends Base {
  data() { return { max: this.alive.length }; }
  actMs() { return 20000; }
  act(pid, a) {
    const n = Number(a?.n);
    if (!(Number.isInteger(n) && n >= 1 && n <= this.alive.length)) return false;
    return this.record(pid, n);
  }
  autofill() { for (const p of this.alive) if (!(p in this.moves)) { this.moves[p] = 1 + rnd(this.alive.length); this.movedAt[p] = this.m.now(); } }
  resolve() {
    const count = {};
    for (const p of this.alive) count[this.moves[p]] = (count[this.moves[p]] || 0) + 1;
    let eliminated = this.alive.filter((p) => count[this.moves[p]] > 1);
    const replay = eliminated.length === this.alive.length; // совпали все — переигровка
    if (replay) eliminated = [];
    return { eliminated, replay, reveal: { picks: { ...this.moves } } };
  }
  over() { return this.alive.length <= 2; } // двое оставшихся проходят оба
  revealMs() { return 9500; }
}

const CLASSES = { lastcell: LastCell, doors: Doors, time: StopTime, mines: Mines, memory: Memory, center: Center, unique: Unique };

// ---------------- Боты ----------------
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };

function botMove(ch, id, cid) {
  switch (cid) {
    case 'lastcell': { const taken = new Set(Object.values(ch.moves)); const free = ch.cells.filter((c) => !taken.has(c)); return free.length ? { cell: pick(free) } : null; }
    case 'doors': { const taken = new Set(Object.values(ch.moves)); const free = Array.from({ length: ch.doors }, (_, i) => i).filter((i) => !taken.has(i)); return free.length ? { door: pick(free) } : null; }
    case 'time': return { elapsed: Math.max(200, ch.target * 1000 * (1 + gauss() * 0.07)) };
    case 'mines': return { stand: rnd(ch.size), bomb: rnd(ch.size) };
    case 'memory': {
      const pOk = Math.max(0.15, 0.97 - (ch.number.length - 3) * 0.1);
      let ans = ch.number;
      if (Math.random() > pOk) { const i = rnd(ans.length); ans = ans.slice(0, i) + ((Number(ans[i]) + 1 + rnd(8)) % 10) + ans.slice(i + 1); }
      return { answer: ans, ms: 2000 + rnd(5000) };
    }
    case 'center': { const [cx, cy] = ch.shape.center; const e = 12 + Math.abs(gauss()) * 28; const a = Math.random() * Math.PI * 2; return { x: cx + Math.cos(a) * e, y: cy + Math.sin(a) * e }; }
    case 'unique': return { n: 1 + rnd(ch.alive.length) };
    default: return null;
  }
}

function botDelay(ch, cid) {
  if (cid === 'time') return ch.target * 1000 * (1 + gauss() * 0.07) + 600;
  if (cid === 'memory') return 2000 + rnd(5000);
  return 1500 + rnd(ch.actMs() * 0.35);
}

// ---------------- Матч ----------------
// players: [{ id, name, profile, isBot }], chain: [id испытаний], options: { cells, doors }
// onChange() — зовётся при любом изменении; хост рассылает getStateFor(id) каждому.
export class Match {
  // таймеры оборачиваем: браузер запрещает вызывать setTimeout как метод чужого объекта (Illegal invocation)
  constructor({ players, chain, options = {}, onChange, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t) }) {
    this.players = players.map((p) => ({ ...p, points: 0 }));
    this.chain = chain.filter((c) => CLASSES[c]);
    this.options = options;
    this.onChange = onChange || (() => {});
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timers = new Set();
    this.index = -1;
    this.phase = 'waiting';
    this.log = [];
    this.history = []; // итог по каждому испытанию
  }

  get ch() { return this.challenge; }

  later(ms, fn) {
    const t = this.setTimer(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
    return t;
  }
  stopTimers() { for (const t of this.timers) this.clearTimer(t); this.timers.clear(); }
  destroy() { this.stopTimers(); this.dead = true; }

  start() { this.nextChallenge(); }

  nextChallenge() {
    this.stopTimers();
    this.index += 1;
    if (this.index >= this.chain.length) return this.finish();
    const cid = this.chain[this.index];
    const ids = this.players.map((p) => p.id); // в каждое испытание возвращаются все
    this.cid = cid;
    this.challenge = new CLASSES[cid](this, ids, this.options);
    this.eliminatedOrder = [];
    this.lastReveal = null;
    this.roundData = null; // данные прошлого испытания не должны попасть в заставку нового
    this.phase = 'intro';
    this.deadline = this.now() + INTRO_MS;
    this.changed();
    this.later(INTRO_MS, () => this.beginRound());
  }

  beginRound() {
    const ch = this.ch;
    if (ch.over()) return this.endChallenge();
    this.roundData = ch.begin();
    this.lastReveal = null;
    const show = ch.showMs();
    if (show > 0) {
      this.phase = 'show';
      this.deadline = this.now() + show;
      this.changed();
      this.later(show, () => this.openActions());
    } else this.openActions();
  }

  openActions() {
    const ch = this.ch;
    this.phase = 'act';
    this.actStartedAt = this.now();
    this.deadline = this.now() + ch.actMs();
    this.later(ch.actMs(), () => this.closeActions());
    for (const id of ch.alive) {
      const p = this.player(id);
      if (!p?.isBot) continue;
      this.later(Math.max(300, botDelay(ch, this.cid)), () => {
        if (this.phase !== 'act' || ch.complete(id)) return;
        let mv = botMove(ch, id, this.cid);
        for (let tries = 0; mv && !ch.act(id, mv) && tries < 5; tries++) mv = botMove(ch, id, this.cid);
        this.changed();
        this.checkAllDone();
      });
    }
    this.changed();
  }

  act(pid, a) {
    if (this.phase !== 'act' || !this.ch.alive.includes(pid) || this.ch.complete(pid)) return false;
    const ok = this.ch.act(pid, a);
    if (ok) { this.changed(); this.checkAllDone(); }
    return ok;
  }

  checkAllDone() {
    if (this.phase === 'act' && this.ch.alive.every((p) => this.ch.complete(p))) {
      this.stopTimers();
      this.later(600, () => this.closeActions()); // пауза, чтобы последний ход успел отрисоваться
    }
  }

  closeActions() {
    if (this.phase !== 'act') return;
    this.stopTimers();
    const ch = this.ch;
    ch.autofill();
    const res = ch.resolve();
    const before = ch.alive.length;
    if (!res.replay && res.eliminated.length) {
      const outlasted = this.eliminatedOrder.length;
      for (const id of res.eliminated) {
        const p = this.player(id);
        const gain = outlasted * POINTS_PER_OUTLASTED;
        if (p) p.points += gain;
        this.eliminatedOrder.push({ id, gain, round: ch.round });
      }
      ch.alive = ch.alive.filter((id) => !res.eliminated.includes(id));
    }
    // раскрытие плоское: eliminated, replay и данные испытания (target, results, picks…) на одном уровне
    this.lastReveal = { eliminated: res.eliminated, replay: res.replay, ...res.reveal, round: ch.round, before };
    this.phase = 'reveal';
    this.deadline = this.now() + ch.revealMs();
    this.changed();
    this.later(ch.revealMs(), () => (ch.over() ? this.endChallenge() : this.beginRound()));
  }

  endChallenge() {
    this.stopTimers();
    const ch = this.ch;
    const winners = ch.winners();
    const gain = (ch.start - winners.length) * POINTS_PER_OUTLASTED + WIN_BONUS;
    for (const id of winners) { const p = this.player(id); if (p) p.points += gain; }
    this.history.push({ cid: this.cid, winners, winGain: gain, order: this.eliminatedOrder.slice(), rounds: ch.round, solo: ch.solo, passed: ch.passed, startDoors: ch.startDoors });
    this.phase = 'end';
    this.deadline = this.now() + END_MS;
    this.changed();
    this.later(END_MS, () => this.nextChallenge());
  }

  finish() {
    this.phase = 'final';
    this.deadline = null;
    this.challenge = null;
    this.changed();
  }

  player(id) { return this.players.find((p) => p.id === id); }

  changed() { if (!this.dead) this.onChange(); }

  // Состояние для конкретного игрока: чужие тайные ходы до раскрытия не отдаются.
  getStateFor(pid) {
    const ch = this.ch;
    const s = {
      now: this.now(),
      phase: this.phase,
      deadline: this.deadline,
      chain: this.chain,
      index: this.index,
      cid: this.cid || null,
      players: this.players.map((p) => ({ id: p.id, name: p.name, profile: p.profile, isBot: !!p.isBot, points: p.points, connected: p.connected !== false })),
      history: this.history,
    };
    if (ch) {
      s.round = ch.round;
      s.alive = ch.alive.slice();
      s.startCount = ch.start;
      s.solo = ch.solo;
      s.data = this.roundData || null;
      if (this.phase === 'show') s.show = ch.showData?.();
      s.done = ch.alive.filter((p) => ch.complete(p));
      s.visible = this.phase === 'act' ? ch.visibleMoves() : {};
      s.mine = ch.moves[pid] ?? null;
      s.reveal = this.phase === 'reveal' || this.phase === 'end' ? this.lastReveal : null;
      s.eliminatedOrder = this.eliminatedOrder;
      if (this.phase === 'end') s.winners = this.history[this.history.length - 1].winners;
    }
    return s;
  }
}
