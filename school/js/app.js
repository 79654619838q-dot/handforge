// «Школа Умки» — экраны: заставка → меню → карта уровней раздела → уровень (8 заданий) → награда; альбом.
import { ITEMS, SECTIONS, PRAISE, TRY_AGAIN, ALPHABET } from './data.js';
import { h, pick, shuffle, sayL, letterWord } from './games.js';
import { LEVELS, TASKS_PER_LEVEL, starsFor } from './levels.js';
import { say, hush, sfx, startAudio, setMusic, isMusicOn } from './audio.js';
import { account, signIn, signOut, pull, schedulePush } from './account.js';

const app = document.getElementById('app');
const store = {
  get(k, d) { try { const v = localStorage.getItem('school.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('school.' + k, JSON.stringify(v)); } catch {} schedulePush(); },
};
// Прогресс: по разделу — массив звёзд за уровни (0 — не пройден).
const prog = (id) => { const p = store.get('prog.' + id, []); return LEVELS[id].map((_, i) => p[i] || 0); };
const unlocked = (id, i) => i === 0 || prog(id)[i - 1] > 0;
const sectionDone = (id) => prog(id).every((s) => s > 0);

// ---------- совёнок ----------
const owl = h('div', 'owl');
const owlImg = h('img'); owlImg.alt = 'Умка'; owlImg.draggable = false;
const bubble = h('div', 'bubble');
owl.append(owlImg, bubble); // облачко поверх совёнка — крыло не закрывает текст
let owlVoice = null;
owlImg.onclick = () => { sfx.tap(); owlPose('hello'); if (owlVoice) say(owlVoice); };
function owlPose(p) { owlImg.src = `assets/owl/${p}.webp`; owlImg.classList.remove('hop'); void owlImg.offsetWidth; owlImg.classList.add('hop'); }
function owlSay(text, voice = text, pose) {
  bubble.textContent = text;
  bubble.classList.toggle('show', !!text);
  if (pose) owlPose(pose);
  if (voice) { owlVoice = voice; return say(voice); }
  return Promise.resolve();
}

// ---------- общие части экрана ----------
function setBg(src) { document.body.style.setProperty('--bg', `url("${src}")`); }
function topBar({ back = null, title = '', color = '' } = {}) {
  const bar = h('div', 'topbar');
  if (back) {
    const b = h('button', 'round-btn', back === menu ? '🏠' : '🗺️');
    b.title = back === menu ? 'В меню' : 'К карте';
    b.onclick = () => { sfx.tap(); back(); };
    bar.append(b);
  } else bar.append(h('div', 'spacer'));
  const t = h('div', 'title', title);
  if (color) t.style.setProperty('--c', color);
  bar.append(t);
  const right = h('div', 'bar-right');
  right.append(h('div', 'stars-total', `⭐ <b>${store.get('stars', 0)}</b>`));
  const m = h('button', 'round-btn', isMusicOn() ? '🎵' : '🔇');
  m.title = 'Музыка';
  m.onclick = () => { setMusic(!isMusicOn()); m.textContent = isMusicOn() ? '🎵' : '🔇'; sfx.tap(); };
  right.append(m);
  bar.append(right);
  return bar;
}
function screen(cls) { hush(); app.innerHTML = ''; const s = h('div', 'screen ' + cls); app.append(s); app.append(owl); return s; }

function confetti(n = 60) {
  const box = h('div', 'confetti');
  const colors = ['#ff5a5f', '#ffc93c', '#3ec1d3', '#6a4cff', '#4cd964', '#ff8fd1'];
  for (let i = 0; i < n; i++) {
    const p = h('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = pick(colors);
    p.style.animationDelay = Math.random() * 0.6 + 's';
    p.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
    p.style.setProperty('--x', (Math.random() * 200 - 100) + 'px');
    p.style.setProperty('--r', (Math.random() * 1080 - 540) + 'deg');
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 4000);
}
function flyStar(fromEl, toEl) {
  if (!fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  const s = h('div', 'fly-star', '⭐');
  s.style.left = a.left + a.width / 2 + 'px'; s.style.top = a.top + a.height / 2 + 'px';
  s.style.setProperty('--dx', (b.left + b.width / 2 - a.left - a.width / 2) + 'px');
  s.style.setProperty('--dy', (b.top + b.height / 2 - a.top - a.height / 2) + 'px');
  document.body.append(s);
  setTimeout(() => s.remove(), 900);
}

// ---------- заставка ----------
function splash() {
  setBg('assets/bg/menu.jpg');
  const s = screen('splash');
  s.append(h('h1', 'logo', 'Школа <span>Умки</span>'));
  s.append(h('p', 'sub', 'Считаем · Звуки · Слоги · Буквы · Слова'));
  const a = account();
  const go = h('button', 'play-btn', a ? `▶ Играть` : '▶ Играть');
  if (a) {
    go.onclick = () => { startAudio(); sfx.good(); menu(true); };
    s.append(h('p', 'who', `👤 ${esc(a.nick)}`), go);
  } else {
    go.onclick = () => { startAudio(); sfx.good(); login(); };
    s.append(go);
  }
  owlSay('', null, 'hello');
}

// ---------- вход ----------
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function login(isNew = false) {
  setBg('assets/bg/menu.jpg');
  const s = screen('login');
  const card = h('form', 'login-card');
  card.append(h('h2', '', isNew ? 'Новый игрок' : 'Вход'));
  const nick = h('input'); nick.placeholder = 'Имя'; nick.maxLength = 20; nick.autocomplete = 'username';
  const pass = h('input'); pass.placeholder = 'Пароль'; pass.type = 'password'; pass.maxLength = 64; pass.autocomplete = isNew ? 'new-password' : 'current-password';
  const eye = h('button', 'eye', '👁'); eye.type = 'button';
  eye.onclick = () => { pass.type = pass.type === 'password' ? 'text' : 'password'; };
  const passRow = h('div', 'pass-row'); passRow.append(pass, eye);
  const err = h('p', 'login-err');
  const ok = h('button', 'play-btn small', isNew ? 'Создать ▶' : 'Войти ▶'); ok.type = 'submit';
  card.append(h('label', '', 'Как тебя зовут?'), nick, h('label', '', isNew ? 'Придумай пароль (от 4 знаков). Запиши его!' : 'Пароль'), passRow, err, ok);
  const sw = h('button', 'link-btn', isNew ? 'Я уже играл(а) — войти' : 'Я здесь впервые — новый игрок'); sw.type = 'button';
  sw.onclick = () => { sfx.tap(); login(!isNew); };
  const guest = h('button', 'link-btn dim', 'Играть без входа (прохождение сохранится только на этом устройстве)'); guest.type = 'button';
  guest.onclick = () => { sfx.tap(); menu(true); };
  card.append(sw, guest);
  card.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (nick.value.trim().length < 2) { err.textContent = 'Имя — хотя бы 2 буквы.'; return; }
    if (pass.value.length < 4) { err.textContent = 'Пароль — хотя бы 4 знака.'; return; }
    ok.disabled = true;
    try { await signIn(nick.value.trim(), pass.value, isNew); sfx.good(); menu(true); }
    catch (ex) { sfx.bad(); err.textContent = ex.message; ok.disabled = false; }
  };
  s.append(card);
  setTimeout(() => nick.focus(), 300);
  owlSay(isNew ? 'Давай познакомимся!' : 'Привет! Входи!', isNew ? 'Давай познакомимся! Напиши своё имя и придумай пароль.' : 'Привет! Напиши своё имя и пароль.', 'hello');
}

// ---------- меню ----------
function menu(first = false) {
  setBg('assets/bg/menu.jpg');
  const s = screen('menu');
  s.append(topBar({ title: 'Школа Умки' }));
  const grid = h('div', 'sections');
  SECTIONS.forEach((sec, i) => {
    const c = h('button', 'section-card');
    c.style.setProperty('--c', sec.color);
    c.style.animationDelay = i * 90 + 'ms';
    const im = h('img'); im.src = sec.icon; im.alt = '';
    c.append(im, h('span', '', sec.title));
    const p = prog(sec.id), done = p.filter((x) => x > 0).length;
    c.append(h('em', 'lvl', `${done} / ${p.length}`));
    if (sectionDone(sec.id)) { const cup = h('img', 'cup-badge'); cup.src = sec.cup; c.append(cup); }
    c.onclick = () => { sfx.pop(); map(sec); };
    grid.append(c);
  });
  s.append(grid);
  const album = h('button', 'album-btn', `📒 Мои наклейки <b>${store.get('stickers', []).length} / ${ITEMS.length}</b>`);
  album.onclick = () => { sfx.pop(); stickers(); };
  const a = account();
  const who = h('button', 'album-btn who-btn', a ? `👤 ${esc(a.nick)} · выйти` : '👤 Войти');
  who.onclick = () => {
    sfx.tap();
    if (!a) return login();
    if (confirm(`Выйти из игрока «${a.nick}»? Прохождение сохранено, войдёшь — всё вернётся.`)) { signOut(); splash(); }
  };
  const row = h('div', 'menu-bottom'); row.append(album, who);
  s.append(row);
  owlSay(first ? 'Привет! Я совёнок Умка. Во что поиграем?' : 'Во что поиграем?',
    first ? 'Привет! Я совёнок Умка. Выбирай, во что будем играть!' : 'Во что поиграем?', 'hello')
    .then(() => setTimeout(() => { if (s.isConnected) bubble.classList.remove('show'); }, 1500)); // не закрывать кнопки внизу
}

// ---------- карта уровней ----------
function map(sec) {
  setBg(sec.bg);
  const s = screen('map');
  s.style.setProperty('--c', sec.color);
  s.append(topBar({ back: menu, title: sec.title, color: sec.color }));
  const levels = LEVELS[sec.id], p = prog(sec.id);
  const cur = Math.min(p.findIndex((x) => x === 0) < 0 ? levels.length : p.findIndex((x) => x === 0), levels.length);
  const STEP = 128, TOP = 70;
  const n = levels.length + 1; // + кубок в конце
  const wrap = h('div', 'map-wrap');
  wrap.style.height = TOP + (n - 1) * STEP + 110 + 'px';
  const xs = Array.from({ length: n }, (_, i) => 50 + Math.sin(i * 1.05) * 30); // %
  const ys = xs.map((_, i) => TOP + i * STEP);
  // дорожка
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'map-path');
  svg.setAttribute('viewBox', `0 0 100 ${wrap.style.height.replace('px', '')}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  let d = `M ${xs[0]} ${ys[0]}`;
  for (let i = 1; i < n; i++) { const my = (ys[i - 1] + ys[i]) / 2; d += ` C ${xs[i - 1]} ${my}, ${xs[i]} ${my}, ${xs[i]} ${ys[i]}`; }
  svg.innerHTML = `<path d="${d}" class="road"/><path d="${d}" class="road-dash"/>`;
  wrap.append(svg);

  levels.forEach((lv, i) => {
    const open = unlocked(sec.id, i);
    const node = h('button', 'node' + (open ? '' : ' locked') + (i === cur ? ' current' : '') + (p[i] ? ' done' : ''));
    node.style.left = xs[i] + '%'; node.style.top = ys[i] + 'px';
    node.append(h('b', '', open ? String(i + 1) : '🔒'));
    node.append(h('span', 'node-stars', [1, 2, 3].map((k) => `<i class="${p[i] >= k ? 'on' : ''}">★</i>`).join('')));
    const label = h('span', 'node-label ' + (xs[i] > 50 ? 'left' : 'right'), lv.title);
    node.append(label);
    node.onclick = () => {
      if (!open) { sfx.bad(); owlSay('Сначала пройди прошлый уровень!', 'Сначала пройди прошлый уровень!', 'think'); return; }
      sfx.pop(); play(sec, i);
    };
    wrap.append(node);
  });
  const done = sectionDone(sec.id);
  const cupNode = h('div', 'node cup' + (done ? ' done' : ' locked'));
  cupNode.style.left = xs[n - 1] + '%'; cupNode.style.top = ys[n - 1] + 'px';
  const cupImg = h('img'); cupImg.src = sec.cup; cupImg.alt = 'Кубок';
  cupNode.append(cupImg);
  wrap.append(cupNode);

  if (sec.id === 'abc') {
    const poster = h('button', 'album-btn poster-btn', '🔤 Вся азбука');
    poster.onclick = () => { sfx.pop(); abcPoster(sec); };
    s.append(poster);
  }
  const scroller = h('div', 'map-scroll');
  scroller.append(wrap);
  s.append(scroller);
  requestAnimationFrame(() => { scroller.scrollTop = Math.max(0, ys[Math.min(cur, n - 1)] - scroller.clientHeight / 2); });
  const total = p.reduce((a, b) => a + b, 0);
  if (cur >= levels.length) owlSay('Все уровни пройдены! Можно переиграть любой.', 'Все уровни пройдены! Можно переиграть любой и собрать все звёзды.', 'cheer');
  else owlSay(`Уровень ${cur + 1}: ${levels[cur].title}`, [`Уровень ${cur + 1}.`, levels[cur].title], total ? 'cheer' : 'hello');
}

// ---------- уровень: 8 заданий подряд ----------
function play(sec, li, skipIntro = false) {
  const lv = LEVELS[sec.id][li];
  if (lv.intro && !skipIntro) return intro(sec, li);
  setBg(sec.bg);
  const s = screen('game');
  s.style.setProperty('--c', sec.color);
  s.append(topBar({ back: () => map(sec), title: `${li + 1}. ${lv.title}`, color: sec.color }));
  const progress = h('div', 'progress');
  const dots = Array.from({ length: TASKS_PER_LEVEL }, () => { const d = h('i'); progress.append(d); return d; });
  s.append(progress);
  const stage = h('div', 'stage');
  s.append(stage);

  let idx = 0, mistakes = 0, last = null, locked = false;
  function next() {
    if (idx >= TASKS_PER_LEVEL) return finish();
    dots.forEach((d, i) => d.classList.toggle('now', i === idx));
    // задания уровня чередуются, один вид два раза подряд не выпадает
    const choices = lv.games.length > 1 ? lv.games.filter((g) => g !== last) : lv.games;
    const [fn, opts] = last = pick(choices);
    const task = fn(opts);
    stage.innerHTML = '';
    stage.classList.remove('leave'); void stage.offsetWidth; stage.classList.add('enter');
    locked = false;
    let taskMistakes = 0;
    const api = {
      locked: () => locked,
      hold: () => { locked = true; },
      right(el, delay = 1300) {
        locked = true;
        sfx.good(); setTimeout(() => sfx.star(), 350);
        dots[idx].classList.add(taskMistakes === 0 ? 'done' : 'half');
        flyStar(el || stage, dots[idx]);
        confetti(taskMistakes === 0 ? 40 : 18);
        owlPose(pick(['joy', 'cheer']));
        const p = pick(PRAISE);
        setTimeout(() => owlSay(p, p), 700); // сначала договорит ответ (цифру, слово), потом похвала
        store.set('stars', store.get('stars', 0) + 1);
        const st = s.querySelector('.stars-total b'); if (st) st.textContent = store.get('stars', 0);
        idx++;
        setTimeout(() => { stage.classList.add('leave'); setTimeout(next, 350); }, delay + 900);
      },
      wrong(el) {
        taskMistakes++; mistakes++;
        sfx.bad();
        if (el) { el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 500); }
        const t = pick(TRY_AGAIN);
        setTimeout(() => { if (!locked) owlSay(t, t, 'think'); }, 250);
      },
    };
    task.build(stage, api);
    owlSay(task.text, task.voice, 'hello');
  }
  function finish() {
    const p = prog(sec.id);
    const firstTime = !p[li];
    const got = starsFor(mistakes);
    p[li] = Math.max(p[li], got);
    store.set('prog.' + sec.id, p);
    const cupNow = firstTime && p.every((x) => x > 0);
    reward(sec, li, got, firstTime, cupNow);
  }
  next();
}

// ---------- знакомство с буквами перед уровнем ----------
function letterCard(L, big = false) {
  const it = letterWord(L);
  const c = h('button', 'letter-card' + (big ? ' big' : ''));
  c.append(h('b', '', `${L}<small>${L.toLowerCase()}</small>`));
  if (it) { const im = h('img'); im.src = it.img; im.alt = it.word; c.append(im); c.append(h('span', '', it.word)); }
  c.onclick = () => {
    sfx.pop();
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    if (L === 'Ъ') say(['твёрдый знак', 300, 'Он не звучит, а разделяет.']);
    else if (L === 'Ь') say(['мягкий знак', 300, 'Он не звучит, а смягчает:', 'конь']);
    else if (L === 'Ы') say(['ы', 300, 'На ы слова не начинаются. Ы есть в слове', 'сыр']);
    else say(['Буква', sayL(L), 300, it ? it.word : '']);
  };
  return c;
}
function intro(sec, li) {
  const lv = LEVELS[sec.id][li];
  setBg(sec.bg);
  const s = screen('intro');
  s.style.setProperty('--c', sec.color);
  s.append(topBar({ back: () => map(sec), title: `${li + 1}. ${lv.title}`, color: sec.color }));
  const row = h('div', 'intro-cards');
  lv.intro.forEach((L, i) => { const c = letterCard(L, true); c.style.animationDelay = i * 120 + 'ms'; row.append(c); });
  const go = h('button', 'play-btn small', 'Играть ▶');
  go.onclick = () => { sfx.good(); play(sec, li, true); };
  s.append(row, go);
  owlSay('Знакомься с буквами! Нажимай на каждую.', ['Знакомься с новыми буквами!', 'Нажимай на каждую букву и слушай.', 'Потом нажми «Играть».'], 'hello');
}
function abcPoster(sec) {
  setBg(sec.bg);
  const s = screen('poster');
  s.style.setProperty('--c', sec.color);
  s.append(topBar({ back: () => map(sec), title: 'Вся азбука', color: sec.color }));
  const grid = h('div', 'poster');
  ALPHABET.forEach((L) => grid.append(letterCard(L)));
  s.append(grid);
  owlSay('Нажми на любую букву!', 'Это вся азбука. Нажми на любую букву!', 'cheer');
}

// ---------- награда ----------
function reward(sec, li, got, firstTime, cupNow) {
  setBg('assets/bg/reward.jpg');
  const s = screen('reward');
  s.append(topBar({ back: () => map(sec), title: 'Награда!' }));
  const card = h('div', 'reward-card');
  card.append(h('h2', '', cupNow ? 'Кубок!' : `Уровень ${li + 1} пройден!`));
  const stars = h('div', 'big-stars');
  [1, 2, 3].forEach((k) => { const st = h('i', k <= got ? 'on' : '', '★'); st.style.animationDelay = 0.3 + k * 0.35 + 's'; stars.append(st); });
  card.append(stars);
  let fresh = null;
  if (cupNow) {
    const cup = h('div', 'sticker new cup'); const im = h('img'); im.src = sec.cup; cup.append(im);
    card.append(h('p', '', `Весь раздел «${sec.title}» пройден!`), cup);
  } else if (firstTime) {
    const owned = store.get('stickers', []);
    fresh = shuffle(ITEMS.filter((i) => !owned.includes(i.word)))[0];
    if (fresh) {
      owned.push(fresh.word); store.set('stickers', owned);
      const st = h('div', 'sticker new'); const im = h('img'); im.src = fresh.img; im.alt = fresh.word; st.append(im);
      card.append(h('p', '', 'Новая наклейка в альбом:'), st, h('div', 'sticker-name', fresh.word.toUpperCase()));
    }
  } else if (got < 3) card.append(h('p', '', 'Пройди ещё раз без ошибок — будет три звезды!'));
  const row = h('div', 'reward-actions');
  const hasNext = li + 1 < LEVELS[sec.id].length;
  if (hasNext) {
    const nx = h('button', 'play-btn small', 'Дальше ▶');
    nx.onclick = () => { sfx.pop(); play(sec, li + 1); };
    row.append(nx);
  }
  const again = h('button', 'play-btn small alt', '🔁 Ещё раз');
  again.onclick = () => { sfx.pop(); play(sec, li, true); };
  const toMap = h('button', 'play-btn small alt', '🗺️ Карта');
  toMap.onclick = () => { sfx.pop(); map(sec); };
  row.append(again, toMap);
  card.append(row);
  s.append(card);
  sfx.fanfare(); confetti(120); setTimeout(() => confetti(80), 1200);
  const praise = got === 3 ? 'Три звезды! Ты молодец!' : got === 2 ? 'Две звезды! Здорово!' : 'Уровень пройден! Молодец!';
  owlSay(praise, [praise, cupNow ? `Держи кубок за раздел ${sec.title}!` : fresh ? `Держи наклейку: ${fresh.word}!` : ''], 'joy');
}

// ---------- альбом наклеек ----------
function stickers() {
  setBg('assets/bg/reward.jpg');
  const s = screen('album');
  s.append(topBar({ back: menu, title: 'Мои наклейки' }));
  const cups = h('div', 'cups');
  SECTIONS.forEach((sec) => {
    const has = sectionDone(sec.id);
    const c = h('button', 'sticker cup' + (has ? '' : ' locked'));
    const im = h('img'); im.src = sec.cup; im.alt = sec.title; c.append(im, h('span', '', sec.title));
    c.onclick = () => { sfx.tap(); say(has ? `Кубок за раздел ${sec.title}!` : `Пройди все уровни в разделе ${sec.title}, и получишь кубок!`); };
    cups.append(c);
  });
  s.append(cups);
  const owned = store.get('stickers', []);
  const grid = h('div', 'album');
  ITEMS.forEach((it) => {
    const has = owned.includes(it.word);
    const c = h('button', 'sticker' + (has ? '' : ' locked'));
    const im = h('img'); im.src = it.img; im.alt = has ? it.word : '?';
    c.append(im);
    if (has) c.append(h('span', '', it.word));
    c.onclick = () => { if (has) { sfx.pop(); say(it.word); } else { sfx.tap(); say('Эту наклейку ещё можно заработать!'); } };
    grid.append(c);
  });
  s.append(grid);
  owlSay(owned.length ? `У тебя ${owned.length} из ${ITEMS.length}!` : 'Проходи уровни — получишь наклейки!',
    owned.length ? 'Это твои наклейки! Собери все!' : 'Проходи уровни, и получишь наклейки!', 'cheer');
}

// Для проверки: ?level=math.3 — сразу этот уровень; ?open=all — открыть все уровни.
const q = new URLSearchParams(location.search);
if (q.get('open') === 'all') SECTIONS.forEach((sec) => store.set('prog.' + sec.id, prog(sec.id).map((x) => x || 1)));

// предзагрузка картинок, чтобы задания появлялись без мигания
[...SECTIONS.map((s) => s.bg), 'assets/bg/reward.jpg', ...['hello', 'joy', 'think', 'cheer'].map((p) => `assets/owl/${p}.webp`)]
  .forEach((src) => { const i = new Image(); i.src = src; });
setTimeout(() => ITEMS.forEach((it) => { const i = new Image(); i.src = it.img; }), 1500);

if (q.get('level')) {
  const [sid, n] = q.get('level').split('.');
  const sec = SECTIONS.find((x) => x.id === sid);
  if (sec && LEVELS[sid][+n]) { startAudio(); play(sec, +n); } else pull().then(splash); // прохождение с сервера — до первого экрана
} else pull().then(splash); // прохождение с сервера — до первого экрана
