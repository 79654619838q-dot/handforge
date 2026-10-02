// Магазин роскоши: имущество (машины, мотоциклы, дома, яхты, вертолёты, самолёты, острова, животные, вещи)
// и гардероб (костюмы, обувь, часы, цепочки, телефоны, очки, шляпы — надеваются на аватар в поместье).
// Покупки только для красоты и рейтинга «Самый богатый»; продать можно за полную цену.
// Картинки — assets/lux/<id>.webp (листы 3×3 из ChatGPT, см. tools/build_assets.py).
// h — настоящая высота вещи в метрах: по ней вещь встаёт в поместье в правильном размере рядом с человеком (1,8 м).
import { asset } from './machines.js';

// sex: 'm' — только мужчинам, 'f' — только женщинам, без него — всем
const I = (id, name, price, h, sex) => ({ id, name, price, h, sex, img: asset(`lux/${id}.webp`) });
const M = (id, name, price, h) => I(id, name, price, h, 'm');
const F = (id, name, price, h) => I(id, name, price, h, 'f');
// дома и острова — ещё и сцена во весь фон поместья (scenes/<id>.jpg) и её уменьшенная копия для магазина
const SCENE_CATS = ['houses', 'islands'];

export const LUX_CATS = [
  { id: 'cars', name: 'Машины', emoji: '🚗', items: [
    I('car_rusty', 'Старый хэтчбек', 15000, 1.45), I('car_city', 'Городская малолитражка', 40000, 1.5), I('car_sedan', 'Семейный седан', 90000, 1.45),
    I('car_suv', 'Большой внедорожник', 250000, 1.9), I('car_muscle', 'Американский маслкар', 400000, 1.35), I('car_limo', 'Представительский седан', 900000, 1.5),
    I('car_coupe', 'Спортивное купе', 2000000, 1.3), I('car_super', 'Суперкар', 6000000, 1.15), I('car_hyper', 'Золотой гиперкар', 20000000, 1.15),
  ] },
  { id: 'moto', name: 'Мотоциклы', emoji: '🏍️', items: [
    I('moto_bike', 'Детский велосипед', 2000, 0.8), I('moto_moped', 'Старый мопед', 8000, 1.05), I('moto_scooter', 'Городской скутер', 20000, 1.15),
    I('moto_dirt', 'Кроссовый мотоцикл', 60000, 1.25), I('moto_cruiser', 'Хромированный круизер', 150000, 1.1), I('moto_touring', 'Туристический мотоцикл', 300000, 1.45),
    I('moto_sport', 'Спортбайк', 700000, 1.15), I('moto_chopper', 'Золотой чоппер', 2500000, 1.1), I('moto_future', 'Супербайк будущего', 8000000, 1.1),
  ] },
  { id: 'houses', name: 'Дома', emoji: '🏠', items: [
    I('house_cabin', 'Деревянная избушка', 50000), I('house_cottage', 'Кирпичный домик', 150000), I('house_family', 'Дом с садом', 400000),
    I('house_glass', 'Стеклянная вилла', 1500000), I('house_sea', 'Вилла у моря с бассейном', 4000000), I('house_penthouse', 'Пентхаус в небоскрёбе', 10000000),
    I('house_mansion', 'Особняк с фонтаном', 25000000), I('house_palace', 'Белый дворец', 80000000), I('house_castle', 'Сказочный замок', 200000000),
  ] },
  { id: 'yachts', name: 'Яхты', emoji: '🛥️', items: [
    I('boat_rubber', 'Надувная лодка', 10000, 0.9), I('boat_speed', 'Быстрый катер', 120000, 2.2), I('boat_sail', 'Парусная яхта', 800000, 15),
    I('boat_yacht', 'Моторная яхта', 5000000, 7), I('boat_super', 'Суперъяхта с вертолётной площадкой', 60000000, 16),
  ] },
  { id: 'heli', name: 'Вертолёты', emoji: '🚁', items: [
    I('heli_light', 'Лёгкий вертолёт', 1500000, 2.9), I('heli_black', 'Частный вертолёт', 8000000, 3.6),
    I('heli_vip', 'VIP-вертолёт', 15000000, 4.2), I('heli_gold', 'Золотой двухвинтовой вертолёт', 40000000, 5.7),
  ] },
  { id: 'planes', name: 'Самолёты', emoji: '✈️', items: [
    I('plane_prop', 'Винтовой самолёт', 1000000), I('plane_sea', 'Гидросамолёт', 3000000), I('plane_jet', 'Бизнес-джет', 30000000),
    I('plane_liner', 'Частный лайнер', 120000000), I('plane_super', 'Сверхзвуковой самолёт', 300000000),
    I('plane_space', 'Золотой космоплан', 1000000000),
  ] },
  { id: 'islands', name: 'Острова', emoji: '🏝️', items: [
    I('island_palm', 'Островок с пальмой', 20000000), I('island_lagoon', 'Остров с лагуной и виллой', 150000000),
    I('island_paradise', 'Райский остров с курортом', 2000000000),
  ] },
  { id: 'animals', name: 'Животные', emoji: '🐾', items: [
    I('pet_chihuahua', 'Чихуахуа в свитере', 10000, 0.3), I('pet_parrot', 'Попугай ара', 15000, 0.55), I('pet_cat', 'Персидский кот', 20000, 0.38),
    I('pet_puppy', 'Щенок ретривера', 30000, 0.5), I('pet_horse', 'Скаковая лошадь', 800000, 1.75), I('pet_tiger', 'Белый тигр', 3000000, 1.05),
    I('pet_elephant', 'Слонёнок', 5000000, 1.4), I('pet_unicorn', 'Единорог', 100000000, 1.8), I('pet_dragon', 'Золотой дракончик', 500000000, 1.3),
  ] },
  { id: 'things', name: 'Вещи', emoji: '💎', items: [
    // стоят на витрине рядом с человеком; размер — витринный (кольцо и бриллиант крупнее настоящих, чтобы было видно)
    F('thing_bag', 'Дизайнерская сумка', 50000, 0.32), F('thing_handbag', 'Стёганая сумочка с цепочкой', 250000, 0.3),
    M('thing_pen', 'Золотая перьевая ручка', 40000, 0.22), M('thing_briefcase', 'Кожаный портфель', 120000, 0.42),
    I('thing_ring', 'Кольцо с бриллиантом', 500000, 0.18),
    I('thing_painting', 'Картина в золотой раме', 3000000, 0.7), I('thing_diamond', 'Голубой бриллиант', 50000000, 0.25),
  ] },
  // ===== гардероб: надевается на аватар =====
  { id: 'outfits', name: 'Костюмы', emoji: '🤵', wear: true, items: [
    // костюм рисуется на выбранном человеке; у мужчин и женщин свои названия (nameF)
    { ...I('outfit_sport', 'Спортивный костюм', 5000) }, { ...I('outfit_casual', 'Джинсы и кожаная куртка', 30000) },
    { ...I('outfit_business', 'Деловой костюм', 150000), nameF: 'Деловой брючный костюм' }, { ...I('outfit_white', 'Белый костюм', 500000) },
    { ...I('outfit_evening', 'Смокинг', 2000000), nameF: 'Красное вечернее платье' }, { ...I('outfit_gold', 'Золотой костюм', 20000000), nameF: 'Золотое платье' },
  ] },
  { id: 'shoes', name: 'Обувь', emoji: '👟', wear: true, items: [
    I('shoes_canvas', 'Кеды', 2000), I('shoes_run', 'Беговые кроссовки', 10000), I('shoes_boots', 'Кожаные ботинки', 25000),
    I('shoes_designer', 'Дизайнерские кроссовки', 400000),
    M('shoes_chelsea', 'Замшевые челси', 40000), M('shoes_cowboy', 'Ковбойские сапоги', 50000), M('shoes_loafers', 'Лоферы', 60000),
    M('shoes_oxford', 'Лакированные туфли', 150000), M('shoes_moccasins', 'Белые мокасины', 200000), M('shoes_velvet', 'Бархатные лоферы с золотом', 1200000),
    M('shoes_gold', 'Золотые туфли', 1500000), M('shoes_croc', 'Туфли из крокодиловой кожи', 2500000),
    F('shoes_pink', 'Розовые кроссовки', 12000), F('shoes_flats', 'Розовые балетки', 15000), F('shoes_pumps', 'Белые лодочки', 120000),
    F('shoes_heels', 'Красные туфли на каблуке', 600000), F('shoes_sandals', 'Золотые босоножки', 900000), F('shoes_diamond', 'Туфли с бриллиантами', 8000000),
  ] },
  { id: 'watches', name: 'Часы', emoji: '⌚', wear: true, items: [
    I('watch_digital', 'Электронные часы', 3000), I('watch_sport', 'Спортивные часы', 20000), I('watch_steel', 'Стальные часы', 100000),
    I('watch_gold', 'Золотые часы', 800000), I('watch_diamond', 'Часы с бриллиантами', 5000000),
    M('watch_chrono', 'Хронограф', 300000), F('watch_lady', 'Золотые часики-браслет', 400000), F('watch_rose', 'Часы из розового золота', 1500000),
  ] },
  { id: 'chains', name: 'Цепочки', emoji: '📿', wear: true, items: [
    I('chain_silver', 'Серебряная цепочка', 10000),
    M('chain_gold', 'Толстая золотая цепь', 150000), M('chain_platinum', 'Платиновая цепь', 1000000), M('chain_lion', 'Цепь с золотым львом', 2500000),
    F('chain_heart', 'Цепочка с сердечком', 50000), F('chain_pearl', 'Жемчужное ожерелье', 300000),
    F('chain_ruby', 'Колье с рубином', 600000), F('chain_diamond', 'Бриллиантовое колье', 4000000),
  ] },
  { id: 'phones', name: 'Телефоны', emoji: '📱', wear: true, items: [
    I('phone_button', 'Кнопочный телефон', 1000), I('phone_smart', 'Смартфон', 15000), I('phone_fold', 'Складной смартфон', 60000),
    I('phone_gold', 'Золотой смартфон с бриллиантами', 300000), I('phone_platinum', 'Платиновый смартфон', 2000000),
  ] },
  { id: 'glasses', name: 'Очки', emoji: '🕶️', wear: true, items: [
    I('glasses_black', 'Солнечные очки', 5000), I('glasses_aviator', 'Авиаторы', 40000), I('glasses_gold', 'Очки в золотой оправе', 400000),
    M('glasses_sport', 'Спортивные очки', 15000), F('glasses_heart', 'Очки-сердечки', 20000), F('glasses_diamond', 'Очки с бриллиантами', 3000000),
  ] },
  { id: 'hats', name: 'Шляпы', emoji: '🎩', wear: true, items: [
    I('hat_cap', 'Бейсболка', 2000), I('hat_beanie', 'Вязаная шапка', 3000), I('hat_cowboy', 'Ковбойская шляпа', 30000),
    I('hat_captain', 'Капитанская фуражка', 200000), I('hat_laurel', 'Золотой лавровый венок', 3000000), I('hat_crown', 'Королевская корона', 10000000),
    M('hat_flatcap', 'Кепка-восьмиклинка', 12000), M('hat_panama', 'Панама', 30000), M('hat_fedora', 'Фетровая шляпа', 80000),
    M('hat_bowler', 'Котелок', 150000), M('hat_top', 'Цилиндр', 500000),
    F('hat_straw', 'Соломенная шляпа', 8000), F('hat_beret', 'Берет', 10000), F('hat_sun', 'Широкополая шляпа', 25000),
    F('hat_tiara', 'Бриллиантовая диадема', 5000000),
  ] },
];

