// Дорожка уровней каждого раздела: от простого к сложному.
// games — какие задания выпадают на уровне ([вид, настройки]); последний уровень — «всё вместе».
import * as G from './games.js';

const L = (title, ...games) => ({ title, games });

export const LEVELS = {
  math: [
    L('Считаем до 5', [G.count, { max: 5 }]),
    L('Считаем до 10', [G.count, { max: 10 }]),
    L('Найди число', [G.findNum, { max: 7 }]),
    L('Где больше?', [G.compare, { max: 8 }]),
    L('Плюс до 5', [G.add, { max: 5 }]),
    L('Минус до 5', [G.sub, { max: 5 }]),
    L('Соседи чисел', [G.missing, { max: 10 }]),
    L('Плюс до 10', [G.add, { max: 10 }]),
    L('Минус до 10', [G.sub, { max: 10 }]),
    L('Задачки до 5', [G.story, { max: 5 }]),
    L('Примеры без картинок', [G.add, { max: 10, pics: false }], [G.sub, { max: 10, pics: false }]),
    L('Знаки > < =', [G.signs, { max: 10 }]),
    L('Задачки до 10', [G.story, { max: 10 }]),
    L('Всё вместе', [G.add, { max: 10, pics: false }], [G.sub, { max: 10, pics: false }], [G.story, { max: 10 }], [G.missing, {}], [G.signs, {}], [G.compare, { max: 10 }]),
  ],
  sounds: [
    L('Первый звук: гласные', [G.firstSound, { vowels: true }]),
    L('Первый звук', [G.firstSound, {}]),
    L('Картинка на звук', [G.findSound, { at: 'first' }]),
    L('Гласный или согласный', [G.vowelCons, {}]),
    L('Последний звук', [G.lastSound, {}]),
    L('Картинка: звук в конце', [G.findSound, { at: 'last' }]),
    L('Где звук в слове?', [G.soundPlace, {}]),
    L('Твёрдый или мягкий', [G.softHard, {}]),
    L('Сколько звуков?', [G.countSounds, {}]),
    L('Всё вместе', [G.firstSound, {}], [G.lastSound, {}], [G.soundPlace, {}], [G.softHard, {}], [G.countSounds, {}], [G.vowelCons, {}]),
  ],
  syllables: [
    L('Хлопаем: короткие слова', [G.clap, { max: 2 }]),
    L('Хлопаем: длинные слова', [G.clap, { min: 2 }]),
    L('Паровозик: 2 слога', [G.train, { min: 2, max: 2 }]),
    L('Первый слог', [G.firstSyl, {}]),
    L('Найди слово по слогам', [G.findBySyl, {}]),
    L('Паровозик: 3 слога', [G.train, { min: 3, max: 3 }]),
    L('Пропущенный слог', [G.missingSyl, { n: 3 }]),
    L('Паровозик: длинные слова', [G.train, { min: 3, max: 5 }]),
    L('Всё вместе', [G.clap, { min: 2 }], [G.train, { min: 2, max: 5 }], [G.firstSyl, {}], [G.missingSyl, { n: 4 }], [G.findBySyl, {}]),
  ],
  words: [
    L('Читаем слоги', [G.sylRead, {}]),
    L('Слова из 3 букв', [G.read, { maxLen: 3 }]),
    L('Собери слово: 3 буквы', [G.letters, { min: 3, max: 3 }]),
    L('Слова из 2 слогов', [G.read, { minSyl: 2, maxSyl: 2, maxLen: 5 }]),
    L('Какое слово?', [G.pickWord, {}]),
    L('Пропущенная буква', [G.missLetter, {}]),
    L('Собери слово: 4–5 букв', [G.letters, { min: 4, max: 5 }]),
    L('Длинные слова', [G.read, { minSyl: 3 }]),
    L('Да или нет?', [G.yesNo, {}]),
    L('Загадки', [G.riddle, {}]),
    L('Всё вместе', [G.read, { minSyl: 2 }], [G.pickWord, {}], [G.missLetter, {}], [G.letters, { min: 4, max: 5 }], [G.yesNo, {}], [G.riddle, {}]),
  ],
};

// Азбука: буквы изучаются группами, как в букваре. Уровень с intro сначала знакомит с буквами,
// в заданиях попадаются и новые буквы, и все выученные раньше.
const GROUPS = [['А', 'О', 'У'], ['Ы', 'И', 'Э'], ['М', 'Н', 'Л', 'Р'], ['С', 'Т', 'К', 'П'], ['Б', 'В', 'Г', 'Д'],
  ['З', 'Ж', 'Ш', 'Х'], ['Ф', 'Ц', 'Ч', 'Щ'], ['Е', 'Ё', 'Ю', 'Я'], ['Й', 'Ь', 'Ъ']];
