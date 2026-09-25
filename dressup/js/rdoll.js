// Кукла из слоёв-картинок ChatGPT. Слои сводятся в ОДИН холст в самой игре, на экран идёт готовая картинка:
// так вид одинаковый в любом браузере (Safari на iPhone сам раскладывал слои с ошибками).
// Координаты слоёв — на холсте 1024×1536 (x, y, w, h), файлы слоёв могут быть уменьшены.
import { DOLL } from './doll-manifest.js';
import { ITEMS, hairFilter } from './catalog.js';

const DIR = 'assets/doll/';
const S = 0.7;                                   // холст куклы в 0,7 от 1024×1536 — как и файлы слоёв
const CW = Math.round(DOLL.w * S), CH = Math.round(DOLL.h * S);

// Порядок слоёв снизу вверх.
export function layerList(st) {
  const P = DOLL.princesses[st.pid] || Object.values(DOLL.princesses)[0];
  const o = st.outfit || {};
  const it = (slot) => o[slot] && ITEMS[o[slot]];
  const hair = it('hair') || ITEMS[P.hair];
  const hairF = hairFilter(st.hairTint || '', hair?.m.lum);
  const L = [];
  const add = (lay, filter = '', mask = '') => { if (lay) L.push({ ...lay, filter, mask }); };
  const addItem = (x, part) => { if (x) add(part ? x.m[part] : x.m.layer, x.filter); };

  if (it('wings')) add(it('wings').m.layer, it('wings').filter);
  if (hair) add(hair.m.back, hairF);
  if (it('outer')?.m.back) addItem(it('outer'), 'back');
  if (it('head')?.m.back) addItem(it('head'), 'back');
  // облегающее платье уже фигуры принцессы — тело вне платья прячем маской
  add(P.body, '', it('dress')?.m.bodymask || '');
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
export const layerSrcs = (st) => layerList(st).flatMap((l) => [DIR + l.f + '.webp', ...(l.mask ? [DIR + l.mask + '.png'] : [])]);

// ---------- загрузка с повтором (бесплатный хостинг иногда не отдаёт картинку с первого раза) ----------
const loaded = new Map();
function loadOnce(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((res) => {
      let n = 0;
      const tryLoad = () => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => { if (++n < 4) setTimeout(tryLoad, 700 * n); else { loaded.delete(src); res(null); } };
        i.src = n ? `${src}?r=${n}` : src;
      };
      tryLoad();
    }));
  }
  return loaded.get(src);
}
export function prefetch(st) { for (const u of layerSrcs(st)) loadOnce(u); }
export const preload = prefetch;

// ---------- перекраска без ctx.filter (его нет в Safari): CSS-фильтры как матрицы цвета ----------
function filterSteps(f) {
  const steps = [];
  for (const [, name, arg] of f.matchAll(/([a-z-]+)\(([^)]*)\)/g)) {
    const v = parseFloat(arg);
    const a = Math.min(1, Math.max(0, v));
    let m;
    switch (name) {
      case 'grayscale': { const b = 1 - a; m = [0.2126 + 0.7874 * b, 0.7152 - 0.7152 * b, 0.0722 - 0.0722 * b, 0.2126 - 0.2126 * b, 0.7152 + 0.2848 * b, 0.0722 - 0.0722 * b, 0.2126 - 0.2126 * b, 0.7152 - 0.7152 * b, 0.0722 + 0.9278 * b]; break; }
      case 'sepia': { const b = 1 - a; m = [0.393 + 0.607 * b, 0.769 - 0.769 * b, 0.189 - 0.189 * b, 0.349 - 0.349 * b, 0.686 + 0.314 * b, 0.168 - 0.168 * b, 0.272 - 0.272 * b, 0.534 - 0.534 * b, 0.131 + 0.869 * b]; break; }
      case 'saturate': m = [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v]; break;
      case 'hue-rotate': {
        const t = (v * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
        m = [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
          0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
          0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
        break;
      }
      case 'brightness': m = [v, 0, 0, 0, v, 0, 0, 0, v]; break;
      case 'contrast': m = [v, 0, 0, 0, v, 0, 0, 0, v, (0.5 - 0.5 * v) * 255]; break;
      default: continue;
    }
    steps.push(m);
  }
  return steps;
}
const tinted = new Map();
function tintedLayer(img, filter) {
  const key = img.src + '|' + filter;
  if (tinted.has(key)) return tinted.get(key);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  const steps = filterSteps(filter);
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    let r = p[i], gg = p[i + 1], b = p[i + 2];
    for (const m of steps) {                      // после каждого шага — в пределы 0…255, как в браузере
      const o = m[9] || 0;
      const nr = m[0] * r + m[1] * gg + m[2] * b + o, ng = m[3] * r + m[4] * gg + m[5] * b + o, nb = m[6] * r + m[7] * gg + m[8] * b + o;
      r = nr < 0 ? 0 : nr > 255 ? 255 : nr; gg = ng < 0 ? 0 : ng > 255 ? 255 : ng; b = nb < 0 ? 0 : nb > 255 ? 255 : nb;
    }
    p[i] = r; p[i + 1] = gg; p[i + 2] = b;
  }
  g.putImageData(d, 0, 0);
  if (tinted.size > 60) tinted.delete(tinted.keys().next().value);
  tinted.set(key, c);
  return c;
}

