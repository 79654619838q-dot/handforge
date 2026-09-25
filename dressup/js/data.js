// Места, принцессы, наборы, задания, подарки.
import { ITEMS } from './catalog.js';

// tags — что подходит этому месту; slots — порядок рекомендуемых категорий.
export const PLACES = [
  { id: 'ball', name: 'Королевский бал', emoji: '👑', who: 'Кого отправим на бал?', tags: ['ball', 'royal', 'evening', 'party'], slots: ['dress', 'hair', 'shoes', 'head', 'jewelry', 'bag', 'held'] },
  { id: 'palace', name: 'Дворец', emoji: '🏰', who: 'Кто сегодня гуляет по дворцу?', tags: ['palace', 'royal', 'ball', 'evening'], slots: ['dress', 'hair', 'head', 'jewelry', 'shoes', 'held'] },
  { id: 'garden', name: 'Цветочный сад', emoji: '🌸', who: 'Кто пойдёт в цветочный сад?', tags: ['garden', 'flower', 'spring', 'summer'], slots: ['dress', 'head', 'hair', 'shoes', 'held', 'jewelry'] },
  { id: 'beach', name: 'Пляж', emoji: '🏖️', who: 'Кто отправится на пляж?', tags: ['beach', 'summer', 'vacation'], slots: ['dress', 'head', 'face', 'shoes', 'bag', 'jewelry'] },
  { id: 'winter', name: 'Зимний праздник', emoji: '❄️', who: 'Кого нарядим на зимний праздник?', tags: ['winter', 'newyear'], slots: ['dress', 'outer', 'shoes', 'head', 'gloves', 'scarf', 'jewelry'] },
  { id: 'birthday', name: 'День рождения', emoji: '🎂', who: 'Кто идёт на день рождения?', tags: ['birthday', 'party'], slots: ['dress', 'hair', 'head', 'shoes', 'held', 'jewelry'] },
  { id: 'wedding', name: 'Свадьба', emoji: '💒', who: 'Кто сегодня невеста?', tags: ['wedding'], slots: ['dress', 'head', 'hair', 'jewelry', 'shoes', 'held', 'gloves'] },
  { id: 'masquerade', name: 'Бал-маскарад', emoji: '🎭', who: 'Кто скрывается под маской?', tags: ['masquerade', 'evening', 'night'], slots: ['dress', 'face', 'hair', 'shoes', 'held', 'jewelry', 'gloves'] },
  { id: 'forest', name: 'Волшебный лес', emoji: '🧚', who: 'Кто отправится в волшебный лес?', tags: ['forest', 'fairy', 'magic'], slots: ['dress', 'wings', 'head', 'held', 'shoes', 'jewelry', 'fx'] },
  { id: 'underwater', name: 'Подводное королевство', emoji: '🧜', who: 'Кто поплывёт в подводное королевство?', tags: ['underwater', 'mermaid'], slots: ['dress', 'hair', 'head', 'jewelry', 'held'] },
  { id: 'ride', name: 'Конная прогулка', emoji: '🐎', who: 'Кто поедет на прогулку верхом?', tags: ['ride', 'sport'], slots: ['dress', 'shoes', 'hair', 'outer', 'jewelry'] },
  { id: 'shop', name: 'Поход по магазинам', emoji: '🛍️', who: 'Кто пойдёт за покупками?', tags: ['shop', 'casual'], slots: ['dress', 'outer', 'bag', 'shoes', 'face', 'head'] },
  { id: 'cafe', name: 'Кафе', emoji: '🍰', who: 'Кто пойдёт в кафе?', tags: ['cafe', 'casual'], slots: ['dress', 'hair', 'head', 'shoes', 'bag', 'held'] },
  { id: 'school', name: 'Королевская школа', emoji: '🎓', who: 'Кто идёт в королевскую школу?', tags: ['school', 'casual'], slots: ['dress', 'hair', 'shoes', 'bag', 'held', 'head'] },
  { id: 'night', name: 'Ночная вечеринка', emoji: '🌙', who: 'Кто идёт на ночную вечеринку?', tags: ['night', 'party'], slots: ['dress', 'hair', 'jewelry', 'shoes', 'fx', 'head'] },
  { id: 'newyear', name: 'Новогодний праздник', emoji: '🎄', who: 'Кто встречает Новый год?', tags: ['newyear', 'winter', 'party'], slots: ['dress', 'outer', 'head', 'shoes', 'held', 'fx'] },
  { id: 'castle', name: 'Праздник в замке', emoji: '🎃', who: 'Кто идёт на праздник в замке?', tags: ['castle', 'magic'], slots: ['dress', 'outer', 'head', 'held', 'face', 'fx'] },
  { id: 'voyage', name: 'Путешествие', emoji: '🚢', who: 'Кто отправится в плавание?', tags: ['travel', 'summer'], slots: ['dress', 'outer', 'head', 'shoes', 'bag', 'face'] },
  { id: 'vacation', name: 'Отпуск', emoji: '✈️', who: 'Кто летит в отпуск?', tags: ['vacation', 'travel', 'summer', 'beach'], slots: ['dress', 'head', 'face', 'bag', 'shoes', 'held'] },
  { id: 'coronation', name: 'Коронация', emoji: '👸', who: 'Кого сегодня коронуют?', tags: ['coronation', 'royal'], slots: ['dress', 'outer', 'head', 'held', 'jewelry', 'shoes'] },
];
export const PLACE = Object.fromEntries(PLACES.map((p) => [p.id, p]));

