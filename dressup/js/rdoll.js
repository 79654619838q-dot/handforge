// Кукла из слоёв-картинок ChatGPT. Холст 1024×1536; каждый слой лежит на своём месте (x, y, w, h).
import { DOLL } from './doll-manifest.js';
import { ITEMS } from './catalog.js';

const DIR = 'assets/doll/';

// Порядок слоёв снизу вверх.
export function layerList(st) {
  const P = DOLL.princesses[st.pid] || Object.values(DOLL.princesses)[0];
  const o = st.outfit || {};
  const it = (slot) => o[slot] && ITEMS[o[slot]];
  const hair = it('hair') || ITEMS[P.hair];
  const hairF = st.hairTint || '';
  const L = [];
  const add = (lay, filter = '', cls = '', mask = '') => { if (lay) L.push({ ...lay, filter, cls, mask }); };
  const addItem = (x, part) => { if (x) add(part ? x.m[part] : x.m.layer, x.filter, 'i-' + x.slot); };

  if (it('wings')) add(it('wings').m.layer, it('wings').filter, 'wings');
  if (hair) add(hair.m.back, hairF);
  if (it('outer')?.m.back) addItem(it('outer'), 'back');
  if (it('head')?.m.back) addItem(it('head'), 'back');
  // облегающее платье уже фигуры принцессы — тело вне платья прячем маской
  add(P.body, '', 'body', it('dress')?.m.bodymask || '');
  addItem(it('shoes'));
  addItem(it('dress'));
  if (it('outer')) addItem(it('outer'), it('outer').m.front ? 'front' : null);
  const sleeves = it('dress')?.m.sleeves || it('outer')?.m.sleeves;
  if (!sleeves) add(P.arms);
  addItem(it('gloves'));
  addItem(it('bracelet'));
  if (hair) add(hair.m.front, hairF);
  addItem(it('scarf'));
  addItem(it('necklace'));
  addItem(it('earrings'));
  if (it('head')) addItem(it('head'), it('head').m.front ? 'front' : null);
  addItem(it('face'));
  addItem(it('bag'));
  addItem(it('held'));
  return L;
}

const pct = (v, t) => ((v / t) * 100).toFixed(3) + '%';
export function dollHTML(st, cls = '') {
  const W = DOLL.w, H = DOLL.h;
  const imgs = layerList(st).map((l) => `<img class="${l.cls}" src="${DIR}${l.f}.webp" alt="" draggable="false" style="left:${pct(l.x, W)};top:${pct(l.y, H)};width:${pct(l.w, W)};${l.filter ? `filter:${l.filter};` : ''}${l.mask ? `-webkit-mask-image:url(${DIR}${l.mask}.png);mask-image:url(${DIR}${l.mask}.png);-webkit-mask-size:100% 100%;mask-size:100% 100%;` : ''}">`).join('');
  return `<div class="rdoll ${cls}">${imgs}${st.fx ? fxHTML(st.fx) : ''}</div>`;
}

// Волшебные эффекты — частицы поверх куклы.
const FX = {
  hearts: ['💖', '💗', '💕'], stars: ['⭐', '✨', '🌟'], snow: ['❄️', '❅', '❆'], flowers: ['🌸', '🌼', '🌺'],
  sparkle: ['✨', '✦', '✧'], gold: ['✨', '💛', '✦'], butterflies: ['🦋', '🦋', '✨'], rainbow: ['🌈', '✨', '💫'],
};
export const FX_NAMES = { hearts: 'Сердечки', stars: 'Звёзды', snow: 'Снежинки', flowers: 'Цветы', sparkle: 'Блёстки', gold: 'Золотая пыль', butterflies: 'Бабочки', rainbow: 'Радуга' };
function fxHTML(kind) {
  const s = FX[kind];
  if (!s) return '';
  let o = '';
  for (let i = 0; i < 16; i++) {
    const x = (i * 37) % 100, y = (i * 53) % 90 + 3, d = ((i * 7) % 10) / 10;
    o += `<i style="left:${x}%;top:${y}%;animation-delay:${(-d * 6).toFixed(1)}s;font-size:${14 + (i % 4) * 6}px">${s[i % 3]}</i>`;
  }
  return `<div class="fx">${o}</div>`;
}

export const layerSrcs = (st) => layerList(st).flatMap((l) => [DIR + l.f + '.webp', ...(l.mask ? [DIR + l.mask + '.png'] : [])]);

// Картинки заранее — чтобы переодевание было мгновенным.
const cache = new Map();
export function preload(st) {
  for (const l of layerList(st)) {
    const src = DIR + l.f + '.webp';
    if (!cache.has(src)) { const i = new Image(); i.src = src; cache.set(src, i); }
  }
}

// Снимок на холсте (фотозона).
export async function drawDoll(g, st, X, Y, Wd, Hd) {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const sx = Wd / DOLL.w, sy = Hd / DOLL.h;
  for (const l of layerList(st)) {
    let img = await load(DIR + l.f + '.webp');
    if (l.mask) {
      // маска тела: рисуем тело на отдельном холсте и оставляем только разрешённое
      const m = await load(DIR + l.mask + '.png');
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cg = c.getContext('2d');
      cg.drawImage(img, 0, 0);
      cg.globalCompositeOperation = 'destination-in';
      cg.drawImage(m, 0, 0, c.width, c.height);
      img = c;
    }
    g.save();
    if (l.filter && 'filter' in g) g.filter = l.filter;
    g.drawImage(img, X + l.x * sx, Y + l.y * sy, l.w * sx, l.h * sy);
    g.restore();
  }
}
export const thumbSrc = (it) => DIR + it.m.thumb + '.webp';
export const faceSrc = (pid) => DIR + (DOLL.princesses[pid]?.face || '') + '.webp';
export const hasPrincess = (pid) => !!DOLL.princesses[pid];
