// «Сокрытая сила» — все данные игры. Без DOM: этот файл читает и игра, и tools/sim.mjs.

export const STATS = [
  { id: 'str', name: 'Сила', hint: 'урон оружием' },
  { id: 'agi', name: 'Ловкость', hint: 'крит, уворот, побег' },
  { id: 'vit', name: 'Выносливость', hint: 'здоровье и защита' },
  { id: 'mag', name: 'Магия', hint: 'мана и сила заклинаний' },
  { id: 'luck', name: 'Удача', hint: 'редкость находок и золото' },
];

// Тайная сила героя не показывается, пока игрок его не выбрал.
export const HEROES = [
  { id: 'knight', name: 'Сир Гарет Седой', title: 'Старый рыцарь', stats: { str: 7, agi: 3, vit: 8, mag: 2, luck: 5 }, skills: ['power', 'stoneskin'],
    power: { id: 'undying', name: 'Несломленный', text: 'Раз за бой, получив смертельный удар, встаёт снова с 40% здоровья.' } },
  { id: 'huntress', name: 'Лиара', title: 'Охотница', stats: { str: 5, agi: 8, vit: 6, mag: 2, luck: 4 }, skills: ['power', 'poison'],
    power: { id: 'beasteye', name: 'Глаз зверя', text: 'Видит уровень, ранг и здоровье любого монстра до боя. Первый удар в бою — на 50% сильнее.' } },
  { id: 'monk', name: 'Брат Тэн', title: 'Отшельник', stats: { str: 5, agi: 5, vit: 6, mag: 6, luck: 3 }, skills: ['heal', 'power'],
    power: { id: 'bloodearth', name: 'Кровь земли', text: 'Каждый удар лечит его на 25% нанесённого урона.' } },
  { id: 'thief', name: 'Вэсс', title: 'Воровка', stats: { str: 5, agi: 8, vit: 6, mag: 1, luck: 5 }, skills: ['poison', 'whirl'],
    power: { id: 'luckyhand', name: 'Рука удачи', text: 'Видит редкость закрытых находок по их свечению. Золота вдвое больше, и в каждой находке на один вариант больше.' } },
  { id: 'barbarian', name: 'Торвальд', title: 'Северный варвар', stats: { str: 9, agi: 4, vit: 8, mag: 1, luck: 3 }, skills: ['power', 'whirl'],
    power: { id: 'berserk', name: 'Ярость предков', text: 'Чем меньше здоровья, тем страшнее удар: до +120% урона, когда жизнь на исходе.' } },
  { id: 'seer', name: 'Ирэн Незрячая', title: 'Провидица', stats: { str: 2, agi: 4, vit: 5, mag: 10, luck: 4 }, skills: ['fire', 'heal'],
    power: { id: 'mirror', name: 'Зеркало душ', text: 'Возвращает врагу четверть полученного урона, а каждый девятый удар отражает целиком.' } },
  { id: 'paladin', name: 'Сэр Аурелий', title: 'Паладин', stats: { str: 6, agi: 3, vit: 8, mag: 5, luck: 3 }, skills: ['heal', 'bash'],
    power: { id: 'faith', name: 'Щит веры', text: 'Первые три удара врага в каждом бою бьют вполсилы.' } },
  { id: 'necro', name: 'Морана', title: 'Некромантка', stats: { str: 2, agi: 4, vit: 5, mag: 10, luck: 4 }, skills: ['drainlife', 'ice'],
    power: { id: 'souls', name: 'Пожирательница душ', text: 'Каждая победа навсегда усиливает её удары: +0,2% за душу, до +60%.' } },
  { id: 'dwarf', name: 'Бронн Каменная Борода', title: 'Гном-кузнец', stats: { str: 8, agi: 3, vit: 9, mag: 1, luck: 4 }, skills: ['power', 'bash'],
    power: { id: 'forge', name: 'Мастер кузни', text: 'Улучшения у кузнеца вдвое дешевле и никогда не срываются.' } },
  { id: 'druid', name: 'Эйлин из Рощи', title: 'Друид', stats: { str: 3, agi: 5, vit: 6, mag: 8, luck: 3 }, skills: ['renew', 'thunder'],
    power: { id: 'wild', name: 'Дикая поросль', text: 'Каждый ход боя возвращает 4% здоровья и маны.' } },
  { id: 'assassin', name: 'Каэль Тень', title: 'Убийца', stats: { str: 5, agi: 10, vit: 4, mag: 2, luck: 4 }, skills: ['bleed', 'execute'],
    power: { id: 'shadowstep', name: 'Шаг тени', text: '+15% уворот, а первый удар в каждом бою — всегда критический и втрое сильнее обычного.' } },
  { id: 'ronin', name: 'Рэн Странник', title: 'Мечник', stats: { str: 7, agi: 7, vit: 5, mag: 2, luck: 4 }, skills: ['whirl', 'bleed'],
    power: { id: 'counter', name: 'Контрудар', text: 'Увернувшись от удара, тут же отвечает своим.' } },
];

