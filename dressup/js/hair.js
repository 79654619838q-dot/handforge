// Волосы: цвета (в т.ч. градиенты), причёски из слоёв «за телом», «на теле», «чёлка».
import { shade, smooth, along, rng, limb } from './util.js';

export const HAIR_COLORS = {
  blonde: { name: 'Блонд', c: ['#f3d488'], },
  dark: { name: 'Тёмный', c: ['#2f2533'] },
  brown: { name: 'Коричневый', c: ['#6e4428'] },
  chestnut: { name: 'Каштановый', c: ['#8a4a2a'] },
  red: { name: 'Рыжий', c: ['#c9542c'] },
  pink: { name: 'Розовый', c: ['#f49ac1'] },
  blue: { name: 'Голубой', c: ['#63a6f2'] },
  purple: { name: 'Фиолетовый', c: ['#9b63d9'] },
  silver: { name: 'Серебряный', c: ['#dde1ea'] },
  gold: { name: 'Золотой', c: ['#e0ae35'] },
  pinkblue: { name: 'Розово-голубой', c: ['#f7a3c8', '#7fb6f5'] },
  lilacpink: { name: 'Сиреневый закат', c: ['#b58cf0', '#f6a1c6'] },
  blondepink: { name: 'Блонд-роза', c: ['#f5dc97', '#f39bbf'] },
  bluemint: { name: 'Морская волна', c: ['#5aa0f0', '#7fe3c8'] },
  sunset: { name: 'Закат', c: ['#f4c05a', '#ee6d6d'] },
  aurora: { name: 'Северное сияние', c: ['#7fe3c8', '#a97ff0'] },
};

export function hairTone(key) {
  const h = HAIR_COLORS[key] || HAIR_COLORS.brown;
  const top = h.c[0], bot = h.c[1] || h.c[0];
  return { top, bot, base: top, dark: shade(bot, -0.38), light: shade(top, 0.45), brow: shade(h.c[0], -0.45) };
}

export function hairDefs(P, key) {
  const t = hairTone(key);
  return `
  <linearGradient id="${P}hair" x1="0" y1="70" x2="0" y2="700" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${shade(t.top, 0.08)}"/><stop offset=".22" stop-color="${t.top}"/>
    <stop offset=".75" stop-color="${t.bot}"/><stop offset="1" stop-color="${shade(t.bot, -0.15)}"/>
  </linearGradient>
  <linearGradient id="${P}hairSide" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".3" stop-color="#000" stop-opacity="0"/>
    <stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/>
  </linearGradient>`;
}

const LEN = { short: 330, medium: 450, long: 560 };

// Пряди: тёмные и светлые линии вдоль массы волос.
function strands(P, t, lines, w = 1.3) {
  return lines.map((pts, i) =>
    `<path d="${smooth(pts)}" fill="none" stroke="${i % 3 === 2 ? t.light : t.dark}" stroke-width="${i % 3 === 2 ? w * 1.4 : w}" stroke-linecap="round" opacity="${i % 3 === 2 ? 0.45 : 0.4}"/>`).join('');
}

function mass(P, d, t) {
  return `<path d="${d}" fill="url(#${P}hair)" stroke="${t.dark}" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="${d}" fill="url(#${P}hairSide)"/>`;
}

// Волнистая сторона: x = base + волна.
function waveSide(x0, y0, x1, y1, amp, n, phase = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x0 + (x1 - x0) * t + Math.sin(t * Math.PI * 4 + phase) * amp * t, y0 + (y1 - y0) * t]);
  }
  return pts;
}

