// Общие помощники: цвета и геометрия гладких контуров для векторной куклы.

export function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

// amt > 0 — к белому, amt < 0 — к чёрному (с лёгким тёплым оттенком в тенях).
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex([r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt]);
  const k = 1 + amt;
  return rgbToHex([r * k + 6 * -amt, g * k, b * k + 10 * -amt]);
}

export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

const f = (n) => Math.round(n * 10) / 10;

// Сглаживание Catmull-Rom → кубические кривые Безье.
export function smooth(pts, closed = false, tension = 1) {
  if (pts.length < 2) return '';
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${f(P[1][0])} ${f(P[1][1])}`;
  const t = tension / 6;
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}

// Конечность/рукав: толщина задаётся в каждой точке, концы скруглены.
export function limb(points, widths, capStart = 0.55, capEnd = 0.55) {
  const n = points.length;
  const L = [], R = [];
  const tan = (i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  for (let i = 0; i < n; i++) {
    const [tx, ty] = tan(i), w = widths[i];
    L.push([points[i][0] - ty * w, points[i][1] + tx * w]);
    R.push([points[i][0] + ty * w, points[i][1] - tx * w]);
  }
  const [sx, sy] = tan(0), [ex, ey] = tan(n - 1);
  const s = [points[0][0] - sx * widths[0] * capStart, points[0][1] - sy * widths[0] * capStart];
  const e = [points[n - 1][0] + ex * widths[n - 1] * capEnd, points[n - 1][1] + ey * widths[n - 1] * capEnd];
  return smooth([s, ...L, e, ...R.reverse()], true);
}

// Точка на ломаной по доле длины (0..1).
export function along(points, t) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    seg.push(l);
    total += l;
  }
  let d = t * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? d / seg[i] : 0;
      const a = points[i], b = points[i + 1];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[1] - a[1], b[0] - a[0])];
    }
    d -= seg[i];
  }
  return [...points[points.length - 1], 0];
}

// Детерминированный псевдослучай — одинаковые узоры при каждом рисовании.
export function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  s = s || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