// Умения. Растут от применения: каждое использование даёт опыт умения.
// kind: phys — от силы атаки, magic — от силы магии, heal, buff. icon — картинка (лист skills / skills2).
export const SKILLS = {
  strike: { name: 'Удар', icon: 'skills_1', cost: 0, kind: 'phys', mult: 1.0, per: 0.05, text: 'Обычный удар оружием.' },
  power: { name: 'Сокрушающий удар', icon: 'skills_2', cost: 8, kind: 'phys', mult: 1.9, per: 0.12, text: 'Тяжёлый удар со всей силы.' },
  fire: { name: 'Огненный шар', icon: 'skills_3', cost: 10, kind: 'magic', mult: 1.7, per: 0.12, burn: 0.25, text: 'Магический огонь, враг горит 3 хода.' },
  heal: { name: 'Исцеление', icon: 'skills_4', cost: 12, kind: 'heal', mult: 0.28, per: 0.025, text: 'Возвращает часть здоровья.' },
  stoneskin: { name: 'Каменная кожа', icon: 'skills_5', cost: 8, kind: 'buff', mult: 0.5, per: 0.03, text: 'На 3 хода урон по герою меньше вдвое и больше.' },
  poison: { name: 'Ядовитый клинок', icon: 'skills_6', cost: 6, kind: 'phys', mult: 0.8, per: 0.06, poison: 0.35, text: 'Удар и яд на 4 хода.' },
  ice: { name: 'Ледяные оковы', icon: 'skills_7', cost: 10, kind: 'magic', mult: 1.2, per: 0.08, stun: 0.5, text: 'Холод сковывает: враг может пропустить ход.' },
  whirl: { name: 'Вихрь клинков', icon: 'skills_8', cost: 12, kind: 'phys', mult: 0.7, per: 0.05, hits: 3, text: 'Три быстрых удара, каждый может быть критическим.' },
  bleed: { name: 'Кровопускание', icon: 'skills2_1', cost: 7, kind: 'phys', mult: 1.0, per: 0.07, bleed: 0.4, text: 'Глубокая рана: враг истекает кровью 4 хода.' },
  thunder: { name: 'Цепная молния', icon: 'skills2_2', cost: 14, kind: 'magic', mult: 2.2, per: 0.14, stun: 0.3, text: 'Молния бьёт и может оглушить.' },
  drainlife: { name: 'Похищение жизни', icon: 'skills2_3', cost: 12, kind: 'magic', mult: 1.4, per: 0.1, drain: 0.6, text: 'Магия вытягивает жизнь врага тебе.' },
  shout: { name: 'Боевой клич', icon: 'skills2_4', cost: 10, kind: 'rage', mult: 0.4, per: 0.04, text: 'На 3 хода твой урон выше.' },
  execute: { name: 'Казнь', icon: 'skills2_5', cost: 12, kind: 'phys', mult: 1.2, per: 0.08, execute: 3, text: 'Добивание: втрое сильнее, если у врага меньше трети здоровья.' },
  bash: { name: 'Удар щитом', icon: 'skills2_6', cost: 8, kind: 'phys', mult: 0.9, per: 0.06, stun: 0.45, text: 'Оглушающий удар.' },
  meteor: { name: 'Метеор', icon: 'skills2_7', cost: 26, kind: 'magic', mult: 3.6, per: 0.2, burn: 0.3, text: 'С неба падает пылающий камень.' },
  renew: { name: 'Обновление', icon: 'skills2_8', cost: 14, kind: 'hot', mult: 0.1, per: 0.01, text: 'Здоровье восстанавливается 4 хода.' },
};
export const SKILL_MAX = 10;
export const skillNeed = (lvl) => 3 + lvl * 3; // применений до следующего уровня умения

// Земли. lv — уровни монстров, boss — хозяин земли.
export const LANDS = [
  { id: 'forest', name: 'Тёмный лес', lv: [1, 4], mons: ['wolf', 'goblin', 'spider', 'treant', 'witch'], boss: 'spiderqueen', bossLv: 6, x: 17, y: 72 },
  { id: 'swamp', name: 'Гнилые болота', lv: [5, 8], mons: ['drowned', 'toad', 'wisp', 'troll', 'lizard'], boss: 'hydra', bossLv: 10, x: 24, y: 40 },
  { id: 'caves', name: 'Подземелья', lv: [9, 13], mons: ['skeleton', 'golem', 'bat', 'worm', 'dwarf'], boss: 'bonelord', bossLv: 15, x: 55, y: 47 },
  { id: 'mountains', name: 'Ледяные горы', lv: [14, 18], mons: ['yeti', 'iceel', 'griffin', 'harpy', 'giant'], boss: 'wyvern', bossLv: 20, x: 78, y: 24 },
  { id: 'ash', name: 'Пепельная пустошь', lv: [19, 24], mons: ['hellhound', 'lavagolem', 'salamander', 'imp', 'demon'], boss: 'dragon', bossLv: 26, x: 85, y: 62 },
  { id: 'castle', name: 'Замок Короля-Лича', lv: [25, 30], mons: ['deathknight', 'vampire', 'banshee', 'gargoyle', 'necro'], boss: 'lich', bossLv: 33, x: 49, y: 12 },
];

