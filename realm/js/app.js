// «Сокрытая сила» — экраны. Правила — в engine.js, данные — в data.js.
import * as E from './engine.js';
import { HEROES, SKILLS, SKILL_MAX, skillNeed, LANDS, MONSTERS, MON_SHEETS, RANKS, RARITIES, SLOTS, KIND_NAME, KIND_SLOTS, ARTIFACTS, CONS, NODE_ICONS, STATS, ABILITY_TEXT } from './data.js';
import { LEVEL_INFO } from './bestiary.js';
import { sfx, toggleMute, isMuted } from './audio.js';
import * as ACC from './account.js';
import * as FX from './fx.js';

const V = 1; // поднять после замены картинок
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test') && /^(localhost|127.0.0.1)$/.test(location.hostname); // автопроверка — только на своём компьютере
const app = document.getElementById('app');

try { const r = await fetch(`assets/manifest.json?t=${Date.now()}`, { cache: 'no-store' }); if (r.ok) E.setAvailable(await r.json()); } catch { }

// Сохранение: у каждого ника своё, в браузере и на сервере (account.js). Без входа играть нельзя
// (кроме автопроверки ?test=1 — там гость).
const blank = () => ({ cur: null, heroes: {}, beasts: {}, rev: 0 });
const valid = (x) => x && typeof x === 'object' && x.heroes ? x : null;
let S = valid(ACC.account() || TEST ? ACC.loadLocal() : null) || blank();
for (const h of Object.values(S.heroes)) E.migrate(h);
const H = () => S.heroes[S.cur];
function save() {
  S.rev = (S.rev || 0) + 1;
  ACC.storeLocal(S);
  ACC.push(S);
}
// на сервере новее (играли с другого устройства) — берём его, если сейчас не идёт бой
ACC.onServerNewer((srv) => { if (valid(srv) && !battle) { S = srv; for (const h of Object.values(S.heroes)) E.migrate(h); ACC.storeLocal(S); toast('Загружено сохранение с другого устройства'); go(S.cur ? 'camp' : 'title'); } });

// ───────── картинки ─────────
const heroImg = (id) => `assets/heroes/${id}.jpg?v=${V}`;
const monImg = (id) => `assets/mon/${id}.webp?v=${V}`;
const itemImg = (name) => `assets/items/${name}.webp?v=${V}`;
const skillImg = (id) => itemImg(SKILLS[id].icon);
const monName = (t) => E.monDef(t).name;
// поле боя уровня — своё, если уже нарисовано, иначе фон земли
const levelBg = (L) => E.hasImg(`bg/lv${String(L).padStart(2, '0')}`) ? `lv${String(L).padStart(2, '0')}` : LANDS[E.landOf(L)].id;
const bgImg = (name) => `assets/bg/${name}.jpg?v=${V}`;
const IMG = (src, cls = '', alt = '') => `<img src="${src}" class="${cls}" alt="${alt}" loading="lazy" onerror="this.style.visibility='hidden'">`;
const consImg = (id) => itemImg(CONS[id].img);
const nodeImg = (n) => n.type === 'monster' ? monImg(n.mon) : itemImg(NODE_ICONS[n.type === 'chest' && n.gold ? 'goldchest' : n.type] || NODE_ICONS.portal);

const fmt = (n) => Math.round(n).toLocaleString('ru-RU');
const pct = (a, b) => `${Math.max(0, Math.min(100, (a / b) * 100))}%`;
const SPEED = Q.has('fast') ? 0.03 : 1; // ?fast — для автопроверки
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));
const rankName = (r) => RANKS[r].name;

function toast(text) {
  const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = text;
  document.body.appendChild(d); setTimeout(() => d.remove(), 2700);
}
function modal(html, cls = '') {
  closeModal();
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal';
  m.innerHTML = `<div class="panel ${cls}">${html}</div>`;
  m.addEventListener('click', onClick);
  document.body.appendChild(m);
  m.querySelectorAll('.center > img').forEach((i) => { i.style.cssText = 'width:150px;height:150px;object-fit:contain;filter:drop-shadow(0 8px 14px #000)'; });
}
function closeModal() { document.getElementById('modal')?.remove(); }

// ───────── обработка нажатий: data-a="действие" ─────────
const A = {};
function onClick(e) {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  e.stopPropagation();
  const f = A[b.dataset.a];
  if (f) { sfx.click(); f(b.dataset, b); }
}
app.addEventListener('click', onClick);

let screen = 'title';
function go(name, arg) {
  screen = name; closeModal(); window.scrollTo(0, 0); R[name](arg);
  // воздух над экраном: в землях — своё (споры, огоньки, пепел, снег), в лагере и меню — искры костра
  const inLand = ['level', 'levels', 'battle', 'find'].includes(name);
  const li = name === 'levels' ? curLand : E.landOf((H()?.at?.L) || curLevel);
  FX.setParticles(inLand ? FX.LAND_FX[LANDS[li].id] : 'embers');
  FX.tilt(app);
}
const R = {};

// ───────── верхняя полоса ─────────
function top() {
  const h = H(); const D = E.derive(h); const d = E.heroDef(h.id);
  return `<div class="top">
    ${IMG(heroImg(h.id), 'ava')}
    <div class="who"><div class="nm">${d.name} · ур. ${h.lvl}${h.points ? ` <span class="gold-t">(+${h.points})</span>` : ''}</div>
      <div class="bars"><div class="bar hp"><i style="width:${pct(h.hp, D.hpMax)}"></i><b>${fmt(h.hp)}/${fmt(D.hpMax)}</b></div>
      <div class="bar mp"><i style="width:${pct(h.mp, D.mpMax)}"></i><b>${fmt(h.mp)}/${fmt(D.mpMax)}</b></div>
      <div class="bar xp"><i style="width:${pct(h.xp, E.xpNeed(h.lvl))}"></i><b>опыт</b></div></div></div>
    <div class="gold">◈ ${fmt(h.gold)}</div>
    ${screen === 'battle' ? '' : `<button class="iconbtn" data-a="openHero" title="Герой">☰</button>`}
    <button class="iconbtn" data-a="mute" title="Звук">${isMuted() ? '🔇' : '🔊'}</button>
  </div>`;
}
A.mute = () => { toggleMute(); document.querySelectorAll('[data-a=mute]').forEach((b) => { b.textContent = isMuted() ? '🔇' : '🔊'; }); };
A.openHero = () => go('hero', screen);
const bg = (name, dim = false) => `<div class="bgimg ${dim ? 'dim' : ''}" style="background-image:url('${bgImg(name)}')"></div>`;

