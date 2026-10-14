// Визуальные эффекты: живые искры и пепел на фоне, вспышки и осколки ударов, разрезы, лучи редких находок,
// большая надпись (новый уровень, победа), наклон карточек за мышью. Всё — без картинок, canvas и CSS.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── искры / пепел / снег на фоне ──
let cv, cx, parts = [], mode = 'embers', raf = 0, W = 0, Hh = 0;
const MODES = {
  embers: { n: 70, col: () => `hsla(${20 + Math.random() * 25},100%,${55 + Math.random() * 20}%,`, vy: [-0.9, -0.3], vx: [-0.25, 0.25], r: [0.6, 2.2] },
  ash: { n: 60, col: () => `hsla(30,10%,${60 + Math.random() * 25}%,`, vy: [0.15, 0.5], vx: [-0.3, 0.3], r: [0.6, 1.8] },
  snow: { n: 90, col: () => 'hsla(200,60%,95%,', vy: [0.3, 1.0], vx: [-0.4, 0.2], r: [0.8, 2.4] },
  spirits: { n: 45, col: () => `hsla(${140 + Math.random() * 30},90%,65%,`, vy: [-0.5, -0.15], vx: [-0.2, 0.2], r: [0.8, 2.6] },
  spores: { n: 55, col: () => `hsla(${80 + Math.random() * 40},70%,60%,`, vy: [-0.3, 0.2], vx: [-0.3, 0.3], r: [0.6, 2.0] },
};
const rr = (a, b) => a + Math.random() * (b - a);
function spawn(top = false) {
  const m = MODES[mode];
  const up = m.vy[1] < 0;
  return { x: Math.random() * W, y: top ? (up ? Hh + 10 : -10) : Math.random() * Hh, vx: rr(...m.vx), vy: rr(...m.vy), r: rr(...m.r), a: rr(0.25, 0.9), c: m.col(), t: Math.random() * 6.28, w: rr(0.01, 0.04) };
}
function resize() { W = cv.width = innerWidth; Hh = cv.height = innerHeight; }
function tick() {
  raf = requestAnimationFrame(tick);
  if (document.hidden) return;
  cx.clearRect(0, 0, W, Hh);
  cx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    p.t += p.w; p.x += p.vx + Math.sin(p.t) * 0.3; p.y += p.vy;
    if (p.y < -20 || p.y > Hh + 20 || p.x < -20 || p.x > W + 20) Object.assign(p, spawn(true));
    const fl = 0.6 + 0.4 * Math.sin(p.t * 3);
    cx.beginPath(); cx.fillStyle = p.c + (p.a * fl).toFixed(2) + ')';
    cx.shadowBlur = p.r * 6; cx.shadowColor = p.c + '0.9)';
    cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill();
  }
}
export function startParticles() {
  if (reduce || cv) return;
  cv = document.createElement('canvas'); cv.id = 'particles'; document.body.prepend(cv);
  cx = cv.getContext('2d'); resize(); addEventListener('resize', resize);
  setParticles('embers'); tick();
}
export function setParticles(m) {
  if (!cx || !MODES[m] || (m === mode && parts.length)) return;
  mode = m; parts = Array.from({ length: Math.round(MODES[m].n * Math.min(1, W / 1200 + 0.3)) }, () => spawn());
}
export const LAND_FX = { forest: 'spores', swamp: 'spirits', caves: 'ash', mountains: 'snow', ash: 'embers', castle: 'spirits' };

// ── удар: осколки-искры, разрез, тряска ──
export function burst(el, { color = '#ffcf7a', n = 18, big = false } = {}) {
  if (!el || reduce) return;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width * (0.35 + Math.random() * 0.3), y = r.top + r.height * (0.3 + Math.random() * 0.3);
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i'); d.className = 'spark';
    const ang = Math.random() * 6.283, dist = (big ? 140 : 80) * (0.4 + Math.random());
    d.style.cssText = `left:${x}px;top:${y}px;background:${color};box-shadow:0 0 8px ${color};--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist}px;--s:${0.5 + Math.random()}`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 750);
  }
}
export function slash(el, color = '#fff') {
  if (!el || reduce) return;
  const r = el.getBoundingClientRect();
  const d = document.createElement('div'); d.className = 'slash';
  d.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height * 0.45}px;--rot:${-35 + Math.random() * 70}deg;--c:${color}`;
  document.body.appendChild(d); setTimeout(() => d.remove(), 450);
}
export function shake(power = 1) {
  if (reduce) return;
  const a = document.getElementById('app');
  a.style.setProperty('--sh', `${6 * power}px`);
  a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake');
}

// ── большая надпись по центру: «Новый уровень», «Победа», «Хозяин земли» ──
export function banner(title, sub = '', kind = 'gold') {
  const d = document.createElement('div'); d.className = `banner ${kind}`;
  d.innerHTML = `<div class="rays"></div><div class="bt">${title}</div>${sub ? `<div class="bs">${sub}</div>` : ''}`;
  document.body.appendChild(d); setTimeout(() => d.remove(), 2600);
}

// ── наклон карточек за мышью и блик ──
export function tilt(root = document) {
  if (reduce || matchMedia('(hover: none)').matches) return;
  root.querySelectorAll('.tilt').forEach((el) => {
    if (el._tilt) return; el._tilt = true;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--rx', `${(0.5 - py) * 10}deg`); el.style.setProperty('--ry', `${(px - 0.5) * 12}deg`);
      el.style.setProperty('--gx', `${px * 100}%`); el.style.setProperty('--gy', `${py * 100}%`);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  });
}

// ── параллакс фона за мышью ──
export function parallax() {
  if (reduce || matchMedia('(hover: none)').matches) return;
  addEventListener('pointermove', (e) => {
    const x = (e.clientX / innerWidth - 0.5), y = (e.clientY / innerHeight - 0.5);
    document.documentElement.style.setProperty('--px', `${x * -14}px`);
    document.documentElement.style.setProperty('--py', `${y * -10}px`);
  });
}
