import * as THREE from 'three';

// Процедурные текстуры на canvas. Когда появятся нарисованные ассеты
// (public/assets/<тема>/cell_*.png), их можно подставить в themes.js вместо этих.

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Сглаженный value-noise, fbm из нескольких октав.
export function makeNoise(seed = 1) {
  const r = rng(seed);
  const P = 256;
  const g = new Float32Array(P * P).map(() => r());
  const smooth = (t) => t * t * (3 - 2 * t);
  // per — период решётки: при целом per текстура бесшовно повторяется.
  const n = (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const w = (v) => (per ? ((v % per) + per) % per : v);
    const i = (a, b) => g[((w(b) & (P - 1)) * P) + (w(a) & (P - 1))];
    const a = i(xi, yi), b = i(xi + 1, yi), c = i(xi, yi + 1), d = i(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y, oct = 5, per = 0) => {
    let v = 0, amp = 0.5, f = 1;
    for (let o = 0; o < oct; o++) { v += n(x * f, y * f, per ? per * f : 0) * amp; amp *= 0.5; f *= 2; }
    return v;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// Карта высот → карта нормалей (Собель): даёт рельеф без геометрии.
export function heightToNormal(heightCanvas, strength = 2.5) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w);
  const out = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    out.data[i] = (nx * 0.5 + 0.5) * 255; out.data[i + 1] = (-ny * 0.5 + 0.5) * 255; out.data[i + 2] = (nz * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

function tex(c, srgb = true, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// Заливка шумом между двумя цветами + параллельно карта высот.
function fillNoise(size, seed, c1, c2, scale, contrast = 1) {
  const noise = makeNoise(seed);
  const [col, cg] = canvas(size), [hgt, hg] = canvas(size);
  const ci = cg.createImageData(size, size), hi = hg.createImageData(size, size);
  const a = hex(c1), b = hex(c2);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = noise(x / size * scale, y / size * scale, 5, Math.round(scale));
    v = Math.min(1, Math.max(0, (v - 0.5) * contrast + 0.5));
    const [r, g, bl] = mix(a, b, v);
    const i = (y * size + x) * 4;
    ci.data[i] = r; ci.data[i + 1] = g; ci.data[i + 2] = bl; ci.data[i + 3] = 255;
    hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = v * 255; hi.data[i + 3] = 255;
  }
  cg.putImageData(ci, 0, 0); hg.putImageData(hi, 0, 0);
  return { col, cg, hgt, hg };
}

function crackLines(g, r, n, x0, y0, len, width, color) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    let x = x0 ?? r() * g.canvas.width, y = y0 ?? r() * g.canvas.height, a = r() * Math.PI * 2;
    g.beginPath(); g.moveTo(x, y);
    const steps = 4 + Math.floor(r() * 6);
    for (let s = 0; s < steps; s++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * len / steps; y += Math.sin(a) * len / steps; g.lineTo(x, y); }
    g.stroke();
  }
}

// Грань клетки: цвет, нормали, свечение (рамка/гравировка — то, что светится при наведении/выборе).
function makeCellTexturesRaw(theme, variant = 0) {
  const S = 256;
  const r = rng(variant * 97 + theme.length * 13 + 7);
  const seed = variant * 31 + 11;
  let base;
  const [emi, eg] = canvas(S);
  eg.fillStyle = '#000'; eg.fillRect(0, 0, S, S);
  const frame = (inset, w, color = '#fff', target = eg) => { target.strokeStyle = color; target.lineWidth = w; target.strokeRect(inset, inset, S - inset * 2, S - inset * 2); };

  switch (theme) {
    case 'desert': {
      base = fillNoise(S, seed, '#3e2a18', '#8a6a44', 6, 1.3);
      const { cg, hg } = base;
      // гравированная кайма и знак
      for (const [g, c] of [[cg, 'rgba(60,35,15,0.7)'], [hg, '#000']]) { g.strokeStyle = c; g.lineWidth = 6; g.strokeRect(22, 22, S - 44, S - 44); }
      if (variant % 2 === 0) for (const [g, c] of [[cg, 'rgba(60,35,15,0.6)'], [hg, '#111'], [eg, '#fff']]) {
        g.strokeStyle = c; g.lineWidth = 5; g.beginPath(); g.arc(S / 2, S / 2, 40, 0, Math.PI * 2); g.moveTo(S / 2, S / 2 - 60); g.lineTo(S / 2, S / 2 + 60); g.moveTo(S / 2 - 60, S / 2); g.lineTo(S / 2 + 60, S / 2); g.stroke();
      }
      crackLines(cg, r, 3, null, null, 80, 2, 'rgba(40,22,8,0.6)');
      frame(22, 5);
      break;
    }
    case 'space': {
      base = fillNoise(S, seed, '#262c35', '#3c434e', 8, 0.6);
      const { cg, hg } = base;
      for (let i = 0; i < 90; i++) { cg.fillStyle = `rgba(255,255,255,${r() * 0.05})`; cg.fillRect(0, r() * S, S, 1); }
      for (const [g, c] of [[cg, 'rgba(0,0,0,0.6)'], [hg, '#000']]) { g.strokeStyle = c; g.lineWidth = 4; g.strokeRect(12, 12, S - 24, S - 24); g.beginPath(); g.moveTo(12, S / 2); g.lineTo(S - 12, S / 2); g.stroke(); }
      for (const [x, y] of [[26, 26], [S - 26, 26], [26, S - 26], [S - 26, S - 26]]) {
        for (const [g, c] of [[cg, '#8a939f'], [hg, '#fff']]) { g.fillStyle = c; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
      }
      eg.fillStyle = '#fff'; eg.fillRect(40, S / 2 - 4, S - 80, 3);
      frame(6, 3);
      break;
    }
    case 'bunker': {
      base = fillNoise(S, seed, '#232220', '#4d4b47', 10, 1.2);
      const { cg, hg } = base;
      for (let i = 0; i < 6; i++) { cg.fillStyle = `rgba(20,15,10,${0.1 + r() * 0.2})`; cg.beginPath(); cg.arc(r() * S, r() * S, 10 + r() * 40, 0, Math.PI * 2); cg.fill(); }
      // полосы опасности по одному краю
      if (variant % 2 === 0) {
        cg.save(); cg.beginPath(); cg.rect(0, S - 30, S, 30); cg.clip();
        for (let x = -30; x < S + 30; x += 30) { cg.fillStyle = '#c9a227'; cg.beginPath(); cg.moveTo(x, S); cg.lineTo(x + 15, S); cg.lineTo(x + 45, S - 30); cg.lineTo(x + 30, S - 30); cg.fill(); }
        cg.restore();
      }
      for (const [g, c] of [[cg, 'rgba(0,0,0,0.55)'], [hg, '#000']]) { g.strokeStyle = c; g.lineWidth = 3; g.strokeRect(8, 8, S - 16, S - 16); }
      crackLines(cg, r, 2, null, null, 70, 1.5, 'rgba(0,0,0,0.6)');
      frame(8, 4);
      break;
    }
    case 'jungle': {
      base = fillNoise(S, seed, '#20251c', '#4c5343', 7, 1.3);
      const { cg, hg } = base;
      const moss = makeNoise(seed + 5);
      const img = cg.getImageData(0, 0, S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const m = moss(x / S * 5, y / S * 5);
        if (m > 0.55) { const i = (y * S + x) * 4; const k = Math.min(1, (m - 0.55) * 5); img.data[i] = lerp(img.data[i], 48, k); img.data[i + 1] = lerp(img.data[i + 1], 92, k); img.data[i + 2] = lerp(img.data[i + 2], 32, k); }
      }
      cg.putImageData(img, 0, 0);
      for (const [g, c] of [[cg, 'rgba(15,18,10,0.7)'], [hg, '#000'], [eg, '#fff']]) {
        g.strokeStyle = c; g.lineWidth = 5; g.beginPath();
        const k = variant % 3;
        if (k === 0) { g.arc(S / 2, S / 2, 50, 0, Math.PI * 2); g.moveTo(S / 2 + 25, S / 2); g.arc(S / 2, S / 2, 25, 0, Math.PI * 2); }
        else if (k === 1) { g.moveTo(S / 2, 70); g.lineTo(S - 70, S / 2); g.lineTo(S / 2, S - 70); g.lineTo(70, S / 2); g.closePath(); }
        else { for (let i = 0; i < 3; i++) { g.moveTo(80, 90 + i * 38); g.lineTo(S - 80, 90 + i * 38); } }
        g.stroke();
      }
      for (const [g, c] of [[cg, 'rgba(15,18,10,0.6)'], [hg, '#000']]) { g.strokeStyle = c; g.lineWidth = 4; g.strokeRect(16, 16, S - 32, S - 32); }
      frame(16, 3);
      break;
    }
    case 'iceberg': default: {
      base = fillNoise(S, seed, '#1e3448', '#6f93ad', 5, 1.1);
      const { cg, hg } = base;
      crackLines(cg, r, 7, null, null, 110, 1.5, 'rgba(255,255,255,0.85)');
      crackLines(hg, r, 7, null, null, 110, 2, '#000');
      crackLines(eg, rng(variant * 97 + theme.length * 13 + 7), 7, null, null, 110, 2, 'rgba(255,255,255,0.7)');
      for (const [g, c] of [[cg, 'rgba(255,255,255,0.5)'], [hg, '#fff']]) { g.strokeStyle = c; g.lineWidth = 3; g.strokeRect(6, 6, S - 12, S - 12); }
      frame(6, 4);
      break;
    }
  }
  return { map: tex(base.col), normalMap: tex(heightToNormal(base.hgt, 1.2), false), emissiveMap: tex(emi) };
}

// Трещины, прорастающие по клетке перед уничтожением. progress 0..1 перерисовывает текстуру.
export function makeCrackOverlay(seed) {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rng(seed);
  const paths = [];
  for (let k = 0; k < 9; k++) {
    let x = S / 2 + (r() - 0.5) * 30, y = S / 2 + (r() - 0.5) * 30, a = (k / 9) * Math.PI * 2 + r() * 0.4;
    const pts = [[x, y]];
    for (let s = 0; s < 8; s++) { a += (r() - 0.5) * 0.9; const l = 14 + r() * 14; x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
    paths.push(pts);
  }
  const t = tex(c);
  const draw = (p) => {
    g.clearRect(0, 0, S, S);
    for (const [w, col] of [[7, 'rgba(255,120,30,0.35)'], [2.5, '#fff3c8']]) {
      g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const pts of paths) {
        const n = Math.max(1, Math.floor(p * (pts.length - 1)));
        g.beginPath(); g.moveTo(...pts[0]);
        for (let i = 1; i <= n; i++) g.lineTo(...pts[i]);
        g.stroke();
      }
    }
    t.needsUpdate = true;
  };
  draw(0);
  return { texture: t, draw };
}

export function gradientTexture(stops, w = 16, h = 512) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, h);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  return tex(c);
}

