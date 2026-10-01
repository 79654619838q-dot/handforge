// Проверка отдачи автоматов: node slots/tools/sim.mjs [вращений=20000000]
// Гоняет тот же код, что и игра (engine.js + machines.js), с повторяемым случаем.
import { MACHINES, JACKPOT_SEED, JACKPOT_SHARE } from '../js/machines.js';
import { buildStrips, spinStops, windowAt, evaluate, fsMultipliers, seeded } from '../js/engine.js';

const N = Number(process.argv[2] || 2e7);
const BET = 100, LINE = BET / 20;
const only = process.argv[3];

for (const m of MACHINES) {
  if (only && m.id !== only) continue;
  const strips = buildStrips(m);
  const rnd = seeded(777 + m.seed);
  let base = 0, scat = 0, fsWin = 0, hits = 0, fsTrig = 0, jpHits = 0, fsSpins = 0, maxWin = 0;
  const big = { 15: 0, 40: 0, 100: 0 };
  let curFsTotal = 0;
  for (let i = 0; i < N; i++) {
    const g = windowAt(strips, spinStops(strips, rnd));
    const e = evaluate(m, g, { lineBet: LINE, totalBet: BET });
    base += e.total - e.scatter.amount; scat += e.scatter.amount;
    if (e.total > 0) hits++;
    if (e.jackpot.hit) jpHits++;
    let spinWin = e.total;
    if (e.scatter.fs) {
      fsTrig++;
      let left = e.scatter.fs, k = 0;
      curFsTotal = 0;
      while (left > 0) {
        left--;
        const mul = fsMultipliers(m, k++);
        const g2 = windowAt(strips, spinStops(strips, rnd));
        const e2 = evaluate(m, g2, { lineBet: LINE, totalBet: BET, ...mul });
        curFsTotal += e2.total; fsSpins++;
        if (e2.jackpot.hit) jpHits++;
        left += e2.scatter.fs;
      }
      fsWin += curFsTotal; spinWin += curFsTotal;
    }
    maxWin = Math.max(maxWin, spinWin);
    for (const k of Object.keys(big)) if (spinWin >= k * BET) big[k]++;
  }
  const stake = N * BET;
  const pJ = jpHits / N;
  // средний джекпот при ставке 100: стартовая сумма + доля всех ставок между выпадениями
  const jpRtp = pJ * JACKPOT_SEED / BET + (pJ ? JACKPOT_SHARE : 0);
  const rtp = (base + scat + fsWin) / stake;
  const f = (x) => (x * 100).toFixed(2) + '%';
  console.log(`\n${m.title} (${m.id}), ${N.toLocaleString('ru')} вращений, ставка ${BET}`);
  console.log(`  линии ${f(base / stake)}, бонус ${f(scat / stake)}, бесплатные ${f(fsWin / stake)}, джекпот ≈ ${f(jpRtp)}`);
  console.log(`  ИТОГО без джекпота ${f(rtp)}, с джекпотом ≈ ${f(rtp + jpRtp)}`);
  console.log(`  выигрыш в ${f(hits / N)} вращений; бесплатные раз в ${Math.round(N / fsTrig)} (в среднем ${(fsSpins / fsTrig).toFixed(1)} вращений, ${(fsWin / fsTrig / BET).toFixed(1)}× ставки)`);
  console.log(`  джекпот раз в ${pJ ? Math.round(1 / pJ).toLocaleString('ru') : '—'} вращений; ≥15× раз в ${Math.round(N / big[15])}, ≥40× раз в ${Math.round(N / big[40])}, ≥100× раз в ${Math.round(N / big[100])}; рекорд ${(maxWin / BET).toFixed(0)}×`);
}
