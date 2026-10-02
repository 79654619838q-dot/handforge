// Магазин роскоши: машины, мотоциклы, дома, яхты, вертолёты, самолёты, острова, животные, вещи.
// Покупки только для красоты и рейтинга «Самый богатый»; продать можно за полную цену.
// Картинки — assets/lux/<id>.webp (листы 3×3 из ChatGPT, см. tools/build_assets.py).
import { asset } from './machines.js';

const I = (id, name, price) => ({ id, name, price, img: asset(`lux/${id}.webp`) });
// дома и острова — ещё и сцена во весь фон поместья (scenes/<id>.jpg) и её уменьшенная копия для магазина
const SCENE_CATS = ['houses', 'islands'];

export const LUX_CATS = [
  { id: 'cars', name: 'Машины', emoji: '🚗', items: [
    I('car_rusty', 'Старый хэтчбек', 15000), I('car_city', 'Городская малолитражка', 40000), I('car_sedan', 'Семейный седан', 90000),
    I('car_suv', 'Большой внедорожник', 250000), I('car_muscle', 'Американский маслкар', 400000), I('car_limo', 'Представительский седан', 900000),
    I('car_coupe', 'Спортивное купе', 2000000), I('car_super', 'Суперкар', 6000000), I('car_hyper', 'Золотой гиперкар', 20000000),
  ] },
  { id: 'moto', name: 'Мотоциклы', emoji: '🏍️', items: [
    I('moto_bike', 'Детский велосипед', 2000), I('moto_moped', 'Старый мопед', 8000), I('moto_scooter', 'Городской скутер', 20000),
    I('moto_dirt', 'Кроссовый мотоцикл', 60000), I('moto_cruiser', 'Хромированный круизер', 150000), I('moto_touring', 'Туристический мотоцикл', 300000),
    I('moto_sport', 'Спортбайк', 700000), I('moto_chopper', 'Золотой чоппер', 2500000), I('moto_future', 'Супербайк будущего', 8000000),
  ] },
  { id: 'houses', name: 'Дома', emoji: '🏠', items: [
    I('house_cabin', 'Деревянная избушка', 50000), I('house_cottage', 'Кирпичный домик', 150000), I('house_family', 'Дом с садом', 400000),
    I('house_glass', 'Стеклянная вилла', 1500000), I('house_sea', 'Вилла у моря с бассейном', 4000000), I('house_penthouse', 'Пентхаус в небоскрёбе', 10000000),
    I('house_mansion', 'Особняк с фонтаном', 25000000), I('house_palace', 'Белый дворец', 80000000), I('house_castle', 'Сказочный замок', 200000000),
  ] },
  { id: 'yachts', name: 'Яхты', emoji: '🛥️', items: [
    I('boat_rubber', 'Надувная лодка', 10000), I('boat_speed', 'Быстрый катер', 120000), I('boat_sail', 'Парусная яхта', 800000),
    I('boat_yacht', 'Моторная яхта', 5000000), I('boat_super', 'Суперъяхта с вертолётной площадкой', 60000000),
  ] },
  { id: 'heli', name: 'Вертолёты', emoji: '🚁', items: [
    I('heli_light', 'Лёгкий вертолёт', 1500000), I('heli_black', 'Частный вертолёт', 8000000),
    I('heli_vip', 'VIP-вертолёт', 15000000), I('heli_gold', 'Золотой двухвинтовой вертолёт', 40000000),
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
    I('pet_chihuahua', 'Чихуахуа в свитере', 10000), I('pet_parrot', 'Попугай ара', 15000), I('pet_cat', 'Персидский кот', 20000),
    I('pet_puppy', 'Щенок ретривера', 30000), I('pet_horse', 'Скаковая лошадь', 800000), I('pet_tiger', 'Белый тигр', 3000000),
    I('pet_elephant', 'Слонёнок', 5000000), I('pet_unicorn', 'Единорог', 100000000), I('pet_dragon', 'Золотой дракончик', 500000000),
  ] },
  { id: 'things', name: 'Вещи', emoji: '💎', items: [
    I('thing_sneakers', 'Белые кроссовки', 1000), I('thing_phone', 'Золотой смартфон', 25000), I('thing_bag', 'Дизайнерская сумка', 50000),
    I('thing_watch', 'Золотые часы', 80000), I('thing_chain', 'Золотая цепь', 150000), I('thing_ring', 'Кольцо с бриллиантом', 500000),
    I('thing_painting', 'Картина в золотой раме', 3000000), I('thing_crown', 'Королевская корона', 10000000), I('thing_diamond', 'Голубой бриллиант', 50000000),
  ] },
];

for (const c of LUX_CATS) {
  c.items.sort((a, b) => a.price - b.price);
  if (SCENE_CATS.includes(c.id)) for (const it of c.items) { it.scene = asset(`scenes/${it.id}.jpg`); it.thumb = asset(`scenes/${it.id}_t.jpg`); }
}

export const LUX_ITEMS = LUX_CATS.flatMap((c) => c.items.map((it) => ({ ...it, cat: c.id })));
export const luxById = (id) => LUX_ITEMS.find((x) => x.id === id);
