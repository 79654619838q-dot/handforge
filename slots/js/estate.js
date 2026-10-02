// «Моё поместье»: картинка только из купленного. Купил дом — стоишь на его фоне; купил остров дороже дома —
// стоишь на острове; машина, мотоцикл, яхта, самолёт, вертолёт, питомец и вещь на витрине — рядом,
// в настоящем размере относительно человека (1,8 м). Гардероб надет на человека: костюм — вся фигура целиком,
// обувь, цепь, часы, телефон, очки и шляпа — поверх по точкам основы. Из каждого раздела — самая дорогая вещь.
import { asset } from './machines.js';
import { state, save } from './state.js';
import { LUX_CATS, luxById } from './luxury.js';
import { modal, pic, esc, wireAll } from './ui.js';
import { sfx } from './audio.js';

// Основы-«куклы». Картинки assets/doll/<id>.webp и <id>_<костюм>.webp (одинаковая рамка 2:3, выровнены по основе).
// Точки — в пикселях исходника 1024×1536: top/bot — макушка и подошвы, eye — глаза (y, ширина лица),
// hat — где низ шляпы и её ширина, neck — верх цепочки и её ширина, wrist — запястье для часов (справа на картинке),
// hand — кисть с телефоном (слева на картинке), feet — ступни [x0, x1] слева и справа и низ ступней.
export const DOLLS = [
  { id: 'b1', name: 'Парень-шатен', top: 18, bot: 1495, cx: 502, eyeY: 147, faceW: 160, hatY: 105, hatW: 200, neckY: 288, neckW: 130,
    wrist: [735, 790], hand: [258, 855], feet: [[285, 402], [593, 712]], feetTop: 1372 },
  { id: 'b2', name: 'Парень с бородой', top: 15, bot: 1505, cx: 505, eyeY: 141, faceW: 150, hatY: 93, hatW: 200, neckY: 285, neckW: 130,
    wrist: [745, 795], hand: [258, 878], feet: [[278, 413], [581, 717]], feetTop: 1380 },
  { id: 'b3', name: 'Блондинка', top: 18, bot: 1508, cx: 503, eyeY: 156, faceW: 145, hatY: 108, hatW: 215, neckY: 305, neckW: 125,
    wrist: [745, 773], hand: [267, 840], feet: [[342, 447], [570, 678]], feetTop: 1377 },
  { id: 'b4', name: 'Брюнетка', top: 18, bot: 1508, cx: 505, eyeY: 155, faceW: 132, hatY: 105, hatW: 195, neckY: 293, neckW: 120,
    wrist: [740, 745], hand: [267, 818], feet: [[327, 432], [585, 687]], feetTop: 1395 },
];
export const dollById = (id) => DOLLS.find((d) => d.id === id);
const W0 = 1024, H0 = 1536;
// костюмы гардероба → картинка куклы
export const OUTFIT_KEY = { outfit_sport: 'o1', outfit_casual: 'o2', outfit_business: 'o3', outfit_white: 'o4', outfit_evening: 'o5', outfit_gold: 'o6' };
export const dollImg = (base, outfitId) => {
  const o = outfitId && OUTFIT_KEY[outfitId];
  return asset(`doll/${base}${o ? '_' + o : ''}.webp`);
};
// прежние 9 персонажей → ближайшая основа
const OLD_AVATAR = { av1: 'b1', av3: 'b1', av5: 'b1', av6: 'b1', av8: 'b1', av9: 'b2', av2: 'b4', av4: 'b3', av7: 'b4' };
export const baseOf = (id) => (dollById(id) ? id : OLD_AVATAR[id] || null);
// для окна выбора и рейтинга
export const AVATARS = DOLLS.map((d) => ({ id: d.id, name: d.name, img: asset(`doll/${d.id}.webp`) }));
export const avatarById = (id) => { const b = baseOf(id); return b ? AVATARS.find((a) => a.id === b) : null; };

const PLACES = ['houses', 'islands']; // эти разделы — фон картинки

// Сцена 3:2. Человек — 60% высоты кадра = 1,8 м. Остальное стоит на своей «глубине»: k — во сколько раз
// дальше/ближе человека (меньше — дальше), bottom — где низ вещи, x — где её левый (left) или правый (right) край.
const MAN_H = 60, MAN_BOTTOM = 3;
const PER_M = MAN_H / 1.8; // % высоты кадра на метр рядом с человеком
const DEPTH = {
  cars:    { k: 0.82, bottom: 9, left: 1, z: 4 },
  moto:    { k: 0.72, bottom: 13, right: 3, z: 3 },
  animals: { k: 1.0, bottom: 2.5, left: 62, z: 7 },
  things:  { k: 1.0, bottom: 2.5, left: 31, z: 6 },   // на витрине-тумбе высотой 0,9 м
};
// далёкое — размер просто по месту в кадре
const FAR = {
  planes:  { left: 3, top: 4, w: 25, h: 21, z: 1 },
  heli:    { right: 4, top: 3, w: 17, h: 18, z: 1 },
  yachts:  { right: 2, bottom: 34, w: 27, h: 19, z: 2 },
};
const PEDESTAL_M = 0.9;
const CAT_EMOJI = Object.fromEntries(LUX_CATS.map((c) => [c.id, c.emoji]));