// Длинная распущенная масса (сзади), стиль: straight | wavy | curly.
function longBack(P, t, bottom, kind = 'straight', width = 1) {
  const W = (x) => 200 + (x - 200) * width;
  const amp = kind === 'wavy' ? 9 : kind === 'curly' ? 14 : 2;
  const n = kind === 'curly' ? 16 : 8;
  const R = waveSide(W(262), 190, W(282), bottom - 20, amp, n);
  const L = waveSide(W(138), 190, W(118), bottom - 20, amp, n, Math.PI);
  const tips = [];
  const r = rng('tips' + bottom + kind);
  for (let x = W(280); x >= W(120); x -= 20) tips.push([x, bottom - (r() * 26) - ((x > 180 && x < 220) ? 30 : 0)]);
  const top = [[W(126), 150], [W(142), 102], [200, 72], [W(258), 102], [W(274), 150]];
  const d = smooth([...top.slice(2), ...R, ...tips, ...L.reverse(), ...top.slice(0, 2)], true);
  let o = mass(P, d, t);
  if (kind === 'curly') {
    const rr = rng('curls' + bottom);
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const y = 210 + rr() * (bottom - 240);
      const x = 200 + side * (62 + rr() * 22) * width + side * ((y - 200) / (bottom - 200)) * 18;
      o += `<path d="M${x - 8} ${y} q8 -12 16 0 q-8 12 -16 0" fill="none" stroke="${i % 3 ? t.dark : t.light}" stroke-width="1.4" opacity=".45"/>`;
    }
  }
  const lines = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x0 = 200 + s * (36 + k * 7);
      const pts = waveSide(200 + s * (46 + k * 4) * width, 200, 200 + s * (56 + k * 5) * width, bottom - 34 - k * 10, amp * 0.8, n, s > 0 ? 0 : Math.PI);
      lines.push([[x0, 96], ...pts]);
    }
  }
  return o + strands(P, t, lines);
}

// Шапка волос за головой (для собранных причёсок).
function capBack(P, t, low = 205) {
  const d = smooth([[200, 74], [252, 90], [270, 140], [266, low], [240, low + 14], [160, low + 14], [134, low], [130, 140], [148, 90]], true);
  return mass(P, d, t);
}

// Чёлка и пряди у лица.
function bangs(P, t, kind, locks = true, lockLen = 250) {
  let d;
  if (kind === 'fringe') {
    d = smooth([[146, 176], [138, 130], [158, 92], [200, 80], [242, 92], [262, 130], [254, 176], [250, 150],
      [238, 140], [226, 146], [214, 138], [200, 146], [186, 138], [172, 146], [160, 140], [150, 152]], true);
  } else if (kind === 'curtain') {
    d = smooth([[146, 184], [138, 128], [160, 90], [200, 80], [240, 90], [262, 128], [254, 184], [248, 150],
      [232, 122], [212, 108], [200, 104], [188, 108], [168, 122], [152, 150]], true);
  } else {
    d = smooth([[146, 184], [138, 126], [162, 88], [204, 80], [246, 94], [262, 132], [254, 168], [246, 140],
      [226, 124], [196, 128], [172, 140], [156, 156]], true);
  }
  let o = `<path d="${d}" fill="url(#${P}hair)" stroke="${t.dark}" stroke-width="1.3" stroke-linejoin="round"/>`;
  // тень от чёлки на лбу рисуется под ней (см. drawHair)
  const lines = kind === 'fringe'
    ? [[[170, 92], [168, 118], [172, 144]], [[190, 86], [188, 116], [186, 140]], [[212, 86], [214, 116], [214, 140]], [[232, 94], [236, 120], [238, 142]], [[200, 82], [201, 110], [200, 144]]]
    : kind === 'curtain'
      ? [[[196, 86], [176, 98], [156, 116], [146, 150]], [[204, 86], [224, 98], [244, 116], [254, 150]], [[186, 86], [164, 98], [150, 126]], [[214, 86], [236, 98], [250, 126]], [[200, 82], [184, 92], [168, 104]]]
      : [[[204, 84], [176, 104], [156, 150]], [[214, 88], [196, 112], [170, 140]], [[230, 94], [212, 118], [196, 128]], [[244, 104], [252, 130], [254, 164]], [[196, 84], [168, 104], [150, 160]]];
  o += strands(P, t, lines, 1.2);
  // блик-корона
  o += `<path d="M160 104 C180 90 222 88 242 104" fill="none" stroke="${t.light}" stroke-width="6" stroke-linecap="round" opacity=".35"/>`;
  if (locks) {
    for (const s of [-1, 1]) {
      const x = 200 + s * 56;
      const lock = smooth([[x - s * 2, 140], [x + s * 6, 180], [x + s * 4, lockLen - 40], [x + s * 10, lockLen], [x + s * 16, lockLen - 30], [x + s * 18, 190], [x + s * 10, 140]], true);
      o += `<path d="${lock}" fill="url(#${P}hair)" stroke="${t.dark}" stroke-width="1.2"/>`;
      o += `<path d="${smooth([[x + s * 8, 150], [x + s * 10, 200], [x + s * 10, lockLen - 10]])}" fill="none" stroke="${t.dark}" stroke-width="1" opacity=".4"/>`;
    }
  }
  return o;
}