// костюм показывается на человеке: по умолчанию — на первой основе (в магазине и поместье — на выбранной)
const OUTFIT_N = { outfit_sport: 'o1', outfit_casual: 'o2', outfit_business: 'o3', outfit_white: 'o4', outfit_evening: 'o5', outfit_gold: 'o6' };
for (const it of LUX_CATS.find((c) => c.id === 'outfits').items) it.img = asset(`doll/b1_${OUTFIT_N[it.id]}.webp`);

for (const c of LUX_CATS) {
  c.items.sort((a, b) => a.price - b.price);
  if (SCENE_CATS.includes(c.id)) for (const it of c.items) { it.scene = asset(`scenes/${it.id}.jpg`); it.thumb = asset(`scenes/${it.id}_t.jpg`); }
}

export const LUX_ITEMS = LUX_CATS.flatMap((c) => c.items.map((it) => ({ ...it, cat: c.id, wear: !!c.wear })));
export const luxById = (id) => LUX_ITEMS.find((x) => x.id === id);
// мужчина/женщина по выбранной основе: b1, b2 — мужчины, b3, b4 — женщины
export const sexOfBase = (b) => (b === 'b1' || b === 'b2' ? 'm' : b === 'b3' || b === 'b4' ? 'f' : null);
// подходит ли вещь человеку этого пола (пол не выбран — подходит всё)
export const fitsSex = (it, sex) => !sex || !it.sex || it.sex === sex;
export const luxName = (it, sex) => (sex === 'f' && it.nameF) || it.name;

// вещи, переехавшие из «Вещей» в гардероб: старое название → новое (купленное у игроков переносится с той же ценой)
export const LUX_RENAMED = {
  thing_sneakers: 'shoes_designer', thing_phone: 'phone_gold', thing_watch: 'watch_gold', thing_chain: 'chain_gold', thing_crown: 'hat_crown',
};
