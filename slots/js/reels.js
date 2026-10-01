// Барабаны на canvas: вращение с размытием, остановка с отскоком, «ожидание» на последних барабанах,
// подсветка выигрышных клеток и линий. Исход вращения решает engine.js до старта — здесь только показ.
import { REELS, ROWS, LINES } from './engine.js';

export const LINE_COLORS = [
  '#ffd84a', '#ff5a5a', '#5ad1ff', '#7dff6a', '#ff8ff0', '#ffa64a', '#b48cff', '#4affc8', '#ff4a8d', '#c8ff4a',
  '#4a8dff', '#ffef9e', '#ff7a4a', '#9effe0', '#e09eff', '#ffc24a', '#4affff', '#ff9e9e', '#a6ff9e', '#9eb8ff',
];

const LABEL_BG = {
  wild: ['#ffe07a', '#c8860e'],
  scatter: ['#d38bff', '#6a1fb8'],
  jackpot: ['#ff6a6a', '#a8101a'],
};

// замедление с лёгким перелётом: f(0)=0, f(1)=1, начальная скорость f'(0) = C1 + 3
const C1 = 1.25, C3 = C1 + 1;
const easeOutBack = (t) => 1 + C3 * (t - 1) ** 3 + C1 * (t - 1) ** 2;
const mod = (a, n) => ((a % n) + n) % n;