const learned = (k) => GROUPS.slice(0, k + 1).flat();
const learn = (k) => ({
  title: `Буквы ${GROUPS[k].join(' ')}`, intro: GROUPS[k],
  games: [[G.findLetter, { set: GROUPS[k].length >= 3 ? GROUPS[k] : learned(k) }], [G.findLetter, { set: learned(k) }],
    [G.letterToPic, { set: GROUPS[k] }], [G.picToLetter, { set: learned(k) }]].filter(([fn, o]) => fn !== G.letterToPic || o.set.some((L) => 'ЫЪЬЙ'.indexOf(L) < 0)),
});
LEVELS.abc = [
  learn(0), learn(1), learn(2), learn(3),
  L('Повторяем 14 букв', [G.findLetter, { set: learned(3) }], [G.picToLetter, { set: learned(3) }], [G.letterToPic, { set: learned(3) }]),
  learn(4), learn(5), learn(6),
  L('Повторяем согласные', [G.findLetter, { set: learned(6) }], [G.picToLetter, { set: learned(6) }], [G.letterToPic, { set: learned(6) }]),
  learn(7),
  { title: 'Буквы Й Ь Ъ', intro: GROUPS[8], games: [[G.findLetter, { set: ['Й', 'Ь', 'Ъ', 'И', 'Ы'] }], [G.similarLetters, {}]] },
  L('Похожие буквы', [G.similarLetters, {}]),
  L('Маленькие буквы', [G.lowerCase, {}]),
  L('Алфавит по порядку', [G.abcGap, {}]),
  L('Паровозик алфавита', [G.abcTrain, {}]),
  L('Вся азбука', [G.findLetter, {}], [G.picToLetter, {}], [G.letterToPic, {}], [G.similarLetters, {}], [G.lowerCase, {}], [G.abcGap, {}], [G.abcTrain, {}]),
];

LEVELS.build = [
  L('3 буквы с подсказкой', [G.buildWord, { min: 3, max: 3, extra: 2, hint: true }]),
  L('Слова из 3 букв', [G.buildWord, { min: 3, max: 3, extra: 3 }]),
  L('4 буквы с подсказкой', [G.buildWord, { min: 4, max: 4, extra: 2, hint: true }]),
  L('Слова из 4 букв', [G.buildWord, { min: 4, max: 4, extra: 2 }]),
  L('5 букв с подсказкой', [G.buildWord, { min: 5, max: 5, extra: 1, hint: true }]),
  L('Слова из 5 букв', [G.buildWord, { min: 5, max: 5, extra: 1 }]),
  L('Длинные слова с подсказкой', [G.buildWord, { min: 6, max: 11, extra: 0, hint: true }]),
  L('Длинные слова', [G.buildWord, { min: 6, max: 11, extra: 0 }]),
  L('Слова с Ь и Й', [G.buildWord, { min: 3, max: 7, extra: 1, soft: true }]),
  L('Послушай и собери', [G.buildWord, { min: 3, max: 5, extra: 2, ear: true }]),
  L('Всё вместе', [G.buildWord, { min: 3, max: 4, extra: 3 }], [G.buildWord, { min: 5, max: 8, extra: 1 }], [G.buildWord, { min: 3, max: 6, extra: 2, ear: true }], [G.buildWord, { min: 3, max: 7, extra: 1, soft: true }]),
];

// «Буква за буквой»: каждая буква от А до Я — два урока (знакомство и закрепление) в порядке букваря,
// после каждой группы — повторение всего выученного, в конце — весь алфавит.
import { ITEMS, ALPHABET } from './data.js';
const hasPic = (L) => ITEMS.some((i) => i.letter === L);
const inWords = (L) => ITEMS.some((i) => i.word.toUpperCase().includes(L));
const NAME = { Ь: 'Мягкий знак', Ъ: 'Твёрдый знак' };
LEVELS.letters = [];
GROUPS.forEach((group, k) => {
  const before = learned(k);
  group.forEach((ch) => {
    const known = before.slice(0, before.indexOf(ch) + 1);
    const title = NAME[ch] || `Буква ${ch}`;
    const learnGames = [[G.findLetter, { target: ch, set: known.length > 1 ? known : [ch] }]];
    if (hasPic(ch)) learnGames.push([G.letterToPic, { target: ch }], [G.picToLetter, { target: ch, set: known }]);
    if (inWords(ch)) learnGames.push([G.letterInWord, { target: ch }]);
    LEVELS.letters.push({ title, intro: [ch], games: learnGames });
    const fixGames = [[G.findLetter, { target: ch, set: ALPHABET }], [G.similarLetters, { target: ch }]];
    if (!'ЬЪЫ'.includes(ch)) fixGames.push([G.lowerCase, { target: ch }]);
    if (inWords(ch)) fixGames.push([G.letterInWord, { target: ch }]);
    if (hasPic(ch)) fixGames.push([G.picToLetter, { target: ch, set: ALPHABET }]);
    LEVELS.letters.push({ title: `${NAME[ch] || ch}: закрепляем`, games: fixGames });
  });
  const all = learned(k);
  LEVELS.letters.push(L(`Повторяем: ${group.join(' ')}`, [G.findLetter, { set: all }], [G.picToLetter, { set: all }],
    [G.letterToPic, { set: all.filter(hasPic) }], [G.letterInWord, { set: all.filter(inWords) }]));
});
LEVELS.letters.push(L('Весь алфавит', [G.findLetter, {}], [G.picToLetter, {}], [G.letterToPic, {}], [G.letterInWord, {}], [G.lowerCase, {}], [G.similarLetters, {}], [G.abcGap, {}], [G.abcTrain, {}]));

export const TASKS_PER_LEVEL = 8;
// звёзды за уровень по числу ошибок
export const starsFor = (mistakes) => (mistakes <= 1 ? 3 : mistakes <= 4 ? 2 : 1);