// лучшее из купленного: самая дорогая вещь каждого раздела
export function showcaseOf(owned) {
  const out = [];
  for (const c of LUX_CATS) {
    const best = c.items.filter((it) => owned[it.id] !== undefined).sort((a, b) => b.price - a.price)[0];
    if (best) out.push(best.id);
  }
  return out;
}

function placeOf(items) {
  return items.filter((it) => PLACES.includes(it.cat)).sort((a, b) => b.price - a.price)[0] || null;
}

const pct = (v) => +(v * 100).toFixed(2) + '%';

// человек с надетым гардеробом; worn — { outfits, shoes, watches, chains, phones, glasses, hats } → вещь
export function dollHtml(baseId, worn = {}, cls = '') {
  const d = dollById(baseId);
  if (!d) return '';
  const X = (x) => pct(x / W0), Y = (y) => pct(y / H0), WD = (w) => pct(w / W0);
  const layers = [];
  const one = (it, style, extra = '') => it && layers.push(`<span class="dl dl-${it.cat}" style="${style}" title="${esc(it.name)}">${extra || `<img src="${it.img}" alt="">`}</span>`);
  // обувь: каждой ступне — своя половина картинки пары
  // обувь: каждой ступне — своя половина картинки пары; по высоте закрывает носок с запасом
  if (worn.shoes) for (const [i, [x0, x1]] of d.feet.entries()) {
    // туфли на каблуке открытые — выше, чтобы закрыть носок
    const tall = { shoes_heels: 1.8, shoes_diamond: 1.8 }[worn.shoes.id] || 1.3;
    const w = (x1 - x0) * 1.22, cx = (x0 + x1) / 2, h = (d.bot - d.feetTop) * tall;
    one(worn.shoes, `left:${X(cx - w / 2)};width:${WD(w)};height:${Y(h)};bottom:${pct(1 - (d.bot + 6) / H0)}`,
      `<img src="${worn.shoes.img}" alt="" style="width:200%;height:100%;${i ? 'margin-left:-100%' : ''}">`);
  }
  if (worn.chains) one(worn.chains, `left:${X(d.cx - d.neckW / 2)};width:${WD(d.neckW)};top:${Y(d.neckY - 8)}`);
  if (worn.watches) one(worn.watches, `left:${X(d.wrist[0] - 27)};width:${WD(54)};top:${Y(d.wrist[1] - 72)}`);
  if (worn.glasses) one(worn.glasses, `left:${X(d.cx - d.faceW * 0.5)};width:${WD(d.faceW)};top:${Y(d.eyeY - d.faceW * 0.19)}`);
  if (worn.hats) {
    const k = { hat_straw: 1.5, hat_cowboy: 1.55, hat_fedora: 1.25, hat_crown: 0.85, hat_laurel: 1.05 }[worn.hats.id] || 1.1;
    const w = d.hatW * k;
    one(worn.hats, `left:${X(d.cx - w / 2)};width:${WD(w)};bottom:${pct(1 - (d.hatY + 12) / H0)}`);
  }
  if (worn.phones) one(worn.phones, `left:${X(d.hand[0] - 34)};width:${WD(68)};top:${Y(d.hand[1] - 60)}`);
  // костюм — своя картинка фигуры; если для этой основы его ещё нет — основа
  const body = dollImg(d.id, worn.outfits?.id), plain = asset(`doll/${d.id}.webp`);
  return `<span class="doll ${cls}"><img class="dl-body" src="${body}" alt="" onerror="this.onerror=null;this.src='${plain}'">${layers.join('')}</span>`;
}

