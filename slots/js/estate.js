// «Моё поместье»: картинка только из купленного. Купил дом — стоишь на его фоне; купил остров дороже дома —
// стоишь на острове; машина, мотоцикл, яхта, самолёт, вертолёт, питомец и драгоценность добавляются поверх.
// Ничего не куплено — только аватар в пустом тёмном зале. Из каждого раздела встаёт самая дорогая вещь.
import { asset } from './machines.js';
import { state, save } from './state.js';
import { LUX_CATS, luxById } from './luxury.js';
import { modal, pic, esc, wireAll } from './ui.js';
import { sfx } from './audio.js';

export const AVATARS = [
  { id: 'av1', name: 'Бизнесмен' }, { id: 'av2', name: 'Деловая леди' }, { id: 'av3', name: 'Парень с цепью' },
  { id: 'av4', name: 'Дива' }, { id: 'av5', name: 'Ковбой' }, { id: 'av6', name: 'Джентльмен' },
  { id: 'av7', name: 'Спортсменка' }, { id: 'av8', name: 'Рок-звезда' }, { id: 'av9', name: 'Капитан' },
].map((a) => ({ ...a, img: asset(`avatars/${a.id}.webp`) }));
export const avatarById = (id) => AVATARS.find((a) => a.id === id);

const PLACES = ['houses', 'islands']; // эти разделы — фон картинки

// Где стоит вещь каждого раздела (в процентах от сцены 3:2). Сцены домов и островов нарисованы так,
// что нижняя треть — пустая площадка, справа посередине вода, вверху чистое небо.
const SLOTS = {
  planes:  { left: 3, top: 4, w: 25, h: 21, z: 1 },
  heli:    { right: 4, top: 3, w: 17, h: 18, z: 1 },
  yachts:  { right: 2, bottom: 34, w: 27, h: 19, z: 2 },
  cars:    { left: 2, bottom: 3, w: 31, h: 26, z: 4 },
  moto:    { left: 29, bottom: 4, w: 16, h: 19, z: 5 },
  animals: { right: 20, bottom: 3, w: 14, h: 22, z: 6 },
};
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

// фон — самое дорогое из купленных домов и островов
function placeOf(items) {
  return items.filter((it) => PLACES.includes(it.cat)).sort((a, b) => b.price - a.price)[0] || null;
}

// сцена: avatar — id аватара, showcase — список id вещей, name/subtitle — подпись
export function estateHtml({ avatar, showcase = [], name = '', subtitle = '', mine = false }) {
  const items = showcase.map(luxById).filter(Boolean);
  const place = placeOf(items);
  const byCat = Object.fromEntries(items.filter((it) => !PLACES.includes(it.cat)).map((it) => [it.cat, it]));
  const pos = (s) => Object.entries(s).filter(([k]) => ['left', 'right', 'top', 'bottom'].includes(k)).map(([k, v]) => `${k}:${v}%`).join(';');
  const objs = Object.entries(SLOTS).filter(([cat]) => byCat[cat]).map(([cat, s]) =>
    `<div class="es-obj es-${cat}" style="${pos(s)};width:${s.w}%;height:${s.h}%;z-index:${s.z}" title="${esc(byCat[cat].name)}">${pic(byCat[cat].img, CAT_EMOJI[cat])}</div>`).join('');
  const thing = byCat.things;
  const av = avatarById(avatar);
  const bg = place ? `style="--img:url(${place.scene})"` : '';
  return `
    <div class="estate ${place ? '' : 'studio'} ${mine ? 'mine' : ''}" ${bg}>
      ${objs}
      <div class="es-avatar" style="z-index:5">${av ? pic(av.img, '🧑') : `<span class="es-noav">${mine ? 'Выберите аватар' : ''}</span>`}</div>
      ${thing ? `<div class="es-thing" title="${esc(thing.name)}">${pic(thing.img, '💎')}</div>` : ''}
      <div class="es-plate">
        <b>${esc(name || 'Моё поместье')}</b>
        <span>${subtitle}</span>
      </div>
      ${mine && !place ? `<div class="es-hint">${items.length ? 'Купите дом или остров — и вы будете стоять на его фоне' : 'Пока здесь только вы. Купите дом, машину, яхту… — и всё появится на картинке'}</div>` : ''}
    </div>`;
}

export function chooseAvatar(after) {
  sfx.click();
  const { el, close } = modal(`
    <button class="x">✕</button>
    <h2>Выберите аватар</h2>
    <p class="sub">Он будет стоять на картинке вашего поместья и виден другим игрокам в рейтинге.</p>
    <div class="av-grid">${AVATARS.map((a) => `<button class="av-pick ${state.avatar === a.id ? 'on' : ''}" data-id="${a.id}">${pic(a.img, '🧑')}<b>${esc(a.name)}</b></button>`).join('')}</div>`,
    { cls: 'avatar-modal', closeOnBg: true });
  el.querySelectorAll('.av-pick').forEach((b) => b.addEventListener('click', () => {
    state.avatar = b.dataset.id; save();
    sfx.medal();
    close();
    after?.();
  }));
}

// список того, что стоит на картинке
export function showcaseList(showcase) {
  return (showcase || []).map(luxById).filter(Boolean)
    .map((it) => `<span>${pic(it.thumb || it.img, CAT_EMOJI[it.cat], 'el-ico')}${esc(it.name)}</span>`).join('');
}

// чужое (или своё) поместье во весь экран
export function estateModal(p) {
  const { el } = modal(`<button class="x">✕</button>${estateHtml(p)}
    <div class="es-list">${showcaseList(p.showcase) || '<em>Пока ничего не куплено</em>'}</div>`,
    { cls: 'estate-modal', closeOnBg: true });
  wireAll(el);
}
