// Главное меню, список дел, звание, рейтинг, настройки. Расследование — ui/case.js.
import { h, pic, img, modal, toast, qs, plural } from './util.js';
import { load, save, totals, resetAll, storageBroken } from './store.js';
import { CASES, CHAPTERS, PLANNED_TITLES } from './data/cases.js';
import { rankOf, RANKS } from './ranks.js';
import { sfx, ambient, setMusicVolume, stopSpeech } from './audio.js';
import { openCase } from './ui/case.js';
import * as caseMod from './ui/case.js';
const caseRun = () => caseMod.run;
import { sendRating, fetchRating } from './rating.js';

const app = document.getElementById('app');

export function screen(...kids) {
  stopSpeech();
  app.replaceChildren(...kids);
  app.scrollTop = 0;
  window.scrollTo(0, 0);
}

const caseById = (id) => CASES.find((c) => c.id === id);
// дело открыто, если предыдущее закрыто (любой концовкой)
export function caseOpen(no) {
  if (qs.get('open') === 'all') return true;
  if (no === 1) return true;
  const prev = CASES.find((c) => c.no === no - 1);
  return !!(prev && load().done[prev.id]);
}

export function title() {
  ambient('calm');
  const s = load();
  const t = totals();
  const r = rankOf(t.stars);
  const anyRun = Object.keys(s.runs).length > 0;
  const nextCase = CASES.find((c) => caseOpen(c.no) && !s.done[c.id]) || CASES[0];
  screen(h('div.title-screen',
    pic('ui/menu', 'title-bg'),
    h('div.title-shade'),
    h('div.title-box',
      h('div.logo', 'АРХИВ'),
      h('div.tagline', '30 дел. Одна ночь.'),
      h('div.menu-buttons',
        h('button.btn.primary.big', { onclick: () => { sfx.click(); if (anyRun || Object.keys(s.done).length) cases(); else openCase(CASES[0]); } },
          anyRun || Object.keys(s.done).length ? 'Продолжить' : 'Начать расследование'),
        Object.keys(s.done).length ? h('button.btn', { onclick: () => openCase(nextCase) }, `Следующее: дело №${nextCase.no}`) : null,
        h('button.btn', { onclick: () => { sfx.click(); cases(); } }, 'Все дела'),
        h('button.btn', { onclick: () => { sfx.click(); profile(); } }, 'Звание и жетоны'),
        h('button.btn', { onclick: () => { sfx.click(); rating(); } }, 'Рейтинг детективов'),
        h('button.btn.ghost', { onclick: () => { sfx.click(); settings(); } }, 'Настройки'),
      ),
      h('div.title-rank', `${r.name} · ${t.stars} ${plural(t.stars, 'звезда', 'звезды', 'звёзд')} · ${t.score} очков`),
    ),
  ));
  if (storageBroken()) toast('Браузер не даёт сохранять прогресс — он пропадёт после закрытия вкладки', 'bad');
}

export function cases(chNo) {
  ambient('calm');
  const s = load();
  const lastOpen = Math.max(1, ...CASES.filter((c) => caseOpen(c.no)).map((c) => c.no));
  const cur = chNo || Math.ceil(lastOpen / 10);
  const ch = CHAPTERS[cur - 1];
  const list = [];
  for (let no = (cur - 1) * 10 + 1; no <= cur * 10; no++) {
    const c = CASES.find((x) => x.no === no);
    const done = c && s.done[c.id];
    const open = c && caseOpen(no);
    const inRun = c && s.runs[c.id];
    list.push(h('button.case-card' + (open ? '' : '.locked') + (done ? '.done' : '') + (c ? '' : '.soon'),
      { onclick: () => { if (!c) return toast('Это дело ещё пишется'); if (!open) return toast('Сначала закройте предыдущее дело'); sfx.click(); openCase(c); } },
      c ? pic(c.cover, 'case-thumb') : h('div.case-thumb.missing'),
      h('div.case-no', '№' + String(no).padStart(2, '0')),
      h('div.case-title', c ? c.title : PLANNED_TITLES[no - 1]),
      h('div.case-meta',
        c ? h('span.diff', '●'.repeat(Math.min(5, Math.ceil(c.diff / 2) || 1))) : null,
        done ? h('span.stars', '★'.repeat(done.stars) + '☆'.repeat(3 - done.stars)) : inRun ? h('span.inrun', 'в работе') : !c ? h('span.soon-tag', 'скоро') : !open ? h('span.lock', '🔒') : h('span.new', 'новое')),
    ));
  }
  screen(h('div.cases-screen',
    h('div.topbar', h('button.btn.ghost.back', { onclick: title }, '← Меню'), h('div.top-title', 'Дела'), h('div')),
    h('div.chapter-tabs', CHAPTERS.map((c) => h('button.tab' + (c.no === cur ? '.on' : ''), { onclick: () => cases(c.no) }, c.sub))),
    h('div.chapter-head', pic(ch.img, 'chapter-art'), h('div.chapter-text', h('div.chapter-sub', ch.sub), h('div.chapter-title', ch.title))),
    h('div.case-grid', list),
  ));
}

