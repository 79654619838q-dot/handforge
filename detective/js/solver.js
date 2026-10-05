// Идеальный игрок: делает всё, что доступно, пока не останется ничего нового, и обвиняет верно.
// Шаги — простые объекты, их же повторяет проверка в браузере (?test=1, window.__autoplay).
import { CaseRun } from './engine.js';

export function applyStep(run, s) {
  switch (s.t) {
    case 'visit': return run.visit(s.place);
    case 'search': return run.search(s.place, s.x, s.y);
    case 'ask': return run.ask(s.pid, s.topic);
    case 'judge': return run.judge(s.claim, s.v, s.ev);
    case 'lab': return run.lab(s.ev);
    case 'exp': return run.expDone(s.exp, true, s.variant);
    case 'board': return run.answer(s.q, s.opt, s.proof);
    case 'accuse': return run.accuse(s.who, s.what, s.proofs);
  }
  throw new Error('шаг ' + s.t);
}

// choice — какой вариант выбирать в экспериментах-выборах: { id: номер }, по умолчанию лучший (data.best ?? 0)
// memo — унаследованные решения прошлых дел (один из сценариев c.carry)
export function solve(c, people, choice = {}, memo = []) {
  const run = new CaseRun(c, people, null, memo);
  const steps = [];
  const doStep = (s) => { const out = applyStep(run, s); steps.push({ ...s, apply: (r) => applyStep(r, s) }); return out; };
  let progress = true, guard = 0;
  while (progress && guard++ < 500) {
    progress = false;
    for (const pl of run.places()) {
      if (!run.has('v:' + pl)) { doStep({ t: 'visit', place: pl }); progress = true; }
      for (const s of run.spots(pl)) {
        if (!(s.ev || s.gives) || run.has(`s:${pl}.${s.id}`)) continue;
        const [x, y, w, h] = s.r;
        doStep({ t: 'search', place: pl, x: x + w / 2, y: y + h / 2 }); progress = true;
      }
    }
    for (const pid of run.persons()) for (const t of run.topics(pid)) {
      if (!run.has(`q:${pid}.${t.id}`)) { doStep({ t: 'ask', pid, topic: t.id }); progress = true; }
    }
    for (const cl of run.pendingClaims()) {
      if (cl.truth === 'lie') {
        const ev = (cl.proof || []).find((e) => run.has('ev:' + e));
        if (!ev) continue;
        doStep({ t: 'ask', pid: cl.pid, topic: cl.topic });
        doStep({ t: 'judge', claim: cl.id, v: 'lie', ev }); progress = true;
      } else {
        doStep({ t: 'ask', pid: cl.pid, topic: cl.topic });
        doStep({ t: 'judge', claim: cl.id, v: cl.truth === 'true' ? 'true' : 'doubt' }); progress = true;
      }
    }
    for (const l of run.labs()) if (!run.has('l:' + l.id)) { doStep({ t: 'lab', ev: l.ev }); progress = true; }
    for (const x of run.exps()) if (!run.has('x:' + x.id)) {
      doStep({ t: 'exp', exp: x.id, variant: x.type === 'choice' ? (choice[x.id] ?? x.data.best ?? 0) : undefined }); progress = true;
    }
    for (const q of run.boardQs()) {
      if (run.has('b:' + q.id)) continue;
      const proof = q.proof ? q.proof.find((e) => run.has('ev:' + e)) : undefined;
      if (q.proof && !proof) continue;
      doStep({ t: 'board', q: q.id, opt: q.ok, proof }); progress = true;
    }
  }
  const unreached = listUnreached(c, run);
  if (!run.canAccuse()) return { solved: false, reason: 'обвинение так и не открылось', steps, unreached, score: run.score(), stars: 0 };
  const A = c.accuse;
  const proofs = A.proofs.valid.filter((e) => run.has('ev:' + e)).slice(0, A.proofs.n);
  if (proofs.length < A.proofs.n) return { solved: false, reason: `для обвинения не хватает улик (${proofs.length} из ${A.proofs.n})`, steps, unreached, score: run.score(), stars: 0 };
  const out = doStep({ t: 'accuse', who: A.endings.true.who, what: A.endings.true.what, proofs });
  if (out.kind !== 'true') return { solved: false, reason: 'верное обвинение дало концовку ' + out.kind, steps, unreached, score: run.score(), stars: 0 };
  return { solved: true, steps, unreached: listUnreached(c, run), score: run.score(), stars: run.stars() };
}

function listUnreached(c, run) {
  const u = [];
  for (const [pl, p] of Object.entries(c.places)) {
    if (!run.has('v:' + pl)) u.push('место ' + pl);
    for (const s of p.spots || []) if ((s.ev || s.gives) && !run.has(`s:${pl}.${s.id}`) && !(s.ev && c.ev[s.ev]?.optional)) u.push(`точка ${pl}.${s.id}`);
  }
  for (const id of Object.keys(c.ev)) if (!run.has('ev:' + id) && !c.ev[id].optional) u.push('улика ' + id);
  for (const [pid, p] of Object.entries(c.people || {})) for (const t of p.topics || []) {
    if (!run.has(`q:${pid}.${t.id}`)) u.push(`вопрос ${pid}.${t.id}`);
    if (t.claim && !run.has('c:' + t.claim.id)) u.push('показание ' + t.claim.id);
  }
  for (const l of c.lab || []) if (!run.has('l:' + l.id)) u.push('экспертиза ' + l.id);
  for (const x of c.exp || []) if (!run.has('x:' + x.id)) u.push('эксперимент ' + x.id);
  for (const q of c.board || []) if (!run.has('b:' + q.id)) u.push('доска ' + q.id);
  return u;
}
