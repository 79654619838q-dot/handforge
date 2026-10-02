// Общее для всех экранов: числа, картинки с запасным значком, окна, всплывашки, дождь монет, шапка.
import { asset, COMMON, GIFT } from './machines.js';
import { state, save } from './state.js';
import { sfx } from './audio.js';

export const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

// ---------- плавные числа ----------
export class Counter {
  constructor(el, value = 0) { this.el = el; this.value = this.target = value; this.raf = 0; this.res = null; this.el.textContent = fmt(value); }
  set(target, ms = 500, onTick) {
    cancelAnimationFrame(this.raf);
    const prev = this.res; this.res = null; prev?.();
    this.target = target;
    const from = this.value, t0 = performance.now();
    if (ms <= 0 || from === target) { this.value = target; this.el.textContent = fmt(target); return Promise.resolve(); }
    return new Promise((res) => {
      this.res = res;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        this.value = from + (target - from) * (1 - (1 - k) ** 3);
        this.el.textContent = fmt(this.value);
        onTick?.();
        if (k < 1) this.raf = requestAnimationFrame(step); else this.finish();
      };
      this.raf = requestAnimationFrame(step);
    });
  }
  // досчитать сразу до конца
  finish() {
    if (!this.res) return;
    cancelAnimationFrame(this.raf);
    this.value = this.target; this.el.textContent = fmt(this.target);
    const r = this.res; this.res = null; r();
  }
}

// ---------- картинка с запасным значком ----------
export function pic(src, emoji, cls = '') {
  return `<span class="pic ${cls}"><img src="${src}" alt="" data-emo="${esc(emoji)}"></span>`;
}
export function wirePics(root) {
  root.querySelectorAll('img[data-emo]').forEach((img) => {
    const fail = () => { const s = document.createElement('span'); s.className = 'emo'; s.textContent = img.dataset.emo; img.replaceWith(s); };
    if (img.complete && !img.naturalWidth) fail(); else img.addEventListener('error', fail, { once: true });
  });
}
export const symPic = (m, id, cls) => {
  const s = m.symbols[id];
  return s.text ? `<span class="pic sym-text ${cls || ''}" style="--c:${s.color}">${pic(s.img, s.emoji)}<b>${s.text}</b></span>` : pic(s.img, s.emoji, cls);
};

// надпись-логотип из ChatGPT; пока картинки нет — тот же текст шрифтом
export function logoPic(src, text, cls = '') {
  return `<span class="logo-pic ${cls}"><img src="${src}" alt="${esc(text.replace(/<[^>]+>/g, ''))}"><span class="txt">${text}</span></span>`;
}
export function wireLogos(root) {
  root.querySelectorAll('.logo-pic img').forEach((img) => {
    const ok = () => img.parentElement.classList.add('ok');
    if (img.complete && img.naturalWidth) ok(); else img.addEventListener('load', ok, { once: true });
  });
}
export function wireAll(root) { wirePics(root); wireLogos(root); }

// ---------- всплывающие окна ----------
export const layer = document.createElement('div');
layer.id = 'layer';
document.body.append(layer);

