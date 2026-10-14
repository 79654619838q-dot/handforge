// Автоигра для проверки баланса: node realm/tools/sim.mjs [прогонов=40] [герой|all]
// Простая «разумная» тактика: очки в главную характеристику, лучшие вещи надеваются, зелья при <35% здоровья,
// в лагерь — когда нет зелий и мало здоровья. Печатает, на каком уровне и за сколько походов побеждён каждый хозяин земли.
import * as E from '../js/engine.js';
import { HEROES, LANDS, SKILLS } from '../js/data.js';

const RUNS = +process.argv[2] || 40;
const WHO = process.argv[3] || 'all';
if (process.argv[4]) E.TUNE.hp = +process.argv[4];
if (process.argv[5]) E.TUNE.atk = +process.argv[5];
let seed = 12345;
E.setRandom(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });

const MAIN = { paladin: ['str', 'vit', 'mag'], necro: ['mag', 'vit'], dwarf: ['str', 'vit'], druid: ['mag', 'vit'], assassin: ['agi', 'str', 'vit'], ronin: ['str', 'agi', 'vit'], knight: ['str', 'vit'], huntress: ['agi', 'str', 'vit'], monk: ['str', 'mag', 'vit'], thief: ['agi', 'str', 'vit'], barbarian: ['str', 'vit'], seer: ['mag', 'vit'] };

function manage(H) {
  const m = MAIN[H.id];
  let i = 0;
  while (H.points > 0) E.spendPoint(H, m[i++ % m.length]);
  for (const it of [...H.bag]) {
    if (it.art) { if (!H.eq.art1 || !H.eq.art2) E.equip(H, it.uid); continue; }
    const sl = E.slotFor(H, it); const cur = it.slot === 'ring' ? [H.eq.ring1, H.eq.ring2].sort((a, b) => E.itemScore(a, H) - E.itemScore(b, H))[0] : H.eq[sl];
    if (E.itemScore(it, H) > E.itemScore(cur, H) && !(it.rarity === 5 && it.st.hpPct)) E.equip(H, it.uid, it.slot === 'ring' ? (cur === H.eq.ring1 ? 'ring1' : 'ring2') : undefined);
  }
  while (H.cons.tome > 0) E.useTome(H);
  while (H.cons.elixir > 0) E.useElixir(H);
  while (H.cons.whetstone > 0 && E.useWhetstone(H));
}

function camp(H) {
  manage(H);
  for (const it of [...H.bag]) if (!it.art) E.sell(H, it.uid);
  while (H.cons.hp < 5 && E.buyCons(H, 'hp'));
  while (H.cons.mp < 2 && E.buyCons(H, 'mp'));
  for (const s of ['weapon', 'armor', 'helm', 'offhand', 'gloves', 'boots', 'belt', 'cloak']) {
    const it = H.eq[s];
    while (it && (it.plus || 0) < 5 && E.upgradeCost(it, H) < H.gold * 0.4) E.upgrade(H, s);
  }
}