// Монстры: множители здоровья/удара/брони к уровню, особые приёмы (ab), sheet — откуда картинка.
export const MONSTERS = {
  wolf: { name: 'Лютый волк', hp: 0.9, atk: 1.1, def: 0.6, ab: ['double'] },
  goblin: { name: 'Гоблин-головорез', hp: 1.0, atk: 1.0, def: 0.8, ab: ['steal'] },
  spider: { name: 'Гигантский паук', hp: 0.8, atk: 1.0, def: 0.5, ab: ['poison'] },
  treant: { name: 'Гнилой древень', hp: 1.5, atk: 0.8, def: 1.4, ab: ['regen'] },
  witch: { name: 'Лесная ведьма', hp: 0.8, atk: 1.2, def: 0.5, ab: ['curse'] },
  spiderqueen: { name: 'Паучья королева', hp: 1.1, atk: 1.0, def: 0.9, ab: ['poison', 'devour'], boss: true },
  drowned: { name: 'Утопленник', hp: 1.3, atk: 0.9, def: 0.7, ab: ['lifesteal'] },
  toad: { name: 'Жаба-людоед', hp: 1.2, atk: 1.0, def: 0.8, ab: ['stun'] },
  wisp: { name: 'Блуждающий огонь', hp: 0.6, atk: 1.3, def: 0.3, ab: ['drain'] },
  troll: { name: 'Болотный тролль', hp: 1.6, atk: 1.1, def: 1.0, ab: ['regen'] },
  lizard: { name: 'Ящер-шаман', hp: 0.9, atk: 1.1, def: 0.8, ab: ['curse'] },
  hydra: { name: 'Болотная гидра', hp: 1.2, atk: 1.0, def: 1.0, ab: ['regen', 'double'], boss: true },
  skeleton: { name: 'Скелет-воин', hp: 1.0, atk: 1.0, def: 1.2, ab: ['armor'] },
  golem: { name: 'Каменный голем', hp: 1.8, atk: 0.9, def: 1.8, ab: ['stun'] },
  bat: { name: 'Кровавая тварь', hp: 0.7, atk: 1.0, def: 0.4, ab: ['lifesteal'] },
  worm: { name: 'Пещерный червь', hp: 1.4, atk: 1.2, def: 0.9, ab: ['devour'] },
  dwarf: { name: 'Тёмный гном', hp: 1.0, atk: 1.3, def: 1.1, ab: ['enrage'] },
  bonelord: { name: 'Костяной лорд', hp: 1.2, atk: 1.1, def: 1.3, ab: ['armor', 'enrage'], boss: true },
  mimic: { name: 'Мимик', hp: 1.2, atk: 1.3, def: 1.0, ab: ['devour'] },
  goldgolem: { name: 'Золотой голем', hp: 2.0, atk: 0.6, def: 2.0, ab: ['flee'] },
  yeti: { name: 'Йети', hp: 1.4, atk: 1.2, def: 1.0, ab: ['stun'] },
  iceel: { name: 'Ледяной элементаль', hp: 1.1, atk: 1.1, def: 1.3, ab: ['freeze'] },
  griffin: { name: 'Грифон', hp: 1.0, atk: 1.2, def: 0.8, ab: ['double'] },
  harpy: { name: 'Гарпия', hp: 0.8, atk: 1.1, def: 0.5, ab: ['double'] },
  giant: { name: 'Горный великан', hp: 1.8, atk: 1.3, def: 1.2, ab: ['devour'] },
  wyvern: { name: 'Снежная виверна', hp: 1.2, atk: 1.1, def: 1.1, ab: ['freeze', 'double'], boss: true },
  hellhound: { name: 'Адская гончая', hp: 1.0, atk: 1.2, def: 0.8, ab: ['fireburn'] },
  lavagolem: { name: 'Лавовый голем', hp: 1.7, atk: 1.0, def: 1.6, ab: ['fireburn'] },
  salamander: { name: 'Огненная саламандра', hp: 1.0, atk: 1.1, def: 0.9, ab: ['fireburn'] },
  imp: { name: 'Демон-бес', hp: 0.7, atk: 1.2, def: 0.5, ab: ['curse'] },
  demon: { name: 'Демон-воитель', hp: 1.3, atk: 1.3, def: 1.2, ab: ['enrage'] },
  dragon: { name: 'Красный дракон', hp: 1.3, atk: 1.2, def: 1.2, ab: ['fireburn', 'devour'], boss: true },
  deathknight: { name: 'Рыцарь смерти', hp: 1.4, atk: 1.3, def: 1.5, ab: ['lifesteal'] },
  vampire: { name: 'Вампир-граф', hp: 1.1, atk: 1.2, def: 0.9, ab: ['lifesteal'] },
  banshee: { name: 'Банши', hp: 0.8, atk: 1.4, def: 0.4, ab: ['stun'] },
  gargoyle: { name: 'Горгулья', hp: 1.3, atk: 1.1, def: 1.8, ab: ['armor'] },
  necro: { name: 'Некромант', hp: 0.9, atk: 1.3, def: 0.6, ab: ['curse'] },
  lich: { name: 'Король-Лич', hp: 1.3, atk: 1.2, def: 1.2, ab: ['freeze', 'drain', 'curse'], boss: true },
  wanderer: { name: 'Чёрный странник', hp: 1.5, atk: 1.5, def: 1.3, ab: ['enrage'] },
  shadow: { name: 'Тень-двойник', hp: 1.0, atk: 1.0, def: 1.0, ab: ['mirror'] },
};
// порядок клеток листов mon1…mon10 (2×2, слева направо, сверху вниз)
export const MON_SHEETS = [
  ['wolf', 'goblin', 'spider', 'treant'], ['witch', 'spiderqueen', 'drowned', 'toad'], ['wisp', 'troll', 'lizard', 'hydra'],
  ['skeleton', 'golem', 'bat', 'worm'], ['dwarf', 'bonelord', 'mimic', 'goldgolem'], ['yeti', 'iceel', 'griffin', 'harpy'],
  ['giant', 'wyvern', 'hellhound', 'lavagolem'], ['salamander', 'imp', 'demon', 'dragon'], ['deathknight', 'vampire', 'banshee', 'gargoyle'],
  ['necro', 'lich', 'wanderer', 'shadow'],
];

