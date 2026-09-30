// Виды заданий. Каждый вид — функция (opts) → { text, voice, build(stage, api) }:
// text — облачко совёнка, voice — что он говорит, build рисует задание и зовёт
// api.right(el) / api.wrong(el). Какие виды и с какими opts идут на каком уровне — levels.js.
import {
  ITEMS, COUNTABLE, SOUND_SAY, NUM, numWord, plural, isVowel, byWord,
  STORY_THINGS, STORY_HEROES, countPhrase, YES_NO, RIDDLES, SYL_CONS, SYL_VOW,
  ALPHABET, LETTER_SAY, letterWord, lettersWithPics, alike,
} from './data.js';
import { say, sfx } from './audio.js';

export const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export function h(tag, cls = '', html = '') { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
const img = (item, cls = 'pic') => { const i = h('img', cls); i.src = item.img; i.alt = item.word; i.draggable = false; return i; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sayS = (L) => SOUND_SAY[L.toUpperCase()] || L.toLowerCase();

// ---------- общие детали ----------
function numberOptions(ans, max = 10, n = 3) {
  const set = new Set([ans]);
  const near = shuffle([ans - 1, ans + 1, ans - 2, ans + 2, ans + 3, ans - 3]).filter((x) => x >= 0 && x <= max);
  for (const x of near) { if (set.size >= n) break; set.add(x); }
  return shuffle([...set]);
}
function others(pool, n, ok) { return shuffle(pool.filter(ok)).slice(0, n); }
// неверные картинки: не похожие ни на верную, ни друг на друга
function wrongPics(target, n, ok = () => true) {
  const res = [];
  for (const it of shuffle(ITEMS)) {
    if (res.length >= n) break;
    if (ok(it) && !alike(it, target) && !res.some((r) => alike(r, it))) res.push(it);
  }
  return res;
}

function answerButtons(options, isRight, api, label = (o) => o, speak = null) {
  const row = h('div', 'answers');
  options.forEach((o) => {
    const b = h('button', 'answer', `<span>${label(o)}</span>`);
    b.onclick = () => {
      if (b.disabled || api.locked()) return;
      if (speak) say(speak(o));
      if (isRight(o)) { b.classList.add('right'); api.right(b); }
      else { b.classList.add('wrong'); b.disabled = true; api.wrong(b); }
    };
    row.append(b);
  });
  return row;
}
function pictureButtons(items, target, api, speakWord = true) {
  const row = h('div', 'answers pics');
  items.forEach((it) => {
    const b = h('button', 'answer pic-btn');
    b.append(img(it));
    b.onclick = () => {
      if (b.disabled || api.locked()) return;
      if (speakWord || it === target) say(it.word);
      if (it === target) { b.classList.add('right'); api.right(b); }
      else { b.classList.add('wrong'); b.disabled = true; api.wrong(b); }
    };
    row.append(b);
  });
  return row;
}
function hero(item, small = false, hearText = null) {
  const card = h('div', 'hero' + (small ? ' small' : ''));
  card.append(img(item, 'pic hero-pic'));
  if (hearText) card.append(hearBtn(hearText));
  return card;
}
function hearBtn(parts, opts) {
  const b = h('button', 'hear', '🔊');
  b.onclick = () => { sfx.tap(); say(parts, opts); };
  return b;
}
// Кучка одинаковых предметов рядами по пять. Тап по предмету — «один, два…».
function pile(item, n, { tapCount = true, small = false } = {}) {
  const box = h('div', 'pile' + (n <= 5 && !small ? ' big' : '') + (small ? ' small' : ''));
  box.style.gridTemplateColumns = `repeat(${Math.min(n, 5)}, auto)`;
  let counted = 0;
  for (let i = 0; i < n; i++) {
    const cell = h('div', 'pile-cell');
    const p = img(item);
    p.style.animationDelay = `${i * 60}ms`;
    p.style.setProperty('--tilt', `${rnd(-8, 8)}deg`);
    cell.append(p);
    if (tapCount) cell.onclick = (e) => {
      e.stopPropagation();
      if (cell.classList.contains('counted')) return;
      counted++;
      cell.classList.add('counted');
      cell.append(h('b', 'count-badge', String(counted)));
      sfx.pop(); say(NUM[counted]);
    };
    box.append(cell);
  }
  return box;
}
const sylPlural = (n) => plural(n, ['слог', 'слога', 'слогов']);

// ======================= СЧИТАЕМ =======================
export const count = ({ max = 5 }) => {
  const n = rnd(1, max), item = pick(COUNTABLE);
  return {
    text: 'Сосчитай! Сколько здесь?', voice: ['Сосчитай!', 'Сколько здесь?', 'Нажимай на картинки, я помогу считать.'],
    build(stage, api) { stage.append(pile(item, n), answerButtons(numberOptions(n, max), (o) => o === n, api, String, (o) => NUM[o])); },
  };
};

export const findNum = ({ max = 7 }) => {
  const n = rnd(1, max);
  const opts = numberOptions(n, max).filter((x) => x > 0);
  while (opts.length < 3) { const x = rnd(1, max); if (!opts.includes(x)) opts.push(x); }
  const item = pick(COUNTABLE);
  return {
    text: `Где ${n}?`, voice: [`Найди картинку, где ${NUM[n]}.`],
    build(stage, api) {
      stage.append(h('div', 'big-letter num-card', String(n)));
      const row = h('div', 'answers piles');
      shuffle(opts).forEach((k) => {
        const b = h('button', 'answer pile-btn');
        b.append(pile(item, k, { tapCount: false, small: true }));
        b.onclick = () => {
          if (b.disabled || api.locked()) return;
          if (k === n) { say(NUM[n]); b.classList.add('right'); api.right(b); }
          else { b.classList.add('wrong'); b.disabled = true; api.wrong(b); }
        };
        row.append(b);
      });
      stage.append(row);
    },
  };
};

export const compare = ({ max = 7 }) => {
  const a = rnd(1, max);
  let b; do b = rnd(1, max); while (Math.abs(a - b) < 1);
  const more = Math.random() < 0.5;
  const item = pick(COUNTABLE);
  const target = more ? Math.max(a, b) : Math.min(a, b);
  return {
    text: more ? 'Где больше?' : 'Где меньше?', voice: [more ? 'Где больше?' : 'Где меньше?'],
    build(stage, api) {
      const row = h('div', 'answers piles two');
      [a, b].forEach((k) => {
        const btn = h('button', 'answer pile-btn');
        btn.append(pile(item, k, { tapCount: false, small: true }));
        btn.onclick = () => {
          if (btn.disabled || api.locked()) return;
          if (k === target) { btn.classList.add('right'); api.right(btn); }
          else { btn.classList.add('wrong'); btn.disabled = true; api.wrong(btn); }
        };
        row.append(btn);
      });
      stage.append(h('div', 'big-word', more ? 'БОЛЬШЕ?' : 'МЕНЬШЕ?'), row);
    },
  };
};

export const add = ({ max = 5, pics = true }) => {
  const sum = rnd(2, max), a = rnd(1, sum - 1), b = sum - a;
  const item = pick(COUNTABLE);
  return {
    text: `${a} + ${b} = ?`, voice: [`${NUM[a]} плюс ${NUM[b]}. Сколько будет?`],
    build(stage, api) {
      if (pics) {
        const row = h('div', 'equation');
        const g1 = h('div', 'group'); g1.append(pile(item, a), h('div', 'num', String(a)));
        const g2 = h('div', 'group'); g2.append(pile(item, b), h('div', 'num', String(b)));
        row.append(g1, h('div', 'op', '+'), g2, h('div', 'op', '='), h('div', 'op q', '?'));
        stage.append(row);
      } else stage.append(h('div', 'formula big', `<span>${a}</span><span class="op">+</span><span>${b}</span><span class="op">=</span><span class="q">?</span>`));
      stage.append(answerButtons(numberOptions(sum, max), (o) => o === sum, api, String, (o) => NUM[o]));
    },
  };
};

export const sub = ({ max = 5, pics = true }) => {
  const n = rnd(2, max), m = rnd(1, n - 1), rest = n - m;
  const item = pick(COUNTABLE);
  return {
    text: `${n} − ${m} = ?`,
    voice: pics ? [`Было ${NUM[n]}.`, 400, `Убрали ${NUM[m]}.`, 'Сколько осталось?'] : [`${NUM[n]} минус ${NUM[m]}. Сколько будет?`],
    build(stage, api) {
      const eq = h('div', 'formula' + (pics ? '' : ' big'), `<span>${n}</span><span class="op">−</span><span>${m}</span><span class="op">=</span><span class="q">?</span>`);
      const answers = answerButtons(numberOptions(rest, max), (o) => o === rest, api, String, (o) => NUM[o]);
      if (!pics) { stage.append(eq, answers); return; }
      const p = pile(item, n, { tapCount: false });
      answers.classList.add('hidden');
      stage.append(p, eq, answers);
      setTimeout(() => {
        sfx.whoosh();
        [...p.children].slice(-m).forEach((c, i) => setTimeout(() => c.classList.add('gone'), i * 120));
        setTimeout(() => answers.classList.remove('hidden'), 700 + m * 120);
      }, 1800);
    },
  };
};

export const missing = ({ max = 10 }) => {
  const len = 5, s = rnd(0, max - len + 1), hole = rnd(1, len - 2), ans = s + hole;
  return {
    text: 'Какое число пропущено?', voice: ['Какое число пропущено?'],
    build(stage, api) {
      const line = h('div', 'numline');
      for (let i = 0; i < len; i++) line.append(h('div', 'nl' + (i === hole ? ' q' : ''), i === hole ? '?' : String(s + i)));
      const hear = hearBtn(Array.from({ length: len }, (_, i) => (i === hole ? 900 : NUM[s + i])));
      stage.append(line, hear, answerButtons(numberOptions(ans, max), (o) => o === ans, api, String, (o) => NUM[o]));
    },
  };
};

export const story = ({ max = 5, ops = ['+', '-'] }) => {
  const op = pick(ops), t = pick(STORY_THINGS), hr = pick(STORY_HEROES);
  let a, b, ans;
  if (op === '+') { ans = rnd(2, max); a = rnd(1, ans - 1); b = ans - a; }
  else { a = rnd(2, max); b = rnd(1, a - 1); ans = a - b; }
  const him = hr.he === 'она' ? 'Ей' : 'Ему';
  const lines = op === '+'
    ? [`У ${hr.who} ${countPhrase(a, t)}.`, `${him} дали ещё ${countPhrase(b, t, true)}.`, 'Сколько стало?']
    : [`У ${hr.who} ${countPhrase(a, t)}.`, `${countPhrase(b, t, true)[0].toUpperCase() + countPhrase(b, t, true).slice(1)} ${hr.he} подарил${hr.he === 'она' ? 'а' : ''} друзьям.`, 'Сколько осталось?'];
  return {
    text: lines.join(' '), voice: [lines[0], 300, lines[1], 300, lines[2]],
    build(stage, api) {
      const top = h('div', 'story');
      top.append(img(hr.item, 'pic story-hero'));
      const piles = h('div', 'story-piles');
      if (op === '+') {
        const p2 = pile(t.item, b, { tapCount: false, small: true }); p2.classList.add('gift');
        piles.append(pile(t.item, a, { tapCount: false, small: true }), h('div', 'op', '+'), p2);
      } else {
        const p = pile(t.item, a, { tapCount: false, small: true });
        piles.append(p);
        setTimeout(() => { [...p.children].slice(-b).forEach((c) => c.classList.add('gone')); sfx.whoosh(); }, 2500);
      }
      top.append(piles);
      stage.append(top, hearBtn([lines[0], 300, lines[1], 300, lines[2]]),
        answerButtons(numberOptions(ans, max), (o) => o === ans, api, String, (o) => NUM[o]));
    },
  };
};

export const signs = ({ max = 10 }) => {
  const a = rnd(1, max), b = Math.random() < 0.2 ? a : rnd(1, max);
  const ans = a > b ? '>' : a < b ? '<' : '=';
  const name = { '>': 'больше', '<': 'меньше', '=': 'равно' };
  return {
    text: 'Какой знак поставить?', voice: ['Какой знак поставить: больше, меньше или равно?'],
    build(stage, api) {
      const row = h('div', 'formula big', `<span>${a}</span><span class="q">?</span><span>${b}</span>`);
      const dots = h('div', 'dots-row');
      [a, b].forEach((k) => dots.append(h('div', 'dots', '●'.repeat(k))));
      stage.append(row, dots, answerButtons(['>', '<', '='], (o) => o === ans, api, (o) => o, (o) => name[o]));
    },
  };
};

// ======================= ЗВУКИ =======================
const withFirst = ITEMS.filter((i) => i.first);
const withLast = ITEMS.filter((i) => i.last);

export const firstSound = ({ vowels = false }) => {
  const pool = vowels ? withFirst.filter((i) => 'АОУИЭЫ'.includes(i.first)) : withFirst;
  const item = pick(pool);
  const letters = [...new Set(pool.map((i) => i.first))].filter((l) => l !== item.first);
  return {
    text: 'Какой первый звук в слове?', voice: [`Какой первый звук в слове ${item.word}?`],
    build(stage, api) {
      const row = answerButtons(shuffle([item.first, ...shuffle(letters).slice(0, 2)]), (o) => o === item.first, api, (o) => o, sayS);
      row.classList.add('letters');
      stage.append(hero(item, false, [item.word, 300, item.word]), row);
    },
  };
};

export const findSound = ({ at = 'first' }) => {
  const pool = at === 'first' ? withFirst : withLast;
  const target = pick(pool), L = target[at];
  const wrong = wrongPics(target, 2, (i) => i[at] && i[at] !== L);
  const where = at === 'first' ? 'начинается на звук' : 'заканчивается на звук';
  return {
    text: `Найди: ${at === 'first' ? 'начинается' : 'заканчивается'} на «${L}»`, voice: [`Найди картинку, которая ${where} ${sayS(L)}.`],
    build(stage, api) {
      const big = h('button', 'big-letter', L);
      big.onclick = () => { sfx.tap(); say(sayS(L)); };
      stage.append(big, pictureButtons(shuffle([target, ...wrong]), target, api));
    },
  };
};

export const lastSound = () => {
  const item = pick(withLast);
  const letters = [...new Set(withLast.map((i) => i.last))].filter((l) => l !== item.last);
  return {
    text: 'Какой последний звук в слове?', voice: [`Какой последний звук в слове ${item.word}?`],
    build(stage, api) {
      const row = answerButtons(shuffle([item.last, ...shuffle(letters).slice(0, 2)]), (o) => o === item.last, api, (o) => o, sayS);
      row.classList.add('letters');
      stage.append(hero(item, false, [item.word, 300, item.word]), row);
    },
  };
};

export const vowelCons = () => {
  const L = Math.random() < 0.5 ? pick('АОУЫИЭ'.split('')) : pick('БВГДЖЗКЛМНПРСТФХШ'.split(''));
  const v = isVowel(L);
  return {
    text: 'Гласный или согласный?', voice: [`Послушай звук: ${sayS(L)}. Он гласный или согласный?`],
    build(stage, api) {
      const big = h('button', 'big-letter', L);
      big.onclick = () => { sfx.tap(); say(sayS(L)); };
      const row = answerButtons(['v', 'c'], (o) => (o === 'v') === v, api,
        (o) => o === 'v' ? '<i class="mark vowel"></i>гласный' : '<i class="mark cons"></i>согласный',
        (o) => o === 'v' ? 'гласный' : 'согласный');
      row.classList.add('wide');
      stage.append(big, row, h('p', 'hint', 'Гласный можно петь: а-а-а. Согласному мешают губы и язык.'));
    },
  };
};

export const soundPlace = () => {
  // берём согласный, который встречается в слове один раз и звучит так, как пишется:
  // без оглушения (лодка → [т]), озвончения (сделать → [з]) и непроизносимых (солнце).
  const VOICED = 'БВГДЖЗ', DEAF = 'ПФКТШСХЦЧЩ';
  const cands = [];
  for (const it of ITEMS) {
    if (it.word === 'солнце') continue;
    const w = it.word.toUpperCase();
    [...w].forEach((ch, i) => {
      if (!SOUND_SAY[ch] || isVowel(ch) || w.indexOf(ch) !== w.lastIndexOf(ch)) return;
      const nx = w[i + 1] || '';
      const end = i === w.length - 1 || (nx === 'Ь' && i + 1 === w.length - 1);
      if (VOICED.includes(ch) && (end || DEAF.includes(nx))) return;
      if (DEAF.includes(ch) && 'БГДЖЗ'.includes(nx) && nx) return;
      cands.push({ it, ch, pos: i === 0 ? 0 : end ? 2 : 1 });
    });
  }
  const pos = rnd(0, 2);
  const { it, ch } = pick(cands.filter((c) => c.pos === pos));
  const names = ['в начале', 'в середине', 'в конце'];
  return {
    text: `Где звук «${ch}» в слове?`, voice: [`Где звук ${sayS(ch)} в слове ${it.word}?`, 'В начале, в середине или в конце?'],
    build(stage, api) {
      const row = answerButtons([0, 1, 2], (o) => o === pos, api,
        (o) => `<span class="scheme">${[0, 1, 2].map((k) => `<i class="${k === o ? 'on' : ''}"></i>`).join('')}</span><small>${names[o]}</small>`,
        (o) => names[o]);
      row.classList.add('wide');
      stage.append(hero(it, false, [it.word, 300, sayS(ch)]), row);
    },
  };
};

export const softHard = () => {
  const item = pick(ITEMS.filter((i) => i.soft !== null));
  return {
    text: 'Первый звук твёрдый или мягкий?', voice: [`Первый звук в слове ${item.word} — твёрдый или мягкий?`],
    build(stage, api) {
      const row = answerButtons([false, true], (o) => o === item.soft, api,
        (o) => o ? '<i class="mark soft"></i>мягкий' : '<i class="mark hard"></i>твёрдый',
        (o) => o ? 'мягкий' : 'твёрдый');
      row.classList.add('wide');
      stage.append(hero(item, false, [item.word, 300, item.word]), row,
        h('p', 'hint', 'Твёрдый — синий: «кот». Мягкий — зелёный: «кит».'));
    },
  };
};

export const countSounds = () => {
  const item = pick(ITEMS.filter((i) => i.sounds));
  const n = item.sounds;
  return {
    text: 'Сколько звуков в слове?', voice: [`Сколько звуков в слове ${item.word}?`, 'Произнеси его медленно.'],
    build(stage, api) {
      const slow = [...item.word].map(sayS).flatMap((s) => [s, 200]);
      stage.append(hero(item, false, [...slow, item.word]),
        answerButtons([2, 3, 4, 5], (o) => o === n, api, String, (o) => NUM[o]));
    },
  };
};

// ======================= СЛОГИ =======================
export const clap = ({ min = 1, max = 4 }) => {
  const item = pick(ITEMS.filter((i) => i.syl.length >= min && i.syl.length <= max));
  const n = item.syl.length;
  return {
    text: 'Сколько слогов? Похлопай!', voice: [`Сколько слогов в слове ${item.word}?`, 'Нажми на ладошки, похлопаем вместе!'],
    build(stage, api) {
      const card = hero(item);
      const dots = h('div', 'syl-dots');
      const btn = h('button', 'clap-btn', '👏');
      let busy = false;
      btn.onclick = async () => {
        if (busy) return; busy = true;
        dots.innerHTML = '';
        for (const s of item.syl) {
          dots.append(h('span', 'syl-dot', s.toUpperCase()));
          btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
          sfx.clap();
          await say(s, { rate: 0.75 });
          await wait(250);
        }
        busy = false;
      };
      card.append(btn);
      stage.append(card, dots, answerButtons([1, 2, 3, 4], (o) => o === n, api,
        (o) => `${o}<small>${'👏'.repeat(o)}</small>`, (o) => NUM[o]));
    },
  };
};

export const train = ({ min = 2, max = 3 }) => {
  const item = pick(ITEMS.filter((i) => i.syl.length >= min && i.syl.length <= max));
  return {
    text: 'Собери слово из слогов!', voice: [`Собери слово ${item.word}.`, 'Посади слоги в вагончики по порядку.'],
    build(stage, api) {
      const tr = h('div', 'train');
      tr.append(h('div', 'loco', '<div class="chimney"></div><div class="cab"></div><div class="wheel w1"></div><div class="wheel w2"></div>'));
      const cars = item.syl.map(() => { const c = h('div', 'car', '<div class="slot"></div><div class="wheel w1"></div><div class="wheel w2"></div>'); tr.prepend(c); return c; });
      cars.reverse(); // вагоны слева направо, паровоз справа — читаем слева направо
      const track = h('div', 'track'); track.append(tr);
      const tiles = h('div', 'tiles');
      let next = 0;
      shuffle(item.syl).forEach((s) => {
        const t = h('button', 'tile', s.toUpperCase());
        t.onclick = async () => {
          if (t.disabled || api.locked()) return;
          if (s === item.syl[next]) {
            t.disabled = true; t.classList.add('used');
            cars[next].querySelector('.slot').textContent = s.toUpperCase();
            cars[next].classList.add('filled');
            sfx.pop(); say(s, { rate: 0.8 });
            next++;
            if (next === item.syl.length) {
              api.hold();
              await wait(700);
              await say(item.word);
              sfx.choo();
              tr.classList.add('go');
              api.right(null, 1600);
            }
          } else api.wrong(t);
        };
        tiles.append(t);
      });
      stage.append(hero(item, true), track, tiles);
    },
  };
};

export const firstSyl = () => {
  const item = pick(ITEMS.filter((i) => i.syl.length >= 2));
  const s0 = item.syl[0];
  const opts = [s0, ...shuffle([...new Set(ITEMS.map((i) => i.syl[0]))].filter((s) => s !== s0 && s[0] !== s0[0])).slice(0, 2)];
  return {
    text: 'С какого слога начинается слово?', voice: [`С какого слога начинается слово ${item.word}?`],
    build(stage, api) {
      const row = answerButtons(shuffle(opts), (o) => o === s0, api, (o) => o.toUpperCase(), (o) => o);
      row.classList.add('syls');
      stage.append(hero(item, false, item.syl.flatMap((s) => [s, 250])), row);
    },
  };
};

export const missingSyl = ({ n = 3 }) => {
  const item = pick(ITEMS.filter((i) => i.syl.length >= 2));
  const k = rnd(0, item.syl.length - 1), ans = item.syl[k];
  const pool = [...new Set(ITEMS.flatMap((i) => i.syl))].filter((s) => s !== ans && !item.syl.includes(s));
  return {
    text: 'Какого слога не хватает?', voice: [`Какого слога не хватает в слове ${item.word}?`],
    build(stage, api) {
      const w = h('div', 'read-word');
      item.syl.forEach((s, i) => w.append(h('span', i === k ? 'gap' : `s${i % 2}`, i === k ? '?' : s.toUpperCase())));
      const row = answerButtons(shuffle([ans, ...shuffle(pool).slice(0, n - 1)]), (o) => o === ans, api, (o) => o.toUpperCase(), (o) => o);
      row.classList.add('syls');
      stage.append(hero(item, true), w, row);
    },
  };
};

export const findBySyl = () => {
  const n = rnd(1, 3);
  const target = pick(ITEMS.filter((i) => i.syl.length === n));
  const ns = shuffle([1, 2, 3, 4].filter((x) => x !== n)).slice(0, 2);
  const wrong = ns.map((k) => pick(ITEMS.filter((i) => i.syl.length === k && !alike(i, target))));
  return {
    text: `Найди слово: ${n} ${sylPlural(n)}`, voice: [`Найди слово, в котором ${numWord(n)} ${sylPlural(n)}.`, 'Похлопай каждое слово.'],
    build(stage, api) {
      stage.append(h('div', 'big-letter', `${n}<small>${'👏'.repeat(n)}</small>`), pictureButtons(shuffle([target, ...wrong]), target, api));
    },
  };
};

// ======================= ЧИТАЕМ =======================
const sylWord = (item) => `<div class="read-word">${item.syl.map((s, i) => `<span class="s${i % 2}">${s.toUpperCase()}</span>`).join('')}</div>`;

export const sylRead = () => {
  const c = pick(SYL_CONS), v = pick(SYL_VOW), s = c + v;
  const set = new Set([s]);
  while (set.size < 3) set.add(Math.random() < 0.5 ? c + pick(SYL_VOW) : pick(SYL_CONS) + v);
  return {
    text: 'Найди слог, который я скажу', voice: [`Найди слог ${s.toLowerCase()}.`],
    build(stage, api) {
      const row = answerButtons(shuffle([...set]), (o) => o === s, api, (o) => o, (o) => o.toLowerCase());
      row.classList.add('syls');
      stage.append(hearBtn([`Найди слог ${s.toLowerCase()}.`]), row);
    },
  };
};

export const read = ({ maxLen = 99, minSyl = 1, maxSyl = 9 }) => {
  const item = pick(ITEMS.filter((i) => i.word.length <= maxLen && i.syl.length >= minSyl && i.syl.length <= maxSyl));
  const wrong = wrongPics(item, 2, (i) => i.word[0] !== item.word[0]);
  return {
    text: 'Прочитай слово и найди картинку', voice: ['Прочитай слово и найди картинку.'],
    build(stage, api) {
      const w = h('div', 'read-box', sylWord(item));
      w.append(hearBtn([...item.syl.flatMap((s) => [s, 250]), item.word], { rate: 0.8 }));
      stage.append(w, pictureButtons(shuffle([item, ...wrong]), item, api, false));
    },
  };
};

export const letters = ({ min = 3, max = 3 }) => {
  const item = pick(ITEMS.filter((i) => i.word.length >= min && i.word.length <= max && !/[ьъ]/.test(i.word)));
  const ls = item.word.toUpperCase().split('');
  const extra = shuffle('АОУИЫМСЛКТРН'.split('').filter((l) => !ls.includes(l))).slice(0, 2);
  return {
    text: 'Собери слово из букв!', voice: [`Собери слово ${item.word} из букв.`],
    build(stage, api) {
      const slots = h('div', 'slots');
      const cells = ls.map(() => { const s = h('div', 'slot-letter'); slots.append(s); return s; });
      let next = 0;
      const tiles = h('div', 'tiles');
      shuffle([...ls, ...extra]).forEach((L) => {
        const t = h('button', 'tile letter', L);
        t.onclick = async () => {
          if (t.disabled || api.locked()) return;
          if (L === ls[next]) {
            t.disabled = true; t.classList.add('used');
            cells[next].textContent = L; cells[next].classList.add('filled');
            sfx.pop(); say(sayS(L));
            next++;
            if (next === ls.length) { api.hold(); await wait(600); await say(item.word); api.right(slots); }
          } else api.wrong(t);
        };
        tiles.append(t);
      });
      stage.append(hero(item, true, item.word), slots, tiles);
    },
  };
};

export const pickWord = () => {
  const item = pick(ITEMS.filter((i) => i.word.length <= 6));
  const w = item.word;
  const score = (o) => (o.word.length === w.length ? 2 : 0) + (o.word[0] === w[0] ? 2 : 0) + [...o.word].filter((ch) => w.includes(ch)).length / 2;
  const similar = ITEMS.filter((o) => !alike(o, item)).sort((a, b) => score(b) - score(a)).slice(0, 5);
  const opts = shuffle([item, ...shuffle(similar).slice(0, 2)]);
  return {
    text: 'Какое слово подходит к картинке?', voice: ['Прочитай слова.', 'Какое подходит к картинке?'],
    build(stage, api) {
      const row = answerButtons(opts, (o) => o === item, api, (o) => o.word.toUpperCase(), (o) => o.word);
      row.classList.add('words');
      stage.append(hero(item), row);
    },
  };
};

export const missLetter = () => {
  const words = new Set(ITEMS.map((i) => i.word));
  // пропускаем только ударную гласную: безударную «о» в «сова» ребёнок слышит как «а»
  const cands = ITEMS.filter((i) => i.word.length >= 3 && i.word.length <= 6 && 'аоуыи'.includes(i.word[i.stress]));
  const item = pick(cands);
  const k = item.stress, ans = item.word[k].toUpperCase();
  // не даём буквы, которые тоже образуют слово из нашего списка (к_т → кот и кит)
  const ok = 'АОУЫИ'.split('').filter((L) => L !== ans && !words.has(item.word.slice(0, k) + L.toLowerCase() + item.word.slice(k + 1)));
  return {
    text: 'Какой буквы не хватает?', voice: [`Какой буквы не хватает в слове ${item.word}?`],
    build(stage, api) {
      const w = h('div', 'read-word');
      [...item.word.toUpperCase()].forEach((ch, i) => w.append(h('span', i === k ? 'gap' : 's0 plain', i === k ? '?' : ch)));
      const row = answerButtons(shuffle([ans, ...shuffle(ok).slice(0, 2)]), (o) => o === ans, api, (o) => o, sayS);
      row.classList.add('letters');
      stage.append(hero(item, true, item.word), w, row);
    },
  };
};

export const yesNo = () => {
  const q = pick(YES_NO);
  return {
    text: 'Прочитай вопрос и ответь', voice: ['Прочитай вопрос и ответь: да или нет?'],
    build(stage, api) {
      const box = h('div', 'read-box');
      box.append(h('div', 'sentence', q.q), hearBtn(q.q.toLowerCase(), { rate: 0.85 }));
      const row = answerButtons([true, false], (o) => o === q.a, api,
        (o) => o ? '👍 ДА' : '👎 НЕТ', (o) => o ? 'да' : 'нет');
      row.classList.add('wide');
      stage.append(hero(q.item, true), box, row);
    },
  };
};

export const riddle = () => {
  const r = pick(RIDDLES);
  const wrong = wrongPics(r.item, 2, (i) => !r.not.includes(i.word));
  return {
    text: 'Прочитай загадку и найди ответ', voice: ['Прочитай загадку и найди ответ.'],
    build(stage, api) {
      const box = h('div', 'read-box');
      box.append(h('div', 'sentence', r.q), hearBtn(r.q.toLowerCase(), { rate: 0.85 }));
      stage.append(box, pictureButtons(shuffle([r.item, ...wrong]), r.item, api));
    },
  };
};

// ======================= АЗБУКА =======================
const sayL = (L) => LETTER_SAY[L] || L.toLowerCase();
function letterOptions(L, set, n = 3) {
  const pool = shuffle(set.filter((x) => x !== L));
  const extra = shuffle(ALPHABET.filter((x) => x !== L && !pool.includes(x)));
  return shuffle([L, ...[...pool, ...extra].slice(0, n - 1)]);
}

// «Найди букву мэ.», но «Найди мягкий знак.» — знаки буквой не называем
const findPhrase = (L) => ('ЬЪ'.includes(L) ? `Найди ${sayL(L)}.` : `Найди букву ${sayL(L)}.`);
// target — урок одной буквы: задание всегда про неё
export const findLetter = ({ set = ALPHABET, target = null }) => {
  const L = target || pick(set);
  return {
    text: 'ЬЪ'.includes(L) ? 'Найди знак' : 'Найди букву', voice: [findPhrase(L)],
    build(stage, api) {
      const row = answerButtons(letterOptions(L, set), (o) => o === L, api, (o) => o, sayL);
      row.classList.add('letters');
      stage.append(hearBtn([findPhrase(L)]), row);
    },
  };
};

export const letterToPic = ({ set = ALPHABET, target: only = null }) => {
  const L = only || pick(lettersWithPics(set));
  const target = pick(ITEMS.filter((i) => i.letter === L));
  const wrong = wrongPics(target, 2, (i) => i.letter !== L);
  return {
    text: `Что начинается на букву «${L}»?`, voice: [`Найди картинку на букву ${sayL(L)}.`],
    build(stage, api) {
      const big = h('button', 'big-letter abc', L);
      big.onclick = () => { sfx.tap(); say(sayL(L)); };
      stage.append(big, pictureButtons(shuffle([target, ...wrong]), target, api));
    },
  };
};

export const picToLetter = ({ set = ALPHABET, target = null }) => {
  const item = pick(ITEMS.filter((i) => (target ? i.letter === target : set.includes(i.letter))));
  if (target && !set.includes(target)) set = [target, ...set];
  return {
    text: 'С какой буквы начинается слово?', voice: [`С какой буквы начинается слово ${item.word}?`],
    build(stage, api) {
      const row = answerButtons(letterOptions(item.letter, set), (o) => o === item.letter, api, (o) => o, sayL);
      row.classList.add('letters');
      stage.append(hero(item, false, [item.word, 300, item.word]), row);
    },
  };
};

const LOOKALIKE = [['Ш', 'Щ', 'Ц'], ['Е', 'Ё', 'Э'], ['И', 'Й', 'Н'], ['Ь', 'Ъ', 'Ы'], ['О', 'С', 'Э'], ['П', 'Н', 'Л'], ['З', 'Э', 'В'], ['Б', 'В', 'Р'], ['Ж', 'К', 'Х'], ['Т', 'Г', 'Р'], ['Ч', 'У', 'Ц'], ['Ю', 'О', 'Я']];
export const similarLetters = ({ target = null } = {}) => {
  const groups = target ? LOOKALIKE.filter((g) => g.includes(target)) : LOOKALIKE;
  const g = groups.length ? pick(groups) : [target, ...shuffle(ALPHABET.filter((x) => x !== target)).slice(0, 2)];
  const L = target || pick(g);
  return {
    text: 'Буквы похожи! Найди нужную', voice: ['Буквы похожи. Смотри внимательно!', findPhrase(L)],
    build(stage, api) {
      const row = answerButtons(shuffle(g), (o) => o === L, api, (o) => o, sayL);
      row.classList.add('letters');
      stage.append(hearBtn([findPhrase(L)]), row);
    },
  };
};

export const lowerCase = ({ target = null } = {}) => {
  const L = target || pick(ALPHABET.filter((x) => !'ЪЬЫ'.includes(x)));
  const opts = letterOptions(L, ALPHABET).map((x) => x.toLowerCase());
  return {
    text: 'Найди такую же маленькую букву', voice: [`Это большая буква ${sayL(L)}.`, 'Найди такую же, только маленькую.'],
    build(stage, api) {
      const big = h('button', 'big-letter abc', L);
      big.onclick = () => { sfx.tap(); say(sayL(L)); };
      const row = answerButtons(opts, (o) => o === L.toLowerCase(), api, (o) => o, (o) => sayL(o.toUpperCase()));
      row.classList.add('letters', 'lower');
      stage.append(big, row);
    },
  };
};

// Найди букву в слове: слово из плиток, нажать на каждое место, где стоит буква.
export const letterInWord = ({ target = null, set = ALPHABET } = {}) => {
  const L = target || pick(set.filter((x) => ITEMS.some((i) => i.word.toUpperCase().includes(x))));
  const pool = ITEMS.filter((i) => i.word.toUpperCase().includes(L) && i.word.length <= 8);
  const item = pick(pool.filter((i) => i.letter !== L).length && Math.random() < 0.6 ? pool.filter((i) => i.letter !== L) : pool);
  const word = item.word.toUpperCase();
  const count = [...word].filter((c) => c === L).length;
  const name = 'ЬЪ'.includes(L) ? sayL(L) : `букву ${sayL(L)}`;
  const phrase = count > 1 ? `Найди все буквы ${sayL(L)} в слове ${item.word}. Их ${numWord(count, 'f')}.` : `Найди ${name} в слове ${item.word}.`;
  return {
    text: count > 1 ? `Найди все «${L}» в слове` : `Найди «${L}» в слове`, voice: [phrase],
    build(stage, api) {
      let found = 0;
      const row = h('div', 'word-tiles');
      [...word].forEach((ch) => {
        const t = h('button', 'tile letter', ch);
        t.onclick = () => {
          if (t.disabled || api.locked()) return;
          if (ch === L) {
            t.disabled = true; t.classList.add('found');
            sfx.pop(); found++;
            if (found === count) { api.hold(); say(item.word); api.right(row, 900); }
          } else api.wrong(t);
        };
        row.append(t);
      });
      stage.append(hero(item, true, [phrase]), h('div', 'big-letter abc small', L), row);
    },
  };
};

export const abcGap = () => {
  const len = 5, s = rnd(0, ALPHABET.length - len), hole = rnd(1, len - 2), ans = ALPHABET[s + hole];
  return {
    text: 'Какая буква пропущена?', voice: ['Какая буква потерялась?'],
    build(stage, api) {
      const line = h('div', 'numline');
      for (let i = 0; i < len; i++) line.append(h('div', 'nl' + (i === hole ? ' q' : ''), i === hole ? '?' : ALPHABET[s + i]));
      const row = answerButtons(letterOptions(ans, ALPHABET.slice(Math.max(0, s - 2), s + len + 2)), (o) => o === ans, api, (o) => o, sayL);
      row.classList.add('letters');
      stage.append(line, row);
    },
  };
};

export const abcTrain = () => {
  const len = 4, s = rnd(0, ALPHABET.length - len), part = ALPHABET.slice(s, s + len);
  return {
    text: 'Поставь буквы по алфавиту!', voice: ['Поставь буквы по порядку, как в азбуке.', `Начни с буквы ${sayL(part[0])}.`],
    build(stage, api) {
      const slots = h('div', 'slots');
      const cells = part.map(() => { const c = h('div', 'slot-letter'); slots.append(c); return c; });
      let next = 0;
      const tiles = h('div', 'tiles');
      shuffle(part).forEach((L) => {
        const t = h('button', 'tile letter', L);
        t.onclick = () => {
          if (t.disabled || api.locked()) return;
          if (L === part[next]) {
            t.disabled = true; t.classList.add('used');
            cells[next].textContent = L; cells[next].classList.add('filled');
            sfx.pop(); say(sayL(L));
            next++;
            if (next === len) { api.hold(); setTimeout(() => api.right(slots), 500); }
          } else api.wrong(t);
        };
        tiles.append(t);
      });
      stage.append(slots, tiles);
    },
  };
};

// ======================= СОБЕРИ СЛОВО =======================
// Картинка + 5–6 букв: нажимать буквы по порядку. hint — бледные буквы в окошках,
// ear — картинки не видно, слово только звучит; soft — слова с Ь и Й.
export const buildWord = ({ min = 3, max = 3, extra = 2, hint = false, ear = false, soft = false }) => {
  const pool = ITEMS.filter((i) => i.word.length >= min && i.word.length <= max && (soft ? /[ьй]/.test(i.word) : !/[ьъй]/.test(i.word)));
  const item = pick(pool);
  const ls = item.word.toUpperCase().split('');
  // всего букв на выбор — не больше шести (длинные слова — без лишних)
  const extras = shuffle('АОУИЫЭМСЛКТРНПВДБЗГШ'.split('').filter((l) => !ls.includes(l))).slice(0, Math.min(extra, Math.max(0, 6 - ls.length)));
  const voice = ear ? [`Послушай слово: ${item.word}.`, 'Собери его из букв.'] : [`Собери слово ${item.word}.`, 'Нажимай буквы по порядку.'];
  return {
    text: ear ? 'Послушай и собери слово!' : 'Собери слово из букв!', voice,
    build(stage, api) {
      const card = ear ? h('div', 'hero small') : hero(item, true, item.word);
      let pic = null;
      if (ear) {
        pic = h('div', 'mystery', '?');
        card.append(pic, hearBtn(item.word));
      }
      const slots = h('div', 'slots');
      const cells = ls.map((L) => { const c = h('div', 'slot-letter' + (hint ? ' ghost' : '')); if (hint) c.dataset.hint = L; slots.append(c); return c; });
      if (ls.length > 6) slots.classList.add('long');
      let next = 0;
      const tiles = h('div', 'tiles');
      shuffle([...ls, ...extras]).forEach((L) => {
        const t = h('button', 'tile letter', L);
        t.onclick = async () => {
          if (t.disabled || api.locked()) return;
          if (L === ls[next]) {
            t.disabled = true; t.classList.add('used');
            cells[next].textContent = L; cells[next].classList.add('filled');
            sfx.pop(); say(sayL(L));
            next++;
            if (next === ls.length) {
              api.hold();
              if (pic) { pic.replaceWith(img(item, 'pic hero-pic')); }
              await wait(600); await say(item.word); api.right(slots);
            }
          } else api.wrong(t);
        };
        tiles.append(t);
      });
      stage.append(card, slots, tiles);
    },
  };
};

// что совёнок говорит про букву: одной фразой, с примером слова
export function letterPhrase(L, it = letterWord(L)) {
  if (L === 'Ъ') return 'Это твёрдый знак. Он не звучит, а разделяет звуки.';
  if (L === 'Ь') return 'Это мягкий знак. Он не звучит, а смягчает, как в слове конь.';
  if (L === 'Ы') return 'Это буква ы. На ы слова не начинаются, но она есть в слове сыр.';
  const n = sayL(L);
  return it ? `Это буква ${n}. ${n[0].toUpperCase() + n.slice(1)} — ${it.word}.` : `Это буква ${n}.`;
}
// Как совёнок произносит название уровня: буквы — по-детски и так, чтобы голос не спутал
// («Буквы А О У» → «Буквы «а», «о-о», «у-у»»), знаки и числа — словами.
const SAY_TITLE = { 'Знаки > < =': 'Знаки: больше, меньше, равно.', 'Слова с Ь и Й': 'Слова с мягким знаком и буквой и краткое.' };
export function titleSpeech(title) {
  if (SAY_TITLE[title]) return SAY_TITLE[title];
  const vow = { О: '«о-о»', У: '«у-у»', Э: '«э-э»', Ы: '«ы» — как в слове сыр' };
  const name = (L) => (isVowel(L) ? vow[L] || `«${L.toLowerCase()}»` : 'ЙЬЪ'.includes(L) ? sayL(L) : `«${sayL(L)}»`); // в кавычках голос не сливает букву со словом
  let t = title.replace(/(\d+) слога/, (_, n) => `${NUM[+n]} слога`);
  const words = t.split(' ');
  const out = []; let letters = [];
  const flush = () => { if (letters.length) { out.push(letters.map(name).join(', ')); letters = []; } };
  for (const w of words) {
    const m = w.match(/^([А-ЯЁ])(:?)$/);
    if (m) { letters.push(m[1]); if (m[2]) { flush(); out[out.length - 1] += ':'; } } else { flush(); out.push(w); }
  }
  flush();
  t = out.join(' ');
  if (/^[«а-яё]/.test(t) && /^([А-ЯЁ]):? /.test(title)) t = 'Буква ' + t; // «А: закрепляем» → «Буква «а»: закрепляем»
  return /[.!?]$/.test(t) ? t : t + '.';
}

export { byWord, sayL, letterWord };
