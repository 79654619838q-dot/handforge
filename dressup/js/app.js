// Экраны игры: место → принцесса → гардероб → оценка → выход в локацию → фотозона.
// Принцессы и вещи — слои-картинки ChatGPT (rdoll.js), вся одежда бесплатная.
import { dollHTML, preload, drawDoll, thumbSrc, faceSrc, layerSrcs, showDoll, prefetch, applyMasks, FX_NAMES } from './rdoll.js';
import { ITEMS, BY_SLOT, TOTAL, itemsWithTag, HAIR_TINTS, SLOT_NAMES, PRINCESS_IDS } from './catalog.js';
import { PLACES, PLACE, PRINCESSES, PRINCESS, SETS, TASKS, JUDGE, BACKDROPS, checkNeed } from './data.js';
import { bgCSS, photoURL, hasBg } from './scenes.js';
import * as st from './store.js';
import { sfx, startMusic, setMusic, setSound } from './audio.js';
import { esc, rnd } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const S = st.state();
setSound(S.settings.sound);

// Только принцессы, чьи картинки уже готовы.
const READY = PRINCESSES.filter((p) => PRINCESS_IDS.includes(p.id));
// Места и фоны фотозоны — только те, у которых уже есть картинка ChatGPT.
const OPEN_PLACES = PLACES.filter((p) => hasBg(p.id));
const OPEN_BACKDROPS = BACKDROPS.filter((b) => hasBg(b.id));
const bgOr = (id) => (hasBg(id) ? id : 'palace');

// Текущая партия.
const G = { place: null, pid: null, outfit: {}, hairTint: '', fx: null, task: null, backdrop: null, lookId: null, tab: null, sub: null };

const AT = {
  ball: 'на королевском балу', palace: 'во дворце', garden: 'в цветочном саду', beach: 'на пляже', winter: 'на зимнем празднике',
  birthday: 'на дне рождения', wedding: 'на свадьбе', masquerade: 'на балу-маскараде', forest: 'в волшебном лесу',
  underwater: 'в подводном королевстве', ride: 'на конной прогулке', shop: 'на шопинге', cafe: 'в кафе', school: 'в королевской школе',
  night: 'на ночной вечеринке', newyear: 'на Новом году', castle: 'на празднике в замке', voyage: 'в путешествии', vacation: 'в отпуске',
  coronation: 'на коронации', throne: 'в тронном зале', clouds: 'в облаках', icepalace: 'в зимнем дворце', space: 'в космическом замке',
};
const FOR = {
  ball: 'королевского бала', palace: 'дворца', garden: 'сада', beach: 'пляжа', winter: 'зимнего праздника', birthday: 'дня рождения',
  wedding: 'свадьбы', masquerade: 'маскарада', forest: 'волшебного леса', underwater: 'подводного королевства', ride: 'конной прогулки',
  shop: 'шопинга', cafe: 'кафе', school: 'школы', night: 'ночной вечеринки', newyear: 'Нового года', castle: 'праздника в замке',
  voyage: 'путешествия', vacation: 'отпуска', coronation: 'коронации',
};
const FX_ICONS = { hearts: '💖', stars: '⭐', snow: '❄️', flowers: '🌸', sparkle: '✨', gold: '💛', butterflies: '🦋', rainbow: '🌈' };

// ---------- общие помощники ----------
// Действия кнопок: ключи уникальны на всю игру, шаблон можно собирать до показа экрана.
let acts = {}, actN = 0, modalActs = {};
const on = (fn) => { const k = 'a' + ++actN; acts[k] = fn; return k; };
const mon = (fn) => { const k = 'm' + ++actN; modalActs[k] = fn; return k; };
function render(html, cls = '') {
  app.innerHTML = `<div class="screen ${cls}">${typeof html === 'function' ? html() : html}</div>`;
  applyMasks(app);
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const fn = acts[el.dataset.a] || modalActs[el.dataset.a];
  if (fn) { sfx.tap(); fn(el, e); }
});
// любая картинка, которую сервер не отдал с первого раза, пробует ещё до 3 раз
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const n = +(img.dataset.retry || 0);
  if (n >= 3) return;
  img.dataset.retry = n + 1;
  setTimeout(() => { img.src = img.getAttribute('src').split('?')[0] + '?r=' + (n + 1); }, 800 * (n + 1));
}, true);
document.addEventListener('pointerdown', () => { if (S.settings.music) { setMusic(true); startMusic(); } }, { once: true });

