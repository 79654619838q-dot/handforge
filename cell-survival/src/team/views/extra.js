// Новые испытания: «Стрельба вслепую», «Бомба», «Очко», «Русская рулетка».
// Всё управление — HTML/canvas поверх задника темы; выбывание — общая кино-сцена FlatView.playOut.
import { t } from '../../i18n.js';
import { FlatView } from './flat.js';
import { confirmBox } from './common.js';
import { esc, portraitOf } from '../MatchView.js';
import { handValue } from '../../../shared/match.js';

// ---------- 8. Стрельба вслепую ----------
export class ShootView extends FlatView {
  render(st) {
    this.st = st;
    const size = innerWidth < 760 ? Math.min(innerHeight * 0.52, innerWidth * 0.88) : Math.min(innerHeight * 0.62, innerWidth * 0.46);
    const kick = st.phase === 'act' ? (this.canAct(st) ? t('aimHint') : this.alive(st) ? t('waitOthers') : '') : '';
    this.el.innerHTML = `<div class="cv-card panel hit cv-canvas-card"><div class="cv-kick">${kick}</div>
      <canvas width="1000" height="1000" style="width:${size}px;height:${size}px" data-c></canvas>
      ${st.phase === 'act' && this.canAct(st) ? `<button class="btn primary" data-fire style="margin-top:12px">${t('fireReady')}</button>` : ''}
      ${st.phase === 'reveal' ? this.outNames(st) : ''}</div>`;
    const c = this.el.querySelector('[data-c]');
    this.draw(c, st, 1);
    const aimAt = (e) => {
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1;
      const me = st.priv?.pos; if (!me) return;
      this.angle = Math.atan2(y - me[1], x - me[0]);
      this.draw(c, this.st, 1);
    };
    c.onpointerdown = (e) => { if (!this.canAct(this.st)) return; this.dragging = true; aimAt(e); this.audio.hover(); };
    c.onpointermove = (e) => { if (this.dragging) aimAt(e); };
    c.onpointerup = () => { this.dragging = false; };
    this.el.querySelector('[data-fire]')?.addEventListener('click', () => this.fire());
  }
  fire() {
    if (!this.canAct(this.st) || this.angle == null) return;
    this.act({ angle: this.angle });
    this.audio.confirm();
  }
  frame(now) {
    // за полсекунды до конца прицел отправляется сам, чтобы не выстрелить случайно
    const st = this.st;
    if (st?.phase === 'act' && this.canAct(st) && this.angle != null && st.deadline && st.deadline - now < 600 && !this.autoSent) { this.autoSent = true; this.fire(); }
  }
  update(st, changed) {
    if (changed && st.phase === 'act') { this.angle = null; this.autoSent = false; }
    if (st.phase === 'reveal' && changed) { this.st = st; this.animateReveal(st); return; }
    super.update(st, changed);
  }
  // раскрытие: все появляются, лучи прочерчивают поле, потом — сцена выбывания
  async animateReveal(st) {
    this.fxBusy = true;
    this.render(st);
    const c = this.el.querySelector('[data-c]');
    const t0 = performance.now();
    this.audio.charge();
    await new Promise((res) => {
      const step = () => { const k = Math.min(1, (performance.now() - t0) / 1600); this.draw(c, st, k); if (k < 1) requestAnimationFrame(step); else res(); };
      step();
    });
    this.audio.destroy();
    await new Promise((r) => setTimeout(r, 900));
    this.fxBusy = false;
    this.playOut(st);
  }
  draw(c, st, k) {
    const g = c.getContext('2d');
    const P = (x, y) => [(x + 1) * 500, (y + 1) * 500];
    g.clearRect(0, 0, 1000, 1000);
    const zone = st.reveal?.zone ?? st.data?.zone ?? 1;
    // зона
    g.beginPath(); g.arc(500, 500, zone * 500, 0, Math.PI * 2);
    g.fillStyle = 'rgba(20,16,30,.75)'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#d9b25f'; g.stroke();
    g.setLineDash([12, 14]); g.beginPath(); g.arc(500, 500, zone * 500 * 0.8, 0, Math.PI * 2); g.strokeStyle = 'rgba(217,178,95,.25)'; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
    const me = st.priv?.pos;
    if (st.phase !== 'reveal' && me) {
      const [x, y] = P(...me);
      if (this.angle != null || st.mine != null) {
        const a = this.angle ?? st.mine;
        g.strokeStyle = 'rgba(124,240,255,.8)'; g.lineWidth = (st.data?.beam || 0.08) * 500 * 0.35;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 1400, y + Math.sin(a) * 1400); g.stroke();
      }
      g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2); g.fillStyle = '#f6dc97'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#000'; g.stroke();
      g.font = '600 34px Rajdhani, sans-serif'; g.fillStyle = '#f6dc97'; g.fillText(t('you'), x + 28, y - 20);
    }
    if (st.phase === 'reveal' && st.reveal?.pos) {
      const r = st.reveal;
      const hit = new Set(r.eliminated || []);
      for (const [id, a] of Object.entries(r.angles)) {
        const [x, y] = P(...r.pos[id]);
        const L = 1400 * k;
        g.strokeStyle = id === this.myId ? 'rgba(246,220,151,.9)' : 'rgba(124,240,255,.75)'; g.lineWidth = r.beam * 500 * 0.35;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
      }
      for (const [id, pos] of Object.entries(r.pos)) {
        const [x, y] = P(...pos);
        g.beginPath(); g.arc(x, y, 22, 0, Math.PI * 2);
        g.fillStyle = k >= 1 && hit.has(id) ? '#ff3b2a' : id === this.myId ? '#f6dc97' : '#a78bfa'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#000'; g.stroke();
        g.font = '600 30px Rajdhani, sans-serif'; g.fillStyle = '#fff'; g.fillText(this.name(st, id), x + 26, y - 18);
      }
    }
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
    if (st.phase === 'reveal' && changed) return this.playOut(st);
    if (this.fxBusy) return;
    if (changed && st.phase !== 'reveal' && this.cine) this.clearFx();
    this.render(st);
  }
}

