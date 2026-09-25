// Тело принцессы: геометрия, позы, лицо. Холст куклы — viewBox 0 0 400 800.
import { shade, smooth, limb, mix } from './util.js';

export const SKINS = {
  porcelain: '#fde6d8', light: '#f7d3bb', peach: '#f0c19f', tan: '#dca47c',
  caramel: '#bb7d55', brown: '#8f5c3c', deep: '#5f3b27',
};
export const SKIN_NAMES = {
  porcelain: 'Фарфоровая', light: 'Светлая', peach: 'Персиковая', tan: 'Загорелая',
  caramel: 'Карамельная', brown: 'Шоколадная', deep: 'Тёмная',
};
export const EYES = {
  blue: '#3f8fe0', green: '#34a35a', brown: '#7b4a24', hazel: '#9b7b36', violet: '#8b5cd8',
  gray: '#7c8fa6', amber: '#d38a1c', teal: '#1ea0a0', dark: '#3b2a22',
};
export const EYE_NAMES = {
  blue: 'Голубые', green: 'Зелёные', brown: 'Карие', hazel: 'Ореховые', violet: 'Фиалковые',
  gray: 'Серые', amber: 'Янтарные', teal: 'Бирюзовые', dark: 'Тёмные',
};
export const LIPS = { pink: '#e97b92', rose: '#d64d6a', coral: '#ef7a63', nude: '#d49a88', berry: '#b02f5b', peach: '#f19b87' };
export const LIP_NAMES = { pink: 'Розовые', rose: 'Малиновые', coral: 'Коралловые', nude: 'Нюд', berry: 'Ягодные', peach: 'Персиковые' };
export const BROWS = { soft: 'Мягкие', arched: 'Дугой', straight: 'Прямые' };

// Позы: точки плеч/локтей/запястий/кистей. L — слева на экране, держит предмет.
const SH_L = [159, 291], SH_R = [241, 291];
export const POSES = {
  stand: {
    name: 'Стоит',
    L: [SH_L, [138, 372], [128, 452]],
    R: [SH_R, [262, 372], [272, 452]],
  },
  wave: {
    name: 'Машет',
    L: [SH_L, [138, 372], [128, 452]],
    R: [SH_R, [298, 262], [318, 186]],
  },
  hip: {
    name: 'Рука на талии',
    L: [SH_L, [138, 372], [128, 452]],
    R: [SH_R, [296, 336], [250, 372]],
  },
  curtsy: {
    name: 'Реверанс',
    L: [SH_L, [124, 360], [98, 436]],
    R: [SH_R, [276, 360], [302, 436]],
  },
};

export function handOf(pose, side) {
  const a = POSES[pose]?.[side] || POSES.stand[side];
  const [e, w] = [a[1], a[2]];
  const dx = w[0] - e[0], dy = w[1] - e[1], l = Math.hypot(dx, dy);
  return { x: w[0] + (dx / l) * 16, y: w[1] + (dy / l) * 16, ang: Math.atan2(dy, dx) };
}

export function armPoints(pose, side) {
  const a = POSES[pose]?.[side] || POSES.stand[side];
  // промежуточные точки делают сгиб плавным
  const mid = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  return [a[0], mid(a[0], a[1], 0.5), a[1], mid(a[1], a[2], 0.5), a[2]];
}
export const ARM_W = [15.5, 12.2, 9.8, 8.6, 7.4];

// Контур туловища: правая сторона (x > 200) по высоте; левая — зеркально.
const TORSO_R = [
  [214, 262], [236, 272], [250, 280], [256, 294], [254, 312], [248, 332], [239, 352],
  [234, 366], [237, 386], [243, 410], [246, 426],
];
export const torsoX = (y) => {
  const p = TORSO_R;
  if (y <= p[0][1]) return p[0][0];
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i][1]) {
      const t = (y - p[i - 1][1]) / (p[i][1] - p[i - 1][1]);
      return p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t;
    }
  }
  return p[p.length - 1][0];
};
// Половина ширины туловища на высоте y.
export const halfW = (y) => torsoX(y) - 200;
export const WAIST_Y = 366;
export const HIP_Y = 426;

export function torsoPath() {
  const R = TORSO_R;
  const L = R.map(([x, y]) => [400 - x, y]).reverse();
  return smooth([...R, [212, 440], [188, 440], ...L], true);
}

