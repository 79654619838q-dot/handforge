// Отрисовка вещей. Каждый рендер возвращает { defs, layers: { слой: svg } }.
import { shade, smooth, limb, rng, mix } from './util.js';
import { torsoX, WAIST_Y, armPoints, ARM_W, handOf, legPoints, LEG_WIDTHS, POSES } from './body.js';
import { flowerDeco, crystalDeco, pearl, shell } from './hair.js';

const n1 = (v) => Math.round(v * 10) / 10;

// ---------- ткань: градиенты, узоры, складки ----------
function fabricDefs(P, id, c) {
  return `
  <linearGradient id="${P}${id}" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${shade(c, -0.3)}"/><stop offset=".22" stop-color="${shade(c, -0.05)}"/>
    <stop offset=".45" stop-color="${shade(c, 0.18)}"/><stop offset=".6" stop-color="${c}"/>
    <stop offset=".85" stop-color="${shade(c, -0.12)}"/><stop offset="1" stop-color="${shade(c, -0.32)}"/>
  </linearGradient>
  <linearGradient id="${P}${id}v" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset=".25" stop-color="#000" stop-opacity="0"/>
    <stop offset=".85" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".12"/>
  </linearGradient>`;
}

function star(x, y, r, ri = r * 0.45, pts = 5) {
  let d = '';
  for (let i = 0; i < pts * 2; i++) {
    const rr = i % 2 ? ri : r, a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
    d += (i ? 'L' : 'M') + n1(x + Math.cos(a) * rr) + ' ' + n1(y + Math.sin(a) * rr);
  }
  return d + 'Z';
}
function heart(x, y, s) {
  return `M${x} ${y + s * 0.9} C${x - s * 1.4} ${y} ${x - s * 0.9} ${y - s} ${x} ${y - s * 0.35} C${x + s * 0.9} ${y - s} ${x + s * 1.4} ${y} ${x} ${y + s * 0.9} Z`;
}
function sparkle(x, y, r) {
  return `M${x} ${y - r} Q${x + r * 0.15} ${y - r * 0.15} ${x + r} ${y} Q${x + r * 0.15} ${y + r * 0.15} ${x} ${y + r} Q${x - r * 0.15} ${y + r * 0.15} ${x - r} ${y} Q${x - r * 0.15} ${y - r * 0.15} ${x} ${y - r} Z`;
}
function snowflake(x, y, r, col = '#fff', w = 1.2) {
  let o = '';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r;
    o += `M${n1(x)} ${n1(y)}L${n1(ex)} ${n1(ey)}`;
    const bx = x + Math.cos(a) * r * 0.55, by = y + Math.sin(a) * r * 0.55;
    o += `M${n1(bx)} ${n1(by)}L${n1(bx + Math.cos(a + 0.8) * r * 0.3)} ${n1(by + Math.sin(a + 0.8) * r * 0.3)}M${n1(bx)} ${n1(by)}L${n1(bx + Math.cos(a - 0.8) * r * 0.3)} ${n1(by + Math.sin(a - 0.8) * r * 0.3)}`;
  }
  return `<path d="${o}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
}

function patternDef(P, id, kind, col, acc) {
  const light = shade(col, 0.55), dark = shade(col, -0.35);
  const a = acc || light;
  const pat = (w, h, body, rot = 0) => `<pattern id="${P}${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot})">${body}</pattern>`;
  switch (kind) {
    case 'dots': return pat(18, 18, `<circle cx="4" cy="4" r="2.6" fill="${a}"/><circle cx="13" cy="13" r="2.6" fill="${a}"/>`);
    case 'stripes': return pat(16, 16, `<rect width="7" height="16" fill="${a}" opacity=".75"/>`, 0);
    case 'plaid': return pat(28, 28, `<rect width="28" height="8" y="10" fill="${a}" opacity=".35"/><rect width="8" height="28" x="10" fill="${a}" opacity=".35"/><rect width="28" height="2" y="4" fill="${dark}" opacity=".4"/><rect width="2" height="28" x="4" fill="${dark}" opacity=".4"/>`);
    case 'flowers': return pat(34, 34, `${flowerDeco(9, 9, a, 6)}${flowerDeco(26, 25, light, 5)}<path d="M24 8 q4 -4 8 0 q-4 4 -8 0" fill="#7cc27c" opacity=".8"/>`);
    case 'stars': return pat(30, 30, `<path d="${star(8, 8, 4.5)}" fill="${a}"/><path d="${star(23, 22, 3)}" fill="${light}"/><circle cx="22" cy="7" r="1" fill="#fff"/>`);
    case 'hearts': return pat(26, 26, `<path d="${heart(7, 7, 4)}" fill="${a}"/><path d="${heart(20, 19, 3.4)}" fill="${light}"/>`);
    case 'sparkle': return pat(22, 22, `<path d="${sparkle(5, 5, 3)}" fill="#fff" opacity=".9"/><circle cx="16" cy="14" r="1.1" fill="#fff" opacity=".8"/><circle cx="9" cy="18" r=".8" fill="#fff" opacity=".7"/>`);
    case 'snow': return pat(34, 34, `${snowflake(9, 9, 5, a, 1)}${snowflake(26, 26, 4, light, 0.9)}`);
    case 'scales': return pat(16, 12, `<path d="M0 0 Q8 12 16 0" fill="none" stroke="${a}" stroke-width="1.3" opacity=".8"/><path d="M-8 6 Q0 18 8 6 M8 6 Q16 18 24 6" fill="none" stroke="${a}" stroke-width="1.3" opacity=".8"/>`);
    case 'damask': return pat(36, 44, `<path d="M18 4 C26 12 26 22 18 26 C10 22 10 12 18 4 Z M18 26 C22 32 22 38 18 42 C14 38 14 32 18 26 Z" fill="none" stroke="${a}" stroke-width="1.2" opacity=".7"/><circle cx="0" cy="22" r="2" fill="${a}" opacity=".7"/><circle cx="36" cy="22" r="2" fill="${a}" opacity=".7"/>`);
    case 'lace': return pat(14, 14, `<circle cx="7" cy="7" r="4" fill="none" stroke="#fff" stroke-width="1" opacity=".75"/><circle cx="0" cy="0" r="2" fill="#fff" opacity=".6"/><circle cx="14" cy="14" r="2" fill="#fff" opacity=".6"/>`);
    case 'leaves': return pat(30, 30, `<path d="M6 20 Q10 8 20 6 Q16 18 6 20 Z" fill="${a}" opacity=".8"/><path d="M6 20 L20 6" stroke="${dark}" stroke-width=".6"/>`);
    case 'bats': return pat(40, 34, `<path d="M20 12 q-6 -6 -14 -2 q4 2 4 6 q3 -2 6 1 l4 -3 l4 3 q3 -3 6 -1 q0 -4 4 -6 q-8 -4 -14 2 Z" fill="${a}" opacity=".85"/>`);
    case 'gradient': return '';
    default: return '';
  }
}

// ---------- юбки ----------
function hemScallop(x0, x1, y, n, depth, r) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    pts.push([x, y + (i % 2 ? depth : 0) + (r ? (r() - 0.5) * depth * 0.4 : 0) + Math.sin(t * Math.PI) * 6]);
  }
  return pts;
}

const SKIRTS = {
  ball: { R: [[236, 366], [270, 398], [304, 468], [332, 566], [350, 666], [358, 748]], hemN: 12, depth: 10 },
  aline: { R: [[236, 366], [252, 432], [270, 560], [288, 732]], hemN: 8, depth: 5 },
  midi: { R: [[236, 366], [254, 430], [270, 520], [280, 586]], hemN: 8, depth: 5 },
  short: { R: [[236, 366], [256, 420], [270, 486]], hemN: 8, depth: 4 },
  tutu: { R: [[236, 366], [272, 390], [304, 438], [312, 472]], hemN: 14, depth: 14 },
  mermaid: { R: [[236, 366], [244, 430], [240, 520], [232, 600], [252, 664], [284, 724], [304, 752]], hemN: 12, depth: 8 },
  column: { R: [[236, 366], [244, 432], [246, 560], [252, 734]], hemN: 6, depth: 3 },
  tiered: { R: [[236, 366], [262, 420], [290, 520], [316, 640], [332, 742]], hemN: 12, depth: 9 },
  pleated: { R: [[236, 366], [258, 420], [272, 480]], hemN: 12, depth: 3 },
  flared: { R: [[236, 366], [266, 400], [288, 460], [298, 520]], hemN: 12, depth: 7 },
};

function skirtGeom(kind) {
  const s = SKIRTS[kind];
  const R = s.R;
  const L = R.map(([x, y]) => [400 - x, y]);
  const hemY = R[R.length - 1][1];
  const hx0 = R[R.length - 1][0], hx1 = 400 - hx0;
  const r = rng('hem' + kind);
  const hem = hemScallop(hx0, hx1, hemY, s.hemN, s.depth, r).slice(1, -1);
  const d = smooth([[200, 364], ...R, ...hem, ...L.reverse()], true, 0.9);
  return { d, R, hemY, hx0, hx1, hem: [R[R.length - 1], ...hem, [hx1, hemY]], top: 366 };
}

function folds(g, col, count) {
  let o = '';
  const hw = g.hx0 - 200;
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const xt = 170 + 60 * t, xb = 200 - hw + 2 * hw * t;
    const midX = (xt + xb) / 2 + (t - 0.5) * 14;
    const yb = g.hemY - 6;
    const d = `M${n1(xt)} ${g.top + 10} Q${n1(midX)} ${n1((g.top + yb) / 2)} ${n1(xb)} ${yb}`;
    o += `<path d="${d}" fill="none" stroke="${shade(col, -0.45)}" stroke-width="${2.2}" opacity=".16"/>`;
    o += `<path d="${d}" transform="translate(5 0)" fill="none" stroke="#fff" stroke-width="3" opacity=".12"/>`;
  }
  return o;
}

// ---------- лиф ----------
function bodiceTop(neck) {
  const X = (y) => torsoX(y);
  switch (neck) {
    case 'sweetheart': return [[400 - X(300), 300], [172, 294], [188, 300], [200, 312], [212, 300], [228, 294], [X(300), 300]];
    case 'strapless': return [[400 - X(302), 302], [200, 308], [X(302), 302]];
    case 'straps': return [[400 - X(300), 300], [200, 304], [X(300), 300]];
    case 'offshoulder': return [[134, 296], [170, 304], [200, 310], [230, 304], [266, 296]];
    case 'vneck': return [[146, 282], [168, 272], [186, 272], [200, 318], [214, 272], [232, 272], [254, 282]];
    case 'high': return [[146, 282], [168, 270], [187, 262], [200, 264], [213, 262], [232, 270], [254, 282]];
    case 'halter': return [[400 - X(300), 300], [186, 280], [200, 300], [214, 280], [X(300), 300]];
    case 'square': return [[152, 282], [164, 280], [168, 306], [232, 306], [236, 280], [248, 282]];
    default: return [[146, 282], [168, 272], [186, 270], [200, 284], [214, 270], [232, 272], [254, 282]]; // round
  }
}
function bodicePath(neck, bottom = WAIST_Y, point = 10) {
  const top = bodiceTop(neck);
  const yR = top[top.length - 1][1];
  const R = [];
  for (let y = yR + 10; y < bottom; y += 12) R.push([torsoX(y) + 1.5, y]);
  R.push([torsoX(bottom) + 1.5, bottom]);
  const Lside = R.map(([x, y]) => [400 - x, y]).reverse();
  return smooth([...top, ...R, [200, bottom + point], ...Lside], true, 0.8);
}

function straps(neck, col) {
  if (neck === 'straps') return `<path d="M176 300 L170 276 M224 300 L230 276" stroke="${col}" stroke-width="5" stroke-linecap="round"/>`;
  if (neck === 'halter') return `<path d="M186 282 Q190 262 200 262 Q210 262 214 282" fill="none" stroke="${col}" stroke-width="5"/>`;
  return '';
}

// ---------- рукава (идут вдоль руки в текущей позе) ----------
function sleeve(kind, pose, side, col, P, gid) {
  const pts = armPoints(pose, side);
  const mid = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const f = `fill="url(#${P}${gid})" stroke="${shade(col, -0.4)}" stroke-width="1.2"`;
  switch (kind) {
    case 'puff': {
      const a = pts[0], e = pts[2];
      return `<path d="${limb([a, mid(a, e, 0.3), mid(a, e, 0.55)], [19, 23, 14], 0.9, 0.4)}" ${f}/>
        <path d="${limb([mid(a, e, 0.12), mid(a, e, 0.5)], [3, 3])}" fill="#fff" opacity=".25"/>
        <path d="${limb([mid(a, e, 0.55), mid(a, e, 0.6)], [11, 11], 0.1, 0.1)}" fill="${shade(col, -0.2)}"/>`;
    }
    case 'short': { const a = pts[0], e = pts[2]; return `<path d="${limb([a, mid(a, e, 0.5)], [17, 14], 0.8, 0.2)}" ${f}/>`; }
    case 'cap': { const a = pts[0], e = pts[2]; return `<path d="${limb([a, mid(a, e, 0.28)], [16, 15], 0.8, 0.2)}" ${f}/>`; }
    case 'long': return `<path d="${limb(pts, ARM_W.map((w) => w + 3.5), 0.8, 0.1)}" ${f}/>
        <path d="${limb([mid(pts[3], pts[4], 0.7), pts[4]], [11, 11], 0.1, 0.1)}" fill="${shade(col, -0.18)}" stroke="${shade(col, -0.4)}" stroke-width="1"/>`;
    case 'lace': return `<path d="${limb(pts, ARM_W.map((w) => w + 2.5), 0.8, 0.1)}" fill="${col}" opacity=".5" stroke="${shade(col, -0.2)}" stroke-width="1"/>
        <path d="${limb(pts, ARM_W.map((w) => w + 2.5), 0.8, 0.1)}" fill="url(#${P}lacePat)" opacity=".9"/>`;
    case 'bishop': return `<path d="${limb(pts, [17, 14, 13, 17, 22], 0.8, 0.2)}" ${f}/>
        <path d="${limb([mid(pts[3], pts[4], 0.9), pts[4]], [21, 12], 0.1, 0.1)}" fill="${shade(col, -0.15)}"/>`;
    case 'offband': {
      const a = pts[0], e = pts[2];
      return `<path d="${limb([mid(a, e, 0.12), mid(a, e, 0.3), mid(a, e, 0.48)], [15, 18, 13], 0.8, 0.6)}" ${f}/>`;
    }
    case 'fur': return `<path d="${limb(pts, ARM_W.map((w) => w + 3.5), 0.8, 0.1)}" ${f}/>` + furBand(pts[4], 13);
    default: return '';
  }
}

// Мех: пушистая полоса через фильтр смещения, мягкая тень внутри.
let CP = '';
function furBand(p, r) {
  const [x, y] = p;
  return `<g filter="url(#${CP}fur)"><ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${r}" ry="${r * 0.62}" fill="#fdfcfa"/></g>
    <ellipse cx="${n1(x)}" cy="${n1(y + r * 0.2)}" rx="${r * 0.75}" ry="${r * 0.3}" fill="#d9d2c8" opacity=".45" filter="url(#${CP}blur2)"/>`;
}
function furLine(pts, r = 7, ermine = false) {
  const d = smooth(pts);
  let o = `<g filter="url(#${CP}fur)"><path d="${d}" fill="none" stroke="#fdfcfa" stroke-width="${r * 2}" stroke-linecap="round" stroke-linejoin="round"/></g>
    <path d="${d}" transform="translate(0 ${r * 0.45})" fill="none" stroke="#d9d2c8" stroke-width="${r * 0.7}" stroke-linecap="round" opacity=".5" filter="url(#${CP}blur2)"/>
    <path d="${d}" transform="translate(0 ${-r * 0.35})" fill="none" stroke="#fff" stroke-width="${r * 0.5}" stroke-linecap="round" opacity=".8" filter="url(#${CP}blur1)"/>`;
  if (ermine) for (let i = 2; i < pts.length; i += 4) o += `<path d="M${n1(pts[i][0])} ${n1(pts[i][1] - 3)} q-1.8 4 0 7 q1.8 -3 0 -7 Z" fill="#1d1a1f"/>`;
  return o;
}
function resample(pts, step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const l = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(l / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function bow(x, y, s, col) {
  const d = shade(col, -0.35);
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 0 C-8 -12 -24 -12 -24 0 C-24 12 -8 12 0 0 Z" fill="${col}" stroke="${d}" stroke-width="1"/>
    <path d="M0 0 C8 -12 24 -12 24 0 C24 12 8 12 0 0 Z" fill="${col}" stroke="${d}" stroke-width="1"/>
    <path d="M-2 2 L-10 22 L-4 20 L-1 24 Z M2 2 L10 22 L4 20 L1 24 Z" fill="${shade(col, -0.1)}" stroke="${d}" stroke-width=".8"/>
    <ellipse cx="0" cy="0" rx="5" ry="6" fill="${shade(col, 0.1)}" stroke="${d}" stroke-width="1"/>
    <path d="M-18 -4 Q-12 -8 -6 -3" stroke="#fff" stroke-width="1.5" fill="none" opacity=".5"/>
  </g>`;
}
function gem(x, y, r, col) {
  return `<path d="M${x} ${y - r} L${x + r * 0.9} ${y - r * 0.2} L${x + r * 0.55} ${y + r} L${x - r * 0.55} ${y + r} L${x - r * 0.9} ${y - r * 0.2} Z" fill="${col}" stroke="${shade(col, -0.45)}" stroke-width=".8"/>
    <path d="M${x - r * 0.5} ${y - r * 0.3} L${x} ${y - r * 0.8} L${x + r * 0.2} ${y - r * 0.2} Z" fill="#fff" opacity=".7"/>`;
}

