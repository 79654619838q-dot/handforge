// Проверка движка без браузера: node shared/match.test.mjs
// Виртуальные часы: таймеры срабатывают мгновенно по порядку, матч проходит за миллисекунды.
import { Match, CHALLENGE_IDS } from './match.js';
import assert from 'node:assert/strict';

function run(players, chain, options = {}, human = null) {
  let now = 0;
  const q = [];
  let seq = 0;
  const setTimer = (fn, ms) => { const t = { at: now + ms, fn, id: seq++ }; q.push(t); return t; };
  const clearTimer = (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); };
  const m = new Match({ players, chain, options, now: () => now, setTimer, clearTimer });
  m.start();
  let steps = 0;
  while (q.length && steps++ < 200000) {
    q.sort((a, b) => a.at - b.at || a.id - b.id);
    const t = q.shift();
    now = t.at;
    t.fn();
    if (human && m.phase === 'act') human(m);
  }
  return m;
}

const bots = (n) => Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'Bot ' + i, isBot: true }));

let checks = 0;
for (const cid of CHALLENGE_IDS) {
  for (const n of [2, 3, 6, 10]) {
    for (let rep = 0; rep < 60; rep++) {
      const m = run(bots(n), [cid], { cells: 16 });
      assert.equal(m.phase, 'final', `${cid} n=${n}: матч не дошёл до конца`);
      const h = m.history[0];
      const maxWin = ['unique', 'cards', 'mines', 'shoot'].includes(cid) ? n : 1; // «Очко» — 12 раундов, «Взрывное поле» — пока есть клетки
      assert.ok(h.winners.length >= 1 && h.winners.length <= maxWin, `${cid} n=${n}: победителей ${h.winners.length}`);
      assert.equal(h.winners.length + h.order.length, n, `${cid} n=${n}: кто-то потерялся`);
      const ids = new Set([...h.winners, ...h.order.map((o) => o.id)]);
      assert.equal(ids.size, n, `${cid}: игрок посчитан дважды`);
      if (['doors', 'time', 'memory', 'center', 'bomb', 'roulette', 'cards'].includes(cid)) {
        const perRound = {};
        for (const o of h.order) perRound[o.round] = (perRound[o.round] || 0) + 1;
        assert.ok(Object.values(perRound).every((c) => c === 1), `${cid}: за раунд выбыл не один`);
      }
      const winnerPts = m.player(h.winners[0]).points;
      assert.ok(m.players.every((p) => p.points <= winnerPts), `${cid}: у проигравшего больше очков, чем у победителя`);
      checks++;
    }
  }
}

// Цепочка из всех испытаний
for (let rep = 0; rep < 30; rep++) {
  const m = run(bots(6), CHALLENGE_IDS, { cells: 25 });
  assert.equal(m.history.length, CHALLENGE_IDS.length);
  assert.equal(m.phase, 'final');
  checks++;
}

// Одиночные двери: 10 дверей, человек всегда выбирает первую свободную
let wins = 0;
for (let rep = 0; rep < 400; rep++) {
  const m = run([{ id: 'me', name: 'Me' }], ['doors'], { doors: 10 }, (mm) => { if (!mm.ch.complete('me')) mm.act('me', { door: 0 }); });
  const h = m.history[0];
  assert.ok(h.passed >= 0 && h.passed <= 9);
  if (h.winners.length) { wins++; assert.equal(h.passed, 9); }
  checks++;
}
// вероятность пройти все 10 дверей = 9/10·8/9·…·1/2 = 1/10
console.log(`одиночные двери: прошёл все ${wins}/400 (ожидание ≈ 40)`);

// Человек в «Уникальном числе», который не ходит, получает случайное число, игра не зависает
const m = run([{ id: 'me', name: 'Me' }, ...bots(5)], ['unique']);
assert.equal(m.phase, 'final');

// Тайные ходы не утекают до раскрытия
{
  let now = 0; const q = [];
  const m2 = new Match({ players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], chain: ['mines'], now: () => now, setTimer: (fn, ms) => { const t = { at: now + ms, fn }; q.push(t); return t; }, clearTimer: (t) => q.splice(q.indexOf(t), 1) });
  m2.start(); q.sort((x, y) => x.at - y.at); const t = q.shift(); now = t.at; t.fn();
  assert.equal(m2.phase, 'act');
  m2.act('a', { stand: 3, bomb: 5 });
  const sb = m2.getStateFor('b');
  assert.equal(sb.mine, null);
  assert.deepEqual(sb.visible, {});
  assert.deepEqual(m2.getStateFor('a').mine, { stand: 3, bomb: 5 });
  checks++;
}

// Фитиль бомбы и чужие позиции в «Стрельбе вслепую» не видны игрокам
for (const cid of ['bomb', 'shoot']) {
  let now = 0; const q = [];
  const m3 = new Match({ players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], chain: [cid], now: () => now, setTimer: (fn, ms) => { const t = { at: now + ms, fn }; q.push(t); return t; }, clearTimer: (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); } });
  m3.start(); q.sort((x, y) => x.at - y.at); const t = q.shift(); now = t.at; t.fn();
  const sa = m3.getStateFor('a');
  assert.equal(sa.phase, 'act');
  if (cid === 'bomb') assert.equal(sa.deadline, null, 'фитиль бомбы виден');
  if (cid === 'shoot') { m3.act('b', { pos: [0.123, 0.321], mark: [0, 0] }); const s2 = m3.getStateFor('a'); assert.ok(!JSON.stringify(s2).includes('0.321'), 'чужая позиция утекла'); }
  checks++;
}

// «Взрывное поле»: взорванные клетки не возвращаются (кроме переигровки)
{
  let now = 0; const q = [];
  const m4 = new Match({ players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], chain: ['mines'], now: () => now, setTimer: (fn, ms) => { const t = { at: now + ms, fn }; q.push(t); return t; }, clearTimer: (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); } });
  m4.start();
  const step = () => { q.sort((x, y) => x.at - y.at); const t = q.shift(); now = t.at; t.fn(); };
  while (m4.phase !== 'act') step();
  m4.act('a', { stand: 0, bomb: 5 }); m4.act('b', { stand: 1, bomb: 6 }); m4.act('c', { stand: 2, bomb: 7 }); m4.act('d', { stand: 3, bomb: 8 });
  while (m4.phase !== 'reveal') step();
  assert.equal(m4.ch.cells.length, 32, 'взорванные клетки должны исчезнуть');
  while (m4.phase !== 'act') step();
  assert.equal(m4.getStateFor('a').data.cells.length, 32, 'в следующем раунде столько же клеток');
  assert.equal(m4.act('a', { stand: 5, bomb: 0 }), false, 'на взорванную клетку встать нельзя');
  checks++;
}

console.log(`OK: ${checks} проверок`);
