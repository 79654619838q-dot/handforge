// Раздел «Моё поместье» (#/estate): картинка из купленного, смена аватара, что стоит на картинке.
import { asset, COMMON } from './machines.js';
import { state, ownedValue, wealth } from './state.js';
import { fmt, pic, wireAll, topRight, wireTop } from './ui.js';
import { LUX_ITEMS } from './luxury.js';
import { levelInfo } from './meta.js';
import { push, player } from './rating.js';
import { estateHtml, showcaseOf, chooseAvatar, showcaseList } from './estate.js';

export function estateScreen(app, { onLevel }) {
  app.innerHTML = `
  <div class="screen estate-screen">
    <div class="bg" style="--img:url(${asset('bg/lux.jpg')})"></div>
    <header class="top">
      <a class="icon-btn back" href="#/" title="В лобби">←</a>
      <div class="lux-title">${pic(COMMON.trophy, '🏆', 'lt-ico')}<span>Моё поместье</span></div>
      <div class="top-right">${topRight()}</div>
    </header>
    <section class="estate-box"></section>
    <div class="es-actions">
      <button class="ctl es-av"></button>
      <a class="btn-gold es-shop" href="#/lux">${pic(COMMON.wealth, '💎', 'btn-ico')} Магазин роскоши</a>
    </div>
    <section class="es-info"></section>
  </div>`;
  wireAll(app);
  wireTop(app, { levelInfo, onLevel });
  const $ = (s) => app.querySelector(s);

  function render() {
    const show = showcaseOf(state.owned);
    $('.estate-box').innerHTML = estateHtml({
      avatar: state.avatar, showcase: show, name: player().name || 'Моё поместье',
      subtitle: `Уровень ${state.level} · богатство ${fmt(wealth())}`, mine: true,
    });
    $('.es-av').textContent = state.avatar ? 'Сменить аватар' : 'Выбрать аватар';
    const n = Object.keys(state.owned).length;
    $('.es-info').innerHTML = `
      <p>Куплено <b>${n} из ${LUX_ITEMS.length}</b> на <b>${fmt(ownedValue())}</b>. На картинке — самое дорогое из каждого раздела: дом или остров становится фоном, остальное встаёт рядом с вами.</p>
      <div class="es-list">${showcaseList(show) || '<em>Пока ничего не куплено</em>'}</div>`;
    wireAll(app);
    app.querySelector('.estate .es-noav')?.addEventListener('click', pick);
  }
  const pick = () => chooseAvatar(() => { push(true); render(); });
  $('.es-av').addEventListener('click', pick);
  render();
  return { destroy() {} };
}