// ---------- ПЛАТЬЕ ----------
function renderDress(it, ctx) {
  const { P, pose } = ctx;
  const p = it.p;
  const c = p.main, acc = p.acc || shade(c, -0.25);
  const gid = 'dr' + it.slot;
  let defs = fabricDefs(P, gid, c);
  let defsAcc = fabricDefs(P, gid + 'a', acc);
  defs += defsAcc;
  const patId = 'pt' + it.slot;
  if (p.pat && p.pat !== 'plain') defs += patternDef(P, patId, p.pat, c, p.patCol);
  defs += patternDef(P, 'lacePat', 'lace', '#fff');
  const L = { dress: '', dressTop: '', sleeves: '', dressBack: '', headBack: '' };
  const stroke = shade(c, -0.45);
  const fill = p.grad ? `url(#${P}${gid}g)` : `url(#${P}${gid})`;
  if (p.grad) {
    defs += `<linearGradient id="${P}${gid}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${p.grad}"/></linearGradient>`;
  }
  const overlay = (d) => (p.pat && p.pat !== 'plain' ? `<path d="${d}" fill="url(#${P}${patId})" opacity="${p.pat === 'sparkle' ? 0.9 : 0.85}"/>` : '');
  const ex = p.extra || [];

  // шлейф
  if (ex.includes('train')) {
    const tr = smooth([[176, 380], [224, 380], [310, 560], [360, 762], [290, 788], [200, 794], [110, 788], [40, 762], [90, 560]], true);
    L.dressBack += `<path d="${tr}" fill="${shade(c, -0.07)}" stroke="${stroke}" stroke-width="1.2"/>`;
    if (p.pat && p.pat !== 'plain') L.dressBack += `<path d="${tr}" fill="url(#${P}${patId})" opacity=".6"/>`;
    if (ex.includes('ermine')) L.dressBack += furLine([[40, 762], [100, 786], [200, 792], [300, 786], [360, 762]], 8, true);
  }
  // стоячий воротник-веер (королева)
  if (ex.includes('collar')) {
    const col = smooth([[200, 262], [150, 250], [118, 190], [128, 150], [160, 176], [200, 190], [240, 176], [272, 150], [282, 190], [250, 250]], true);
    L.headBack += `<path d="${col}" fill="#fffaf2" opacity=".92" stroke="#cbbfa8" stroke-width="1.2"/><path d="${col}" fill="url(#${P}lacePat)" opacity=".8"/>`;
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.95 + i * 0.1375);
      L.headBack += `<path d="M200 250 L${n1(200 + Math.cos(a) * 88)} ${n1(236 + Math.sin(a) * 88)}" stroke="#d8cbb0" stroke-width="1" opacity=".7"/>`;
    }
  }

  // купальник: только цельный лиф до бёдер
  if (p.skirt === 'swim') {
    const d = smooth([[164, 292], [200, 300], [236, 292], [torsoX(320) + 1, 320], [torsoX(360) + 1, 360], [torsoX(400) + 1, 400], [240, 432], [214, 428], [200, 440], [186, 428], [160, 432], [400 - torsoX(400) - 1, 400], [400 - torsoX(360) - 1, 360], [400 - torsoX(320) - 1, 320]], true, 0.8);
    L.dress += `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>${overlay(d)}
      <path d="M170 292 L166 270 M230 292 L234 270" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
    if (ex.includes('frill')) {
      const fr = smooth([[160, 400], [200, 404], [240, 400], [262, 440], [230, 452], [200, 448], [170, 452], [138, 440]], true);
      L.dress += `<path d="${fr}" fill="${shade(c, 0.15)}" stroke="${stroke}" stroke-width="1" opacity=".95"/>${overlay(fr)}`;
    }
    if (ex.includes('bow')) L.dressTop += bow(200, 302, 0.45, acc);
    return { defs, layers: L };
  }

  // юбка
  const g = skirtGeom(p.skirt || 'aline');
  let sk = `<path d="${g.d}" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`;
  sk += `<path d="${g.d}" fill="url(#${P}${gid}v)"/>`;
  sk += overlay(g.d);
  if (p.skirt === 'pleated') {
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      sk += `<path d="M${n1(166 + 68 * t)} 370 L${n1(g.hx1 + (g.hx0 - g.hx1) * t)} ${g.hemY - 2}" stroke="${stroke}" stroke-width="1" opacity=".35"/>`;
    }
  } else {
    sk += folds(g, c, p.skirt === 'ball' || p.skirt === 'tiered' ? 9 : 6);
  }
  // оверлей из фатина: лёгкий светлый слой
  if (ex.includes('tulle')) {
    const g2 = skirtGeom(p.skirt);
    sk += `<path d="${g2.d}" fill="#fff" opacity=".22"/>`;
    sk += `<path d="${g2.d}" fill="url(#${P}lacePat)" opacity=".25"/>`;
  }
  if (p.skirt === 'tiered' || ex.includes('ruffles')) {
    const levels = p.skirt === 'tiered' ? [0.34, 0.66] : [0.8];
    for (const k of levels) {
      const y = g.top + (g.hemY - g.top) * k;
      const w = (g.hx0 - 200) * (0.55 + 0.45 * k) + 8;
      const row = hemScallop(200 + w, 200 - w, y, 14, 7);
      sk += `<path d="${smooth(row)}" fill="none" stroke="${shade(c, -0.35)}" stroke-width="2" opacity=".6"/>
             <path d="${smooth(row.map(([x, yy]) => [x, yy - 3]))}" fill="none" stroke="${shade(c, 0.4)}" stroke-width="2.5" opacity=".6"/>`;
    }
  }
  if (p.skirt === 'tutu' || ex.includes('petals')) {
    const r = rng('petal' + it.id);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = g.hx1 + (g.hx0 - g.hx1) * t;
      const y = g.hemY - 4 + Math.sin(t * Math.PI) * 6;
      const ang = (t - 0.5) * 40;
      const pc = i % 2 ? shade(c, 0.18) : shade(acc, 0.1);
      sk += `<path d="M${n1(x)} ${n1(y - 26)} C${n1(x - 14)} ${n1(y - 4)} ${n1(x - 6)} ${n1(y + 16)} ${n1(x)} ${n1(y + 20 + r() * 6)} C${n1(x + 6)} ${n1(y + 16)} ${n1(x + 14)} ${n1(y - 4)} ${n1(x)} ${n1(y - 26)} Z" transform="rotate(${n1(ang)} ${n1(x)} ${n1(y)})" fill="${pc}" stroke="${shade(pc, -0.35)}" stroke-width=".9" opacity=".95"/>`;
    }
  }
  // кайма подола
  if (p.trim) {
    const hem = resample(g.hem, 6);
    if (p.trim === 'fur') sk += furLine(g.hem.map(([x, y]) => [x, y - 3]), 7);
    else if (p.trim === 'lace') sk += hem.map(([x, y], i) => (i % 2 ? '' : `<circle cx="${n1(x)}" cy="${n1(y + 1)}" r="4.5" fill="#fff" stroke="#ddd" stroke-width=".6" opacity=".95"/>`)).join('');
    else if (p.trim === 'gold') sk += `<path d="${smooth(g.hem.map(([x, y]) => [x, y - 5]))}" fill="none" stroke="#e8c15a" stroke-width="4"/><path d="${smooth(g.hem.map(([x, y]) => [x, y - 12]))}" fill="none" stroke="#e8c15a" stroke-width="1.4" stroke-dasharray="2 5"/>`;
    else if (p.trim === 'pearls') sk += resample(g.hem, 9).map(([x, y]) => pearl(x, y - 5, 3)).join('');
    else sk += `<path d="${smooth(g.hem.map(([x, y]) => [x, y - 4]))}" fill="none" stroke="${p.trim}" stroke-width="5" opacity=".95"/>`;
  }
  if (ex.includes('gems')) {
    const r = rng('gems' + it.id);
    for (let i = 0; i < 26; i++) {
      const y = 380 + r() * (g.hemY - 400);
      const k = (y - g.top) / (g.hemY - g.top);
      const w = 34 + (g.hx0 - 234) * k;
      sk += `<path d="${sparkle(200 + (r() * 2 - 1) * w * 0.9, y, 2 + r() * 2.5)}" fill="#fff" opacity=".9"/>`;
    }
  }
  if (ex.includes('flowers')) {
    const r = rng('fl' + it.id);
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 7;
      sk += flowerDeco(g.hx1 + (g.hx0 - g.hx1) * t, g.hemY - 18 - r() * 30, p.patCol || shade(acc, 0.2), 8);
    }
  }
  if (ex.includes('embroidery')) {
    sk += `<path d="M200 380 L200 ${g.hemY - 20}" stroke="#e8c15a" stroke-width="3"/>`;
    for (let y = 400; y < g.hemY - 30; y += 40) sk += `<path d="${star(200, y, 7, 3, 4)}" fill="#f2cf64" stroke="#a87b16" stroke-width=".6"/>`;
  }
  L.dress += sk;

  // лиф
  const neck = p.neck || 'round';
  const bd = bodicePath(neck, WAIST_Y + 4, p.point ?? 10);
  const bfill = p.bodice ? `url(#${P}${gid}a)` : `url(#${P}${gid})`;
  const bcol = p.bodice ? acc : c;
  let top = `<path d="${bd}" fill="${bfill}" stroke="${shade(bcol, -0.45)}" stroke-width="1.3"/>`;
  if (p.pat && p.pat !== 'plain' && !p.bodice) top += overlay(bd);
  if (ex.includes('lace')) top += `<path d="${bd}" fill="url(#${P}lacePat)" opacity=".85"/>`;
  // вытачки и блик
  top += `<path d="M182 ${bodiceTop(neck)[3]?.[1] + 18 || 320} Q184 340 186 372 M218 ${bodiceTop(neck)[3]?.[1] + 18 || 320} Q216 340 214 372" fill="none" stroke="${shade(bcol, -0.5)}" stroke-width="1" opacity=".3"/>`;
  top += `<path d="M208 318 Q214 340 212 362" fill="none" stroke="#fff" stroke-width="4" opacity=".18" stroke-linecap="round"/>`;
  top += straps(neck, bcol);
  if (neck === 'offshoulder' || neck === 'sweetheart' || neck === 'strapless') {
    const tp = bodiceTop(neck);
    if (p.trim === 'fur' || ex.includes('furtop')) top += furLine(tp, 5.5);
    else top += `<path d="${smooth(tp)}" fill="none" stroke="${shade(bcol, 0.35)}" stroke-width="2.4" opacity=".8"/>`;
  }
  if (ex.includes('tee')) top += `<path d="M186 272 Q200 290 214 272" fill="none" stroke="${acc}" stroke-width="4"/>`;
  if (ex.includes('schoolcollar')) {
    top += `<path d="M186 270 L166 300 L196 292 Z M214 270 L234 300 L204 292 Z" fill="#fff" stroke="#bbb" stroke-width="1"/>` + bow(200, 292, 0.35, acc);
  }
  if (ex.includes('sportstripe')) top += `<path d="M150 300 L${torsoX(360) - 400 + 400 - 4} 360" stroke="#fff" stroke-width="0"/><path d="M${400 - torsoX(330)} 330 L${torsoX(330)} 330" stroke="${acc}" stroke-width="6"/><path d="M${400 - torsoX(344)} 344 L${torsoX(344)} 344" stroke="#fff" stroke-width="3"/>`;
  if (ex.includes('buttons')) for (let y = 300; y < 360; y += 16) top += `<circle cx="200" cy="${y}" r="2.6" fill="${shade(acc, 0.3)}" stroke="${shade(acc, -0.4)}" stroke-width=".6"/>`;
  if (ex.includes('corset')) for (let y = 316; y < 362; y += 9) top += `<path d="M194 ${y} L206 ${y + 6} M206 ${y} L194 ${y + 6}" stroke="${acc}" stroke-width="1.4"/>`;
  if (ex.includes('gems')) top += gem(200, neck === 'sweetheart' ? 322 : 306, 5, p.gemCol || '#ffd9f0');
  if (ex.includes('bodiceflowers')) top += flowerDeco(176, 306, shade(acc, 0.3), 7) + flowerDeco(226, 312, shade(acc, 0.15), 6);
  if (ex.includes('sash')) top += `<path d="M160 290 L246 396 L236 404 L150 300 Z" fill="${acc}" stroke="${shade(acc, -0.4)}" stroke-width="1"/><circle cx="232" cy="378" r="7" fill="#f2cf64" stroke="#a87b16"/>${star(232, 378, 5, 2.2)}`;
  // пояс
  if (p.belt) {
    const y = WAIST_Y - 2;
    const w = torsoX(y) - 200 + 2;
    top += `<path d="M${200 - w} ${y - 7} Q200 ${y - 3} ${200 + w} ${y - 7} L${200 + w + 1} ${y + 6} Q200 ${y + 10} ${200 - w - 1} ${y + 6} Z" fill="${p.belt}" stroke="${shade(p.belt, -0.4)}" stroke-width="1"/>`;
    if (ex.includes('bow')) top += bow(200, y, 0.55, p.belt);
    else top += gem(200, y, 5, '#fff3c4');
  } else if (ex.includes('bow')) top += bow(200, WAIST_Y, 0.55, acc);
  if (ex.includes('peplum')) {
    const pp = smooth([[164, 364], [200, 368], [236, 364], [262, 400], [230, 410], [200, 404], [170, 410], [138, 400]], true);
    top += `<path d="${pp}" fill="${bfill}" stroke="${stroke}" stroke-width="1.1"/>`;
  }
  L.dressTop += top;

  // рукава
  if (p.sleeve) {
    for (const side of ['L', 'R']) L.sleeves += sleeve(p.sleeve, pose, side, p.sleeveCol || bcol, P, p.sleeveCol ? gid + 'a' : (p.bodice ? gid + 'a' : gid));
  }
  if (p.trim === 'fur' && (p.sleeve === 'long' || p.sleeve === 'fur')) {
    for (const side of ['L', 'R']) L.sleeves += furBand(armPoints(pose, side)[4], 13);
  }
  return { defs, layers: L };
}

// Нижнее платье, когда наряд не выбран.
function renderBase(ctx) {
  const d = bodicePath('straps', 430, 0);
  return {
    layers: {
      base: `<path d="${d}" fill="#fff4f8" stroke="#d9b8c6" stroke-width="1.2"/>
        <path d="M176 300 L170 276 M224 300 L230 276" stroke="#fff4f8" stroke-width="4" stroke-linecap="round"/>
        <path d="M150 420 Q200 432 250 420" fill="none" stroke="#f2c6d6" stroke-width="3"/>` + bow(200, 302, 0.3, '#f7b8cf'),
    },
  };
}

// ---------- ВЕРХНЯЯ ОДЕЖДА ----------
function renderOuter(it, ctx) {
  const { P, pose } = ctx, p = it.p, c = p.main;
  const gid = 'ou';
  let defs = fabricDefs(P, gid, c);
  if (p.pat) defs += patternDef(P, 'ouPat', p.pat, c, p.patCol);
  const st = shade(c, -0.45);
  const L = { outerBack: '', outer: '', outerSleeves: '', headBack: '' };
  const f = `fill="url(#${P}${gid})" stroke="${st}" stroke-width="1.3"`;
  const pat = (d) => (p.pat ? `<path d="${d}" fill="url(#${P}ouPat)" opacity=".7"/>` : '');
  const len = p.len || 640;
  switch (p.kind) {
    case 'cape': case 'mantle': case 'cloak': {
      const wide = p.kind === 'mantle' ? 1.62 : p.kind === 'cloak' ? 1.42 : 1.46;
      const bottom = p.kind === 'mantle' ? 792 : Math.max(len, 740);
      const back = smooth([[166, 272], [234, 272], [264, 292], [200 + 88 * wide, 470], [200 + 110 * wide, bottom - 40], [200 + 120 * wide, bottom], [200, bottom + 6], [200 - 120 * wide, bottom], [200 - 110 * wide, bottom - 40], [200 - 88 * wide, 470], [136, 292]], true);
      L.outerBack += `<path d="${back}" fill="${shade(c, -0.12)}" stroke="${st}" stroke-width="1.3"/>` + pat(back);
      L.outerBack += `<path d="${back}" fill="url(#${P}${gid})" opacity=".6"/>`;
      // внутренняя сторона у плеч
      if (p.lining) for (const sd of [-1, 1]) L.outerBack += `<path d="${smooth([[200 + sd * 60, 300], [200 + sd * 78 * wide, 470], [200 + sd * 104 * wide, bottom - 30], [200 + sd * 118 * wide, bottom - 2], [200 + sd * 96 * wide, bottom - 60], [200 + sd * 66 * wide, 470], [200 + sd * 52, 330]], true)}" fill="${p.lining}" opacity=".85"/>`;
      // складки плаща
      for (const k of [-0.75, -0.4, 0.4, 0.75]) L.outerBack += `<path d="M${200 + k * 60} 300 Q${200 + k * 90 * wide} 520 ${200 + k * 118 * wide} ${bottom - 4}" fill="none" stroke="${shade(c, -0.45)}" stroke-width="3" opacity=".25"/>`;
      if (p.kind === 'cloak') {
        const hood = smooth([[140, 230], [128, 150], [150, 80], [200, 58], [250, 80], [272, 150], [260, 230], [230, 262], [170, 262]], true);
        L.headBack += `<path d="${hood}" ${f}/>` + `<path d="${hood}" fill="#000" opacity=".12"/>`;
      }
      // плечи спереди
      const sh = smooth([[150, 280], [176, 266], [200, 270], [224, 266], [250, 280], [262, 300], [248, 306], [200, 290], [152, 306], [138, 300]], true);
      L.outer += `<path d="${sh}" ${f}/>`;
      if (p.kind === 'mantle' || p.trim === 'fur') {
        L.outerBack += furLine([[200 - 120 * wide, bottom], [200, bottom + 8], [200 + 120 * wide, bottom]], 8, p.kind === 'mantle');
        L.outer += furLine([[140, 298], [170, 286], [200, 292], [230, 286], [260, 298]], 8, p.kind === 'mantle');
      }
      L.outer += `<circle cx="200" cy="284" r="6" fill="#f2cf64" stroke="#8a6414" stroke-width="1"/>` + gem(200, 284, 3.6, p.gem || '#e0415e');
      break;
    }
    case 'capelet': {
      const d = smooth([[150, 276], [186, 262], [214, 262], [250, 276], [272, 300], [276, 334], [250, 344], [200, 336], [150, 344], [124, 334], [128, 300]], true);
      L.outer += `<path d="${d}" ${f}/>` + pat(d);
      L.outer += furLine([[126, 334], [150, 344], [200, 338], [250, 344], [274, 334]], 8);
      L.outer += furLine([[176, 266], [200, 272], [224, 266]], 6);
      L.outer += `<circle cx="200" cy="290" r="4" fill="${p.acc || '#fff'}"/>`;
      break;
    }
    case 'coat': case 'jacket': case 'cardigan': case 'bolero': {
      const bottom = { coat: len, jacket: 402, cardigan: 500, bolero: 330 }[p.kind];
      const flare = { coat: 1, jacket: 0.3, cardigan: 0.45, bolero: 0 }[p.kind];
      const x = (y) => (y < WAIST_Y ? torsoX(y) + 4 : torsoX(WAIST_Y) + 4 + (y - WAIST_Y) * 0.22 * flare + (y < 430 ? 0 : 0));
      const open = p.kind === 'coat' ? 10 : p.kind === 'bolero' ? 36 : 22;
      for (const s of [-1, 1]) {
        const pts = [[200 + s * 16, 266], [200 + s * 38, 272], [200 + s * 56, 284]];
        for (let y = 300; y <= bottom; y += 20) pts.push([200 + s * (x(y) - 200), y]);
        pts.push([200 + s * (x(bottom) - 200), bottom]);
        const inner = [[200 + s * open, bottom], [200 + s * open, WAIST_Y], [200 + s * (open + 4), 318], [200 + s * 20, 282]];
        const d = smooth([...pts, ...inner], true, 0.7);
        L.outer += `<path d="${d}" ${f}/>` + pat(d);
        // лацкан/воротник
        L.outer += `<path d="M${200 + s * 16} 266 L${200 + s * 34} 300 L${200 + s * (open + 4)} 318 L${200 + s * 22} 280 Z" fill="${shade(c, -0.12)}" stroke="${st}" stroke-width="1"/>`;
        if (p.kind !== 'bolero') for (let y = 330; y < Math.min(bottom - 20, 520); y += 36) L.outer += `<circle cx="${200 + s * (open + 7)}" cy="${y}" r="3.2" fill="${p.acc || shade(c, 0.4)}" stroke="${st}" stroke-width=".7"/>`;
        if (p.trim === 'fur') L.outer += furLine([[200 + s * open, WAIST_Y], [200 + s * open, bottom - 4], [200 + s * (x(bottom) - 200), bottom - 4]], 6);
      }
      if (p.kind === 'coat' && p.belt) L.outer += `<path d="M${400 - x(WAIST_Y)} ${WAIST_Y - 6} L${x(WAIST_Y)} ${WAIST_Y - 6} L${x(WAIST_Y)} ${WAIST_Y + 6} L${400 - x(WAIST_Y)} ${WAIST_Y + 6} Z" fill="${shade(c, -0.2)}"/>`;
      if (p.kind === 'cardigan' && p.pat !== 'stripes') L.outer += '';
      const sk = p.kind === 'bolero' ? 'short' : 'long';
      for (const side of ['L', 'R']) {
        L.outerSleeves += sleeve(p.kind === 'bolero' ? 'short' : 'long', pose, side, c, P, gid);
        if (p.trim === 'fur' && sk === 'long') L.outerSleeves += furBand(armPoints(pose, side)[4], 12);
      }
      if (p.trim === 'fur') L.outer += furLine([[160, 276], [182, 264], [200, 270], [218, 264], [240, 276]], 7);
      break;
    }
  }
  return { defs, layers: L };
}

// ---------- ОБУВЬ ----------
function renderShoes(it, ctx) {
  const p = it.p, c = p.main, st = shade(c, -0.5);
  const { P } = ctx;
  let o = '';
  const defs = `<linearGradient id="${P}sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c, 0.35)}"/><stop offset=".5" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.25)}"/></linearGradient>`;
  const F = `fill="url(#${P}sh)" stroke="${st}" stroke-width="1.2"`;
  const alpha = p.crystal ? ' opacity=".82"' : '';
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    const ax = side === 'L' ? 185 : 215;
    const leg = legPoints(side);
    const toe = smooth([[ax - 9, 710], [ax + 9, 710], [ax + 11 + s * 3, 720], [ax + s * 9, 734], [ax + s * 2, 737], [ax - 7 + s * 4, 732], [ax - 11, 720]], true);
    const sole = `<path d="M${ax - 8 + s * 2} 736 Q${ax + s * 4} 741 ${ax + 10 + s * 2} 734" fill="none" stroke="${shade(c, -0.55)}" stroke-width="2.4"/>`;
    const heel = p.heel ? `<path d="M${ax - s * 6} 724 L${ax - s * 7} 742 L${ax - s * 3} 742 L${ax - s * 1} 726 Z" fill="${shade(c, -0.3)}" stroke="${st}" stroke-width="1"/>` : '';
    switch (p.kind) {
      case 'boots': case 'ankle': case 'winter': {
        const from = p.kind === 'boots' ? 3 : p.kind === 'winter' ? 4 : 4;
        const topY = p.kind === 'boots' ? 560 : p.kind === 'winter' ? 628 : 655;
        const pts = [[leg[from - 1][0], topY], ...leg.slice(from)];
        pts[pts.length - 1] = [ax, 712];
        const ws = p.kind === 'winter' ? [14, 13, 12] : [13.5, 11, 10];
        o += heel + `<path d="${limb(pts, ws.slice(0, pts.length), 0.1, 0.3)}" ${F}${alpha}/>` + `<path d="${toe}" ${F}${alpha}/>` + sole;
        if (p.kind === 'winter' || p.fur) o += furBand([leg[3][0], topY + 2], 16);
        if (p.laces) for (let y = topY + 14; y < 700; y += 12) o += `<path d="M${ax - 5} ${y} L${ax + 5} ${y + 5} M${ax + 5} ${y} L${ax - 5} ${y + 5}" stroke="${shade(c, 0.6)}" stroke-width="1.2"/>`;
        if (p.gems) for (let y = topY + 16; y < 700; y += 22) o += gem(ax + s * 2, y, 3.2, p.gems);
        o += `<path d="M${ax - s * 4} ${topY + 12} L${ax - s * 5} 700" stroke="#fff" stroke-width="3" opacity=".25" stroke-linecap="round"/>`;
        break;
      }
      case 'sandals': {
        o += heel;
        o += `<path d="M${ax - 10} 718 Q${ax} 713 ${ax + 10} 718" fill="none" stroke="${c}" stroke-width="4"/>`;
        o += `<path d="M${ax - 9} 727 Q${ax + s * 2} 722 ${ax + 11} 727" fill="none" stroke="${c}" stroke-width="3.5"/>`;
        o += `<path d="M${ax - 9} 703 Q${ax} 708 ${ax + 9} 703" fill="none" stroke="${c}" stroke-width="3"/>`;
        o += sole;
        if (p.flower) o += flowerDeco(ax, 716, p.flower, 5);
        break;
      }
      case 'sneakers': {
        const sn = smooth([[ax - 10, 700], [ax + 10, 700], [ax + 12 + s * 3, 718], [ax + s * 10, 736], [ax + s * 2, 740], [ax - 8 + s * 4, 736], [ax - 12, 718]], true);
        o += `<path d="${sn}" ${F}/><path d="M${ax - 11 + s * 2} 732 Q${ax + s * 3} 742 ${ax + 12 + s * 2} 732" fill="none" stroke="#fff" stroke-width="4"/>`;
        for (let y = 704; y < 722; y += 5) o += `<path d="M${ax - 4} ${y} L${ax + 4} ${y}" stroke="#fff" stroke-width="1.4"/>`;
        o += `<path d="M${ax - s * 8} 716 q${s * 6} 4 ${s * 12} 0" stroke="${p.acc || '#fff'}" stroke-width="2" fill="none"/>`;
        break;
      }
      default: { // pumps / flats / crystal / royal
        o += heel;
        const vamp = smooth([[ax - 10, 714], [ax, 711], [ax + 10, 714], [ax + 11 + s * 3, 722], [ax + s * 9, 735], [ax + s * 2, 738], [ax - 7 + s * 4, 733], [ax - 11, 722]], true);
        o += `<path d="${vamp}" ${F}${alpha}/>` + sole;
        o += `<path d="M${ax - 6} 717 Q${ax} 715 ${ax + 7} 718" stroke="#fff" stroke-width="2" opacity=".5" fill="none"/>`;
        if (p.bow) o += bow(ax, 716, 0.22, p.bow);
        if (p.gem) o += gem(ax, 718, 4, p.gem);
        if (p.crystal) o += `<path d="${sparkle(ax + 4, 722, 4)}" fill="#fff"/><path d="${sparkle(ax - 5, 728, 2.5)}" fill="#fff"/>`;
        if (p.flower) o += flowerDeco(ax, 716, p.flower, 5);
        if (p.strap) o += `<path d="M${ax - 8} 704 Q${ax} 708 ${ax + 8} 704" fill="none" stroke="${c}" stroke-width="3"/>`;
      }
    }
  }
  return { defs, layers: { shoes: o } };
}