export function modal(html, { cls = '', closeOnBg = false } = {}) {
  const el = document.createElement('div');
  el.className = 'modal ' + cls;
  el.innerHTML = `<div class="modal-box">${html}</div>`;
  layer.append(el);
  wireAll(el);
  requestAnimationFrame(() => el.classList.add('show'));
  let closed = false;
  const close = () => { if (closed) return; closed = true; el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
  if (closeOnBg) el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('.x')?.addEventListener('click', close);
  return { el, close };
}
export const anyModal = () => !!layer.querySelector('.modal');

// всплывашки идут стопкой сверху и не перекрывают друг друга
export function toast(html, ms = 2600, cls = '') {
  let stack = layer.querySelector('.toasts');
  if (!stack) { stack = document.createElement('div'); stack.className = 'toasts'; layer.append(stack); }
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.innerHTML = html;
  stack.append(el);
  wireAll(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---------- дождь монет ----------
const coinImg = new Image();
coinImg.src = COMMON.coin;
// host — окно, под содержимым которого сыплются монеты (чтобы не закрывали сумму)
export function coinShower(seconds = 3, rate = 40, host = layer) {
  const cv = document.createElement('canvas');
  cv.className = 'coins-fx';
  host.prepend(cv);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const parts = [];
  const t0 = performance.now();
  let last = t0, acc = 0;
  const size = Math.max(26, Math.min(W, H) * 0.06);
  return new Promise((res) => {
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const age = (now - t0) / 1000;
      if (age < seconds) {
        acc += rate * dt;
        while (acc > 1) {
          acc--;
          parts.push({ x: Math.random() * W, y: -size, vx: (Math.random() - 0.5) * 120, vy: 150 + Math.random() * 250, a: Math.random() * 6, va: 4 + Math.random() * 8, s: size * (0.6 + Math.random() * 0.6) });
        }
      }
      g.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
        const sx = Math.abs(Math.cos(p.a));
        g.save(); g.translate(p.x, p.y); g.scale(Math.max(0.15, sx), 1);
        if (coinImg.naturalWidth) g.drawImage(coinImg, -p.s / 2, -p.s / 2, p.s, p.s);
        else {
          const gr = g.createRadialGradient(-p.s * 0.15, -p.s * 0.15, 1, 0, 0, p.s / 2);
          gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#f2c230'); gr.addColorStop(1, '#a86e00');
          g.fillStyle = gr; g.beginPath(); g.arc(0, 0, p.s / 2, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#7a4d00'; g.lineWidth = p.s * 0.06; g.stroke();
        }
        g.restore();
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].y > H + size) parts.splice(i, 1);
      if (cv.isConnected && (age < seconds || parts.length)) requestAnimationFrame(frame);
      else { cv.remove(); res(); }
    };
    requestAnimationFrame(frame);
  });
}

// ---------- шапка: уровень, кошелёк, звук ----------
// hud — счётчики текущего экрана (их обновляют и автомат, и награды из meta.js)
export const hud = { bal: null, jp: null, level: null };

export function topRight() {
  return `
    <button class="lvl-badge" title="Уровень игрока">${pic(COMMON.star, '⭐', 'lvl-star')}<b class="lvl-n">${state.level}</b><i class="lvl-bar"><s></s></i></button>
    <a class="icon-btn lux-btn" href="#/lux" title="Магазин роскоши">${pic(COMMON.wealth, '💎', 'lb-ico')}</a>
    <div class="wallet" title="Ваши монеты (ненастоящие)">${pic(COMMON.coin, '🪙', 'coin')}<span class="bal">${fmt(state.balance)}</span></div>
    <button class="icon-btn sound" title="Звук">${state.sound ? '🔊' : '🔇'}</button>`;
}

export function wireTop(root, { levelInfo, onLevel } = {}) {
  const b = root.querySelector('.sound');
  b?.addEventListener('click', () => {
    state.sound = !state.sound; save();
    b.textContent = state.sound ? '🔊' : '🔇';
    sfx.click();
  });
  hud.bal = new Counter(root.querySelector('.bal'), state.balance);
  const badge = root.querySelector('.lvl-badge');
  hud.level = () => {
    const info = levelInfo();
    badge.querySelector('.lvl-n').textContent = info.level;
    badge.querySelector('.lvl-bar s').style.width = Math.round(info.frac * 100) + '%';
  };
  hud.level();
  badge.addEventListener('click', () => { sfx.click(); onLevel?.(); });
}

export function giftModal(after) {
  sfx.coins();
  const { el, close } = modal(`
    ${pic(COMMON.gift, '🎁', 'big-pic')}
    <h2>Монеты закончились!</h2>
    <p>Держите подарок — <b>${fmt(GIFT)}</b> монет. Деньги ненастоящие, играйте сколько хочется.</p>
    <button class="btn-gold take">Забрать подарок</button>`, { cls: 'gift' });
  el.querySelector('.take').addEventListener('click', () => {
    state.balance += GIFT; state.stats.gifts++; save();
    sfx.coins();
    coinShower(1.8, 50);
    hud.bal?.set(state.balance, 800);
    close();
    after?.();
  });
}

export { asset };