function fight(H, node, stats) {
  const B = E.startBattle(H, node);
  B.known = true;
  let rounds = 0;
  while (!B.over && rounds++ < 200) {
    const D = E.derive(H);
    let a;
    const readyArt = E.equippedArts(H).find((id) => E.artReady(B, id));
    if (H.hp < D.hpMax * 0.35 && H.cons.hp > 0) a = { type: 'potion', id: 'hp' };
    else if (readyArt && B.turn % 2 === 0) a = { type: 'art', id: readyArt };
    else if (H.hp < D.hpMax * 0.45 && H.skills.heal && H.mp >= SKILLS.heal.cost) a = { type: 'skill', id: 'heal' };
    else if (B.mon.st.charging) a = H.skills.stoneskin && H.mp >= 8 ? { type: 'skill', id: 'stoneskin' } : { type: 'defend' };
    else {
      const opts = Object.keys(H.skills).filter((k) => ['phys', 'magic'].includes(SKILLS[k].kind) && H.mp >= SKILLS[k].cost);
      opts.sort((x, y) => {
        const v = (k) => { const S = SKILLS[k]; return (S.mult + S.per * (H.skills[k].lvl - 1)) * (S.hits || 1) * (S.kind === 'magic' ? D.mpow : D.atk) + (S.poison ? D.atk * 1.2 : 0) + (S.burn ? D.mpow * 0.6 : 0); };
        return v(y) - v(x);
      });
      a = { type: 'skill', id: opts[0] || 'strike' };
      if (!opts.length && H.mp < 5 && H.cons.mp > 0 && D.mpow > D.atk) a = { type: 'potion', id: 'mp' };
    }
    E.heroAct(H, B, a);
  }
  if (B.over === 'win') {
    const r = E.victory(H, B);
    if (r.find) {
      // берём вариант с лучшей оценкой (в настоящей игре игрок видит только облик)
      const best = r.find.reduce((b, o) => (o.item && E.itemScore(o.item, H) > (b.item ? E.itemScore(b.item, H) : -1) ? o : b), r.find[0]);
      E.takeFind(H, best);
    }
  }
  stats.fights++;
  return B.over;
}

function play(H, stats) {
  // на уровне — случайный непобеждённый монстр (сила скрыта, бот не знает, кто сильнее)
  const L = H.maxLevel > 1 && stats.failStreak >= 2 ? H.maxLevel - 1 : H.maxLevel;
  let lv = E.enterLevel(H, L);
  if (lv.cleared && lv.cards.filter((c) => !c.done).length <= 3) { E.rerollLevel(H, L); lv = H.levels[L]; }
  const open = lv.cards.map((c, i) => i).filter((i) => !lv.cards[i].done);
  const idx = open[Math.floor(Math.random() * open.length)];
  const D = E.derive(H);
  if (H.hp < D.hpMax * 0.6) E.rest(H);
  const r = fight(H, lv.cards[idx], stats);
  stats.res[r] = (stats.res[r] || 0) + 1;
  if (r === 'lose') { E.die(H); stats.deaths++; stats.failStreak++; camp(H); return; }
  if (r === 'win') { const ev = E.levelWin(H, L, idx); if (L < H.maxLevel && ++stats.grind >= 10) { stats.failStreak = 0; stats.grind = 0; } if (ev.land != null) stats.lands[ev.land] = { lvl: H.lvl, fights: stats.fights }; }
  if (r === 'fled') {}
  manage(H);
}

const heroes = WHO === 'all' ? HEROES.map((h) => h.id) : [WHO];
for (const id of heroes) {
  const rows = LANDS.map(() => ({ lvl: 0, f: 0, n: 0 }));
  let deathsTot = 0, fightsTot = 0, finished = 0;
  for (let run = 0; run < RUNS; run++) {
    const H = E.newHero(id);
    const stats = { deaths: 0, fights: 0, failStreak: 0, grind: 0, lands: {}, res: {} };
    while (H.cleared < LANDS.length - 1 && stats.fights < 3000) { if (stats.fights % 25 === 0) camp(H); play(H, stats); }
    if (H.cleared === LANDS.length - 1) finished++; else console.log('  застрял:', H.maxLevel, H.lvl, JSON.stringify(stats.res));
    deathsTot += stats.deaths; fightsTot += stats.fights;
    for (const [li, v] of Object.entries(stats.lands)) { rows[li].lvl += v.lvl; rows[li].f += v.fights; rows[li].n++; }
  }
  console.log(`\n${id}: прошли игру ${finished}/${RUNS}, боёв в среднем ${(fightsTot / RUNS).toFixed(0)}, смертей ${(deathsTot / RUNS).toFixed(1)}`);
  console.log(rows.map((r, i) => `  ${LANDS[i].name.padEnd(18)} хозяин на ур. героя ${r.n ? (r.lvl / r.n).toFixed(1) : '—'}, к бою ${r.n ? (r.f / r.n).toFixed(0) : '—'} (${r.n}/${RUNS})`).join('\n'));
}
