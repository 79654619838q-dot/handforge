// «Сокрытая сила» — правила игры без DOM. Всё случайное берётся из rnd() — tools/sim.mjs подменяет его на повторяемое.
import { HEROES, SKILLS, SKILL_MAX, skillNeed, LANDS, MONSTERS, RANKS, RARITIES, BASES, AFFIXES, ARTIFACTS, CONS, SLOTS, KIND_SLOTS } from './data.js';
import { LEVEL_INFO, LEVEL_MONSTERS, ARCH } from './bestiary.js';

let rnd = Math.random;
export const setRandom = (f) => { rnd = f; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wpick = (pairs) => { let t = 0; for (const [, w] of pairs) t += w; let r = rnd() * t; for (const [v, w] of pairs) { if ((r -= w) < 0) return v; } return pairs[pairs.length - 1][0]; };
let uidN = Date.now() % 1e6;
const uid = () => (++uidN).toString(36) + Math.floor(rnd() * 1e6).toString(36);

// Какие картинки уже нарисованы (assets/manifest.json): без своей картинки вещь, монстр или фон не выпадают,
// вместо них — запасные. В симуляторе список не задан — доступно всё.
let AVAIL = null;
export const setAvailable = (list) => { AVAIL = list ? new Set(list) : null; };
export const hasImg = (key) => !AVAIL || AVAIL.has(key);

export const heroDef = (id) => HEROES.find((h) => h.id === id);
export const xpNeed = (lvl) => Math.round(30 * Math.pow(lvl, 1.7));
export const MAX_LEVEL = 100;
export const ART_SLOTS = KIND_SLOTS.art;
export const artDef = (id) => ARTIFACTS.find((a) => a.id === id);

// ───────── герой ─────────
const emptyEq = () => Object.fromEntries(Object.keys(SLOTS).map((k) => [k, null]));
export function newHero(id) {
  const d = heroDef(id);
  const skills = { strike: { lvl: 1, xp: 0 } };
  for (const s of d.skills) skills[s] = { lvl: 1, xp: 0 };
  const H = {
    id, lvl: 1, xp: 0, points: 0, stats: { ...d.stats }, skills, eq: emptyEq(),
    bag: [], cons: { hp: 3, mp: 1, insight: 1, escape: 0, elixir: 0, tome: 0, whetstone: 0 },
    gold: 60, hp: 0, mp: 0, cleared: -1, cycle: 0, levels: {}, maxLevel: 1, heartUsed: false, arts: [], kills: 0, deaths: 0, shop: null, ver: 3,
  };
  H.eq.weapon = genItem('weapon', 1, { rarity: 0 });
  H.eq.armor = genItem('armor', 1, { rarity: 0 });
  const D = derive(H); H.hp = D.hpMax; H.mp = D.mpMax;
  return H;
}

// Старые сохранения: новые ячейки, кольцо → ring1
export function migrate(H) {
  if (!H || H.ver >= 3) return H;
  const old = H.eq || {};
  H.eq = emptyEq();
  for (const [k, v] of Object.entries(old)) {
    if (!v) continue;
    if (k === 'ring') { v.slot = 'ring'; H.eq.ring1 = v; } else if (k in H.eq) H.eq[k] = v; else H.bag.push(v);
  }
  for (const it of H.bag) if (it.slot === 'ring1' || it.slot === 'ring2') it.slot = 'ring';
  H.ver = 3;
  return H;
}

export const hasArt = (H, id) => ART_SLOTS.some((s) => H.eq[s]?.art === id);
export const power = (H) => heroDef(H.id).power.id;
export const equippedArts = (H) => ART_SLOTS.map((s) => H.eq[s]?.art).filter(Boolean);

// Все итоговые числа героя (с вещами, артефактами, проклятиями)
export function derive(H) {
  const s = { ...H.stats };
  const g = { atk: 0, def: 0, hp: 0, mp: 0, mag: 0, crit: 0, dodge: 0, leech: 0, hpPct: 0, dmgPct: 0 };
  for (const it of Object.values(H.eq)) {
    if (!it || it.art) continue;
    const k = 1 + 0.1 * (it.plus || 0);
    for (const [key, v] of Object.entries(it.st)) {
      if (key in s) s[key] += v;
      else if (['atk', 'def', 'hp', 'mp'].includes(key)) g[key] += v * k;
      else g[key] = (g[key] || 0) + v;
    }
  }
  const A = (id) => hasArt(H, id);
  if (A('star')) s.luck += 8;
  if (A('crown')) for (const k of Object.keys(s)) s[k] += 3;
  for (const k of Object.keys(s)) s[k] = Math.max(0, s[k]);
  let hpMax = (30 + s.vit * 9 + H.lvl * 6 + g.hp) * (1 + g.hpPct);
  if (A('heart')) hpMax *= 1.25;
  if (A('bone')) hpMax *= 1.15;
  if (A('chain')) hpMax *= 1.1;
  if (A('skull')) hpMax *= 0.9;
  let mpow = 2 + s.mag * 2.2;
  if (A('skull')) mpow *= 1.4;
  if (A('void')) mpow *= 1.2;
  if (A('flame')) mpow *= 1.15;
  let atk = 3 + s.str * 1.6 + s.agi * 0.9 + g.atk;
  if (A('demon')) atk *= 1.15;
  let def = g.def + s.vit * 0.4;
  if (A('rune')) def *= 1.1;
  if (A('scale')) def *= 1.12;
  if (A('banner')) def *= 1.08;
  return {
    s, hpMax: Math.round(hpMax), mpMax: Math.round(15 + s.mag * 4 + H.lvl * 2 + g.mp), atk, mpow, def,
    crit: clamp(5 + s.agi * 1.0 + g.crit + (A('eye') ? 5 : 0) + (A('wolf') ? 6 : 0) + (A('dagger') ? 8 : 0), 0, 65),
    dodge: clamp(2 + s.agi * 0.8 + g.dodge + (A('wolf') ? 6 : 0) + (A('totem') ? 5 : 0) + (power(H) === 'shadowstep' ? 15 : 0), 0, 50),
    leech: g.leech + (A('grail') ? 15 : 0) + (power(H) === 'bloodearth' ? 25 : 0),
    luck: s.luck,
    dmgPct: g.dmgPct + (A('sun') ? 0.1 : 0) + (A('banner') ? 0.08 : 0) + (power(H) === 'souls' ? Math.min(0.6, (H.souls || 0) * 0.002) : 0),
  };
}

export function addXp(H, xp) {
  const ev = [];
  H.xp += xp;
  while (H.lvl < MAX_LEVEL && H.xp >= xpNeed(H.lvl)) {
    H.xp -= xpNeed(H.lvl); H.lvl++; H.points += 3;
    const D = derive(H); H.hp = D.hpMax; H.mp = D.mpMax;
    ev.push({ kind: 'levelup', lvl: H.lvl });
  }
  return ev;
}

export function spendPoint(H, stat) {
  if (H.points <= 0) return false;
  const before = derive(H);
  H.points--; H.stats[stat]++;
  const after = derive(H);
  H.hp += Math.max(0, after.hpMax - before.hpMax); H.mp += Math.max(0, after.mpMax - before.mpMax);
  return true;
}

function skillUse(H, id) {
  const sk = H.skills[id];
  if (!sk || sk.lvl >= SKILL_MAX) return null;
  sk.xp++;
  if (sk.xp >= skillNeed(sk.lvl)) { sk.xp = 0; sk.lvl++; return { kind: 'skillup', id, lvl: sk.lvl }; }
  return null;
}

export function learnRandomSkill(H) {
  const fresh = Object.keys(SKILLS).filter((k) => !H.skills[k]);
  if (fresh.length) { const id = pick(fresh); H.skills[id] = { lvl: 1, xp: 0 }; return { id, learned: true }; }
  const up = Object.keys(H.skills).filter((k) => H.skills[k].lvl < SKILL_MAX);
  if (!up.length) return null;
  const id = pick(up); H.skills[id].lvl++; H.skills[id].xp = 0; return { id, learned: false, lvl: H.skills[id].lvl };
}

// ───────── вещи ─────────
const SUFFIX = ['Бури', 'Тьмы', 'Королей', 'Рассвета', 'Бездны', 'Вечности', 'Предков', 'Крови', 'Грома', 'Звёзд', 'Волка', 'Пепла', 'Титанов', 'Феникса', 'Льда', 'Солнца'];
const CURSES = [
  { st: { hpPct: -0.2 }, text: '−20% к здоровью' },
  { st: { dmgPct: -0.15 }, text: '−15% к урону' },
  { st: { luck: -6 }, text: '−6 к удаче' },
  { st: { dodge: -10 }, text: '−10% к увороту' },
];
export const tierOf = (lvl) => clamp(1 + Math.floor((lvl - 1) / 6), 1, 6);

export function rollRarity(luck = 5, bonus = 0) {
  const b = Math.max(0, (luck - 5) * 0.5 + bonus * 3);
  return wpick([[0, Math.max(8, 50 - b * 3)], [1, 28 + b * 0.8], [2, 14 + b * 1.2], [3, 6 + b * 0.7], [4, 1.5 + b * 0.25], [5, 4]]);
}

// Вид вещи по ступени: на ранних уровнях — простые, дальше — всё роскошнее; редкая вещь чаще в богатом облике
function pickBase(kind, lvl, r) {
  const all = BASES[kind];
  const pool = all.filter((b) => hasImg(`items/${b.img}`));
  const src = pool.length ? pool : all;
  const t = clamp(tierOf(lvl) + (r >= 3 && r !== 5 ? 1 : 0), 1, 6);
  const pairs = src.map((b) => [b, b.tier === t ? 4 : Math.abs(b.tier - t) === 1 ? 1.5 : b.tier < t ? 0.3 : 0.05]);
  return wpick(pairs);
}

export function genItem(kind, lvl, { rarity = null, luck = 5, bonus = 0 } = {}) {
  const r = rarity ?? rollRarity(luck, bonus);
  const R = RARITIES[r];
  const base = pickBase(kind, lvl, r);
  const m = { atk: 1, def: 1, hp: 1, mag: 0, crit: 0, dodge: 0, luck: 0, ...(base.mod || {}) };
  const k = R.mult * (0.9 + rnd() * 0.2);
  const st = {};
  const add = (key, v) => { if (v) st[key] = Math.round(((st[key] || 0) + v) * 10) / 10; };
  const magStat = (f) => Math.max(1, Math.round((1 + lvl * f) * k * m.mag));
  if (kind === 'weapon') {
    add('atk', (4 + lvl * 1.7) * k * m.atk);
    if (m.mag) add('mag', magStat(0.35));
    if (m.crit) add('crit', m.crit);
  } else if (kind === 'offhand') {
    if (m.def) { add('def', (1 + lvl * 0.7) * k * m.def); add('hp', (3 + lvl * 1.5) * k); } else { add('mag', magStat(0.3)); add('mp', (4 + lvl * 1.5) * k); }
  } else if (kind === 'armor') {
    add('def', (2 + lvl * 1.0) * k * m.def); add('hp', (5 + lvl * 3) * k * m.hp);
    if (m.mag) add('mag', magStat(0.2));
    if (m.dodge) add('dodge', m.dodge);
  } else if (kind === 'helm') {
    add('def', (1 + lvl * 0.55) * k * m.def); add('hp', (3 + lvl * 1.5) * k);
    if (m.mag) add('mag', magStat(0.18));
    if (m.crit) add('crit', m.crit); if (m.dodge) add('dodge', m.dodge); if (m.luck) add('luck', Math.round(m.luck + lvl / 8));
  } else if (kind === 'cloak') {
    add('def', (1 + lvl * 0.35) * k * m.def); add('dodge', 1 + Math.round(m.dodge || 0));
    if (m.mag) add('mag', magStat(0.15)); if (m.luck) add('luck', Math.round(m.luck + lvl / 10));
  } else if (kind === 'gloves') {
    add('atk', (1 + lvl * 0.45) * k * m.atk); add('crit', 1 + (m.crit || 0));
    if (m.mag) add('mag', magStat(0.15));
  } else if (kind === 'belt') {
    add('hp', (5 + lvl * 2.5) * k * m.hp); add('vit', Math.max(1, Math.round((1 + lvl / 8) * k)));
    if (m.atk > 1 || base.mod?.atk) add('str', Math.max(1, Math.round(lvl / 8)));
    if (m.mag) add('mag', magStat(0.12)); if (m.luck) add('luck', 1);
  } else if (kind === 'boots') {
    add('def', (1 + lvl * 0.4) * k * m.def); add('dodge', 1 + (m.dodge || 0));
    if (m.mag) add('mag', magStat(0.12));
  } else if (kind === 'ring') {
    add(pick(['str', 'agi', 'luck', 'vit', 'mag']), Math.max(1, Math.round((1 + lvl / 5) * k)));
    add('crit', Math.round(1 + k * 2));
  } else if (kind === 'amulet') {
    add('hp', (4 + lvl * 2) * k); add('mp', (3 + lvl * 1.2) * k); add('mag', Math.max(1, Math.round((1 + lvl * 0.2) * k)));
  }
  const used = new Set();
  for (let i = 0; i < R.affixes; i++) {
    const a = pick(AFFIXES.filter((x) => !used.has(x.id)));
    used.add(a.id);
    if (a.stat) add(a.id, Math.max(1, Math.round((1 + lvl / 6) * (r >= 3 ? 1.5 : 1))));
    else if (a.id === 'crit' || a.id === 'dodge') add(a.id, ri(2, 4 + r));
    else if (a.id === 'leech') add('leech', ri(3, 5 + r));
    else if (a.id === 'hp') add('hp', Math.round(lvl * 2.5 * k));
    else add('mp', Math.round(lvl * 1.2 * k + 3));
  }
  let curse = null;
  if (r === 5) { curse = pick(CURSES); for (const [kk, v] of Object.entries(curse.st)) st[kk] = (st[kk] || 0) + v; }
  const name = r === 5 ? `Проклятый: ${base.name.toLowerCase()}` : r >= 3 ? `${base.name} ${pick(SUFFIX)}` : base.name;
  return { uid: uid(), slot: kind, img: base.img, name, rarity: r, lvl, plus: 0, st, curse: curse?.text || null };
}

export function genArtifact(H) {
  const free = ARTIFACTS.filter((a) => !H.arts.includes(a.id));
  const pool = free.filter((a) => hasImg(`items/${a.img}`)); // ещё не нарисованный артефакт не выпадает
  if (!pool.length) return null;
  const a = pick(pool);
  return { uid: uid(), slot: 'art', art: a.id, img: a.img, name: a.name, rarity: 4, lvl: 0, plus: 0, st: {} };
}

export function itemValue(it) {
  if (it.art) return 1500;
  const m = RARITIES[it.rarity].mult;
  return Math.round((5 + it.lvl * 4) * m * m * (1 + (it.plus || 0) * 0.3));
}
export const sellPrice = (it) => Math.round(itemValue(it) * 0.4);

// «Сила» вещи одним числом — для сравнения и для автоигры в симуляторе
export function itemScore(it, H) {
  if (!it) return 0;
  if (it.art) return 1000;
  const k = 1 + 0.1 * (it.plus || 0);
  const s = it.st;
  const mainMag = H && H.stats.mag > H.stats.str;
  return (s.atk || 0) * k * (mainMag ? 0.6 : 2) + (s.def || 0) * k * 1.6 + (s.hp || 0) * k * 0.3 + (s.mp || 0) * k * 0.15 + (s.mag || 0) * (mainMag ? 4 : 1)
    + (s.str || 0) * (mainMag ? 1 : 3) + (s.agi || 0) * 2 + (s.vit || 0) * 3 + (s.luck || 0) * 0.8 + (s.crit || 0) * 1.2 + (s.dodge || 0) * 1.2 + (s.leech || 0) * 1.5
    + (s.hpPct || 0) * 120 + (s.dmgPct || 0) * 150;
}

// Куда наденется вещь: кольца и артефакты — в свободную ячейку своего вида
export function slotFor(H, it, wanted) {
  const kind = it.art ? 'art' : it.slot;
  const list = KIND_SLOTS[kind];
  if (!list) return kind;
  if (wanted && list.includes(wanted)) return wanted;
  return list.find((s) => !H.eq[s]) || list[0];
}

export function equip(H, uidv, slotWanted) {
  const i = H.bag.findIndex((x) => x.uid === uidv);
  if (i < 0) return false;
  const it = H.bag[i];
  const slot = slotFor(H, it, slotWanted);
  const before = derive(H);
  H.bag.splice(i, 1);
  if (H.eq[slot]) H.bag.push(H.eq[slot]);
  H.eq[slot] = it;
  const after = derive(H);
  H.hp = clamp(Math.round(H.hp * after.hpMax / before.hpMax), 1, after.hpMax);
  H.mp = clamp(H.mp, 0, after.mpMax);
  return true;
}

export function unequip(H, slot) {
  const it = H.eq[slot];
  if (!it) return false;
  H.eq[slot] = null; H.bag.push(it);
  const D = derive(H); H.hp = Math.min(H.hp, D.hpMax); H.mp = Math.min(H.mp, D.mpMax);
  return true;
}

// ───────── находки: варианты в закрытом виде ─────────
// виды вещей, у которых ещё нет ни одной картинки, не выпадают
export const kindReady = (kind) => BASES[kind].some((b) => hasImg(`items/${b.img}`));
const slotPick = () => wpick(SLOT_W.filter(([k]) => kindReady(k)));
export const SLOT_W = [['weapon', 3], ['armor', 2], ['helm', 1.6], ['offhand', 1.4], ['cloak', 1.2], ['gloves', 1.2], ['belt', 1.2], ['boots', 1.2], ['ring', 1.5], ['amulet', 1.2]];
export function genFind(H, lvl, { bonus = 0, artifact = false, count = null } = {}) {
  const D = derive(H);
  let n = count ?? 3;
  if (power(H) === 'luckyhand') n++;
  if (hasArt(H, 'star')) n++;
  if (hasArt(H, 'compass')) bonus += 1;
  const opts = [];
  if (artifact) { const a = genArtifact(H); if (a) opts.push({ item: a }); }
  while (opts.length < n) {
    if (chance(0.18)) {
      const c = wpick([['hp', 30], ['mp', 18], ['insight', 15], ['escape', 10], ['whetstone', 8], ['tome', 5], ['elixir', 4]]);
      opts.push({ cons: c, n: c === 'hp' || c === 'mp' ? ri(1, 2) : 1 });
    } else opts.push({ item: genItem(slotPick(), lvl, { luck: D.luck, bonus }) });
  }
  for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return opts;
}

export function takeFind(H, opt) {
  if (opt.cons) { H.cons[opt.cons] = (H.cons[opt.cons] || 0) + opt.n; return; }
  const it = opt.item;
  if (it.art) H.arts.push(it.art);
  H.bag.push(it);
}

// ───────── уровни: на каждом 10 монстров на выбор, сила скрыта ─────────
export const PER_LAND = 10;
export const LEVELS = LANDS.length * PER_LAND; // 60
export const NEED_WINS = 7; // побед на уровне, чтобы открыть следующий
export const landOf = (L) => Math.min(LANDS.length - 1, Math.floor((L - 1) / PER_LAND));
export const isBossLevel = (L) => L % PER_LAND === 0;
export const levelBase = (H, L) => 1 + Math.round((L - 1) * 0.55) + H.cycle * 12;
export const levelInfo = (L) => LEVEL_INFO[L - 1];
// свои монстры уровня (если уже нарисованы), иначе — монстры земли
export function levelSpecies(L) {
  const own = LEVEL_INFO[L - 1].mons.map((m) => m.id).filter((id) => hasImg(`mon/${id}`));
  return own.length >= 2 ? own : LANDS[landOf(L)].mons;
}

export function genLevel(H, L) {
  const li = landOf(L), land = LANDS[li], base = levelBase(H, L);
  const own = levelSpecies(L);
  const prev = L > 1 ? levelSpecies(L - 1) : own;
  const cards = [];
  for (let i = 0; i < 10; i++) {
    const src = chance(0.2) ? prev : own;
    const many = src.filter((m) => cards.filter((c) => c.mon === m).length >= 3); // одного вида — не больше трёх
    let mon = pick(src.filter((m) => !many.includes(m)).length ? src.filter((m) => !many.includes(m)) : own), lv = base + ri(-2, 2), rank = wpick([[0, 64], [1, 26], [2, 10]]);
    if (i >= 8) lv += ri(3, 6); // двое заметно сильнее остальных — но кто именно, не видно
    if (chance(0.07)) {
      const sp = pick(['mimic', 'goldgolem', ...(li >= 1 ? ['wanderer'] : []), ...(li >= 2 ? ['shadow'] : [])]);
      mon = sp; rank = sp === 'wanderer' ? 2 : 0; if (sp === 'wanderer') lv += 5;
    }
    cards.push({ type: 'monster', mon, lv: Math.max(1, lv), rank, done: false });
  }
  if (isBossLevel(L)) cards[0] = { type: 'monster', mon: land.boss, lv: land.bossLv + H.cycle * 12, rank: 0, boss: true, done: false };
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return { cards, wins: 0, cleared: !!H.levels[L]?.cleared, revealed: false };
}

export function enterLevel(H, L) {
  const cur = H.levels[L];
  if (!cur || cur.cards.every((c) => c.done)) H.levels[L] = genLevel(H, L);
  return H.levels[L];
}

export function rerollLevel(H, L) {
  if (!H.levels[L]?.cleared) return false;
  H.levels[L] = genLevel(H, L); return true;
}

export function levelWin(H, L, idx) {
  const lv = H.levels[L]; const c = lv.cards[idx];
  c.done = true; lv.wins++;
  const ev = {};
  const bossOk = !isBossLevel(L) || lv.cards.some((x) => x.boss && x.done);
  if (!lv.cleared && lv.wins >= NEED_WINS && bossOk) {
    lv.cleared = true; ev.cleared = true;
    if (L >= H.maxLevel) { H.maxLevel = Math.min(LEVELS, L + 1); ev.unlocked = L < LEVELS ? L + 1 : null; }
    if (isBossLevel(L)) { H.cleared = Math.max(H.cleared, landOf(L)); ev.land = landOf(L); }
    if (L === LEVELS) ev.finale = true;
  }
  return ev;
}

export const restCost = (H) => 5 + H.lvl * 4;
export function rest(H) {
  const D = derive(H);
  H.heartUsed = false;
  if (H.gold >= restCost(H)) { H.gold -= restCost(H); H.hp = D.hpMax; H.mp = D.mpMax; return { full: true }; }
  H.hp = Math.max(H.hp, Math.round(D.hpMax / 2)); H.mp = Math.max(H.mp, Math.round(D.mpMax / 2)); return { full: false };
}

export function die(H) {
  const lostGold = Math.floor(H.gold / 2);
  H.gold -= lostGold; H.deaths++;
  const D = derive(H); H.hp = D.hpMax; H.mp = D.mpMax; H.heartUsed = false;
  return { lostGold };
}

// ───────── бой ─────────
// Описание монстра: старые (data.js MONSTERS) или монстры уровней (bestiary.js)
export function monDef(type) {
  if (MONSTERS[type]) return MONSTERS[type];
  const m = LEVEL_MONSTERS[type];
  if (!m) return MONSTERS.wolf;
  const a = ARCH[m.arch] || ARCH.beast;
  return { name: m.name, hp: a.hp, atk: a.atk, def: a.def, ab: [m.ab] };
}

// множители силы монстров — подбираются по tools/sim.mjs
export const TUNE = { hp: 2.5, atk: 3.0 };
export function makeMonster(type, lv, rank, H, boss = false) {
  const M = monDef(type);
  const R = RANKS[rank];
  const isBoss = boss || !!M.boss;
  let hpMax = TUNE.hp * M.hp * (20 + 13 * lv + 0.6 * lv * lv) * R.hp * (isBoss ? 3.8 : 1);
  let atk = TUNE.atk * M.atk * (4 + 2.8 * lv + 0.07 * lv * lv) * R.atk * (isBoss ? 1.3 : 1);
  let def = M.def * 0.9 * lv;
  if (type === 'shadow') { const D = derive(H); hpMax = D.hpMax * 0.9; atk = Math.max(D.atk, D.mpow) * 0.8; def = D.def; }
  return { type, name: M.name, lv, rank, boss: isBoss, ab: M.ab, hp: Math.round(hpMax), hpMax: Math.round(hpMax), atk, def, st: {} };
}

export function startBattle(H, node) {
  const mon = makeMonster(node.mon, node.lv, node.rank, H, node.boss);
  const sees = power(H) === 'beasteye' || hasArt(H, 'eye');
  return { mon, node, turn: 0, hst: {}, cd: {}, revealed: sees, undyingUsed: false, hits: 0, over: null, ambush: !!node.ambush };
}

const reduce = (dmg, def, lv) => dmg * (1 - def / (def + 25 + 5 * lv));
const vary = () => 0.85 + rnd() * 0.3;

function heroDamage(H, B, D, mult, kind, { forceCrit = false } = {}) {
  let dmg = (kind === 'magic' ? D.mpow : D.atk) * mult * vary();
  if (power(H) === 'berserk') dmg *= 1 + 1.2 * Math.pow(1 - H.hp / D.hpMax, 1.3);
  if (B.turn === 0 && power(H) === 'beasteye') dmg *= 1.5;
  if (B.turn < 2 && hasArt(H, 'horn')) dmg *= 1.4;
  if (hasArt(H, 'bloodmoon') && H.hp < D.hpMax / 2) dmg *= 1.25;
  if (B.hst.rage) dmg *= 1 + B.hst.rageK;
  if (B.hst.frenzy) dmg *= 2;
  if (B.hst.curse) dmg *= 0.75;
  dmg *= 1 + (D.dmgPct || 0);
  let crit = forceCrit || chance(D.crit / 100);
  if (B.hst.sure) { crit = true; dmg *= (B.hst.sureK || 3) / 1.8; B.hst.sure = 0; B.hst.sureK = 0; }
  if (B.turn === 0 && power(H) === 'shadowstep' && !B.firstDone) { crit = true; dmg *= 3 / 1.8; B.firstDone = true; }
  if (crit) dmg *= 1.8;
  const weak = B.mon.st.weak ? 0 : 1;
  const def = (B.mon.st.armor ? B.mon.def * 2 : B.mon.def) * (kind === 'magic' ? 0.7 : 1) * weak;
  return { dmg: Math.max(1, Math.round(reduce(dmg, def, B.mon.lv))), crit };
}

function hitMonster(H, B, D, dmg, ev, leechExtra = 0) {
  B.mon.hp = Math.max(0, B.mon.hp - dmg);
  const leech = D.leech + (B.hst.feast ? 50 : 0) + leechExtra;
  if (leech > 0) {
    const heal = Math.round(dmg * leech / 100);
    if (heal > 0 && H.hp < D.hpMax) { H.hp = Math.min(D.hpMax, H.hp + heal); ev.push({ who: 'hero', kind: 'heal', n: heal, quiet: true }); }
  }
}
const healBoost = (H) => (hasArt(H, 'angel') ? 1.2 : 1);
function healHero(H, D, n, ev, quiet = false) {
  n = Math.round(n * healBoost(H));
  const real = Math.min(n, D.hpMax - H.hp);
  H.hp = Math.min(D.hpMax, H.hp + n);
  if (real > 0 || !quiet) ev.push({ who: 'hero', kind: 'heal', n: Math.max(0, real), quiet });
}

// Боевое действие артефакта
function artAct(H, B, D, id, ev) {
  const a = artDef(id); const act = a.act; const m = B.mon;
  ev.push({ who: 'hero', kind: 'art', art: id, text: `${a.name}: ${act.name}` });
  const nuke = (k, kind = 'magic') => { const { dmg, crit } = heroDamage(H, B, D, k, kind); hitMonster(H, B, D, dmg, ev); ev.push({ who: 'mon', kind: 'hit', n: dmg, crit, art: id, skill: kind === 'magic' ? 'fire' : null, text: `${act.name}: ${dmg}${crit ? ' — КРИТ!' : ''}` }); return dmg; };
  switch (act.id) {
    case 'nuke': nuke(act.k); if (act.burn && m.hp > 0) { m.st.burn = 3; m.st.burnDmg = Math.round(D.mpow * 0.4); } if (act.stun && m.hp > 0 && chance(act.stun)) { m.st.stun = 1; ev.push({ who: 'mon', kind: 'status', text: 'Враг оглушён' }); } break;
    case 'weaken': m.st.weak = 3; ev.push({ who: 'mon', kind: 'status', text: 'Броня врага рассыпалась, удары слабее' }); break;
    case 'timestop': m.st.stun = 2; ev.push({ who: 'mon', kind: 'status', text: 'Время остановилось' }); break;
    case 'heal': healHero(H, D, D.hpMax * act.k, ev); break;
    case 'rage': B.hst.rage = 3; B.hst.rageK = act.k; ev.push({ who: 'hero', kind: 'status', text: `+${Math.round(act.k * 100)}% урона на 3 хода` }); break;
    case 'drain': { const d = nuke(act.k); healHero(H, D, d * 0.5, ev); break; }
    case 'bloodfeast': B.hst.feast = 3; ev.push({ who: 'hero', kind: 'status', text: 'Жажда крови: вампиризм +50%' }); break;
    case 'sure': B.hst.sure = 1; ev.push({ who: 'hero', kind: 'status', text: 'Слабое место найдено' }); break;
    case 'frost': nuke(act.k); if (m.hp > 0) { m.st.stun = 1; ev.push({ who: 'mon', kind: 'status', text: 'Враг скован льдом' }); } break;
    case 'shield': B.hst.shield = Math.round(D.hpMax * act.k); ev.push({ who: 'hero', kind: 'status', text: `Щит на ${B.hst.shield}` }); break;
    case 'mana': H.mp = D.mpMax; ev.push({ who: 'hero', kind: 'mana', n: D.mpMax }); break;
    case 'plague': m.st.poison = 5; m.st.poisonDmg = Math.round(Math.max(D.atk, D.mpow) * 0.8 * (hasArt(H, 'plague') ? 1.3 : 1)); ev.push({ who: 'mon', kind: 'status', text: 'Чумное облако окутало врага' }); break;
    case 'reflect': B.hst.reflect = 1; ev.push({ who: 'hero', kind: 'status', text: 'Зеркальный щит поднят' }); break;
    case 'pack': for (let i = 0; i < (act.hits || 3) && m.hp > 0; i++) nuke(0.8, 'phys'); break;
    case 'sunlight': nuke(act.k); healHero(H, D, D.hpMax * 0.15, ev); break;
    case 'bonearmor': B.hst.bone = 3; ev.push({ who: 'hero', kind: 'status', text: 'Костяная броня: урон −60%' }); break;
    case 'fate': if (chance(0.5)) { const d = Math.round(m.hp / 3); m.hp -= d; ev.push({ who: 'mon', kind: 'hit', n: d, art: id, text: 'Орёл! Судьба против врага' }); } else healHero(H, D, D.hpMax / 3, ev); break;
    case 'command': m.st.stun = 1; m.st.weak = Math.max(m.st.weak || 0, 2); ev.push({ who: 'mon', kind: 'status', text: 'Враг склонился перед короной' }); break;
    case 'devoursoul': { const d = Math.round(m.hpMax * 0.15); m.hp = Math.max(0, m.hp - d); ev.push({ who: 'mon', kind: 'hit', n: d, art: id }); healHero(H, D, d, ev); break; }
    case 'frenzy': B.hst.frenzy = 2; ev.push({ who: 'hero', kind: 'status', text: 'Безумие: урон вдвое выше' }); break;
    case 'holy': B.hst.poison = 0; B.hst.burn = 0; B.hst.curse = 0; B.hst.bleed = 0; healHero(H, D, D.hpMax, ev); break;
    case 'hellfire': nuke(act.k, 'phys'); if (m.hp > 0) { m.st.burn = 3; m.st.burnDmg = Math.round(D.atk * 0.4); } break;
    case 'loop': B.extra = 2; ev.push({ who: 'hero', kind: 'extra', text: 'Петля времени: ещё два хода!' }); break;
    case 'banish': nuke(act.k); if (m.hp > 0) { m.st.weak = 2; ev.push({ who: 'mon', kind: 'status', text: 'Броня врага рассыпалась' }); } break;
    case 'bind': m.st.stun = 2; ev.push({ who: 'mon', kind: 'status', text: 'Цепи титана сковали врага' }); break;
    case 'sacrifice': { const c = Math.round(D.hpMax * 0.15); H.hp = Math.max(1, H.hp - c); B.hst.sure = 1; B.hst.sureK = 4; ev.push({ who: 'hero', kind: 'status', text: `Жертва: −${c} здоровья, следующий удар вчетверо сильнее` }); break; }
    case 'wave': healHero(H, D, D.hpMax * 0.25, ev); H.mp = Math.min(D.mpMax, H.mp + Math.round(D.mpMax * 0.5)); break;
    case 'path': B.revealed = true; B.hst.sure = 1; ev.push({ who: 'mon', kind: 'reveal', text: 'Компас указал слабое место' }); break;
    case 'roots': healHero(H, D, D.hpMax * act.k, ev); if (m.hp > 0) { m.st.stun = 1; ev.push({ who: 'mon', kind: 'status', text: 'Корни оплели врага' }); } break;
  }
  B.cd[id] = act.cd;
}
export const artReady = (B, id) => !(B.cd?.[id] > 0);

// Ход героя. action: {type:'skill', id} | {type:'art', id} | {type:'defend'} | {type:'potion', id} | {type:'scroll', id} | {type:'flee'}
export function heroAct(H, B, action) {
  const ev = [];
  settle(H, B);
  if (B.over) return ev;
  B.cd ||= {};
  const D = derive(H);
  B.hst.defend = false;
  if (B.hst.stun) {
    B.hst.stun = 0;
    ev.push({ who: 'hero', kind: 'stunned', text: 'Ты оглушён и пропускаешь ход' });
  } else if (action.type === 'skill') {
    const S = SKILLS[action.id];
    const sk = H.skills[action.id];
    if (!S || !sk || H.mp < S.cost) return ev;
    H.mp -= S.cost;
    const mult = S.mult + S.per * (sk.lvl - 1);
    if (S.kind === 'heal') {
      healHero(H, D, D.hpMax * mult + D.mpow * 1.5, ev);
      ev[ev.length - 1].skill = action.id;
    } else if (S.kind === 'buff') {
      B.hst.stoneskin = 3; B.hst.stoneK = Math.min(0.8, mult);
      ev.push({ who: 'hero', kind: 'buff', skill: action.id, text: `Каменная кожа: урон по тебе −${Math.round(B.hst.stoneK * 100)}%` });
    } else if (S.kind === 'rage') {
      B.hst.rage = 3; B.hst.rageK = mult;
      ev.push({ who: 'hero', kind: 'buff', skill: action.id, text: `Боевой клич: +${Math.round(mult * 100)}% урона на 3 хода` });
    } else if (S.kind === 'hot') {
      B.hst.hot = 4; B.hst.hotN = Math.round(D.hpMax * mult + D.mpow * 0.5);
      ev.push({ who: 'hero', kind: 'buff', skill: action.id, text: `Обновление: +${B.hst.hotN} здоровья каждый ход` });
    } else {
      const hits = S.hits || 1;
      const exec = S.execute && B.mon.hp < B.mon.hpMax / 3 ? S.execute : 1;
      for (let i = 0; i < hits && B.mon.hp > 0; i++) {
        const { dmg, crit } = heroDamage(H, B, D, mult * exec, S.kind);
        hitMonster(H, B, D, dmg, ev, S.drain ? 0 : 0);
        ev.push({ who: 'mon', kind: 'hit', n: dmg, crit, skill: action.id });
        if (S.drain) healHero(H, D, dmg * S.drain, ev);
        if (S.kind === 'phys' && hasArt(H, 'storm') && chance(0.1) && B.mon.hp > 0) {
          const z = Math.round(D.mpow * 0.9); B.mon.hp = Math.max(0, B.mon.hp - z); ev.push({ who: 'mon', kind: 'hit', n: z, skill: 'thunder', text: 'Сердце бури: молния!' });
        }
      }
      if (exec > 1) ev.push({ who: 'mon', kind: 'status', text: 'Казнь!' });
      if (B.mon.hp > 0) {
        const pk = hasArt(H, 'plague') ? 1.3 : 1;
        if (S.poison) { B.mon.st.poison = 4; B.mon.st.poisonDmg = Math.max(1, Math.round(D.atk * (S.poison + 0.03 * sk.lvl) * pk)); ev.push({ who: 'mon', kind: 'status', text: 'Яд проникает в кровь' }); }
        if (S.bleed) { B.mon.st.bleed = 4; B.mon.st.bleedDmg = Math.max(1, Math.round(D.atk * (S.bleed + 0.03 * sk.lvl))); ev.push({ who: 'mon', kind: 'status', text: 'Враг истекает кровью' }); }
        if (S.burn) { B.mon.st.burn = 3; B.mon.st.burnDmg = Math.max(1, Math.round(D.mpow * (S.burn + 0.03 * sk.lvl))); ev.push({ who: 'mon', kind: 'status', text: 'Враг горит' }); }
        if (S.stun && chance(Math.min(0.85, S.stun + 0.04 * sk.lvl) * (B.mon.boss ? 0.5 : 1))) { B.mon.st.stun = 1; ev.push({ who: 'mon', kind: 'status', text: action.id === 'ice' ? 'Враг скован льдом' : 'Враг оглушён' }); }
      }
    }
    const up = skillUse(H, action.id);
    if (up) ev.push(up);
  } else if (action.type === 'art') {
    if (!hasArt(H, action.id) || !artReady(B, action.id)) return ev;
    artAct(H, B, D, action.id, ev);
  } else if (action.type === 'defend') {
    B.hst.defend = true;
    const n = Math.round(D.mpMax * 0.25);
    H.mp = Math.min(D.mpMax, H.mp + n);
    ev.push({ who: 'hero', kind: 'defend', text: `Защитная стойка: урон вдвое меньше, +${n} маны` });
  } else if (action.type === 'potion') {
    if (!(H.cons[action.id] > 0)) return ev;
    H.cons[action.id]--;
    if (action.id === 'hp') healHero(H, D, D.hpMax * 0.45, ev);
    else { const n = Math.round(D.mpMax * 0.6); H.mp = Math.min(D.mpMax, H.mp + n); ev.push({ who: 'hero', kind: 'mana', n }); }
  } else if (action.type === 'scroll') {
    if (!(H.cons[action.id] > 0)) return ev;
    if (action.id === 'escape' && B.mon.boss) return ev;
    H.cons[action.id]--;
    if (action.id === 'insight') { B.revealed = true; ev.push({ who: 'mon', kind: 'reveal', text: 'Свиток прозрения открыл врага' }); return ev; }
    B.over = 'fled'; ev.push({ who: 'hero', kind: 'fled', text: 'Дым свитка — и ты исчез' }); return ev;
  } else if (action.type === 'flee') {
    if (B.mon.boss) return ev;
    const p = clamp(0.45 + D.s.agi * 0.015 - B.mon.rank * 0.1, 0.15, 0.85);
    if (chance(p)) { B.over = 'fled'; ev.push({ who: 'hero', kind: 'fled', text: 'Ты скрылся' }); return ev; }
    ev.push({ who: 'hero', kind: 'fail', text: 'Убежать не вышло!' });
  }
  settle(H, B);
  if (B.over) return ev;
  // лишние ходы: петля времени, песочные часы, ось времени
  if (B.extra > 0) { B.extra--; B.turn++; tickCd(B); return ev; }
  if (action.type === 'skill' && ((hasArt(H, 'hourglass') && chance(0.2)) || (hasArt(H, 'chronos') && chance(0.1)))) {
    ev.push({ who: 'hero', kind: 'extra', text: 'Время замедлилось: ещё один ход!' });
    B.turn++; tickCd(B);
    return ev;
  }
  monsterTurn(H, B, D, ev);
  endRound(H, B, D, ev);
  B.turn++;
  settle(H, B);
  return ev;
}

function tickCd(B) { for (const k of Object.keys(B.cd || {})) if (B.cd[k] > 0 && B.cd[k] < 99) B.cd[k]--; }

function settle(H, B) {
  if (!B.over && B.mon.hp <= 0 && H.hp > 0) B.over = 'win';
}

function hurtHero(H, B, D, raw, ev, label) {
  if (chance(D.dodge / 100)) {
    ev.push({ who: 'hero', kind: 'dodge', text: 'Уворот!' });
    if (power(H) === 'counter' && B.mon.hp > 0) { const { dmg, crit } = heroDamage(H, B, D, 1, 'phys'); hitMonster(H, B, D, dmg, ev); ev.push({ who: 'mon', kind: 'hit', n: dmg, crit, skill: 'strike', text: `Контрудар: ${dmg}` }); }
    return 0;
  }
  let dmg = reduce(raw * vary(), D.def, B.mon.lv);
  if (B.hst.defend) dmg *= 0.5;
  if (B.hst.stoneskin) dmg *= 1 - B.hst.stoneK;
  if (B.hst.bone) dmg *= 0.4;
  if (B.hst.frenzy) dmg *= 1.3;
  if (power(H) === 'faith' && (B.faith ?? 3) > 0) { dmg *= 0.5; B.faith = (B.faith ?? 3) - 1; }
  dmg = Math.max(1, Math.round(dmg));
  if (B.hst.reflect) { B.hst.reflect = 0; B.mon.hp = Math.max(0, B.mon.hp - dmg); ev.push({ who: 'mon', kind: 'hit', n: dmg, text: 'Зеркальный щит вернул удар!' }); return 0; }
  if (power(H) === 'mirror') {
    B.hits++;
    if (B.hits % 9 === 0) { B.mon.hp = Math.max(0, B.mon.hp - dmg); ev.push({ who: 'mon', kind: 'hit', n: dmg, text: 'Зеркало душ отразило удар целиком!' }); return 0; }
    const back = Math.max(1, Math.round(dmg * 0.25)); B.mon.hp = Math.max(0, B.mon.hp - back);
    ev.push({ who: 'mon', kind: 'hit', n: back, mirror: true, quiet: true });
  } else if (hasArt(H, 'mirror')) {
    const back = Math.max(1, Math.round(dmg * 0.1)); B.mon.hp = Math.max(0, B.mon.hp - back);
    ev.push({ who: 'mon', kind: 'hit', n: back, mirror: true, quiet: true });
  }
  if (B.hst.shield > 0) {
    const ab = Math.min(B.hst.shield, dmg); B.hst.shield -= ab; dmg -= ab;
    ev.push({ who: 'hero', kind: 'status', text: `Щит поглотил ${ab}` });
    if (dmg <= 0) return 0;
  }
  H.hp -= dmg;
  ev.push({ who: 'hero', kind: 'hit', n: dmg, text: label });
  checkDeath(H, B, D, ev);
  return dmg;
}

function checkDeath(H, B, D, ev) {
  if (H.hp > 0) return;
  if (power(H) === 'undying' && !B.undyingUsed) { B.undyingUsed = true; H.hp = Math.round(D.hpMax * 0.4); ev.push({ who: 'hero', kind: 'revive', text: 'Несломленный! Ты поднимаешься снова' }); return; }
  if (hasArt(H, 'phylactery') && !B.phyUsed) { B.phyUsed = true; H.hp = 1; ev.push({ who: 'hero', kind: 'revive', text: 'Филактерия удержала душу в теле' }); return; }
  if (hasArt(H, 'heart') && !H.heartUsed) { H.heartUsed = true; H.hp = Math.round(D.hpMax * 0.5); ev.push({ who: 'hero', kind: 'revive', text: 'Сердце дракона вспыхнуло и вернуло тебя к жизни' }); return; }
  H.hp = 0; B.over = 'lose';
}

function monsterTurn(H, B, D, ev) {
  const m = B.mon;
  if (m.hp <= 0 || B.over) return;
  if (m.st.stun) { m.st.stun--; ev.push({ who: 'mon', kind: 'stunned', text: `${shownName(B)} не может двинуться` }); return; }
  const atk = m.atk * (1 + 0.3 * (m.st.enrage || 0)) * (m.st.weak ? 0.75 : 1);
  if (m.st.charging) { m.st.charging = 0; hurtHero(H, B, D, atk * 2.3, ev, 'Страшный удар!'); return; }
  if (m.type === 'goldgolem' && B.turn >= 5) { B.over = 'escaped'; ev.push({ who: 'mon', kind: 'escaped', text: 'Золотой голем ушёл под землю вместе с сокровищами' }); return; }
  const ab = chance(m.boss ? 0.4 : 0.3) ? pick(m.ab) : null;
  const burnImmune = hasArt(H, 'scale');
  switch (ab) {
    case 'double': hurtHero(H, B, D, atk * 0.7, ev, 'Первый удар'); if (!B.over) hurtHero(H, B, D, atk * 0.7, ev, 'Второй удар'); break;
    case 'poison': if (hurtHero(H, B, D, atk * 0.7, ev)) { B.hst.poison = 3; B.hst.poisonDmg = Math.round(atk * 0.25); ev.push({ who: 'hero', kind: 'status', text: 'Ты отравлен' }); } break;
    case 'regen': { const n = Math.round(m.hpMax * 0.12); m.hp = Math.min(m.hpMax, m.hp + n); ev.push({ who: 'mon', kind: 'heal', n, text: 'Раны затягиваются' }); break; }
    case 'curse': B.hst.curse = 3; ev.push({ who: 'hero', kind: 'status', text: 'Проклятие: твой урон слабее на 3 хода' }); hurtHero(H, B, D, atk * 0.5, ev); break;
    case 'lifesteal': { const d = hurtHero(H, B, D, atk, ev); if (d) { m.hp = Math.min(m.hpMax, m.hp + Math.round(d * 0.5)); ev.push({ who: 'mon', kind: 'heal', n: Math.round(d * 0.5), text: 'Пьёт твою жизнь' }); } break; }
    case 'stun': if (hurtHero(H, B, D, atk * 0.8, ev) && chance(0.6)) { B.hst.stun = 1; ev.push({ who: 'hero', kind: 'status', text: 'Ты оглушён' }); } break;
    case 'drain': if (hurtHero(H, B, D, atk * 0.6, ev)) { const n = Math.round(H.mp * 0.4); H.mp -= n; ev.push({ who: 'hero', kind: 'status', text: `Выжжено ${n} маны` }); } break;
    case 'armor': m.st.armor = 2; ev.push({ who: 'mon', kind: 'status', text: 'Покрылся бронёй' }); break;
    case 'devour': m.st.charging = 1; ev.push({ who: 'mon', kind: 'charge', text: 'Готовит страшный удар! Встань в защиту' }); break;
    case 'enrage': m.st.enrage = Math.min(3, (m.st.enrage || 0) + 1); ev.push({ who: 'mon', kind: 'status', text: 'Впадает в ярость' }); hurtHero(H, B, D, atk * 0.8, ev); break;
    case 'fireburn': if (hurtHero(H, B, D, atk * 0.9, ev) && !burnImmune) { B.hst.burn = 3; B.hst.burnDmg = Math.round(atk * 0.2); ev.push({ who: 'hero', kind: 'status', text: 'Ты горишь' }); } break;
    case 'freeze': if (hurtHero(H, B, D, atk * 0.8, ev) && chance(0.45)) { B.hst.stun = 1; ev.push({ who: 'hero', kind: 'status', text: 'Тебя сковал лёд' }); } break;
    case 'steal': if (hurtHero(H, B, D, atk * 0.8, ev)) { const n = Math.min(H.gold, Math.round(H.gold * 0.06) + 3); H.gold -= n; B.stolen = (B.stolen || 0) + n; ev.push({ who: 'hero', kind: 'status', text: `Украдено ${n} золота` }); } break;
    default: hurtHero(H, B, D, atk, ev);
  }
}

function endRound(H, B, D, ev) {
  const m = B.mon;
  if (!B.over && m.hp > 0) {
    for (const [k, t] of [['poison', 'яд'], ['bleed', 'кровь'], ['burn', 'огонь']]) {
      if (m.st[k] && m.hp > 0) { m.hp = Math.max(0, m.hp - m.st[k + 'Dmg']); m.st[k]--; ev.push({ who: 'mon', kind: 'dot', n: m.st[k + 'Dmg'], text: t }); }
    }
    if (m.hp <= 0) { B.over = 'win'; return; }
  }
  if (m.st.armor) m.st.armor--;
  if (m.st.weak) m.st.weak--;
  if (B.over) return;
  if (B.hst.poison) { H.hp -= B.hst.poisonDmg; B.hst.poison--; ev.push({ who: 'hero', kind: 'dot', n: B.hst.poisonDmg, text: 'яд' }); }
  if (B.hst.burn) { H.hp -= B.hst.burnDmg; B.hst.burn--; ev.push({ who: 'hero', kind: 'dot', n: B.hst.burnDmg, text: 'огонь' }); }
  checkDeath(H, B, D, ev);
  if (B.over) return;
  for (const k of ['curse', 'stoneskin', 'rage', 'feast', 'bone', 'frenzy']) if (B.hst[k]) B.hst[k]--;
  if (B.hst.hot) { B.hst.hot--; healHero(H, D, B.hst.hotN, ev, true); }
  if (hasArt(H, 'feather')) healHero(H, D, D.hpMax * 0.05, ev, true);
  if (hasArt(H, 'tree')) { healHero(H, D, D.hpMax * 0.03, ev, true); H.mp = Math.min(D.mpMax, H.mp + Math.round(D.mpMax * 0.03)); }
  if (hasArt(H, 'moon')) H.mp = Math.min(D.mpMax, H.mp + Math.round(D.mpMax * 0.05));
  if (hasArt(H, 'pearl')) H.mp = Math.min(D.mpMax, H.mp + Math.round(D.mpMax * 0.04));
  if (power(H) === 'wild') { healHero(H, D, D.hpMax * 0.04, ev, true); H.mp = Math.min(D.mpMax, H.mp + Math.round(D.mpMax * 0.04)); }
  H.mp = Math.min(D.mpMax, H.mp + Math.max(1, Math.round(D.mpMax * 0.04)));
  tickCd(B);
}

export function ambush(H, B) {
  const ev = [];
  const D = derive(H);
  ev.push({ who: 'mon', kind: 'status', text: 'Тебя заметили — враг нападает первым!' });
  monsterTurn(H, B, D, ev);
  settle(H, B);
  return ev;
}

export function shownName(B) { return B.known ? B.mon.name : 'Существо'; }

export function victory(H, B) {
  const m = B.mon, D = derive(H), R = RANKS[m.rank];
  let xp = Math.round((8 + m.lv * 5 + m.lv * m.lv * 0.25) * R.xp * (m.boss ? 4 : 1) * (m.type === 'wanderer' ? 2 : 1));
  let gold = Math.round((4 + m.lv * 3) * (0.7 + rnd() * 0.6) * (1 + D.luck * 0.03) * (m.boss ? 5 : 1) * (1 + R.loot * 0.4));
  if (m.type === 'goldgolem') gold *= 8;
  if (power(H) === 'luckyhand') gold *= 2;
  if (hasArt(H, 'key')) { gold = Math.round(gold * 1.3); xp = Math.round(xp * 1.3); }
  if (hasArt(H, 'coin')) gold = Math.round(gold * 1.2);
  if (hasArt(H, 'lantern')) xp = Math.round(xp * 1.15);
  if (power(H) === 'souls') H.souls = (H.souls || 0) + 1;
  gold += B.stolen || 0;
  H.gold += gold; H.kills++;
  const ev = addXp(H, xp);
  const D2 = derive(H);
  H.hp = Math.min(D2.hpMax, H.hp + Math.round(D2.hpMax * (0.2 + (hasArt(H, 'soul') ? 0.1 : 0)))); H.mp = Math.min(D2.mpMax, H.mp + Math.round(D2.mpMax * 0.25));
  let find = null;
  const findChance = m.boss || m.type === 'wanderer' || m.type === 'mimic' ? 1 : 0.55 + R.loot * 0.2;
  if (chance(findChance)) find = genFind(H, m.lv, { bonus: R.loot + (m.boss ? 2 : 0) + (m.type === 'wanderer' ? 3 : 0), artifact: m.boss || m.type === 'wanderer' || (R.loot === 2 && chance(0.12)) });
  return { xp, gold, find, ev };
}

// ───────── магазин ─────────
export const mysteryPrice = (H) => Math.round((40 + H.lvl * 15) * 2.2);
export const consPrice = (H, id) => Math.round(CONS[id].price * (1 + H.lvl * 0.12));
export function campShop(H) {
  const sig = Object.keys(BASES).filter(kindReady).join();
  if (!H.shop || H.shop.lvl !== H.lvl || H.shop.sig !== sig) {
    const lv = Math.max(1, H.lvl), luck = derive(H).luck;
    const all = ['weapon', 'armor', 'helm', 'offhand', 'cloak', 'gloves', 'belt', 'boots', 'ring', 'amulet'];
    const slots = [...all.filter(kindReady), 'weapon', 'armor'].slice(0, 10);
    const rar = [0, 1, 1, 2, 1, 1, 0, 1, 2, 1];
    H.shop = {
      lvl: H.lvl, sig,
      wares: slots.map((sl, i) => ({ item: genItem(sl, lv, { rarity: rar[i] }), sold: false })),
      boxes: [0, 1, 2, 3, 4, 5].map(() => ({ item: genItem(slotPick(), lv + 1, { luck, bonus: 1 }), sold: false })),
    };
  }
  return H.shop;
}
export const warePrice = (it) => Math.round(itemValue(it) * 6 + 20);
export function buyWare(H, i) {
  const w = H.shop?.wares[i];
  if (!w || w.sold || H.gold < warePrice(w.item)) return null;
  H.gold -= warePrice(w.item); w.sold = true; H.bag.push(w.item); return w.item;
}
export function buyCons(H, id, price = consPrice(H, id)) {
  if (H.gold < price) return false;
  H.gold -= price; H.cons[id] = (H.cons[id] || 0) + 1; return true;
}
export function buyBox(H, i, price = mysteryPrice(H)) {
  const b = H.shop?.boxes[i];
  if (!b || b.sold || H.gold < price) return null;
  H.gold -= price; b.sold = true; H.bag.push(b.item); return b.item;
}
export function sell(H, uidv) {
  const i = H.bag.findIndex((x) => x.uid === uidv);
  if (i < 0) return 0;
  const it = H.bag[i];
  if (it.art) return 0;
  const p = sellPrice(it); H.bag.splice(i, 1); H.gold += p; return p;
}
export const upgradeCost = (it, H) => Math.round((20 + it.lvl * 8) * Math.pow(1 + (it.plus || 0), 1.5) * (H && power(H) === 'forge' ? 0.5 : 1));
export const upgradeChance = (it, H) => H && power(H) === 'forge' ? 1 : [1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3][it.plus || 0] ?? 0;
export function upgrade(H, slot, free = false) {
  const it = H.eq[slot];
  if (!it || it.art || (it.plus || 0) >= 10) return null;
  const cost = upgradeCost(it, H);
  if (!free) { if (H.gold < cost) return null; H.gold -= cost; }
  const ok = free || chance(upgradeChance(it, H));
  if (ok) {
    const before = derive(H);
    it.plus = (it.plus || 0) + 1;
    const after = derive(H); H.hp += Math.max(0, after.hpMax - before.hpMax);
  }
  return { ok, cost: free ? 0 : cost };
}
export function useTome(H) { if (!(H.cons.tome > 0)) return null; H.cons.tome--; return learnRandomSkill(H); }
export function useElixir(H) { if (!(H.cons.elixir > 0)) return null; H.cons.elixir--; const s = pick(['str', 'agi', 'vit', 'mag', 'luck']); H.stats[s]++; return s; }
export function useWhetstone(H) { if (!(H.cons.whetstone > 0) || !H.eq.weapon || (H.eq.weapon.plus || 0) >= 10) return null; H.cons.whetstone--; return upgrade(H, 'weapon', true); }
export function campPotion(H, id) {
  if (!(H.cons[id] > 0)) return null;
  const D = derive(H); H.cons[id]--;
  if (id === 'hp') H.hp = Math.min(D.hpMax, H.hp + Math.round(D.hpMax * 0.45)); else H.mp = Math.min(D.mpMax, H.mp + Math.round(D.mpMax * 0.6));
  return true;
}

export function startNewCycle(H) { H.cycle++; H.cleared = -1; H.maxLevel = 1; H.levels = {}; }
