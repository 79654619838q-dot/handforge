// Каталог вещей из картинок ChatGPT. Вещь попадает в игру, как только её слой собран (doll-manifest.js).
import { DOLL } from './doll-manifest.js';

// Оттенки ткани: CSS-фильтр поверх исходного цвета вещи.
const HUES = {
  warm: [['', 'Как на картинке'], ['hue-rotate(-40deg) saturate(1.1)', 'Сиреневое'], ['hue-rotate(-150deg) saturate(1.05)', 'Голубое'], ['hue-rotate(-210deg) saturate(.95)', 'Мятное'], ['hue-rotate(35deg) saturate(1.25)', 'Персиковое'], ['hue-rotate(60deg) saturate(1.4) brightness(1.03)', 'Золотое']],
  cool: [['', 'Как на картинке'], ['hue-rotate(150deg) saturate(1.1)', 'Розовое'], ['hue-rotate(100deg)', 'Сиреневое'], ['hue-rotate(-60deg)', 'Изумрудное'], ['hue-rotate(200deg) saturate(1.3)', 'Золотое']],
  white: [['', 'Белое'], ['sepia(.35) hue-rotate(300deg) saturate(2.2)', 'Нежно-розовое'], ['sepia(.3) hue-rotate(160deg) saturate(1.8)', 'Голубое'], ['sepia(.45) saturate(1.4)', 'Шампань'], ['sepia(.35) hue-rotate(220deg) saturate(1.8)', 'Сиреневое']],
  red: [['', 'Как на картинке'], ['hue-rotate(-80deg)', 'Фиолетовое'], ['hue-rotate(200deg)', 'Синее'], ['hue-rotate(130deg)', 'Изумрудное'], ['hue-rotate(40deg) saturate(1.2)', 'Золотое']],
  green: [['', 'Как на картинке'], ['hue-rotate(160deg)', 'Розовое'], ['hue-rotate(80deg)', 'Голубое'], ['hue-rotate(120deg)', 'Сиреневое'], ['hue-rotate(-70deg) saturate(1.2)', 'Солнечное']],
  yellow: [['', 'Как на картинке'], ['hue-rotate(-50deg)', 'Коралловое'], ['hue-rotate(120deg)', 'Бирюзовое'], ['hue-rotate(200deg)', 'Сиреневое'], ['hue-rotate(-90deg) saturate(1.1)', 'Розовое']],
};