// ---------- ГОЛОВА ----------
function crownShape(cx, by, w, h, pts, col, gemCols, P) {
  const g = `${P}cr`;
  let d = `M${cx - w} ${by}`;
  for (let i = 0; i <= pts * 2; i++) {
    const x = cx - w + (2 * w * i) / (pts * 2);
    const y = i % 2 === 0 ? by - h : by - h * 0.45;
    d += ` L${n1(x)} ${n1(y)}`;
  }
  d += ` L${cx + w} ${by} Q${cx} ${by + 6} ${cx - w} ${by} Z`;
  let o = `<path d="${d}" fill="url(#${g})" stroke="${shade(col, -0.5)}" stroke-width="1.2" stroke-linejoin="round"/>`;
  o += `<path d="M${cx - w} ${by - 5} Q${cx} ${by + 1} ${cx + w} ${by - 5}" fill="none" stroke="${shade(col, 0.45)}" stroke-width="2"/>`;
  for (let i = 0; i <= pts; i++) {
    const x = cx - w + (2 * w * i) / pts;
    o += `<circle cx="${n1(x)}" cy="${n1(by - h - 2)}" r="3" fill="${gemCols[i % gemCols.length]}" stroke="${shade(col, -0.4)}" stroke-width=".6"/><circle cx="${n1(x - 1)}" cy="${n1(by - h - 3)}" r="1" fill="#fff"/>`;
  }
  o += gem(cx, by - h * 0.35, 5, gemCols[0]);
  return o;
}
function metalDefs(P, col, id = 'cr') {
  return `<linearGradient id="${P}${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(col, 0.55)}"/><stop offset=".45" stop-color="${col}"/><stop offset=".55" stop-color="${shade(col, -0.25)}"/><stop offset="1" stop-color="${shade(col, 0.2)}"/></linearGradient>`;
}

