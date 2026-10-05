// Расследование одного дела: вводная → штаб дела (места, люди, улики, лаборатория, эксперименты,
// доска, отдел помощи, обвинение) → концовка и итог.
import { h, pic, img, modal, toast, points, sleep, plural, qs } from '../util.js';
import { load, save, recordCase } from '../store.js';
import { CaseRun, PTS } from '../engine.js';
import { PEOPLE, person } from '../data/people.js';
import { CASES, CHAPTERS } from '../data/cases.js';
import { say, sfx, ambient, stopSpeech } from '../audio.js';
import { screen, cases, title, caseOpen, askName } from '../main.js';
import { sceneView } from './scene.js';
import { talkView } from './talk.js';
import { boardView, accuseFlow } from './board.js';
import { runExperiment } from './exps.js';
import { sendRating } from '../rating.js';
import { LINES } from '../data/common.js';

export let C = null;     // данные дела
export let run = null;   // ход расследования
let seen = new Set();    // что игрок уже открывал (для значков «новое»)
const briefShownChapter = new Set();

export function persist() {
  const s = load();
  if (!run.ending) s.runs[C.id] = run.save(); else delete s.runs[C.id];
  s.seen[C.id] = [...seen];
  save();
}
export const markSeen = (k) => { seen.add(k); persist(); };
export const isSeen = (k) => seen.has(k);

export function openCase(c) {
  const s = load();
  const saved = s.runs[c.id];
  if (saved && !saved.ending) {
    const m = modal(h('div.name-box',
      h('h3', `Дело №${c.no}. ${c.title}`),
      h('p', 'Расследование уже начато.'),
      h('button.btn.primary', { onclick: () => { begin(c, saved, false); m.close(); } }, 'Продолжить'),
      h('button.btn', { onclick: () => { begin(c, null, true); m.close(); } }, 'Начать заново'),
    ), { onClose: () => { if (!document.getElementById('app').children.length) title(); } });
    return;
  }
  begin(c, null, true);
}

function begin(c, saved, withBrief) {
  C = c;
  run = new CaseRun(c, PEOPLE, saved);
  seen = new Set(saved ? load().seen[c.id] || [] : []);
  persist();
  if (withBrief) brief(); else hub();
}

// ——— вводная ———
async function brief() {
  ambient('calm');
  // первое дело главы — сначала заставка главы
  if (C.no % 10 === 1 && !briefShownChapter.has(C.ch)) {
    briefShownChapter.add(C.ch);
    const ch = CHAPTERS[C.ch - 1];
    screen(h('div.brief.chapter-card', pic(ch.img, 'brief-bg kenburns'), h('div.brief-shade'),
      h('div.chapter-big', h('div.chapter-sub', ch.sub), h('div.chapter-name', ch.title))));
    sfx.sting();
    await sleep(qs.has('fast') ? 50 : 3200);
  }
  const go = h('button.btn.primary.big.hidden', { onclick: () => { stopSpeech(); hub(); } }, 'Начать расследование');
  screen(h('div.brief',
    pic(C.cover, 'brief-bg kenburns'),
    h('div.brief-shade'),
    h('div.brief-card',
      h('div.brief-no', `ДЕЛО №${String(C.no).padStart(2, '0')}`),
      h('div.brief-title', C.title),
      h('div.brief-when', C.when),
      h('div.brief-where', C.where),
    ),
    h('div.brief-bottom', go, h('button.btn.ghost.skip', { onclick: () => { stopSpeech(); hub(); } }, 'Пропустить')),
  ));
  sfx.stamp();
  await sleep(700);
  setTimeout(() => go.classList.remove('hidden'), 1500);
  await say(C.brief);
}