// Коса вдоль линии: чередующиеся звенья.
function braid(P, t, pts, w = 16, segs = 12) {
  let o = '';
  for (let i = 0; i < segs; i++) {
    const k = i / segs;
    const [x, y, a] = along(pts, k + 0.5 / segs);
    const ww = w * (1 - k * 0.45);
    const side = i % 2 ? 1 : -1;
    const deg = (a * 180) / Math.PI;
    o += `<g transform="translate(${x} ${y}) rotate(${deg})">
      <path d="M${-ww * 1.1} ${side * ww * 0.15} C${-ww * 0.4} ${-side * ww * 1.05} ${ww * 0.8} ${-side * ww * 0.9} ${ww * 1.15} ${side * ww * 0.35} C${ww * 0.4} ${side * ww * 0.9} ${-ww * 0.6} ${side * ww * 0.8} ${-ww * 1.1} ${side * ww * 0.15} Z"
        fill="url(#${P}hair)" stroke="${t.dark}" stroke-width="1.2"/>
      <path d="M${-ww * 0.5} ${-side * ww * 0.45} C0 ${-side * ww * 0.7} ${ww * 0.5} ${-side * ww * 0.5} ${ww * 0.8} ${-side * ww * 0.1}" fill="none" stroke="${t.light}" stroke-width="2" opacity=".45"/>
    </g>`;
  }
  const [ex, ey] = along(pts, 1);
  o += `<path d="M${ex - 6} ${ey - 4} C${ex - 10} ${ey + 12} ${ex + 10} ${ey + 12} ${ex + 6} ${ey - 4} Z" fill="url(#${P}hair)" stroke="${t.dark}" stroke-width="1"/>`;
  return o;
}

function tie(x, y, col = '#f06292') {
  return `<ellipse cx="${x}" cy="${y}" rx="9" ry="5" fill="${col}" stroke="${shade(col, -0.35)}" stroke-width="1"/>
          <ellipse cx="${x - 3}" cy="${y - 1.5}" rx="3" ry="1.4" fill="#fff" opacity=".5"/>`;
}

function bun(P, t, cx, cy, r) {
  let o = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${P}hair)" stroke="${t.dark}" stroke-width="1.4"/>`;
  for (let i = 0; i < 4; i++) {
    const rr = r * (0.85 - i * 0.18);
    o += `<path d="M${cx - rr} ${cy} A${rr} ${rr * 0.8} 0 0 1 ${cx + rr} ${cy - rr * 0.2}" fill="none" stroke="${i % 2 ? t.light : t.dark}" stroke-width="1.4" opacity=".45"/>`;
  }
  return o;
}

function ringlet(P, t, x, y0, len, s) {
  const n = Math.max(4, Math.round(len / 14));
  const pts = [], ws = [];
  for (let i = 0; i <= n; i++) {
    pts.push([x + Math.sin(i * 1.25) * 3.5 * s + i * 0.6 * s, y0 + (i * len) / n]);
    ws.push(10.5 - (i / n) * 6);
  }
  let o = `<path d="${limb(pts, ws, 0.6, 0.9)}" fill="url(#${P}hair)" stroke="${t.dark}" stroke-width="1.2"/>`;
  for (let i = 1; i < n; i++) {
    const [px, py] = pts[i], w = ws[i];
    o += `<path d="M${px - w} ${py - 4} Q${px} ${py + 5} ${px + w} ${py - 6}" fill="none" stroke="${t.dark}" stroke-width="1.1" opacity=".5"/>`;
    o += `<path d="M${px - w * 0.7} ${py - 8} Q${px - 1} ${py - 2} ${px + w * 0.5} ${py - 9}" fill="none" stroke="${t.light}" stroke-width="1.8" opacity=".45"/>`;
  }
  return o;
}