function renderHead(it, ctx) {
  const { P } = ctx, p = it.p, c = p.main || '#e3b341';
  const defs = metalDefs(P, c);
  const L = { headwear: '', outerBack: '' };
  const gems = p.gems || ['#e0415e', '#3fa4e8', '#4bc27f'];
  // верх головы ≈ y 80; у высоких причёсок пучок выше
  const high = ['updo', 'royalcurls', 'jeweled', 'crystals', 'highpony'].includes(ctx.a.hairStyle);
  const by = high ? 96 : 92;
  switch (p.kind) {
    case 'crown-s': L.headwear = crownShape(200, by - 2, 32, 27, 4, c, gems, P); break;
    case 'crown-l': L.headwear = crownShape(200, by + 2, 44, 44, 5, c, gems, P) + `<path d="M178 ${by - 26} Q200 ${by - 58} 222 ${by - 26}" fill="none" stroke="url(#${P}cr)" stroke-width="5"/><circle cx="200" cy="${by - 48}" r="5" fill="${gems[0]}"/><path d="M200 ${by - 66} v12 M194 ${by - 60} h12" stroke="url(#${P}cr)" stroke-width="3.5"/>`; break;
    case 'diadem': {
      L.headwear = `<path d="M146 ${by + 22} Q200 ${by - 24} 254 ${by + 22} Q200 ${by - 10} 146 ${by + 22} Z" fill="url(#${P}cr)" stroke="${shade(c, -0.5)}" stroke-width="1"/>`;
      for (let i = 0; i < 7; i++) { const t = i / 6; const x = 158 + 84 * t; const y = by + 16 - Math.sin(t * Math.PI) * 28; L.headwear += gem(x, y - 3, i === 3 ? 6 : 3.5, gems[i % gems.length]); }
      break;
    }
    case 'tiara': {
      let d = `M150 ${by + 20}`;
      for (let i = 0; i <= 12; i++) { const t = i / 12; const x = 150 + 100 * t; const arc = Math.sin(t * Math.PI); const y = by + 20 - arc * (i % 2 ? 26 : 40); d += ` L${n1(x)} ${n1(y)}`; }
      d += ` Q200 ${by - 6} 150 ${by + 20} Z`;
      L.headwear = `<path d="${d}" fill="url(#${P}cr)" stroke="${shade(c, -0.5)}" stroke-width="1" stroke-linejoin="round"/>`;
      for (let i = 0; i <= 12; i += 2) { const t = i / 12; const x = 150 + 100 * t; const y = by + 20 - Math.sin(t * Math.PI) * 40; L.headwear += `<circle cx="${n1(x)}" cy="${n1(y)}" r="2.6" fill="#fff" stroke="${shade(c, -0.3)}" stroke-width=".5"/>`; }
      L.headwear += gem(200, by - 8, 6, gems[0]);
      break;
    }
    case 'wreath': {
      for (let i = 0; i < 13; i++) { const t = i / 12, a = Math.PI * (1 - t); const x = 200 + Math.cos(a) * 58, y = by + 42 - Math.sin(a) * 50; L.headwear += `<path d="M${n1(x)} ${n1(y)} q6 -10 14 -6 q-4 10 -14 6" fill="#6fbf73" stroke="#3f8a45" stroke-width=".6" transform="rotate(${n1(-t * 180 + 90)} ${n1(x)} ${n1(y)})"/>`; }
      const cols = p.flowers || ['#ff9fbf', '#fff', '#ffd966', '#c9a3ff'];
      for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9, a = Math.PI * (1 - t); L.headwear += flowerDeco(200 + Math.cos(a) * 58, by + 42 - Math.sin(a) * 50, cols[i % cols.length], i % 2 ? 7 : 9); }
      break;
    }
    case 'bow': L.headwear = bow(p.side ? 238 : 200, by + (p.side ? 10 : -6), p.size || 0.9, c); break;
    case 'clips': {
      for (const [x, y, r] of [[240, 118, -30], [248, 136, -20], [160, 118, 30]]) L.headwear += `<g transform="rotate(${r} ${x} ${y})"><rect x="${x - 12}" y="${y - 3}" width="24" height="6" rx="3" fill="url(#${P}cr)" stroke="${shade(c, -0.5)}" stroke-width=".8"/>${p.deco === 'heart' ? `<path d="${heart(x + 8, y, 4)}" fill="${gems[0]}"/>` : p.deco === 'star' ? `<path d="${star(x + 8, y, 5)}" fill="${gems[0]}"/>` : gem(x + 8, y, 3.5, gems[0])}</g>`;
      break;
    }
    case 'stars': {
      const pts = [[152, 120, 8], [168, 96, 6], [190, 84, 9], [214, 82, 6], [236, 92, 8], [250, 114, 6]];
      for (const [x, y, r] of pts) L.headwear += `<path d="${star(x, y, r)}" fill="url(#${P}cr)" stroke="${shade(c, -0.5)}" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="1.4" fill="#fff"/>`;
      break;
    }
    case 'pearls': {
      for (let i = 0; i < 22; i++) { const t = i / 21, a = Math.PI * (1 - t); L.headwear += pearl(200 + Math.cos(a) * 58, by + 44 - Math.sin(a) * 52, 3.4); }
      break;
    }
    case 'headband': {
      L.headwear = `<path d="M144 ${by + 50} Q146 ${by - 12} 200 ${by - 14} Q254 ${by - 12} 256 ${by + 50}" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/>
        <path d="M144 ${by + 50} Q146 ${by - 12} 200 ${by - 14} Q254 ${by - 12} 256 ${by + 50}" fill="none" stroke="#fff" stroke-width="2" opacity=".35" transform="translate(0 -2)"/>`;
      if (p.deco === 'gems') for (let i = 0; i < 7; i++) { const t = (i + 0.5) / 7, a = Math.PI * (1 - t); L.headwear += gem(200 + Math.cos(a) * 55, by + 48 - Math.sin(a) * 60, 4, gems[i % gems.length]); }
      if (p.deco === 'bow') L.headwear += bow(236, by + 4, 0.55, shade(c, 0.1));
      if (p.deco === 'ears') L.headwear += `<path d="M162 ${by + 6} L150 ${by - 34} L184 ${by - 6} Z M238 ${by + 6} L250 ${by - 34} L216 ${by - 6} Z" fill="${c}" stroke="${shade(c, -0.4)}"/><path d="M164 ${by} L156 ${by - 22} L176 ${by - 6} Z M236 ${by} L244 ${by - 22} L224 ${by - 6} Z" fill="#ffc0d6"/>`;
      break;
    }
    case 'snow': {
      L.headwear = crownShape(200, by, 40, 30, 5, c, ['#cfefff', '#e4d6ff'], P);
      for (let i = 0; i < 5; i++) L.headwear += `<path d="M${170 + i * 15} ${by - 8} L${174 + i * 15} ${by - 44 - (i % 2 ? 0 : 10)} L${178 + i * 15} ${by - 8} Z" fill="#dff4ff" stroke="#7fb7da" stroke-width=".8" opacity=".95"/>`;
      L.headwear += snowflake(200, by - 20, 9, '#fff', 2);
      break;
    }
    case 'mermaid': {
      L.headwear = `<path d="M150 ${by + 22} Q200 ${by - 10} 250 ${by + 22}" fill="none" stroke="url(#${P}cr)" stroke-width="7"/>` + shell(200, by - 6, '#ffc9d6', 1.6) + shell(170, by + 6, '#ffe2cf', 1) + shell(230, by + 6, '#ffe2cf', 1);
      for (let i = 0; i < 8; i++) L.headwear += pearl(158 + i * 12, by + 18 - Math.sin((i / 7) * Math.PI) * 24, 3);
      L.headwear += `<path d="${star(252, by + 24, 9, 4)}" fill="#ff9f7f" stroke="#c7603f" stroke-width=".8"/>`;
      break;
    }
    case 'fairy': {
      for (let i = 0; i < 11; i++) { const t = i / 10, a = Math.PI * (1 - t); const x = 200 + Math.cos(a) * 56, y = by + 40 - Math.sin(a) * 50; L.headwear += `<path d="M${n1(x)} ${n1(y)} C${n1(x - 6)} ${n1(y - 14)} ${n1(x + 2)} ${n1(y - 26)} ${n1(x + 4)} ${n1(y - 30)} C${n1(x + 8)} ${n1(y - 20)} ${n1(x + 6)} ${n1(y - 8)} ${n1(x)} ${n1(y)} Z" fill="#8fdc8f" stroke="#3f8a45" stroke-width=".6" transform="rotate(${n1((t - 0.5) * 120)} ${n1(x)} ${n1(y)})"/>`; }
      L.headwear += `<g filter="url(#${P}glow)">${crystalDeco(200, by - 10, '#e8c6ff', 1.3)}<circle cx="170" cy="${by + 2}" r="3" fill="#fffbd0"/><circle cx="230" cy="${by + 2}" r="3" fill="#fffbd0"/></g>`;
      break;
    }
    case 'sunhat': {
      const hc = c;
      L.headwear = `<ellipse cx="200" cy="${by + 18}" rx="98" ry="26" fill="${hc}" stroke="${shade(hc, -0.4)}" stroke-width="1.3"/>
        <path d="M150 ${by + 16} C150 ${by - 40} 250 ${by - 40} 250 ${by + 16} Z" fill="${shade(hc, -0.06)}" stroke="${shade(hc, -0.4)}" stroke-width="1.2"/>
        <path d="M151 ${by + 6} Q200 ${by + 16} 249 ${by + 6} L250 ${by + 16} Q200 ${by + 26} 150 ${by + 16} Z" fill="${p.acc || '#f06292'}"/>`;
      for (let i = 0; i < 10; i++) L.headwear += `<path d="M${110 + i * 20} ${by + 12} q10 6 18 0" fill="none" stroke="${shade(hc, -0.2)}" stroke-width=".8" opacity=".6"/>`;
      if (p.flower) L.headwear += flowerDeco(238, by + 8, p.flower, 10);
      break;
    }
    case 'beanie': {
      L.headwear = `<path d="M142 ${by + 30} C136 ${by - 44} 264 ${by - 44} 258 ${by + 30} Z" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1.2"/>
        <rect x="138" y="${by + 20}" width="124" height="22" rx="10" fill="${shade(c, -0.12)}" stroke="${shade(c, -0.4)}"/>`;
      for (let x = 146; x < 258; x += 8) L.headwear += `<path d="M${x} ${by + 22} v18" stroke="${shade(c, -0.3)}" stroke-width="1" opacity=".5"/>`;
      L.headwear += furBand([200, by - 36], 22);
      if (p.acc) L.headwear += snowflake(200, by, 10, p.acc, 2);
      break;
    }
    case 'beret': {
      const y = by + 14;
      L.headwear = `<path d="M130 ${y + 8} C118 ${y - 44} 252 ${y - 64} 280 ${y - 8} C284 ${y + 14} 190 ${y + 30} 130 ${y + 8} Z" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1.2"/>
        <path d="M140 ${y + 6} Q200 ${y + 22} 268 ${y + 2}" fill="none" stroke="${shade(c, -0.25)}" stroke-width="5"/>
        <path d="M150 ${y - 20} Q190 ${y - 44} 240 ${y - 38}" fill="none" stroke="#fff" stroke-width="4" opacity=".2"/>
        <path d="M214 ${y - 42} q2 -10 6 -12" stroke="${shade(c, -0.3)}" stroke-width="3" fill="none"/>`;
      if (p.acc) L.headwear += `<path d="${heart(160, y - 2, 6)}" fill="${p.acc}"/>`;
      break;
    }
    case 'veil': {
      const v = smooth([[160, 100], [240, 100], [300, 300], [330, 560], [300, 640], [200, 650], [100, 640], [70, 560], [100, 300]], true);
      L.outerBack = `<path d="${v}" fill="#ffffff" opacity=".55" stroke="#e8e0e8" stroke-width="1"/><path d="${v}" fill="url(#${P}lacePatV)" opacity=".5"/>`;
      L.headwear = `<path d="M150 ${by + 20} Q200 ${by - 10} 250 ${by + 20}" fill="none" stroke="url(#${P}cr)" stroke-width="5"/>`;
      for (let i = 0; i < 9; i++) L.headwear += pearl(154 + i * 11.5, by + 16 - Math.sin((i / 8) * Math.PI) * 22, 3);
      if (p.flower) L.headwear += flowerDeco(236, by + 12, '#fff', 9);
      return { defs: defs + patternDef(P, 'lacePatV', 'lace', '#fff'), layers: L };
    }
    case 'mask-feather': break;
  }
  return { defs, layers: L };
}

