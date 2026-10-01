// Барабаны на canvas: вращение с размытием, остановка с отскоком, «ожидание» на последних барабанах,
// помощники (превращение «?», подарочные WILD, маска на весь барабан, липкие WILD) и подсветка выигрыша.
// Исход вращения решает engine.js до старта — здесь только показ.
import { REELS, ROWS, LINES } from './engine.js';

export const LINE_COLORS = [
  '#ffd84a', '#ff5a5a', '#5ad1ff', '#7dff6a', '#ff8ff0', '#ffa64a', '#b48cff', '#4affc8', '#ff4a8d', '#c8ff4a',
  '#4a8dff', '#ffef9e', '#ff7a4a', '#9effe0', '#e09eff', '#ffc24a', '#4affff', '#ff9e9e', '#a6ff9e', '#9eb8ff',
];

const LABEL_BG = {
  wild: ['#ffe07a', '#c8860e'],
  scatter: ['#d38bff', '#6a1fb8'],
  jackpot: ['#ff6a6a', '#a8101a'],
  pick: ['#ffc46a', '#8a4a10'],
};

// замедление с лёгким перелётом: f(0)=0, f(1)=1, начальная скорость f'(0) = C1 + 3
const C1 = 1.25, C3 = C1 + 1;
const easeOutBack = (t) => 1 + C3 * (t - 1) ** 3 + C1 * (t - 1) ** 2;
const easeOut = (t) => 1 - (1 - t) ** 3;
const mod = (a, n) => ((a % n) + n) % n;
const key = (r, row) => r + ',' + row;

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
    this.ov = new Map();      // подменённые клетки после остановки: «?», подарок
    this.sticky = new Map();  // липкие WILD: клетка → когда прилип
    this.exp = new Map();     // барабан → когда маска растянулась
    this.animUntil = 0;
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

  // Рисованная рамка из ChatGPT: kx, ky — во сколько раз она шире и выше окна с барабанами
  setFrameArt(k) { this.art = k; this.cell = 0; this.resize(); }

  // другие ленты (бесплатные вращения крутятся на своих)
  setStrips(strips) {
    this.strips = strips;
    this.pos = this.pos.map((p, r) => mod(Math.round(p), strips[r].length));
    this.draw();
  }

  resize() {
    let w, h;
    if (this.art) {
      w = this.fit.clientWidth / this.art.kx; h = this.fit.clientHeight / this.art.ky;
    } else {
      // рамка = всё, что между canvas и блоком fit (отступы и бордюры обёртки)
      const fr = this.c.parentElement, cs = getComputedStyle(fr);
      const padX = fr === this.fit ? 0 : parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const padY = fr === this.fit ? 0 : parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      w = this.fit.clientWidth - padX; h = this.fit.clientHeight - padY;
    }
    const cell = Math.max(20, Math.floor(Math.min(w / REELS, h / ROWS)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cell === this.cell && dpr === this.dpr) return;
    this.cell = cell; this.dpr = dpr;
    this.c.style.width = cell * REELS + 'px';
    this.c.style.height = cell * ROWS + 'px';
    this.c.width = Math.round(cell * REELS * dpr);
    this.c.height = Math.round(cell * ROWS * dpr);
    this.onResize?.(cell * REELS, cell * ROWS);
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
    const special = !!LABEL_BG[id] || !!s.text;
    // мягкое свечение под символом
    const rg = g.createRadialGradient(S / 2, S * 0.46, S * 0.05, S / 2, S * 0.46, S * 0.5);
    rg.addColorStop(0, hexA(s.color, special ? 0.55 : 0.28));
    rg.addColorStop(1, hexA(s.color, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
    const img = this.images[id];
    const area = s.label ? 0.8 : 0.88;
    const cy = s.label ? S * 0.42 : S / 2;
    if (img) {
      const k = Math.min((S * area) / img.width, (S * area) / img.height);
      const w = img.width * k, h = img.height * k;
      g.drawImage(img, (S - w) / 2, (s.label ? S * 0.43 : S / 2) - h / 2, w, h);
    } else {
      // запасной значок, пока нет картинки
      const r = S * 0.36;
      const cg = g.createRadialGradient(S / 2 - r * 0.3, cy - r * 0.4, r * 0.1, S / 2, cy, r);
      cg.addColorStop(0, lighten(s.color, 0.55));
      cg.addColorStop(1, s.color);
      g.fillStyle = cg;
      g.beginPath(); g.arc(S / 2, cy, r, 0, Math.PI * 2); g.fill();
      g.lineWidth = S * 0.025; g.strokeStyle = '#f5d77a'; g.stroke();
      if (s.emoji) {
        g.font = `${Math.round(S * 0.4)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#fff';
        g.fillText(s.emoji, S / 2, cy + S * 0.02);
      }
    }
    // крупная надпись поверх: множитель «×3» всегда, «?» — только на запасном значке
    if (s.text && (s.mult || !img)) {
      const fs = S * (s.text.length > 1 ? 0.36 : 0.5);
      g.font = `${Math.round(fs)}px "Russo One", "Arial Black", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const tg = g.createLinearGradient(0, S / 2 - fs / 2, 0, S / 2 + fs / 2);
      tg.addColorStop(0, '#fffbe0'); tg.addColorStop(0.5, '#ffd34a'); tg.addColorStop(1, '#ff8a00');
      g.lineWidth = S * 0.05; g.strokeStyle = 'rgba(60,10,0,.9)'; g.lineJoin = 'round';
      g.strokeText(s.text, S / 2, S / 2 + fs * 0.05);
      g.fillStyle = tg;
      g.fillText(s.text, S / 2, S / 2 + fs * 0.05);
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
    this.ov.clear();
    this.exp.clear();
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
      if (this.spinning || this.hl || now < this.animUntil) requestAnimationFrame(frame);
      else this.running = false;
    };
    requestAnimationFrame(frame);
  }

  kick(ms = 900) { this.animUntil = Math.max(this.animUntil, performance.now() + ms); this.loop(); }

  // ===== помощники =====
  // cells — [[барабан, ряд]] стали символом sym; kind: 'mystery' (переворот) | 'gift' (прилёт)
  setOverride(cells, sym, kind) {
    const t0 = performance.now();
    cells.forEach(([r, row], i) => this.ov.set(key(r, row), { sym, kind, t0: t0 + (kind === 'gift' ? i * 120 : 0) }));
    this.kick(1200);
  }
  // липкие WILD: keys — 'r,row'; новые вспыхивают
  setSticky(keys) {
    const now = performance.now();
    const next = new Map();
    for (const k of keys) next.set(k, this.sticky.get(k) ?? now);
    this.sticky = next;
    this.kick(900);
  }
  setExpanded(reels) {
    const now = performance.now();
    reels.forEach((r, i) => this.exp.set(r, now + i * 150));
    this.kick(1200);
  }

  // ===== подсветка выигрыша =====
  // cells — [[барабан, ряд]], lines — номера линий (рисуются поверх), dimOthers — притушить остальное
  showWins(cells, lines = [], dimOthers = true) {
    this.hl = { cells: new Set(cells.map(([r, row]) => key(r, row))), lines, dim: dimOthers, t0: performance.now() };
    this.loop();
  }

  clearWins() { this.hl = null; this.draw(); }

  // один символ в клетке: pulse — выигрышная клетка, alpha, scaleX/scale — для анимаций
  cellDraw(g, id, x, y, { blur = false, alpha = 1, scaleX = 1, scale = 1 } = {}) {
    const sp = this.sprites[id];
    if (!sp) return;
    const S = this.S;
    g.globalAlpha = alpha;
    if (scaleX === 1 && scale === 1) g.drawImage(blur ? sp.blur : sp.sharp, x, y);
    else {
      g.save();
      g.translate(x + S / 2, y + S / 2); g.scale(scaleX * scale, scale);
      g.drawImage(sp.sharp, -S / 2, -S / 2);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  draw(now = performance.now()) {
    const g = this.ctx, S = this.S;
    if (!S) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    const t = this.hl ? (now - this.hl.t0) / 1000 : 0;
    const pulse = 1 + 0.07 * Math.sin(t * 7);
    const frames = [];
    for (let r = 0; r < REELS; r++) {
      const x = r * S, strip = this.strips[r], L = strip.length, p = this.pos[r];
      const rl = this.reel[r];
      const idle = rl.mode === 'idle';
      g.save();
      g.beginPath(); g.rect(x, 0, S, S * ROWS); g.clip();
      const bg = g.createLinearGradient(0, 0, 0, S * ROWS);
      bg.addColorStop(0, 'rgba(0,0,0,.55)'); bg.addColorStop(0.5, 'rgba(10,8,20,.30)'); bg.addColorStop(1, 'rgba(0,0,0,.55)');
      g.fillStyle = bg;
      g.fillRect(x, 0, S, S * ROWS);
      const fast = Math.abs(rl.v) > 7;
      const k0 = Math.floor(p) - 1;
      for (let k = k0; k <= k0 + ROWS + 1; k++) {
        const y = (k - p) * S;
        if (y <= -S || y >= S * ROWS) continue;
        let id = strip[mod(k, L)];
        const row = Math.round(k - p);
        const ck = key(r, row);
        if (idle && this.sticky.has(ck)) continue; // липкий WILD нарисуем поверх, на месте
        const on = this.hl && idle && this.hl.cells.has(ck);
        const dim = this.hl && idle && this.hl.dim && !on ? 0.38 : 1;
        const o = idle && this.ov.get(ck);
        if (o) {
          const a = (now - o.t0) / 1000;
          if (o.kind === 'mystery') {
            // переворот: «?» сжимается, раскрывается новый символ
            if (a < 0.22) { this.cellDraw(g, id, x, y, { scaleX: Math.max(0.02, 1 - a / 0.22) }); continue; }
            id = o.sym;
            if (a < 0.44) { this.cellDraw(g, id, x, y, { scaleX: Math.max(0.02, (a - 0.22) / 0.22) }); continue; }
          } else if (o.kind === 'gift') {
            if (a < 0) { this.cellDraw(g, id, x, y, { alpha: dim }); continue; }
            id = o.sym;
            if (a < 0.4) {
              this.cellDraw(g, id, x, y, { scale: Math.max(0.05, easeOutBack(a / 0.4)) });
              ring(g, x, y, S, `rgba(255,240,150,${1 - a / 0.4})`, 1 + a);
              continue;
            }
          } else id = o.sym;
        }
        if (on) { this.cellDraw(g, id, x, y, { scale: pulse }); frames.push([x, y]); }
        else this.cellDraw(g, id, x, y, { blur: fast, alpha: dim });
      }
      // маска на весь барабан: растёт от середины
      const e0 = idle && this.exp.get(r);
      if (e0 !== undefined && e0 !== false) {
        const k = Math.max(0, Math.min(1, (now - e0) / 450));
        if (k > 0) {
          const h = S * ROWS * easeOut(k), y0 = (S * ROWS - h) / 2;
          const cg = g.createLinearGradient(0, y0, 0, y0 + h);
          cg.addColorStop(0, 'rgba(255,214,90,.55)'); cg.addColorStop(0.5, 'rgba(120,70,0,.75)'); cg.addColorStop(1, 'rgba(255,214,90,.55)');
          g.fillStyle = cg;
          g.fillRect(x + S * 0.04, y0, S * 0.92, h);
          g.save();
          g.beginPath(); g.rect(x, y0, S, h); g.clip();
          const sc = 1.45 * (this.hl ? pulse : 1);
          this.cellDraw(g, 'wild', x, S, { scale: sc });
          g.restore();
          g.lineWidth = S * 0.035; g.strokeStyle = `rgba(255,230,140,${0.6 + 0.4 * Math.sin(now / 120)})`;
          roundRect(g, x + S * 0.05, y0 + S * 0.03, S * 0.9, Math.max(1, h - S * 0.06), S * 0.12); g.stroke();
        }
      }
      // липкие WILD — стоят на месте, пока остальное крутится
      for (const [ck, since] of this.sticky) {
        const [sr, srow] = ck.split(',').map(Number);
        if (sr !== r) continue;
        const y = srow * S;
        g.fillStyle = 'rgba(10,6,4,.96)';
        g.fillRect(x + 1, y + 1, S - 2, S - 2);
        const on = this.hl && idle && this.hl.cells.has(ck);
        this.cellDraw(g, 'wild', x, y, { scale: on ? pulse : 1 });
        const a = (now - since) / 1000;
        ring(g, x, y, S, a < 0.6 ? `rgba(255,240,150,${1 - a / 0.6})` : 'rgba(255,200,80,.75)', a < 0.6 ? 1 + a * 0.5 : 1, a < 0.6 ? 0.05 : 0.025);
        if (on) frames.push([x, y]);
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
    // рамки выигрышных клеток
    for (const [fx, fy] of frames) {
      g.lineWidth = S * 0.03;
      g.strokeStyle = `rgba(255,220,110,${0.55 + 0.4 * Math.sin(t * 7)})`;
      roundRect(g, fx + S * 0.05, fy + S * 0.05, S * 0.9, S * 0.9, S * 0.12); g.stroke();
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

function ring(g, x, y, S, color, scale = 1, width = 0.05) {
  g.save();
  g.translate(x + S / 2, y + S / 2); g.scale(scale, scale);
  g.lineWidth = S * width; g.strokeStyle = color;
  roundRect(g, -S * 0.45, -S * 0.45, S * 0.9, S * 0.9, S * 0.14); g.stroke();
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

function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let [r, g, b] = hex.length === 4
    ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
    : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