// Фоны фотозоны: все места + несколько особых.
export const BACKDROPS = [
  ...PLACES.map((p) => ({ id: p.id, name: p.name })),
  { id: 'throne', name: 'Тронный зал' },
  { id: 'clouds', name: 'Облака' },
  { id: 'icepalace', name: 'Зимний дворец' },
  { id: 'space', name: 'Космический замок' },
];

// Принцессы — лица, кожа и причёски нарисованы ChatGPT (assets/doll/body_<id>, hair_<id>).
export const PRINCESSES = [
  { id: 'lilia', name: 'Лилия', style: 'Цветочные наряды', fav: 'flower', outfit: { dress: 'dress_flower' } },
  { id: 'sofia', name: 'София', style: 'Королевские платья', fav: 'royal', outfit: { dress: 'dress_royal', head: 'head_tiara' } },
  { id: 'mia', name: 'Мия', style: 'Современные наряды', fav: 'casual', outfit: { dress: 'dress_casual', shoes: 'shoes_sneakers' } },
  { id: 'kira', name: 'Кира', style: 'Праздники и спорт', fav: 'party', outfit: { dress: 'dress_party' } },
  { id: 'emma', name: 'Эмма', style: 'Сказочные наряды', fav: 'fairy', outfit: { dress: 'dress_fairy' } },
  { id: 'amelia', name: 'Амелия', style: 'Морские образы', fav: 'mermaid', outfit: { dress: 'dress_mermaid', necklace: 'necklace_pearl' } },
  { id: 'adel', name: 'Адель', style: 'Зимние образы', fav: 'winter', outfit: { dress: 'dress_winter' } },
  { id: 'eliza', name: 'Элиза', style: 'Наряды фей', fav: 'fairy', outfit: { dress: 'dress_fairy', wings: 'wings_fairy' } },
  { id: 'victoria', name: 'Виктория', style: 'Вечерние платья', fav: 'evening', outfit: { dress: 'dress_evening' } },
  { id: 'alisa', name: 'Алиса', style: 'Летние платья', fav: 'summer', outfit: { dress: 'dress_summer', shoes: 'shoes_sandals' } },
];
export const PRINCESS = Object.fromEntries(PRINCESSES.map((p) => [p.id, p]));

// Тематические наборы (13 пункт ТЗ). Вещи, которых ещё нет, пропускаются.
export const SETS = [
  { id: 'royalball', name: 'Королевский бал', emoji: '👑', outfit: { dress: 'ball_pink', head: 'head_crown', necklace: 'necklace_ruby', earrings: 'earrings_pearl', shoes: 'shoes_glass', held: 'held_fan' } },
  { id: 'fairy', name: 'Фея', emoji: '🧚', outfit: { dress: 'dress_fairy', wings: 'wings_fairy', head: 'head_wreath', held: 'held_wand' }, fx: 'butterflies' },
  { id: 'mermaid', name: 'Русалка', emoji: '🧜', outfit: { dress: 'dress_mermaid', necklace: 'necklace_pearl', earrings: 'earrings_pearl' }, fx: 'sparkle' },
  { id: 'ice', name: 'Ледяная принцесса', emoji: '❄️', outfit: { dress: 'dress_winter', head: 'head_ice', earrings: 'earrings_crystal', wings: 'wings_ice', shoes: 'shoes_boots' }, fx: 'snow' },
  { id: 'spring', name: 'Весенняя принцесса', emoji: '🌸', outfit: { dress: 'dress_flower', head: 'head_wreath', held: 'held_bouquet', shoes: 'shoes_sandals' }, fx: 'flowers' },
  { id: 'magicfest', name: 'Волшебный праздник', emoji: '🎃', outfit: { dress: 'dress_masq', outer: 'outer_cape', head: 'head_starclips', held: 'held_wand' }, fx: 'stars' },
  { id: 'winterball', name: 'Зимний бал', emoji: '🎄', outfit: { dress: 'dress_newyear', outer: 'outer_fur', head: 'head_crown', gloves: 'gloves_opera', shoes: 'shoes_boots' }, fx: 'snow' },
  { id: 'night', name: 'Ночная принцесса', emoji: '🌙', outfit: { dress: 'dress_evening', head: 'head_starclips', earrings: 'earrings_crystal' }, fx: 'stars' },
  { id: 'queen', name: 'Королева', emoji: '👸', outfit: { dress: 'dress_queen', outer: 'outer_mantle', head: 'head_crown_big', held: 'held_scepter', necklace: 'necklace_ruby' }, fx: 'gold' },
  { id: 'bride', name: 'Невеста', emoji: '💒', outfit: { dress: 'dress_wedding', head: 'head_veil', held: 'held_bouquet', gloves: 'gloves_opera', earrings: 'earrings_pearl' }, fx: 'hearts' },
];