export const ABILITY_TEXT = {
  double: 'бьёт дважды', poison: 'отравляет', regen: 'залечивает раны', curse: 'накладывает проклятие слабости',
  lifesteal: 'пьёт жизнь', stun: 'оглушает', drain: 'выжигает ману', armor: 'покрывается бронёй',
  devour: 'готовит страшный удар', enrage: 'приходит в ярость', fireburn: 'поджигает', freeze: 'замораживает',
  steal: 'ворует золото', flee: 'убегает с сокровищами', mirror: 'копирует твою силу',
};

// Ранг монстра скрыт до конца боя (или до «Глаза зверя», «Ока бездны», свитка прозрения).
export const RANKS = [
  { id: 0, name: 'Обычный', hp: 1, atk: 1, xp: 1, loot: 0 },
  { id: 1, name: 'Матёрый', hp: 1.45, atk: 1.22, xp: 1.6, loot: 1 },
  { id: 2, name: 'Древний', hp: 2.2, atk: 1.5, xp: 2.8, loot: 2 },
];

export const RARITIES = [
  { id: 0, name: 'Обычное', color: '#b8b2a4', mult: 1.0, affixes: 0 },
  { id: 1, name: 'Добротное', color: '#5fd37a', mult: 1.2, affixes: 1 },
  { id: 2, name: 'Редкое', color: '#4fa3ff', mult: 1.45, affixes: 2 },
  { id: 3, name: 'Эпическое', color: '#b46cff', mult: 1.75, affixes: 3 },
  { id: 4, name: 'Легендарное', color: '#ff9a2e', mult: 2.2, affixes: 4 },
  { id: 5, name: 'Проклятое', color: '#ff3b3b', mult: 2.0, affixes: 2 },
];

// Ячейки снаряжения. Кольца и артефакты — по нескольку ячеек одного вида.
export const SLOTS = {
  weapon: 'Оружие', offhand: 'Вторая рука', helm: 'Шлем', armor: 'Броня', cloak: 'Плащ', gloves: 'Перчатки',
  belt: 'Пояс', boots: 'Сапоги', amulet: 'Амулет', ring1: 'Кольцо', ring2: 'Кольцо', art1: 'Артефакт', art2: 'Артефакт', art3: 'Артефакт',
};
export const SLOT_KIND = { ring1: 'ring', ring2: 'ring', art1: 'art', art2: 'art', art3: 'art' };
export const KIND_SLOTS = { ring: ['ring1', 'ring2'], art: ['art1', 'art2', 'art3'] };
export const KIND_NAME = { weapon: 'Оружие', offhand: 'Вторая рука', helm: 'Шлем', armor: 'Броня', cloak: 'Плащ', gloves: 'Перчатки', belt: 'Пояс', boots: 'Сапоги', amulet: 'Амулет', ring: 'Кольцо' };

