// Испытания без поля: «Останови время», «Запомни число», «Центр», «Уникальное число».
// Сцена — задник темы, всё управление — HTML/canvas поверх.
import { t } from '../../i18n.js';
import { BaseView, backdropWorld, confirmBox } from './common.js';
import { Cinematic } from '../../scene/cinematics.js';
import { esc } from '../MatchView.js';

const fmtSec = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(2));

export class FlatView extends BaseView {
  revealFxSec = 5;
  enter(st) { this.world = backdropWorld(this.stage, this.theme); this.render(st); }
  update(st, changed) {
    // раскрытие: сначала выбывшие проваливаются на сцене, потом — таблица результатов
    if (st.phase === 'reveal' && changed) { this.playOut(st); return; }
    if (this.fxBusy && st.phase === 'reveal') return;
    if (changed && st.phase !== 'reveal' && this.cine) this.clearFx();
    if (changed || this.dirty(st)) this.render(st);
  }
  clearFx() { this.cine?.dispose(); this.cine = null; this.world.cineCam = false; this.world.fitCamera(6); }
  // данные для сцены выбывания: что показать рядом с игроком
  cineInfo(st, out) {
    const r = st.reveal || {};
    if (st.cid === 'time') { const id = out[0]; const e = r.results?.[id]?.elapsed; return { text: e == null ? '—' : (e / 1000).toFixed(2) + ' / ' + r.target }; }
    if (st.cid === 'memory') return { number: r.number };
    if (st.cid === 'center') return { points: st.data?.points };
    if (st.cid === 'unique') return { numbers: out.map((id) => r.picks?.[id]) };
    return {};
  }
  async playOut(st) {
    const out = st.reveal?.replay ? [] : st.reveal?.eliminated || [];
    if (!out.length) { this.render(st); return; }
    this.fxBusy = true;
    this.el.innerHTML = '';
    this.cine?.dispose();
    this.cine = new Cinematic(this.world, this.audio, this.mv.el);
    const players = out.map((id) => { const info = st.players.find((p) => p.id === id); return { profile: { ...info?.profile, name: info?.name } }; });
    try { await this.cine.play(st.cid, players, this.cineInfo(st, out)); } catch (e) { console.error(e); }
    this.cine.release();
    this.mv.showOut();
    this.fxBusy = false;
    if (this.mv.st?.phase === 'reveal') this.render(this.mv.st);
  }

  dirty() { return false; }
  outNames(st) {
    const out = st.reveal?.eliminated || [];
    if (st.reveal?.replay) return `<div class="cv-out">${t('replay')}</div>`;
    return `<div class="cv-out">${out.length ? `${t('eliminatedList')}: ${out.map((id) => esc(this.name(st, id))).join(', ')}` : t('nobodyOut')}</div>`;
  }
}

// ---------- Останови время ----------
export class TimeView extends FlatView {
  constructor(ctx) { super(ctx); this.running = null; this.onKey = (e) => { if (e.code === 'Space') { e.preventDefault(); this.press(); } }; addEventListener('keydown', this.onKey); }
  leave() { removeEventListener('keydown', this.onKey); super.leave(); }
  press() {
    const st = this.st;
    if (!st || !this.canAct(st)) return;
    if (this.running === null) { this.running = performance.now(); this.audio.select(); this.render(st); }
    else {
      const elapsed = performance.now() - this.running;
      this.running = null; this.sent = true;
      this.audio.confirm();
      this.act({ elapsed });
      this.render(st);
    }
  }
  render(st) {
    this.st = st;
    if (st.phase !== 'act') { this.running = null; this.sent = false; }
    const target = st.data?.target;
    let body = '';
    if (st.phase === 'act' || st.phase === 'intro' || st.phase === 'show') {
      const mine = this.canAct(st);
      body = `<div class="cv-kick">${t('target')}</div><div class="cv-huge">${target ?? '—'} <small>${t('sec')}</small></div>`;
      if (st.phase === 'act' && this.alive(st)) {
        if (!mine || this.sent) body += `<div class="cv-note">${t('stopped')} · ${t('waitOthers')}</div>`;
        else if (this.running === null) body += `<button class="btn primary cv-big hit" data-go>${t('start')}</button><div class="cv-note">Space</div>`;
        else body += `<div class="cv-pulse">${t('countInMind')}</div><button class="btn primary cv-big hit" data-go>${t('stop')}</button>`;
      }
    } else if (st.reveal?.results) {
      const r = st.reveal.results;
      const rows = Object.keys(r).sort((a, b) => (r[a].dev ?? 1e9) - (r[b].dev ?? 1e9));
      const out = new Set(st.reveal.eliminated);
      body = `<div class="cv-kick">${t('target')}: ${st.reveal.target} ${t('sec')}</div>
        <table class="m-table cv-table"><tr><th></th><th>${t('sec')}</th><th>${t('deviation')}</th></tr>
        ${rows.map((id) => `<tr class="${out.has(id) ? 'out' : ''} ${id === this.myId ? 'me' : ''}"><td>${esc(this.name(st, id))}</td><td>${fmtSec(r[id].elapsed)}</td><td>${r[id].dev == null ? t('noAnswer') : '±' + fmtSec(r[id].dev)}</td></tr>`).join('')}</table>${this.outNames(st)}`;
    }
    this.el.innerHTML = `<div class="cv-card panel hit">${body}</div>`;
    this.el.querySelector('[data-go]')?.addEventListener('click', () => this.press());
  }
}