export function profile() {
  const s = load();
  const t = totals();
  const r = rankOf(t.stars);
  const tokens = [...s.tokens].sort((a, b) => a - b);
  screen(h('div.profile-screen',
    h('div.topbar', h('button.btn.ghost.back', { onclick: title }, '← Меню'), h('div.top-title', 'Звание и жетоны'), h('div')),
    h('div.rank-card',
      h('div.rank-name', r.name),
      h('div.rank-sub', `${t.stars} ${plural(t.stars, 'звезда', 'звезды', 'звёзд')} · раскрыто ${t.solved} ${plural(t.solved, 'дело', 'дела', 'дел')} · ${t.score} очков`),
      r.next ? h('div.rank-next', `До звания «${r.next.name}» — ещё ${r.need} ${plural(r.need, 'звезда', 'звезды', 'звёзд')}`) : h('div.rank-next', 'Высшее звание'),
      h('div.rank-ladder', RANKS.map((x, i) => h('div.rung' + (i <= r.i ? '.on' : ''), h('b', x.name), h('span', x.stars + ' ★')))),
    ),
    h('div.section-title', 'Жетоны «ВМТ-9»'),
    h('div.token-hint', tokens.length ? 'Латунные жетоны из писем, которые получали исполнители. Откуда они?' : 'Пока ни одного. Они найдутся в делах.'),
    h('div.token-grid', tokens.map((n) => h('div.token', h('span', 'ВМТ-9'), h('b', '№' + String(n).padStart(3, '0'))))),
  ));
}

export async function rating() {
  const s = load();
  const body = h('div.rating-list', h('div.loading', 'Загрузка…'));
  const t = totals();
  screen(h('div.rating-screen',
    h('div.topbar', h('button.btn.ghost.back', { onclick: title }, '← Меню'), h('div.top-title', 'Рейтинг детективов'), h('div')),
    h('div.rating-me',
      h('div', 'Ваш позывной: ', h('b', s.player.name || '— не задан —')),
      h('button.btn.small', { onclick: () => askName(() => rating()) }, s.player.name ? 'Сменить' : 'Задать'),
    ),
    body,
  ));
  if (s.player.name && t.cases) await sendRating();
  const data = await fetchRating();
  if (!data) { body.replaceChildren(h('div.loading', 'Рейтинг сейчас недоступен. Попробуйте позже.')); return; }
  const row = (r) => h('div.rating-row' + (r.me ? '.me' : ''), h('span.place', r.place), h('span.name', r.name), h('span.rank', rankOf(r.stars).name), h('span.stars', r.stars + ' ★'), h('span.score', r.score));
  body.replaceChildren(
    h('div.rating-row.head', h('span.place', '№'), h('span.name', 'Детектив'), h('span.rank', 'Звание'), h('span.stars', 'Звёзды'), h('span.score', 'Очки')),
    ...data.top.map(row),
    data.me && !data.top.some((r) => r.me) ? [h('div.rating-gap', '…'), row({ ...data.me, me: true })] : null,
    data.top.length ? null : h('div.loading', 'Пока пусто. Раскройте первое дело!'),
  );
}

export function askName(then) {
  const s = load();
  const inp = h('input.name-input', { maxlength: 20, placeholder: 'Например: Шерлок', value: s.player.name || '' });
  const m = modal(h('div.name-box',
    h('h3', 'Позывной для рейтинга'),
    inp,
    h('button.btn.primary', { onclick: () => {
      const v = inp.value.replace(/[<>]/g, '').trim().slice(0, 20);
      if (!v) return toast('Введите позывной');
      s.player.name = v; save(); m.close(); then?.();
    } }, 'Сохранить'),
  ));
  setTimeout(() => inp.focus(), 50);
}

export function settings() {
  const s = load();
  const slider = (label, key, after) => h('label.setting', h('span', label),
    h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.settings[key], oninput: (e) => { s.settings[key] = +e.target.value; save(); after?.(+e.target.value); } }));
  screen(h('div.settings-screen',
    h('div.topbar', h('button.btn.ghost.back', { onclick: title }, '← Меню'), h('div.top-title', 'Настройки'), h('div')),
    h('div.settings-box',
      slider('Голоса', 'voice'),
      slider('Музыка и шум дождя', 'music', setMusicVolume),
      h('label.setting', h('span', 'Субтитры'), h('input', { type: 'checkbox', checked: s.settings.subs, onchange: (e) => { s.settings.subs = e.target.checked; save(); } })),
      h('button.btn.danger', { onclick: () => {
        const m = modal(h('div.name-box', h('h3', 'Стереть всё прохождение?'), h('p', 'Звёзды, жетоны и начатые дела пропадут. Позывной останется.'),
          h('button.btn.danger', { onclick: () => { resetAll(); m.close(); toast('Прохождение стёрто'); title(); } }, 'Да, стереть')));
      } }, 'Начать игру заново'),
    ),
  ));
}

// ——— запуск ———
if (qs.get('case')) {
  const c = caseById(qs.get('case'));
  if (c) openCase(c); else title();
} else title();

// для проверки: window.__game, автопроход — ?test=1 (js/test.js)
window.__game = { load, CASES, openCase, title, cases, run: () => caseRun() };
if (qs.has('test')) import('./test.js');
