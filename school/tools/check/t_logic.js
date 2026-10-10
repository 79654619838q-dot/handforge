// Логика всех заданий всех уровней: у заданий с выбором — ровно один верный ответ (по 30 раз),
// задания «по порядку» (плитки) — собираются и засчитываются (по 4 раза).
await go('http://localhost:8890/school/?mute=1');
const r = await js(`(async () => {
  const { LEVELS } = await import('./js/levels.js'); const sl = (ms) => new Promise((r) => setTimeout(r, ms));
  const errs = []; let answers = 0, tiles = 0;
  const reps = (id) => (/^al\\d\\d$/.test(id) ? 8 : 30);
  for (const [sid, lvls] of Object.entries(LEVELS)) for (const [li, lv] of lvls.entries()) for (const [fn, opts] of lv.games) {
    for (let k = 0; k < reps(sid); k++) {
      let rights = 0, wrongs = 0;
      const api = { locked: () => false, hold() {}, right() { rights++; }, wrong() { wrongs++; } };
      let t; try { t = fn(opts); } catch (e) { errs.push(sid + '.' + li + ' ' + fn.name + ' gen ' + e.message); continue; }
      const d = document.createElement('div'); document.body.append(d);
      try { t.build(d, api); } catch (e) { errs.push(sid + '.' + li + ' ' + fn.name + ' build ' + e.message); d.remove(); continue; }
      if (!t.voice || !t.voice.length || t.voice.some((v) => typeof v === 'string' && /undefined|null|NaN/.test(v))) errs.push(sid + '.' + li + ' ' + fn.name + ': плохой голос ' + JSON.stringify(t.voice));
      const ans = [...d.querySelectorAll('.answer')], tl = [...d.querySelectorAll('.tile:not(.static)')];
      if (ans.length) { ans.forEach((b) => b.click()); answers++; if (rights !== 1) errs.push(sid + '.' + li + ' ' + fn.name + ': верных ' + rights + ' «' + t.voice.join(' ') + '»'); }
      else if (tl.length && k < 4) {
        tiles++;
        for (let g = 0; rights === 0 && g < 60; g++) { let pr = false; for (const x of tl.filter((x) => !x.disabled)) { const w = wrongs; x.click(); if (wrongs === w) { pr = true; break; } } if (!pr) break; await sl(5); }
        for (let w = 0; w < 60 && rights === 0; w++) await sl(50);
        if (rights !== 1) errs.push(sid + '.' + li + ' ' + fn.name + ': не засчитано «' + t.voice.join(' ') + '»');
      } else if (!tl.length && !ans.length) errs.push(sid + '.' + li + ' ' + fn.name + ': нет кнопок');
      d.remove();
    }
  }
  return JSON.stringify({ answers, tiles, errs: [...new Set(errs)].slice(0, 30), n: errs.length });
})()`);
console.log(r);
