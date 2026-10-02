// Экран «Магазин роскоши»: купить за монеты, продать за ту же цену, посмотреть свои владения.
import { asset, COMMON } from './machines.js';
import { state, save, ownedValue, wealth } from './state.js';
import { sfx } from './audio.js';
import { fmt, esc, pic, wireAll, hud, topRight, wireTop, toast, coinShower } from './ui.js';
import { LUX_CATS, LUX_ITEMS } from './luxury.js';
import { levelInfo, track, flush } from './meta.js';
import { push } from './rating.js';

const owns = (id) => state.owned[id] !== undefined;

export function luxScreen(app, { onLevel }) {
  let tab = sessionTab() || 'cars';
  app.innerHTML = `
  <div class="screen lux">
    <div class="bg" style="--img:url(${asset('bg/lux.jpg')})"></div>
    <header class="top">
      <a class="icon-btn back" href="#/" title="В лобби">←</a>
      <div class="lux-title">${pic(COMMON.wealth, '💎', 'lt-ico')}<span>Магазин роскоши</span></div>
      <div class="top-right">${topRight()}</div>
    </header>
    <section class="lux-sum"></section>
    <nav class="lux-tabs"></nav>
    <section class="lux-grid"></section>
  </div>`;
  wireAll(app);
  wireTop(app, { levelInfo, onLevel });
  const $ = (s) => app.querySelector(s);
  const sum = $('.lux-sum'), tabs = $('.lux-tabs'), grid = $('.lux-grid');

  function renderSum() {
    const n = Object.keys(state.owned).length;
    sum.innerHTML = `
      <div><span>Ваши владения</span><b>${n} из ${LUX_ITEMS.length}</b></div>
      <div><span>Стоимость владений</span><b>${fmt(ownedValue())}</b></div>
      <div><span>Богатство в рейтинге</span><b>${fmt(wealth())}</b></div>
      <p>Всё купленное можно продать обратно за ту же цену. Владения считаются в рейтинге «Самый богатый».</p>`;
  }

  function renderTabs() {
    const cnt = (c) => c.items.filter((it) => owns(it.id)).length;
    tabs.innerHTML = [`<button class="lux-tab ${tab === 'mine' ? 'on' : ''}" data-t="mine">⭐ Мои <i>${Object.keys(state.owned).length}</i></button>`]
      .concat(LUX_CATS.map((c) => `<button class="lux-tab ${tab === c.id ? 'on' : ''}" data-t="${c.id}">${c.emoji} ${c.name} <i>${cnt(c)}/${c.items.length}</i></button>`)).join('');
    tabs.querySelectorAll('.lux-tab').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.t; sfx.click(); sessionTab(tab);
      renderTabs(); renderGrid();
      grid.scrollIntoView({ block: 'nearest' });
    }));
  }

  function card(it) {
    const mine = owns(it.id);
    const can = state.balance >= it.price;
    const btn = mine
      ? `<button class="ctl sell" data-id="${it.id}">Продать за ${fmt(state.owned[it.id])}</button>`
      : `<button class="btn-gold buy-lux" data-id="${it.id}" ${can ? '' : 'disabled'}>${can ? 'Купить' : `Не хватает ${fmt(it.price - state.balance)}`}</button>`;
    return `<div class="lux-card ${mine ? 'mine' : ''}">
      ${mine ? '<span class="own-badge">Ваше</span>' : ''}
      <div class="lux-pic">${pic(it.img, LUX_CATS.find((c) => c.id === it.cat).emoji)}</div>
      <b>${esc(it.name)}</b>
      <span class="lux-price">${pic(COMMON.coin, '🪙', 'lp-coin')}${fmt(it.price)}</span>
      ${btn}
    </div>`;
  }

  function renderGrid() {
    const list = tab === 'mine'
      ? LUX_ITEMS.filter((it) => owns(it.id)).sort((a, b) => b.price - a.price)
      : LUX_CATS.find((c) => c.id === tab).items.map((it) => LUX_ITEMS.find((x) => x.id === it.id));
    grid.innerHTML = list.length ? list.map(card).join('') : '<p class="lux-empty">Пока ничего нет — загляните в разделы и купите первую вещь.</p>';
    wireAll(grid);
    grid.querySelectorAll('.buy-lux').forEach((b) => b.addEventListener('click', () => buy(b.dataset.id)));
    grid.querySelectorAll('.sell').forEach((b) => b.addEventListener('click', () => sell(b.dataset.id)));
  }

  function refresh() { renderSum(); renderTabs(); renderGrid(); hud.bal.set(state.balance, 500); push(); }

  function buy(id) {
    const it = LUX_ITEMS.find((x) => x.id === id);
    if (!it || owns(id) || state.balance < it.price) return;
    state.balance -= it.price;
    state.owned[id] = it.price;
    state.stats.luxBuys++;
    state.stats.luxBest = Math.max(state.stats.luxBest, it.price);
    save();
    sfx.coins();
    if (it.price >= 1e6) coinShower(1.5, 30);
    toast(`${pic(it.img, '🛍️', 't-ico')}<div><b>Куплено: ${esc(it.name)}</b><span>за ${fmt(it.price)} монет</span></div>`, 2800);
    track({ type: 'lux', cost: it.price });
    flush();
    refresh();
  }

  function sell(id) {
    const it = LUX_ITEMS.find((x) => x.id === id);
    if (!it || !owns(id)) return;
    const price = state.owned[id];
    state.balance += price;
    delete state.owned[id];
    state.stats.luxSells++;
    save();
    sfx.bet(false);
    toast(`<div><b>Продано: ${esc(it.name)}</b><span>+${fmt(price)} монет</span></div>`, 2400);
    refresh();
  }

  refresh();
  return { destroy() {} };
}

// какой раздел был открыт — на время вкладки браузера
function sessionTab(v) {
  try {
    if (v) sessionStorage.setItem('slots.luxTab', v);
    return sessionStorage.getItem('slots.luxTab');
  } catch { return null; }
}