// Полоса туловища между двумя высотами — основа любого лифа.
export function torsoBand(y0, y1, topCurve = 0, botCurve = 0, grow = 0) {
  const step = 8, R = [], L = [];
  for (let y = y0; y <= y1; y += step) R.push([torsoX(y) + grow, y]);
  if (R[R.length - 1][1] !== y1) R.push([torsoX(y1) + grow, y1]);
  for (const [x, y] of R) L.unshift([400 - x, y]);
  const botMid = [200, y1 + botCurve];
  const topMid = [200, y0 + topCurve];
  return smooth([...R, botMid, ...L.reverse().reverse(), topMid], true);
}

const LEG = {
  L: [[182, 420], [180, 500], [181, 580], [183, 650], [185, 704]],
  R: [[218, 420], [220, 500], [219, 580], [217, 650], [215, 704]],
};
const LEG_W = [23, 18, 12.5, 9.5, 7.6];
export const legPoints = (side) => LEG[side];
export const LEG_WIDTHS = LEG_W;

function footPath(side) {
  const s = side === 'L' ? -1 : 1;
  const ax = side === 'L' ? 185 : 215;
  return smooth([
    [ax - 7, 698], [ax + 7, 698], [ax + 9 + s * 3, 714], [ax + s * 9, 728],
    [ax + s * 3, 731], [ax - 6 + s * 4, 726], [ax - 9, 712],
  ], true);
}
export const FOOT = { L: footPath('L'), R: footPath('R') };

export function skinDefs(P, skin) {
  const s = SKINS[skin] || skin;
  return `
  <linearGradient id="${P}sk" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${shade(s, -0.16)}"/><stop offset=".35" stop-color="${s}"/>
    <stop offset=".6" stop-color="${shade(s, 0.08)}"/><stop offset="1" stop-color="${shade(s, -0.14)}"/>
  </linearGradient>
  <radialGradient id="${P}face" cx=".5" cy=".42" r=".62">
    <stop offset="0" stop-color="${shade(s, 0.12)}"/><stop offset=".7" stop-color="${s}"/>
    <stop offset="1" stop-color="${shade(s, -0.12)}"/>
  </radialGradient>
  ${armClip(P)}
  <filter id="${P}blur4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="${P}blur2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
  <filter id="${P}blur1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1"/></filter>
  <filter id="${P}glow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="${P}fur" x="-20%" y="-40%" width="140%" height="180%">
    <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="${P}soft" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#3a1030" flood-opacity=".25"/>
  </filter>`;
}

export function drawLegs(P, skin) {
  const s = SKINS[skin] || skin, line = shade(s, -0.3);
  let o = '';
  for (const side of ['L', 'R']) {
    o += `<path d="${limb(LEG[side], LEG_W, 0.2, 0.4)}" fill="url(#${P}sk)" stroke="${line}" stroke-width="1.2"/>`;
    o += `<path d="${FOOT[side]}" fill="${s}" stroke="${line}" stroke-width="1.2"/>`;
    // колено
    const k = LEG[side][2];
    o += `<path d="M${k[0] - 5} ${k[1] - 2}q5 4 10 0" fill="none" stroke="${line}" stroke-width="1" opacity=".4"/>`;
  }
  return o;
}

export function drawTorso(P, skin) {
  const s = SKINS[skin] || skin, line = shade(s, -0.3);
  return `<path d="M187 214 L187 270 Q200 278 213 270 L213 214 Z" fill="url(#${P}sk)" stroke="${line}" stroke-width="1.2"/>
  <path d="${torsoPath()}" fill="url(#${P}sk)" stroke="${line}" stroke-width="1.2"/>
  <path d="M187 238 Q200 250 213 238 L213 226 Q200 236 187 226 Z" fill="${shade(s, -0.22)}" opacity=".45"/>
  <path d="M170 284 Q184 290 194 286 M230 284 Q216 290 206 286" fill="none" stroke="${line}" stroke-width="1" opacity=".35"/>`;
}

export function drawArm(P, skin, pose, side) {
  const s = SKINS[skin] || skin, line = shade(s, -0.3);
  const pts = armPoints(pose, side);
  return `<path d="${limb(pts, ARM_W, 0.6, 0.3)}" fill="url(#${P}sk)" stroke="${line}" stroke-width="1.2" clip-path="url(#${P}armclip)"/>`;
}

