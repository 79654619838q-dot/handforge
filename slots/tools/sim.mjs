// Проверка отдачи автоматов: node slots/tools/sim.mjs [вращений=2000000] [автомат]
// Гоняет тот же код, что и игра (engine.js + machines.js), со всеми помощниками и бонус-играми.
import { MACHINES, JACKPOTS, JACKPOT_SEED, JACKPOT_SHARE, BUY_BONUS, BOOSTERS, GIFT_WILD_CHANCE, RAIN_WILD } from '../js/machines.js';
import { buildStrips, resolveSpin, seeded } from '../js/engine.js';

const N = Number(process.argv[2] || 2e6);
const only = process.argv.slice(3).find((a) => !a.startsWith('--'));
const BOOST = process.argv.includes('--boost'); // посчитать, сколько добавляет каждый усилитель
const BET = 100;
const JP_BET = Object.fromEntries(JACKPOTS.map((j) => [j.id, j.bet]));

for (const m of MACHINES) {
  if (only && m.id !== only) continue;
  const strips = buildStrips(m), fsStrips = buildStrips(m, true);
  const rnd = seeded(777 + m.seed);
  const S = { lines: 0, fs: 0, pick: 0, jp: 0, hits: 0, fsTrig: 0, fsSpins: 0, pickTrig: 0, jpTrig: 0, grand: 0, gift: 0, expand: 0, mystery: 0, multHit: 0, streak2: 0, big15: 0, big40: 0, big100: 0, max: 0 };
  const jpCount = { mini: 0, minor: 0, major: 0, grand: 0 };

  // деньги за бонус-игры одного вращения (Гранд считаем отдельно — он зависит от общего котла)
  // rec = false — пробные раунды для цены «Купить бонус», в общий счёт не идут
  const extras = (o, rec) => {
    let x = 0;
    if (o.pick) { x += o.pick.total * BET; if (rec) { S.pickTrig++; S.pick += o.pick.total * BET; } }
    if (o.jackpot) {
      if (rec) { S.jpTrig++; jpCount[o.jackpot.tier]++; }
      if (o.jackpot.tier === 'grand') { if (rec) S.grand++; }
      else { x += JP_BET[o.jackpot.tier] * BET; if (rec) S.jp += JP_BET[o.jackpot.tier] * BET; }
    }
    return x;
  };
  const runFs = (count, rec = true) => {
    const fs = { i: 0, sticky: [] };
    let left = count, total = 0;
    while (left > 0) {
      left--;
      const o = resolveSpin(m, fsStrips, { rnd, bet: BET, fs });
      fs.i++; fs.sticky = o.fx.sticky; fs.collected = (fs.collected || 0) + (o.fx.collected || 0);
      total += o.total + extras(o, rec);
      left += o.scatter.fs;
      if (rec) S.fsSpins++;
    }
    return total;
  };

  let streak = 0;
  for (let i = 0; i < N; i++) {
    const o = resolveSpin(m, strips, { rnd, bet: BET, streak });
    if (o.fx.gift.length) S.gift++;
    if (o.fx.expand.length) S.expand++;
    if (o.fx.mystery) S.mystery++;
    if (o.mult.sum) S.multHit++;
    if (o.mult.streak > 1) S.streak2++;
    let win = o.total + extras(o, true);
    S.lines += o.total;
    if (o.scatter.fs) { S.fsTrig++; const f = runFs(o.scatter.fs); S.fs += f; win += f; }
    if (win > 0 || o.jackpot) { S.hits++; streak++; } else streak = 0;
    S.max = Math.max(S.max, win);
    if (win >= 15 * BET) S.big15++;
    if (win >= 40 * BET) S.big40++;
    if (win >= 100 * BET) S.big100++;
  }
  // цена «Купить бонус»: средний выигрыш раунда за 3 бонуса
  let buyTotal = 0; const BUYN = Math.max(2000, N / 200);
  for (let i = 0; i < BUYN; i++) buyTotal += runFs(m.freeSpins[3], false);

  const stake = N * BET;
  const pG = S.grand / N;
  const grandRtp = pG * JACKPOT_SEED / BET + (pG ? JACKPOT_SHARE : 0);
  const rtp = (S.lines + S.fs + S.pick + S.jp) / stake;
  const f = (x) => (x * 100).toFixed(1) + '%';
  const every = (k) => (k ? 'раз в ' + Math.round(N / k).toLocaleString('ru') : '—');
  console.log(`\n${m.title} (${m.id}), ${N.toLocaleString('ru')} вращений, ставка ${BET}`);
  console.log(`  линии ${f(S.lines / stake)}, бесплатные ${f(S.fs / stake)}, сундуки ${f(S.pick / stake)}, джекпоты Мини–Большой ${f(S.jp / stake)}, Гранд ≈ ${f(grandRtp)}`);
  console.log(`  ИТОГО без Гранда ${f(rtp)}, с Грандом ≈ ${f(rtp + grandRtp)}; выигрыш в ${f(S.hits / N)} вращений`);
  console.log(`  бесплатные ${every(S.fsTrig)} (${(S.fsSpins / S.fsTrig).toFixed(1)} вращ., ${(S.fs / S.fsTrig / BET).toFixed(1)}×); «Купить бонус» отдаёт в среднем ${(buyTotal / BUYN / BET).toFixed(1)}× при цене ${BUY_BONUS}×`);
  console.log(`  сундуки ${every(S.pickTrig)} (${(S.pick / Math.max(1, S.pickTrig) / BET).toFixed(1)}×); джекпот-игра ${every(S.jpTrig)}: мини ${every(jpCount.mini)}, малый ${every(jpCount.minor)}, большой ${every(jpCount.major)}, гранд ${every(jpCount.grand)}`);
  console.log(`  подарок ${every(S.gift)}, растущий WILD ${every(S.expand)}, «?» ${every(S.mystery)}, множитель на барабанах ${every(S.multHit)}, горячая серия ${every(S.streak2)}`);
  console.log(`  ≥15× ${every(S.big15)}, ≥40× ${every(S.big40)}, ≥100× ${every(S.big100)}; рекорд ${(S.max / BET).toFixed(0)}×`);

  if (BOOST) {
    // отдача обычных вращений (с бесплатными, сундуками и джекпотами Мини–Большой) с усилителем и без
    const magStrips = buildStrips(m, 'magnet');
    const run = (b, n) => {
      const r = seeded(999 + m.seed);
      let won = 0, streak = 0;
      for (let i = 0; i < n; i++) {
        const o = resolveSpin(m, b === 'magnet' ? magStrips : strips, { rnd: r, bet: BET, streak, boostMult: b === 'x2' ? 2 : 1, giftChance: b === 'wilds' ? GIFT_WILD_CHANCE * RAIN_WILD : GIFT_WILD_CHANCE });
        let w = o.total + extras(o, false);
        if (o.scatter.fs) w += runFs(o.scatter.fs, false);
        won += w;
        if (w > 0 || o.jackpot) streak++; else if (b !== 'hot') streak = 0;
      }
      return won / (n * BET);
    };
    const n = Math.max(200000, N / 4);
    const base = run(null, n);
    const parts = BOOSTERS.map((bo) => {
      const gain = (run(bo.id, n) - base) * bo.spins;            // в ставках за весь срок усилителя
      return `${bo.name}: +${gain.toFixed(1)} ставок за ${bo.spins} вращ. → цена при 88%: ${(gain / 0.88).toFixed(0)}`;
    });
    console.log('  усилители: ' + parts.join('; '));
  }
}
