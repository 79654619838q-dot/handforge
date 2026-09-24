import { t } from '../i18n.js';
import { PLAYER } from './PlayerManager.js';

export function h(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

// Смена экранов, звуки интерфейса, баннеры. Интерфейс — HTML поверх 3D, не картинка.
export class UIManager {
  constructor(root, audio) {
    this.root = root;
    this.audio = audio;
    this.current = null;
    this.fade = document.getElementById('fade');
    let lastHover = null;
    root.addEventListener('pointerover', (e) => {
      const b = e.target.closest?.('.btn, .chip, .count, .mode-card:not(.locked), .tab, .sw');
      if (b && b !== lastHover) { lastHover = b; audio.hover(); }
      if (!b) lastHover = null;
    });
    root.addEventListener('click', (e) => { if (e.target.closest?.('.btn, .chip, .count, .tab, .sw')) audio.click(); });
  }

  async show(screen, { dip = false } = {}) {
    const old = this.current;
    this.current = screen;
    if (dip) { this.fade.classList.add('on'); await new Promise((r) => setTimeout(r, 450)); }
    if (old) { old.classList.remove('shown'); setTimeout(() => old.remove(), dip ? 0 : 600); }
    this.root.appendChild(screen);
    requestAnimationFrame(() => requestAnimationFrame(() => screen.classList.add('shown')));
    if (dip) setTimeout(() => this.fade.classList.remove('on'), 120);
  }

  dip(fn) {
    this.fade.classList.add('on');
    return new Promise((r) => setTimeout(async () => { await fn(); setTimeout(() => this.fade.classList.remove('on'), 150); r(); }, 450));
  }
}

// ---------- HUD игрового экрана ----------
export class Hud {
  constructor(screen, profileName, portrait, themeName) {
    this.screen = screen;
    this.confirmOpen = false;
    const R = 66, C = 2 * Math.PI * R;
    this.C = C;
    screen.innerHTML = `
      <div class="hud-left">
        <div class="panel stat"><div class="label">${t('round')}</div><div class="v" data-round>1 <small>/ 1</small></div></div>
        <div class="panel stat"><div class="label">${t('cellsLeft')}</div><div class="v" data-cells>0</div></div>
        <div class="panel stat"><div class="label">${t('theme')}</div><div class="v" style="font-size:16px;letter-spacing:.08em;font-family:var(--font-ui);font-weight:700">${themeName}</div></div>
      </div>
      <div class="timer idle">
        <div class="ring">
          <svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${R}" fill="rgba(0,0,0,.45)" stroke="rgba(217,178,95,.15)" stroke-width="6"/>
          <circle data-arc cx="75" cy="75" r="${R}" fill="none" stroke="#f6dc97" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0" style="filter:drop-shadow(0 0 6px #d9b25f)"/></svg>
          <div class="t" data-time>00:30</div>
        </div>
      </div>
      <div class="hud-right panel">
        <div class="portrait" style="background-image:url(${portrait})"></div>
        <div class="pname">${profileName}</div>
        <div class="status alive" data-status>${t('inGame')}</div>
      </div>
      <div class="hint" data-hint></div>
      <button class="btn ghost hud-exit hit" data-exit>${t('leave')}</button>`;
    this.q = (s) => screen.querySelector(s);
    this.timerEl = this.q('.timer');
    this.arc = this.q('[data-arc]');
  }

  setRound(r, total) { this.q('[data-round]').innerHTML = `${Math.max(1, r)} <small>/ ${total}</small>`; }
  setCells(n) { this.q('[data-cells]').textContent = n; }
  setHint(s) { const e = this.q('[data-hint]'); e.style.opacity = 0; setTimeout(() => { e.textContent = s; e.style.opacity = 1; }, 200); }

  setTimer(sec) {
    this.q('[data-time]').textContent = `00:${String(sec).padStart(2, '0')}`;
    this.timerEl.classList.toggle('warn', sec <= 15 && sec > 10);
    this.timerEl.classList.toggle('crit', sec <= 10);
    const col = sec <= 10 ? '#ff3b3b' : sec <= 15 ? '#ffb347' : '#f6dc97';
    this.arc.setAttribute('stroke', col);
    // перезапуск анимации «удара» каждую секунду
    const tt = this.q('[data-time]'); tt.style.animation = 'none'; void tt.offsetWidth; tt.style.animation = '';
  }
  setTimerFrac(f) { this.arc.setAttribute('stroke-dashoffset', String(this.C * (1 - f))); }
  timerActive(on) { this.timerEl.classList.toggle('idle', !on); if (!on) this.timerEl.classList.remove('warn', 'crit'); }

  setStatus(s) {
    const e = this.q('[data-status]');
    e.className = 'status ' + (s === PLAYER.ALIVE ? 'alive' : s === PLAYER.WINNER ? 'win' : 'out');
    e.textContent = s === PLAYER.ALIVE ? t('inGame') : s === PLAYER.WINNER ? t('winner') : t('out');
  }

  banner(text, kind = '', sub = '', dur = 2) {
    const b = document.createElement('div');
    b.className = `banner ${kind}`;
    b.innerHTML = `<div class="band"><h1 class="title">${text}</h1>${sub ? `<div class="kicker sub">${sub}</div>` : ''}</div>`;
    this.screen.appendChild(b);
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 500); }, dur * 1000);
  }

  confirm() {
    this.closeConfirm();
    this.confirmOpen = true;
    return new Promise((resolve) => {
      const w = document.createElement('div');
      w.className = 'modal-wrap hit';
      w.innerHTML = `<div class="modal panel"><h2 class="title">${t('confirmQ')}</h2><div class="label">&nbsp;</div>
        <div class="btns"><button class="btn primary" data-ok>${t('confirm')}</button><button class="btn" data-no>${t('cancel')}</button></div></div>`;
      const done = (v) => { this.confirmOpen = false; w.remove(); this._close = null; window.removeEventListener('keydown', this._keys); resolve(v); };
      w.querySelector('[data-ok]').onclick = () => done(true);
      w.querySelector('[data-no]').onclick = () => done(false);
      w.addEventListener('pointerdown', (e) => { if (e.target === w) done(false); });
      this._keys = (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
      window.addEventListener('keydown', this._keys);
      this._close = () => done(false);
      this.screen.appendChild(w);
    });
  }

  closeConfirm() {
    window.removeEventListener('keydown', this._keys);
    this._close?.();
  }
}