// ---------- сведение слоёв в холст ----------
async function compose(st) {
  const L = layerList(st);
  const imgs = await Promise.all(L.map((l) => loadOnce(DIR + l.f + '.webp')));
  const masks = await Promise.all(L.map((l) => (l.mask ? loadOnce(DIR + l.mask + '.png') : null)));
  if (imgs.some((i) => !i) || L.some((l, k) => l.mask && !masks[k])) return null;
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH;
  const g = c.getContext('2d');
  L.forEach((l, k) => {
    let src = l.filter ? tintedLayer(imgs[k], l.filter) : imgs[k];
    if (l.mask) {
      const t = document.createElement('canvas');
      t.width = src.width || src.naturalWidth; t.height = src.height || src.naturalHeight;
      const tg = t.getContext('2d');
      tg.drawImage(src, 0, 0);
      tg.globalCompositeOperation = 'destination-in';
      tg.drawImage(masks[k], 0, 0, t.width, t.height);
      src = t;
    }
    g.drawImage(src, l.x * S, l.y * S, l.w * S, l.h * S);
  });
  return c;
}

// Разметка куклы: пустой холст-заготовка; рисует его applyMasks (после вставки на страницу) или showDoll.
export function dollHTML(st, cls = '') {
  return `<div class="rdoll ${cls}"><canvas class="doll-cv" width="${CW}" height="${CH}" data-st='${JSON.stringify({ pid: st.pid, outfit: st.outfit, hairTint: st.hairTint || '' }).replace(/'/g, '&#39;')}'></canvas>${st.fx ? fxHTML(st.fx) : ''}</div>`;
}
async function paint(cv) {
  const st = JSON.parse(cv.dataset.st);
  let c = await compose(st);
  for (let n = 0; !c && n < 3; n++) { await new Promise((r) => setTimeout(r, 2000)); c = await compose(st); }
  if (!c) return;
  cv.getContext('2d').drawImage(c, 0, 0);
  delete cv.dataset.st;
}
// Нарисовать все ещё пустые куклы внутри root (имя осталось от прошлой версии — вызывается из app.js).
export async function applyMasks(root) {
  await Promise.all([...root.querySelectorAll('canvas.doll-cv[data-st]')].map(paint));
}

// Показ куклы в гардеробе: прежний образ остаётся, пока новый не сведён целиком; быстрые нажатия — показываем последнее.
export async function showDoll(el, st, onShown) {
  const token = (el._tok = (el._tok || 0) + 1);
  const spin = setTimeout(() => { if (el._tok === token) el.classList.add('loading'); }, 200);
  let c = await compose(st);
  while (!c && el._tok === token) { await new Promise((r) => setTimeout(r, 2500)); c = await compose(st); }
  clearTimeout(spin);
  if (el._tok !== token) return;
  el.classList.remove('loading');
  const box = document.createElement('div');
  box.innerHTML = dollHTML(st);
  const cv = box.querySelector('canvas');
  cv.getContext('2d').drawImage(c, 0, 0);
  delete cv.dataset.st;
  el.replaceChildren(...box.childNodes);
  if (onShown) onShown();
}

// Снимок на холсте (фотозона).
export async function drawDoll(g, st, X, Y, Wd, Hd) {
  const c = await compose(st);
  if (c) g.drawImage(c, X, Y, Wd, Hd);
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

export const thumbSrc = (it) => DIR + it.m.thumb + '.webp';
export const faceSrc = (pid) => DIR + (DOLL.princesses[pid]?.face || '') + '.webp';
export const hasPrincess = (pid) => !!DOLL.princesses[pid];
