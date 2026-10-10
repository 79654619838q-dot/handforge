// Полный проход уровней в режиме ?check=1 (без звука): каждое задание решается, как ребёнок —
// нажимаются 🔊, буквы, ладошки, карточки; сначала неверные ответы, потом верный; каждая фраза
// проходит настоящий путь записи голоса (найти, скачать, раскодировать).
// Переменные: PASSES (проходов), SHARD/SHARDS (доля уровней для параллельных браузеров), ONLY (регулярка по id).
const E = globalThis.__env; const PASSES = +(E.PASSES || 1); const SHARD = +(E.SHARD || 0), SHARDS = +(E.SHARDS || 1);
const BASE = E.BASE || 'http://localhost:8890/school/';
const B = BASE + '?check=1';
await go(B); await sleep(2500);
const only = E.ONLY ? new RegExp(E.ONLY) : null;
const ids = JSON.parse(await js(`import('./js/levels.js').then(({LEVELS}) => JSON.stringify(Object.entries(LEVELS).filter(([s]) => s !== 'alpha').flatMap(([s,l]) => l.map((_,i) => s+'.'+i))))`))
  .filter((x) => !only || only.test(x)).filter((_, i) => i % SHARDS === SHARD);
const phrases = {}; const problems = []; let levelsDone = 0;
const RUN = (id) => `(async () => {
  const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = async (el, ms = 60) => { if (el && !el.disabled) { el.click(); await sl(ms); } };
  const probs = [];
  for (const c of document.querySelectorAll('.intro .letter-card')) await click(c);
  await click(document.querySelector('.intro .play-btn'), 500);
  let tasks = 0;
  for (let t = 0; t < 12 && document.querySelector('.screen.game'); t++) {
    const stage = document.querySelector('.stage'); const before = stage.firstElementChild;
    for (const el of stage.querySelectorAll('.hear, .big-letter, .clap-btn')) await click(el, 40);
    for (const c of [...stage.querySelectorAll('.pile .pile-cell')].filter((c) => !c.closest('.pile-btn'))) await click(c, 10);
    if (stage.querySelector('.answer')) {
      for (let pass = 0; pass < 2 && !stage.querySelector('.answer.right'); pass++) {
        if (pass) await sl(2600);
        for (const a of stage.querySelectorAll('.answer')) { if (stage.querySelector('.answer.right')) break; await click(a, 120); }
      }
    }
    const tiles = [...stage.querySelectorAll('.tile:not(.static)')];
    if (tiles.length) for (let g = 0; g < 80; g++) { let pr = false; for (const x of tiles.filter((x) => !x.disabled)) { x.click(); await sl(25); if (x.disabled) { pr = true; break; } } if (!pr) break; }
    let moved = false;
    for (let w = 0; w < 120; w++) { await sl(100); const st = document.querySelector('.stage'); if (!st || st.firstElementChild !== before) { moved = true; break; } }
    if (!moved) { probs.push('задание не засчиталось: ' + (document.querySelector('.bubble')?.textContent || '')); break; }
    tasks++; await sl(200);
  }
  if (!document.querySelector('.screen.reward')) probs.push('нет экрана награды, заданий ' + tasks);
  await sl(1500);
  const [sid, n] = '${id}'.split('.');
  if (!(JSON.parse(localStorage.getItem('school.prog.' + sid) || '[]')[+n] > 0)) probs.push('прохождение не записалось');
  return JSON.stringify({ probs, trace: window.__voiceTrace || [], errs: window.__errs, tasks });
})()`;
for (let pass = 1; pass <= PASSES; pass++) {
  for (const id of ids) {
    await go(`${B}&level=${id}&p=${pass}`);
    const r = await js(RUN(id));
    let o; try { o = JSON.parse(r); } catch { problems.push(`проход ${pass} ${id}: ${String(r).slice(0, 200)}`); console.log('ЗАМЕЧАНИЕ', id, String(r).slice(0, 200)); continue; }
    o.probs.forEach((p) => { problems.push(`проход ${pass} ${id}: ${p}`); console.log(`ЗАМЕЧАНИЕ проход ${pass} ${id}: ${p}`); });
    o.errs.forEach((e) => { problems.push(`проход ${pass} ${id}: ОШИБКА JS ${e}`); console.log(`ОШИБКА JS ${id}: ${e}`); });
    for (const t of o.trace) { const k = t.part.trim(); (phrases[k] ||= { n: 0, bad: new Set() }).n++; if (t.how !== 'ok') { phrases[k].bad.add(t.how); console.log(`ГОЛОС ${id}: ${k} — ${t.how}`); } }
    levelsDone++;
  }
  console.log(`проход ${pass}: уровней ${ids.length}, проблем пока ${problems.length}`);
}
const badPhrases = Object.entries(phrases).filter(([, v]) => v.bad.size).map(([k, v]) => `${k} — ${[...v.bad].join(', ')}`);
globalThis.__fs.writeFileSync(globalThis.__out + `/pass_${SHARD}.json`, JSON.stringify({ problems, badPhrases, said: Object.keys(phrases) }, null, 1));
console.log(`ИТОГО: уровней пройдено ${levelsDone}, разных фраз ${Object.keys(phrases).length}, проблем ${problems.length}, фраз с ошибкой ${badPhrases.length}`);
