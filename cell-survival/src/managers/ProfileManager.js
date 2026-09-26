import { h } from './UIManager.js';
import { t, getLang } from '../i18n.js';
import { randomProfile } from './AvatarManager.js';
import { HEROES, emblemCanvas, heroProfile } from './heroes.js';
import { ASSETS, ART_V } from '../paths.js';


// Редактор постоянного аватара: реалистичный человек (PEOPLE) + аксессуары (CATALOG) + фон + имя.
export class ProfileManager {
  constructor(game) { this.game = game; }

  screen(world, firstRun) {
    const { save } = this.game;
    // играть можно только героями (решение оператора 26.09): у старых сохранений без героя — случайный герой
    const draft = { ...(save.profile || randomProfile('')) };
    if (!HEROES.some((x) => x.id === draft.hero)) Object.assign(draft, heroProfile(HEROES[Math.floor(Math.random() * HEROES.length)].id));
    const s = h('div', 'screen');
    s.id = 'profile';
    let tab = 'hero';
    const heroIcon = new Map(HEROES.map((hr) => [hr.id, emblemCanvas(hr.emblem, hr.glow, 128).toDataURL()]));


    s.innerHTML = `
      <div class="topbar"><h1 class="title">${t('avatarTitle')}</h1><div class="spacer"></div>${firstRun ? '' : `<button class="btn ghost" data-back>${t('back')}</button>`}</div>
      <div class="nameplate"><div class="kicker">${t('profile')}</div><h2 class="title" data-np></h2></div>
      <div class="editor panel">
        <div class="tabs">
          <button class="tab" data-t="hero">${t('tabHero')}</button><button class="tab" data-t="name">${t('tabName')}</button>
        </div>
        <div class="body" data-body></div>
        <div class="actions"><button class="btn" data-rand>${t('random')}</button><button class="btn primary" data-go>${t('continue')}</button></div>
      </div>`;
    const body = s.querySelector('[data-body]');
    const np = s.querySelector('[data-np]');
    const refreshName = () => { np.textContent = draft.name || '—'; };

    const render = () => {
      s.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      if (tab === 'name') {
        body.innerHTML = `<div class="field"><span class="label">${t('name')}</span><input class="input" maxlength="16" placeholder="${t('namePlaceholder')}" value="${(draft.name || '').replace(/"/g, '&quot;')}"></div>`;
        const inp = body.querySelector('input');
        inp.oninput = () => { draft.name = inp.value.trim(); refreshName(); inp.style.borderColor = ''; };
        setTimeout(() => inp.focus(), 50);
        return;
      }
      if (tab === 'hero') {
        const lang = getLang() === 'ru' ? 'ru' : 'en';
        // арт героя (нарисован в ChatGPT) во всю карточку, эмблема — маленький знак в углу
        body.innerHTML = `<div class="heroes">${HEROES.map((hr) => `<div class="hero-card ${draft.hero === hr.id ? 'on' : ''}" data-hero="${hr.id}" style="--hc:${hr.glow}">
          <img class="art" src="${ASSETS}heroes/${hr.id}.jpg${ART_V}" alt="" loading="lazy"><img class="emb" src="${heroIcon.get(hr.id)}" alt="">
          <div class="cap"><b>${hr[lang]}</b><span>${hr.tag[lang]}</span></div></div>`).join('')}</div>`;
        return;
      }
    };

    body.onclick = (e) => {
      const hc = e.target.closest('[data-hero]');
      if (!hc) return;
      Object.assign(draft, heroProfile(hc.dataset.hero));
      this.game.audio.select?.();
      render();
      world.setProfile(draft);
    };
    s.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('.tab'); if (b) { tab = b.dataset.t; render(); } };
    s.querySelector('[data-rand]').onclick = () => {
      Object.assign(draft, heroProfile(HEROES[Math.floor(Math.random() * HEROES.length)].id));
      render(); world.setProfile(draft);
    };
    s.querySelector('[data-go]').onclick = () => {
      if (!draft.name) { tab = 'name'; render(); const i = body.querySelector('input'); i.style.borderColor = 'var(--danger)'; return; }
      save.setProfile({ ...draft });
      this.game.audio.confirm();
      firstRun ? this.game.goModes() : this.game.goMenu();
    };
    s.querySelector('[data-back]')?.addEventListener('click', () => this.game.goMenu());

    render(); refreshName();
    world.setProfile(draft);
    return s;
  }
}