// ---------- Запомни число ----------
export class MemoryView extends FlatView {
  render(st) {
    const prevPhase = this.phase; this.phase = st.phase;
    let body = '';
    if (st.phase === 'show' && st.show) {
      body = `<div class="cv-kick">${t('rememberIt')}</div><div class="cv-digits">${[...st.show.number].map((d) => `<span>${d}</span>`).join('')}</div>`;
    } else if (st.phase === 'act') {
      if (this.canAct(st)) {
        if (prevPhase !== 'act') this.t0 = performance.now();
        body = `<div class="cv-kick">${t('enterNumber')} · ${st.data?.digits}</div>
          <form class="cv-form" data-f><input class="input cv-input" inputmode="numeric" autocomplete="off" maxlength="20" data-in><button class="btn primary">${t('send')}</button></form>`;
      } else body = `<div class="cv-note">${this.alive(st) ? t('waitOthers') : ''}</div>`;
    } else if (st.reveal?.results) {
      const r = st.reveal.results, out = new Set(st.reveal.eliminated);
      body = `<div class="cv-kick">${t('correct')}</div><div class="cv-digits small">${[...st.reveal.number].map((d) => `<span>${d}</span>`).join('')}</div>
        <table class="m-table cv-table">${Object.keys(r).map((id) => `<tr class="${out.has(id) ? 'out' : ''} ${id === this.myId ? 'me' : ''}"><td>${esc(this.name(st, id))}</td><td>${esc(r[id].answer || t('noAnswer'))}</td><td>${r[id].ok ? '✓' : '✕'}</td><td>${fmtSec(r[id].ms)}</td></tr>`).join('')}</table>${this.outNames(st)}`;
    } else body = `<div class="cv-kick">${t('rememberIt')}</div><div class="cv-digits">${'•'.repeat(st.data?.digits || 3).split('').map((d) => `<span>${d}</span>`).join('')}</div>`;
    this.el.innerHTML = `<div class="cv-card panel hit">${body}</div>`;
    const f = this.el.querySelector('[data-f]');
    if (f) {
      const inp = f.querySelector('[data-in]');
      setTimeout(() => inp.focus(), 30);
      f.onsubmit = (e) => { e.preventDefault(); this.act({ answer: inp.value, ms: performance.now() - this.t0 }); this.audio.confirm(); };
    }
  }
  // при каждом ходе других игроков не перерисовываем поле ввода — иначе стирается набранное
  update(st, changed) { if (st.phase === 'reveal' && changed) return this.playOut(st); if (this.fxBusy) return; if (changed && st.phase !== 'reveal' && this.cine) this.clearFx(); if (changed) this.render(st); else if (st.phase === 'act' && !this.canAct(st) && this.el.querySelector('[data-f]')) this.render(st); }
}