// ——— штаб дела ———
export function hub() {
  ambient(C.diff >= 4 ? 'tense' : 'calm');
  const places = run.places().map((id) => {
    const p = C.places[id];
    const total = run.spotsTotal(id), left = run.spotsLeft(id);
    const isNew = !run.has('v:' + id);
    return h('button.card.place-card' + (isNew ? '.is-new' : ''), { onclick: () => { sfx.click(); openPlace(id); } },
      pic(p.img, 'card-img'),
      h('div.card-body', h('div.card-title', p.name), h('div.card-sub', isNew ? 'не осмотрено' : left ? `найдено ${total - left} из ${total}` : 'осмотрено полностью')),
    );
  });
  const people = run.persons().map((pid) => {
    const p = person(pid);
    const ts = run.topics(pid);
    const fresh = ts.filter((t) => !run.has(`q:${pid}.${t.id}`)).length;
    const pending = run.pendingClaims(pid).length;
    return h('button.card.person-card' + (fresh ? '.is-new' : ''), { onclick: () => { sfx.click(); openTalk(pid); } },
      pic('p/' + pid, 'card-portrait'),
      h('div.card-body', h('div.card-title', p.name), h('div.card-sub', C.people[pid].role || p.role),
        fresh ? h('div.card-flag', fresh + ' ' + plural(fresh, 'новый вопрос', 'новых вопроса', 'новых вопросов')) : pending ? h('div.card-flag.warn', 'показания не разобраны') : null),
    );
  });
  const evN = run.evidence().length;
  const exps = run.exps();
  const expNew = exps.filter((x) => !run.has('x:' + x.id)).length;
  const qs_ = run.boardQs();
  const qOpen = qs_.filter((q) => !run.has('b:' + q.id)).length;
  const canAcc = run.canAccuse();
  screen(h('div.hub',
    pic('ui/office', 'hub-bg'),
    h('div.topbar',
      h('button.btn.ghost.back', { onclick: () => { persist(); cases(C.ch); } }, '← Дела'),
      h('div.top-title', h('span.case-tag', `ДЕЛО №${String(C.no).padStart(2, '0')}`), ' ', C.title),
      h('div.top-score', run.score() + ' очков'),
    ),
    h('div.goal', h('span', 'ЦЕЛЬ'), run.goal()),
    h('div.hub-grid',
      h('section.hub-col', h('h2', 'Места'), h('div.cards', places)),
      h('section.hub-col', h('h2', 'Люди'), h('div.cards', people.length ? people : h('div.empty', 'Пока не с кем говорить'))),
    ),
    h('div.hub-actions',
      h('button.act', { onclick: () => evidenceList() }, h('i', '🗂'), h('b', 'Улики'), h('small', evN)),
      h('button.act', { onclick: () => labView() }, h('i', '🔬'), h('b', 'Лаборатория')),
      h('button.act' + (expNew ? '.is-new' : ''), { onclick: () => expList() }, h('i', '🧭'), h('b', 'Эксперименты'), h('small', exps.length ? (expNew ? expNew + ' новых' : 'все пройдены') : 'пока нет')),
      h('button.act' + (qOpen ? '.is-new' : ''), { onclick: () => { sfx.paper(); boardView(); } }, h('i', '📌'), h('b', 'Доска'), h('small', qs_.length ? `${qs_.length - qOpen} из ${qs_.length}` : 'пусто')),
      h('button.act', { onclick: () => helpView() }, h('i', '☎'), h('b', 'Отдел помощи')),
      h('button.act.accuse' + (canAcc ? '.ready' : '.off'), { onclick: () => { if (!canAcc) return toast('Пока рано: сначала разберитесь на доске'); accuseFlow(); } }, h('i', '⚖'), h('b', C.accuse.verb || 'Обвинить')),
    ),
  ));
}

export async function play(out, { quiet = false } = {}) {
  if (!out) return;
  if (out.score && !quiet) points(out.score);
  const newEv = out.gained.filter((a) => a.startsWith('ev:')).map((a) => a.slice(3));
  persist();
  const sp = say(out.lines);
  for (const id of newEv) { sfx.found(); await showEvidence(id, true); }
  await sp;
}

// карточка улики (новая — с отметкой «новая улика»)
export function showEvidence(id, isNew = false) {
  const e = C.ev[id];
  return new Promise((resolve) => {
    const m = modal(h('div.ev-detail' + (isNew ? '.new' : ''),
      isNew ? h('div.ev-new', e.hidden ? 'Скрытая улика!' : 'Новая улика') : null,
      pic(e.img, 'ev-big'),
      h('div.ev-name', e.name),
      h('div.ev-txt', e.txt),
      e.token ? h('div.ev-token', `Жетон №${e.token} — в коллекцию`) : null,
      h('button.btn.primary', { onclick: () => m.close() }, 'Дальше'),
    ), { cls: 'ev-modal', onClose: resolve });
  });
}

export function evidenceGrid(onPick, { filter, badge } = {}) {
  const list = run.evidence().filter((e) => !filter || filter(e));
  if (!list.length) return h('div.empty', 'Улик пока нет');
  return h('div.ev-grid', list.map((e) => h('button.ev-card', { onclick: () => onPick(e.id) },
    pic(e.img, 'ev-thumb'), h('div.ev-card-name', e.name), badge?.(e.id) ? h('span.ev-badge', badge(e.id)) : null)));
}

function evidenceList() {
  sfx.paper();
  const m = modal(h('div.list-box', h('h3', 'Улики'), evidenceGrid((id) => showEvidence(id))), { cls: 'wide' });
}

