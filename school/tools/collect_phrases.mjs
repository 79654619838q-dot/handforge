// Собирает все фразы, которые может сказать программа, → school-art/phrases.json
// (дальше tools/build_voice.py записывает их нейронным голосом).
// Задания генерируются случайно, поэтому каждое прогоняем много раз; остальное перечисляем явно.
// node school/tools/collect_phrases.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// заглушки браузера — модулям программы они нужны только при загрузке
globalThis.window = globalThis;
globalThis.location = { search: '' };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

const D = await import('../js/data.js');
const { LEVELS } = await import('../js/levels.js');
const { sayL, letterPhrase } = await import('../js/games.js');

const out = new Set();
const add = (...xs) => xs.flat(Infinity).forEach((x) => { if (typeof x === 'string' && x.trim()) out.add(x.trim()); });

// 1. голос заданий: каждый вид на каждом уровне — по 30000 раз (истории дают сотни сочетаний)
for (const lv of Object.values(LEVELS).flat()) {
  for (const [fn, opts] of lv.games) for (let i = 0; i < 30000; i++) add(fn(opts).voice);
  add(lv.title);
}
// 2. то, что звучит по нажатию
add(D.ITEMS.map((i) => [i.word, ...i.syl]));
add(D.NUM, [1, 2].flatMap((n) => ['m', 'f', 'n'].map((g) => D.numWord(n, g))));
add(Object.values(D.SOUND_SAY), D.ALPHABET.map(sayL), Object.values(D.LETTER_SAY));
for (const c of D.SYL_CONS) for (const v of D.SYL_VOW) add((c + v).toLowerCase());
add(D.YES_NO.map((q) => q.q.toLowerCase()), D.RIDDLES.map((r) => r.q.toLowerCase()));
add(D.PRAISE, D.TRY_AGAIN);
add(['да', 'нет', 'гласный', 'согласный', 'твёрдый', 'мягкий', 'в начале', 'в середине', 'в конце', 'больше', 'меньше', 'равно', 'и-и-и', 'Найди слог', 'Найди букву', 'Буква']);
// 3. фразы экранов (app.js)
add(['Привет! Я совёнок Умка. Выбирай, во что будем играть!', 'Во что поиграем?', 'Сначала пройди прошлый уровень!',
  'Все уровни пройдены! Можно переиграть любой и собрать все звёзды.', 'Три звезды! Ты молодец!', 'Две звезды! Здорово!',
  'Уровень пройден! Молодец!', 'Это твои наклейки! Собери все!', 'Проходи уровни, и получишь наклейки!',
  'Эту наклейку ещё можно заработать!', 'Знакомься с новыми буквами! Слушай и смотри.', 'Нажми на букву, чтобы послушать ещё раз. А потом нажми «Играть».',
  'Это вся азбука. Нажми на любую букву!', 'твёрдый знак', 'Он не звучит, а разделяет.', 'мягкий знак', 'Он не звучит, а смягчает:',
  'На ы слова не начинаются. Ы есть в слове', 'Давай познакомимся! Напиши своё имя и придумай пароль.', 'Привет! Напиши своё имя и пароль.', 'Буквы похожи. Смотри внимательно!']);
for (let n = 1; n <= 20; n++) add(`Уровень ${n}.`);
add(D.ALPHABET.map((L) => letterPhrase(L)));
add(D.ITEMS.map((i) => `Держи наклейку: ${i.word}!`));
for (const s of D.SECTIONS) add(`Держи кубок за раздел ${s.title}!`, `Кубок за раздел ${s.title}!`, `Пройди все уровни в разделе ${s.title}, и получишь кубок!`);

const dir = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(dir, '..', '..', 'school-art', 'phrases.json');
fs.writeFileSync(file, JSON.stringify([...out].sort(), null, 1));
console.log(out.size, 'фраз →', file);
