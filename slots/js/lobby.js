// Лобби: джекпот, колесо удачи, задания дня, уровень и медали, рейтинг игроков, выбор автомата.
import { MACHINES, BETS, COMMON, JACKPOTS, asset } from './machines.js';
import { state, save, ownedValue } from './state.js';
import { LUX_ITEMS } from './luxury.js';
import { estateModal, avatarById } from './estate.js';
import { sfx } from './audio.js';
import { storageWorks } from './storage.js';
import { fmt, esc, plural, Counter, pic, symPic, logoPic, wireAll, modal, hud, topRight, wireTop, giftModal, coinShower, toast } from './ui.js';
import { levelInfo, tasksToday, TASK_REWARD, TASKS_BONUS, MEDALS, wheelLeft, spinWheel, flush, xpFor, levelReward, wheelMult, track } from './meta.js';
import { wheelModal } from './bonus.js';
import { player, setName, push, loadTop } from './rating.js';

export const isLocked = (m) => !!m.price && !state.unlocked[m.id];
const BY = { best: { name: 'Рекорд', note: 'до скольких монет игрок поднялся со стартовых 10 000' }, wealth: { name: 'Самый богатый', note: 'монеты сейчас плюс всё купленное: владения из магазина роскоши, усилители и автоматы' } };

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
    <section class="estate-enter">
      <a class="ee-card ee-estate" href="#/estate">
        ${avatarById(state.avatar) ? pic(avatarById(state.avatar).img, '🧑', 'ee-av') : pic(COMMON.trophy, '🏆', 'ee-av')}
        <div><b>Моё поместье</b><span>Вы и всё купленное одной картинкой: купили дом — стоите на его фоне</span></div>
      </a>
      <a class="ee-card ee-shop" href="#/lux">
        ${pic(COMMON.wealth, '💎', 'ee-av')}
        <div><b>Магазин роскоши</b><span>Куплено ${Object.keys(state.owned).length} из ${LUX_ITEMS.length} · на ${fmt(ownedValue())}</span></div>
      </a>
    </section>
    <section class="jp-banner">
      ${pic(COMMON.crown, '👑', 'jp-crown')}
      <div>
        <div class="jp-label">Джекпот «Гранд»</div>
        <div class="jp-value">${fmt(state.jackpot)}</div>
        <div class="jp-hint">Общий для всех автоматов, растёт с каждой ставкой и всегда не меньше 500 ставок. Короны на барабанах открывают джекпот-игру: ${JACKPOTS.map((j) => j.name).join(', ')}.</div>
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
        <div class="r-tabs"><button class="r-tab on" data-by="best">Рекорд</button><button class="r-tab" data-by="wealth">Самый богатый</button></div>
        ${me.name ? '' : `<form class="name-form"><input maxlength="24" placeholder="Ваше имя в рейтинге" required><button class="btn-gold">Войти</button></form>`}
        <ol class="top5"><li class="muted">Загружаю…</li></ol>
        <button class="ctl rating-btn">Весь рейтинг</button>
      </div>
    </section>


    <section class="machines">
      ${MACHINES.map((m) => isLocked(m) ? lockedCard(m) : `
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
      <span>Богатство: <b>${fmt(state.balance + state.stats.shopSpent + ownedValue())}</b></span>
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
  app.querySelectorAll('a.mcard').forEach((a) => a.addEventListener('click', () => sfx.click()));
  app.querySelectorAll('.mcard.locked').forEach((c) => c.addEventListener('click', () => unlockModal(MACHINES.find((m) => m.id === c.dataset.id), rerender)));
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
  let by = 'best';
  const showTop = () => {
    top5.innerHTML = '<li class="muted">Загружаю…</li>';
    const want = by;
    loadTop(by).then((d) => {
      if (!top5.isConnected || want !== by) return;
      if (!d) { top5.innerHTML = '<li class="muted">Рейтинг сейчас недоступен</li>'; return; }
      const list = d.top.slice(0, 5);
      if (d.me && d.me.place > 5) list.push({ ...d.me, me: true, you: true });
      top5.innerHTML = list.map((r, i) => `<li class="${r.me ? 'me' : ''}" data-i="${i}" title="Посмотреть поместье"><i>${r.place}</i>${avMini(r.avatar)}<span>${esc(r.name)}${r.you ? ' (вы)' : ''}</span><b>${fmt(r[by])}</b></li>`).join('') || '<li class="muted">Пока никого — будьте первым!</li>';
      wireAll(top5);
      top5.querySelectorAll('li[data-i]').forEach((li) => li.addEventListener('click', () => { sfx.click(); showEstateOf(list[li.dataset.i]); }));
    });
  };
  app.querySelectorAll('.rating-card .r-tab').forEach((t) => t.addEventListener('click', () => {
    by = t.dataset.by; sfx.click();
    app.querySelectorAll('.rating-card .r-tab').forEach((x) => x.classList.toggle('on', x === t));
    showTop();
  }));
  showTop();
  $('.rating-btn').addEventListener('click', () => { sfx.click(); ratingModal(by); });
  push();

  return { destroy() { clearInterval(timer); } };
}

function lockedCard(m) {
  const can = state.balance >= m.price;
  return `
        <div class="mcard locked theme-${m.id}" data-id="${m.id}" role="button" tabindex="0">
          <div class="mcard-art" style="--img:url(${asset(`bg/${m.id}.jpg`)})">
            <img class="mcard-title" src="${asset(`${m.id}/title.webp`)}" alt="" onerror="this.remove()">
            <div class="mcard-syms">${['h1', 'wild', 'scatter'].map((id) => symPic(m, id)).join('')}</div>
            <div class="lock-veil">${pic(COMMON.lock, '🔒', 'lock-ico')}<b>${fmt(m.price)}</b><span>монет, чтобы открыть</span></div>
          </div>
          <div class="mcard-body">
            <h3>${m.title}</h3>
            <p>${m.tagline}</p>
            <p class="feat">★ Щедрее обычных автоматов — отдача выше</p>
            <p class="feat2">Бесплатные вращения: ${m.fs.text.toLowerCase()}</p>
            <span class="play ${can ? '' : 'dim'}">${can ? 'Открыть' : `Ещё ${fmt(m.price - state.balance)}`}</span>
          </div>
        </div>`;
}

// открыть автомат за монеты — навсегда
export function unlockModal(m, after) {
  sfx.click();
  const can = state.balance >= m.price;
  const { el, close } = modal(`
    <button class="x">✕</button>
    ${pic(COMMON.lock, '🔒', 'big-pic')}
    <h2>${esc(m.title)}</h2>
    <p>${esc(m.tagline)}. Автомат щедрее обычных, у него свои правила бесплатных вращений: ${esc(m.fs.text.toLowerCase())}.</p>
    <p>Открыть навсегда за <b>${fmt(m.price)}</b> монет${can ? '' : ` — не хватает ${fmt(m.price - state.balance)}`}.</p>
    <button class="btn-gold yes" ${can ? '' : 'disabled'}>Открыть за ${fmt(m.price)}</button>`, { cls: 'unlock-modal', closeOnBg: true });
  el.querySelector('.yes').addEventListener('click', () => {
    if (state.balance < m.price || state.unlocked[m.id]) return;
    state.balance -= m.price;
    state.stats.shopSpent += m.price; state.stats.shopBuys++;
    state.unlocked[m.id] = Date.now();
    save();
    track({ type: 'unlock', machine: m.id, cost: m.price });
    flush();
    sfx.fanfare();
    coinShower(2, 40);
    close();
    toast(`${pic(COMMON.trophy, '🏆', 't-ico')}<div><b>Открыт автомат «${esc(m.title)}»</b><span>Удачи!</span></div>`, 3500, 'big');
    after?.();
  });
}

const avMini = (id) => (id ? pic(asset(`avatars/${id}.webp`), '🧑', 'r-av') : '<span class="r-av none"></span>');
function showEstateOf(r) {
  estateModal({ avatar: r.avatar, showcase: r.showcase || [], name: r.name, subtitle: `Место ${r.place} · рекорд ${fmt(r.best)} · богатство ${fmt(r.wealth)}` });
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

export function ratingModal(start = 'best') {
  const { el } = modal(`
    <button class="x">✕</button>
    <h2>Рейтинг игроков</h2>
    <div class="r-tabs big"><button class="r-tab" data-by="best">Рекорд</button><button class="r-tab" data-by="wealth">Самый богатый</button></div>
    <p class="sub r-note"></p>
    <p class="sub">Нажмите на игрока — откроется его поместье.</p>
    <table class="rating"><thead><tr><th>#</th><th>Игрок</th><th>Рекорд</th><th>Богатство</th><th>Сейчас</th><th>Ур.</th></tr></thead><tbody></tbody></table>`, { cls: 'rating-modal', closeOnBg: true });
  const body = el.querySelector('tbody');
  const show = async (by) => {
    el.querySelectorAll('.r-tab').forEach((t) => t.classList.toggle('on', t.dataset.by === by));
    el.querySelector('.r-note').textContent = `Место — ${BY[by].name.toLowerCase()}: ${BY[by].note}.`;
    body.innerHTML = '<tr><td colspan="6">Загружаю…</td></tr>';
    const d = await loadTop(by);
    if (!d) { body.innerHTML = '<tr><td colspan="6">Рейтинг сейчас недоступен</td></tr>'; return; }
    const row = (r) => `<tr class="${r.me ? 'me' : ''}" data-p="${r.place}"><td>${r.place}</td><td class="r-name">${avMini(r.avatar)}${esc(r.name)}</td><td class="${by === 'best' ? 'key' : ''}">${fmt(r.best)}</td><td class="${by === 'wealth' ? 'key' : ''}">${fmt(r.wealth)}</td><td>${fmt(r.balance)}</td><td>${r.level}</td></tr>`;
    const all = d.top.concat(d.me && d.me.place > d.top.length ? [{ ...d.me, me: true }] : []);
    body.innerHTML = all.map(row).join('') || '<tr><td colspan="6">Пока никого — будьте первым!</td></tr>';
    wireAll(body);
    body.querySelectorAll('tr[data-p]').forEach((tr) => tr.addEventListener('click', () => { sfx.click(); showEstateOf(all.find((x) => String(x.place) === tr.dataset.p)); }));
  };
  el.querySelectorAll('.r-tab').forEach((t) => t.addEventListener('click', () => { sfx.click(); show(t.dataset.by); }));
  show(start);
}
