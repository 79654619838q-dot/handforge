// Доска расследования (выводы с доказательствами) и обвинение.
import { h, pic, modal, toast } from '../util.js';
import { say, sfx, stopSpeech, ambient } from '../audio.js';
import { person, PEOPLE } from '../data/people.js';
const PEOPLE_IDS = new Set(Object.keys(PEOPLE));
import { screen } from '../main.js';
import { C, run, play, pickEvidence, hub, ending, persist } from './case.js';

export function boardView() {
  ambient('calm');
  const qs = run.boardQs();
  const total = (C.board || []).length;
  const cards = qs.map((q) => {
    const solved = run.has('b:' + q.id);
    return h('div.pin-card' + (solved ? '.solved' : '.open'),
      h('div.pin'),
      h('div.pin-q', q.q),
      solved ? h('div.pin-a', q.opts[q.ok]) : h('button.btn.primary.small', { onclick: () => answer(q) }, 'Ответить'),
    );
  });
  screen(h('div.board',
    h('div.topbar.over', h('button.btn.ghost.back', { onclick: () => hub() }, '← Назад'), h('div.top-title', 'Доска'), h('div.top-score', run.score() + ' очков')),
    h('div.cork',
      h('div.cork-grid', cards.length ? cards : h('div.empty.on-cork', 'Пока нечего сопоставлять. Ищите улики.')),
      qs.length < total ? h('div.cork-more', `Ещё ${total - qs.length} — появятся по ходу дела`) : null,
      run.canAccuse() ? h('button.btn.accuse-big', { onclick: () => accuseFlow() }, '⚖ ' + (C.accuse.verb || 'Обвинить')) : null,
    ),
  ));
}

async function answer(q) {
  sfx.click();
  const opt = await new Promise((resolve) => {
    let picked = false;
    const m = modal(h('div.list-box',
      h('h3', q.q),
      h('div.opts', q.opts.map((o, i) => h('button.opt', { onclick: () => { picked = true; m.close(); resolve(i); } }, o))),
    ), { onClose: () => { if (!picked) resolve(null); } });
  });
  if (opt == null) return;
  let proof;
  if (q.proof) {
    proof = await pickEvidence('Чем это доказать?', { hint: q.opts[opt] });
    if (!proof) return;
  }
  stopSpeech();
  const out = run.answer(q.id, opt, proof);
  out.ok ? sfx.right() : sfx.wrong();
  await play(out);
  boardView();
}

export async function accuseFlow() {
  if (!run.canAccuse()) return toast('Пока рано');
  const A = C.accuse;
  const sus = A.suspects.map((s) => (typeof s === 'string' ? { id: s, ...person(s), role: C.people[s]?.role || person(s).role } : s));
  const who = await new Promise((resolve) => {
    let picked = false;
    const m = modal(h('div.list-box',
      h('h3', A.title || 'Кого обвиняете?'),
      h('div.suspects', sus.map((s) => h('button.suspect', { onclick: () => { picked = true; m.close(); resolve(s.id); } },
        pic(s.img || (PEOPLE_IDS.has(s.id) ? 'p/' + s.id : 'p/unknown'), 'sus-img'), h('b', s.name), h('small', s.role || '')))),
    ), { cls: 'wide', onClose: () => { if (!picked) resolve(null); } });
  });
  if (!who) return;
  const what = await new Promise((resolve) => {
    let picked = false;
    const m = modal(h('div.list-box',
      h('h3', A.whatTitle || 'Что произошло?'),
      h('div.opts', A.what.map((o, i) => h('button.opt', { onclick: () => { picked = true; m.close(); resolve(i); } }, o))),
    ), { onClose: () => { if (!picked) resolve(null); } });
  });
  if (what == null) return;
  const proofs = await pickEvidence(`Главные доказательства (${A.proofs.n})`, { count: A.proofs.n, hint: 'Выберите улики, которые прямо доказывают вашу версию' });
  if (!proofs) return;
  const sname = sus.find((s) => s.id === who).name;
  const ok = await new Promise((resolve) => {
    let picked = false;
    const m = modal(h('div.list-box.confirm',
      h('h3', A.verb || 'Обвинение'),
      h('p', h('b', sname), ' — ', A.what[what]),
      h('p.warn', 'Решение нельзя отменить. Ошибка — плохая концовка, но дело можно будет переиграть.'),
      h('button.btn.danger.big', { onclick: () => { picked = true; m.close(); resolve(true); } }, A.verb || 'Обвинить'),
    ), { onClose: () => { if (!picked) resolve(false); } });
  });
  if (!ok) return;
  stopSpeech();
  sfx.stamp();
  const out = run.accuse(who, what, proofs);
  persist();
  ending(out);
}
