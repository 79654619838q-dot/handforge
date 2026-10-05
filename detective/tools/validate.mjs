// Проверка всех дел до выкладки: ссылки, решаемость, картинки, голос.
// node detective/tools/validate.mjs [cNN]      — код выхода 1, если есть ошибки
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { CaseRun, maxScore } = await imp('js/engine.js');
const { PEOPLE } = await imp('js/data/people.js');
const { CASES: RELEASED } = await imp('js/data/cases.js');
// черновик дела, ещё не включённый в игру: node validate.mjs js/cases/c11.js
const draft = process.argv[2]?.endsWith('.js') ? (await imp(process.argv[2])).default : null;
const CASES = draft ? [draft] : RELEASED;
const { solve } = await imp('js/solver.js');

const only = draft ? null : process.argv[2];
let errors = 0, warns = 0;
const err = (c, m) => { errors++; console.log(`  ✗ [${c}] ${m}`); };
const warn = (c, m) => { warns++; console.log(`  ! [${c}] ${m}`); };

const imgExists = (key) => ['webp', 'jpg', 'png'].some((e) => fs.existsSync(path.join(ROOT, 'assets', 'img', key + '.' + e)));
let voiceIndex = null;
try { voiceIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'voice', 'index.json'), 'utf8')); } catch { }
const voiceKey = (who, text) => who + '|' + text;

function atomsOf(c) {
  // какие атомы вообще могут появиться в деле
  const A = new Set(['start', 'end']);
  const addGives = (g) => (g || []).forEach((a) => A.add(a));
  for (const [pl, p] of Object.entries(c.places)) {
    A.add('v:' + pl);
    for (const s of p.spots || []) { A.add(`s:${pl}.${s.id}`); if (s.ev) A.add('ev:' + s.ev); addGives(s.gives); }
  }
  for (const [pid, p] of Object.entries(c.people || {})) for (const t of p.topics || []) {
    A.add(`q:${pid}.${t.id}`); addGives(t.gives);
    if (t.claim) { A.add('c:' + t.claim.id); addGives(t.claim.gives); }
  }
  for (const l of c.lab || []) { A.add('l:' + l.id); addGives(l.gives); }
  for (const x of c.exp || []) { A.add('x:' + x.id); addGives(x.gives); if (x.type === 'choice') x.data.opts.forEach((o) => addGives(o.gives)); }
  for (const q of c.board || []) { A.add('b:' + q.id); addGives(q.gives); }
  return A;
}

function condAtoms(cond, out = []) {
  if (cond == null || cond === true) return out;
  if (typeof cond === 'string') out.push(cond);
  else if (Array.isArray(cond)) cond.forEach((x) => condAtoms(x, out));
  else if (cond.any) cond.any.forEach((x) => condAtoms(x, out));
  else if (cond.not) condAtoms(cond.not, out);
  return out;
}

function eachLine(c, fn) {
  const L = (arr, where) => (arr || []).forEach((l) => fn(l, where));
  L(c.brief, 'brief');
  for (const [pl, p] of Object.entries(c.places)) { L(p.enter, pl); for (const s of p.spots || []) { L(s.say, `${pl}.${s.id}`); L(s.again, `${pl}.${s.id}`); } }
  for (const [pid, p] of Object.entries(c.people || {})) {
    for (const k of Object.keys(p.rebuff || {})) fn([pid, p.rebuff[k]], `${pid}.rebuff`);
    for (const t of p.topics || []) { L(t.a, `${pid}.${t.id}`); if (t.claim) { L(t.claim.ok, t.claim.id); } }
  }
  for (const l of c.lab || []) L(l.say, 'lab.' + l.id);
  for (const x of c.exp || []) { L(x.say, 'exp.' + x.id); L(x.fail, 'exp.' + x.id); L(x.intro, 'exp.' + x.id); }
  for (const q of c.board || []) { L(q.say, 'board.' + q.id); L(q.fail, 'board.' + q.id); L(q.badProof, 'board.' + q.id); }
  const E = c.accuse.endings;
  L(E.true.lines, 'end.true'); L(E.partial.lines, 'end.partial'); L(E.wrong.lines, 'end.wrong');
  for (const [k, v] of Object.entries(E.wrong.by || {})) L(v, 'end.wrong.' + k);
  for (const [a, v] of Object.entries(c.on || {})) L(v, 'on.' + a);
}