// ---------- УКРАШЕНИЯ ----------
function renderEarrings(it, ctx) {
  const { P } = ctx, p = it.p, c = p.main;
  let o = '';
  for (const x of [148, 252]) {
    const y = 186;
    switch (p.kind) {
      case 'pearl': o += `<path d="M${x} ${y} v6" stroke="#caa84a" stroke-width="1.2"/>` + pearl(x, y + 11, 5); break;
      case 'hoop': o += `<ellipse cx="${x}" cy="${y + 11}" rx="8" ry="11" fill="none" stroke="${c}" stroke-width="2.6"/><ellipse cx="${x - 2}" cy="${y + 9}" rx="6" ry="9" fill="none" stroke="#fff" stroke-width=".8" opacity=".6"/>`; break;
      case 'drop': o += `<circle cx="${x}" cy="${y + 2}" r="2.4" fill="${c}"/><path d="M${x} ${y + 5} C${x - 7} ${y + 16} ${x - 5} ${y + 24} ${x} ${y + 24} C${x + 5} ${y + 24} ${x + 7} ${y + 16} ${x} ${y + 5} Z" fill="${p.gem || c}" stroke="${shade(c, -0.4)}" stroke-width=".8"/><circle cx="${x - 2}" cy="${y + 17}" r="1.6" fill="#fff" opacity=".8"/>`; break;
      case 'heart': o += `<path d="M${x} ${y} v5" stroke="${c}" stroke-width="1.2"/><path d="${heart(x, y + 11, 6)}" fill="${p.gem || c}" stroke="${shade(p.gem || c, -0.4)}" stroke-width=".8"/>`; break;
      case 'star': o += `<path d="M${x} ${y} v5" stroke="${c}" stroke-width="1.2"/><path d="${star(x, y + 12, 8)}" fill="${p.gem || c}" stroke="${shade(p.gem || c, -0.4)}" stroke-width=".8"/><circle cx="${x}" cy="${y + 12}" r="1.4" fill="#fff"/>`; break;
      case 'flower': o += flowerDeco(x, y + 6, p.gem || c, 6); break;
      case 'crystal': o += `<path d="M${x} ${y} v4" stroke="#ccc" stroke-width="1"/>` + crystalDeco(x, y + 14, p.gem || '#cfefff', 1.1) + `<path d="${sparkle(x + 5, y + 8, 3)}" fill="#fff"/>`; break;
      case 'chandelier': o += `<path d="M${x - 7} ${y + 8} Q${x} ${y + 2} ${x + 7} ${y + 8}" fill="none" stroke="${c}" stroke-width="1.5"/>` + [-6, 0, 6].map((dx) => gem(x + dx, y + 14 + (dx ? 0 : 5), 3, p.gem || c)).join(''); break;
      case 'stud': o += gem(x, y + 2, 4, p.gem || c); break;
    }
  }
  return { layers: { earrings: o } };
}

function necklineY() { return [[184, 264], [192, 280], [200, 286], [208, 280], [216, 264]]; }