// Описание вещей: имя, раздел, теги мест, оттенки.
export const META = {
  ball_pink: ['Бальное платье', 'Бальные', ['ball', 'royal', 'party', 'palace', 'evening', 'birthday'], 'warm'],
  dress_wedding: ['Свадебное платье', 'Свадебные', ['wedding', 'royal', 'ball'], 'white'],
  dress_princess: ['Платье принцессы', 'Бальные', ['ball', 'royal', 'palace', 'birthday', 'castle'], 'cool'],
  dress_summer: ['Летний сарафан', 'Летние', ['summer', 'garden', 'beach', 'cafe', 'vacation', 'travel'], 'yellow'],
  dress_fairy: ['Платье феи', 'Сказочные', ['fairy', 'forest', 'magic', 'garden', 'flower'], 'green'],
  dress_royal: ['Королевское платье', 'Королевские', ['royal', 'ball', 'palace', 'coronation'], 'red'],
  dress_mermaid: ['Платье русалки', 'Сказочные', ['mermaid', 'underwater', 'beach', 'evening'], 'green'],
  dress_winter: ['Зимнее платье', 'Зимние', ['winter', 'newyear', 'palace'], 'cool'],
  dress_evening: ['Вечернее платье', 'Вечерние', ['evening', 'night', 'party', 'masquerade', 'ball'], 'cool'],
  dress_casual: ['Футболка и юбка', 'Повседневные', ['casual', 'shop', 'cafe', 'school', 'travel'], 'warm'],
  dress_party: ['Праздничное платье', 'Праздничные', ['birthday', 'party', 'cafe', 'night'], 'cool'],
  dress_queen: ['Платье королевы', 'Королевские', ['royal', 'coronation', 'palace'], 'cool'],
  dress_flower: ['Цветочное платье', 'Летние', ['flower', 'garden', 'spring', 'summer', 'wedding'], 'warm'],
  dress_swim: ['Купальник с юбочкой', 'Летние', ['beach', 'summer', 'vacation', 'underwater'], 'warm'],
  dress_masq: ['Маскарадное платье', 'Вечерние', ['masquerade', 'evening', 'night', 'ball'], 'yellow'],
  dress_newyear: ['Новогоднее платье', 'Зимние', ['newyear', 'winter', 'party'], 'red'],
  dress_school: ['Школьная форма', 'Повседневные', ['school', 'casual'], 'cool'],
  dress_riding: ['Костюм для верховой езды', 'Спортивные', ['ride', 'sport', 'travel'], 'red'],
  dress_sport: ['Спортивный костюм', 'Спортивные', ['sport', 'casual', 'travel', 'ride'], 'warm'],
  outer_mantle: ['Королевская мантия', 'Мантии и плащи', ['royal', 'coronation', 'palace'], 'red'],
  outer_fur: ['Меховая пелерина', 'Накидки', ['winter', 'newyear', 'royal'], 'white'],
  outer_cape: ['Плащ с капюшоном', 'Мантии и плащи', ['forest', 'magic', 'castle', 'travel', 'night'], 'cool'],
  outer_coat: ['Пальто', 'Пальто', ['winter', 'shop', 'travel', 'cafe'], 'warm'],
  shoes_glass: ['Хрустальные туфельки', 'Туфли', ['ball', 'royal', 'wedding', 'magic'], null],
  shoes_flats: ['Балетки', 'Балетки', ['casual', 'school', 'cafe', 'garden', 'birthday'], 'warm'],
  shoes_sneakers: ['Кроссовки', 'Спортивная', ['sport', 'casual', 'school', 'travel', 'shop'], null],
  shoes_boots: ['Зимние сапожки', 'Сапоги', ['winter', 'newyear', 'ride', 'travel'], null],
  shoes_sandals: ['Босоножки', 'Босоножки', ['summer', 'beach', 'vacation', 'garden'], null],
  shoes_royal: ['Королевские туфли', 'Туфли', ['royal', 'coronation', 'ball', 'palace', 'evening'], 'red'],
  head_tiara: ['Тиара', 'Короны', ['royal', 'ball', 'wedding', 'birthday', 'party'], null],
  head_crown: ['Маленькая корона', 'Короны', ['royal', 'ball', 'palace', 'birthday'], null],
  head_crown_big: ['Большая корона', 'Короны', ['royal', 'coronation', 'palace'], null],
  head_ice: ['Корона снежной принцессы', 'Короны', ['winter', 'newyear', 'magic'], null],
  head_wreath: ['Цветочный венок', 'Цветы и банты', ['flower', 'garden', 'fairy', 'forest', 'summer'], null],
  head_bow: ['Атласный бант', 'Цветы и банты', ['casual', 'birthday', 'school', 'cafe'], 'warm'],
  head_sunhat: ['Шляпа от солнца', 'Шляпки', ['beach', 'summer', 'vacation', 'garden', 'travel'], null],
  head_winterhat: ['Шапочка с помпоном', 'Шляпки', ['winter', 'newyear', 'travel'], 'white'],
  head_veil: ['Свадебная фата', 'Фата', ['wedding'], null],
  head_starclips: ['Заколки-звёздочки', 'Заколки', ['night', 'party', 'magic', 'school'], null],
  earrings_pearl: ['Жемчужные серьги', 'Серьги', ['wedding', 'royal', 'evening', 'ball'], null],
  earrings_crystal: ['Серьги с кристаллами', 'Серьги', ['winter', 'magic', 'evening', 'party'], null],
  necklace_pearl: ['Жемчужное ожерелье', 'Ожерелья', ['wedding', 'royal', 'evening', 'mermaid'], null],
  necklace_heart: ['Кулон-сердечко', 'Ожерелья', ['birthday', 'party', 'casual', 'cafe'], null],
  necklace_ruby: ['Рубиновое ожерелье', 'Ожерелья', ['royal', 'ball', 'coronation', 'evening'], null],
  bracelet_gold: ['Золотые браслеты', 'Браслеты', ['royal', 'ball', 'party', 'evening'], null],
  held_wand: ['Волшебная палочка', 'Волшебство', ['fairy', 'magic', 'forest', 'castle'], null],
  held_bouquet: ['Букет роз', 'Цветы', ['wedding', 'garden', 'flower', 'birthday'], null],
  held_scepter: ['Королевский скипетр', 'Королевское', ['royal', 'coronation', 'palace'], null],
  held_parasol: ['Кружевной зонтик', 'Зонтики и веера', ['beach', 'garden', 'summer', 'travel'], 'warm'],
  held_fan: ['Кружевной веер', 'Зонтики и веера', ['ball', 'masquerade', 'evening', 'royal'], null],
  held_rose: ['Роза', 'Цветы', ['garden', 'ball', 'wedding', 'flower'], null],
  held_gift: ['Подарок', 'Праздник', ['birthday', 'newyear', 'party'], 'warm'],
  held_balloon: ['Воздушный шарик', 'Праздник', ['birthday', 'party', 'cafe'], 'warm'],
  bag_small: ['Сумочка на цепочке', 'Сумочки', ['party', 'cafe', 'shop', 'evening'], 'warm'],
  bag_heart: ['Сумочка-сердечко', 'Сумочки', ['birthday', 'party', 'cafe', 'shop'], 'red'],
  bag_basket: ['Корзинка с цветами', 'Корзинки', ['garden', 'flower', 'forest', 'summer'], null],
  wings_fairy: ['Крылья феи', 'Крылья', ['fairy', 'forest', 'magic', 'flower'], null],
  wings_butterfly: ['Крылья бабочки', 'Крылья', ['garden', 'fairy', 'flower', 'summer'], 'warm'],
  wings_angel: ['Крылья ангела', 'Крылья', ['wedding', 'magic', 'royal'], null],
  wings_ice: ['Ледяные крылья', 'Крылья', ['winter', 'newyear', 'magic'], 'cool'],
  face_sunglasses: ['Очки-сердечки', 'Очки', ['beach', 'summer', 'vacation', 'party'], null],
  face_mask: ['Маскарадная маска', 'Маски', ['masquerade', 'evening', 'night', 'castle'], null],
  face_glasses: ['Круглые очки', 'Очки', ['school', 'cafe', 'casual'], null],
  gloves_opera: ['Длинные перчатки', 'Перчатки', ['ball', 'evening', 'royal', 'wedding', 'masquerade'], 'white'],
  scarf_knit: ['Вязаный шарф', 'Шарфы', ['winter', 'newyear', 'travel', 'shop'], 'warm'],
};

