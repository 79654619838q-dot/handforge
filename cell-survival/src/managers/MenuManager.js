import { h } from './UIManager.js';
import { t, setLang } from '../i18n.js';
import { THEMES, THEME_IDS } from '../scene/themes.js';
import { getLang } from '../i18n.js';
import { ASSETS } from '../paths.js';

// Главное меню и настройки.
export class MenuManager {
  constructor(game) { this.game = game; }

  menuScreen() {
    const { save } = this.game;
    const s = h('div', 'screen vignette');
    s.id = 'menu';
    const best = save.data.best.percent;
    s.innerHTML = `
      <div class="brand stagger">
        <div class="kicker">Hand Forge presents</div>
        <h1 class="title">Cell<br>Survival</h1>
        <div class="label sub">${t('tagline')}</div>
      </div>
      <nav class="stagger">
        <button class="btn primary" data-a="play"><span class="num">I</span>${t('play')}</button>
        <button class="btn" data-a="profile"><span class="num">II</span>${t('profile')}</button>
        <button class="btn" data-a="settings"><span class="num">III</span>${t('settings')}</button>
        <button class="btn" data-a="exit"><span class="num">IV</span>${t('exit')}</button>
      </nav>
      ${best !== null ? `<div class="best">${t('best')}<b>${best}%</b></div>` : ''}
      <div class="foot">v0.1 · ${save.profile ? save.profile.name : ''}</div>`;
    s.querySelector('nav').onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'play') this.game.goModes();
      if (a === 'profile') this.game.goProfile(false);
      if (a === 'settings') this.game.goSettings();
      if (a === 'exit') this.exit(s);
    };
    return s;
  }

  // Браузер не даёт вкладке закрыть саму себя, если её открыл не скрипт.
  exit(s) {
    window.close();
    setTimeout(() => {
      const n = h('div', 'label', t('exitHint'));
      n.style.cssText = 'position:absolute;bottom:60px;left:8vw;color:var(--gold-hi)';
      s.appendChild(n);
      setTimeout(() => n.remove(), 3000);
    }, 200);
  }

  settingsScreen() {
    const { save, audio, stage } = this.game;
    const st = save.settings;
    const s = h('div', 'screen vignette');
    s.id = 'settings';
    const chips = (key, opts) => `<div class="chips" data-k="${key}">${opts.map(([v, l]) => `<button class="chip ${String(st[key]) === String(v) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
    s.innerHTML = `
      <div class="topbar"><h1 class="title">${t('settings')}</h1><div class="spacer"></div><button class="btn ghost" data-back>${t('back')}</button></div>
      <div class="panel">
        <div class="row"><span class="label">${t('music')}</span><input type="range" min="0" max="1" step="0.05" value="${st.music}" data-r="music"></div>
        <div class="row"><span class="label">${t('sfx')}</span><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-r="sfx"></div>
        <div class="row"><span class="label">${t('fullscreen')}</span>${chips('fullscreen', [[true, t('on')], [false, t('off')]])}</div>
        <div class="row"><span class="label">${t('resolution')}</span>${chips('renderScale', [[1, '100%'], [0.75, '75%'], [0.5, '50%']])}</div>
        <div class="row"><span class="label">${t('quality')}</span>${chips('quality', [['high', t('high')], ['low', t('low')]])}</div>
        <div class="row"><span class="label">${t('lang')}</span>${chips('lang', [['ru', 'Русский'], ['en', 'English']])}</div>
        <div class="row" style="flex-wrap:wrap"><span class="label">${t('fieldTheme')}</span>${chips('theme', [['random', t('randomTheme')], ...THEME_IDS.map((id) => [id, THEMES[id].name[getLang()].split(' — ')[0]])])}</div>
      </div>`;
    s.querySelectorAll('input[type=range]').forEach((r) => r.oninput = () => {
      save.setSetting(r.dataset.r, parseFloat(r.value));
      audio.applyVolumes();
      if (r.dataset.r === 'sfx') audio.select();
    });
    s.querySelectorAll('.chips').forEach((c) => c.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      const k = c.dataset.k;
      let v = b.dataset.v;
      if (v === 'true' || v === 'false') v = v === 'true';
      else if (!isNaN(parseFloat(v))) v = parseFloat(v);
      save.setSetting(k, v);
      c.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
      if (k === 'fullscreen') {
        if (v) document.documentElement.requestFullscreen?.().catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen();
      }
      if (k === 'renderScale' || k === 'quality') stage.applySettings(save.settings);
      if (k === 'lang') { setLang(v); this.game.goSettings(); }
    });
    s.querySelector('[data-back]').onclick = () => this.game.goMenu();
    return s;
  }
}