export class ReelView {
  // fit — блок, в который надо вписать барабаны (вместе с рамкой вокруг canvas)
  constructor(canvas, machine, strips, fit = canvas.parentElement) {
    this.fit = fit;
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.m = machine;
    this.strips = strips;
    this.pos = strips.map((s) => Math.floor(Math.random() * s.length));
    this.reel = strips.map(() => ({ mode: 'idle', v: 0 }));
    this.images = {};
    this.sprites = {};
    this.hl = null;
    this.running = false;
    this.cell = 0;
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

  destroy() { this.ro.disconnect(); this.running = false; this.dead = true; }

  resize() {
    // рамка = всё, что между canvas и блоком fit (отступы и бордюры обёртки)
    const fr = this.c.parentElement, cs = getComputedStyle(fr);
    const padX = fr === this.fit ? 0 : parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const padY = fr === this.fit ? 0 : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const w = this.fit.clientWidth - padX, h = this.fit.clientHeight - padY;
    const cell = Math.max(20, Math.floor(Math.min(w / REELS, h / ROWS)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cell === this.cell && dpr === this.dpr) return;
    this.cell = cell; this.dpr = dpr;
    this.c.style.width = cell * REELS + 'px';
    this.c.style.height = cell * ROWS + 'px';
    this.c.width = Math.round(cell * REELS * dpr);
    this.c.height = Math.round(cell * ROWS * dpr);
    this.buildSprites();
    this.draw();
  }

  get S() { return Math.round(this.cell * this.dpr); }

  buildSprites() { for (const id of Object.keys(this.m.symbols)) this.buildSprite(id); }

  // Символ рисуется один раз в клетку нужного размера (+ размытая копия для быстрого вращения)
  buildSprite(id) {
    const S = this.S;
    if (!S) return;
    const s = this.m.symbols[id];
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const special = !!LABEL_BG[id];
    // мягкое свечение под символом
    const rg = g.createRadialGradient(S / 2, S * 0.46, S * 0.05, S / 2, S * 0.46, S * 0.5);
    rg.addColorStop(0, hexA(s.color, special ? 0.55 : 0.28));
    rg.addColorStop(1, hexA(s.color, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
    const img = this.images[id];
    const area = s.label ? 0.8 : 0.88;
    if (img) {
      const k = Math.min((S * area) / img.width, (S * area) / img.height);
      const w = img.width * k, h = img.height * k;
      g.drawImage(img, (S - w) / 2, (s.label ? S * 0.43 : S / 2) - h / 2, w, h);
    } else {
      // запасной значок, пока нет картинки
      const r = S * 0.36, cy = s.label ? S * 0.42 : S / 2;
      const cg = g.createRadialGradient(S / 2 - r * 0.3, cy - r * 0.4, r * 0.1, S / 2, cy, r);
      cg.addColorStop(0, lighten(s.color, 0.55));
      cg.addColorStop(1, s.color);
      g.fillStyle = cg;
      g.beginPath(); g.arc(S / 2, cy, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = S * 0.025; g.strokeStyle = '#f5d77a'; g.stroke();
      g.font = `${Math.round(S * 0.4)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff';
      g.fillText(s.emoji, S / 2, cy + S * 0.02);
    }
    if (s.label) {
      const [c1, c2] = LABEL_BG[id];
      const w = S * 0.84, h = S * 0.2, x = (S - w) / 2, y = S * 0.76;
      const lg = g.createLinearGradient(0, y, 0, y + h);
      lg.addColorStop(0, c1); lg.addColorStop(1, c2);
      g.fillStyle = lg;
      roundRect(g, x, y, w, h, h * 0.45); g.fill();
      g.lineWidth = Math.max(1, S * 0.012); g.strokeStyle = 'rgba(255,255,255,.75)'; g.stroke();
      let fs = h * 0.66;
      g.font = `${Math.round(fs)}px "Russo One", "Arial Black", sans-serif`;
      while (g.measureText(s.label).width > w * 0.86 && fs > 6) { fs -= 1; g.font = `${Math.round(fs)}px "Russo One", "Arial Black", sans-serif`; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = Math.max(1.5, S * 0.018); g.strokeStyle = 'rgba(40,10,0,.85)';
      g.strokeText(s.label, S / 2, y + h * 0.54);
      g.fillStyle = '#fff';
      g.fillText(s.label, S / 2, y + h * 0.54);
    }
    // размытая по вертикали копия
    const bl = document.createElement('canvas');
    bl.width = bl.height = S;
    const b = bl.getContext('2d');
    // равное усреднение копий (каждая следующая с прозрачностью 1/(i+1)) — ровный след без «колец»
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      b.globalAlpha = 1 / (i + 1);
      b.drawImage(cv, 0, (i / (steps - 1) - 0.5) * S * 0.3);
    }
    this.sprites[id] = { sharp: cv, blur: bl };
  }

  // ===== вращение =====
  // stops — верхние клетки остановки; anticipation[r] — держать барабан r дольше (интрига)
  spin(stops, { turbo = false, anticipation = [] } = {}) {
    this.hl = null;
    const now = performance.now();
    const V = turbo ? 34 : 24;           // клеток в секунду
    let t = turbo ? 330 : 700;
    const gap = turbo ? 90 : 200;
    this.reel = stops.map((stop, r) => {
      if (r) t += gap;
      if (anticipation[r]) t += turbo ? 600 : 1000;
      return { mode: 'spin', start: now + r * (turbo ? 15 : 50), stopAt: now + t, stop, v: 0, V, turbo, ant: !!anticipation[r] };
    });
    return new Promise((res) => { this.resolveSpin = res; this.loop(); });
  }

  // нажали «Стоп» во время вращения — остановить всё поскорее
  slam() {
    const now = performance.now();
    this.reel.forEach((rl, r) => {
      if (rl.mode === 'spin') { rl.stopAt = Math.min(rl.stopAt, now + r * 60); rl.ant = false; }
    });
  }

  get spinning() { return this.reel.some((r) => r.mode !== 'idle'); }

  // сейчас «ждёт» ли барабан r (все левее остановились, он помечен ожиданием)
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
        // короткий рывок вверх, потом разгон вниз
        rl.v = e < 90 ? -2.5 : rl.V * Math.min(1, (e - 90) / 170) * (this.waiting(r) ? 0.8 : 1);
        this.pos[r] -= rl.v * dt;
        if (now >= rl.stopAt && e > 260) {
          const d = rl.turbo ? 0.26 : 0.36; // секунд на торможение
          const D = (Math.max(rl.v, 8) * d) / (C1 + 3);
          const p = this.pos[r];
          const f0 = Math.floor(p - D);
          // на полном ходу символы размыты — незаметно «перескакиваем» так, чтобы приехать ровно в stop
          rl.from = rl.stop + (p - f0);
          rl.to = rl.stop;
          rl.t0 = now; rl.d = d * 1000;
          rl.mode = 'stopping';
          this.pos[r] = rl.from;
        }
        else this.pos[r] = mod(this.pos[r], L);
      } else if (rl.mode === 'stopping') {
        const k = Math.min(1, (now - rl.t0) / rl.d);
        this.pos[r] = rl.from + (rl.to - rl.from) * easeOutBack(k);
        rl.v = k < 0.35 ? rl.V : 0;
        if (k >= 1) {
          this.pos[r] = rl.stop;
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
      if (this.spinning || this.hl) requestAnimationFrame(frame);
      else this.running = false;
    };
    requestAnimationFrame(frame);
  }

  // ===== подсветка выигрыша =====
  // cells — [[барабан, ряд]], lines — номера линий (рисуются поверх), dimOthers — притушить остальное
  showWins(cells, lines = [], dimOthers = true) {
    this.hl = { cells: new Set(cells.map(([r, row]) => r + ',' + row)), lines, dim: dimOthers, t0: performance.now() };
    this.loop();
  }

  clearWins() { this.hl = null; this.draw(); }

  draw(now = performance.now()) {
    const g = this.ctx, S = this.S;
    if (!S) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    const t = this.hl ? (now - this.hl.t0) / 1000 : 0;
    for (let r = 0; r < REELS; r++) {
      const x = r * S, strip = this.strips[r], L = strip.length, p = this.pos[r];
      const rl = this.reel[r];
      g.save();
      g.beginPath(); g.rect(x, 0, S, S * ROWS); g.clip();
      const bg = g.createLinearGradient(0, 0, 0, S * ROWS);
      bg.addColorStop(0, 'rgba(0,0,0,.55)'); bg.addColorStop(0.5, 'rgba(10,8,20,.30)'); bg.addColorStop(1, 'rgba(0,0,0,.55)');
      g.fillStyle = bg;
      g.fillRect(x, 0, S, S * ROWS);
      const fast = Math.abs(rl.v) > 7;
      const k0 = Math.floor(p) - 1;
      const later = [];
      for (let k = k0; k <= k0 + ROWS + 1; k++) {
        const y = (k - p) * S;
        if (y <= -S || y >= S * ROWS) continue;
        const id = strip[mod(k, L)];
        const sp = this.sprites[id];
        if (!sp) continue;
        const row = Math.round(k - p);
        const settled = rl.mode === 'idle';
        const on = this.hl && settled && this.hl.cells.has(r + ',' + row);
        if (on) { later.push([id, x, y]); continue; }
        g.globalAlpha = this.hl && settled && this.hl.dim ? 0.38 : 1;
        g.drawImage(fast ? sp.blur : sp.sharp, x, y);
        g.globalAlpha = 1;
      }
      // выигрышные клетки — поверх, с пульсом и рамкой
      for (const [id, cx, cy] of later) {
        const sc = 1 + 0.07 * Math.sin(t * 7);
        const sp = this.sprites[id].sharp;
        g.save();
        g.translate(cx + S / 2, cy + S / 2); g.scale(sc, sc);
        g.drawImage(sp, -S / 2, -S / 2);
        g.restore();
        g.lineWidth = S * 0.03;
        g.strokeStyle = `rgba(255,220,110,${0.55 + 0.4 * Math.sin(t * 7)})`;
        roundRect(g, cx + S * 0.05, cy + S * 0.05, S * 0.9, S * 0.9, S * 0.12); g.stroke();
      }
      // «ожидание» — светящаяся рамка вокруг крутящегося барабана
      if (this.waiting(r)) {
        const a = 0.55 + 0.45 * Math.sin(now / 90);
        g.lineWidth = S * 0.06;
        g.strokeStyle = `rgba(255,200,60,${a})`;
        g.shadowColor = '#ffcc33'; g.shadowBlur = S * 0.25;
        g.strokeRect(x + S * 0.03, S * 0.03, S * 0.94, S * ROWS - S * 0.06);
        g.shadowBlur = 0;
      }
      g.restore();
    }
    // разделители барабанов
    g.fillStyle = 'rgba(255,215,120,.35)';
    for (let r = 1; r < REELS; r++) g.fillRect(r * S - Math.max(1, S * 0.006), 0, Math.max(2, S * 0.012), S * ROWS);
    // линии выигрыша
    if (this.hl) {
      for (const li of this.hl.lines) {
        const line = LINES[li];
        g.beginPath();
        g.moveTo(0, line[0] * S + S / 2);
        line.forEach((row, r) => g.lineTo(r * S + S / 2, row * S + S / 2));
        g.lineTo(REELS * S, line[REELS - 1] * S + S / 2);
        g.lineJoin = 'round'; g.lineCap = 'round';
        g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = S * 0.075; g.stroke();
        g.strokeStyle = LINE_COLORS[li]; g.lineWidth = S * 0.04;
        g.shadowColor = LINE_COLORS[li]; g.shadowBlur = S * 0.12;
        g.stroke();
        g.shadowBlur = 0;
      }
    }
  }
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

function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let [r, g, b] = hex.length === 4
    ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
    : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