export function softDot(color = '#ffffff') {
  const [c, g] = canvas(64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, color); grd.addColorStop(0.3, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(c);
}

export function smokeTexture(seed = 3) {
  const S = 256;
  const noise = makeNoise(seed);
  const [c, g] = canvas(S);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    const v = noise(x / S * 4, y / S * 4) * Math.max(0, 1 - d * d);
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, v * 330);
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

// Большая поверхность земли/стен: шум + нормали, с повтором.
function surfaceTexturesRaw(c1, c2, scale, seed, repeat, contrast = 1.2, normalStrength = 3) {
  const b = fillNoise(256, seed, c1, c2, scale, contrast);
  const map = tex(b.col, true, repeat);
  const normalMap = tex(heightToNormal(b.hgt, normalStrength), false, repeat);
  return { map, normalMap };
}

// Попиксельные текстуры считаются один раз за игру: мир создаётся дважды на испытание (заставка и поле),
// и шум/рельеф пересчитывались каждый раз (профиль 25.09: ~1,2 с на испытание). Каждый вызов получает
// свои копии текстур (их можно освобождать), картинка у копий общая — в видеокарту она уходит один раз.
const texMemo = new Map();
export function memoTextures(key, make) {
  if (!texMemo.has(key)) texMemo.set(key, make());
  const out = {};
  for (const [k, v] of Object.entries(texMemo.get(key))) out[k] = v?.isTexture ? v.clone() : v;
  return out;
}
export const makeCellTextures = (theme, variant = 0) => memoTextures(`cell:${theme}:${variant}`, () => makeCellTexturesRaw(theme, variant));
export const surfaceTextures = (...a) => memoTextures('surf:' + a.join(','), () => surfaceTexturesRaw(...a));
