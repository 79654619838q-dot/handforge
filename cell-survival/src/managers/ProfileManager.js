import { h } from './UIManager.js';
import { t, getLang } from '../i18n.js';
import { CATALOG, LABELS, BACKGROUNDS, PEOPLE, randomProfile } from './AvatarManager.js';
import { HEROES, emblemCanvas } from './heroes.js';
import { ASSETS, ART_V } from '../paths.js';

const lbl = (v) => (getLang() === 'ru' ? LABELS.ru[v] : null) || (v[0].toUpperCase() + v.slice(1));

// Редактор постоянного аватара: реалистичный человек (PEOPLE) + аксессуары (CATALOG) + фон + имя.
export class ProfileManager {
  constructor(game) { this.game = game; }

  screen(world, firstRun) {
    const { save } = this.game;
    const draft = { ...(save.profile || randomProfile('')) };
    // старые сохранения — без выбранного человека: подбираем по полу
    if (!draft.person) draft.person = (PEOPLE.find((x) => x.gender === draft.gender) || PEOPLE[0]).id;
    const s = h('div', 'screen');
    s.id = 'profile';
    let tab = 'hero';
    const heroIcon = new Map(HEROES.map((hr) => [hr.id, emblemCanvas(hr.emblem, hr.glow, 128).toDataURL()]));

    const TABS = {
      person: [
        ['gender', 'chips', CATALOG.gender, (v) => t(v)],
        ['person', 'people', PEOPLE],
      ],
      look: [
        ['outfit', 'tint', CATALOG.outfit],
      ],
      acc: [
        ['headwear', 'chips', CATALOG.headwear],
        ['eyewear', 'chips', CATALOG.eyewear],
        ['headphones', 'chips', CATALOG.headphones],
        ['earrings', 'chips', CATALOG.earrings],
        ['scarf', 'chips', CATALOG.scarf],
        ['chain', 'chips', CATALOG.chain],
        ['watch', 'chips', CATALOG.watch],
        ['backpack', 'chips', CATALOG.backpack],
      ],
      bg: [['background', 'bg', CATALOG.background]],
    };

    s.innerHTML = `
      <div class="topbar"><h1 class="title">${t('avatarTitle')}</h1><div class="spacer"></div>${firstRun ? '' : `<button class="btn ghost" data-back>${t('back')}</button>`}</div>
      <div class="nameplate"><div class="kicker">${t('profile')}</div><h2 class="title" data-np></h2></div>
      <div class="editor panel">
        <div class="tabs">
          <button class="tab" data-t="hero">${t('tabHero')}</button><button class="tab" data-t="person">${t('tabPerson')}</button><button class="tab" data-t="look">${t('tabColors')}</button>
          <button class="tab" data-t="acc">${t('tabAcc')}</button><button class="tab" data-t="bg">${t('tabBg')}</button><button class="tab" data-t="name">${t('tabName')}</button>
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
          <div class="cap"><b>${hr[lang]}</b><span>${hr.tag[lang]}</span></div></div>`).join('')}</div>
          <button class="chip ${!draft.hero || draft.hero === 'none' ? 'on' : ''}" data-hero="none" style="margin-top:12px">${t('noHero')}</button>`;
        return;
      }
      body.innerHTML = TABS[tab].map(([key, kind, opts, fmt, title]) => {
        const label = `<span class="label">${t(title || key)}</span>`;
        if (kind === 'chips') return `<div class="field">${label}<div class="chips">${opts.map((v) => `<button class="chip ${String(draft[key] ?? (key === 'skinTone' ? '0' : 'none')) === String(v) ? 'on' : ''}" data-k="${key}" data-v="${v}">${fmt ? fmt(v) : lbl(v)}</button>`).join('')}</div></div>`;
        if (kind === 'people') return `<div class="field">${label}<div class="people">${opts.filter((x) => x.gender === draft.gender).map((x) => `<div class="person ${draft.person === x.id ? 'on' : ''}" data-k="person" data-v="${x.id}"><img src="${ASSETS}avatar/people/${x.id}/preview.png" alt="" loading="lazy"><span>${lbl(x.style)}</span></div>`).join('')}</div></div>`;
        if (kind === 'tint') return `<div class="field">${label}<div class="swatches">${opts.map((v) => `<div class="sw ${(draft[key] || 'orig') === v ? 'on' : ''}" title="${lbl(v)}" data-k="${key}" data-v="${v}" style="background:${v === 'orig' ? 'conic-gradient(#c49a5a,#1c2a4a,#6b0f1a,#e8e4da,#c49a5a)' : v}"></div>`).join('')}</div></div>`;
        if (kind === 'swatch') return `<div class="field">${label}<div class="swatches">${opts.map((v) => `<div class="sw ${draft[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}" style="background:${v}"></div>`).join('')}</div></div>`;
        return `<div class="field">${label}<div class="swatches">${opts.map((v) => { const b = BACKGROUNDS[v]; return `<div class="sw ${draft[key] === v ? 'on' : ''}" title="${lbl(v)}" data-k="${key}" data-v="${v}" style="width:64px;height:64px;background:radial-gradient(circle at 50% 35%, ${b[0]}, ${b[1]});box-shadow:inset 0 -3px 0 ${b[2]}"></div>`; }).join('')}</div></div>`;
      }).join('');
    };

    body.onclick = (e) => {
      const hc = e.target.closest('[data-hero]');
      if (hc) {
        const hr = HEROES.find((x) => x.id === hc.dataset.hero);
        draft.hero = hr ? hr.id : 'none';
        if (hr) { draft.person = hr.person; draft.gender = hr.gender; }
        this.game.audio.select?.();
        render(); world.setProfile(draft);
        return;
      }
      const el = e.target.closest('[data-k]'); if (!el) return;
      draft[el.dataset.k] = el.dataset.v;
      if (el.dataset.k === 'person' || el.dataset.k === 'gender') draft.hero = 'none'; // выбрал обычного человека — уже не герой
      if (el.dataset.k === 'gender' && PEOPLE.find((x) => x.id === draft.person)?.gender !== draft.gender) {
        draft.person = PEOPLE.find((x) => x.gender === draft.gender).id; // пол сменился — первый человек этого пола
      }
      render();
      world.setProfile(draft);
    };
    s.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('.tab'); if (b) { tab = b.dataset.t; render(); } };
    s.querySelector('[data-rand]').onclick = () => {
      const r = randomProfile(draft.name);
      Object.assign(draft, r);
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
