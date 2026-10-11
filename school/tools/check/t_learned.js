// Похвала «Ура! Буква … — выучена!» для каждой из 33 букв: 14 подуровней уже пройдены, проходим 15-й
// и смотрим экран награды и путь записи голоса (?check=1, без звука). FROM=N — начать с N-й буквы.
const E = globalThis.__env; const BASE = E.BASE || 'http://localhost:8890/school/';
const B = BASE + '?check=1';
const pad = (i) => String(i).padStart(2, '0');
let bad = 0;
for (let i = +(E.FROM || 0); i < 33; i++) {
  const id = 'al' + pad(i);
  await go(B); await sleep(500);
  await js(`localStorage.clear(); localStorage.setItem('school.prog.${id}', JSON.stringify([...Array(14).fill(3), 0]))`);
  await go(`${B}&level=${id}.14`);
  const r = JSON.parse(await js(`(async () => {
    const sl = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let t = 0; t < 12 && document.querySelector('.screen.game'); t++) {
      const stage = document.querySelector('.stage'); const before = stage.firstElementChild;
      for (const c of [...stage.querySelectorAll('.pile .pile-cell')].filter((c) => !c.closest('.pile-btn'))) { c.click(); await sl(10); }
      for (let pass = 0; pass < 2 && stage.querySelector('.answer') && !stage.querySelector('.answer.right'); pass++) {
        if (pass) await sl(2600);
        for (const a of stage.querySelectorAll('.answer')) { if (stage.querySelector('.answer.right')) break; a.click(); await sl(120); }
      }
      const tiles = [...stage.querySelectorAll('.tile:not(.static)')];
      if (tiles.length) for (let g = 0; g < 80; g++) { let pr = false; for (const x of tiles.filter((x) => !x.disabled)) { x.click(); await sl(25); if (x.disabled) { pr = true; break; } } if (!pr) break; }
      for (let w = 0; w < 120; w++) { await sl(100); const st = document.querySelector('.stage'); if (!st || st.firstElementChild !== before) break; }
    }
    await sl(2500);
    const h2 = document.querySelector('.screen.reward h2')?.textContent || 'НЕТ НАГРАДЫ';
    const tr = (window.__voiceTrace || []).filter((t) => /выучен/.test(t.part));
    return JSON.stringify({ h2, tr });
  })()`));
  const ok = /выучен/.test(r.h2) && r.tr.length && r.tr.every((t) => t.how === 'ok');
  if (!ok) bad++;
  console.log(`${ok ? 'ok    ' : 'ПЛОХО '} ${id} ${r.h2} | ${r.tr.map((t) => `${t.part} — ${t.how} ${t.extra ?? ''}`).join('; ') || 'фраза не сказана'}`);
}
console.log(`ИТОГО: букв 33, с ошибкой ${bad}`);
