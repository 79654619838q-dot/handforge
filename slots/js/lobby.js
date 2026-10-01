// Лобби: джекпот, колесо удачи, задания дня, уровень и медали, рейтинг игроков, выбор автомата.
import { MACHINES, BETS, COMMON, JACKPOTS, asset } from './machines.js';
import { state } from './state.js';
import { sfx } from './audio.js';
import { storageWorks } from './storage.js';
import { fmt, esc, plural, Counter, pic, symPic, logoPic, wireAll, modal, hud, topRight, wireTop, giftModal } from './ui.js';
import { levelInfo, tasksToday, TASK_REWARD, TASKS_BONUS, MEDALS, wheelLeft, spinWheel, flush, xpFor, levelReward, wheelMult } from './meta.js';
import { wheelModal } from './bonus.js';
import { player, setName, push, loadTop } from './rating.js';

const hms = (ms) => {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
};

export function lobbyScreen(app, { rerender }) {
  const fsBadge = (m) => state.fs[m.id] ? `<div class="badge">Ждут бесплатные вращения: ${state.fs[m.id].left}</div>` : '';
  const medalsGot = MEDALS.filter((md) => state.medals[md.id]).length;
  const li = levelInfo();
  const tasks = tasksToday();
  const me = player();
  app.innerHTML = `
  <div class="screen lobby">
    <div class="bg" style="--img:url(${asset('bg/lobby.jpg')})"></div>
    <header class="top">
      <div class="brand">Золотые <b>барабаны</b></div>
      <div class="top-right">${topRight()}</div>
    </header>
    <h1 class="hero">${logoPic(COMMON.logo, 'Золотые <b>барабаны</b>', 'hero-logo')}</h1>
    <section class="jp-banner">
      ${pic(COMMON.crown, '👑', 'jp-crown')}
      <div>
        <div class="jp-label">Джекпот «Гранд»</div>
        <div class="jp-value">${fmt(state.jackpot)}</div>
        <div class="jp-hint">Общий для всех автоматов и растёт с каждой ставкой. Короны на барабанах открывают джекпот-игру: ${JACKPOTS.map((j) => j.name).join(', ')}.</div>
      </div>
    </section>

    <section class="panels">
      <div class="panel wheel-card">
        <div class="p-head">${pic(COMMON.wheel, '🎡', 'p-ico')}<b>Колесо удачи</b></div>
        <p class="wh-state"></p>
        <button class="btn-gold wh-go">Крутить</button>
        <p class="p-note">Призы ×${wheelMult().toFixed(1).replace('.', ',')} за ваш уровень</p>
      </div>
      <div class="panel tasks-card">
        <div class="p-head">${pic(COMMON.medal, '📋', 'p-ico')}<b>Задания дня</b></div>
        <ul class="tasks">${tasks.map((t) => `
          <li class="${t.done ? 'done' : ''}"><span class="t-txt">${t.done ? '✔ ' : ''}${esc(t.text)}</span>
            <i class="bar"><s style="width:${Math.round((t.have / t.goal) * 100)}%"></s></i>
            <em>${t.goal > 99 ? fmt(t.have) + ' / ' + fmt(t.goal) : t.have + ' / ' + t.goal} · +${fmt(TASK_REWARD)}</em></li>`).join('')}
        </ul>
        <p class="p-note">${state.tasks.bonus ? '✔ Все выполнены — завтра будут новые' : `Все три — ещё +${fmt(TASKS_BONUS)}`}</p>
      </div>
      <div class="panel level-card">
        <div class="p-head">${pic(COMMON.star, '⭐', 'p-ico')}<b>Уровень ${li.level}</b></div>
        <i class="bar big"><s style="width:${Math.round(li.frac * 100)}%"></s></i>
        <p>До уровня ${li.level + 1}: <b>${fmt(Math.max(0, li.toNext))}</b> опыта · награда <b>${fmt(li.reward)}</b></p>
        <p class="p-note">Опыт — за каждую ставку и задания</p>
        <button class="ctl medals-btn">${pic(COMMON.medal, '🏅', 'btn-ico')} Медали ${medalsGot} / ${MEDALS.length}</button>
      </div>
      <div class="panel rating-card">
        <div class="p-head">${pic(COMMON.pile, '🏆', 'p-ico')}<b>Рейтинг игроков</b></div>
        <p class="p-note">Кто выше всех поднимется со стартовых 10 000</p>
        ${me.name ? '' : `<form class="name-form"><input maxlength="24" placeholder="Ваше имя в рейтинге" required><button class="btn-gold">Войти</button></form>`}
        <ol class="top5"><li class="muted">Загружаю…</li></ol>
        <button class="ctl rating-btn">Весь рейтинг</button>
      </div>
    </section>

    <section class="machines">
      ${MACHINES.map((m) => `
        <a class="mcard theme-${m.id}" href="#/m/${m.id}">
          <div class="mcard-art" style="--img:url(${asset(`bg/${m.id}.jpg`)})">
            <img class="mcard-title" src="${asset(`${m.id}/title.webp`)}" alt="" onerror="this.remove()">
            <div class="mcard-syms">${['h1', 'wild', 'scatter'].map((id) => symPic(m, id)).join('')}</div>
            ${fsBadge(m)}
          </div>
          <div class="mcard-body">
            <h3>${m.title}</h3>
            <p>${m.tagline}</p>
            <p class="feat">★ ${m.feature}</p>
            <p class="feat2">Бесплатные вращения: ${m.fs.text.toLowerCase()}</p>
            <span class="play">Играть</span>
          </div>
        </a>`).join('')}
    </section>
    <footer class="stats">
      <span>Вращений: <b>${fmt(state.stats.spins)}</b></span>
      <span>Рекорд счёта: <b>${fmt(state.stats.maxBalance)}</b></span>
      <span>Самый крупный выигрыш: <b>${fmt(state.stats.biggest)}</b>${state.stats.biggestMachine ? ` <i>(${esc(state.stats.biggestMachine)})</i>` : ''}</span>
      <span>Джекпотов: <b>${state.stats.jackpots}</b></span>
      ${state.balance < BETS[0] ? '<button class="gift-btn">🎁 Получить подарок</button>' : ''}
    </footer>
    ${storageWorks ? '' : '<div class="warn">Браузер не даёт сайту хранить данные — монеты не запомнятся после закрытия страницы.</div>'}
  </div>`;
  wireAll(app);
  wireTop(app, { levelInfo, onLevel: () => medalsModal() });
  const $ = (s) => app.querySelector(s);
  hud.jp = new Counter($('.jp-value'), state.jackpot);
  $('.gift-btn')?.addEventListener('click', () => giftModal(rerender));
  app.querySelectorAll('.mcard').forEach((a) => a.addEventListener('click', () => sfx.click()));
  $('.medals-btn').addEventListener('click', () => { sfx.click(); medalsModal(); });

  // колесо удачи
  const whState = $('.wh-state'), whGo = $('.wh-go');
  const tick = () => {
    const left = wheelLeft();
    whGo.disabled = left > 0;
    whState.innerHTML = left > 0 ? `Следующее через <b>${hms(left)}</b>` : '<b>Готово!</b> Бесплатное вращение ждёт';
    $('.wheel-card').classList.toggle('ready', left <= 0);
  };
  tick();
  const timer = setInterval(tick, 1000);
  whGo.addEventListener('click', async () => {
    sfx.click();
    const res = await wheelModal({ spin: spinWheel, ready: wheelLeft() <= 0, left: hms(wheelLeft()) });
    if (res) { flush(); push(); rerender(); }
  });

  // рейтинг
  const form = $('.name-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = form.querySelector('input').value.trim();
    if (!v) return;
    sfx.click();
    await setName(v);
    rerender();
  });
  const top5 = $('.top5');
  loadTop().then((d) => {
    if (!top5.isConnected) return;
    if (!d) { top5.innerHTML = '<li class="muted">Рейтинг сейчас недоступен</li>'; return; }
    const rows = d.top.slice(0, 5).map((r) => `<li class="${r.me ? 'me' : ''}"><i>${r.place}</i><span>${esc(r.name)}</span><b>${fmt(r.best)}</b></li>`);
    if (d.me && d.me.place > 5) rows.push(`<li class="me"><i>${d.me.place}</i><span>${esc(d.me.name)} (вы)</span><b>${fmt(d.me.best)}</b></li>`);
    top5.innerHTML = rows.join('') || '<li class="muted">Пока никого — будьте первым!</li>';
  });
  $('.rating-btn').addEventListener('click', () => { sfx.click(); ratingModal(); });
  push();

  return { destroy() { clearInterval(timer); } };
}