function renderNecklace(it, ctx) {
  const p = it.p, c = p.main;
  let o = '';
  const drop = p.long ? 30 : 0;
  const chain = `M180 262 Q184 ${290 + drop} 200 ${294 + drop} Q216 ${290 + drop} 220 262`;
  const pendY = 296 + drop;
  switch (p.kind) {
    case 'chain': o += `<path d="${chain}" fill="none" stroke="${c}" stroke-width="1.6"/><path d="${chain}" fill="none" stroke="#fff" stroke-width=".6" stroke-dasharray="1 3" opacity=".7"/>`; break;
    case 'pearls': {
      const n = 15;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = 180 + 40 * t, y = 262 + Math.sin(t * Math.PI) * (32 + drop);
        o += pearl(x, y, 3.3);
      }
      if (p.double) for (let i = 0; i < 17; i++) { const t = i / 16; o += pearl(176 + 48 * t, 266 + Math.sin(t * Math.PI) * (44 + drop), 3); }
      break;
    }
    case 'pendant': case 'gem': case 'magic': case 'heart': case 'locket':
      o += `<path d="${chain}" fill="none" stroke="${c}" stroke-width="1.5"/>`;
      if (p.kind === 'heart') o += `<path d="${heart(200, pendY + 7, 7)}" fill="${p.gem || c}" stroke="${shade(p.gem || c, -0.4)}"/><path d="M196 ${pendY + 2} q2 -2 4 0" stroke="#fff" fill="none"/>`;
      else if (p.kind === 'locket') o += `<ellipse cx="200" cy="${pendY + 8}" rx="7" ry="9" fill="${c}" stroke="${shade(c, -0.45)}"/><path d="${star(200, pendY + 8, 3.5)}" fill="${shade(c, 0.4)}"/>`;
      else if (p.kind === 'magic') o += `<g filter="url(#${ctx.P}glow)">${crystalDeco(200, pendY + 10, p.gem || '#c7a4ff', 1.5)}</g>`;
      else o += `<circle cx="200" cy="${pendY}" r="3" fill="${c}"/>` + gem(200, pendY + 9, p.big ? 9 : 6.5, p.gem || c);
      if (p.side) for (const dx of [-12, 12]) o += gem(200 + dx, pendY - 4, 3.4, p.gem);
      break;
    case 'collar': {
      o += `<path d="M184 262 Q200 280 216 262" fill="none" stroke="${c}" stroke-width="4"/>`;
      for (let i = 0; i < 7; i++) { const t = i / 6; o += gem(184 + 32 * t, 264 + Math.sin(t * Math.PI) * 12 + 5, 3.3, p.gem || c); }
      break;
    }
  }
  return { layers: { necklace: o } };
}

function renderBracelet(it, ctx) {
  const p = it.p, c = p.main;
  let o = '';
  const sides = p.both === false ? ['L'] : ['L', 'R'];
  for (const side of sides) {
    const w = armPoints(ctx.pose, side)[4];
    const e = armPoints(ctx.pose, side)[3];
    const ang = (Math.atan2(w[1] - e[1], w[0] - e[0]) * 180) / Math.PI;
    const x = w[0] - (w[0] - e[0]) * 0.08, y = w[1] - (w[1] - e[1]) * 0.08;
    o += `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(ang + 90)})">`;
    switch (p.kind) {
      case 'band': o += `<rect x="-10" y="-3.5" width="20" height="7" rx="3" fill="${c}" stroke="${shade(c, -0.45)}" stroke-width=".8"/><rect x="-8" y="-2.5" width="16" height="1.6" rx=".8" fill="#fff" opacity=".6"/>`; break;
      case 'flowers': o += [-7, 0, 7].map((dx) => flowerDeco(dx, 0, p.gem || c, 4)).join(''); break;
      case 'gems': o += `<rect x="-10" y="-2.5" width="20" height="5" rx="2.5" fill="${c}"/>` + [-6, 0, 6].map((dx) => gem(dx, 0, 3, p.gem)).join(''); break;
      case 'magic': o += `<g filter="url(#${ctx.P}glow)"><rect x="-10" y="-3" width="20" height="6" rx="3" fill="${c}" opacity=".85"/>${crystalDeco(0, 0, p.gem || '#e0c8ff', 0.6)}</g>`; break;
      case 'pearls': o += [-8, -4, 0, 4, 8].map((dx) => pearl(dx, 0, 2.5)).join(''); break;
      case 'charm': o += `<rect x="-10" y="-2" width="20" height="4" rx="2" fill="${c}"/><path d="${heart(3, 7, 3.5)}" fill="${p.gem || '#e0415e'}"/><path d="${star(-4, 7, 3.4)}" fill="${shade(c, 0.3)}"/>`; break;
    }
    o += '</g>';
  }
  return { layers: { bracelet: o } };
}

function renderRing(it, ctx) {
  const h = handOf(ctx.pose, 'R');
  const p = it.p;
  const x = h.x + Math.cos(h.ang) * 2, y = h.y + Math.sin(h.ang) * 2;
  const o = `<circle cx="${n1(x)}" cy="${n1(y)}" r="3.2" fill="none" stroke="${p.main}" stroke-width="1.8"/>` + (p.kind === 'heart' ? `<path d="${heart(x, y - 3, 3.2)}" fill="${p.gem}"/>` : gem(x, y - 3, p.big ? 4.5 : 3, p.gem));
  return { layers: { ring: o } };
}

// ---------- ПРЕДМЕТЫ В РУКЕ (левая на экране рука) ----------
function renderHeld(it, ctx) {
  const h = handOf(ctx.pose, 'L');
  const { P } = ctx, p = it.p, c = p.main || '#e3b341';
  const x = h.x - Math.cos(h.ang) * 6, y = h.y - Math.sin(h.ang) * 6;
  let o = '', defs = metalDefs(P, c, 'hd');
  switch (p.kind) {
    case 'fan': {
      o += `<g transform="translate(${x} ${y}) rotate(-18)">`;
      for (let i = 0; i < 9; i++) { const a = -150 + i * 15; o += `<path d="M0 0 L${n1(Math.cos((a * Math.PI) / 180) * 54)} ${n1(Math.sin((a * Math.PI) / 180) * 54)} L${n1(Math.cos(((a + 15) * Math.PI) / 180) * 54)} ${n1(Math.sin(((a + 15) * Math.PI) / 180) * 54)} Z" fill="${i % 2 ? c : shade(c, 0.25)}" stroke="${shade(c, -0.4)}" stroke-width=".7"/>`; }
      o += `<path d="M-47 -27 A54 54 0 0 1 14 -52" fill="none" stroke="${p.acc || '#fff'}" stroke-width="3" opacity=".8"/>`;
      if (p.pattern === 'lace') o += `<path d="M-40 -20 A45 45 0 0 1 10 -44" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="2 3"/>`;
      o += `<circle r="3" fill="#caa84a"/></g>`;
      break;
    }
    case 'rose': o += `<path d="M${x} ${y + 10} L${x + 4} ${y - 64}" stroke="#3f8a45" stroke-width="3"/><path d="M${x + 2} ${y - 30} q12 -8 16 2 q-10 6 -16 -2" fill="#5daa5f"/>` + roseHead(x + 4, y - 72, c); break;
    case 'bouquet': {
      o += `<path d="M${x - 6} ${y + 20} L${x - 26} ${y - 30} L${x + 26} ${y - 30} L${x + 6} ${y + 20} Z" fill="${p.wrap || '#fff3f7'}" stroke="#d9b8c6" stroke-width="1"/>`;
      const cols = p.flowers || ['#ff8fb0', '#fff', '#ffd1e0', '#c9a3ff'];
      const pts = [[-18, -36], [0, -44], [18, -36], [-10, -54], [10, -54], [0, -64], [-22, -52], [22, -52]];
      pts.forEach(([dx, dy], i) => { o += i % 3 === 0 ? roseHead(x + dx, y + dy, cols[i % cols.length], 0.8) : flowerDeco(x + dx, y + dy, cols[i % cols.length], 9); });
      o += bow(x, y - 10, 0.35, p.ribbon || '#f06292');
      break;
    }
    case 'wand': o += `<path d="M${x} ${y + 12} L${x + 8} ${y - 62}" stroke="url(#${P}hd)" stroke-width="4" stroke-linecap="round"/><g filter="url(#${P}glow)"><path d="${star(x + 9, y - 74, 15, 6.5)}" fill="${p.star || '#ffe066'}" stroke="${shade(p.star || '#ffe066', -0.4)}" stroke-width="1"/></g><path d="${sparkle(x + 28, y - 90, 5)}" fill="#fff"/><path d="${sparkle(x - 8, y - 92, 3.5)}" fill="#fff"/>`; break;
    case 'heart': o += `<g filter="url(#${P}glow)"><path d="${heart(x, y - 18, 20)}" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1.2"/></g><path d="M${x - 12} ${y - 28} q4 -6 10 -4" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/>`; break;
    case 'book': o += `<g transform="translate(${x} ${y - 20}) rotate(-10)"><rect x="-20" y="-26" width="40" height="52" rx="3" fill="${c}" stroke="${shade(c, -0.45)}" stroke-width="1.2"/><rect x="16" y="-24" width="5" height="48" fill="#fbf4e4"/><path d="${star(0, -2, 9)}" fill="#f2cf64"/><rect x="-16" y="-22" width="32" height="44" rx="2" fill="none" stroke="#f2cf64" stroke-width="1"/></g>`; break;
    case 'mirror': o += `<g transform="translate(${x} ${y}) rotate(-8)"><rect x="-3.5" y="-10" width="7" height="30" rx="3" fill="url(#${P}hd)"/><ellipse cx="0" cy="-34" rx="20" ry="25" fill="url(#${P}hd)" stroke="${shade(c, -0.45)}"/><ellipse cx="0" cy="-34" rx="15" ry="20" fill="#dff1ff"/><path d="M-8 -44 L4 -24" stroke="#fff" stroke-width="3" opacity=".8"/>${gem(0, -60, 3.5, '#e0415e')}</g>`; break;
    case 'scepter': o += `<path d="M${x} ${y + 28} L${x + 6} ${y - 76}" stroke="url(#${P}hd)" stroke-width="6" stroke-linecap="round"/><circle cx="${x + 6}" cy="${y - 84}" r="12" fill="${p.gem || '#8b3fd0'}" stroke="${shade(c, -0.4)}" stroke-width="2"/><circle cx="${x + 2}" cy="${y - 88}" r="3.5" fill="#fff" opacity=".7"/><path d="M${x - 6} ${y - 70} Q${x + 6} ${y - 62} ${x + 18} ${y - 70}" stroke="url(#${P}hd)" stroke-width="4" fill="none"/>`; break;
    case 'umbrella': o += `<path d="M${x} ${y + 16} L${x + 4} ${y - 90}" stroke="#8a6a4a" stroke-width="2.6"/><path d="M${x - 64} ${y - 80} Q${x + 4} ${y - 150} ${x + 72} ${y - 80} Q${x + 54} ${y - 88} ${x + 38} ${y - 80} Q${x + 21} ${y - 90} ${x + 4} ${y - 80} Q${x - 13} ${y - 90} ${x - 30} ${y - 80} Q${x - 47} ${y - 88} ${x - 64} ${y - 80} Z" fill="${c}" stroke="${shade(c, -0.45)}" stroke-width="1.2"/><path d="M${x + 4} ${y - 116} L${x - 30} ${y - 80} M${x + 4} ${y - 116} L${x + 38} ${y - 80} M${x + 4} ${y - 116} L${x + 4} ${y - 80}" stroke="${shade(c, -0.3)}" stroke-width=".8"/>${p.lace ? `<path d="M${x - 64} ${y - 80} Q${x + 4} ${y - 70} ${x + 72} ${y - 80}" stroke="#fff" stroke-width="3" stroke-dasharray="3 3" fill="none"/>` : ''}`; break;
    case 'lantern': o += `<path d="M${x} ${y} L${x} ${y - 16}" stroke="#555" stroke-width="1.5"/><g transform="translate(${x} ${y + 26})"><rect x="-13" y="-22" width="26" height="36" rx="4" fill="#ffe9a8" opacity=".9"/><g filter="url(#${P}glow)"><ellipse cx="0" cy="-4" rx="6" ry="9" fill="#fff4b0"/></g><rect x="-15" y="-26" width="30" height="6" rx="2" fill="url(#${P}hd)"/><rect x="-15" y="12" width="30" height="6" rx="2" fill="url(#${P}hd)"/><path d="M-13 -20 V12 M13 -20 V12 M0 -20 V12" stroke="url(#${P}hd)" stroke-width="1.5"/></g>`; break;
    case 'gift': o += `<g transform="translate(${x} ${y - 16})"><rect x="-20" y="-16" width="40" height="34" rx="3" fill="${c}" stroke="${shade(c, -0.45)}"/><rect x="-4" y="-16" width="8" height="34" fill="${p.acc || '#fff'}"/><rect x="-20" y="-4" width="40" height="7" fill="${p.acc || '#fff'}"/>${bow(0, -18, 0.45, p.acc || '#fff')}</g>`; break;
    case 'basket': o += `<g transform="translate(${x} ${y + 20})"><path d="M-24 -6 Q0 -54 24 -6" fill="none" stroke="#a0703f" stroke-width="3.5"/><path d="M-26 -6 L26 -6 L20 22 L-20 22 Z" fill="#c4904f" stroke="#7f5528"/><path d="M-24 2 H24 M-22 10 H22 M-21 17 H21" stroke="#8f6232" stroke-width="1"/>${flowerDeco(-12, -10, '#ff8fb0', 7)}${flowerDeco(4, -12, '#fff', 7)}${flowerDeco(16, -8, '#ffd966', 6)}</g>`; break;
    case 'harp': o += `<g transform="translate(${x} ${y - 26})"><path d="M-14 36 L-14 -36 Q20 -40 22 0 Q24 30 -14 36 Z" fill="none" stroke="url(#${P}hd)" stroke-width="5"/>${[-8, -2, 4, 10, 16].map((dx) => `<path d="M${dx} ${-34 + (dx + 14) * 0.2} L${dx} ${32 - (dx + 14) * 0.3}" stroke="#fff" stroke-width=".8"/>`).join('')}</g>`; break;
    case 'violin': o += `<g transform="translate(${x + 4} ${y - 28}) rotate(-20)"><path d="M0 -38 L0 -64" stroke="#3a2418" stroke-width="4"/><path d="M-12 -30 C-18 -18 -8 -10 -14 0 C-20 12 -12 30 0 30 C12 30 20 12 14 0 C8 -10 18 -18 12 -30 C6 -38 -6 -38 -12 -30 Z" fill="#b5652b" stroke="#6b3814"/><path d="M-4 -4 q-3 4 0 8 M4 -4 q3 4 0 8" stroke="#3a2418" fill="none"/></g>`; break;
    case 'balloon': o += `<path d="M${x} ${y} Q${x + 10} ${y - 60} ${x + 4} ${y - 110}" stroke="#999" stroke-width="1" fill="none"/><ellipse cx="${x + 4}" cy="${y - 136}" rx="22" ry="27" fill="${c}" stroke="${shade(c, -0.4)}"/><ellipse cx="${x - 4}" cy="${y - 146}" rx="5" ry="8" fill="#fff" opacity=".45"/>`; break;
    case 'icecream': o += `<g transform="translate(${x} ${y - 10})"><path d="M-10 -10 L0 22 L10 -10 Z" fill="#e0a560" stroke="#a36a2a"/><circle cx="0" cy="-16" r="11" fill="${c}"/><circle cx="-6" cy="-24" r="8" fill="${shade(c, 0.3)}"/><circle cx="2" cy="-30" r="3" fill="#e0415e"/></g>`; break;
    case 'teacup': o += `<g transform="translate(${x} ${y - 6})"><path d="M-12 -8 L12 -8 Q12 8 0 10 Q-12 8 -12 -8 Z" fill="#fff" stroke="#c9b9c9"/><path d="M12 -4 q7 0 6 6 q-2 4 -7 2" fill="none" stroke="#c9b9c9" stroke-width="2"/><ellipse cx="0" cy="12" rx="17" ry="3.5" fill="#fff" stroke="#c9b9c9"/><path d="${heart(0, 0, 3.4)}" fill="${c}"/></g>`; break;
  }
  const k = { umbrella: 1.05, fan: 1.3, balloon: 1.15, scepter: 1.25, wand: 1.4, harp: 1.5, lantern: 1.45 }[p.kind] || 1.7;
  o = `<g transform="translate(${n1(x)} ${n1(y)}) scale(${k}) translate(${n1(-x)} ${n1(-y)})">${o}</g>`;
  return { defs, layers: { held: o } };
}
function roseHead(x, y, c, s = 1) {
  const d = shade(c, -0.35);
  return `<g transform="translate(${x} ${y}) scale(${s})"><circle r="11" fill="${c}" stroke="${d}"/><path d="M-6 -2 Q0 -10 6 -2 Q0 6 -6 -2 Z" fill="${shade(c, -0.15)}" stroke="${d}" stroke-width=".8"/><path d="M-9 2 Q0 12 9 2" fill="none" stroke="${d}" stroke-width=".9"/><path d="M-3 -1 Q0 -4 3 -1" fill="none" stroke="${d}" stroke-width=".8"/></g>`;
}