function flowerDeco(x, y, col, r = 9) {
  let o = '';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    o += `<ellipse cx="${x + Math.cos(a) * r * 0.62}" cy="${y + Math.sin(a) * r * 0.62}" rx="${r * 0.55}" ry="${r * 0.42}" transform="rotate(${(a * 180) / Math.PI} ${x + Math.cos(a) * r * 0.62} ${y + Math.sin(a) * r * 0.62})" fill="${col}" stroke="${shade(col, -0.3)}" stroke-width=".8"/>`;
  }
  return o + `<circle cx="${x}" cy="${y}" r="${r * 0.3}" fill="#ffd54a" stroke="#c99a1a" stroke-width=".6"/>`;
}
function crystalDeco(x, y, col = '#bfe8ff', s = 1) {
  return `<path d="M${x} ${y - 9 * s} L${x + 5 * s} ${y} L${x} ${y + 9 * s} L${x - 5 * s} ${y} Z" fill="${col}" stroke="${shade(col, -0.4)}" stroke-width=".8"/>
          <path d="M${x} ${y - 9 * s} L${x + 2 * s} ${y} L${x} ${y + 9 * s}" fill="#fff" opacity=".6"/>`;
}
function pearl(x, y, r = 3.2) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fbf6ee" stroke="#b9ab96" stroke-width=".6"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.35}" fill="#fff"/>`;
}
function shell(x, y, col = '#ffc3b3', s = 1) {
  let o = `<path d="M${x - 9 * s} ${y + 4 * s} Q${x} ${y - 14 * s} ${x + 9 * s} ${y + 4 * s} Q${x} ${y + 8 * s} ${x - 9 * s} ${y + 4 * s} Z" fill="${col}" stroke="${shade(col, -0.35)}" stroke-width=".8"/>`;
  for (let i = -2; i <= 2; i++) o += `<path d="M${x} ${y + 6 * s} L${x + i * 4 * s} ${y - 6 * s + Math.abs(i) * 2 * s}" stroke="${shade(col, -0.3)}" stroke-width=".6"/>`;
  return o;
}