for (const c of CASES) {
  if (only && c.id !== only) continue;
  console.log(`\nДело ${c.no} «${c.title}» (${c.id})`);
  const A = atomsOf(c);
  const evIds = new Set(Object.keys(c.ev));
  const chkCond = (cond, where) => { for (const a of condAtoms(cond)) if (!A.has(a)) err(c.id, `${where}: условие «${a}» никогда не выполнится`); };
  const chkGives = (g, where) => { for (const a of g || []) { if (a.startsWith('ev:') && !evIds.has(a.slice(3))) err(c.id, `${where}: даёт несуществующую улику ${a}`); if (!/^(ev|f):/.test(a)) err(c.id, `${where}: даёт «${a}» — можно только ev:/f:`); } };

  // места и точки
  for (const [pl, p] of Object.entries(c.places)) {
    chkCond(p.need, 'место ' + pl);
    if (!imgExists(p.img)) warn(c.id, `нет картинки места ${p.img}`);
    for (const s of p.spots || []) {
      if (s.ev && !evIds.has(s.ev)) err(c.id, `${pl}.${s.id}: нет улики ${s.ev}`);
      chkGives(s.gives, `${pl}.${s.id}`); chkCond(s.need, `${pl}.${s.id}`);
      const [x, y, w, h] = s.r || [];
      if (!(w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= 1.0001 && y + h <= 1.0001)) err(c.id, `${pl}.${s.id}: рамка вне картинки ${JSON.stringify(s.r)}`);
      if (s.r[1] === 0.9 && s.r[3] === 0.05) warn(c.id, `${pl}.${s.id}: рамка не размечена`);
    }
    // точки не должны перекрываться (иначе одно нажатие — две находки)
    const sp = (p.spots || []);
    for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) {
      const [a, b] = [sp[i].r, sp[j].r];
      const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
      const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
      if (ox > 0 && oy > 0 && a[1] !== 0.9) warn(c.id, `${pl}: точки ${sp[i].id} и ${sp[j].id} перекрываются`);
    }
  }
  // улики: каждая должна откуда-то появляться
  const evSource = new Set();
  for (const p of Object.values(c.places)) for (const s of p.spots || []) { if (s.ev) evSource.add(s.ev); (s.gives || []).forEach((a) => a.startsWith('ev:') && evSource.add(a.slice(3))); }
  const allGives = [];
  for (const p of Object.values(c.people || {})) for (const t of p.topics || []) { allGives.push(...(t.gives || []), ...(t.claim?.gives || [])); }
  for (const l of c.lab || []) allGives.push(...(l.gives || []));
  for (const x of c.exp || []) allGives.push(...(x.gives || []));
  for (const q of c.board || []) allGives.push(...(q.gives || []));
  allGives.filter((a) => a.startsWith('ev:')).forEach((a) => evSource.add(a.slice(3)));
  for (const [id, e] of Object.entries(c.ev)) {
    if (!evSource.has(id)) err(c.id, `улика ${id} нигде не выдаётся`);
    if (!e.name || !e.txt) err(c.id, `улика ${id} без названия/описания`);
    if (!imgExists(e.img)) warn(c.id, `нет картинки улики ${e.img}`);
  }
  // люди
  for (const [pid, p] of Object.entries(c.people || {})) {
    if (!PEOPLE[pid]) err(c.id, `нет персонажа ${pid} в people.js`);
    else if (!imgExists('p/' + pid)) warn(c.id, `нет портрета p/${pid}`);
    chkCond(p.need, 'человек ' + pid);
    for (const t of p.topics || []) {
      chkCond(t.need, `${pid}.${t.id}`); chkGives(t.gives, `${pid}.${t.id}`);
      if (t.claim) {
        const cl = t.claim;
        if (!['true', 'hides', 'lie'].includes(cl.truth)) err(c.id, `${cl.id}: truth ${cl.truth}`);
        if (cl.truth === 'lie' && !(cl.proof || []).length) err(c.id, `${cl.id}: ложь без доказательства`);
        for (const e of cl.proof || []) if (!evIds.has(e)) err(c.id, `${cl.id}: доказательство ${e} не существует`);
        chkGives(cl.gives, cl.id);
        if (!cl.ok?.length) warn(c.id, `${cl.id}: нет реплики на верный ответ`);
      }
    }
  }
  for (const l of c.lab || []) { if (!evIds.has(l.ev)) err(c.id, `лаборатория ${l.id}: нет улики ${l.ev}`); chkCond(l.need, 'lab.' + l.id); chkGives(l.gives, 'lab.' + l.id); }
  for (const x of c.exp || []) {
    chkCond(x.need, 'exp.' + x.id); chkGives(x.gives, 'exp.' + x.id);
    const d = x.data || {};
    if (x.type === 'cctv') {
      for (const f of d.frames) if (!imgExists(f.img)) warn(c.id, `нет кадра ${f.img}`);
      for (const t of d.tasks) { const n = t.pick === 'frame' ? d.frames.length : t.opts.length; if (!(t.ok >= 0 && t.ok < n)) err(c.id, `exp.${x.id}: ok вне списка`); }
    } else if (x.type === 'route') {
      if (!(d.ok >= 0 && d.ok < d.opts.length)) err(c.id, `exp.${x.id}: ok вне вариантов`);
      const fit = d.routes.filter((r) => r.min * 2 + d.work <= d.window).length;
      if (!fit) warn(c.id, `exp.${x.id}: ни одна дорога не укладывается — проверьте ответ`);
    } else if (x.type === 'phone') {
      if (!/^\d{4}$/.test(d.pin)) err(c.id, `exp.${x.id}: PIN не из 4 цифр`);
      if (!(d.ok >= 0 && d.ok < d.items.length)) err(c.id, `exp.${x.id}: ok вне списка`);
    } else if (x.type === 'rubbing') {
      if (!d.lines?.length) err(c.id, `exp.${x.id}: нет текста`);
    } else if (x.type === 'timeline') {
      if (!(d.ok >= 0 && d.ok < d.opts.length)) err(c.id, `exp.${x.id}: ok вне вариантов`);
    } else if (x.type === 'pick') {
      if (!d.people.includes(d.ok)) err(c.id, `exp.${x.id}: верного человека нет в списке`);
      for (const id of d.people) if (!PEOPLE[id]) err(c.id, `exp.${x.id}: нет персонажа ${id}`);
    } else if (x.type === 'hand') {
      if (!d.diff.every((i) => i >= 0 && i < d.word.length)) err(c.id, `exp.${x.id}: буква вне слова`);
    } else if (x.type === 'plan') {
      if (!d.cells.some((c) => c.id === d.ok)) err(c.id, `exp.${x.id}: верной клетки нет на плане`);
    } else if (x.type === 'check') {
      if (!(d.ok >= 0 && d.ok < d.opts.length)) err(c.id, `exp.${x.id}: ok вне вариантов`);
    } else if (x.type === 'measure') {
      if (!d.people.some((p) => p.id === d.ok)) err(c.id, `exp.${x.id}: верный ответ не среди людей`);
      for (const p of d.people) if (!PEOPLE[p.id]) err(c.id, `exp.${x.id}: нет персонажа ${p.id}`);
      if (!imgExists(d.img)) warn(c.id, `нет кадра ${d.img}`);
    } else if (x.type === 'records') {
      if (!(d.ok >= 0 && d.ok < d.rows.length)) err(c.id, `exp.${x.id}: ok вне таблицы`);
      for (const r of d.rows) if (r.length !== d.cols.length) err(c.id, `exp.${x.id}: строка ${r[0]} — не то число столбцов`);
    }
  }
  for (const q of c.board || []) {
    chkCond(q.need, 'board.' + q.id); chkGives(q.gives, 'board.' + q.id);
    if (!(q.ok >= 0 && q.ok < q.opts.length)) err(c.id, `board.${q.id}: ok вне списка`);
    for (const e of q.proof || []) if (!evIds.has(e)) err(c.id, `board.${q.id}: доказательство ${e} не существует`);
  }
  const AC = c.accuse;
  chkCond(AC.need, 'обвинение');
  for (const e of AC.proofs.valid) if (!evIds.has(e)) err(c.id, `обвинение: улика ${e} не существует`);
  const sIds = AC.suspects.map((s) => (typeof s === 'string' ? s : s.id));
  for (const s of AC.suspects) if (typeof s === 'string' && !PEOPLE[s]) err(c.id, `подозреваемый ${s} не в people.js`);
  if (!sIds.includes(AC.endings.true.who)) err(c.id, 'истинный виновный не в списке подозреваемых');
  if (!(AC.endings.true.what >= 0 && AC.endings.true.what < AC.what.length)) err(c.id, 'истинная версия вне списка');
  for (const k of Object.keys(AC.endings.wrong.by || {})) if (!sIds.includes(k)) err(c.id, `концовка для ${k} — его нет в подозреваемых`);
  for (const g of c.goals || []) chkCond(g.until, 'цель');
  for (const h of c.hints || []) { chkCond(h.until, 'подсказка'); if (h.h?.length !== 3) err(c.id, 'подсказка без трёх уровней'); }
  for (const a of Object.keys(c.on || {})) if (!A.has(a)) err(c.id, `on: «${a}» никогда не случится`);

  // реплики
  eachLine(c, (l, where) => {
    const [who, text] = l;
    if (!PEOPLE[who]) err(c.id, `${where}: говорит неизвестный «${who}»`);
    if (!text || typeof text !== 'string') err(c.id, `${where}: пустая реплика`);
    else if (text.length > 140) warn(c.id, `${where}: длинная реплика (${text.length}) «${text.slice(0, 40)}…»`);
    if (voiceIndex && !voiceIndex[voiceKey(who, text)]) warn(c.id, `нет записи голоса: ${who}: ${text.slice(0, 50)}`);
  });

  // решаемость — в каждой ветке выбора
  for (const x of (c.exp || []).filter((e) => e.type === 'choice')) {
    x.data.opts.forEach((o, i) => {
      const rb = solve(c, PEOPLE, { [x.id]: i });
      if (!rb.solved) err(c.id, `ветка «${o.text}»: НЕ РЕШАЕТСЯ — ${rb.reason}`);
      else console.log(`  ветка «${o.text.slice(0, 40)}»: решается, очки ${rb.score}`);
    });
  }
  const r = solve(c, PEOPLE);
  if (!r.solved) err(c.id, `НЕ РЕШАЕТСЯ: ${r.reason}`);
  for (const u of r.unreached) warn(c.id, `недостижимо: ${u}`);
  const max = maxScore(c);
  console.log(`  решение: ${r.steps.length} действий, очки ${r.score} из ${max} (${Math.round(r.score / max * 100)}%), звёзд ${r.stars}`);
  // все подсказки по порядку должны закрываться на пути решения
  const run = new CaseRun(c, PEOPLE);
  for (const st of r.steps) st.apply(run);
  const left = (c.hints || []).filter((h) => !run.test(h.until));
  if (left.length) err(c.id, `подсказки не закрылись на пути решения: ${left.map((h) => JSON.stringify(h.until)).join(', ')}`);
}
console.log(`\nОшибок: ${errors}, предупреждений: ${warns}`);
process.exit(errors ? 1 : 0);