// Виды вещей. tier 1–6 — ступень роскоши: чем дальше по игре, тем богаче выпадающие вещи.
// Картинки — клетки листов 3×3 (<лист>_<1-9>).
const B = (img, name, tier, mod) => ({ img, name, tier, mod });
export const BASES = {
  weapon: [
    B('wpn1_1', 'Старый меч', 1), B('wpn1_2', 'Боевой топор', 1, { atk: 1.1 }), B('wpn1_3', 'Кривой кинжал', 1, { atk: 0.85, crit: 6 }),
    B('wpn1_4', 'Боевой молот', 2, { atk: 1.2, crit: -2 }), B('wpn1_5', 'Охотничий лук', 1, { atk: 0.95, crit: 4 }), B('wpn1_6', 'Посох с кристаллом', 2, { atk: 0.6, mag: 1 }),
    B('wpn1_7', 'Копьё', 1, { atk: 1.05 }), B('wpn1_8', 'Шипастая булава', 2, { atk: 1.15 }), B('wpn1_9', 'Рунный меч', 3, { atk: 1.05, mag: 0.4 }),
    B('wpn2_1', 'Зазубренный двуручник', 3, { atk: 1.3, crit: -2 }), B('wpn2_2', 'Эльфийский лук', 3, { atk: 1.0, crit: 7 }), B('wpn2_3', 'Посох-череп', 3, { atk: 0.6, mag: 1.3 }),
    B('wpn2_4', 'Костяной серп', 2, { atk: 0.95, crit: 5 }), B('wpn2_5', 'Пылающий меч', 4, { atk: 1.15 }), B('wpn2_6', 'Ледяная секира', 4, { atk: 1.2 }),
    B('wpn2_7', 'Коса смерти', 5, { atk: 1.25, crit: 3 }), B('wpn2_8', 'Золотой скипетр', 4, { atk: 0.7, mag: 1.2 }), B('wpn2_9', 'Драконий клинок', 5, { atk: 1.3, crit: 3 }),
    B('wpn3_1', 'Алебарда', 2, { atk: 1.2 }), B('wpn3_2', 'Клеймор', 3, { atk: 1.25 }), B('wpn3_3', 'Моргенштерн', 3, { atk: 1.2, crit: 2 }),
    B('wpn3_4', 'Трезубец', 4, { atk: 1.15, crit: 3 }), B('wpn3_5', 'Катана', 4, { atk: 1.05, crit: 9 }), B('wpn3_6', 'Посох ветров', 3, { atk: 0.6, mag: 1.25 }),
    B('wpn3_7', 'Парные кинжалы', 2, { atk: 0.9, crit: 8 }), B('wpn3_8', 'Арбалет', 2, { atk: 1.1, crit: 3 }), B('wpn3_9', 'Громовой молот', 5, { atk: 1.35 }),
    B('wpn4_1', 'Клинок звёздного металла', 6, { atk: 1.3, crit: 5 }), B('wpn4_2', 'Посох солнца', 6, { atk: 0.7, mag: 1.5 }), B('wpn4_3', 'Демонический топор', 6, { atk: 1.45 }),
    B('wpn4_4', 'Меч льда и пламени', 6, { atk: 1.35, mag: 0.5 }), B('wpn4_5', 'Коса бездны', 6, { atk: 1.4, crit: 4 }), B('wpn4_6', 'Лук феникса', 5, { atk: 1.15, crit: 9 }),
    B('wpn4_7', 'Кристальный меч', 5, { atk: 1.25, mag: 0.6 }), B('wpn4_8', 'Молот титанов', 6, { atk: 1.5, crit: -2 }), B('wpn4_9', 'Клинок архангела', 6, { atk: 1.4, crit: 6 }),
  ],
  offhand: [
    B('offh_1', 'Деревянный щит', 1), B('offh_2', 'Каплевидный щит', 2), B('offh_3', 'Щит со львом', 3, { def: 1.1 }),
    B('offh_4', 'Книга заклинаний', 2, { def: 0, mag: 1 }), B('offh_5', 'Хрустальная сфера', 3, { def: 0, mag: 1.2 }), B('offh_6', 'Щит-башня', 4, { def: 1.35 }),
    B('offh_7', 'Щит из драконьей чешуи', 5, { def: 1.25 }), B('offh_8', 'Сфера бури', 5, { def: 0, mag: 1.4 }), B('offh_9', 'Солнечный щит', 6, { def: 1.4 }),
  ],
  armor: [
    B('armor_1', 'Кожаная куртка', 1, { dodge: 3 }), B('armor_2', 'Кольчуга', 1), B('armor_3', 'Звёздная мантия', 2, { def: 0.6, mag: 1 }),
    B('armor_4', 'Латный доспех', 2, { def: 1.25, dodge: -3 }), B('armor_5', 'Драконья чешуя', 4, { def: 1.2 }), B('armor_6', 'Шипастая броня', 3, { def: 1.1 }),
    B('armor_7', 'Эльфийская кираса', 3, { def: 1.0, dodge: 4 }), B('armor_8', 'Доспех из мехов', 2, { def: 0.9, hp: 1.4 }), B('armor_9', 'Латы паладина', 5, { def: 1.35 }),
    B('armor2_1', 'Стёганка', 1, { def: 0.8, hp: 1.2 }), B('armor2_2', 'Бригантина', 2, { def: 1.1 }), B('armor2_3', 'Доспех тёмного рыцаря', 4, { def: 1.3 }),
    B('armor2_4', 'Ледяная броня', 4, { def: 1.15, mag: 0.5 }), B('armor2_5', 'Огненная броня', 5, { def: 1.2 }), B('armor2_6', 'Костяная броня', 3, { def: 1.05, hp: 1.2 }),
    B('armor2_7', 'Мифриловая кольчуга', 5, { def: 1.15, dodge: 4 }), B('armor2_8', 'Доспех архангела', 6, { def: 1.45 }), B('armor2_9', 'Демонический доспех', 6, { def: 1.35, hp: 1.3 }),
  ],
  helm: [
    B('helm_1', 'Кожаный капюшон', 1, { dodge: 2 }), B('helm_2', 'Железный шлем', 1), B('helm_3', 'Рогатый шлем', 2, { def: 1.1 }),
    B('helm_4', 'Шлем с забралом', 2, { def: 1.25 }), B('helm_5', 'Костяная корона', 3, { def: 0.8, mag: 0.8 }), B('helm_6', 'Шляпа звездочёта', 2, { def: 0.5, mag: 1 }),
    B('helm_7', 'Маска демона', 4, { def: 1.1, crit: 3 }), B('helm_8', 'Крылатый шлем', 4, { def: 1.15, dodge: 2 }), B('helm_9', 'Золотая корона', 5, { def: 0.7, luck: 1 }),
    B('helm2_1', 'Кольчужный капюшон', 1), B('helm2_2', 'Бацинет', 2, { def: 1.15 }), B('helm2_3', 'Шлем с плюмажем', 3, { def: 1.1, dodge: 2 }),
    B('helm2_4', 'Маска чумного доктора', 3, { def: 0.8, mag: 0.8 }), B('helm2_5', 'Ледяная корона', 4, { def: 0.7, mag: 1.1 }), B('helm2_6', 'Огненный шлем', 5, { def: 1.2 }),
    B('helm2_7', 'Шлем-череп дракона', 5, { def: 1.3 }), B('helm2_8', 'Корона лича', 6, { def: 0.8, mag: 1.4 }), B('helm2_9', 'Сияющий венец', 6, { def: 1.0, luck: 2 }),
  ],
  cloak: [
    B('cloak_1', 'Рваный плащ', 1), B('cloak_2', 'Дорожный плащ', 1), B('cloak_3', 'Плащ с мехом', 2),
    B('cloak_4', 'Звёздный плащ', 3, { mag: 1 }), B('cloak_5', 'Плащ из перьев', 4, { dodge: 4 }), B('cloak_6', 'Плащ-тень', 4, { dodge: 5 }),
    B('cloak_7', 'Огненный плащ', 5), B('cloak_8', 'Плащ из драконьей кожи', 5, { def: 1.3 }), B('cloak_9', 'Королевская мантия', 6, { luck: 2 }),
  ],
  gloves: [
    B('gloves_1', 'Кожаные перчатки', 1), B('gloves_2', 'Кольчужные рукавицы', 2), B('gloves_3', 'Латные перчатки', 3, { atk: 1.1 }),
    B('gloves_4', 'Перчатки мага', 3, { atk: 0.5, mag: 1 }), B('gloves_5', 'Когтистые перчатки', 4, { crit: 4 }), B('gloves_6', 'Огненные перчатки', 5, { atk: 1.2 }),
    B('gloves_7', 'Ледяные рукавицы', 5, { atk: 1.0, mag: 0.6 }), B('gloves_8', 'Перчатки убийцы', 4, { crit: 6 }), B('gloves_9', 'Золотые рукавицы', 6, { atk: 1.3 }),
  ],
  belt: [
    B('belt_1', 'Верёвочный пояс', 1), B('belt_2', 'Кожаный ремень', 1), B('belt_3', 'Пояс с сумками', 2),
    B('belt_4', 'Пояс с черепами', 3, { atk: 1 }), B('belt_5', 'Рыцарский пояс', 3, { def: 1 }), B('belt_6', 'Рунный пояс', 4, { mag: 1 }),
    B('belt_7', 'Кушак мага', 4, { mag: 1.2 }), B('belt_8', 'Драконий пояс', 5, { hp: 1.3 }), B('belt_9', 'Золотой пояс', 6, { hp: 1.4, luck: 1 }),
  ],
  boots: [
    B('boots_1', 'Кожаные сапоги', 1), B('boots_2', 'Ботинки следопыта', 2, { dodge: 3 }), B('boots_3', 'Латные сапоги', 3, { def: 1.3 }),
    B('boots_4', 'Сапоги мага', 3, { mag: 1 }), B('boots_5', 'Меховые унты', 2, { def: 1.1 }), B('boots_6', 'Крылатые сапоги', 5, { dodge: 6 }),
    B('boots_7', 'Огненные сапоги', 5, { def: 1.2 }), B('boots_8', 'Сапоги тени', 4, { dodge: 5 }), B('boots_9', 'Золотые сапоги', 6, { def: 1.4 }),
  ],
  ring: [
    B('jewel_1', 'Медное кольцо', 1), B('jewel_2', 'Кольцо с сапфиром', 2), B('jewel_3', 'Кольцо с рубином', 3), B('jewel_4', 'Кольцо-череп', 3),
    B('jewel2_1', 'Кольцо с чёрным алмазом', 6), B('jewel2_2', 'Кольцо-змея', 4), B('jewel2_3', 'Кольцо лунного камня', 5), B('jewel2_4', 'Кольцо дракона', 6),
  ],
  amulet: [
    B('jewel_5', 'Амулет-клык', 1), B('jewel_6', 'Изумрудный амулет', 2), B('jewel_7', 'Амулет-глаз', 3), B('jewel_8', 'Лунный медальон', 4), B('jewel_9', 'Амулет пламени', 5),
    B('jewel2_5', 'Рунный амулет', 3), B('jewel2_6', 'Амулет вороньего черепа', 4), B('jewel2_7', 'Сердце океана', 5), B('jewel2_8', 'Амулет-звезда', 6), B('jewel2_9', 'Древний скарабей', 6),
  ],
};