// ───────── заставка и вход ─────────
let authMode = 'login';
R.title = () => {
  const acc = ACC.account();
  const has = S.cur && H();
  const menu = acc || TEST
    ? `<div class="menu fadein" style="animation-delay:.5s">
        ${acc ? `<div class="hello">Странник <b>${esc(acc.nick)}</b></div>` : ''}
        ${has ? `<button class="btn big" data-a="continue">Продолжить</button>` : ''}
        <button class="btn ${has ? 'ghost' : 'big'}" data-a="toChoose">${has ? 'Герои' : 'Начать путь'}</button>
        ${acc ? '<button class="linkbtn" data-a="logout">Выйти из аккаунта</button>' : ''}</div>`
    : `<form class="auth frame fadein" style="animation-delay:.5s" id="authForm" autocomplete="on">
        <div class="tabs2"><button type="button" class="${authMode === 'login' ? 'on' : ''}" data-a="authTab" data-m="login">Вход</button>
          <button type="button" class="${authMode === 'register' ? 'on' : ''}" data-a="authTab" data-m="register">Регистрация</button></div>
        <label>Ник<input name="nick" maxlength="20" autocomplete="username" required placeholder="Как тебя зовут в этих землях"></label>
        <label>Пароль<input name="pass" type="password" maxlength="64" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" required placeholder="Не меньше 4 символов"></label>
        <div class="err" id="authErr"></div>
        <button class="btn big" type="submit">${authMode === 'login' ? 'Войти' : 'Создать героя-странника'}</button>
        <p class="muted small">${authMode === 'login' ? 'Нет аккаунта? Открой «Регистрацию».' : 'Прохождение сохранится на сервере — играй с любого устройства.'}</p>
      </form>`;
  app.innerHTML = `<div class="screen title-screen">${bg('title')}
    <div class="layer"><div class="logo">${'Сокрытая сила'.split('').map((c, i) => `<span style="animation-delay:${0.05 * i}s">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}<small>у каждого героя есть тайна</small></div>
    ${menu}</div></div>`;
  const f = document.getElementById('authForm');
  if (f) f.addEventListener('submit', onAuth);
};
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
A.authTab = ({ m }) => { authMode = m; R.title(); };
async function onAuth(e) {
  e.preventDefault();
  const f = e.target, err = document.getElementById('authErr'), btn = f.querySelector('[type=submit]');
  const nick = f.nick.value.trim(), pass = f.pass.value;
  btn.disabled = true; err.textContent = '';
  try {
    const got = await ACC.enter(authMode, nick, pass);
    S = valid(got) || blank();
    for (const h of Object.values(S.heroes)) E.migrate(h);
    ACC.storeLocal(S);
    sfx.reveal();
    toast(authMode === 'register' ? `Добро пожаловать, ${esc(nick)}!` : `С возвращением, ${esc(ACC.account().nick)}!`);
    R.title();
  } catch (x) { err.textContent = x.message; btn.disabled = false; sfx.hurt(); }
}
A.logout = () => { ACC.push(S, true); setTimeout(() => { ACC.logout(); S = blank(); authMode = 'login'; R.title(); }, 300); };
A.continue = () => resume();
A.toChoose = () => go('choose');

function resume() {
  const h = H();
  if (!h) return go('choose');
  if (h.battle) { battle = h.battle; return go('battle'); }
  if (h.at) curLevel = h.at.L;
  if (h.pendingFind) return go('find');
  go('camp');
}

// ───────── выбор героя: виден только облик ─────────
R.choose = () => {
  app.innerHTML = `<div class="screen">${bg('hall')}<div class="layer">
    <div class="hdr"><h1>Кого ты поведёшь во тьму?</h1>${S.cur ? `<button class="btn ghost small" data-a="back" data-to="title">Назад</button>` : ''}</div>
    <p class="muted">Имя и тайная сила героя откроются только после выбора. Выбирай по взгляду.</p>
    <div class="heroes">${HEROES.filter((d) => E.hasImg(`heroes/${d.id}`) || S.heroes[d.id]).map((d) => {
      const h = S.heroes[d.id];
      return `<button class="hcard tilt fadein" data-a="pickHero" data-id="${d.id}">${IMG(heroImg(d.id))}
        ${h ? '' : '<div class="seal">?</div>'}
        <div class="cap2">${h ? `<h3>${d.name}</h3><div class="q">ур. ${h.lvl} · ${d.power.name}</div>` : `<h3>???</h3><div class="q">Тайная сила скрыта</div>`}</div></button>`;
    }).join('')}</div></div></div>`;
};
A.back = (d) => go(d.to);
A.pickHero = ({ id }) => {
  if (S.heroes[id]) { S.cur = id; save(); return resume(); }
  modal(`<div class="center">${IMG(heroImg(id), '', '')}</div>
    <h2 class="center" style="margin-top:12px">Выбрать этого героя?</h2>
    <p class="center muted">Его имя и тайная сила откроются, только когда ты сделаешь выбор. Передумать будет нельзя — но других героев можно будет начать отдельно.</p>
    <div class="row" style="justify-content:center"><button class="btn" data-a="confirmHero" data-id="${id}">Выбираю</button><button class="btn ghost" data-a="closeM">Ещё посмотрю</button></div>`);
  document.querySelector('#modal img').style.cssText = 'width:100%;max-height:46vh;object-fit:cover;object-position:top;border-radius:12px';
};
A.closeM = () => closeModal();
A.confirmHero = ({ id }) => {
  S.heroes[id] = E.newHero(id); S.cur = id; save();
  go('reveal');
};

R.reveal = () => {
  const h = H(); const d = E.heroDef(h.id);
  sfx.reveal();
  app.innerHTML = `<div class="screen">${bg('hall', true)}<div class="layer reveal">
    <div class="portrait">${IMG(heroImg(h.id))}</div>
    <div><div class="muted cap">${d.title}</div><h1>${d.name}</h1>
      <div class="powerbox"><div class="k">Тайная сила</div><h2>${d.power.name}</h2><div>${d.power.text}</div></div>
      <div class="panel fadein" style="animation-delay:1.4s">${statBars(h, false)}
        <div class="spacer"></div><div class="muted">Умения: ${Object.keys(h.skills).map((k) => SKILLS[k].name).join(', ')}</div></div>
      <div class="spacer"></div><button class="btn big fadein" style="animation-delay:1.8s" data-a="toCamp">В лагерь</button></div></div></div>`;
};
A.toCamp = () => go('camp');

function statBars(h, editable) {
  const D = E.derive(h);
  return STATS.map((s) => `<div class="stat"><div>${s.name}<div class="muted" style="font-size:11px">${s.hint}</div></div>
    <div class="bar st"><i style="width:${pct(D.s[s.id], 40)}"></i></div><div class="v">${D.s[s.id]}</div>
    ${editable ? `<button class="plus" data-a="addStat" data-s="${s.id}" ${h.points ? '' : 'disabled'}>+</button>` : '<span></span>'}</div>`).join('');
}

// ───────── лагерь ─────────
R.camp = () => {
  const h = H(); const D = E.derive(h);
  const hurt = h.hp < D.hpMax || h.mp < D.mpMax;
  app.innerHTML = `${top()}<div class="screen">${bg('camp')}<div class="layer">
    <div class="hdr"><h1>Лагерь</h1><span class="muted">Уровень битв: <b class="gold-t">${h.maxLevel}</b> из ${E.LEVELS}${h.cycle ? ` · круг ${h.cycle + 1}` : ''}</span></div>
    <div class="camp-grid">
      <button class="tile tilt main" data-a="toLands">${IMG(itemImg('icons_9'))}<div><h3>Битвы</h3><span>уровень ${h.maxLevel}: десять монстров ждут</span></div></button>
      <button class="tile tilt" data-a="openHero">${IMG(heroImg(h.id), '', '')}<h3>Герой</h3><span>${h.points ? `<b class="gold-t">+${h.points} очка!</b>` : 'оружие, доспехи, артефакты, умения'}</span></button>
      <button class="tile tilt" data-a="toShop">${IMG(itemImg('icons_4'))}<h3>Магазин</h3><span>купить, улучшить, продать</span></button>
      <button class="tile" data-a="rest" ${hurt ? '' : 'disabled'}>${IMG(itemImg('icons_6'))}<h3>Отдых у костра</h3><span>${hurt ? (h.gold >= E.restCost(h) ? `полное здоровье — ${E.restCost(h)} ◈` : 'без денег — только до половины') : 'ты полон сил'}</span></button>
      <button class="tile" data-a="toChron">${IMG(itemImg('cons_6'))}<h3>Летопись</h3><span>монстры и артефакты</span></button>
      <button class="tile" data-a="toChoose">${IMG(itemImg('icons_7'))}<h3>Герои</h3><span>сменить героя</span></button>
    </div></div></div>`;
  const ti = app.querySelector('.tile:nth-child(2) img'); if (ti) ti.style.cssText = 'border-radius:50%;object-fit:cover;object-position:top';
};
A.toShop = () => go('shop');
A.toChron = () => go('chron');
A.toLands = () => go('lands');
A.rest = () => { const r = E.rest(H()); sfx.heal(); save(); toast(r.full ? 'Раны затянулись, мана полна' : 'Без денег — ночлег на голой земле: половина сил'); R.camp(); };

// ───────── герой: характеристики, шкала умений, снаряжение, сумка ─────────
let heroBack = 'camp';
R.hero = (from) => {
  if (from && from !== 'hero') heroBack = from;
  const h = H(); const d = E.heroDef(h.id); const D = E.derive(h);
  app.innerHTML = `${top()}<div class="screen">${bg('camp', true)}<div class="layer">
    <div class="hdr"><h1>${d.name}</h1><button class="btn ghost small" data-a="heroBack">Назад</button></div>
    <div class="cols">
      <div class="panel"><div class="row" style="align-items:flex-start;flex-wrap:nowrap">${IMG(heroImg(h.id), '', '')}
        <div><div class="muted">${d.title} · уровень <b class="gold-t">${h.lvl}</b></div>
        <div class="bar xp" style="margin:6px 0"><i style="width:${pct(h.xp, E.xpNeed(h.lvl))}"></i><b>${fmt(h.xp)} / ${fmt(E.xpNeed(h.lvl))}</b></div>
        <div class="powerbox" style="margin:8px 0;padding:10px;animation:none"><div class="k">Тайная сила</div><b class="gold-t">${d.power.name}</b><div style="font-size:13px">${d.power.text}</div></div></div></div>
        <h3 class="gold-t" style="margin-top:8px">Характеристики ${h.points ? `<span class="muted">— свободных очков: ${h.points}</span>` : ''}</h3>
        ${statBars(h, true)}
        <div class="derived" style="margin-top:10px">
          <div><b>${fmt(D.hpMax)}</b><span>здоровье</span></div><div><b>${fmt(D.mpMax)}</b><span>мана</span></div>
          <div><b>${fmt(D.atk)}</b><span>сила удара</span></div><div><b>${fmt(D.mpow)}</b><span>сила магии</span></div>
          <div><b>${fmt(D.def)}</b><span>защита</span></div><div><b>${Math.round(D.crit)}%</b><span>крит</span></div>
          <div><b>${Math.round(D.dodge)}%</b><span>уворот</span></div><div><b>${Math.round(D.leech)}%</b><span>вампиризм</span></div></div>
      </div>
      <div class="panel"><h3 class="gold-t">Шкала умений</h3><div class="muted" style="font-size:13px">Умение растёт, когда ты применяешь его в бою.</div>
        ${Object.entries(h.skills).map(([k, sk]) => `<div class="skill">${IMG(skillImg(k))}<div>
          <div class="t"><b>${SKILLS[k].name}</b><span>ур. ${sk.lvl}${sk.lvl >= SKILL_MAX ? ' (предел)' : ''}</span></div>
          <div class="d">${SKILLS[k].text}${SKILLS[k].cost ? ` Мана: ${SKILLS[k].cost}.` : ''}</div>
          <div class="bar sk"><i style="width:${sk.lvl >= SKILL_MAX ? '100%' : pct(sk.xp, skillNeed(sk.lvl))}"></i><b>${sk.lvl >= SKILL_MAX ? 'мастер' : `${sk.xp} / ${skillNeed(sk.lvl)}`}</b></div></div></div>`).join('')}
        <div class="muted" style="font-size:13px;margin-top:6px">Неизученных умений: ${Object.keys(SKILLS).length - Object.keys(h.skills).length}. Их открывают древние книги, отшельники и алтари.</div>
      </div>
    </div>
    <div class="spacer"></div>
    <div class="panel"><h3 class="gold-t">Снаряжение</h3><div class="spacer"></div>
      <div class="slots">${Object.keys(SLOTS).map((s) => { const it = h.eq[s]; return it
        ? `<button class="slot r${it.rarity}" data-a="itemInfo" data-where="eq" data-slot="${s}">${IMG(itemImg(it.img))}${it.plus ? `<span class="plus">+${it.plus}</span>` : ''}<span class="lbl">${SLOTS[s]}</span></button>`
        : `<div class="slot empty"><span class="lbl">${SLOTS[s]}</span></div>`; }).join('')}</div></div>
    <div class="spacer"></div>
    <div class="panel"><h3 class="gold-t">Сумка</h3><div class="spacer"></div>
      <div class="bag">${h.bag.length ? h.bag.map((it) => `<button class="itm r${it.rarity}" data-a="itemInfo" data-where="bag" data-uid="${it.uid}">${IMG(itemImg(it.img))}${it.plus ? `<span class="plus">+${it.plus}</span>` : ''}</button>`).join('') : '<span class="muted">Пусто</span>'}</div>
      <div class="spacer"></div><h3 class="gold-t">Припасы</h3><div class="spacer"></div>
      <div class="bag">${Object.keys(CONS).filter((k) => h.cons[k] > 0).map((k) => `<button class="itm" data-a="consInfo" data-id="${k}">${IMG(consImg(k))}<span class="cnt">${h.cons[k]}</span></button>`).join('') || '<span class="muted">Пусто</span>'}</div>
    </div></div></div>`;
  const pi = app.querySelector('.cols .panel img'); if (pi) pi.style.cssText = 'width:120px;height:150px;object-fit:cover;object-position:top;border-radius:10px;border:1px solid var(--gold);flex:none';
};
A.heroBack = () => go(heroBack === 'hero' ? 'camp' : heroBack);
A.addStat = ({ s }) => { if (E.spendPoint(H(), s)) { save(); R.hero(); } };

const LBL = { atk: 'Урон', def: 'Защита', hp: 'Здоровье', mp: 'Мана' };
const AFF = { str: 'к силе', agi: 'к ловкости', vit: 'к выносливости', mag: 'к магии', luck: 'к удаче', crit: '% крит', dodge: '% уворот', leech: '% вампиризм' };
function itemLines(it) {
  if (it.art) { const a = E.artDef(it.art); return `<ul class="ilines"><li class="gold-t">${a.text}</li><li>В бою: <b class="gold-t">${a.act.name}</b> — ${a.act.text}${a.act.cd >= 99 ? '' : ` (перезарядка ${a.act.cd} хода)`}</li></ul>`; }
  const k = 1 + 0.1 * (it.plus || 0);
  const out = [];
  for (const [key, v] of Object.entries(it.st)) {
    if (key === 'hpPct' || key === 'dmgPct') continue;
    if (LBL[key]) out.push(`<li>${LBL[key]} <b>${fmt(v * k)}</b></li>`);
    else if (AFF[key]) out.push(`<li class="${v < 0 ? 'down' : ''}">${v > 0 ? '+' : ''}${fmt(v)} ${AFF[key]}</li>`);
  }
  if (it.curse) out.push(`<li class="curse">Проклятие: ${it.curse}</li>`);
  return `<ul class="ilines">${out.join('')}</ul>`;
}
const itemHead = (it) => `<div class="iname" style="color:${RARITIES[it.rarity].color}">${it.name}${it.plus ? ` +${it.plus}` : ''}</div>
  <div class="muted">${it.art ? 'Артефакт' : `${KIND_NAME[it.slot] || SLOTS[it.slot]} · ${RARITIES[it.rarity].name} · ур. ${it.lvl}`}</div>`;

A.itemInfo = ({ where, slot, uid }) => {
  const h = H();
  const it = where === 'eq' ? h.eq[slot] : h.bag.find((x) => x.uid === uid);
  if (!it) return;
  let cmp = '';
  if (where === 'bag' && !it.art) {
    const cur = it.slot === 'ring' ? [h.eq.ring1, h.eq.ring2].sort((a, b) => E.itemScore(a, h) - E.itemScore(b, h))[0] : h.eq[it.slot];
    const d = Math.round(E.itemScore(it, h) - E.itemScore(cur, h));
    cmp = `<p>${cur ? `Сейчас надето: <b style="color:${RARITIES[cur.rarity].color}">${cur.name}${cur.plus ? ' +' + cur.plus : ''}</b>. ` : ''}
      ${d > 0 ? '<span style="color:var(--green)">▲ эта вещь сильнее</span>' : d < 0 ? '<span style="color:#ff7b6e">▼ эта вещь слабее</span>' : 'примерно одинаково'}</p>`;
  }
  const canSell = where === 'bag' && !it.art;
  modal(`<button class="close-x" data-a="closeM">×</button>
    <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><div class="slot r${it.rarity}" style="width:110px;flex:none">${IMG(itemImg(it.img))}</div>
    <div>${itemHead(it)}${itemLines(it)}</div></div>${cmp}
    <div class="row">${where === 'bag' ? (it.art
      ? KIND_SLOTS.art.map((sl, i) => `<button class="btn small" data-a="equip" data-uid="${it.uid}" data-slot="${sl}">В ${i + 1}-ю ячейку${h.eq[sl] ? ' (заменить)' : ''}</button>`).join('')
      : it.slot === 'ring' ? KIND_SLOTS.ring.map((sl, i) => `<button class="btn small" data-a="equip" data-uid="${it.uid}" data-slot="${sl}">На ${i ? 'правую' : 'левую'} руку${h.eq[sl] ? ' (заменить)' : ''}</button>`).join('')
      : `<button class="btn small" data-a="equip" data-uid="${it.uid}">Надеть</button>`)
      : `<button class="btn small ghost" data-a="unequip" data-slot="${slot}">Снять</button>`}
      ${canSell ? `<button class="btn small ghost" data-a="sell" data-uid="${it.uid}">Продать за ${E.sellPrice(it)} ◈</button>` : ''}</div>`);
};
A.equip = ({ uid, slot }) => { E.equip(H(), uid, slot); save(); closeModal(); R.hero(); };
A.unequip = ({ slot }) => { E.unequip(H(), slot); save(); closeModal(); R.hero(); };
A.sell = ({ uid }) => { const p = E.sell(H(), uid); sfx.coin(); toast(`+${p} ◈`); save(); closeModal(); screen === 'shop' ? R.shop() : R.hero(); };
A.consInfo = ({ id }) => {
  const h = H(); const c = CONS[id];
  const use = { hp: 'Выпить', mp: 'Выпить', elixir: 'Выпить', tome: 'Прочитать', whetstone: 'Наточить оружие' }[id];
  modal(`<button class="close-x" data-a="closeM">×</button><div class="row" style="flex-wrap:nowrap"><div class="slot" style="width:90px;flex:none">${IMG(consImg(id))}</div>
    <div><div class="iname gold-t">${c.name}</div><div>${c.text}</div><div class="muted">Есть: ${h.cons[id]}</div></div></div><div class="spacer"></div>
    ${use ? `<button class="btn small" data-a="useCons" data-id="${id}">${use}</button>` : '<span class="muted">Применяется в бою или на тропе.</span>'}`);
};
A.useCons = ({ id }) => {
  const h = H(); let msg = '';
  if (id === 'hp' || id === 'mp') { E.campPotion(h, id); sfx.heal(); msg = id === 'hp' ? 'Здоровье восстановлено' : 'Мана восстановлена'; }
  if (id === 'elixir') { const s = E.useElixir(h); sfx.level(); msg = `+1 ${AFF[s]}`; }
  if (id === 'tome') { const r = E.useTome(h); sfx.reveal(); msg = !r ? 'Книга молчит: ты знаешь всё' : r.learned ? `Новое умение: «${SKILLS[r.id].name}»!` : `«${SKILLS[r.id].name}» — уровень ${r.lvl}`; }
  if (id === 'whetstone') { const r = E.useWhetstone(h); msg = r ? 'Оружие стало острее: +1' : 'Нечего точить'; }
  save(); closeModal(); toast(msg); R.hero();
};

// ───────── магазин: купить, улучшить, продать ─────────
let shopTab = 'arms';
const flatLines = (it) => itemLines(it).replace(/<\/?ul[^>]*>/g, '').replace(/<li[^>]*>/g, '<span>').replace(/<\/li>/g, '</span> · ');
R.shop = () => {
  const h = H(); const shop = E.campShop(h); save();
  const tab = (id, t) => `<button class="${shopTab === id ? 'on' : ''}" data-a="shopTab" data-t="${id}">${t}</button>`;
  let body = '';
  if (shopTab === 'arms') body = `<p class="muted">Вещи на виду — со всеми свойствами. Новый товар привозят, когда герой растёт в уровне.</p>
    <div class="shop-list">${shop.wares.map((w, i) => `<div class="shop-item" style="${w.sold ? 'opacity:.35' : ''}">
      <div class="slot r${w.item.rarity}" style="width:56px">${IMG(itemImg(w.item.img))}</div>
      <div>${itemHead(w.item)}<div style="font-size:13px">${flatLines(w.item)}</div></div>
      ${w.sold ? '<span class="muted">продано</span>' : `<button class="btn small" data-a="buyWare" data-i="${i}" ${h.gold < E.warePrice(w.item) ? 'disabled' : ''}>${fmt(E.warePrice(w.item))} ◈</button>`}</div>`).join('')}</div>`;
  if (shopTab === 'boxes') body = `<p class="muted">Таинственные свёртки: видно только, как вещь выглядит. Внутри может быть легендарное сокровище… или проклятый хлам.</p>
    <div class="boxes" style="grid-template-columns:repeat(4,1fr)">${shop.boxes.map((b, i) => `<div class="box ${b.sold ? 'sold' : ''}">${IMG(itemImg(b.item.img))}
      ${b.sold ? '<div class="muted">продано</div>' : `<button class="btn small" data-a="buyBox" data-i="${i}" ${h.gold < E.mysteryPrice(h) ? 'disabled' : ''}>${fmt(E.mysteryPrice(h))} ◈</button>`}</div>`).join('')}</div>`;
  if (shopTab === 'cons') body = `<div class="shop-list">${['hp', 'mp', 'insight', 'escape', 'whetstone', 'tome', 'elixir'].map((k) => `<div class="shop-item">${IMG(consImg(k))}
      <div><b>${CONS[k].name}</b> <span class="muted">(есть ${h.cons[k] || 0})</span><div class="muted" style="font-size:13px">${CONS[k].text}</div></div>
      <button class="btn small" data-a="buyCons" data-id="${k}" ${h.gold < E.consPrice(h, k) ? 'disabled' : ''}>${fmt(E.consPrice(h, k))} ◈</button></div>`).join('')}</div>`;
  if (shopTab === 'smith') body = `<p class="muted">Каждое улучшение — +10% к силе вещи. Выше +3 появляется риск: при неудаче золото пропадает, вещь цела.</p>
    <div class="shop-list">${['weapon', 'offhand', 'helm', 'armor', 'cloak', 'gloves', 'belt', 'boots', 'amulet', 'ring1', 'ring2'].map((sl) => { const it = h.eq[sl]; if (!it) return '';
      const max = (it.plus || 0) >= 10;
      return `<div class="shop-item"><div class="slot r${it.rarity}" style="width:56px">${IMG(itemImg(it.img))}</div>
        <div><b style="color:${RARITIES[it.rarity].color}">${it.name}${it.plus ? ' +' + it.plus : ''}</b><div class="muted" style="font-size:13px">${SLOTS[sl]} · ${max ? 'предел мастерства' : `удача ${Math.round(E.upgradeChance(it, h) * 100)}%`}</div></div>
        ${max ? '' : `<button class="btn small" data-a="upgrade" data-slot="${sl}" ${h.gold < E.upgradeCost(it, h) ? 'disabled' : ''}>+${(it.plus || 0) + 1} за ${fmt(E.upgradeCost(it, h))} ◈</button>`}</div>`; }).join('') || '<span class="muted">Ничего не надето</span>'}</div>`;
  if (shopTab === 'sell') body = `<p class="muted">Нажми на вещь, чтобы рассмотреть и продать.</p><div class="bag">${h.bag.filter((x) => !x.art).map((it) => `<button class="itm r${it.rarity}" data-a="itemInfo" data-where="bag" data-uid="${it.uid}">${IMG(itemImg(it.img))}<span class="cnt gold-t">${E.sellPrice(it)}</span></button>`).join('') || '<span class="muted">Нечего продать</span>'}</div>`;
  app.innerHTML = `${top()}<div class="screen">${bg('camp', true)}<div class="layer">
    <div class="hdr"><h1>Магазин</h1><button class="btn ghost small" data-a="toCamp">В лагерь</button></div>
    <div class="tabs">${tab('arms', 'Оружейная')}${tab('boxes', 'Свёртки')}${tab('cons', 'Припасы')}${tab('smith', 'Кузнец')}${tab('sell', 'Продать')}</div>
    <div class="panel">${body}</div></div></div>`;
};
A.shopTab = ({ t }) => { shopTab = t; R.shop(); };
A.buyCons = ({ id }) => { if (E.buyCons(H(), id)) { sfx.coin(); save(); R.shop(); } };
A.buyWare = ({ i }) => { const it = E.buyWare(H(), +i); if (!it) return; sfx.coin(); save(); R.shop(); boughtModal(it, 'Покупка'); };
A.buyBox = ({ i }) => { const it = E.buyBox(H(), +i); if (!it) return; sfx.reveal(); save(); R.shop(); boughtModal(it, 'Свёрток раскрыт!'); };
function boughtModal(it, title) {
  modal(`<h2>${title}</h2><div class="row" style="flex-wrap:nowrap"><div class="slot r${it.rarity}" style="width:110px;flex:none">${IMG(itemImg(it.img))}</div><div>${itemHead(it)}${itemLines(it)}</div></div>
    <div class="row"><button class="btn small" data-a="equipShop" data-uid="${it.uid}">Надеть</button><button class="btn small ghost" data-a="closeM">В сумку</button></div>`);
}
A.equipShop = ({ uid }) => { E.equip(H(), uid); save(); closeModal(); R.shop(); };
A.upgrade = ({ slot }) => {
  const r = E.upgrade(H(), slot); if (!r) return;
  save(); R.shop();
  if (r.ok) { sfx.level(); toast('Удача! Вещь стала сильнее'); } else { sfx.hurt(); toast('Металл треснул… Золото потеряно'); }
};

// ───────── летопись ─────────
let chronTab = 'beasts';
R.chron = () => {
  const h = H();
  const all = [...MON_SHEETS.flat(), ...LEVEL_INFO.flatMap((l) => l.mons.map((m) => m.id))].filter((m) => E.hasImg(`mon/${m}`));
  app.innerHTML = `${top()}<div class="screen">${bg('camp', true)}<div class="layer">
    <div class="hdr"><h1>Летопись</h1><button class="btn ghost small" data-a="toCamp">В лагерь</button></div>
    <div class="tabs"><button class="${chronTab === 'beasts' ? 'on' : ''}" data-a="chronTab" data-t="beasts">Существа</button>
      <button class="${chronTab === 'arts' ? 'on' : ''}" data-a="chronTab" data-t="arts">Артефакты</button><button class="${chronTab === 'heroes' ? 'on' : ''}" data-a="chronTab" data-t="heroes">Герои</button></div>
    <div class="panel">${chronTab === 'beasts' ? `<p class="muted">Встречено ${all.filter((m) => S.beasts[m]).length} из ${all.length}. Имя и повадки существа узнаёшь, только одолев его.</p>
      <div class="bestiary">${all.map((m) => { const b = S.beasts[m]; const k = b?.kills;
        return `<div class="beast ${b ? '' : 'unseen'}">${IMG(monImg(m))}<b>${k ? monName(m) : '???'}</b>
        ${k ? `<div class="muted">побеждено: ${k} · до ур. ${b.maxLv}</div><div style="font-size:12px">${E.monDef(m).ab.map((a) => ABILITY_TEXT[a]).join(', ')}</div>` : b ? '<div class="muted">видел, но не одолел</div>' : '<div class="muted">не встречено</div>'}</div>`; }).join('')}</div>`
    : chronTab === 'arts' ? `<p class="muted">Артефакты лежат в тайниках, у хозяев земель и у Чёрного странника. Каждый — один на свете.</p>
      <div class="bestiary">${ARTIFACTS.map((a) => { const f = h.arts.includes(a.id);
        return `<div class="beast ${f ? '' : 'unseen'}">${IMG(itemImg(a.img))}<b>${f ? a.name : '???'}</b><div style="font-size:12px">${f ? a.text : 'не найден'}</div></div>`; }).join('')}</div>`
    : `<div class="bestiary">${HEROES.map((d) => { const x = S.heroes[d.id];
        return `<div class="beast">${IMG(heroImg(d.id))}<b>${x ? d.name : '???'}</b><div style="font-size:12px">${x ? `ур. ${x.lvl} · <span class="gold-t">${d.power.name}</span>: ${d.power.text}` : 'Тайная сила скрыта'}</div></div>`; }).join('')}</div>`}
    </div></div></div>`;
  app.querySelectorAll('.beast img').forEach((i) => { if (chronTab === 'heroes') i.style.cssText = 'aspect-ratio:2/3;object-fit:cover;border-radius:8px'; });
};
A.chronTab = ({ t }) => { chronTab = t; R.chron(); };

// ───────── битвы: земли → уровни → 10 монстров ─────────
const landOpen = (h, i) => i <= E.landOf(h.maxLevel);
R.lands = () => {
  const h = H();
  app.innerHTML = `${top()}<div class="screen">${bg('camp', true)}<div class="layer">
    <div class="hdr"><h1>Битвы</h1><button class="btn ghost small" data-a="toCamp">В лагерь</button></div>
    <p class="muted">Шесть земель, в каждой по 10 уровней. На каждом уровне — десять монстров. Чтобы пройти уровень, победи семерых. На каждом десятом уровне среди них прячется хозяин земли.</p>
    <div class="mapwrap">${IMG(bgImg('map'))}
      ${LANDS.map((L, i) => { const st = i <= h.cleared ? 'cleared' : landOpen(h, i) ? 'next' : 'locked';
        return `<button class="land ${st}" style="left:${L.x}%;top:${L.y}%" data-a="landLevels" data-i="${i}"><span class="pin">${st === 'locked' ? '🔒' : st === 'cleared' ? '♛' : i + 1}</span><span class="nm">${L.name}</span></button>`; }).join('')}
    </div></div></div>`;
};
let curLand = 0;
A.landLevels = ({ i }) => { if (!landOpen(H(), +i)) return toast('Земля закрыта: одолей хозяина прошлой'); curLand = +i; go('levels'); };
R.levels = () => {
  const h = H(); const li = curLand; const L0 = li * E.PER_LAND + 1;
  app.innerHTML = `${top()}<div class="screen">${bg(LANDS[li].id)}<div class="layer">
    <div class="hdr"><h1>${LANDS[li].name}</h1><button class="btn ghost small" data-a="toLands">К карте</button></div>
    <div class="lvgrid">${Array.from({ length: E.PER_LAND }, (_, k) => { const L = L0 + k; const st = h.levels[L];
      const state = st?.cleared ? 'done' : L === h.maxLevel ? 'cur' : L < h.maxLevel ? 'done' : 'locked';
      return `<button class="lv ${state} ${E.isBossLevel(L) ? 'boss' : ''}" data-a="openLevel" data-l="${L}" title="${LEVEL_INFO[L - 1].name}" ${state === 'locked' ? 'disabled' : ''}>
        <b>${L}</b><span>${state === 'locked' ? '🔒' : E.isBossLevel(L) && !st?.cleared ? '☠ хозяин' : st ? `${Math.min(st.wins, E.NEED_WINS)}/${E.NEED_WINS}` : 'новый'}</span>${st?.cleared ? '<i>✓</i>' : ''}</button>`; }).join('')}</div>
  </div></div>`;
};
let curLevel = 1;
A.openLevel = ({ l }) => { curLevel = +l; E.enterLevel(H(), curLevel); save(); go('level'); };
const seesAll = (h) => E.power(h) === 'beasteye' || E.hasArt(h, 'eye');
R.level = () => {
  const h = H(); const L = curLevel; const st = h.levels[L] || E.enterLevel(h, L); const li = E.landOf(L);
  const see = seesAll(h) || st.revealed;
  app.innerHTML = `${top()}<div class="screen">${bg(levelBg(L))}<div class="layer">
    <div class="hdr"><h1>Уровень ${L} · ${LEVEL_INFO[L - 1].name}</h1><span class="muted">${LANDS[li].name} · побед <b class="gold-t">${st.wins}</b> из ${E.NEED_WINS}${st.cleared ? ' · <b style="color:var(--green)">пройден</b>' : ''}</span></div>
    <p class="center muted">${see ? 'Ты видишь силу каждого.' : 'Кто из них слабый, а кто смертельно опасен — не знает никто. Выбирай.'}</p>
    <div class="mgrid">${st.cards.map((c, i) => `<button class="mcard tilt ${c.done ? 'done' : ''} ${c.boss ? 'boss' : ''}" data-a="pickMon" data-i="${i}" ${c.done ? 'disabled' : ''}>
      ${IMG(monImg(c.mon))}
      <span class="ml">${c.done ? `побеждён · ур. ${c.lv}` : c.boss ? '<b class="rank2">Хозяин земли</b>' : see ? `ур. ${c.lv} · <span class="rank${c.rank}">${rankName(c.rank)}</span>` : 'ур. ??'}</span>
      ${c.done ? '<i class="x">✓</i>' : ''}</button>`).join('')}</div>
    <div class="spacer"></div>
    <div class="row" style="justify-content:center">
      ${!see && h.cons.insight > 0 ? `<button class="btn small" data-a="insightLevel">Свиток прозрения (${h.cons.insight})</button>` : ''}
      ${st.cleared ? '<button class="btn small ghost" data-a="reroll">Новые монстры</button>' : ''}
      ${st.cleared && L < E.LEVELS && L + 1 <= h.maxLevel ? `<button class="btn small" data-a="nextLevel">Уровень ${L + 1} →</button>` : ''}
      <button class="btn small ghost" data-a="backLevels">К уровням</button><button class="btn small ghost" data-a="toCamp">В лагерь</button></div>
  </div></div>`;
};
A.backLevels = () => { curLand = E.landOf(curLevel); go('levels'); };
A.nextLevel = () => { if (curLevel + 1 <= H().maxLevel) { curLevel++; E.enterLevel(H(), curLevel); save(); go('level'); } };
A.insightLevel = () => { const h = H(); if (h.cons.insight > 0) { h.cons.insight--; h.levels[curLevel].revealed = true; sfx.reveal(); save(); R.level(); } };
A.reroll = () => { E.rerollLevel(H(), curLevel); sfx.flip(); save(); R.level(); };

// ───────── встреча: облик виден, сила — нет ─────────
let curIdx = 0;
A.pickMon = ({ i }) => {
  const h = H(); const n = h.levels[curLevel].cards[+i]; curIdx = +i;
  const sees = seesAll(h) || h.levels[curLevel].revealed;
  const known = S.beasts[n.mon]?.kills > 0;
  S.beasts[n.mon] = S.beasts[n.mon] || { kills: 0, maxLv: 0 };
  save();
  const mon = E.makeMonster(n.mon, n.lv, n.rank, h, n.boss);
  sfx.roar();
  if (n.boss) { FX.banner('Хозяин земли', monName(n.mon), 'red'); FX.shake(1.2); }
  modal(`<div class="mon appear" style="height:min(46vh,380px)">${IMG(monImg(n.mon))}</div>
    <h2 class="center">${n.boss ? `Хозяин земли: ${monName(n.mon)}` : known ? monName(n.mon) : 'Неизвестное существо'}</h2>
    <p class="center">${sees ? `Уровень <b>${n.lv}</b> · <span class="rank${n.rank}">${rankName(n.rank)}</span> · здоровье ${fmt(mon.hpMax)} · удар ~${fmt(mon.atk)}` : 'Уровень: <b>??</b> · Сила: <b>??</b>'}</p>
    <p class="center muted">${sees ? 'Его сила раскрыта.' : 'Такие же твари бывают и слабыми, и смертельно опасными. Рискнёшь?'}</p>
    <div class="row" style="justify-content:center"><button class="btn red" data-a="attack">Напасть</button><button class="btn ghost" data-a="closeM">Выбрать другого</button></div>`);
};
A.attack = () => { closeModal(); const h = H(); h.at = { L: curLevel, i: curIdx }; startFight(h.levels[curLevel].cards[curIdx], false); };

// ───────── бой ─────────
let battle = null, busy = false, logLines = [];
function startFight(node, amb) {
  const h = H();
  battle = E.startBattle(h, node);
  battle.known = S.beasts[node.mon]?.kills > 0 || !!node.boss;
  h.battle = battle; logLines = [];
  save();
  busy = !!amb; // монстр бьёт первым — до его удара кнопки закрыты
  go('battle');
  if (amb) {
    const B = battle;
    setTimeout(async () => {
      try { if (battle === B && !B.over) await play(E.ambush(h, B)); } finally { busy = false; }
      if (battle === B) after();
    }, 700);
  }
}

R.battle = () => {
  const h = H(); const B = battle; if (!B) return go('path');
  const L = LANDS[E.landOf(h.at?.L || curLevel)];
  app.innerHTML = `${top()}<div class="screen">${bg(levelBg(h.at?.L || curLevel))}<div class="layer">
    <div class="arena">
      <div class="hside" id="hside"><div class="card">${IMG(heroImg(h.id))}</div>
        <div><div class="cap gold-t" style="font-size:20px">${E.heroDef(h.id).name}</div>
        <div class="bars2"><div class="bar hp"><i id="hhp"></i><b id="hhpt"></b></div><div class="bar mp"><i id="hmp"></i><b id="hmpt"></b></div></div>
        <div class="statuses" id="hst" style="justify-content:flex-start"></div></div></div>
      <div class="mside"><div class="mhead"><div class="nm" id="mname"></div><div class="lv" id="mlv"></div>
        <div class="bar hp"><i id="mhp"></i><b id="mhpt"></b></div><div class="statuses" id="mst"></div></div>
        <div class="mon appear" id="mon">${IMG(monImg(B.mon.type))}</div></div>
    </div>
    <div class="log" id="log"></div>
    <div class="actions" id="acts"></div>
  </div></div>`;
  updBattle();
};

function updBattle() {
  const h = H(), B = battle, D = E.derive(h), m = B.mon;
  const $ = (id) => document.getElementById(id);
  if (!$('hhp')) return;
  $('hhp').style.width = pct(h.hp, D.hpMax); $('hhpt').textContent = `${fmt(Math.max(0, h.hp))} / ${fmt(D.hpMax)}`;
  $('hmp').style.width = pct(h.mp, D.mpMax); $('hmpt').textContent = `${fmt(h.mp)} / ${fmt(D.mpMax)}`;
  $('mname').textContent = m.boss ? m.name : B.known ? m.name : 'Неизвестное существо';
  $('mlv').innerHTML = B.revealed ? `Уровень <b>${m.lv}</b> · <span class="rank${m.rank}">${rankName(m.rank)}</span>` : 'Уровень <b>??</b> · сила неизвестна';
  $('mhp').style.width = pct(m.hp, m.hpMax); $('mhpt').textContent = B.revealed ? `${fmt(m.hp)} / ${fmt(m.hpMax)}` : '???';
  const hs = [], ms = [];
  if (B.hst.poison) hs.push('☠ яд'); if (B.hst.burn) hs.push('🔥 огонь'); if (B.hst.curse) hs.push('проклятие'); if (B.hst.stun) hs.push('оглушён'); if (B.hst.stoneskin) hs.push('🪨 кожа');
  if (m.st.poison) ms.push('☠ яд'); if (m.st.burn) ms.push('🔥 горит'); if (m.st.stun) ms.push('❄ скован'); if (m.st.armor) ms.push('🛡 броня'); if (m.st.enrage) ms.push(`ярость ×${m.st.enrage}`); if (m.st.charging) ms.push('⚠ готовит удар');
  $('hst').innerHTML = hs.map((x) => `<span>${x}</span>`).join(''); $('mst').innerHTML = ms.map((x) => `<span>${x}</span>`).join('');
  $('log').innerHTML = logLines.slice(-4).map((l) => `<div>${l}</div>`).join('');
  const acts = Object.entries(h.skills).map(([k, sk]) => `<button class="act" data-a="bAct" data-t="skill" data-id="${k}" ${h.mp < SKILLS[k].cost ? 'disabled' : ''}>
      ${IMG(skillImg(k))}<span>${SKILLS[k].name}</span><span class="c">${SKILLS[k].cost ? SKILLS[k].cost + ' маны' : 'без маны'}</span><span class="l">${sk.lvl}</span>
      <span class="xpl"><i style="width:${sk.lvl >= SKILL_MAX ? '100%' : pct(sk.xp, skillNeed(sk.lvl))}"></i></span></button>`);
  for (const id of E.equippedArts(h)) {
    const a = E.artDef(id), cd = B.cd?.[id] || 0;
    acts.push(`<button class="act artact" data-a="bAct" data-t="art" data-id="${id}" ${cd ? 'disabled' : ''} title="${a.act.text}">${IMG(itemImg(a.img))}<span>${a.act.name}</span><span class="c">${cd >= 99 ? 'использован' : cd ? `через ${cd}` : a.act.cd >= 99 ? 'раз за бой' : 'готов'}</span></button>`);
  }
  acts.push(`<button class="act" data-a="bAct" data-t="defend">${IMG(itemImg('skills_9'))}<span>Защита</span><span class="c">+мана</span></button>`);
  acts.push(`<button class="act" data-a="bAct" data-t="potion" data-id="hp" ${h.cons.hp ? '' : 'disabled'}>${IMG(consImg('hp'))}<span>Зелье</span><span class="c">есть ${h.cons.hp}</span></button>`);
  acts.push(`<button class="act" data-a="bAct" data-t="potion" data-id="mp" ${h.cons.mp ? '' : 'disabled'}>${IMG(consImg('mp'))}<span>Мана</span><span class="c">есть ${h.cons.mp}</span></button>`);
  if (!B.revealed && h.cons.insight) acts.push(`<button class="act" data-a="bAct" data-t="scroll" data-id="insight">${IMG(consImg('insight'))}<span>Прозрение</span><span class="c">есть ${h.cons.insight}</span></button>`);
  if (!m.boss && h.cons.escape) acts.push(`<button class="act" data-a="bAct" data-t="scroll" data-id="escape">${IMG(consImg('escape'))}<span>Свиток побега</span><span class="c">есть ${h.cons.escape}</span></button>`);
  if (!m.boss) acts.push(`<button class="act flee" data-a="bAct" data-t="flee"><span style="font-size:30px">🏃</span><span>Бежать</span><span class="c">повезёт ли?</span></button>`);
  $('acts').innerHTML = acts.join('');
  $('acts').classList.toggle('locked', busy);
}

A.bAct = async ({ t, id }) => {
  if (busy || !battle) return;
  if (battle.over) return after();
  busy = true; updBattle();
  try {
    const ev = E.heroAct(H(), battle, { type: t, id });
    if (!ev.length && !battle.over) { busy = false; updBattle(); return; }
    await play(ev);
  } finally { busy = false; }
  after();
};

function floatAt(el, text, cls = '') {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const d = document.createElement('div'); d.className = `float ${cls}`; d.textContent = text;
  d.style.left = `${r.left + r.width * (0.35 + Math.random() * 0.3)}px`; d.style.top = `${r.top + r.height * 0.3}px`;
  document.body.appendChild(d); setTimeout(() => d.remove(), 1150);
}
function flash(color) { const d = document.createElement('div'); d.className = 'flash'; d.style.background = color; document.body.appendChild(d); setTimeout(() => d.remove(), 420); }
function anim(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

async function play(ev) {
  const monEl = () => document.querySelector('#mon img'), heroEl = () => document.querySelector('#hside .card');
  for (const e of ev) {
    const skillName = e.skill ? SKILLS[e.skill].name : '';
    if (e.who === 'mon' && e.kind === 'hit') {
      if (!e.quiet) { (e.crit ? sfx.crit : SKILLS[e.skill]?.kind === 'magic' ? sfx.magic : sfx.hit)(); if (e.crit) flash('rgba(255,210,120,.35)'); }
      anim(document.getElementById('mon'), 'hurt');
      floatAt(monEl(), `${e.n}`, e.crit ? 'crit' : '');
      if (!e.quiet) {
        const magic = SKILLS[e.skill]?.kind === 'magic';
        const col = e.skill === 'fire' ? '#ff8a3a' : e.skill === 'ice' ? '#9fe6ff' : e.skill === 'poison' ? '#8dff6a' : magic ? '#b48cff' : '#ffe2a0';
        if (!magic) FX.slash(monEl(), col);
        FX.burst(monEl(), { color: col, n: e.crit ? 34 : 16, big: e.crit });
        if (e.crit) FX.shake(1.4);
      }
      if (!e.quiet) logLines.push(e.text || `${skillName || 'Удар'}: ${e.n}${e.crit ? ' — КРИТ!' : ''}`);
    } else if (e.who === 'hero' && e.kind === 'hit') {
      sfx.hurt(); anim(document.getElementById('hside'), 'hurt'); flash('rgba(200,20,10,.28)');
      FX.burst(heroEl(), { color: '#ff4a3a', n: 12 }); FX.shake(e.n > E.derive(H()).hpMax * 0.2 ? 1.3 : 0.6);
      floatAt(heroEl(), `−${e.n}`);
      logLines.push(`${e.text ? e.text + ': ' : 'Враг бьёт: '}−${e.n}`);
    } else if (e.kind === 'heal') {
      if (!e.quiet) sfx.heal();
      floatAt(e.who === 'hero' ? heroEl() : monEl(), `+${e.n}`, 'heal');
      if (!e.quiet) logLines.push(e.who === 'hero' ? `${skillName || 'Лечение'}: +${e.n} здоровья` : `${e.text}: +${e.n}`);
    } else if (e.kind === 'dot') {
      floatAt(e.who === 'hero' ? heroEl() : monEl(), `${e.who === 'hero' ? '−' : ''}${e.n}`);
      logLines.push(`${e.who === 'hero' ? 'Тебя жжёт' : 'Враг страдает'} (${e.text}): ${e.n}`);
    } else if (e.kind === 'dodge') { sfx.dodge(); floatAt(heroEl(), 'Уворот', 'miss'); logLines.push('Ты увернулся!'); }
    else if (e.kind === 'skillup') { sfx.level(); FX.burst(heroEl(), { color: '#9ff0b0', n: 24 }); toast(`«${SKILLS[e.id].name}» — уровень ${e.lvl}!`); logLines.push(`Умение «${SKILLS[e.id].name}» выросло до ${e.lvl}`); }
    else if (e.kind === 'revive') { sfx.reveal(); flash('rgba(255,220,140,.5)'); FX.banner('Восстал!', '', 'gold'); logLines.push(`<b class="gold-t">${e.text}</b>`); }
    else if (e.kind === 'reveal') { sfx.reveal(); logLines.push(e.text); }
    else if (e.kind === 'art') { sfx.magic(); FX.burst(heroEl(), { color: '#ffd77a', n: 30, big: true }); flash('rgba(255,215,120,.3)'); logLines.push(`<b class="gold-t">${e.text}</b>`); }
    else if (e.kind === 'charge') { sfx.roar(); FX.shake(0.8); logLines.push(`<b class="rank2">${e.text}</b>`); }
    else if (e.kind === 'mana') { sfx.heal(); logLines.push(`+${e.n} маны`); }
    else if (e.text) logLines.push(e.text);
    updBattle();
    await sleep(e.quiet ? 120 : 430);
  }
}

async function after() {
  const h = H(), B = battle;
  if (!B) return;
  save();
  if (!B.over) return updBattle();
  if (B.over === 'win') {
    sfx.win(); anim(document.getElementById('mon'), 'dead');
    const b = S.beasts[B.mon.type] = S.beasts[B.mon.type] || { kills: 0, maxLv: 0 };
    const first = !b.kills;
    b.kills++; b.maxLv = Math.max(b.maxLv, B.mon.lv);
    const r = E.victory(h, B);
    h.battle = null; battle = null;
    const lv = h.at ? E.levelWin(h, h.at.L, h.at.i) : {};
    if (r.find) h.pendingFind = { opts: r.find, title: B.mon.boss ? 'Сокровища хозяина' : 'Добыча', text: 'Выбери одну находку — по облику. Что это на самом деле, узнаешь, только взяв.' };
    h.afterWin = lv.finale ? 'finale' : null;
    save();
    await sleep(900);
    const up = r.ev.filter((e) => e.kind === 'levelup').pop();
    if (up) { sfx.level(); FX.banner('Новый уровень', `герой достиг ${up.lvl}-го · +3 очка характеристик`); await sleep(1500); }
    else if (lv.land != null) { FX.banner('Земля свободна', LANDS[lv.land].name); await sleep(1500); }
    else if (lv.cleared) { FX.banner(`Уровень ${h.at.L} пройден`, lv.unlocked ? `открыт уровень ${lv.unlocked}` : ''); await sleep(1300); }
    modal(`<h2 class="center">Победа!</h2>
      <p class="center">Ты одолел: <b class="rank${B.mon.rank}">${rankName(B.mon.rank)}</b> <b>${B.mon.name}</b>, уровень <b>${B.mon.lv}</b>${first ? ' <span class="gold-t">— записано в летопись</span>' : ''}</p>
      <p class="center">+${fmt(r.xp)} опыта · <span class="gold-t">+${fmt(r.gold)} ◈</span></p>
      ${lv.cleared ? `<p class="center gold-t">Уровень ${h.at.L} пройден!${lv.unlocked ? ` Открыт уровень ${lv.unlocked}.` : ''}</p>` : ''}
      ${lv.land != null ? `<p class="center gold-t">Хозяин земли «${LANDS[lv.land].name}» повержен!${lv.land + 1 < LANDS.length ? ` Открыта земля «${LANDS[lv.land + 1].name}».` : ''}</p>` : ''}
      <div class="row" style="justify-content:center"><button class="btn" data-a="afterWin">${r.find ? 'К добыче' : 'Дальше'}</button></div>`);
    return;
  }
  if (B.over === 'lose') {
    sfx.death();
    h.battle = null; battle = null; h.at = null;
    const r = E.die(h); save();
    return go('dead', r);
  }
  // бегство или золотой голем ушёл — монстр остаётся на уровне
  h.battle = null; battle = null; h.at = null; save();
  toast(B.over === 'escaped' ? 'Голем ушёл под землю' : 'Ты ушёл от боя');
  await sleep(600);
  go('level');
}
A.afterWin = () => {
  closeModal();
  const h = H();
  if (h.pendingFind) return go('find');
  afterNode();
};
function afterNode() {
  const h = H(); h.at = null;
  if (h.afterWin === 'finale') { h.afterWin = null; save(); return go('finale'); }
  save();
  go('level');
}

// ───────── выбор находки по облику ─────────
function showFind(opts, title, text) { const h = H(); h.pendingFind = { opts, title, text }; save(); go('find'); }
R.find = () => {
  const h = H(); const P = h.pendingFind; if (!P) return afterNode();
  const lucky = E.power(h) === 'luckyhand';
  const L = LANDS[E.landOf(h.at?.L || curLevel)];
  app.innerHTML = `${top()}<div class="screen">${bg(L.id, true)}<div class="layer center">
    <h1 class="gold-t" style="font-size:40px">${P.title}</h1><p>${P.text}</p>
    ${lucky ? '<p class="muted">Рука удачи: ты чувствуешь, какая находка ценнее, по её свечению.</p>' : ''}
    <div class="finds">${P.opts.map((o, i) => { const img = o.item ? o.item.img : CONS[o.cons].img; const r = o.item ? o.item.rarity : 0;
      return `<button class="fcard ${P.taken != null ? 'open' : ''} ${P.taken != null && P.taken !== i ? 'missed' : ''} ${P.taken === i ? 'taken' : ''}" data-a="takeFind" data-i="${i}">
        <div class="face front ${lucky ? 'glow' + r : ''}">${IMG(itemImg(img))}<div class="qm">?</div></div>
        <div class="face back">${IMG(itemImg(img))}${o.item ? itemHead(o.item) + itemLines(o.item) : `<div class="iname gold-t">${CONS[o.cons].name}${o.n > 1 ? ' ×' + o.n : ''}</div><div>${CONS[o.cons].text}</div>`}</div></button>`; }).join('')}</div>
    <div class="spacer"></div><div id="findBtns" class="row" style="justify-content:center">${P.taken != null ? findButtons(P) : ''}</div>
  </div></div>`;
};
function findButtons(P) {
  const o = P.opts[P.taken];
  const eq = o.item && H().bag.some((x) => x.uid === o.item.uid);
  return `${eq ? `<button class="btn" data-a="findEquip">Надеть сейчас</button>` : ''}<button class="btn ${eq ? 'ghost' : ''}" data-a="findNext">${eq ? 'В сумку и дальше' : 'Дальше'}</button>`;
}
A.takeFind = async ({ i }) => {
  const h = H(); const P = h.pendingFind;
  if (!P || P.taken != null) return;
  P.taken = +i;
  E.takeFind(h, P.opts[+i]);
  save();
  const cards = [...document.querySelectorAll('.fcard')];
  sfx.flip(); cards[+i].classList.add('open', 'taken', 'rr' + (P.opts[+i].item?.rarity ?? 0));
  const o = P.opts[+i];
  setTimeout(() => { const r = o.item?.rarity ?? 0; (r >= 3 && r !== 5 ? sfx.reveal : r === 5 ? sfx.hurt : sfx.coin)(); if (o.item?.art) FX.banner('Артефакт!', o.item.name); else if (r === 4) FX.banner('Легендарная', o.item.name); }, 500);
  await sleep(1100);
  cards.forEach((c, k) => { if (k !== +i) { c.classList.add('open', 'missed'); } });
  sfx.flip();
  document.getElementById('findBtns').innerHTML = findButtons(P);
};
A.findEquip = () => { const h = H(); const o = h.pendingFind.opts[h.pendingFind.taken]; E.equip(h, o.item.uid); toast('Надето'); A.findNext(); };
A.findNext = () => { const h = H(); h.pendingFind = null; save(); afterNode(); };

// ───────── гибель и финал ─────────
R.dead = (r) => {
  app.innerHTML = `<div class="screen title-screen">${bg(LANDS[0].id, true)}<div class="layer">
    <div class="logo" style="color:#d0443a;text-shadow:0 0 30px rgba(255,40,30,.5),0 6px 20px #000">Ты пал</div>
    <div class="panel" style="max-width:520px;margin:24px auto 0">
      <p>Тьма сомкнулась… Но кто-то вынес тебя к лагерю. Раны залечены.</p>
      <p>Потеряно золота: <b class="gold-t">${fmt(r?.lostGold || 0)} ◈</b></p>
      <p class="muted">Уровень, умения, вещи и пройденные уровни остались с тобой.</p>
      <button class="btn big" data-a="toCamp">Очнуться в лагере</button></div></div></div>`;
};
R.finale = () => {
  const h = H(); sfx.win();
  app.innerHTML = `<div class="screen title-screen">${bg('castle', true)}<div class="layer">
    <div class="logo">Король-Лич повержен</div>
    <div class="panel" style="max-width:560px;margin:24px auto 0"><p>Зелёное пламя в глазницах погасло. Земли свободны — ${E.heroDef(h.id).name} войдёт в легенды.</p>
      <p>Но тьма не умирает навсегда. Начать <b class="gold-t">новый круг</b>? Все 60 уровней начнутся заново, монстры станут сильнее на 12 уровней, а добыча — богаче. Уровень героя, вещи и умения останутся.</p>
      <div class="row" style="justify-content:center"><button class="btn big" data-a="newCycle">Новый круг</button><button class="btn ghost" data-a="toCamp">Отдохнуть в лагере</button></div></div></div></div>`;
};
A.newCycle = () => { E.startNewCycle(H()); save(); go('camp'); toast('Тьма вернулась. Земли снова закрыты'); };

// ───────── запуск ─────────
if (TEST) window.realm = { get S() { return S; }, E, go, save, H, ACC, get battle() { return battle; } };
FX.startParticles(); FX.parallax();
if (Q.get('go') && S.cur) go(Q.get('go')); else go('title');
// при запуске сверить с сервером: вдруг играли с другого устройства
ACC.pull().then((srv) => { if (valid(srv) && (srv.rev || 0) > (S.rev || 0) && !battle) { S = srv; for (const h of Object.values(S.heroes)) E.migrate(h); ACC.storeLocal(S); if (screen === 'title') R.title(); } });
