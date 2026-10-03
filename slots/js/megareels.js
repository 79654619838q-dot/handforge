// Барабаны «Королевского покера» на canvas: 6 барабанов, у каждого своя высота (2–7 карт) и каскад —
// выигравшие карты сгорают, оставшиеся падают вниз, сверху приходят новые. Исход решает mega.js, здесь только показ.
// Снаружи — то же, что у ReelView (reels.js), чтобы экран автомата работал с обоими одинаково.
import { REELS, ASPECT } from './mega.js';

const LABEL_BG = {
  wild: ['#d9a6ff', '#6a1fb8'], w2: ['#ffb0e6', '#9c1f8a'], w3: ['#ff9ec2', '#b0124e'], w5: ['#ff8a7a', '#b01212'],
  scatter: ['#ffe07a', '#c8860e'], jackpot: ['#ff6a6a', '#a8101a'], pick: ['#ffc46a', '#8a4a10'],
};

const C1 = 1.25, C3 = C1 + 1;
const easeOutBack = (t) => 1 + C3 * (t - 1) ** 3 + C1 * (t - 1) ** 2;
const easeOut = (t) => 1 - (1 - t) ** 3;
// падение с лёгким отскоком на месте
const easeDrop = (t) => (t < 0.8 ? (t / 0.8) ** 2 : 1 - Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.06);
const mod = (a, n) => ((a % n) + n) % n;
const key = (r, row) => r + ',' + row;
const windowCol = (s, top, n) => Array.from({ length: n }, (_, i) => s[mod(top + i, s.length)]);

