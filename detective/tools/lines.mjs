// Все реплики, которые может произнести игра: из дел, общие, отговорки персонажей, подсказки Майи.
import { REBUFF } from '../js/engine.js';
import { LINES } from '../js/data/common.js';

export function eachLine(c, fn) {
  const L = (arr, where) => (arr || []).forEach((l) => fn(l, where));
  L(c.brief, 'brief');
  for (const [pl, p] of Object.entries(c.places)) { L(p.enter, pl); for (const s of p.spots || []) { L(s.say, `${pl}.${s.id}`); L(s.again, `${pl}.${s.id}`); } }
  for (const [pid, p] of Object.entries(c.people || {})) {
    for (const t of p.topics || []) { L(t.a, `${pid}.${t.id}`); if (t.claim) L(t.claim.ok, t.claim.id); }
  }
  for (const l of c.lab || []) L(l.say, 'lab.' + l.id);
  for (const x of c.exp || []) { L(x.say, 'exp.' + x.id); L(x.fail, 'exp.' + x.id); L(x.intro, 'exp.' + x.id); }
  for (const q of c.board || []) { L(q.say, 'board.' + q.id); L(q.fail, 'board.' + q.id); L(q.badProof, 'board.' + q.id); }
  const E = c.accuse.endings;
  L(E.true.lines, 'end.true'); L(E.partial.lines, 'end.partial'); L(E.wrong.lines, 'end.wrong');
  for (const [k, v] of Object.entries(E.wrong.by || {})) L(v, 'end.wrong.' + k);
  for (const [a, v] of Object.entries(c.on || {})) L(v, 'on.' + a);
  // отговорки на промахи при допросе
  for (const [pid, p] of Object.entries(c.people || {})) {
    if (!(p.topics || []).some((t) => t.claim)) continue;
    for (const t of p.topics || []) {
      if (!t.claim) continue;
      if (t.claim.wrongShow) fn([pid, t.claim.wrongShow, 'tense'], 'rebuff');
    }
    for (const kind of ['trueDoubted', 'lieDoubted', 'wrongShow', 'fooled']) fn([pid, p.rebuff?.[kind] || '@' + kind, 'tense'], 'rebuff');
  }
  for (const h of c.hints || []) for (const t of h.h) fn(['maya', t], 'hint');
}

export function collectLines(cases, people) {
  const map = new Map();
  const add = ([who, text, mood], where) => {
    if (text.startsWith('@')) text = REBUFF[people[who]?.sex || 'm'][text.slice(1)];
    const key = who + '|' + text;
    if (!map.has(key)) map.set(key, { key, who, text, mood: mood || 'calm', where });
  };
  for (const c of cases) eachLine(c, add);
  for (const l of Object.values(LINES)) add(l, 'common');
  return [...map.values()];
}