// выбор улики (для «Ложь!», доски, обвинения) — промис с id или null
export function pickEvidence(titleText, { count = 1, hint = '' } = {}) {
  return new Promise((resolve) => {
    const chosen = [];
    let done = false;
    const okBtn = count > 1 ? h('button.btn.primary', { disabled: true, onclick: () => { done = true; m.close(); resolve(chosen); } }, 'Готово') : null;
    const grid = evidenceGrid((id) => {
      if (count === 1) { done = true; m.close(); resolve(id); return; }
      const i = chosen.indexOf(id);
      if (i >= 0) chosen.splice(i, 1); else if (chosen.length < count) chosen.push(id);
      grid.querySelectorAll('.ev-card').forEach((b, k) => b.classList.toggle('chosen', chosen.includes(run.evidence()[k].id)));
      okBtn.disabled = chosen.length !== count;
      okBtn.textContent = `Готово (${chosen.length} из ${count})`;
    });
    const m = modal(h('div.list-box', h('h3', titleText), hint ? h('p.pick-hint', hint) : null, grid, okBtn), { cls: 'wide', onClose: () => { if (!done) resolve(null); } });
    if (okBtn) okBtn.textContent = `Готово (0 из ${count})`;
  });
}

// ——— место ———
function openPlace(id) {
  const out = run.visit(id);
  sceneView({
    C, run, placeId: id,
    onBack: () => hub(),
    onEnter: () => play(out),
    onSearch: async (x, y) => {
      const r = run.search(id, x, y);
      if (r.miss) { sfx.miss(); return r; }
      if (r.already) { say(r.lines.length ? r.lines : [LINES.seen]); return r; }
      play(r);
      return r;
    },
  });
}

// ——— допрос ———
function openTalk(pid) {
  talkView({ C, run, pid, onBack: () => hub() });
}

// ——— лаборатория ———
async function labView() {
  sfx.click();
  ambient('calm');
  const doneMark = (evId) => (C.lab || []).some((l) => l.ev === evId && run.has('l:' + l.id));
  const grid = () => evidenceGrid(async (id) => {
    stopSpeech();
    const out = run.lab(id);
    await play(out);
    body.replaceChildren(grid());
  }, { badge: (id) => (doneMark(id) ? '✓ исследовано' : '') });
  const body = h('div.lab-body', grid());
  screen(h('div.lab',
    pic('ui/lab', 'hub-bg'),
    h('div.topbar', h('button.btn.ghost.back', { onclick: () => hub() }, '← Назад'), h('div.top-title', 'Лаборатория'), h('div.top-score', run.score() + ' очков')),
    h('div.lab-head', pic('p/granin', 'lab-portrait'), h('div', h('div.lab-name', 'Лев Борисович Гранин'), h('div.lab-role', 'главный эксперт-криминалист'), h('div.lab-say', 'Выберите улику для экспертизы.'))),
    body,
  ));
  if (!run.has('f:_labhello')) { run.atoms.add('f:_labhello'); persist(); say([LINES.labHello]); }
}

// ——— эксперименты ———
function expList() {
  sfx.click();
  const xs = run.exps();
  const m = modal(h('div.list-box',
    h('h3', 'Эксперименты'),
    xs.length ? h('div.exp-list', xs.map((x) => h('button.exp-card' + (run.has('x:' + x.id) ? '.done' : '.is-new'), {
      onclick: () => { m.close(); runExperiment(x, C, run, async (ok, variant) => { const out = run.expDone(x.id, ok, variant); await play(out); return out; }, () => hub()); },
    }, h('b', x.name), h('small', run.has('x:' + x.id) ? 'пройден' : 'не проведён')))) : h('div.empty', 'Пока нечего проверять. Ищите улики и говорите с людьми.'),
  ), { cls: 'wide' });
}