// Дополнительные свойства вещей (у редких их больше)
export const AFFIXES = [
  { id: 'str', name: 'к силе', stat: true }, { id: 'agi', name: 'к ловкости', stat: true }, { id: 'vit', name: 'к выносливости', stat: true },
  { id: 'mag', name: 'к магии', stat: true }, { id: 'luck', name: 'к удаче', stat: true },
  { id: 'crit', name: '% крит', pct: true }, { id: 'dodge', name: '% уворот', pct: true }, { id: 'leech', name: '% вампиризм', pct: true },
  { id: 'hp', name: 'к здоровью' }, { id: 'mp', name: 'к мане' },
];

// Артефакты — единственные в своём роде, три ячейки. У каждого постоянное свойство и боевое умение (act):
// cd — сколько ходов ждать после применения (99 — раз за бой).
export const ARTIFACTS = [
  { id: 'heart', img: 'artifact_1', name: 'Сердце дракона', text: '+25% к здоровью. Спасает от смерти: воскрешение с половиной здоровья (заряжается отдыхом в лагере).', act: { id: 'nuke', name: 'Драконье пламя', cd: 5, k: 3.0, burn: true, text: 'Огонь дракона: огромный урон и горение.' } },
  { id: 'eye', img: 'artifact_2', name: 'Око бездны', text: 'Показывает уровень и силу монстров. +5% крит.', act: { id: 'weaken', name: 'Взгляд бездны', cd: 6, text: 'Враг теряет броню и четверть силы удара на 3 хода.' } },
  { id: 'hourglass', img: 'artifact_3', name: 'Песочные часы вечности', text: 'В 20% случаев даёт сделать второй ход подряд.', act: { id: 'timestop', name: 'Остановить время', cd: 99, text: 'Враг замирает на 2 хода. Раз за бой.' } },
  { id: 'feather', img: 'artifact_4', name: 'Перо феникса', text: 'Каждый ход возвращает 5% здоровья.', act: { id: 'heal', name: 'Возрождение', cd: 99, k: 0.5, text: 'Возвращает половину здоровья. Раз за бой.' } },
  { id: 'horn', img: 'artifact_5', name: 'Рог войны', text: 'Первые два хода боя урон выше на 40%.', act: { id: 'rage', name: 'Боевой рог', cd: 6, k: 0.5, text: '+50% урона на 3 хода.' } },
  { id: 'skull', img: 'artifact_6', name: 'Хрустальный череп', text: '+40% силы магии, но −10% здоровья.', act: { id: 'drain', name: 'Вой мертвецов', cd: 5, k: 2.2, text: 'Вытягивает жизнь: урон и лечение половиной.' } },
  { id: 'grail', img: 'artifact_7', name: 'Чаша крови', text: 'Вампиризм 15%.', act: { id: 'bloodfeast', name: 'Кровавый пир', cd: 6, text: 'На 3 хода вампиризм +50%.' } },
  { id: 'key', img: 'artifact_8', name: 'Ключ от всех дверей', text: '+30% золота и опыта за победы.', act: { id: 'sure', name: 'Отпереть слабость', cd: 5, text: 'Следующий удар — гарантированно критический и втрое сильнее.' } },
  { id: 'star', img: 'artifact_9', name: 'Звезда Севера', text: '+8 к удаче и ещё один вариант в каждой находке.', act: { id: 'frost', name: 'Северное сияние', cd: 5, k: 1.5, text: 'Ледяной свет: урон и враг пропускает ход.' } },
  { id: 'rune', img: 'artifact2_1', name: 'Руна щита', text: '+10% к защите.', act: { id: 'shield', name: 'Барьер', cd: 6, k: 0.35, text: 'Щит поглощает урон — треть здоровья.' } },
  { id: 'moon', img: 'artifact2_2', name: 'Лунный камень', text: 'Каждый ход +5% маны.', act: { id: 'mana', name: 'Лунный прилив', cd: 99, text: 'Мана полностью восстанавливается. Раз за бой.' } },
  { id: 'storm', img: 'artifact2_3', name: 'Сердце бури', text: '10% шанс, что удар вызовет молнию.', act: { id: 'nuke', name: 'Удар молнии', cd: 4, k: 2.6, stun: 0.4, text: 'Молния: большой урон, может оглушить.' } },
  { id: 'plague', img: 'artifact2_4', name: 'Флакон чумы', text: 'Твои яды сильнее на 30%.', act: { id: 'plague', name: 'Чумное облако', cd: 5, text: 'Сильнейший яд на 5 ходов.' } },
  { id: 'mirror', img: 'artifact2_5', name: 'Осколок зеркала', text: 'Возвращает врагу 10% полученного урона.', act: { id: 'reflect', name: 'Зеркальный щит', cd: 6, text: 'Следующий удар врага отражается в него целиком.' } },
  { id: 'wolf', img: 'artifact2_6', name: 'Тотем волка', text: '+6% крит и +6% уворот.', act: { id: 'pack', name: 'Дух стаи', cd: 4, text: 'Три стремительных удара призрачных волков.' } },
  { id: 'sun', img: 'artifact2_7', name: 'Солнечный диск', text: '+10% к урону.', act: { id: 'sunlight', name: 'Свет солнца', cd: 5, k: 2.2, text: 'Ослепительный свет: урон и лечение.' } },
  { id: 'bone', img: 'artifact2_8', name: 'Костяной оберег', text: '+15% к здоровью.', act: { id: 'bonearmor', name: 'Костяная броня', cd: 6, text: 'На 3 хода урон по тебе меньше на 60%.' } },
  { id: 'coin', img: 'artifact2_9', name: 'Монета судьбы', text: '+20% золота.', act: { id: 'fate', name: 'Бросок судьбы', cd: 5, text: 'Орёл — враг теряет треть здоровья. Решка — ты лечишься на треть.' } },
  { id: 'crown', img: 'artifact3_1', name: 'Корона древних королей', text: '+3 ко всем характеристикам.', act: { id: 'command', name: 'Повеление', cd: 6, text: 'Враг пропускает ход и слабеет.' } },
  { id: 'void', img: 'artifact3_2', name: 'Сфера пустоты', text: '+20% силы магии.', act: { id: 'nuke', name: 'Пустота', cd: 7, k: 4.0, text: 'Разрыв пустоты: сокрушительный урон.' } },
  { id: 'scale', img: 'artifact3_3', name: 'Чешуя бессмертия', text: '+12% к защите, огонь тебе не страшен.', act: { id: 'shield', name: 'Чешуйчатый щит', cd: 99, k: 0.5, text: 'Щит в половину здоровья. Раз за бой.' } },
  { id: 'soul', img: 'artifact3_4', name: 'Камень душ', text: 'После победы возвращает 10% здоровья.', act: { id: 'devoursoul', name: 'Пожрать душу', cd: 6, text: 'Отнимает у врага 15% здоровья и отдаёт тебе.' } },
  { id: 'bloodmoon', img: 'artifact3_5', name: 'Кровавая луна', text: '+25% к урону, когда здоровья меньше половины.', act: { id: 'frenzy', name: 'Безумие', cd: 7, text: 'На 2 хода урон вдвое выше, но и по тебе бьют сильнее.' } },
  { id: 'angel', img: 'artifact3_6', name: 'Перо архангела', text: 'Лечение сильнее на 20%.', act: { id: 'holy', name: 'Небесный свет', cd: 99, text: 'Полное здоровье и снятие яда, огня и проклятий. Раз за бой.' } },
  { id: 'demon', img: 'artifact3_7', name: 'Рог демона', text: '+15% к силе удара.', act: { id: 'hellfire', name: 'Адский огонь', cd: 5, k: 2.5, text: 'Пламя преисподней: урон от силы удара и горение.' } },
  { id: 'chronos', img: 'artifact3_8', name: 'Ось времени', text: 'В 10% случаев — двойной ход.', act: { id: 'loop', name: 'Петля времени', cd: 99, text: 'Ещё два хода подряд. Раз за бой.' } },
  { id: 'tree', img: 'artifact3_9', name: 'Семя Мирового древа', text: 'Каждый ход +3% здоровья и маны.', act: { id: 'roots', name: 'Корни мира', cd: 6, k: 0.35, text: 'Лечит треть здоровья, корни держат врага ход.' } },
  { id: 'lantern', img: 'artifact4_1', name: 'Фонарь душ', text: '+15% опыта за победы.', act: { id: 'banish', name: 'Изгнание', cd: 5, k: 2.0, text: 'Призрачный свет жжёт врага и лишает его брони.' } },
  { id: 'chain', img: 'artifact4_2', name: 'Цепь титана', text: '+10% к здоровью.', act: { id: 'bind', name: 'Сковать', cd: 7, text: 'Враг скован цепями на 2 хода.' } },
  { id: 'dagger', img: 'artifact4_3', name: 'Ритуальный кинжал', text: '+8% крит.', act: { id: 'sacrifice', name: 'Жертва', cd: 5, text: 'Отдаёшь 15% здоровья — следующий удар вчетверо сильнее.' } },
  { id: 'totem', img: 'artifact4_4', name: 'Тотем предков', text: '+5% уворот.', act: { id: 'pack', name: 'Призыв предков', cd: 5, hits: 4, text: 'Четыре удара духов предков.' } },
  { id: 'flame', img: 'artifact4_5', name: 'Око пламени', text: '+15% к силе магии.', act: { id: 'nuke', name: 'Огненная буря', cd: 5, k: 2.0, burn: true, text: 'Буря огня: урон и сильное горение.' } },
  { id: 'pearl', img: 'artifact4_6', name: 'Жемчужина глубин', text: 'Каждый ход +4% маны.', act: { id: 'wave', name: 'Целебная волна', cd: 6, text: 'Четверть здоровья и половина маны.' } },
  { id: 'banner', img: 'artifact4_7', name: 'Знамя легиона', text: '+8% к урону и защите.', act: { id: 'rage', name: 'Клич легиона', cd: 7, k: 0.7, text: '+70% урона на 3 хода.' } },
  { id: 'phylactery', img: 'artifact4_8', name: 'Филактерия', text: 'Раз за бой смертельный удар оставляет тебе 1 здоровья.', act: { id: 'drain', name: 'Тёмный договор', cd: 7, k: 3.0, text: 'Мощное похищение жизни.' } },
  { id: 'compass', img: 'artifact4_9', name: 'Компас судьбы', text: 'Находки на ступень богаче.', act: { id: 'path', name: 'Указать путь', cd: 6, text: 'Раскрывает силу врага, следующий удар — критический и втрое сильнее.' } },
];