// Каталог причёсок. Каждая — функция (P, t, a) → { back, over, front }.
export const HAIR_STYLES = {
  loose: { name: 'Распущенные', group: 'Длинные', tags: ['casual', 'summer', 'school', 'party'],
    draw: (P, t, a) => ({ back: longBack(P, t, LEN[a.hairLen || 'long'], 'straight'), front: bangs(P, t, a.bangs, true, 260) }) },
  wavy: { name: 'Волнистые', group: 'Длинные', tags: ['summer', 'beach', 'party', 'casual', 'flower'],
    draw: (P, t, a) => ({ back: longBack(P, t, LEN[a.hairLen || 'long'], 'wavy'), front: bangs(P, t, a.bangs, true, 260) }) },
  curly: { name: 'Кудрявые', group: 'Длинные', tags: ['party', 'summer', 'birthday'],
    draw: (P, t, a) => ({ back: longBack(P, t, LEN[a.hairLen || 'long'] - 40, 'curly', 1.12), front: bangs(P, t, a.bangs, false) }) },
  braid: { name: 'Коса', group: 'Длинные', tags: ['casual', 'ride', 'school', 'travel', 'fairy'],
    draw: (P, t, a) => ({ back: capBack(P, t), over: braid(P, t, [[236, 200], [250, 250], [252, 330], [246, 420], [240, 470]], 17, 12) + tie(240, 470), front: bangs(P, t, a.bangs, false) }) },
  twobraids: { name: 'Две косы', group: 'Длинные', tags: ['casual', 'school', 'summer', 'ride'],
    draw: (P, t, a) => ({ back: capBack(P, t), over: braid(P, t, [[158, 200], [146, 260], [144, 340], [148, 410]], 14, 10) + tie(148, 410) + braid(P, t, [[242, 200], [254, 260], [256, 340], [252, 410]], 14, 10) + tie(252, 410), front: bangs(P, t, a.bangs, false) }) },
  ponytail: { name: 'Хвост', group: 'Длинные', tags: ['sport', 'casual', 'ride', 'school', 'shop'],
    draw: (P, t, a) => {
      const tail = smooth([[248, 120], [282, 150], [296, 230], [292, 330], [276, 420], [266, 380], [270, 300], [262, 210], [240, 150]], true);
      return { back: mass(P, tail, t) + strands(P, t, [[[258, 140], [282, 220], [280, 380]], [[252, 150], [272, 240], [270, 360]]]) + capBack(P, t), over: tie(250, 128), front: bangs(P, t, a.bangs, false) };
    } },
  highpony: { name: 'Высокий хвост', group: 'Длинные', tags: ['sport', 'party', 'night', 'casual'],
    draw: (P, t, a) => {
      const tail = smooth([[196, 70], [236, 58], [276, 90], [292, 170], [290, 280], [276, 380], [264, 330], [270, 230], [256, 140], [222, 90]], true);
      return { back: mass(P, tail, t) + strands(P, t, [[[230, 70], [270, 120], [282, 260], [276, 360]], [[220, 76], [258, 130], [272, 250]]]) + capBack(P, t), over: tie(214, 72), front: bangs(P, t, a.bangs, false) };
    } },
  bob: { name: 'Каре', group: 'Короткие', tags: ['casual', 'school', 'cafe', 'shop'],
    draw: (P, t, a) => ({ back: mass(P, smooth([[200, 72], [256, 88], [276, 150], [278, 238], [262, 262], [200, 256], [138, 262], [122, 238], [124, 150], [144, 88]], true), t), front: bangs(P, t, a.bangs, true, 240) }) },
  updo: { name: 'Высокая причёска', group: 'Королевские', tags: ['royal', 'ball', 'wedding', 'evening', 'coronation'],
    draw: (P, t, a) => ({ back: bun(P, t, 200, 72, 34) + capBack(P, t), front: bangs(P, t, 'curtain', false) }) },
  royalcurls: { name: 'Королевские локоны', group: 'Королевские', tags: ['royal', 'ball', 'wedding', 'coronation', 'evening'],
    draw: (P, t, a) => ({ back: bun(P, t, 200, 78, 30) + capBack(P, t), over: ringlet(P, t, 144, 196, 120, -1) + ringlet(P, t, 256, 196, 120, 1), front: bangs(P, t, 'curtain', false) }) },
  curls: { name: 'Локоны', group: 'Королевские', tags: ['royal', 'ball', 'party', 'wedding'],
    draw: (P, t, a) => ({ back: longBack(P, t, LEN[a.hairLen || 'long'], 'curly'), over: ringlet(P, t, 142, 200, 150, -1) + ringlet(P, t, 258, 200, 150, 1), front: bangs(P, t, a.bangs, false) }) },
  crownbraid: { name: 'Сложная коса', group: 'Королевские', tags: ['royal', 'wedding', 'fairy', 'flower'],
    draw: (P, t, a) => ({ back: longBack(P, t, LEN[a.hairLen || 'long'], 'wavy'), front: bangs(P, t, 'curtain', true, 250) + braid(P, t, [[140, 150], [156, 104], [200, 86], [244, 104], [260, 150]], 12, 11) }) },
  jeweled: { name: 'Причёска с украшениями', group: 'Королевские', tags: ['royal', 'ball', 'evening', 'wedding'],
    draw: (P, t, a) => {
      let deco = '';
      for (let i = 0; i < 9; i++) { const ang = Math.PI * (0.1 + i * 0.1); deco += pearl(200 + Math.cos(ang) * 40, 72 - Math.sin(ang) * 26 + 10, 3.4); }
      return { back: bun(P, t, 200, 74, 34) + capBack(P, t) + deco, over: ringlet(P, t, 146, 200, 90, -1) + ringlet(P, t, 254, 200, 90, 1), front: bangs(P, t, 'curtain', false) };
    } },
  fairy: { name: 'Волосы феи', group: 'Фантазийные', tags: ['fairy', 'magic', 'forest', 'flower'],
    draw: (P, t, a) => {
      const r = rng('fairy'); let sp = '';
      for (let i = 0; i < 22; i++) { const s = i % 2 ? 1 : -1; const y = 200 + r() * 420; const x = 200 + s * (60 + r() * 30); sp += `<path d="M${x} ${y - 5} L${x + 1.4} ${y - 1.4} L${x + 5} ${y} L${x + 1.4} ${y + 1.4} L${x} ${y + 5} L${x - 1.4} ${y + 1.4} L${x - 5} ${y} L${x - 1.4} ${y - 1.4} Z" fill="#fff" opacity=".85"/>`; }
      return { back: longBack(P, t, 650, 'wavy', 1.05) + sp, front: bangs(P, t, a.bangs, true, 270) };
    } },
  mermaid: { name: 'Волосы русалки', group: 'Фантазийные', tags: ['mermaid', 'beach', 'underwater'],
    draw: (P, t, a) => ({ back: longBack(P, t, 700, 'wavy', 1.1), over: shell(252, 250, '#ffc3b3', 1.2) + shell(148, 300, '#ffe0d0') + pearl(250, 270, 3) + pearl(150, 318, 3), front: bangs(P, t, a.bangs, true, 280) + shell(234, 104, '#ffb6c8', 1.1) }) },
  shine: { name: 'Сияющие волосы', group: 'Фантазийные', tags: ['magic', 'night', 'fairy', 'party'],
    draw: (P, t, a) => ({ back: `<g filter="url(#${P}glow)">${longBack(P, t, 600, 'straight', 1.04)}</g>`, front: bangs(P, t, a.bangs, true, 270) }) },
  flowers: { name: 'Причёска с цветами', group: 'Фантазийные', tags: ['flower', 'garden', 'summer', 'fairy', 'wedding'],
    draw: (P, t, a) => ({ back: longBack(P, t, LEN[a.hairLen || 'long'], 'wavy'), over: flowerDeco(252, 240, '#ffb3c7') + flowerDeco(148, 280, '#fff1f5', 8) + flowerDeco(256, 330, '#d9b3ff', 7), front: bangs(P, t, a.bangs, true, 260) + flowerDeco(236, 108, '#ff8fb0', 10) + flowerDeco(252, 124, '#fff', 7) }) },
  crystals: { name: 'Причёска с кристаллами', group: 'Фантазийные', tags: ['winter', 'magic', 'evening', 'night'],
    draw: (P, t, a) => ({ back: bun(P, t, 200, 76, 32) + capBack(P, t) + crystalDeco(178, 62) + crystalDeco(200, 52, '#e2c9ff') + crystalDeco(222, 62), over: ringlet(P, t, 146, 200, 100, -1) + ringlet(P, t, 254, 200, 100, 1), front: bangs(P, t, a.bangs, false) + crystalDeco(240, 112, '#bfe8ff', 0.8) }) },
  halfup: { name: 'Полураспущенные с бантом', group: 'Длинные', tags: ['casual', 'party', 'birthday', 'cafe', 'school'],
    draw: (P, t, a) => ({ back: longBack(P, t, LEN[a.hairLen || 'long'], 'wavy'), front: bangs(P, t, a.bangs, true, 250) }) },
};

export function drawHair(P, a) {
  const t = hairTone(a.hairColor);
  const st = HAIR_STYLES[a.hairStyle] || HAIR_STYLES.loose;
  const r = st.draw(P, t, a);
  // тень от чёлки на лбу
  const shadow = `<path d="M150 150 C160 120 240 120 250 150 C240 140 160 140 150 150 Z" fill="#3b1a1a" opacity=".06" filter="url(#${P}blur4)"/>`;
  return { defs: hairDefs(P, a.hairColor), back: r.back || '', over: r.over || '', front: shadow + (r.front || ''), tone: t };
}

export { flowerDeco, crystalDeco, pearl, shell };