// ---------- Центр ----------
const COLORS = ['#f6dc97', '#8b5cf6', '#4ade80', '#3da9ff', '#ff6b6b', '#ffb347', '#e879f9', '#2dd4bf', '#f472b6', '#a3e635'];
export class CenterView extends FlatView {
  render(st) {
    this.st = st;
    const size = innerWidth < 760 ? Math.min(innerHeight * 0.55, innerWidth * 0.86) : Math.min(innerHeight * 0.62, innerWidth * 0.46); // на телефоне фигура почти во всю ширину
    this.el.innerHTML = `<div class="cv-card panel hit cv-canvas-card"><div class="cv-kick">${st.phase === 'act' && this.canAct(st) ? t('putPoint') : st.phase === 'reveal' ? '' : t('waitOthers')}</div>
      <canvas width="1000" height="1000" style="width:${size}px;height:${size}px" data-c></canvas>${st.phase === 'reveal' ? this.outNames(st) : ''}</div>`;
    const c = this.el.querySelector('[data-c]');
    this.draw(c, st);
    c.onclick = async (e) => {
      if (!this.canAct(this.st)) return;
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 1000, y = ((e.clientY - r.top) / r.height) * 1000;
      this.draft = [x, y];
      this.draw(c, this.st);
      this.audio.select();
      this.act({ x, y }); // одна точка — сразу зафиксирована (так в правилах)
    };
  }
  update(st, changed) { if (st.phase === 'reveal' && changed) return this.playOut(st); if (this.fxBusy) return; if (changed && st.phase !== 'reveal' && this.cine) this.clearFx(); if (changed) { if (st.phase !== 'act') this.draft = null; this.render(st); } }
  draw(c, st) {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 1000, 1000);
    const pts = st.data?.points;
    if (!pts) return;
    const grd = g.createLinearGradient(0, 0, 1000, 1000);
    grd.addColorStop(0, '#f6dc97'); grd.addColorStop(1, '#8a6a2c');
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = grd; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
    g.lineWidth = 4; g.strokeStyle = '#1a1206'; g.stroke();
    const dot = (x, y, col, r = 12) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = col; g.fill(); g.lineWidth = 3; g.strokeStyle = '#000'; g.stroke(); };
    const mine = this.draft || st.mine;
    if (st.phase !== 'reveal' && mine) dot(mine[0], mine[1], '#8b5cf6');
    if (st.phase === 'reveal' && st.reveal?.results) {
      const [cx, cy] = st.reveal.center;
      const ids = Object.keys(st.reveal.results);
      ids.forEach((id, i) => {
        const res = st.reveal.results[id];
        if (!res.point) return;
        const col = id === this.myId ? '#ffffff' : COLORS[i % COLORS.length];
        g.setLineDash([10, 8]); g.beginPath(); g.moveTo(res.point[0], res.point[1]); g.lineTo(cx, cy); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
        dot(res.point[0], res.point[1], col, 10);
        g.font = '600 30px Rajdhani, sans-serif'; g.fillStyle = col; g.fillText(`${this.name(st, id)} · ${res.dist.toFixed(0)}`, res.point[0] + 16, res.point[1] - 12);
      });
      g.strokeStyle = '#ff3b3b'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(cx - 22, cy); g.lineTo(cx + 22, cy); g.moveTo(cx, cy - 22); g.lineTo(cx, cy + 22); g.stroke();
    }
  }
}

// ---------- Уникальное число ----------
export class UniqueView extends FlatView {
  render(st) {
    const max = st.data?.max || 0;
    const picks = st.reveal?.picks;
    const count = {};
    if (picks) for (const v of Object.values(picks)) count[v] = (count[v] || 0) + 1;
    const tiles = Array.from({ length: max }, (_, i) => i + 1).map((n) => {
      const who = picks ? Object.keys(picks).filter((id) => picks[id] === n) : [];
      const cls = picks ? (count[n] > 1 ? 'bad' : count[n] === 1 ? 'good' : 'empty') : (st.mine === n || this.sel === n ? 'on' : '');
      return `<button class="cv-num hit ${cls}" data-n="${n}"><b>${n}</b>${who.length ? `<span>${who.map((id) => esc(this.name(st, id))).join('<br>')}</span>` : ''}</button>`;
    }).join('');
    const kick = st.phase === 'act' ? (this.canAct(st) ? t('chooseNumber') : this.alive(st) ? t('waitOthers') : '') : '';
    this.el.innerHTML = `<div class="cv-card panel hit"><div class="cv-kick">${kick}</div><div class="cv-nums">${tiles}</div>${picks ? this.outNames(st) : ''}</div>`;
    this.el.querySelectorAll('[data-n]').forEach((b) => b.onclick = async () => {
      if (!this.canAct(st)) return;
      this.sel = Number(b.dataset.n); this.render(st); this.audio.select();
      if (await confirmBox(this.root, `${t('chooseNumber')}: ${this.sel}?`)) { this.act({ n: this.sel }); this.audio.confirm(); } else { this.sel = null; this.render(this.st || st); }
    });
    this.st = st;
  }
  update(st, changed) { if (st.phase === 'reveal' && changed) return this.playOut(st); if (this.fxBusy) return; if (changed && st.phase !== 'reveal' && this.cine) this.clearFx(); if (changed) { this.sel = null; } this.render(st); }
}