// ---------- СУМОЧКИ ----------
function renderBag(it, ctx) {
  const p = it.p, c = p.main;
  const pose = ctx.pose;
  const R = POSES[pose]?.R || POSES.stand.R;
  const hangHand = pose === 'stand' || pose === 'curtsy';
  const anchor = hangHand ? [handOf(pose, 'R').x, handOf(pose, 'R').y - 4] : [R[1][0], R[1][1] + 4];
  const [ax, ay] = anchor;
  const by = ay + 26;
  let o = `<path d="M${ax - 10} ${by - 8} Q${ax} ${ay - 12} ${ax + 10} ${by - 8}" fill="none" stroke="${p.strap || shade(c, -0.3)}" stroke-width="2.4"/>`;
  const body = {
    clutch: `<rect x="${ax - 20}" y="${by - 10}" width="40" height="26" rx="6" fill="${c}" stroke="${shade(c, -0.45)}"/><path d="M${ax - 20} ${by - 4} Q${ax} ${by + 10} ${ax + 20} ${by - 4}" fill="${shade(c, -0.1)}" stroke="${shade(c, -0.45)}"/>`,
    royal: `<path d="M${ax - 18} ${by - 8} L${ax + 18} ${by - 8} L${ax + 22} ${by + 20} L${ax - 22} ${by + 20} Z" fill="${c}" stroke="${shade(c, -0.45)}"/><path d="${star(ax, by + 6, 7, 3)}" fill="#f2cf64"/><path d="M${ax - 18} ${by - 8} L${ax + 18} ${by - 8}" stroke="#f2cf64" stroke-width="2"/>`,
    heart: `<path d="${heart(ax, by + 6, 18)}" fill="${c}" stroke="${shade(c, -0.45)}"/><path d="M${ax - 10} ${by - 4} q4 -4 8 -2" stroke="#fff" fill="none" stroke-width="2" opacity=".6"/>`,
    flower: `${flowerDeco(ax, by + 6, c, 17)}`,
    crystal: `<path d="M${ax} ${by - 10} L${ax + 20} ${by + 4} L${ax + 10} ${by + 22} L${ax - 10} ${by + 22} L${ax - 20} ${by + 4} Z" fill="${c}" opacity=".88" stroke="${shade(c, -0.45)}"/><path d="M${ax} ${by - 10} L${ax + 5} ${by + 4} L${ax} ${by + 22} M${ax - 20} ${by + 4} L${ax + 20} ${by + 4}" stroke="#fff" stroke-width="1" opacity=".7"/>`,
    gold: `<rect x="${ax - 18}" y="${by - 8}" width="36" height="28" rx="5" fill="url(#${ctx.P}bg)" stroke="#8a6414"/><circle cx="${ax}" cy="${by + 2}" r="3" fill="#fff4c4"/>`,
    fairy: `<path d="M${ax - 16} ${by - 6} Q${ax} ${by + 34} ${ax + 16} ${by - 6} Z" fill="${c}" stroke="${shade(c, -0.45)}"/><path d="M${ax - 16} ${by - 4} q-14 -12 -14 4 q6 6 14 0 M${ax + 16} ${by - 4} q14 -12 14 4 q-6 6 -14 0" fill="#e8f6ff" opacity=".85" stroke="#9cc"/>${`<path d="${sparkle(ax, by + 6, 4)}" fill="#fff"/>`}`,
    unicorn: `<ellipse cx="${ax}" cy="${by + 8}" rx="19" ry="16" fill="#fff" stroke="#d6c6e0"/><path d="M${ax - 3} ${by - 6} L${ax} ${by - 26} L${ax + 3} ${by - 6} Z" fill="#f2cf64" stroke="#a87b16" stroke-width=".7"/><path d="M${ax - 16} ${by - 2} q-4 -10 4 -8 M${ax + 16} ${by - 2} q4 -10 -4 -8" fill="#fff" stroke="#d6c6e0"/><path d="M${ax - 8} ${by + 6} q2 2 4 0 M${ax + 4} ${by + 6} q2 2 4 0" stroke="#3a2a3a" fill="none" stroke-width="1.2"/><path d="M${ax - 18} ${by - 4} Q${ax - 26} ${by + 10} ${ax - 18} ${by + 22}" stroke="${c}" stroke-width="5" fill="none"/>`,
    beach: `<path d="M${ax - 22} ${by - 8} L${ax + 22} ${by - 8} L${ax + 18} ${by + 22} L${ax - 18} ${by + 22} Z" fill="#e8c98f" stroke="#a88040"/>${[0, 8, 16].map((dy) => `<path d="M${ax - 20} ${by - 2 + dy} H${ax + 20}" stroke="#b8904f" stroke-width="1"/>`).join('')}${flowerDeco(ax + 10, by - 2, c, 6)}`,
    backpack: `<rect x="${ax - 16}" y="${by - 10}" width="32" height="34" rx="9" fill="${c}" stroke="${shade(c, -0.45)}"/><rect x="${ax - 11}" y="${by + 6}" width="22" height="12" rx="4" fill="${shade(c, -0.12)}"/>`,
  }[p.kind] || '';
  o += body;
  const defs = `<linearGradient id="${ctx.P}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe89a"/><stop offset=".5" stop-color="#d9a72e"/><stop offset="1" stop-color="#f2cf64"/></linearGradient>`;
  return { defs, layers: { bag: o } };
}