// Расходники: картинки — лист cons (3×3)
export const CONS = {
  hp: { name: 'Зелье здоровья', img: 'cons_1', price: 25, text: 'Возвращает 45% здоровья.' },
  mp: { name: 'Зелье маны', img: 'cons_2', price: 25, text: 'Возвращает 60% маны.' },
  elixir: { name: 'Эликсир силы', img: 'cons_3', price: 400, text: '+1 к случайной характеристике навсегда.' },
  insight: { name: 'Свиток прозрения', img: 'cons_4', price: 60, text: 'В бою — открывает уровень и силу врага. На уровне — показывает силу всех десяти монстров.' },
  escape: { name: 'Свиток побега', img: 'cons_5', price: 80, text: 'Мгновенный побег из любого боя (кроме хозяина земли).' },
  tome: { name: 'Древняя книга', img: 'cons_6', price: 700, text: 'Учит новому умению, а если всё изучено — поднимает уровень случайного.' },
  whetstone: { name: 'Точильный камень', img: 'cons_7', price: 300, text: 'Бесплатно улучшает надетое оружие на +1.' },
};

// Знаки на тропе (лист icons 3×3)
export const NODE_ICONS = { chest: 'icons_1', goldchest: 'icons_2', shrine: 'icons_3', merchant: 'icons_4', trap: 'icons_5', camp: 'icons_6', stranger: 'icons_7', cache: 'icons_8', portal: 'icons_9' };