export function medalsModal() {
  const li = levelInfo();
  const levels = [];
  for (let l = li.level + 1; l <= li.level + 3; l++) levels.push(`<li>Уровень ${l} — ${fmt(xpFor(l))} опыта · награда ${fmt(levelReward(l))}</li>`);
  modal(`
    <button class="x">✕</button>
    <h2>Уровень ${li.level} и медали</h2>
    <i class="bar big"><s style="width:${Math.round(li.frac * 100)}%"></s></i>
    <p>Опыт: <b>${fmt(li.xp)}</b>. Опыт дают ставки (1 очко за 10 монет) и задания дня. С каждым уровнем — монеты и призы колеса удачи больше.</p>
    <ul class="next-levels">${levels.join('')}</ul>
    <div class="medals">${MEDALS.map((md) => `
      <div class="medal ${state.medals[md.id] ? 'got' : ''}">${pic(COMMON.medal, '🏅', 'm-ico')}<b>${esc(md.name)}</b><span>+${fmt(md.reward)}</span></div>`).join('')}
    </div>`, { cls: 'medals-modal', closeOnBg: true });
}

export async function ratingModal() {
  const { el } = modal(`
    <button class="x">✕</button>
    <h2>Рейтинг игроков</h2>
    <p class="sub">Место — по рекорду: до скольких монет игрок поднялся со стартовых 10 000.</p>
    <table class="rating"><thead><tr><th>#</th><th>Игрок</th><th>Рекорд</th><th>Сейчас</th><th>Ур.</th></tr></thead><tbody><tr><td colspan="5">Загружаю…</td></tr></tbody></table>`, { cls: 'rating-modal', closeOnBg: true });
  const d = await loadTop();
  const body = el.querySelector('tbody');
  if (!d) { body.innerHTML = '<tr><td colspan="5">Рейтинг сейчас недоступен</td></tr>'; return; }
  const row = (r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.place}</td><td>${esc(r.name)}</td><td><b>${fmt(r.best)}</b></td><td>${fmt(r.balance)}</td><td>${r.level}</td></tr>`;
  body.innerHTML = d.top.map(row).join('') + (d.me && d.me.place > d.top.length ? row({ ...d.me, me: true }) : '') || '<tr><td colspan="5">Пока никого — будьте первым!</td></tr>';
}