// ---------- КРЫЛЬЯ ----------
function renderWings(it, ctx) {
  const { P } = ctx, p = it.p, c = p.main;
  const id = P + 'wg';
  let defs = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${(p.rainbow ? ['#ff8a8a', '#ffd36e', '#9be58a', '#7fc4ff', '#c79bff'] : [shade(c, 0.6), c, shade(c, -0.1)]).map((s, i, a) => `<stop offset="${i / (a.length - 1)}" stop-color="${s}"/>`).join('')}</linearGradient>`;
  let one = '';
  const st = shade(c, -0.4);
  const op = p.kind === 'crystal' || p.kind === 'ice' ? 0.85 : 0.78;
  switch (p.kind) {
    case 'fairy': case 'glow':
      one = `<path d="M200 300 C240 200 330 120 372 150 C390 200 320 280 200 310 Z" fill="url(#${id})" opacity="${op}" stroke="${st}" stroke-width="1.2"/>
        <path d="M200 312 C260 320 330 380 318 440 C290 460 240 400 200 318 Z" fill="url(#${id})" opacity="${op}" stroke="${st}" stroke-width="1.2"/>
        <path d="M206 302 C260 240 320 180 360 160 M206 316 C250 350 290 400 306 432" fill="none" stroke="#fff" stroke-width="1.4" opacity=".6"/>`;
      break;
    case 'butterfly': case 'rainbow':
      one = `<path d="M200 300 C230 190 360 150 360 230 C360 290 280 300 200 312 Z" fill="url(#${id})" opacity=".92" stroke="${st}" stroke-width="2"/>
        <path d="M200 314 C280 320 320 360 300 420 C270 450 220 400 200 320 Z" fill="url(#${id})" opacity=".92" stroke="${st}" stroke-width="2"/>
        <circle cx="318" cy="222" r="14" fill="#fff" opacity=".45"/><circle cx="318" cy="222" r="7" fill="${shade(c, -0.3)}" opacity=".6"/><circle cx="270" cy="380" r="9" fill="#fff" opacity=".45"/>
        <path d="M300 180 L340 200 M290 200 L350 240" stroke="${st}" stroke-width="1" opacity=".4"/>`;
      break;
    case 'crystal': case 'ice': {
      const pts = [[200, 300], [250, 220], [300, 150], [336, 118], [350, 170], [330, 220], [362, 250], [320, 300], [340, 360], [290, 380], [260, 420], [220, 330]];
      one = `<path d="M${pts.map((q) => q.join(' ')).join(' L')} Z" fill="url(#${id})" opacity="${op}" stroke="${st}" stroke-width="1.4"/>`;
      one += `<path d="M200 300 L336 118 M200 300 L362 250 M200 300 L340 360 M200 300 L260 420 M300 150 L330 220 L320 300 L290 380" fill="none" stroke="#fff" stroke-width="1.2" opacity=".75"/>`;
      break;
    }
    case 'feather': {
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          const a = -1.1 + t * 1.5;
          const len = 150 - row * 40 - t * 30;
          const x0 = 206 + row * 10, y0 = 300 - row * 4;
          const x = x0 + Math.cos(a) * len, y = y0 + Math.sin(a) * len * 0.9 + t * 40;
          one += `<path d="M${n1(x0 + Math.cos(a) * len * 0.3)} ${n1(y0 + Math.sin(a) * len * 0.3)} Q${n1(x + 10)} ${n1(y - 24)} ${n1(x + 16)} ${n1(y + 6)} Q${n1(x - 6)} ${n1(y + 8)} ${n1(x0 + Math.cos(a) * len * 0.3)} ${n1(y0 + Math.sin(a) * len * 0.3 + 12)} Z" fill="url(#${id})" stroke="${st}" stroke-width="1"/>`;
        }
      }
      break;
    }
    case 'star': {
      one = `<path d="M200 300 C240 200 330 120 372 150 C390 200 320 280 200 310 Z" fill="url(#${id})" opacity=".9" stroke="${st}" stroke-width="1.2"/><path d="M200 312 C260 320 330 380 318 440 C290 460 240 400 200 318 Z" fill="url(#${id})" opacity=".9" stroke="${st}" stroke-width="1.2"/>`;
      const r = rng('wst');
      for (let i = 0; i < 12; i++) { const x = 230 + r() * 120, y = 170 + r() * 240; one += `<path d="${star(x, y, 2 + r() * 4)}" fill="#fff6b0"/>`; }
      break;
    }
  }
  let o = `<g class="wing-flap">${one}</g><g class="wing-flap" transform="translate(400 0) scale(-1 1)">${one}</g>`;
  if (p.kind === 'glow' || p.glow) o = `<g filter="url(#${P}glow)">${o}</g>`;
  return { defs, layers: { wings: o } };
}

// ---------- ЛИЦО: очки и маски; шарф; перчатки ----------
function renderFace(it, ctx) {
  const p = it.p, c = p.main;
  let o = '';
  switch (p.kind) {
    case 'round': o = `<circle cx="177" cy="170" r="17" fill="${p.tint || 'none'}" opacity="${p.tint ? 0.8 : 1}" stroke="${c}" stroke-width="3"/><circle cx="223" cy="170" r="17" fill="${p.tint || 'none'}" opacity="${p.tint ? 0.8 : 1}" stroke="${c}" stroke-width="3"/><path d="M194 168 Q200 163 206 168 M160 166 L148 162 M240 166 L252 162" stroke="${c}" stroke-width="2.4" fill="none"/>`; break;
    case 'heart': o = `<path d="${heart(177, 170, 17)}" fill="${p.tint || '#ff6f9f'}" opacity=".85" stroke="${c}" stroke-width="2.6"/><path d="${heart(223, 170, 17)}" fill="${p.tint || '#ff6f9f'}" opacity=".85" stroke="${c}" stroke-width="2.6"/><path d="M194 166 Q200 161 206 166" stroke="${c}" stroke-width="2.4" fill="none"/><path d="M168 160 l6 -4" stroke="#fff" stroke-width="2.4" opacity=".7"/>`; break;
    case 'star': o = `<path d="${star(177, 170, 20, 10)}" fill="${p.tint || '#ffd54a'}" opacity=".85" stroke="${c}" stroke-width="2.4"/><path d="${star(223, 170, 20, 10)}" fill="${p.tint || '#ffd54a'}" opacity=".85" stroke="${c}" stroke-width="2.4"/><path d="M194 168 Q200 163 206 168" stroke="${c}" stroke-width="2.4" fill="none"/>`; break;
    case 'cateye': o = `<path d="M156 164 Q176 154 196 162 Q194 182 176 184 Q160 182 156 164 Z M244 164 Q224 154 204 162 Q206 182 224 184 Q240 182 244 164 Z" fill="${p.tint || '#2a2030'}" opacity=".85" stroke="${c}" stroke-width="2.6"/><path d="M196 164 Q200 160 204 164" stroke="${c}" stroke-width="2.4" fill="none"/><path d="M164 164 l8 -3 M208 162 l8 -2" stroke="#fff" stroke-width="2" opacity=".6"/>`; break;
    case 'mask': {
      const m = `M150 160 C160 146 190 148 200 162 C210 148 240 146 250 160 C256 176 240 190 224 186 C214 184 206 178 200 176 C194 178 186 184 176 186 C160 190 144 176 150 160 Z`;
      o = `<path d="${m}" fill="${c}" stroke="${shade(c, -0.5)}" stroke-width="1.2" fill-rule="evenodd"/>
        <ellipse cx="177" cy="170" rx="12" ry="8" fill="#000" opacity=".0"/>
        <path d="M165 170 Q177 160 189 170 Q177 178 165 170 Z M211 170 Q223 160 235 170 Q223 178 211 170 Z" fill="#fbfbff" opacity=".001"/>`;
      // вырезы под глаза — делаем обводку, сами глаза остаются видны
      o = `<path d="${m} M165 170 Q177 159 190 170 Q177 179 165 170 Z M210 170 Q223 159 235 170 Q223 179 210 170 Z" fill="${c}" fill-rule="evenodd" stroke="${shade(c, -0.5)}" stroke-width="1.2"/>`;
      if (p.lace) o += `<path d="${m}" fill="none" stroke="#fff" stroke-width="1" stroke-dasharray="2 3" opacity=".8"/>`;
      if (p.gems) o += gem(200, 166, 4, p.gems) + `<path d="${sparkle(150, 160, 4)}" fill="#fff"/><path d="${sparkle(250, 160, 4)}" fill="#fff"/>`;
      if (p.feather) o += `<path d="M248 158 C270 120 286 100 300 90 C292 118 276 142 252 162 Z" fill="${p.feather}" stroke="${shade(p.feather, -0.4)}" stroke-width="1"/><path d="M250 160 C268 130 284 108 298 92" stroke="#fff" stroke-width=".8" opacity=".6"/>`;
      break;
    }
  }
  return { layers: { face: o } };
}

function renderScarf(it, ctx) {
  const { P } = ctx, p = it.p, c = p.main;
  let defs = patternDef(P, 'scPat', p.pat || 'stripes', c, p.acc);
  const band = smooth([[176, 258], [200, 270], [224, 258], [232, 272], [200, 290], [168, 272]], true);
  const tail = smooth([[210, 280], [228, 282], [236, 360], [226, 420], [210, 418], [216, 360]], true);
  const o = `<path d="${tail}" fill="${shade(c, -0.08)}" stroke="${shade(c, -0.45)}" stroke-width="1.2"/><path d="${tail}" fill="url(#${P}scPat)" opacity=".7"/>
    <path d="${band}" fill="${c}" stroke="${shade(c, -0.45)}" stroke-width="1.2"/><path d="${band}" fill="url(#${P}scPat)" opacity=".7"/>
    ${[0, 5, 10].map((dx) => `<path d="M${212 + dx} 418 l-1 8" stroke="${c}" stroke-width="2"/>`).join('')}`;
  return { defs, layers: { scarf: o } };
}

function renderGloves(it, ctx) {
  const p = it.p, c = p.main;
  let o = '';
  for (const side of ['L', 'R']) {
    const pts = armPoints(ctx.pose, side);
    const h = handOf(ctx.pose, side);
    if (p.kind === 'opera') {
      o += `<path d="${limb([pts[2], pts[3], pts[4], [h.x, h.y]], [11, 9.5, 8.4, 9], 0.2, 0.9)}" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1.1" opacity="${p.sheer ? 0.7 : 1}"/>`;
    } else {
      o += `<path d="${limb([pts[4], [h.x, h.y]], [11, 12], 0.2, 1.1)}" fill="${c}" stroke="${shade(c, -0.4)}" stroke-width="1.1"/>` + furBand(pts[4], 12);
    }
  }
  return { layers: { gloves: o } };
}

// ---------- ЭФФЕКТЫ ----------
function renderFx(it, ctx) {
  const { P } = ctx, p = it.p;
  const r = rng('fx' + p.kind);
  let back = '', front = '';
  const spots = Array.from({ length: 18 }, () => [30 + r() * 340, 40 + r() * 700, r()]);
  const each = (fn) => spots.map(([x, y, k], i) => `<g class="fx-float" style="animation-delay:${(-k * 6).toFixed(2)}s">${fn(x, y, k, i)}</g>`).join('');
  switch (p.kind) {
    case 'hearts': front = each((x, y, k) => `<path d="${heart(x, y, 5 + k * 7)}" fill="${['#ff6f9f', '#ff9fbf', '#e0415e'][Math.floor(k * 3)]}" opacity=".85"/>`); break;
    case 'stars': front = each((x, y, k) => `<path d="${star(x, y, 4 + k * 8)}" fill="${k > 0.5 ? '#ffe066' : '#fff6b0'}" opacity=".9"/>`); break;
    case 'snow': front = each((x, y, k) => snowflake(x, y, 5 + k * 7, '#fff', 1.6)); back = `<rect width="400" height="800" fill="#bfe8ff" opacity=".08"/>`; break;
    case 'flowers': front = each((x, y, k) => flowerDeco(x, y, ['#ff9fbf', '#fff', '#ffd966', '#c9a3ff'][Math.floor(k * 4)], 5 + k * 5)); break;
    case 'sparkle': front = each((x, y, k) => `<path d="${sparkle(x, y, 3 + k * 7)}" fill="#fff"/>`); break;
    case 'gold': front = each((x, y, k) => `<circle cx="${x}" cy="${y}" r="${1 + k * 2.5}" fill="${k > 0.5 ? '#ffd76a' : '#f2b92b'}"/><circle cx="${x + 10}" cy="${y + 14}" r="${1 + k}" fill="#ffe89a"/>`); break;
    case 'glow': back = `<ellipse cx="200" cy="420" rx="170" ry="360" fill="${p.col || '#ffd6f5'}" opacity=".55" filter="url(#${P}fxBlur)"/>`; break;
    case 'butterflies': front = spots.slice(0, 9).map(([x, y, k], i) => `<g class="fx-float" style="animation-delay:${(-k * 6).toFixed(2)}s"><g filter="url(#${P}glow)" transform="translate(${x} ${y}) scale(${0.7 + k * 0.6})"><path d="M0 0 C-4 -14 -18 -14 -16 -2 C-14 6 -4 4 0 0 C4 4 14 6 16 -2 C18 -14 4 -14 0 0 Z" fill="${['#9fe0ff', '#ffc2f0', '#fff3a0'][i % 3]}" opacity=".9"/></g></g>`).join(''); break;
    case 'rainbow': back = [['#ff7b7b', 0], ['#ffb86b', 1], ['#ffe66b', 2], ['#8fe38a', 3], ['#7fc4ff', 4], ['#b58cff', 5]].map(([cc, i]) => `<path d="M${20 + i * 10} 470 A${180 - i * 10} ${260 - i * 10} 0 0 1 ${380 - i * 10} 470" fill="none" stroke="${cc}" stroke-width="10" opacity=".55"/>`).join(''); break;
  }
  const defs = `<filter id="${P}fxBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="30"/></filter>`;
  return { defs, layers: { fxBack: back, fxFront: front } };
}

export function renderItem(kind, it, ctx) {
  CP = ctx.P;
  switch (kind) {
    case 'base': return renderBase(ctx);
    case 'dress': return renderDress(it, ctx);
    case 'outer': return renderOuter(it, ctx);
    case 'shoes': return renderShoes(it, ctx);
    case 'head': return renderHead(it, ctx);
    case 'earrings': return renderEarrings(it, ctx);
    case 'necklace': return renderNecklace(it, ctx);
    case 'bracelet': return renderBracelet(it, ctx);
    case 'ring': return renderRing(it, ctx);
    case 'held': return renderHeld(it, ctx);
    case 'bag': return renderBag(it, ctx);
    case 'wings': return renderWings(it, ctx);
    case 'face': return renderFace(it, ctx);
    case 'scarf': return renderScarf(it, ctx);
    case 'gloves': return renderGloves(it, ctx);
    case 'fx': return renderFx(it, ctx);
    case 'hair': return null;
  }
  return null;
}

export { star, heart, sparkle, snowflake, gem, bow };
