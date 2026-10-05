// Допрос: портрет (спокойный / напряжённый), вопросы, разбор показаний.
// На спорное показание игрок решает: «Верю», «Сомневаюсь» или «Ложь!» — и предъявляет улику.
import { h, pic, points } from '../util.js';
import { say, sfx, onLine, stopSpeech, ambient } from '../audio.js';
import { person } from '../data/people.js';
import { screen } from '../main.js';
import { play, pickEvidence, persist } from './case.js';

export function talkView({ C, run, pid, onBack }) {
  const P = person(pid);
  ambient(C.diff >= 4 ? 'tense' : 'calm');
  const calm = pic('p/' + pid, 'portrait calm');
  const tense = pic('p/' + pid + '_t', 'portrait tense');
  const portrait = h('div.talk-portrait', calm, tense);
  const side = h('div.talk-side');
  let busy = false;
  const off = onLine((who, mood) => {
    portrait.classList.toggle('speaking', who === pid);
    portrait.classList.toggle('dim', !!who && who !== pid);
    if (who === pid) portrait.classList.toggle('is-tense', mood === 'tense');
  });
  const firstPlace = Object.keys(C.places)[0];
  screen(h('div.talk',
    pic(C.places[firstPlace].img, 'talk-bg'),
    h('div.topbar.over',
      h('button.btn.ghost.back', { onclick: () => { off(); stopSpeech(); onBack(); } }, '← Назад'),
      h('div.top-title', P.name, h('small', ' · ' + (C.people[pid].role || P.role))),
      h('div.top-score', run.score() + ' очков')),
    h('div.talk-main', portrait, side),
  ));

  function render(claim) {
    side.replaceChildren();
    if (claim) {
      side.append(h('div.claim-panel',
        h('div.claim-label', 'Показание'),
        h('div.claim-quote', '«' + claim.text + '»'),
        h('div.claim-buttons',
          h('button.btn.judge.believe', { onclick: () => judge(claim, 'true') }, 'Верю'),
          h('button.btn.judge.doubt', { onclick: () => judge(claim, 'doubt') }, 'Сомневаюсь'),
          h('button.btn.judge.lie', { onclick: () => judge(claim, 'lie') }, 'Ложь!'),
        ),
        h('div.claim-help', 'Ложь — нужна улика, которая её опровергает. Сомневаюсь — человек что-то недоговаривает.'),
        h('button.btn.ghost.small', { onclick: () => render() }, 'Разобрать потом'),
      ));
      return;
    }
    const topics = run.topics(pid);
    side.append(h('div.topics', topics.map((t) => {
      const asked = run.has(`q:${pid}.${t.id}`);
      const cl = t.claim && run.claims[t.claim.id];
      const solved = cl && run.has('c:' + cl.id);
      return h('button.topic' + (asked ? '.asked' : '.is-new') + (cl && asked && !solved ? '.pending' : ''), { onclick: () => ask(t.id) },
        h('span', t.q), asked ? h('i', solved ? '✓' : cl ? '?' : '✓') : null);
    })));
    const st = Object.values(run.claims).filter((c) => c.pid === pid && run.has(`q:${pid}.${c.topic}`));
    if (st.length) {
      side.append(h('div.statements', h('div.st-title', 'Показания'), st.map((c) => {
        const ok = run.has('c:' + c.id);
        return h('button.statement' + (ok ? '.ok' : ''), { onclick: () => { if (!ok) render(c); } },
          h('span', '«' + c.text + '»'), h('i', ok ? (c.truth === 'true' ? 'правда' : c.truth === 'lie' ? 'ложь раскрыта' : 'дожали') : 'разобрать'));
      })));
    }
  }

  async function ask(tid) {
    if (busy) return;
    busy = true; sfx.click();
    stopSpeech();
    const out = run.ask(pid, tid);
    await play(out);
    busy = false;
    render(out.claim);
  }

  async function judge(claim, v) {
    if (busy) return;
    let ev;
    if (v === 'lie') {
      ev = await pickEvidence('Какая улика опровергает показание?', { hint: '«' + claim.text + '»' });
      if (!ev) return;
    }
    busy = true;
    stopSpeech();
    const out = run.judge(claim.id, v, ev);
    out.right ? sfx.right() : sfx.wrong();
    side.querySelector('.claim-panel')?.classList.add(out.right ? 'right' : 'wrong');
    await play(out);
    busy = false;
    render(out.right ? null : claim);
  }

  render();
  // для автопроверки
  window.__talk = { ask, judge: (claimId, v, ev) => judgeDirect(claimId, v, ev) };
  async function judgeDirect(claimId, v, ev) {
    const out = run.judge(claimId, v, ev);
    await play(out); render(); return out;
  }
}
