// «Моё поместье»: картинка только из купленного. Купил дом — стоишь на его фоне; купил остров дороже дома —
// стоишь на острове; машина, мотоцикл, яхта, самолёт, вертолёт, питомец и вещь на витрине — рядом,
// в настоящем размере относительно человека (1,8 м). Гардероб надет на человека: костюм — вся фигура целиком,
// обувь, цепь, часы, телефон, очки и шляпа — поверх по точкам основы. Из каждого раздела — самая дорогая вещь.
import { asset } from './machines.js';
import { state, save } from './state.js';
import { LUX_CATS, luxById, sexOfBase, fitsSex, luxName } from './luxury.js';
import { LAYOUTS } from './layouts.js';
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

// Перспектива. Сцены нарисованы с камеры на высоте человека (cam, м) и с горизонтом на высоте hz (доля кадра
// сверху). Тогда вещь высотой h метров, стоящая на земле в точке y (доля кадра сверху), занимает по высоте
// (y − hz)·h/cam кадра: чем дальше (ближе к горизонту), тем меньше — как на настоящей фотографии.
// Места вещей в каждой сцене — js/layouts.js (подписаны по картинкам: где гараж, причал, вертолётная площадка).
// Без купленного дома — пустой зал (STUDIO): там нет воды и площадки, яхта и вертолёт не показываются.
const STUDIO = { hz: 0.40, cam: 1.6, man: [0.5, 0.965], cars: [0.22, 0.72], moto: [0.8, 0.8], animals: [0.64, 0.975], things: [0.36, 0.975] };
const PEDESTAL_M = 0.75;
const NEED_PLACE = { water: ['yachts', 'у причала'], heli: ['heli', 'на вертолётной площадке'] };
const CAT_EMOJI = Object.fromEntries(LUX_CATS.map((c) => [c.id, c.emoji]));