// сцена: avatar — id основы, showcase — список id вещей, name/subtitle — подпись
export function estateHtml({ avatar, showcase = [], name = '', subtitle = '', mine = false }) {
  const items = showcase.map(luxById).filter(Boolean);
  const place = placeOf(items);
  const byCat = Object.fromEntries(items.filter((it) => !PLACES.includes(it.cat)).map((it) => [it.cat, it]));
  const side = (s) => ['left', 'right', 'top', 'bottom'].filter((k) => s[k] !== undefined).map((k) => `${k}:${s[k]}%`).join(';');
  const objs = [];
  for (const [cat, s] of Object.entries(FAR)) if (byCat[cat])
    objs.push(`<div class="es-obj es-${cat}" style="${side(s)};width:${s.w}%;height:${s.h}%;z-index:${s.z}" title="${esc(byCat[cat].name)}">${pic(byCat[cat].img, CAT_EMOJI[cat])}</div>`);
  // крупное животное справа закрыло бы мотоцикл — тогда мотоцикл встаёт слева, перед машиной
  const depth = { ...DEPTH };
  if (byCat.moto && byCat.animals && (byCat.animals.h || 0) >= 1) depth.moto = { k: 0.78, bottom: 6, left: 24, z: 5 };
  for (const [cat, s] of Object.entries(depth)) {
    const it = byCat[cat];
    if (!it) continue;
    const per = PER_M * s.k;
    if (cat === 'things') {
      const ph = PEDESTAL_M * per;
      objs.push(`<div class="es-pedestal" style="${side({ ...s, bottom: s.bottom })};height:${ph.toFixed(2)}%;z-index:${s.z}"></div>`);
      objs.push(`<div class="es-real es-things" style="left:${s.left}%;bottom:${(s.bottom + ph).toFixed(2)}%;height:${((it.h || 0.3) * per * 1.06).toFixed(2)}%;z-index:${s.z}" title="${esc(it.name)}"><img src="${it.img}" alt=""></div>`);
      continue;
    }
    objs.push(`<div class="es-real es-${cat}" style="${side(s)};height:${((it.h || 1) * per * 1.06).toFixed(2)}%;z-index:${s.z}" title="${esc(it.name)}"><img src="${it.img}" alt=""></div>`);
  }
  const base = baseOf(avatar);
  const worn = Object.fromEntries(items.filter((it) => it.wear).map((it) => [it.cat, it]));
  let man = '';
  if (base) {
    const d = dollById(base);
    const fh = (d.bot - d.top) / H0;                 // доля фигуры в рамке куклы
    const boxH = MAN_H / fh;                          // высота рамки в % кадра
    const bottom = MAN_BOTTOM - (1 - d.bot / H0) * boxH;
    man = `<div class="es-man" style="height:${boxH.toFixed(2)}%;bottom:${bottom.toFixed(2)}%;z-index:5">${dollHtml(base, worn)}</div>`;
  } else man = `<div class="es-man es-noman" style="z-index:5"><span class="es-noav">${mine ? 'Выберите аватар' : ''}</span></div>`;
  const bg = place ? `style="--img:url(${place.scene})"` : '';
  return `
    <div class="estate ${place ? '' : 'studio'} ${mine ? 'mine' : ''}" ${bg}>
      ${objs.join('')}
      ${man}
      <div class="es-plate">
        <b>${esc(name || 'Моё поместье')}</b>
        <span>${subtitle}</span>
      </div>
      ${mine && !place ? `<div class="es-hint">${items.length ? 'Купите дом или остров — и вы будете стоять на его фоне' : 'Пока здесь только вы. Купите дом, машину, костюм, часы… — и всё появится на картинке'}</div>` : ''}
    </div>`;
}

export function chooseAvatar(after) {
  sfx.click();
  const { el, close } = modal(`
    <button class="x">✕</button>
    <h2>Выберите себя</h2>
    <p class="sub">Купленные костюмы, обувь, часы, цепочки, телефоны, очки и шляпы будут надеты на этого человека.</p>
    <div class="av-grid">${AVATARS.map((a) => `<button class="av-pick ${baseOf(state.avatar) === a.id ? 'on' : ''}" data-id="${a.id}">${pic(a.img, '🧑')}<b>${esc(a.name)}</b></button>`).join('')}</div>`,
    { cls: 'avatar-modal', closeOnBg: true });
  el.querySelectorAll('.av-pick').forEach((b) => b.addEventListener('click', () => {
    state.avatar = b.dataset.id; save();
    sfx.medal();
    close();
    after?.();
  }));
}

export function showcaseList(showcase, avatar) {
  return (showcase || []).map(luxById).filter(Boolean)
    .map((it) => `<span>${pic(it.cat === 'outfits' ? dollImg(baseOf(avatar) || 'b1', it.id) : it.thumb || it.img, CAT_EMOJI[it.cat], 'el-ico')}${esc(it.name)}</span>`).join('');
}

export function estateModal(p) {
  const { el } = modal(`<button class="x">✕</button>${estateHtml(p)}
    <div class="es-list">${showcaseList(p.showcase, p.avatar) || '<em>Пока ничего не куплено</em>'}</div>`,
    { cls: 'estate-modal', closeOnBg: true });
  wireAll(el);
}