function modal(html) {
  const m = $('#modal');
  m.innerHTML = html ? `<div class="card">${html}</div>` : '';
  if (!html) modalActs = {};
  else applyMasks(m);
}
const closeModal = () => modal('');
function toast(t) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = t;
  $('#toasts').appendChild(d);
  setTimeout(() => d.remove(), 2700);
}
function setBg(id, mode = 'soft') {
  id = bgOr(id);
  const b = $('#bg');
  b.style.backgroundImage = bgCSS(id);
  b.className = mode;
}
const bgStyle = (id) => bgCSS(bgOr(id)).replace(/"/g, "'");
const topbar = (title, back) => `<div class="topbar">${back ? `<button class="icon-btn" data-a="${on(back)}" aria-label="Назад">←</button>` : ''}<h2>${title}</h2>${back ? '<span class="icon-btn ghost"></span>' : ''}</div>`;

(function sparkles() {
  const s = $('#sparkles');
  for (let i = 0; i < 26; i++) {
    const e = document.createElement('i');
    if (i % 3 === 0) e.className = 's';
    e.style.left = Math.random() * 100 + '%';
    e.style.top = Math.random() * 100 + '%';
    e.style.animationDelay = (-Math.random() * 4).toFixed(2) + 's';
    e.style.animationDuration = (3 + Math.random() * 3).toFixed(2) + 's';
    s.appendChild(e);
  }
})();

// ---------- образ ----------
const cur = () => ({ pid: G.pid, outfit: G.outfit, hairTint: G.hairTint, fx: G.fx });
const hairTintOf = (pid) => S.princesses[pid]?.hairTint || '';
function cleanOutfit(o) { const r = {}; for (const k in o) if (o[k] && ITEMS[o[k]]) r[k] = o[k]; return r; }

function randomOutfit(tags) {
  const pick = (slot, prob) => {
    if (!BY_SLOT[slot]?.length || Math.random() > prob) return null;
    const pool = tags ? itemsWithTag(slot, tags) : [];
    return rnd(pool.length && Math.random() < 0.85 ? pool : BY_SLOT[slot]).id;
  };
  const magic = tags && tags.some((t) => ['fairy', 'magic', 'forest'].includes(t));
  const cold = tags && tags.some((t) => ['winter', 'newyear'].includes(t));
  const o = {
    dress: pick('dress', 1), shoes: pick('shoes', 0.9), head: pick('head', 0.8), earrings: pick('earrings', 0.6),
    necklace: pick('necklace', 0.5), bracelet: pick('bracelet', 0.3), held: pick('held', 0.55), bag: pick('bag', 0.25),
    wings: pick('wings', magic ? 0.8 : 0.12), outer: pick('outer', cold ? 0.7 : 0.15), face: pick('face', 0.1),
    gloves: pick('gloves', 0.12), scarf: cold ? pick('scarf', 0.3) : null, hair: pick('hair', 0.5),
  };
  if (o.held && o.bag && Math.random() < 0.5) delete o.bag;
  return cleanOutfit(o);
}

// ---------- ГЛАВНОЕ МЕНЮ ----------
function menu() {
  G.task = null; G.lookId = null;
  setBg('palace');
  const fav = S.looks.find((l) => PRINCESS_IDS.includes(l.pid));
  const p0 = READY[0];
  const hero = fav ? lookState(fav) : { pid: p0.id, outfit: cleanOutfit(p0.outfit) };
  if (!hero.outfit.dress) hero.outfit.dress = BY_SLOT.dress[0].id;
  render(`
    <div class="menu-side left"><button class="icon-btn" data-a="${on(settings)}" aria-label="Настройки">⚙️</button></div>
    <div class="hero">${dollHTML(hero)}</div>
    <div class="logo"><h1>Наряди<br>принцессу</h1><p>Princess Dress Up</p></div>
    <div class="menu-grid">
      <button class="btn play" data-a="${on(() => places())}">✨ Играть</button>
      <button class="btn gold" data-a="${on(randomLook)}">✨ Создать образ</button>
      <button class="btn lilac" data-a="${on(() => mix(0))}">🎲 Смешай</button>
      <button class="btn white" data-a="${on(tasks)}">🎯 Задания</button>
      <button class="btn white" data-a="${on(() => princesses('my'))}">👸 Мои принцессы</button>
      <button class="btn white" data-a="${on(() => collection('dress'))}">👗 Гардероб</button>
      <button class="btn white" data-a="${on(looks)}">📸 Мои образы</button>
    </div>`, 'menu');
}

// ---------- ВЫБОР МЕСТА ----------
function places() {
  setBg('palace', 'blur');
  render(() => `${topbar('Куда идёт принцесса?', menu)}
    <div class="scroll"><div class="places">
      ${OPEN_PLACES.map((p, i) => `<button class="place" style="background-image:url('assets/bg/t_${p.id}.jpg');animation-delay:${i * 0.03}s" data-a="${on(() => { G.place = p.id; G.task = null; G.lookId = null; sfx.magic(); princesses('play'); })}">
        <em>${p.emoji}</em>${S.stats.places[p.id] ? '<b class="done">✅</b>' : ''}<span>${p.name}</span></button>`).join('')}
    </div></div>`);
}

// ---------- ВЫБОР ПРИНЦЕССЫ ----------
function princesses(mode) {
  const place = G.place && PLACE[G.place];
  setBg(place && mode === 'play' ? place.id : 'palace', 'blur');
  const title = mode === 'play' ? place.who : 'Мои принцессы';
  render(() => `${topbar(title, mode === 'play' ? (G.task ? tasks : places) : menu)}
    <div class="scroll">
      <p class="subtitle">${mode === 'play' ? `${place.emoji} ${place.name}` : 'Выбери принцессу — и в путь!'}</p>
      <div class="princesses">
      ${READY.map((p, i) => `<div class="pcard" style="animation-delay:${i * 0.04}s" data-a="${on(() => { if (mode !== 'play') { G.place = rnd(OPEN_PLACES).id; G.task = null; } startDress(p.id); })}">
        <div class="portrait">${dollHTML({ pid: p.id, outfit: { dress: BY_SLOT.dress[0].id, ...cleanOutfit(p.outfit) }, hairTint: hairTintOf(p.id) })}</div>
        ${place && mode === 'play' && place.tags.includes(p.fav) ? '<span class="fav">💖</span>' : ''}
        <b>${p.name}</b><small>${p.style}</small></div>`).join('')}
      </div>
      ${READY.length < PRINCESSES.length ? '<p class="subtitle" style="margin-top:14px">Скоро появятся новые принцессы ✨</p>' : ''}
    </div>`);
}

// ---------- ГАРДЕРОБ ----------
const TABS = [
  { id: 'dress', slots: ['dress'] }, { id: 'hair', slots: ['hair'] }, { id: 'shoes', slots: ['shoes'] }, { id: 'head', slots: ['head'] },
  { id: 'jewelry', slots: ['earrings', 'necklace', 'bracelet'] }, { id: 'outer', slots: ['outer'] }, { id: 'held', slots: ['held'] },
  { id: 'bag', slots: ['bag'] }, { id: 'wings', slots: ['wings'] }, { id: 'acc', slots: ['face', 'gloves', 'scarf'] },
  { id: 'fx', name: 'Эффекты', icon: '🌟' }, { id: 'sets', name: 'Наборы', icon: '🎀' },
].map((t) => ({ ...t, name: t.name || SLOT_NAMES[t.id][0], icon: t.icon || SLOT_NAMES[t.id][1] }));
const tabOfSlot = (s) => ({ face: 'acc', scarf: 'acc', gloves: 'acc', earrings: 'jewelry', necklace: 'jewelry', bracelet: 'jewelry', ring: 'jewelry' }[s] || s);
const tabHasItems = (t) => !t.slots || t.slots.some((s) => BY_SLOT[s]?.length);

function startDress(pid, outfit) {
  G.pid = pid;
  G.outfit = cleanOutfit(outfit ? { ...outfit } : { ...PRINCESS[pid].outfit });
  if (!G.outfit.dress && BY_SLOT.dress?.length) G.outfit.dress = BY_SLOT.dress[0].id;
  G.hairTint = hairTintOf(pid);
  if (!outfit) G.fx = null;
  G.tab = null; G.sub = null;
  dressRoom();
}

function orderedTabs() {
  const place = PLACE[G.place];
  const rec = place ? [...new Set(place.slots.map(tabOfSlot))] : [];
  const avail = TABS.filter(tabHasItems);
  return { tabs: [...rec.map((id) => avail.find((t) => t.id === id)).filter(Boolean), ...avail.filter((t) => !rec.includes(t.id))], rec };
}

function dressRoom() {
  const place = PLACE[G.place];
  setBg(place ? place.id : 'palace', 'blur');
  const { tabs, rec } = orderedTabs();
  if (!G.tab || !tabs.find((t) => t.id === G.tab)) G.tab = tabs[0].id;
  render(() => `${topbar(`${place ? place.emoji + ' ' + place.name : 'Гардероб'}`, () => (G.task ? tasks() : princesses('play')))}
    <div class="body">
      <div class="stage">
        ${G.task ? '<div class="task-box" id="taskBox"></div>' : ''}
        <div class="side-tools">
          <button class="icon-btn" data-a="${on(() => { G.outfit = randomOutfit(place?.tags); sfx.magic(); redraw(true); strip(); })}" title="Случайный образ">🎲</button>
          <button class="icon-btn" data-a="${on(() => { G.outfit = { dress: G.outfit.dress }; G.fx = null; sfx.off(); redraw(true); strip(); })}" title="Снять всё, кроме платья">🧺</button>
        </div>
        <div class="doll-wrap" id="doll"></div>
        <button class="btn gold done-btn" data-a="${on(done)}">Готово ✨</button>
      </div>
      <div class="panel">
        <div class="tabs" id="tabs">${tabs.map((t) => `<button class="tab ${t.id === G.tab ? 'on' : ''} ${rec.includes(t.id) ? 'rec' : ''}" data-tab="${t.id}"><i>${t.icon}</i>${t.name}</button>`).join('')}</div>
        <div class="chips" id="chips"></div>
        <div class="strip" id="strip"></div>
      </div>
    </div>`, 'dress');
  redraw();
  strip();
}

function redraw(pop) {
  const d = $('#doll');
  if (!d) return;
  showDoll(d, cur(), () => { if (pop) { d.classList.remove('pop'); void d.offsetWidth; d.classList.add('pop'); } });
  if (G.task) {
    const t = TASKS.find((x) => x.id === G.task);
    const box = $('#taskBox');
    if (box && t?.need) box.innerHTML = `🎯 ${t.name}` + t.need.map((n) => `<div class="${checkNeed(n, G.outfit) ? 'ok' : ''}">${checkNeed(n, G.outfit) ? '✅' : '⬜'} ${n.label}</div>`).join('');
  }
}

function wear(it) {
  if (G.outfit[it.slot] === it.id) {
    if (it.slot === 'dress') return;
    delete G.outfit[it.slot];
    sfx.off();
  } else {
    G.outfit[it.slot] = it.id;
    sfx.wear();
  }
  redraw(true);
  document.querySelectorAll('#strip .item[data-id]').forEach((el) => el.classList.toggle('on', G.outfit[ITEMS[el.dataset.id].slot] === el.dataset.id));
}

const itemBtn = (it, tags) => `<button class="item ${G.outfit[it.slot] === it.id ? 'on' : ''}" data-id="${it.id}" title="${esc(it.name)}">
  <img class="th" src="${thumbSrc(it)}" alt="" loading="lazy" style="${it.filter ? `filter:${it.filter}` : ''}">
  ${tags.length && it.tags.some((t) => tags.includes(t)) ? '<span class="rec">💖</span>' : ''}</button>`;

function strip() {
  const place = PLACE[G.place];
  const tags = place ? place.tags : [];
  const tab = TABS.find((t) => t.id === G.tab);
  document.querySelectorAll('#tabs .tab').forEach((x) => {
    const onT = x.dataset.tab === tab.id;
    x.classList.toggle('on', onT);
    if (onT) x.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  const chips = $('#chips'), el = $('#strip');
  if (tab.id === 'sets') {
    chips.innerHTML = '';
    el.innerHTML = SETS.filter((s) => Object.values(s.outfit).some((id) => ITEMS[id])).map((s) => `<button class="item setcard" data-set="${s.id}"><i>${s.emoji}</i>${s.name}</button>`).join('');
    return;
  }
  if (tab.id === 'fx') {
    chips.innerHTML = '';
    el.innerHTML = `<button class="item setcard ${!G.fx ? 'on' : ''}" data-fx=""><i>✕</i>Без эффекта</button>` +
      Object.entries(FX_NAMES).map(([k, n]) => `<button class="item setcard ${G.fx === k ? 'on' : ''}" data-fx="${k}"><i>${FX_ICONS[k]}</i>${n}</button>`).join('');
    return;
  }
  let items = tab.slots.flatMap((s) => BY_SLOT[s] || []);
  let subs;
  if (tab.slots.length > 1) subs = tab.slots.filter((s) => BY_SLOT[s]?.length).map((s) => [s, SLOT_NAMES[s][0], false]);
  else {
    const cats = [...new Set(items.map((it) => it.cat))];
    const good = (c) => items.some((it) => it.cat === c && it.tags.some((t) => tags.includes(t)));
    subs = cats.map((c) => [c, c, good(c)]).sort((a, b) => b[2] - a[2]);
  }
  if (!G.sub || !subs.find((s) => s[0] === G.sub)) G.sub = tab.slots.length > 1 ? subs[0][0] : 'all';
  let row = '';
  if (tab.id === 'hair') {
    row = HAIR_TINTS.map(([f, n, grad]) => `<button class="swatch ${G.hairTint === f ? 'on' : ''}" title="${n}" style="background:${grad}" data-tint="${f}"></button>`).join('') + '<span style="flex:none;width:6px"></span>';
  }
  const showSubs = tab.slots.length > 1 || subs.length > 1;
  chips.innerHTML = row + (tab.slots.length > 1 || !showSubs ? '' : `<button class="chip ${G.sub === 'all' ? 'on' : ''}" data-sub="all">Все</button>`) +
    (showSubs ? subs.map(([k, n, good]) => `<button class="chip ${G.sub === k ? 'on' : ''} ${good ? 'rec' : ''}" data-sub="${k}">${good ? '💖 ' : ''}${n}</button>`).join('') : '');
  if (tab.slots.length > 1) items = BY_SLOT[G.sub] || [];
  else if (G.sub !== 'all') items = items.filter((it) => it.cat === G.sub);
  const fits = (it) => it.tags.some((t) => tags.includes(t));
  items = [...items].sort((x, y) => fits(y) - fits(x));
  const slot = items[0]?.slot;
  const none = slot && slot !== 'dress' && slot !== 'hair' ? `<button class="item none" data-none="${slot}" title="Снять">✕</button>` : '';
  el.innerHTML = none + items.map((it) => itemBtn(it, tags)).join('');
  el.scrollLeft = 0;
  // заранее грузим сами вещи этой вкладки (без повторов по цветам) — нажатие потом срабатывает сразу
  const seen = new Set();
  for (const it of items) { if (seen.has(it.base) || seen.size >= 8) continue; seen.add(it.base); prefetch({ ...cur(), outfit: { ...G.outfit, [it.slot]: it.id } }); }
}
document.addEventListener('click', (e) => {
  const tb = e.target.closest('#tabs [data-tab]');
  if (tb) { G.tab = tb.dataset.tab; G.sub = null; sfx.tap(); strip(); return; }
  if (!e.target.closest('#strip, #chips')) return;
  const it = e.target.closest('.item[data-id]');
  if (it) return wear(ITEMS[it.dataset.id]);
  const nn = e.target.closest('[data-none]');
  if (nn) { delete G.outfit[nn.dataset.none]; sfx.off(); redraw(true); document.querySelectorAll('#strip .item.on').forEach((x) => x.classList.remove('on')); return; }
  const sb = e.target.closest('[data-sub]');
  if (sb) { G.sub = sb.dataset.sub; sfx.tap(); strip(); return; }
  const tn = e.target.closest('[data-tint]');
  if (tn) { G.hairTint = tn.dataset.tint; S.princesses[G.pid] = { ...(S.princesses[G.pid] || {}), hairTint: G.hairTint }; st.save(); sfx.wear(); redraw(true); strip(); return; }
  const fx = e.target.closest('[data-fx]');
  if (fx) { G.fx = fx.dataset.fx || null; sfx.magic(); redraw(true); strip(); return; }
  const s = e.target.closest('[data-set]');
  if (s) {
    const set = SETS.find((x) => x.id === s.dataset.set);
    G.outfit = cleanOutfit({ hair: G.outfit.hair, ...set.outfit });
    if (!G.outfit.dress) G.outfit.dress = BY_SLOT.dress[0].id;
    G.fx = set.fx || G.fx;
    sfx.magic(); redraw(true); toast(`${set.emoji} Набор «${set.name}»`);
  }
});

// ---------- ГОТОВО: оценка ----------
function judge(outfit, place) {
  const tags = place.tags;
  const res = JUDGE.map((g) => {
    const its = g.slots.map((s) => outfit[s] && ITEMS[outfit[s]]).filter(Boolean);
    const match = its.some((it) => it.tags.some((t) => tags.includes(t)));
    return { ...g, hearts: !its.length ? (g.key === 'hair' ? 2 : 1) : match ? 3 : 2, match };
  });
  const total = res.reduce((s, r) => s + r.hearts, 0);
  const dressOk = res[0].match;
  const title = !dressOk ? 'Необычный образ!' : total >= 11 ? `Идеальный образ для ${FOR[place.id] || place.name}!` : 'Прекрасный образ!';
  const badges = ['⭐ Новый образ'];
  if (dressOk) badges.push('💖 Отличный наряд');
  if (outfit.wings || G.fx || ITEMS[outfit.held]?.base === 'held_wand') badges.push('✨ Волшебный стиль');
  if (['head_crown', 'head_crown_big', 'head_tiara', 'head_ice'].includes(ITEMS[outfit.head]?.base) || ITEMS[outfit.dress]?.tags.includes('royal')) badges.push('👑 Королевский образ');
  return { res, title, badges };
}

function done() {
  const place = PLACE[G.place] || PLACES[0];
  const j = judge(G.outfit, place);
  S.stats.looks++;
  S.stats.places[place.id] = (S.stats.places[place.id] || 0) + 1;
  const got = [];
  if (G.task) {
    const t = TASKS.find((x) => x.id === G.task);
    if (t?.need && t.need.every((n) => checkNeed(n, G.outfit))) { if (!S.tasksDone[t.id]) { S.tasksDone[t.id] = true; got.push(t); } }
    else if (t?.need) toast('Задание ещё не выполнено — посмотри список 🎯');
  }
  for (const t of TASKS) {
    if (S.tasksDone[t.id]) continue;
    if ((t.count && S.stats.looks >= t.count) || (t.places && Object.keys(S.stats.places).length >= t.places)) { S.tasksDone[t.id] = true; got.push(t); }
  }
  st.save();
  sfx.success();
  modal(`<div class="big">✨ Образ готов! ✨</div><h3>${j.title}</h3>
    <div class="judge">${j.res.map((r) => `<div>${r.icon}<span>${r.name}</span><b class="hearts">${'💖'.repeat(r.hearts)}${'🤍'.repeat(3 - r.hearts)}</b></div>`).join('')}</div>
    <div class="rewards">${j.badges.map((b) => `<span>${b}</span>`).join('')}</div>
    ${got.map((t) => `<p><b>🏅 ${esc(t.name)}</b> — выполнено!</p>`).join('')}
    <div class="row"><button class="btn" data-a="${mon(() => { closeModal(); scene(); })}">В путь! ✨</button></div>
    <div class="row"><button class="btn small white" data-a="${mon(closeModal)}">Поправить наряд</button></div>`);
}

// ---------- ПРИНЦЕССА В ЛОКАЦИИ ----------
function burst(el, n = 26) {
  const b = document.createElement('div');
  b.className = 'burst';
  const sym = ['✨', '💖', '⭐', '✦', '💫'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    s.textContent = sym[i % sym.length];
    s.style.left = '50%'; s.style.top = '55%';
    s.style.fontSize = 14 + Math.random() * 22 + 'px';
    const ang = Math.random() * Math.PI * 2, r = 120 + Math.random() * 260;
    s.style.setProperty('--dx', Math.cos(ang) * r + 'px');
    s.style.setProperty('--dy', Math.sin(ang) * r + 'px');
    s.style.animationDelay = 1.1 + Math.random() * 0.5 + 's';
    b.appendChild(s);
  }
  el.appendChild(b);
}
const lookName = () => `${PRINCESS[G.pid]?.name || ''} ${AT[G.backdrop || G.place] || ''}`.trim();

function scene() {
  const place = PLACE[G.place] || PLACES[0];
  G.backdrop = place.id;
  setBg(place.id, 'soft');
  render(() => `${topbar('', menu)}
    <div class="stage zoom" id="sceneStage"><div class="doll-wrap enter" id="doll"></div></div>
    <div class="look-title">${esc(lookName())}</div>
    <div class="bottom-bar">
      <button class="btn gold" data-a="${on(photo)}"><i>📸</i>Фотозона</button>
      <button class="btn" data-a="${on(() => saveLookDialog())}"><i>💾</i>Сохранить</button>
      <button class="btn white small" data-a="${on(dressRoom)}"><i>👗</i>Переодеть</button>
      <button class="btn white small" data-a="${on(() => places())}"><i>🗺️</i>Место</button>
    </div>`, 'scene');
  showDoll($('#doll'), cur());
  burst($('#sceneStage'));
  setTimeout(sfx.magic, 1200);
}

// ---------- ФОТОЗОНА ----------
function photo() {
  if (!G.backdrop) G.backdrop = G.place;
  setBg(G.backdrop, 'soft');
  const rows = () => {
    $('#photoRows').innerHTML = `<div class="opt-row"><h4>Фон</h4><div class="chips">${OPEN_BACKDROPS.map((b) => `<button class="chip ${G.backdrop === b.id ? 'on' : ''}" data-a="${on(() => { G.backdrop = b.id; setBg(b.id, 'soft'); rows(); })}">${b.name}</button>`).join('')}</div></div>
      <div class="opt-row"><h4>Эффект</h4><div class="chips"><button class="chip ${!G.fx ? 'on' : ''}" data-a="${on(() => { G.fx = null; redraw(true); rows(); })}">Без эффекта</button>${Object.entries(FX_NAMES).map(([k, n]) => `<button class="chip ${G.fx === k ? 'on' : ''}" data-a="${on(() => { G.fx = k; sfx.magic(); redraw(true); rows(); })}">${FX_ICONS[k]} ${n}</button>`).join('')}</div></div>`;
  };
  render(() => `${topbar('Фотозона', scene)}
    <div class="body"><div class="stage photo-frame"><div class="doll-wrap" id="doll"></div></div>
    <div class="panel"><div id="photoRows"></div>
      <div style="display:flex;justify-content:center;padding:6px"><button class="btn gold" data-a="${on(takePhoto)}">📸 Сделать фото</button></div></div></div>`, 'dress photo');
  redraw();
  rows();
}

async function renderPhoto(state, backdrop, title) {
  const W = 1080, H = 1440;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const cover = (img) => { const s = Math.max(W / img.width, H / img.height); const w = img.width * s, h = img.height * s; g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); };
  g.fillStyle = '#f7d6e8'; g.fillRect(0, 0, W, H);
  const ph = photoURL(backdrop) || photoURL('palace');
  if (ph) { try { cover(await load(ph)); } catch { /* остаётся цвет */ } }
  const dh = H * 0.9, dw = dh * (2 / 3);
  await drawDoll(g, state, (W - dw) / 2, H - dh - 16, dw, dh);
  g.lineWidth = 28; g.strokeStyle = '#fff'; g.strokeRect(14, 14, W - 28, H - 28);
  g.font = '64px "Marck Script", cursive'; g.textAlign = 'center'; g.fillStyle = '#fff';
  g.shadowColor = 'rgba(140,30,90,.8)'; g.shadowBlur = 12;
  g.fillText(title, W / 2, 120);
  return c;
}

async function takePhoto() {
  sfx.shutter();
  const f = document.createElement('div');
  f.className = 'flash';
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 600);
  let img = null;
  try { img = (await renderPhoto(cur(), G.backdrop, lookName())).toDataURL('image/jpeg', 0.9); } catch (e) { console.error(e); }
  saveLookDialog(img);
}

function saveLookDialog(img) {
  const existing = G.lookId && S.looks.find((l) => l.id === G.lookId);
  const name = existing ? existing.name : `Принцесса ${lookName()}`;
  modal(`<h3>${img ? '📸 Фото готово!' : '💾 Сохранить образ'}</h3>
    ${img ? `<img src="${img}" style="width:100%;border-radius:18px;box-shadow:var(--shadow)" alt="">` : ''}
    <p>Как назовём образ?</p><input id="lookName" maxlength="40" value="${esc(name)}">
    <div class="row">
      <button class="btn" data-a="${mon(() => {
        const nm = $('#lookName').value.trim() || name;
        const data = { name: nm, pid: G.pid, place: G.place, backdrop: G.backdrop || G.place, outfit: { ...G.outfit }, hairTint: G.hairTint, fx: G.fx, date: Date.now() };
        if (existing) st.updateLook(existing.id, data); else { G.lookId = 'l' + Date.now(); st.addLook({ id: G.lookId, ...data }); }
        sfx.success(); closeModal(); toast('💖 Сохранено в «Мои образы»');
      })}">💾 Сохранить</button>
      ${img ? `<button class="btn white" data-a="${mon(() => download(img, $('#lookName').value))}">⬇️ Скачать фото</button>` : ''}
    </div>
    <div class="row"><button class="btn small lilac" data-a="${mon(closeModal)}">Закрыть</button></div>`);
}
function download(dataUrl, name) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = (name || 'принцесса').replace(/[\\/:*?"<>|]/g, '') + '.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- МОИ ОБРАЗЫ ----------
function lookState(l) {
  const outfit = cleanOutfit(l.outfit || {});
  if (!outfit.dress) outfit.dress = BY_SLOT.dress[0].id;
  return { pid: l.pid, outfit, hairTint: l.hairTint || '', fx: l.fx || null };
}
function looks() {
  setBg('palace', 'blur');
  const list = S.looks.filter((l) => PRINCESS_IDS.includes(l.pid));
  render(() => `${topbar('Мои образы', menu)}
    <div class="scroll">${list.length ? `<div class="looks">${list.map((l, i) => `<button class="look" style="background-image:${bgStyle(l.backdrop || l.place)};animation-delay:${i * 0.03}s" data-a="${on(() => lookView(l.id))}">
        ${dollHTML(lookState(l))}<span>${esc(l.name)}</span></button>`).join('')}</div>`
      : '<p class="empty">Здесь появятся твои образы 💖<br>Нажми «Играть» и создай первый!</p>'}</div>`);
}
function lookView(id) {
  const l = S.looks.find((x) => x.id === id);
  if (!l) return;
  const open = () => { G.lookId = l.id; G.pid = l.pid; G.place = l.place; G.backdrop = l.backdrop; G.outfit = cleanOutfit(l.outfit); G.hairTint = l.hairTint || ''; G.fx = l.fx || null; G.task = null; };
  modal(`<h3>${esc(l.name)}</h3>
    <div class="look-big" style="background-image:${bgStyle(l.backdrop || l.place)}">${dollHTML(lookState(l))}</div>
    <input id="rn" maxlength="40" value="${esc(l.name)}" style="margin-top:10px">
    <div class="row">
      <button class="btn small" data-a="${mon(() => { open(); closeModal(); G.tab = null; dressRoom(); })}">👗 Открыть и изменить</button>
      <button class="btn small gold" data-a="${mon(async () => { const c = await renderPhoto(lookState(l), l.backdrop || l.place, l.name); download(c.toDataURL('image/jpeg', 0.9), l.name); })}">⬇️ Фото</button>
    </div>
    <div class="row">
      <button class="btn small white" data-a="${mon(() => { st.updateLook(l.id, { name: $('#rn').value.trim() || l.name }); closeModal(); looks(); })}">✏️ Переименовать</button>
      <button class="btn small white" data-a="${mon(() => { if (confirm('Удалить этот образ?')) { st.deleteLook(l.id); closeModal(); looks(); } })}">🗑️ Удалить</button>
    </div>
    <button class="x" data-a="${mon(closeModal)}">✕</button>`);
}

// ---------- ГАРДЕРОБ-КОЛЛЕКЦИЯ ----------
function collection(slot) {
  setBg('shop', 'blur');
  const slots = ['dress', 'hair', 'shoes', 'head', 'earrings', 'necklace', 'bracelet', 'outer', 'held', 'bag', 'wings', 'face', 'gloves', 'scarf'].filter((s) => BY_SLOT[s]?.length);
  if (!slots.includes(slot)) slot = slots[0];
  render(() => `${topbar('Мой гардероб', menu)}
    <div class="chips" style="padding:0 12px 6px;z-index:3;position:relative">${slots.map((k) => `<button class="chip ${k === slot ? 'on' : ''}" data-a="${on(() => collection(k))}">${SLOT_NAMES[k][1]} ${SLOT_NAMES[k][0]} · ${BY_SLOT[k].length}</button>`).join('')}</div>
    <p class="count">В гардеробе ${TOTAL} вещей — всё можно надевать!</p>
    <div class="scroll"><div class="collection">${BY_SLOT[slot].map((it) => `<button class="item" title="${esc(it.name)}" data-a="${on(() => itemView(it))}"><img class="th" src="${thumbSrc(it)}" alt="" loading="lazy" style="${it.filter ? `filter:${it.filter}` : ''}"></button>`).join('')}</div></div>`);
}
function itemView(it) {
  modal(`<h3>${esc(it.name)}</h3><div class="reward-item" style="width:200px;height:200px"><img src="${thumbSrc(it)}" style="width:100%;height:100%;${it.filter ? `filter:${it.filter}` : ''}" alt=""></div>
    <p>${SLOT_NAMES[it.slot][1]} ${SLOT_NAMES[it.slot][0]}</p>
    <div class="row"><button class="btn" data-a="${mon(() => {
      closeModal();
      G.place = G.place || rnd(OPEN_PLACES).id;
      const pid = G.pid && PRINCESS_IDS.includes(G.pid) ? G.pid : READY[0].id;
      startDress(pid, { ...PRINCESS[pid].outfit, [it.slot]: it.id });
    })}">👗 Примерить</button></div>
    <button class="x" data-a="${mon(closeModal)}">✕</button>`);
}

// ---------- ЗАДАНИЯ ----------
function tasks() {
  setBg('coronation', 'blur');
  render(() => `${topbar('Задания', menu)}
    <div class="scroll"><div class="list">${TASKS.filter((t) => !t.place || hasBg(t.place)).map((t, i) => {
      const doneT = S.tasksDone[t.id];
      const progress = t.count ? ` (${Math.min(S.stats.looks, t.count)}/${t.count})` : t.places ? ` (${Math.min(Object.keys(S.stats.places).length, t.places)}/${t.places})` : '';
      return `<div class="task ${doneT ? 'done' : ''}" style="animation-delay:${i * 0.03}s">
        <div><b>${t.place ? PLACE[t.place].emoji + ' ' : '🏅 '}${esc(t.name)}${progress}</b>${t.need ? `<ul>${t.need.map((n) => `<li>${n.label}</li>`).join('')}</ul>` : ''}</div>
        <div class="rw"><span style="font-size:34px">${doneT ? '🏅' : '🎯'}</span>
        ${doneT ? '<span class="donemark">Готово</span>' : t.place ? `<button class="btn small" data-a="${on(() => { G.task = t.id; G.place = t.place; G.lookId = null; princesses('play'); })}">Начать</button>` : ''}</div></div>`;
    }).join('')}</div></div>`);
}

// ---------- СЛУЧАЙНЫЙ ОБРАЗ ----------
function randomLook() {
  const roll = () => {
    const p = rnd(OPEN_PLACES);
    G.place = p.id; G.backdrop = p.id; G.pid = rnd(READY).id;
    G.outfit = randomOutfit(p.tags);
    G.hairTint = Math.random() < 0.25 ? rnd(HAIR_TINTS)[0] : hairTintOf(G.pid);
    G.fx = Math.random() < 0.35 ? rnd(Object.keys(FX_NAMES)) : null;
    G.task = null; G.lookId = null;
    preload(cur());
    setBg(p.id, 'soft');
    const t = $('.look-title'); if (t) t.textContent = lookName();
    redraw(true);
    sfx.magic();
  };
  render(() => `${topbar('✨ Создать образ', menu)}
    <div class="stage"><div class="doll-wrap" id="doll"></div></div>
    <div class="look-title" style="animation:none"></div>
    <div class="bottom-bar">
      <button class="btn gold" data-a="${on(roll)}">✨ Ещё</button>
      <button class="btn" data-a="${on(() => { G.tab = null; dressRoom(); })}">👗 Одеть дальше</button>
      <button class="btn white small" data-a="${on(photo)}">📸 Фотозона</button>
    </div>`, 'scene');
  roll();
}

// ---------- СМЕШАЙ ----------
function mix(step) {
  if (step === 0) {
    G.pid = rnd(READY).id; G.place = rnd(OPEN_PLACES).id; G.task = null; G.lookId = null; G.fx = null;
    G.outfit = {}; G.hairTint = hairTintOf(G.pid);
  }
  const STEPS = ['Платье', 'Причёска', 'Аксессуары'];
  const reroll = () => {
    if (step === 0) { G.outfit.dress = rnd(BY_SLOT.dress).id; if (BY_SLOT.shoes) G.outfit.shoes = rnd(BY_SLOT.shoes).id; }
    if (step === 1) { if (BY_SLOT.hair) G.outfit.hair = rnd(BY_SLOT.hair).id; G.hairTint = rnd(HAIR_TINTS)[0]; }
    if (step === 2) {
      const r = randomOutfit(null);
      for (const k of ['head', 'earrings', 'necklace', 'bracelet', 'held', 'bag', 'wings', 'face']) { if (r[k]) G.outfit[k] = r[k]; else delete G.outfit[k]; }
      G.fx = Math.random() < 0.4 ? rnd(Object.keys(FX_NAMES)) : null;
    }
    sfx.magic();
    redraw(true);
  };
  setBg(G.place, 'soft');
  render(() => `${topbar('🎲 Смешай', menu)}
    <div class="mix-steps">${STEPS.map((s, i) => `<span class="${i === step ? 'on' : ''}">${i + 1}. ${s}</span>`).join('')}</div>
    <div class="stage"><div class="doll-wrap" id="doll"></div></div>
    <div class="bottom-bar">
      <button class="btn gold" data-a="${on(reroll)}">🎲 Случайное: ${STEPS[step].toLowerCase()}</button>
      ${step < 2 ? `<button class="btn" data-a="${on(() => mix(step + 1))}">Дальше →</button>` : `<button class="btn" data-a="${on(() => { G.tab = null; dressRoom(); })}">✨ Готово</button>`}
    </div>`, 'scene');
  reroll();
}

// ---------- НАСТРОЙКИ ----------
function settings() {
  const tg = (k, label) => `<div class="toggle">${label}<button class="switch ${S.settings[k] ? 'on' : ''}" data-a="${mon(() => {
    S.settings[k] = !S.settings[k]; st.save();
    if (k === 'sound') setSound(S.settings.sound);
    if (k === 'music') setMusic(S.settings.music);
    settings();
  })}"></button></div>`;
  modal(`<h3>⚙️ Настройки</h3>${tg('sound', '🔔 Звуки')}${tg('music', '🎵 Музыка')}
    <p style="margin-top:14px">Вещей в гардеробе: ${TOTAL} · Создано образов: ${S.stats.looks}</p>
    <div class="row"><button class="btn small white" data-a="${mon(() => { if (confirm('Начать игру заново? Все сохранённые образы пропадут.')) { st.reset(); location.reload(); } })}">Начать заново</button></div>
    <button class="x" data-a="${mon(closeModal)}">✕</button>`);
}

window.dressup = { G, S, ITEMS, BY_SLOT, go: { menu, places, princesses, dressRoom, scene, photo, looks, collection, tasks, randomLook, mix, settings }, startDress };
// Заставка ждёт только то, что нужно для меню; остальное грузится в фоне, пока девочка выбирает место.
const loadImg = (u) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = u; });
async function boot() {
  if (!READY.length || !BY_SLOT.dress?.length) return render('<p class="empty">Принцессы ещё рисуются… ✨</p>');
  const p0 = READY[0];
  const first = ['assets/bg/palace.jpg', ...layerSrcs({ pid: p0.id, outfit: { dress: BY_SLOT.dress[0].id, ...cleanOutfit(p0.outfit) } })];
  let n = 0;
  const tick = () => { const f = $('#barFill'); if (f) f.style.width = Math.round((++n / first.length) * 100) + '%'; };
  await Promise.race([Promise.all(first.map((u) => loadImg(u).then(tick))), new Promise((res) => setTimeout(res, 12000))]);
  menu();
  // фоновая подгрузка: принцессы в стартовых нарядах, фоны мест, миниатюры
  const rest = new Set();
  for (const p of READY) for (const u of layerSrcs({ pid: p.id, outfit: { dress: BY_SLOT.dress[0].id, ...cleanOutfit(p.outfit) } })) rest.add(u);
  for (const pl of OPEN_PLACES) rest.add(`assets/bg/${pl.id}.jpg`);
  for (const it of Object.values(ITEMS)) if (!it.variant) rest.add(thumbSrc(it));
  const q = [...rest];
  const worker = async () => { while (q.length) await loadImg(q.shift()); };
  worker(); worker(); worker();
}
boot();