// лучшее из купленного: самая дорогая вещь каждого раздела, подходящая человеку (мужское / женское)
export function showcaseOf(owned, avatar = state.avatar) {
  const sex = sexOfBase(baseOf(avatar));
  const out = [];
  for (const c of LUX_CATS) {
    const best = c.items.filter((it) => owned[it.id] !== undefined && fitsSex(it, sex)).sort((a, b) => b.price - a.price)[0];
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
  const one = (it, style, extra = '') => it && layers.push(`<span class="dl dl-${it.cat}" style="${style}" title="${esc(luxName(it, sexOfBase(d.id)))}">${extra || `<img src="${it.img}" alt="">`}</span>`);
  // обувь: каждой ступне — своя половина картинки пары
  // обувь: каждой ступне — своя половина картинки пары; по высоте закрывает носок с запасом
  if (worn.shoes) for (const [i, [x0, x1]] of d.feet.entries()) {
    // туфли на каблуке открытые — выше, чтобы закрыть носок
    const tall = { shoes_heels: 1.8, shoes_diamond: 1.8, shoes_pumps: 1.7, shoes_sandals: 1.8, shoes_cowboy: 1.9 }[worn.shoes.id] || 1.3;
    const w = (x1 - x0) * 1.22, cx = (x0 + x1) / 2, h = (d.bot - d.feetTop) * tall;
    one(worn.shoes, `left:${X(cx - w / 2)};width:${WD(w)};height:${Y(h)};bottom:${pct(1 - (d.bot + 6) / H0)}`,
      `<img src="${worn.shoes.img}" alt="" style="width:200%;height:100%;${i ? 'margin-left:-100%' : ''}">`);
  }
  if (worn.chains) one(worn.chains, `left:${X(d.cx - d.neckW / 2)};width:${WD(d.neckW)};top:${Y(d.neckY - 8)}`);
  if (worn.watches) one(worn.watches, `left:${X(d.wrist[0] - 27)};width:${WD(54)};top:${Y(d.wrist[1] - 72)}`);
  if (worn.glasses) one(worn.glasses, `left:${X(d.cx - d.faceW * 0.5)};width:${WD(d.faceW)};top:${Y(d.eyeY - d.faceW * 0.19)}`);
  if (worn.hats) {
    const k = { hat_straw: 1.5, hat_cowboy: 1.55, hat_fedora: 1.25, hat_crown: 0.85, hat_laurel: 1.05, hat_tiara: 0.8, hat_sun: 1.75,
      hat_panama: 1.3, hat_bowler: 1.12, hat_flatcap: 1.08, hat_beret: 1.1 }[worn.hats.id] || 1.1;
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
  const base = baseOf(avatar), sex = sexOfBase(base);
  const items = showcase.map(luxById).filter(Boolean).filter((it) => fitsSex(it, sex));
  const place = placeOf(items);
  const L = (place && LAYOUTS[place.id]) || STUDIO;
  const byCat = Object.fromEntries(items.filter((it) => !PLACES.includes(it.cat) && !it.wear).map((it) => [it.cat, it]));
  const objs = [];
  const height = (y, h) => Math.max(0.5, (y - L.hz) * h / L.cam * 100); // % высоты кадра
  // вещь на земле в точке [x, y]; img снизу с прозрачной кромкой 3% — чуть опускаем и увеличиваем
  // sink — какая доля высоты уходит под землю/воду (у лодок — подводная часть корпуса)
  const ground = (cat, it, [x, y], h, extraCls = '', sink = 0.035) => {
    const H = height(y, h);
    objs.push(`<div class="es-g es-${cat} ${extraCls}" style="left:${(x * 100).toFixed(2)}%;bottom:${((1 - y) * 100 - H * sink).toFixed(2)}%;height:${(H * 1.07).toFixed(2)}%;z-index:${Math.round(y * 100)}" title="${esc(luxName(it, sex))}"><img src="${it.img}" alt=""></div>`);
  };
  // самолёт — в небе
  if (byCat.planes) objs.push(`<div class="es-obj es-planes" style="left:3%;top:4%;width:24%;height:20%;z-index:1" title="${esc(byCat.planes.name)}">${pic(byCat.planes.img, '✈️')}</div>`);
  // яхта у причала, вертолёт на площадке — только если в сцене есть эти места
  // яхта: маленькая лодка — у самого причала, большая — дальше на воде (иначе закрыла бы полкартинки),
  // как в жизни: суперъяхта стоит на рейде, а не у мостков. water: { x, near — у причала, far — у горизонта }
  if (byCat.yachts && L.water) {
    const h = byCat.yachts.h || 5, w = L.water;
    // большая яхта может стоять почти у горизонта (корпус на линии воды, надстройка — на фоне неба)
    const y = Math.min(w.near, Math.max(L.hz + 0.012, L.hz + 0.2 * L.cam / h));
    const H = height(y, h) / 100, x = Math.min(w.x, 0.99 - H * 2.3 * (2 / 3) / 2);
    ground('yachts', byCat.yachts, [x, y], h, 'es-float', 0.13);
  }
  // вертолёт на площадке: по перспективе, но не шире самой площадки (heli[2] — её ширина в долях кадра)
  if (byCat.heli && L.heli) {
    const [x, y, padW] = L.heli, h = byCat.heli.h || 3.5;
    const cap = padW ? padW * 1.2 * 1.5 / 1.75 : 1;           // высота вертолёта такой ширины, доля кадра
    const k = Math.min(1, cap * 100 / height(y, h));
    ground('heli', byCat.heli, [x, y], h * k);
  }
  // машина у гаража, мотоцикл рядом с ней
  if (byCat.cars) ground('cars', byCat.cars, L.cars, byCat.cars.h || 1.45);
  if (byCat.moto) ground('moto', byCat.moto, byCat.cars ? L.moto : L.cars, byCat.moto.h || 1.1);
  // питомец рядом с человеком, драгоценность — на тумбе с другой стороны.
  // Высокое животное (лошадь, слон, единорог) выше камеры: справа от человека оно закрыло бы вертолёт целиком.
  // Тогда оно стоит чуть позади человека, как на фото «хозяин с лошадью»: человек впереди, животное за плечом.
  let [mx, my] = L.man, things = L.things;
  const ah = byCat.animals && (byCat.animals.h || 0.5);
  if (ah >= 1.25) {
    mx -= 0.04; things = [things[0] - 0.04, things[1]];
    ground('animals', byCat.animals, [mx + 0.11, my - 0.2 * (my - L.hz)], ah);
  } else if (byCat.animals) ground('animals', byCat.animals, L.animals, ah);
  if (byCat.things) {
    const [x, y] = things, ph = height(y, PEDESTAL_M);
    objs.push(`<div class="es-pedestal" style="left:${(x * 100).toFixed(2)}%;bottom:${((1 - y) * 100).toFixed(2)}%;height:${ph.toFixed(2)}%;z-index:${Math.round(y * 100)}"></div>`);
    const H = height(y, byCat.things.h || 0.3);
    objs.push(`<div class="es-g es-things" style="left:${(x * 100).toFixed(2)}%;bottom:${((1 - y) * 100 + ph).toFixed(2)}%;height:${(H * 1.07).toFixed(2)}%;z-index:${Math.round(y * 100) + 1}" title="${esc(luxName(byCat.things, sex))}"><img src="${byCat.things.img}" alt=""></div>`);
  }
  const worn = Object.fromEntries(items.filter((it) => it.wear).map((it) => [it.cat, it]));
  let man = '';
  if (base) {
    const d = dollById(base);
    const manH = height(my, 1.8);
    const fh = (d.bot - d.top) / H0;                 // доля фигуры в рамке куклы
    const boxH = manH / fh;                           // высота рамки в % кадра
    const bottom = (1 - my) * 100 - (1 - d.bot / H0) * boxH;
    man = `<div class="es-man" style="left:${(mx * 100).toFixed(2)}%;height:${boxH.toFixed(2)}%;bottom:${bottom.toFixed(2)}%;z-index:${Math.round(my * 100) + 2}">${dollHtml(base, worn)}</div>`;
  } else man = `<div class="es-man es-noman" style="z-index:99"><span class="es-noav">${mine ? 'Выберите аватар' : ''}</span></div>`;
  const waiting = Object.entries(NEED_PLACE).filter(([spot, [c]]) => byCat[c] && !L[spot]).map(([, [c, where]]) => `${byCat[c].name.toLowerCase()} встанет ${where}`);
  const hint = !mine ? '' : !place
    ? (items.length ? `Купите дом или остров — и вы будете стоять на его фоне${waiting.length ? '; ' + waiting.join(', ') : ''}` : 'Пока здесь только вы. Купите дом, машину, костюм, часы… — и всё появится на картинке')
    : '';
  const bg = place ? `style="--img:url(${place.scene})"` : '';
  return `
    <div class="estate ${place ? '' : 'studio'} ${mine ? 'mine' : ''}" ${bg}>
      ${objs.join('')}
      ${man}
      <div class="es-plate">
        <b>${esc(name || 'Моё поместье')}</b>
        <span>${subtitle}</span>
      </div>
      ${hint ? `<div class="es-hint">${hint}</div>` : ''}
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
  const sex = sexOfBase(baseOf(avatar));
  return (showcase || []).map(luxById).filter(Boolean).filter((it) => fitsSex(it, sex))
    .map((it) => `<span>${pic(it.cat === 'outfits' ? dollImg(baseOf(avatar) || 'b1', it.id) : it.thumb || it.img, CAT_EMOJI[it.cat], 'el-ico')}${esc(luxName(it, sex))}</span>`).join('');
}

export function estateModal(p) {
  const { el } = modal(`<button class="x">✕</button>${estateHtml(p)}
    <div class="es-list">${showcaseList(p.showcase, p.avatar) || '<em>Пока ничего не куплено</em>'}</div>`,
    { cls: 'estate-modal', closeOnBg: true });
  wireAll(el);
}