// Проверки для заданий: слот + категории/теги.
const need = (label, slot, opt = {}) => ({ label, slot, ...opt });
export const TASKS = [
  { id: 'ball', name: 'Создай принцессу для королевского бала', place: 'ball',
    need: [need('Бальное платье', 'dress', { tags: ['ball'] }), need('Корона или тиара', 'head', { bases: ['head_crown', 'head_crown_big', 'head_tiara', 'head_ice'] }), need('Серьги', 'earrings'), need('Туфли', 'shoes', { bases: ['shoes_glass', 'shoes_royal', 'shoes_flats'] })] },
  { id: 'fairy', name: 'Создай принцессу-фею', place: 'forest',
    need: [need('Платье феи', 'dress', { tags: ['fairy'] }), need('Крылья', 'wings'), need('Волшебная палочка', 'held', { bases: ['held_wand'] })] },
  { id: 'winter', name: 'Создай зимнюю принцессу', place: 'winter',
    need: [need('Зимнее платье', 'dress', { tags: ['winter'] }), need('Тёплая накидка или пальто', 'outer', { bases: ['outer_fur', 'outer_coat', 'outer_cape'] }), need('Сапожки', 'shoes', { bases: ['shoes_boots'] })] },
  { id: 'flower', name: 'Создай принцессу цветов', place: 'garden',
    need: [need('Цветочное платье', 'dress', { tags: ['flower'] }), need('Цветочный венок', 'head', { bases: ['head_wreath'] }), need('Цветы в руках', 'held', { bases: ['held_bouquet', 'held_rose'] })] },
  { id: 'mermaid', name: 'Создай принцессу русалок', place: 'underwater',
    need: [need('Платье русалки', 'dress', { tags: ['mermaid'] }), need('Жемчуг', 'necklace', { bases: ['necklace_pearl'] })] },
  { id: 'queen', name: 'Создай королеву', place: 'coronation',
    need: [need('Королевское платье', 'dress', { bases: ['dress_queen', 'dress_royal'] }), need('Большая корона', 'head', { bases: ['head_crown_big'] }), need('Королевская мантия', 'outer', { bases: ['outer_mantle'] }), need('Скипетр', 'held', { bases: ['held_scepter'] })] },
  { id: 'wedding', name: 'Создай принцессу для свадьбы', place: 'wedding',
    need: [need('Свадебное платье', 'dress', { tags: ['wedding'] }), need('Фата', 'head', { bases: ['head_veil'] }), need('Букет', 'held', { bases: ['held_bouquet'] })] },
  { id: 'masq', name: 'Создай принцессу для маскарада', place: 'masquerade',
    need: [need('Маскарадное или вечернее платье', 'dress', { tags: ['masquerade'] }), need('Маска', 'face', { bases: ['face_mask'] }), need('Веер', 'held', { bases: ['held_fan'] })] },
  { id: 'looks3', name: 'Создай 3 образа', count: 3 },
  { id: 'looks10', name: 'Создай 10 образов', count: 10 },
  { id: 'places5', name: 'Побывай в 5 разных местах', places: 5 },
  { id: 'places12', name: 'Побывай в 12 разных местах', places: 12 },
];

export function checkNeed(n, outfit) {
  const id = outfit[n.slot];
  const it = id && ITEMS[id];
  if (!it) return false;
  if (n.bases && !n.bases.includes(it.base)) return false;
  if (n.tags && !it.tags.some((t) => n.tags.includes(t))) return false;
  return true;
}

// Группы для оценки образа.
export const JUDGE = [
  { key: 'dress', name: 'Одежда', icon: '👗', slots: ['dress', 'outer'] },
  { key: 'shoes', name: 'Обувь', icon: '👠', slots: ['shoes'] },
  { key: 'hair', name: 'Причёска', icon: '💇', slots: ['hair', 'head'] },
  { key: 'acc', name: 'Аксессуары', icon: '💎', slots: ['earrings', 'necklace', 'bracelet', 'ring', 'held', 'bag', 'face', 'scarf', 'gloves', 'wings', 'fx'] },
];
