// Новые испытания: «Стрельба вслепую», «Бомба», «Очко», «Русская рулетка».
// Всё управление — HTML/canvas поверх задника темы; выбывание — общая кино-сцена FlatView.playOut.
import { t } from '../../i18n.js';
import { FlatView } from './flat.js';
import { confirmBox } from './common.js';
import { esc, portraitOf } from '../MatchView.js';
import { handValue } from '../../../shared/match.js';
import { wait } from '../../scene/tween.js';

// ---------- 8. Стрельба вслепую ----------
// Шаг 1: нажмите в зоне — там вы встанете (подтвердить). Шаг 2: поставьте метку выстрела (подтвердить).
export class ShootView extends FlatView {
  holdSec = 0; // итог показывается своей анимацией
  render(st) {
    this.st = st;
    const size = innerWidth < 760 ? Math.min(innerHeight * 0.5, innerWidth * 0.88) : Math.min(innerHeight * (innerHeight < 500 ? 0.5 : 0.6), innerWidth * 0.44);
    const can = st.phase === 'act' && this.canAct(st);
    const kick = st.phase === 'act' ? (can ? (this.posOk ? t('pickMark') : t('pickSpot')) : this.alive(st) ? t('waitOthers') : '') : '';
    this.el.innerHTML = `<div class="cv-card panel hit cv-canvas-card"><div class="cv-kick">${kick}</div>
      <canvas width="1000" height="1000" style="width:${size}px;height:${size}px" data-c></canvas>
      ${st.phase === 'reveal' ? this.outNames(st) : ''}</div>`;
    const c = this.el.querySelector('[data-c]');
    this.draw(c, st, 1);
    c.onclick = async (e) => {
      if (!this.canAct(this.st) || this.busy) return;
      const r = c.getBoundingClientRect();
      const pt = [((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1];
      const zone = this.st.data?.zone ?? 1;
      if (Math.hypot(pt[0], pt[1]) > zone) { const k = zone / Math.hypot(pt[0], pt[1]) * 0.98; pt[0] *= k; pt[1] *= k; } // за краем — к краю зоны
      this.busy = true;
      if (!this.posOk) {
        this.pos = pt; this.draw(c, this.st, 1); this.audio.select();
        if (await confirmBox(this.root, t('confirmSpot'))) { this.posOk = true; this.audio.confirm(); } else this.pos = null;
      } else {
        this.mark = pt; this.draw(c, this.st, 1); this.audio.charge();
        if (await confirmBox(this.root, t('confirmMark')) && this.canAct(this.st)) { this.act({ pos: this.pos, mark: this.mark }); this.audio.confirm(); } else this.mark = null;
      }
      this.busy = false;
      this.render(this.st);
    };
  }
  update(st, changed) {
    if (changed && st.phase === 'act') { this.pos = null; this.mark = null; this.posOk = false; }
    if (st.phase === 'reveal' && changed) { this.st = st; this.animateReveal(st); return; }
    if (this.fxBusy) return;
    if (changed && st.phase !== 'reveal' && this.cine) this.clearFx();
    if (changed || (st.phase === 'act' && !this.canAct(st) && this.el.querySelector('.cv-kick')?.textContent !== t('waitOthers'))) this.render(st);
  }
  // раскрытие: все появляются, метки накрывают поле, потом — сцена выбывания
  async animateReveal(st) {
    this.fxBusy = true;
    this.el.innerHTML = '';
    this.render(st);
    const c = this.el.querySelector('[data-c]');
    const t0 = performance.now();
    this.audio.charge();
    await new Promise((res) => {
      const step = () => { const k = Math.min(1, (performance.now() - t0) / 1500); this.draw(c, st, k); if (k < 1) requestAnimationFrame(step); else res(); };
      step();
    });
    this.audio.destroy();
    await new Promise((r) => setTimeout(r, 1300));
    this.fxBusy = false;
    this.playOut(st);
  }
  draw(c, st, k) {
    if (!c) return;
    const g = c.getContext('2d');
    const P = (x, y) => [(x + 1) * 500, (y + 1) * 500];
    g.clearRect(0, 0, 1000, 1000);
    const r = st.reveal;
    const zone = r?.zone ?? st.data?.zone ?? 1, rad = (r?.radius ?? st.data?.radius ?? 0.15) * 500;
    g.beginPath(); g.arc(500, 500, zone * 500, 0, Math.PI * 2);
    g.fillStyle = 'rgba(20,16,30,.8)'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#d9b25f'; g.stroke();
    const person = (x, y, col, label) => {
      g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = 4; g.strokeStyle = '#000'; g.stroke();
      if (label) { g.font = '600 32px Rajdhani, sans-serif'; g.fillStyle = '#fff'; g.fillText(label, x + 28, y - 18); }
    };
    const target = (x, y, col, scale = 1) => {
      g.strokeStyle = col; g.lineWidth = 5; g.beginPath(); g.arc(x, y, rad * scale, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - 26, y); g.lineTo(x + 26, y); g.moveTo(x, y - 26); g.lineTo(x, y + 26); g.stroke();
    };
    if (st.phase !== 'reveal') {
      const mine = st.mine;
      const pos = mine?.pos || this.pos, mark = mine?.mark || this.mark;
      if (mark) { const [x, y] = P(...mark); g.fillStyle = 'rgba(255,59,42,.15)'; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); target(x, y, '#ff5a3a'); }
      if (pos) { const [x, y] = P(...pos); person(x, y, '#f6dc97', t('you')); }
      return;
    }
    if (!r?.pos) return;
    const hit = new Set(r.eliminated || []);
    for (const [id, m] of Object.entries(r.marks)) { const [x, y] = P(...m); g.fillStyle = `rgba(255,59,42,${0.18 * k})`; g.beginPath(); g.arc(x, y, rad * k, 0, Math.PI * 2); g.fill(); target(x, y, id === this.myId ? '#f6dc97' : 'rgba(255,90,58,.8)', k); }
    for (const [id, pos] of Object.entries(r.pos)) { const [x, y] = P(...pos); person(x, y, k >= 1 && hit.has(id) ? '#ff3b2a' : id === this.myId ? '#f6dc97' : '#a78bfa', this.name(st, id)); }
  }
}

// ---------- 9. Бомба ----------
export class BombView extends FlatView {
  constructor(ctx) { super(ctx); this.beepAt = 0; }
  render(st) {
    this.st = st;
    const v = st.visible || {};
    const holder = v.holder;
    const mine = holder === this.myId && this.canAct(st);
    const alive = new Set(st.alive || []);
    const tiles = st.players.filter((p) => alive.has(p.id)).map((p) => `<button class="bm-tile hit ${p.id === holder ? 'hot' : ''} ${p.id === this.myId ? 'me' : ''}" data-p="${p.id}" ${mine && p.id !== this.myId ? '' : 'disabled'}>
      <img alt=""><b>${esc(p.name)}</b>${p.id === holder ? '<span class="bm-bomb">💣</span>' : ''}</button>`).join('');
    const kick = st.phase === 'act' ? (mine ? t('passBomb') : holder ? `${t('bombAt')}: ${esc(this.name(st, holder))}` : '') : '';
    this.el.innerHTML = `<div class="cv-card panel hit"><div class="cv-kick ${mine ? 'danger' : ''}">${kick}</div><div class="bm-grid">${tiles}</div>
      ${st.phase === 'reveal' ? this.outNames(st) : `<div class="cv-note">${t('bombNoTimer')}</div>`}</div>`;
    this.el.querySelectorAll('.bm-tile').forEach((b) => {
      portraitOf(st.players.find((p) => p.id === b.dataset.p)?.profile).then((u) => { const i = b.querySelector('img'); if (i && u) i.src = u; });
      b.onclick = () => { if (!mine) return; this.act({ to: b.dataset.p }).then((r) => { if (r?.ok) this.audio.select(); else this.audio.click(); }); };
    });
  }
  update(st, changed) {
    const prev = this.st?.visible?.holder;
    if (st.phase === 'reveal' && changed) return this.playOut(st);
    if (this.fxBusy) return;
    if (changed && st.phase !== 'reveal' && this.cine) this.clearFx();
    if (changed || st.visible?.holder !== prev) this.render(st);
  }
  // пока бомба у тебя — тиканье ускоряется, но настоящего времени никто не знает
  frame(now) {
    const st = this.st;
    if (st?.phase !== 'act' || st.visible?.holder !== this.myId) return;
    const held = now - (st.visible.since || now);
    const gap = Math.max(160, 900 - held * 0.12);
    if (now - this.beepAt > gap) { this.beepAt = now; this.audio.tick(); this.el.querySelector('.bm-tile.hot')?.classList.toggle('blink'); }
  }
}

// ---------- 10. Очко ----------
const cardHtml = (c, hidden = false) => {
  if (hidden) return `<div class="pc back"></div>`;
  const r = c.slice(0, -1), s = c.slice(-1);
  return `<div class="pc ${'♥♦'.includes(s) ? 'red' : ''}"><b>${r}</b><i>${s}</i></div>`;
};
export class CardsView extends FlatView {
  holdSec = 0; // итог показывается своей анимацией
  render(st) {
    this.st = st;
    const v = st.visible || {};
    const mine = v.hands?.[this.myId] || [];
    const val = mine.length ? handValue(mine) : 0;
    let body;
    if (st.phase === 'reveal' && st.reveal?.results) {
      const r = st.reveal, out = new Set(r.eliminated);
      body = `<div class="cv-kick">${t('dealer')} · ${r.dealerValue}${r.dealerValue > 21 ? ' — ' + t('bust') : ''}</div><div class="pc-row">${r.dealer.map((c) => cardHtml(c)).join('')}</div>
        <table class="m-table cv-table">${Object.entries(r.results).map(([id, x]) => `<tr class="${out.has(id) ? 'out' : ''} ${id === this.myId ? 'me' : ''}"><td>${esc(this.name(st, id))}</td><td>${x.cards.join(' ')}</td><td>${x.value}${x.value > 21 ? ' ✕' : ''}</td></tr>`).join('')}</table>${this.outNames(st)}`;
    } else {
      const stood = v.stood?.[this.myId];
      body = `<div class="cv-kick">${t('dealer')}</div><div class="pc-row">${st.data?.up ? cardHtml(st.data.up) + cardHtml('', true) : ''}</div>
        <div class="cv-kick" style="margin-top:14px">${t('yourHand')} · <b style="color:var(--gold-hi)">${val}</b>${val > 21 ? ' — ' + t('bust') : ''}</div><div class="pc-row">${mine.map((c) => cardHtml(c)).join('')}</div>
        ${this.canAct(st) && !stood ? `<div class="rm-actions"><button class="btn primary" data-hit>${t('hit')}</button><button class="btn" data-stand>${t('stand')}</button></div>` : `<div class="cv-note">${this.alive(st) ? t('waitOthers') : ''}</div>`}
        <div class="pc-others">${Object.entries(v.hands || {}).filter(([id]) => id !== this.myId).map(([id, h]) => `<span>${esc(this.name(st, id))}: ${h.length} ${t('cardsN')}${v.stood?.[id] ? ' ✓' : ''}</span>`).join('')}</div>`;
    }
    this.el.innerHTML = `<div class="cv-card panel hit">${body}</div>`;
    this.el.querySelector('[data-hit]')?.addEventListener('click', () => { this.act({ hit: true }); this.audio.select(); });
    this.el.querySelector('[data-stand]')?.addEventListener('click', () => { this.act({ stand: true }); this.audio.confirm(); });
  }
  update(st, changed) {
    if (st.phase === 'reveal' && changed) return this.dealerReveal(st);
    if (this.fxBusy) return;
    if (changed && st.phase !== 'reveal' && this.cine) this.clearFx();
    this.render(st);
  }
  // дилер переворачивает вторую карту, добирает по одной — все видят итог, потом сцена выбывания
  async dealerReveal(st) {
    this.fxBusy = true;
    const r = st.reveal;
    const box = (n) => {
      const shown = r.dealer.slice(0, n);
      this.el.innerHTML = `<div class="cv-card panel hit"><div class="cv-kick">${t('dealer')}</div><div class="pc-row">${shown.map((c) => cardHtml(c)).join('')}${n < 2 ? cardHtml('', true) : ''}</div>
        <div class="cv-huge" style="font-size:54px">${n >= 2 ? handValue(shown) : ''}</div></div>`;
    };
    box(1); await wait(0.6);
    for (let n = 2; n <= r.dealer.length; n++) { box(n); this.audio.select(); await wait(0.8); }
    this.render(st); // таблица: дилер и все игроки
    await wait(2.4);
    this.fxBusy = false;
    this.playOut(st);
  }
}

// ---------- 11. Русская рулетка ----------
// На столе патроны: среди них боевые (в первом раунде один), остальные холостые. В свой ход выбираете патрон.
export class RouletteView extends FlatView {
  holdSec = 0; // итог показывается своей анимацией
  // У каждого свой полный барабан: 6 гнёзд, боевых — сколько сказано; ниже — кто уже стрелял и чем кончилось.
  render(st) {
    this.st = st;
    const v = st.visible || {};
    const total = v.total ?? st.data?.total ?? 6, live = v.live ?? st.data?.live ?? 1;
    const my = st.phase === 'act' && v.turn === this.myId && this.canAct(st);
    const taken = v.taken || st.reveal?.taken || [];
    const last = taken[taken.length - 1];
    const fresh = st.phase === 'act' && (!last || last.pid !== this.lastShown);
    const shells = Array.from({ length: total }, (_, i) => `<button class="rl-shell hit" data-i="${i}" ${my ? '' : 'disabled'}></button>`).join('');
    const hist = taken.map((x) => `<span class="${x.live ? 'dead' : 'ok'}">${esc(this.name(st, x.pid))} ${x.live ? '💀' : '✓'}</span>`).join('');
    this.el.innerHTML = `<div class="cv-card panel hit rl-card">
      <div class="cv-kick">${t('liveRounds')}: ${live} · ${t('blankRounds')}: ${total - live}</div>
      <div class="rl-shells ${fresh ? 'reload' : ''}">${shells}</div>
      <div class="rl-hist">${hist}</div>
      <div class="cv-note">${st.phase === 'act' ? (my ? t('pickShell') : v.turn ? `${t('turnOf')}: ${esc(this.name(st, v.turn))}` : '') : ''}</div>
      ${st.phase === 'reveal' ? this.outNames(st) : ''}</div>`;
    if (last) this.lastShown = last.pid;
    this.el.querySelectorAll('.rl-shell:not([disabled])').forEach((b) => b.onclick = async () => {
      this.audio.select();
      if (!(await confirmBox(this.root, t('pickShellQ')))) return;
      this.act({ pick: Number(b.dataset.i) });
    });
  }
  update(st, changed) {
    const n = this.st?.visible?.taken?.length || 0;
    if (st.phase === 'reveal' && changed) return this.showShells(st);
    if (this.fxBusy) return;
    if (changed && st.phase !== 'reveal' && this.cine) this.clearFx();
    const taken = st.visible?.taken || [];
    if (taken.length > n) { const last = taken[taken.length - 1]; last.live ? this.audio.destroy() : this.audio.crack(); }
    this.render(st);
  }
  // все видят, кто вытянул боевой и где лежали остальные боевые, — потом сцена выбывания
  async showShells(st) {
    this.fxBusy = true;
    this.render(st);
    this.audio.destroy();
    await wait(2.6);
    this.fxBusy = false;
    this.playOut(st);
  }

}