export class MegaReelView {
  constructor(canvas, machine, strips, fit = canvas.parentElement) {
    this.fit = fit;
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.m = machine;
    this.strips = strips;
    this.n = strips.map((_, r) => [4, 6, 3, 7, 5, 4][r] || 4); // высоты до первого вращения — для вида
    this.pos = strips.map((s) => Math.floor(Math.random() * s.length));
    this.col = strips.map((s, r) => windowCol(s, this.pos[r], this.n[r]));
    this.reel = strips.map(() => ({ mode: 'idle', v: 0 }));
    this.images = {};
    this.sprites = {};
    this.hl = null;
    this.ov = new Map();   // подарочные Джокеры: клетка → { sym, old, t0 }
    this.burn = null;      // сгорающие клетки каскада
    this.fall = null;      // падение карт после сгорания
    this.animUntil = 0;
    this.running = false;
    this.cw = 0;
    this.dpr = 1;
    this.onStop = null;
    for (const [id, s] of Object.entries(machine.symbols)) {
      if (!s.img) continue;
      const img = new Image();
      img.onload = () => { this.images[id] = img; this.buildSprite(id); this.draw(); };
      img.src = s.img;
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(fit);
    document.fonts?.ready.then(() => { this.buildSprites(); this.draw(); });
    this.resize();
  }

  get aspect() { return ASPECT; }
  destroy() { this.ro.disconnect(); this.running = false; this.dead = true; }
  setFrameArt(k) { this.art = k; this.cw = 0; this.resize(); }
  setStrips(strips) {
    this.strips = strips;
    this.pos = this.pos.map((p, r) => mod(Math.round(p), strips[r].length));
    this.draw();
  }
  // экран автомата зовёт это для липких WILD и растущей маски — здесь их нет
  setSticky() {}
  setExpanded() {}

  resize() {
    let w, h;
    if (this.art) {
      w = this.fit.clientWidth / this.art.kx; h = this.fit.clientHeight / this.art.ky;
    } else {
      const fr = this.c.parentElement, cs = getComputedStyle(fr);
      const padX = fr === this.fit ? 0 : parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const padY = fr === this.fit ? 0 : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      w = this.fit.clientWidth - padX; h = this.fit.clientHeight - padY;
    }
    const cw = Math.max(16, Math.floor(Math.min(w / REELS, (h * ASPECT) / REELS)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cw === this.cw && dpr === this.dpr) return;
    this.cw = cw; this.dpr = dpr;
    const W = cw * REELS, H = Math.round(W / ASPECT);
    this.c.style.width = W + 'px';
    this.c.style.height = H + 'px';
    this.c.width = Math.round(W * dpr);
    this.c.height = Math.round(H * dpr);
    this.onResize?.(W, H);
    this.buildSprites();
    this.draw();
  }

  get RW() { return this.c.width / REELS; }  // ширина барабана, точки canvas
  get PH() { return this.c.height; }

  buildSprites() { for (const id of Object.keys(this.m.symbols)) this.buildSprite(id); }

  // карта рисуется один раз под ширину барабана (+ размытая копия для вращения); в клетку — с подгонкой
  buildSprite(id) {
    const SW = Math.round(this.RW);
    if (!SW) return;
    const s = this.m.symbols[id];
    const img = this.images[id];
    const ar = img ? img.height / img.width : s.card || /^[hl]\d$/.test(id) ? 1.36 : 1;
    const SH = Math.round(SW * Math.min(1.5, Math.max(0.9, ar)));
    const cv = document.createElement('canvas');
    cv.width = SW; cv.height = SH;
    const g = cv.getContext('2d');
    const special = !!LABEL_BG[id];
    if (special || id === 'h1') {
      const rg = g.createRadialGradient(SW / 2, SH * 0.46, SW * 0.05, SW / 2, SH * 0.46, SW * 0.55);
      rg.addColorStop(0, hexA(s.color, 0.5));
      rg.addColorStop(1, hexA(s.color, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, SW, SH);
    }
    if (img) {
      const k = Math.min((SW * 0.92) / img.width, (SH * 0.92) / img.height);
      const w = img.width * k, h = img.height * k;
      g.drawImage(img, (SW - w) / 2, (SH - h) / 2, w, h);
    } else {
      // запасная карта, пока нет картинки: светлая карта с рангом и мастью
      const w = SW * 0.78, h = Math.min(SH * 0.92, w * 1.4), x = (SW - w) / 2, y = (SH - h) / 2;
      g.fillStyle = special ? s.color : '#f7f1e3';
      roundRect(g, x, y, w, h, w * 0.1); g.fill();
      g.lineWidth = Math.max(1, SW * 0.025); g.strokeStyle = '#d4a017'; g.stroke();
      g.font = `${Math.round(w * (s.emoji.length > 2 ? 0.34 : 0.42))}px "Segoe UI Emoji","Russo One",sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = special ? '#fff' : s.color;
      g.fillText(s.emoji, SW / 2, SH / 2);
    }
    // множитель Джокера — золотой кружок в углу
    if (s.mult) {
      const r = SW * 0.2, cx = SW * 0.76, cy = SH * 0.2;
      const cg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      cg.addColorStop(0, '#fff3b0'); cg.addColorStop(0.6, '#f2b82a'); cg.addColorStop(1, '#a8660a');
      g.fillStyle = cg;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(1, SW * 0.02); g.strokeStyle = '#5a2a00'; g.stroke();
      g.font = `${Math.round(r * 1.05)}px "Russo One","Arial Black",sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#5a1000';
      g.fillText(s.text, cx, cy + r * 0.06);
    }
    if (s.label) {
      const [c1, c2] = LABEL_BG[id] || ['#ffe07a', '#c8860e'];
      const w = SW * 0.86, h = SW * 0.2, x = (SW - w) / 2, y = SH - h - SH * 0.04;
      const lg = g.createLinearGradient(0, y, 0, y + h);
      lg.addColorStop(0, c1); lg.addColorStop(1, c2);
      g.fillStyle = lg;
      roundRect(g, x, y, w, h, h * 0.45); g.fill();
      g.lineWidth = Math.max(1, SW * 0.012); g.strokeStyle = 'rgba(255,255,255,.75)'; g.stroke();
      let fs = h * 0.66;
      g.font = `${Math.round(fs)}px "Russo One", "Arial Black", sans-serif`;
      while (g.measureText(s.label).width > w * 0.86 && fs > 6) { fs -= 1; g.font = `${Math.round(fs)}px "Russo One", "Arial Black", sans-serif`; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = Math.max(1.5, SW * 0.018); g.strokeStyle = 'rgba(40,10,0,.85)';
      g.strokeText(s.label, SW / 2, y + h * 0.54);
      g.fillStyle = '#fff';
      g.fillText(s.label, SW / 2, y + h * 0.54);
    }
    const bl = document.createElement('canvas');
    bl.width = SW; bl.height = SH;
    const b = bl.getContext('2d');
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      b.globalAlpha = 1 / (i + 1);
      b.drawImage(cv, 0, (i / (steps - 1) - 0.5) * SH * 0.3);
    }
    this.sprites[id] = { sharp: cv, blur: bl, w: SW, h: SH };
  }

  // одна карта в клетке (x, y, cw, ch) с подгонкой по размеру клетки
  cellDraw(g, id, x, y, cw, ch, { blur = false, alpha = 1, scale = 1 } = {}) {
    const sp = this.sprites[id];
    if (!sp) return;
    const k = Math.min(cw / sp.w, ch / sp.h) * 0.97 * scale;
    const w = sp.w * k, h = sp.h * k;
    g.globalAlpha = alpha;
    g.drawImage(blur ? sp.blur : sp.sharp, x + (cw - w) / 2, y + (ch - h) / 2, w, h);
    g.globalAlpha = 1;
  }

  // ===== вращение =====
  // stops — верхние клетки остановки, heights — сколько карт на каждом барабане
  spin(stops, { turbo = false, anticipation = [], heights = null } = {}) {
    this.hl = null;
    this.ov.clear();
    this.burn = this.fall = null;
    const now = performance.now();
    const V = turbo ? 34 : 24;
    let t = turbo ? 330 : 700;
    const gap = turbo ? 90 : 200;
    this.reel = stops.map((stop, r) => {
      if (r) t += gap;
      if (anticipation[r]) t += turbo ? 600 : 1000;
      return { mode: 'spin', start: now + r * (turbo ? 15 : 50), stopAt: now + t, stop, n: heights ? heights[r] : this.n[r], v: 0, V, turbo, ant: !!anticipation[r], pos0: this.pos[r], switched: false };
    });
    return new Promise((res) => { this.resolveSpin = res; this.loop(); });
  }

  slam() {
    const now = performance.now();
    this.reel.forEach((rl, r) => {
      if (rl.mode === 'spin') { rl.stopAt = Math.min(rl.stopAt, now + r * 60); rl.ant = false; }
    });
  }

  get spinning() { return this.reel.some((r) => r.mode !== 'idle'); }

  waiting(r) {
    const rl = this.reel[r];
    return rl.mode === 'spin' && rl.ant && this.reel.slice(0, r).every((x) => x.mode === 'idle');
  }

  update(now, dt) {
    this.reel.forEach((rl, r) => {
      const L = this.strips[r].length;
      if (rl.mode === 'spin') {
        const e = now - rl.start;
        if (e < 0) return;
        // после рывка вверх барабан уже размыт — меняем высоту и рисуем ленту
        if (!rl.switched && e >= 90) { rl.switched = true; this.n[r] = rl.n; this.col[r] = null; }
        const k = this.n[r] / 3; // клеток в секунду — так, чтобы скорость на экране не зависела от высоты карт
        rl.v = e < 90 ? -2.5 : rl.V * k * Math.min(1, (e - 90) / 170) * (this.waiting(r) ? 0.8 : 1);
        this.pos[r] -= rl.v * dt;
        if (now >= rl.stopAt && e > 260) {
          const d = rl.turbo ? 0.26 : 0.36;
          const D = (Math.max(rl.v, 8) * d) / (C1 + 3);
          const p = this.pos[r];
          const f0 = Math.floor(p - D);
          rl.from = rl.stop + (p - f0);
          rl.to = rl.stop;
          rl.t0 = now; rl.d = d * 1000;
          rl.mode = 'stopping';
          this.pos[r] = rl.from;
        } else if (rl.switched) this.pos[r] = mod(this.pos[r], L);
      } else if (rl.mode === 'stopping') {
        const k = Math.min(1, (now - rl.t0) / rl.d);
        this.pos[r] = rl.from + (rl.to - rl.from) * easeOutBack(k);
        rl.v = k < 0.35 ? rl.V : 0;
        if (k >= 1) {
          this.pos[r] = rl.stop;
          this.col[r] = windowCol(this.strips[r], rl.stop, this.n[r]);
          rl.mode = 'idle'; rl.v = 0;
          this.onStop?.(r);
          if (!this.spinning && this.resolveSpin) { const f = this.resolveSpin; this.resolveSpin = null; f(); }
        }
      }
    });
  }

  loop() {
    if (this.running || this.dead) return;
    this.running = true;
    let last = performance.now();
    const frame = (now) => {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(now, dt);
      this.draw(now);
      if (this.spinning || this.hl || now < this.animUntil) requestAnimationFrame(frame);
      else this.running = false;
    };
    requestAnimationFrame(frame);
  }

  kick(ms = 900) { this.animUntil = Math.max(this.animUntil, performance.now() + ms); this.loop(); }

  // подарочные Джокеры прилетают на барабаны
  setOverride(cells, sym) {
    const t0 = performance.now();
    cells.forEach(([r, row], i) => {
      if (!this.col[r]) return;
      this.ov.set(key(r, row), { sym, old: this.col[r][row], t0: t0 + i * 120 });
      this.col[r][row] = sym;
    });
    this.kick(1200);
  }

  showWins(cells, _lines = [], dimOthers = true) {
    this.hl = { cells: new Set(cells.map(([r, row]) => key(r, row))), dim: dimOthers, t0: performance.now() };
    this.loop();
  }
  clearWins() { this.hl = null; this.draw(); }

  // Каскад: removed — клетки 'r,row', которые сгорают; next — окно после падения (из mega.js)
  cascade(removed, next, { turbo = false } = {}) {
    this.hl = null;
    this.ov.clear();
    const now = performance.now();
    const burnMs = turbo ? 260 : 420, fallMs = turbo ? 300 : 460, stagger = turbo ? 20 : 35;
    const keys = new Set(removed);
    this.burn = { keys, t0: now, dur: burnMs };
    const items = this.col.map((col, r) => {
      const keep = [];
      (col || []).forEach((id, row) => { if (!keys.has(key(r, row))) keep.push({ id, from: row }); });
      const need = next[r].length - keep.length;
      const out = [];
      for (let i = 0; i < need; i++) out.push({ id: next[r][i], from: i - need, to: i });
      keep.forEach((it, j) => out.push({ id: it.id, from: it.from, to: need + j }));
      return out;
    });
    this.fall = { t0: now + burnMs, dur: fallMs, stagger, items };
    const total = burnMs + fallMs + stagger * REELS;
    this.kick(total + 300);
    return new Promise((res) => setTimeout(() => {
      this.col = next.map((c) => c.slice());
      this.burn = this.fall = null;
      this.draw();
      res();
    }, total));
  }

  draw(now = performance.now()) {
    const g = this.ctx, RW = this.RW, PH = this.PH;
    if (!RW) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    const t = this.hl ? (now - this.hl.t0) / 1000 : 0;
    const pulse = 1 + 0.07 * Math.sin(t * 7);
    const frames = [];
    const falling = this.fall && now >= this.fall.t0;
    for (let r = 0; r < REELS; r++) {
      const x = r * RW, rl = this.reel[r], n = this.n[r], ch = PH / n;
      const idle = rl.mode === 'idle';
      g.save();
      g.beginPath(); g.rect(x, 0, RW, PH); g.clip();
      const bg = g.createLinearGradient(0, 0, 0, PH);
      bg.addColorStop(0, 'rgba(0,0,0,.55)'); bg.addColorStop(0.5, 'rgba(8,20,12,.32)'); bg.addColorStop(1, 'rgba(0,0,0,.55)');
      g.fillStyle = bg;
      g.fillRect(x, 0, RW, PH);
      // тонкие линии между картами — видно, сколько карт на барабане
      g.fillStyle = 'rgba(255,215,120,.08)';
      for (let i = 1; i < n; i++) g.fillRect(x + RW * 0.08, i * ch - 0.5, RW * 0.84, 1);
      if (falling) {
        const k = Math.max(0, Math.min(1, (now - this.fall.t0 - r * this.fall.stagger) / this.fall.dur));
        const e = easeDrop(k);
        for (const it of this.fall.items[r]) this.cellDraw(g, it.id, x, (it.from + (it.to - it.from) * e) * ch, RW, ch);
      } else if (this.col[r]) {
        // остановленный барабан (или ещё рывок вверх в начале вращения)
        const off = rl.mode === 'spin' ? this.pos[r] - rl.pos0 : 0;
        this.col[r].forEach((id, row) => {
          const y = (row - off) * ch, ck = key(r, row);
          if (this.burn && this.burn.keys.has(ck)) {
            const a = Math.min(1, (now - this.burn.t0) / this.burn.dur);
            this.cellDraw(g, id, x, y, RW, ch, { scale: 1 + 0.3 * a, alpha: 1 - a });
            burst(g, x, y, RW, ch, a);
            return;
          }
          const on = this.hl && idle && this.hl.cells.has(ck);
          const dim = this.hl && idle && this.hl.dim && !on ? 0.38 : 1;
          const o = idle && this.ov.get(ck);
          if (o) {
            const a = (now - o.t0) / 1000;
            if (a < 0) { this.cellDraw(g, o.old, x, y, RW, ch, { alpha: dim }); return; }
            if (a < 0.4) {
              this.cellDraw(g, id, x, y, RW, ch, { scale: Math.max(0.05, easeOutBack(a / 0.4)) });
              ring(g, x, y, RW, ch, `rgba(255,240,150,${1 - a / 0.4})`, 1 + a);
              return;
            }
          }
          if (on) { this.cellDraw(g, id, x, y, RW, ch, { scale: pulse }); frames.push([x, y, ch]); }
          else this.cellDraw(g, id, x, y, RW, ch, { alpha: dim });
        });
      } else {
        // лента на ходу
        const strip = this.strips[r], L = strip.length, p = this.pos[r];
        const fast = Math.abs(rl.v) > 7 * (n / 3);
        const k0 = Math.floor(p) - 1;
        for (let k = k0; k <= k0 + n + 1; k++) {
          const y = (k - p) * ch;
          if (y <= -ch || y >= PH) continue;
          this.cellDraw(g, strip[mod(k, L)], x, y, RW, ch, { blur: fast });
        }
      }
      if (this.waiting(r)) {
        const a = 0.55 + 0.45 * Math.sin(now / 90);
        g.lineWidth = RW * 0.06;
        g.strokeStyle = `rgba(255,200,60,${a})`;
        g.shadowColor = '#ffcc33'; g.shadowBlur = RW * 0.25;
        g.strokeRect(x + RW * 0.03, RW * 0.03, RW * 0.94, PH - RW * 0.06);
        g.shadowBlur = 0;
      }
      g.restore();
    }
    for (const [fx, fy, ch] of frames) {
      const m = Math.min(RW, ch) * 0.05;
      g.lineWidth = Math.max(1.5, Math.min(RW, ch) * 0.035);
      g.strokeStyle = `rgba(255,220,110,${0.55 + 0.4 * Math.sin(t * 7)})`;
      roundRect(g, fx + m, fy + m, RW - 2 * m, ch - 2 * m, Math.min(RW, ch) * 0.12); g.stroke();
    }
    g.fillStyle = 'rgba(255,215,120,.35)';
    for (let r = 1; r < REELS; r++) g.fillRect(r * RW - Math.max(1, RW * 0.006), 0, Math.max(2, RW * 0.012), PH);
  }
}

// вспышка сгорающей карты: золотые искры разлетаются от центра
function burst(g, x, y, w, h, a) {
  const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * (0.2 + 0.6 * a);
  g.save();
  g.globalAlpha = Math.max(0, 1 - a);
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  rg.addColorStop(0, 'rgba(255,250,210,.95)'); rg.addColorStop(0.5, 'rgba(255,200,60,.55)'); rg.addColorStop(1, 'rgba(255,160,0,0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffe9a0';
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + 0.4, d = R * 1.1;
    g.beginPath(); g.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, Math.max(1, Math.min(w, h) * 0.035 * (1 - a)), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function ring(g, x, y, w, h, color, scale = 1) {
  g.save();
  g.translate(x + w / 2, y + h / 2); g.scale(scale, scale);
  const s = Math.min(w, h);
  g.lineWidth = s * 0.05; g.strokeStyle = color;
  roundRect(g, -w * 0.45, -h * 0.45, w * 0.9, h * 0.9, s * 0.14); g.stroke();
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = hex.length === 4
    ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
    : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgba(${r},${g},${b},${a})`;
}