export const SLOT_NAMES = {
  dress: ['Платья', '👗'], hair: ['Причёски', '💇'], shoes: ['Обувь', '👠'], head: ['Короны и шляпки', '👑'],
  jewelry: ['Украшения', '💎'], outer: ['Накидки', '🧥'], held: ['В руках', '🪄'], bag: ['Сумочки', '👜'],
  wings: ['Крылья', '🦋'], acc: ['Очки и маски', '🕶️'], earrings: ['Серьги', '✨'], necklace: ['Ожерелья', '📿'],
  bracelet: ['Браслеты', '💫'], face: ['Очки и маски', '🕶️'], gloves: ['Перчатки', '🧤'], scarf: ['Шарфы', '🧣'],
};

// Цвет волос — фильтр на слой причёски.
export const HAIR_TINTS = [
  ['', 'Свой цвет', 'linear-gradient(#caa56a,#7a5230)'],
  ['sepia(1) saturate(4) hue-rotate(-18deg) brightness(.95)', 'Рыжий', 'linear-gradient(#f08a4b,#b8481f)'],
  ['sepia(.75) saturate(1.8) brightness(1.3)', 'Блонд', 'linear-gradient(#fbe3a0,#d6aa55)'],
  ['sepia(1) saturate(3.2) hue-rotate(290deg) brightness(1.15)', 'Розовый', 'linear-gradient(#ffc0dc,#e0679e)'],
  ['sepia(1) saturate(3.5) hue-rotate(175deg) brightness(1.05)', 'Голубой', 'linear-gradient(#bfe2ff,#4d8fe0)'],
  ['sepia(1) saturate(3) hue-rotate(225deg)', 'Фиолетовый', 'linear-gradient(#d8b8ff,#7b4bc8)'],
  ['brightness(1.35) contrast(.9)', 'Серебряный', 'linear-gradient(#ffffff,#b9c0cc)'],
  ['sepia(1) saturate(3.4) brightness(1.2)', 'Золотой', 'linear-gradient(#ffe78f,#d19a1c)'],
  ['sepia(.35) brightness(.45) contrast(1.1)', 'Тёмный', 'linear-gradient(#5a4038,#241a18)'],
];
// Перед оттенком волосы переводятся в серый одной яркости — тогда цвет одинаковый на любых волосах.
export function hairFilter(tint, lum) {
  if (!tint) return '';
  const k = Math.min(3.2, Math.max(0.8, 0.52 / (lum || 0.5)));
  return `grayscale(1) brightness(${k.toFixed(2)}) ${tint}`;
}

export const ITEMS = {};
export const BY_SLOT = {};
const PRINCESS_NAMES = { lilia: 'Лилии', sofia: 'Софии', mia: 'Мии', kira: 'Киры', emma: 'Эммы', amelia: 'Амелии', adel: 'Адель', eliza: 'Элизы', victoria: 'Виктории', alisa: 'Алисы' };

for (const [iid, m] of Object.entries(DOLL.items)) {
  if (m.slot === 'hair') {
    const it = { id: iid, base: iid, slot: 'hair', cat: 'Причёски принцесс', name: `Причёска ${PRINCESS_NAMES[m.princess] || ''}`, tags: ['casual', 'party', 'ball', 'summer'], filter: '', m };
    ITEMS[iid] = it;
    (BY_SLOT.hair ||= []).push(it);
    continue;
  }
  const meta = META[iid];
  if (!meta) continue;
  const [name, cat, tags, hues] = meta;
  const vars = hues ? HUES[hues] : [['', '']];
  vars.forEach(([filter, vname], k) => {
    const id = k ? `${iid}~${k}` : iid;
    const it = { id, base: iid, slot: m.slot, cat, name: vname && k ? `${name} · ${vname}` : name, tags, filter, m, variant: k };
    ITEMS[id] = it;
    (BY_SLOT[m.slot] ||= []).push(it);
  });
}
export const TOTAL = Object.keys(ITEMS).length;
export const itemsWithTag = (slot, tags) => (BY_SLOT[slot] || []).filter((it) => it.tags.some((t) => tags.includes(t)));
export const PRINCESS_IDS = Object.keys(DOLL.princesses);