export function drawHand(P, skin, pose, side) {
  const s = SKINS[skin] || skin, line = shade(s, -0.3);
  const h = handOf(pose, side);
  const deg = (h.ang * 180) / Math.PI - 90;
  const mirror = side === 'L' ? 1 : -1;
  // кисть: ладонь + большой палец, ориентирована по предплечью
  return `<g transform="translate(${h.x - Math.cos(h.ang) * 6} ${h.y - Math.sin(h.ang) * 6}) rotate(${deg})">
    <path d="M-7 -8 C-9 0 -8 9 -3 13 C0 15 4 14 6 10 C8 4 8 -3 6 -9 Z" fill="${s}" stroke="${line}" stroke-width="1.1"/>
    <path d="M${mirror * 5} -6 C${mirror * 11} -2 ${mirror * 11} 4 ${mirror * 8} 6" fill="${s}" stroke="${line}" stroke-width="1.1"/>
    <path d="M-3 6 L-3 11 M0 7 L0 12 M3 6 L3 10" stroke="${line}" stroke-width=".7" opacity=".45"/>
  </g>`;
}

// Лицо: голова, уши, глаза, брови, нос, губы, румянец, веснушки.
export function drawHead(P, a) {
  const s = SKINS[a.skin] || a.skin, line = shade(s, -0.32);
  const eye = EYES[a.eyes] || a.eyes;
  const lip = LIPS[a.lips] || a.lips;
  const browCol = a.browColor || '#4a3428';
  const face = 'M146 152 C146 100 254 100 254 152 C254 200 234 234 200 240 C166 234 146 200 146 152 Z';
  let o = '';
  // уши
  for (const [x, sx] of [[147, -1], [253, 1]]) {
    o += `<path d="M${x} 158 C${x + sx * 11} 150 ${x + sx * 14} 172 ${x + sx * 4} 184 Z" fill="${s}" stroke="${line}" stroke-width="1.1"/>`;
    o += `<path d="M${x + sx * 2} 162 C${x + sx * 8} 160 ${x + sx * 8} 172 ${x + sx * 3} 178" fill="none" stroke="${line}" stroke-width=".8" opacity=".5"/>`;
  }
  o += `<path d="${face}" fill="url(#${P}face)" stroke="${line}" stroke-width="1.3"/>`;
  // румянец
  o += `<ellipse cx="168" cy="196" rx="15" ry="9" fill="#ff7f9a" opacity=".32" filter="url(#${P}blur4)"/>
        <ellipse cx="232" cy="196" rx="15" ry="9" fill="#ff7f9a" opacity=".32" filter="url(#${P}blur4)"/>`;
  if (a.freckles) {
    const dots = [[160, 190], [166, 186], [171, 192], [163, 196], [175, 188], [240, 190], [234, 186], [229, 192], [237, 196], [225, 188], [195, 184], [205, 184]];
    o += dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="${shade(s, -0.4)}" opacity=".55"/>`).join('');
  }
  // глаза
  for (const [cx, sx] of [[177, -1], [223, 1]]) {
    const eyeShape = `M${cx - 16} ${171} C${cx - 10} ${157} ${cx + 10} ${156} ${cx + 16} ${168} C${cx + 10} ${181} ${cx - 10} ${182} ${cx - 16} ${171} Z`;
    const flip = sx < 0 ? `translate(${cx * 2} 0) scale(-1 1)` : '';
    const shapeId = `${P}eye${sx < 0 ? 'L' : 'R'}`;
    o += `<clipPath id="${shapeId}"><path d="${eyeShape}" transform="${flip}"/></clipPath>`;
    o += `<path d="${eyeShape}" transform="${flip}" fill="#fbfbff"/>`;
    o += `<g clip-path="url(#${shapeId})">
      <path d="${eyeShape}" transform="${flip}" fill="#c9cbe6" opacity=".35"/>
      <circle cx="${cx}" cy="170" r="11.2" fill="url(#${P}iris)"/>
      <circle cx="${cx}" cy="170" r="11.2" fill="none" stroke="${shade(eye, -0.55)}" stroke-width="1.4"/>
      <circle cx="${cx}" cy="170.5" r="5" fill="#140c10"/>
      <path d="M${cx - 16} 158 L${cx + 16} 158 L${cx + 16} 166 Q${cx} 160 ${cx - 16} 166 Z" fill="#000" opacity=".18"/>
    </g>`;
    o += `<circle cx="${cx + 4}" cy="165" r="3.4" fill="#fff"/><circle cx="${cx - 4}" cy="175" r="1.6" fill="#fff" opacity=".85"/>`;
    // верхнее веко (толще к внешнему углу) и ресницы
    o += `<path d="M${cx - 17} 172 C${cx - 11} 155 ${cx + 9} 153 ${cx + 17} 165 L${cx + 20} 163 C${cx + 12} 149 ${cx - 12} 150 ${cx - 17} 170 Z" transform="${flip}" fill="#2a1618"/>`;
    o += `<path d="M${cx + 15} 165 Q${cx + 20} 162 ${cx + 22} 158 Q${cx + 19} 164 ${cx + 16} 167 Z M${cx + 11} 159 Q${cx + 15} 155 ${cx + 16} 151 Q${cx + 15} 156 ${cx + 13} 161 Z M${cx + 5} 156 Q${cx + 8} 152 ${cx + 8} 148.5 Q${cx + 8.6} 153 ${cx + 7} 157 Z" transform="${flip}" fill="#2a1618"/>`;
    o += `<path d="M${cx - 12} 179 C${cx - 5} 183 ${cx + 6} 183 ${cx + 12} 177" transform="${flip}" fill="none" stroke="#5a3a3a" stroke-width="1" opacity=".6"/>`;
    o += `<ellipse cx="${cx + sx * 3}" cy="157" rx="17" ry="7" fill="${a.shadow || '#d98fb8'}" opacity=".28" filter="url(#${P}blur2)"/>`;
    // складка века
    o += `<path d="M${cx - 12} 157 C${cx - 4} 151 ${cx + 8} 151 ${cx + 15} 158" transform="${flip}" fill="none" stroke="${line}" stroke-width="1" opacity=".45"/>`;
    // бровь
    const bw = a.brows === 'straight'
      ? `M${cx - 15} 145 C${cx - 6} 142 ${cx + 6} 142 ${cx + 17} 144 C${cx + 6} 144 ${cx - 6} 145 ${cx - 15} 147 Z`
      : a.brows === 'arched'
        ? `M${cx - 15} 148 C${cx - 8} 136 ${cx + 8} 135 ${cx + 18} 143 C${cx + 8} 139 ${cx - 6} 140 ${cx - 15} 150 Z`
        : `M${cx - 15} 147 C${cx - 7} 140 ${cx + 7} 139 ${cx + 17} 144 C${cx + 7} 142 ${cx - 6} 143 ${cx - 15} 149 Z`;
    o += `<path d="${bw}" transform="${flip}" fill="${browCol}" opacity=".9"/>`;
  }
  // нос
  o += `<path d="M199 184 C197 192 195 198 198 201" fill="none" stroke="${line}" stroke-width="1.1" opacity=".55"/>
        <path d="M194 202 Q200 205 206 202" fill="none" stroke="${line}" stroke-width="1.2" opacity=".6"/>
        <ellipse cx="203" cy="193" rx="2.2" ry="5" fill="#fff" opacity=".25"/>`;
  // губы
  o += `<path d="M186 214 C191 209 196 208 200 211 C204 208 209 209 214 214 C208 215 204 216 200 215 C196 216 192 215 186 214 Z" fill="${shade(lip, -0.12)}"/>
        <path d="M186 214 C192 215 196 216 200 215 C204 216 208 215 214 214 C210 223 204 226 200 226 C196 226 190 223 186 214 Z" fill="url(#${P}lip)"/>
        <path d="M187 214 C193 216 207 216 213 214" fill="none" stroke="${shade(lip, -0.45)}" stroke-width="1" opacity=".7"/>
        <ellipse cx="203" cy="219.5" rx="4.5" ry="1.8" fill="#fff" opacity=".55"/>`;
  // тень подбородка на шее уже на туловище; блик на лбу
  o += `<ellipse cx="206" cy="124" rx="20" ry="9" fill="#fff" opacity=".18" filter="url(#${P}blur4)"/>`;
  const defs = `
  <radialGradient id="${P}iris" cx=".5" cy=".62" r=".6">
    <stop offset="0" stop-color="${shade(eye, 0.45)}"/><stop offset=".45" stop-color="${eye}"/>
    <stop offset="1" stop-color="${shade(eye, -0.5)}"/>
  </radialGradient>
  <linearGradient id="${P}lip" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${shade(lip, 0.1)}"/><stop offset="1" stop-color="${shade(lip, -0.18)}"/>
  </linearGradient>`;
  return { defs, svg: o };
}

export const skinTone = (k) => SKINS[k] || k;
export { mix };

// Маска для рук: верх туловища (до подмышек) скрывает начало руки — рука «выходит» из плеча.
export function armClip(P) {
  const R = TORSO_R.filter(([, y]) => y <= 334);
  const L = R.map(([x, y]) => [400 - x, y]).reverse();
  const torso = smooth([...R, [200, 334], ...L], true);
  return `<clipPath id="${P}armclip" clip-rule="evenodd"><path clip-rule="evenodd" d="M-200 -200 H600 V1000 H-200 Z ${torso}"/></clipPath>`;
}