// ---------- 11. Русская рулетка ----------
export class RouletteView extends FlatView {
  render(st) {
    this.st = st;
    const v = st.visible || {};
    const bullets = v.bullets ?? st.data?.bullets ?? 1;
    const my = v.turn === this.myId && this.canAct(st);
    const order = st.data?.order || [];
    const holes = Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${100 + Math.cos(a) * 52}" cy="${100 + Math.sin(a) * 52}" r="17" class="${i < bullets ? 'live' : ''}"/>`; }).join('');
    const pulls = (v.pulls || []).slice(-6).map((p) => `<span class="${p.hit ? 'bad' : ''}">${esc(this.name(st, p.pid))} — ${p.hit ? t('shot') : t('click')}</span>`).join('');
    this.el.innerHTML = `<div class="cv-card panel hit rl-card">
      <div class="cv-kick">${t('bulletsN')}: ${bullets} ${t('of')} 6</div>
      <svg class="rl-drum ${this.spin ? 'spin' : ''}" viewBox="0 0 200 200"><circle cx="100" cy="100" r="90" class="body"/>${holes}<circle cx="100" cy="100" r="16" class="axis"/></svg>
      <div class="rl-order">${order.filter((id) => st.alive?.includes(id)).map((id) => `<span class="${id === v.turn ? 'on' : ''}">${esc(this.name(st, id))}</span>`).join('')}</div>
      ${st.phase === 'act' ? (my ? `<button class="btn primary cv-big" data-pull>${t('pull')}</button>` : `<div class="cv-note">${v.turn ? `${t('turnOf')}: ${esc(this.name(st, v.turn))}` : ''}</div>`) : ''}
      <div class="rl-log">${pulls}</div>${st.phase === 'reveal' ? this.outNames(st) : ''}</div>`;
    this.el.querySelector('[data-pull]')?.addEventListener('click', async () => {
      if (!(await confirmBox(this.root, t('pullQ')))) return;
      this.act({ pull: true });
    });
  }
  update(st, changed) {
    const n = this.st?.visible?.pulls?.length || 0;
    if (st.phase === 'reveal' && changed) return this.playOut(st);
    if (this.fxBusy) return;
    if (changed && st.phase !== 'reveal' && this.cine) this.clearFx();
    const pulls = st.visible?.pulls || [];
    if (pulls.length > n) { // новый щелчок: барабан крутится, звук
      const last = pulls[pulls.length - 1];
      this.spin = true; this.audio.charge();
      setTimeout(() => { this.spin = false; last.hit ? this.audio.destroy() : this.audio.crack(); this.render(this.st); }, 700);
    }
    this.render(st);
  }
}