// ——— отдел помощи ———
function helpView() {
  sfx.click();
  const st = run.hintStep();
  const body = h('div.help-body');
  const render = () => {
    const st2 = run.hintStep();
    body.replaceChildren();
    if (!st2) { body.append(h('div.help-say', 'Подсказок больше нет — всё в ваших руках.')); return; }
    const bought = st2.step.h.slice(0, st2.bought);
    bought.forEach((t, i) => body.append(h('div.help-hint', h('span', ['Намёк', 'Подсказка', 'Ответ'][i]), t)));
    if (st2.bought < 3) {
      const cost = PTS.hint[st2.bought];
      body.append(h('button.btn.primary', { onclick: () => {
        const r = run.buyHint(); persist(); points(-r.cost); sfx.paper();
        say([['maya', r.text]]); render();
      } }, `${['Попросить намёк', 'Попросить подсказку', 'Попросить прямой ответ'][st2.bought]} (−${cost} очков)`));
    }
  };
  render();
  screen(h('div.help',
    pic('ui/help', 'hub-bg'),
    h('div.topbar', h('button.btn.ghost.back', { onclick: () => hub() }, '← Назад'), h('div.top-title', 'Аналитический отдел'), h('div.top-score', run.score() + ' очков')),
    h('div.lab-head', pic('p/maya', 'lab-portrait'), h('div', h('div.lab-name', 'Майя Ким'), h('div.lab-role', 'аналитик'),
      h('div.lab-say', 'Застряли? Помогу. Но каждая подсказка снимает очки.'))),
    body,
  ));
  if (!st) return;
  if (!run.has('f:_mayahello')) { run.atoms.add('f:_mayahello'); persist(); say([LINES.mayaHello]); }
}

// ——— концовка ———
export async function ending(out) {
  persist();
  const kind = out.kind;
  const E = C.accuse.endings[kind];
  ambient(kind === 'true' ? 'calm' : 'tense');
  const stamp = h('div.end-stamp.' + kind, kind === 'true' ? 'РАСКРЫТО' : kind === 'partial' ? 'ЧАСТИЧНО' : 'ОШИБКА');
  const next = h('button.btn.primary.big.hidden', { onclick: () => { stopSpeech(); results(); } }, 'Итоги дела');
  screen(h('div.brief.ending',
    pic(E.img || 'ui/end' + kind, 'brief-bg kenburns'),
    h('div.brief-shade'),
    stamp,
    h('div.brief-bottom', next),
  ));
  await sleep(400);
  sfx.stamp(); stamp.classList.add('show');
  kind === 'true' ? sfx.win() : sfx.lose();
  setTimeout(() => next.classList.remove('hidden'), 2500);
  await say(out.lines);
  next.classList.remove('hidden');
}

function results() {
  const stars = run.stars();
  const score = run.score();
  const max = run.maxScore();
  const tokens = run.evidence().filter((e) => e.token).map((e) => e.token);
  recordCase(C.id, { score, stars, ending: run.ending, tokens });
  sendRating();
  const found = run.evidence().length, totalEv = Object.keys(C.ev).length;
  const claims = Object.values(run.claims);
  const claimsDone = claims.filter((c) => run.has('c:' + c.id)).length;
  const nextC = CASES.find((c) => c.no === C.no + 1);
  const s = load();
  const kindText = { true: 'Дело раскрыто', partial: 'Раскрыто частично', wrong: C.accuse.verb ? 'Неверная версия' : 'Обвинён невиновный' }[run.ending];
  const L = C.link;
  screen(h('div.results',
    pic('ui/office', 'hub-bg'),
    h('div.results-box',
      h('div.res-kind.' + run.ending, kindText),
      h('div.res-stars', [0, 1, 2].map((i) => h('span' + (i < stars ? '.on' : ''), '★'))),
      h('div.res-score', `${score} очков из ${max}`),
      h('div.res-rows',
        h('div', h('span', 'Улик найдено'), h('b', `${found} из ${totalEv}`)),
        h('div', h('span', 'Показаний разобрано'), h('b', `${claimsDone} из ${claims.length}`)),
        h('div', h('span', 'Промахов'), h('b', run.mistakes)),
        h('div', h('span', 'Подсказок'), h('b', run.hintCost ? `−${run.hintCost}` : 'ни одной')),
      ),
      run.ending !== 'true' ? h('div.res-tip', 'Дело можно переиграть — лучший результат сохранится.') : null,
      L ? h('div.link-card',
        h('div.link-title', L.title),
        h('div.link-txt', L.txt),
        L.token && tokens.includes(L.token) ? h('div.link-token', h('span', 'ВМТ-9'), h('b', '№' + String(L.token).padStart(3, '0'))) : null,
      ) : null,
      h('div.res-buttons',
        nextC ? h('button.btn.primary.big', { onclick: () => openCase(nextC) }, `Дело №${nextC.no}: ${nextC.title}`) : h('div.res-soon', 'Следующие дела скоро'),
        h('button.btn', { onclick: () => { delete load().runs[C.id]; openCase(C); } }, 'Переиграть дело'),
        h('button.btn.ghost', { onclick: () => cases(C.ch) }, 'К списку дел'),
      ),
      !s.player.name ? h('button.btn.small.ghost', { onclick: () => askName(() => sendRating()) }, 'Попасть в рейтинг детективов — задать позывной') : null,
    ),
  ));
  if (stars) sfx.win();
}
