// Экран автомата: барабаны, ставка, автоигра, помощники, бонус-игры, бесплатные вращения, «Купить бонус».
import { betsOf, JACKPOT_SEED, JACKPOT_SHARE, JACKPOTS, BUY_BONUS, COMMON, asset, GIFT_WILD_CHANCE, BOOSTERS, RAIN_WILD, GRAND_MIN } from './machines.js';
import { buildStrips, resolveSpin, fsMultipliers, streakMultiplier, LINES, REELS } from './engine.js';
import { ReelView, LINE_COLORS } from './reels.js';
import * as MEGA from './mega.js';
import { MegaReelView } from './megareels.js';
import { state, save, betFor } from './state.js';
import { sfx } from './audio.js';
import { fmt, sleep, esc, plural, Counter, pic, symPic, logoPic, wireAll, layer, modal, anyModal, toast, coinShower, hud, topRight, wireTop, giftModal } from './ui.js';
import { track, flush, levelInfo } from './meta.js';
import { pickGame, jackpotGame } from './bonus.js';

// Для проверок (?test=1): window.slots.force = [5 остановок] — следующий исход вращения
const TEST = new URLSearchParams(location.search).has('test');

// размеры рамок барабанов (assets/frames.json пишет tools/build_assets.py)
let framesMeta = null;
function loadFrames() {
  framesMeta ||= fetch(asset('frames.json'), { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return framesMeta;
}

const JP = Object.fromEntries(JACKPOTS.map((j) => [j.id, j]));
// Гранд — общий котёл, но не меньше GRAND_MIN ставок
const jpValue = (tier, bet) => (tier === 'grand' ? Math.max(Math.floor(state.jackpot), GRAND_MIN * bet) : JP[tier].bet * bet);

export function machineScreen(app, m, { onLevel }) {
  // «Королевский покер» (m.mega) — 6 барабанов разной высоты и каскады: свой движок и свои барабаны
  const E = m.mega ? MEGA : { buildStrips, resolveSpin, REELS };
  const strips = E.buildStrips(m);
  const fsStrips = E.buildStrips(m, true);
  const magStrips = E.buildStrips(m, 'magnet'); // под усилителем «Магнит бонусов»
  const BETS = betsOf(m);
  let bet = betFor(m.id);
  let busy = false;          // крутятся барабаны или открыто окно, которое надо досмотреть
  let auto = 0;              // осталось автовращений (Infinity — без конца)
  let alive = true;
  let cycle = null;          // показ выигрышных линий по очереди
  let pending = null;        // отложенный следующий шаг (авто/бесплатные)
  let fsHidden = false;
  let fsMultShown = null;    // множитель каскадов, пока идёт показ вращения («Королевский покер»)
  let lastRandom = 0;        // случайный множитель последнего бесплатного вращения («Сладкая страна»)      // бесплатные вращения уже выиграны, но барабаны ещё крутятся — не подсказывать
  const F = () => state.fs[m.id];  // бесплатные вращения этого автомата
  // усилитель действует в обычных вращениях при ставке не выше той, при которой куплен
  const boostOn = (id, stake = bet) => { const b = state.boosts[id]; return !inFs() && !!b && b.left > 0 && stake <= b.bet; };
  const inFs = () => !!F();

  app.innerHTML = `
  <div class="screen machine theme-${m.id}">
    <div class="bg" style="--img:url(${asset(`bg/${m.id}.jpg`)})"></div>
    <header class="top">
      <a class="icon-btn back" href="#/" title="В лобби">←</a>
      <div class="m-title">${logoPic(asset(`${m.id}/title.webp`), m.title)}</div>
      <div class="top-right">${topRight()}</div>
    </header>
    <main class="stage">
      <div class="cabinet">
        <div class="m-head">${logoPic(asset(`${m.id}/title.webp`), m.title)}</div>
        <div class="jp-row">${JACKPOTS.map((j) => `<div class="jp-pill" data-t="${j.id}" style="--c:${j.color}"><b>${j.name}</b><span>0</span></div>`).join('')}</div>
        <div class="boost-row"></div>
        <div class="fs-banner" hidden></div>
        ${m.mega ? '<div class="ways-row"><b class="ways-n">117 649</b><span>способов выиграть</span></div>' : ''}
        <div class="reels-wrap"><div class="frame"><canvas class="reels"></canvas></div><div class="fx-layer"></div></div>
        <div class="under">
          <div class="streak" hidden></div>
          <div class="msg"></div>
        </div>
      </div>
    </main>
    <footer class="controls">
      <button class="ctl info" title="Выплаты и правила">i</button>
      <button class="ctl shop" title="Магазин усилителей">${pic(COMMON.bag, '🛍️', 'buy-ico')}<span>Усилители</span></button>
      <button class="ctl buy" title="Сразу бесплатные вращения">${pic(COMMON.bolt, '⚡', 'buy-ico')}<span>Купить бонус<b class="buy-cost"></b></span></button>
      <div class="bet-box">
        <div class="cap">Ставка</div>
        <div class="bet-row"><button class="bet-btn minus">−</button><span class="bet">${fmt(bet)}</span><button class="bet-btn plus">+</button></div>
      </div>
      <div class="win-box"><div class="cap">Выигрыш</div><div class="win">0</div></div>
      <button class="spin" title="Крутить (пробел)"><span class="spin-ico">⟳</span><span class="spin-txt"></span></button>
      <div class="side-btns">
        <button class="ctl auto">Авто</button>
        <button class="ctl turbo ${state.turbo ? 'on' : ''}" title="Быстрое вращение">⚡ Турбо</button>
      </div>
    </footer>
  </div>`;
  wireAll(app);
  wireTop(app, { levelInfo, onLevel });
  const $ = (s) => app.querySelector(s);
  const view = new (m.mega ? MegaReelView : ReelView)($('.reels'), m, strips, $('.reels-wrap'));
  const waysEl = $('.ways-n');
  const winCounter = new Counter($('.win'), 0);
  const msg = $('.msg'), banner = $('.fs-banner'), spinBtn = $('.spin'), autoBtn = $('.auto'), buyBtn = $('.buy');
  const streakEl = $('.streak'), fxLayer = $('.fx-layer');
  const jpCounters = Object.fromEntries(JACKPOTS.map((j) => [j.id, new Counter(app.querySelector(`.jp-pill[data-t="${j.id}"] span`), 0)]));
  hud.jp = jpCounters.grand;

  // рисованная рамка «из кусков» (border-image): углы и середины сверху/снизу — как нарисованы,
  // по высоте растягиваются только боковые стороны, поэтому окно рамки любой пропорции ложится на барабаны 5:3
  loadFrames().then((meta) => {
    const f = meta[m.id];
    if (!f || !alive) return;
    const src = asset(`${m.id}/frame.webp`);
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const fr = $('.frame');
      fr.classList.add('has-art');
      const ww = f.x1 - f.x0, wh = f.y1 - f.y0;
      const top = f.y0, right = f.iw - f.x1, bottom = f.ih - f.y1, left = f.x0;
      fr.style.borderImageSource = `url(${src})`;
      fr.style.borderImageSlice = `${top} ${right} ${bottom} ${left}`;
      view.onResize = (W) => {
        const s = W / ww; // масштаб рамки — по ширине окна
        fr.style.borderWidth = `${top * s}px ${right * s}px ${bottom * s}px ${left * s}px`;
      };
      // ширина всей рамки — iw/ww ширин окна; высота — окно (3/5 ширины) плюс верх и низ рамки
      view.setFrameArt({ kx: f.iw / ww, ky: 1 + ((top + bottom) / ww) * (view.aspect || 5 / 3) });
    };
    img.src = src;
  });

  function refreshJackpots(ms = 400) {
    const b = inFs() ? F().bet : bet;
    for (const j of JACKPOTS) jpCounters[j.id].set(jpValue(j.id, b), ms);
  }

  function refreshStreak() {
    const n = state.streak[m.id] || 0;
    if (inFs() || n < 1) { streakEl.hidden = true; return; }
    const k = streakMultiplier(n);
    streakEl.hidden = false;
    streakEl.classList.toggle('hot', k > 1);
    streakEl.innerHTML = k > 1
      ? `${pic(COMMON.fire, '🔥', 'st-ico')}<span>Горячая серия: <b>${n}</b> подряд · выигрыши <b>×${k}</b></span>`
      : `${pic(COMMON.fire, '🔥', 'st-ico')}<span>${n} ${plural(n, 'выигрыш', 'выигрыша', 'выигрышей')} подряд — ещё один, и пойдёт ×2</span>`;
    wireAll(streakEl);
  }

  const boostRow = $('.boost-row');
  function refreshBoosts() {
    const act = BOOSTERS.filter((b) => state.boosts[b.id]?.left > 0);
    boostRow.innerHTML = act.map((b) => {
      const st = state.boosts[b.id], on = boostOn(b.id);
      return `<div class="boost-chip ${on ? '' : 'paused'}" title="${esc(b.text)}${on ? '' : ` — работает при ставке до ${fmt(st.bet)}`}">${pic(COMMON[b.icon], b.emoji, 'bc-ico')}<b>${esc(b.name)}</b><span>${st.left}</span></div>`;
    }).join('');
    wireAll(boostRow);
  }

  function shopModal() {
    if (busy) return;
    sfx.click();
    const row = (b) => {
      const st = state.boosts[b.id];
      const cost = b.price * bet;
      const active = st?.left > 0;
      const other = active && st.bet !== bet; // уже куплен при другой ставке
      const can = state.balance >= cost && !other;
      const status = active ? `<em>Действует: осталось ${st.left} ${plural(st.left, 'вращение', 'вращения', 'вращений')} при ставке до ${fmt(st.bet)}</em>` : '';
      return `<div class="shop-item ${active ? 'active' : ''}">
        ${pic(COMMON[b.icon], b.emoji, 'si-ico')}
        <div class="si-txt"><b>${esc(b.name)}</b><span>${esc(b.text)} — на ${b.spins} ${plural(b.spins, 'вращение', 'вращения', 'вращений')}.</span>${status}</div>
        <button class="btn-gold si-buy" data-id="${b.id}" ${can ? '' : 'disabled'}>${other ? 'Куплен при другой ставке' : (active ? 'Продлить · ' : '') + fmt(cost)}</button>
      </div>`;
    };
    const { el, close } = modal(`
      <button class="x">✕</button>
      <h2>${pic(COMMON.bag, '🛍️', 'h-ico')} Усилители</h2>
      <p class="sub">Цена — по вашей ставке ${fmt(bet)}. Усилитель работает при этой ставке или меньше и тратится только в обычных вращениях.</p>
      <div class="shop-list">${BOOSTERS.map(row).join('')}</div>`, { cls: 'shop-modal', closeOnBg: true });
    el.querySelectorAll('.si-buy').forEach((btn) => btn.addEventListener('click', () => {
      const b = BOOSTERS.find((x) => x.id === btn.dataset.id);
      const cost = b.price * bet, st = state.boosts[b.id];
      if (state.balance < cost || busy || (st?.left > 0 && st.bet !== bet)) return;
      state.balance -= cost;
      state.stats.shopSpent += cost; state.stats.shopBuys++; state.stats.boostsBought++;
      state.boosts[b.id] = { left: (st?.left > 0 ? st.left : 0) + b.spins, bet };
      save();
      sfx.coins();
      hud.bal.set(state.balance, 500);
      shown = state.balance;
      track({ type: 'shop', machine: m.id, cost });
      flush();
      close();
      toast(`${pic(COMMON[b.icon], b.emoji, 't-ico')}<div><b>${esc(b.name)}</b><span>Включён на ${state.boosts[b.id].left} вращений при ставке до ${fmt(bet)}</span></div>`, 3000);
      refreshBoosts();
      refreshControls();
    }));
  }

  function refreshControls() {
    const fs = inFs() && !fsHidden;
    $('.bet').textContent = fmt(fs ? F().bet : bet);
    $('.minus').disabled = fs || busy || bet <= BETS[0];
    $('.plus').disabled = fs || busy || bet >= BETS[BETS.length - 1];
    autoBtn.disabled = fs;
    autoBtn.classList.toggle('on', auto > 0);
    autoBtn.textContent = auto > 0 ? `Стоп ${auto === Infinity ? '∞' : auto}` : 'Авто';
    buyBtn.disabled = fs || busy;
    $('.shop').disabled = fs || busy;
    refreshBoosts();
    $('.buy-cost').textContent = fmt(bet * BUY_BONUS);
    spinBtn.classList.toggle('busy', view.spinning);
    spinBtn.classList.toggle('free', fs);
    $('.spin-txt').textContent = view.spinning ? 'Стоп' : fs ? `Бесплатно\n${F().left}` : '';
    if (fs) {
      // пока идёт показ — множитель этого вращения, после — следующего
      const { fsMult } = fsMultipliers(m, Math.max(0, F().i - (busy ? 1 : 0)));
      const multTxt = (m.fs.mode === 'wildMult' ? `WILD в линии ×${m.fs.mult}` : m.fs.mode === 'random' ? (busy && lastRandom ? `×${lastRandom}` : 'случайный ×1–×25')
        : m.fs.mode === 'collect' ? `×${Math.min(m.fs.max, 1 + (F().collected || 0))}`
        : m.fs.mode === 'cascade' ? `множитель ×${fsMultShown ?? (F().mult || 1)}` : `×${fsMult}`) + (m.features.sticky ? ` · липких: ${F().sticky.length}` : '');
      banner.hidden = false;
      banner.innerHTML = `<b>Бесплатные вращения</b><span>осталось <b>${F().left}</b></span><span class="mult">${multTxt}</span><span>выигрыш <b>${fmt(F().total)}</b></span>`;
    } else banner.hidden = true;
  }

  function setBet(v, sound = true) {
    bet = v;
    state.bets[m.id] = v; save();
    if (sound) sfx.bet(true);
    refreshControls();
    refreshJackpots(250);
  }
  $('.minus').addEventListener('click', () => { const i = BETS.indexOf(bet); if (i > 0) { setBet(BETS[i - 1], false); sfx.bet(false); } });
  $('.plus').addEventListener('click', () => { const i = BETS.indexOf(bet); if (i < BETS.length - 1) setBet(BETS[i + 1]); });
  $('.turbo').addEventListener('click', (e) => { state.turbo = !state.turbo; save(); e.currentTarget.classList.toggle('on', state.turbo); sfx.click(); });
  $('.info').addEventListener('click', () => { sfx.click(); paytable(m, inFs() ? F().bet : bet); });
  $('.shop').addEventListener('click', shopModal);

  autoBtn.addEventListener('click', () => {
    sfx.click();
    if (auto > 0) { auto = 0; refreshControls(); return; }
    const pop = document.createElement('div');
    pop.className = 'auto-pop';
    pop.innerHTML = '<div class="cap">Сколько вращений?</div>' + [10, 25, 50, 100, '∞'].map((n) => `<button data-n="${n}">${n}</button>`).join('');
    autoBtn.parentElement.append(pop);
    const off = (e) => { if (!pop.contains(e.target)) { pop.remove(); removeEventListener('pointerdown', off, true); } };
    setTimeout(() => addEventListener('pointerdown', off, true));
    pop.addEventListener('click', (e) => {
      const n = e.target.dataset.n;
      if (!n) return;
      pop.remove(); removeEventListener('pointerdown', off, true);
      auto = n === '∞' ? Infinity : Number(n);
      refreshControls();
      if (!busy) spin();
    });
  });

  buyBtn.addEventListener('click', () => {
    if (busy || inFs()) return;
    sfx.click();
    const cost = bet * BUY_BONUS, count = m.freeSpins[3];
    const can = state.balance >= cost;
    const { el, close } = modal(`
      <button class="x">✕</button>
      ${symPic(m, 'scatter', 'big-pic')}
      <h2>Купить бонус</h2>
      <p>Сразу <b>${count} бесплатных вращений</b> по ставке ${fmt(bet)} — как за три знака «Бонус».</p>
      <p class="rule">${esc(m.fs.text)}</p>
      <p>Цена: <b>${fmt(cost)}</b> монет (${BUY_BONUS} ставок)${can ? '' : ' — пока не хватает монет'}.</p>
      <button class="btn-gold yes" ${can ? '' : 'disabled'}>Купить за ${fmt(cost)}</button>`, { cls: 'buy-modal', closeOnBg: true });
    el.querySelector('.yes').addEventListener('click', async () => {
      if (state.balance < cost || busy || inFs()) return;
      close();
      auto = 0;
      busy = true;
      state.balance -= cost;
      state.stats.wagered += cost; state.stats.buys++; state.stats.fsRounds++;
      state.fs[m.id] = { left: count, count, i: 0, bet, total: 0, sticky: [], mult: 1, bought: true };
      save();
      track({ type: 'buy', cost, machine: m.id });
      flush();
      hud.bal.set(state.balance, 400);
      stopCycle(); view.clearWins();
      await fsIntro(count, false);
      startFsReels();
      busy = false;
      refreshControls();
      if (alive) spin();
    });
  });

  spinBtn.addEventListener('click', () => {
    if (view.spinning) { view.slam(); return; }
    if (auto > 0 && !inFs()) { auto = 0; refreshControls(); }
    spin();
  });
  const onKey = (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (anyModal()) return;
    e.preventDefault();
    document.activeElement?.blur?.();
    spinBtn.click();
  };
  addEventListener('keydown', onKey);

  function stopCycle() { if (cycle) { clearInterval(cycle); cycle = null; } }

  // надпись поверх барабанов: «Подарок!», «Множитель ×5!»…
  function fxBanner(html, cls = '') {
    const el = document.createElement('div');
    el.className = 'fx-banner ' + cls;
    el.innerHTML = html;
    fxLayer.append(el);
    wireAll(el);
    setTimeout(() => el.remove(), 1900);
  }

  function startFsReels() {
    view.setStrips(fsStrips);
    view.setSticky(F()?.sticky || []);
  }
  function endFsReels() {
    view.setSticky([]);
    view.setStrips(strips);
  }

  // Показ выигрыша линий и бонуса
  async function present(o, win, stake, fs) {
    const level = win / stake;
    const all = [];
    o.lineWins.forEach((w) => all.push(...w.cells));
    if (o.scatter.amount || o.scatter.fs) all.push(...o.scatter.cells);
    if (!win && !o.scatter.fs) { msg.innerHTML = fs || o.jackpot || o.pick ? '' : 'Ещё разок?'; return; }
    if (all.length) view.showWins(all, o.lineWins.map((w) => w.line));
    const parts = [];
    if (o.lineWins.length) parts.push(`${o.lineWins.length} ${plural(o.lineWins.length, 'линия', 'линии', 'линий')}`);
    if (o.steps?.length > 1) parts.push(`${o.steps.length - 1} ${plural(o.steps.length - 1, 'каскад', 'каскада', 'каскадов')}`);
    if (o.royal) parts.push('роял-флеш');
    if (o.scatter.amount) parts.push(`бонус ${fmt(o.scatter.amount)}`);
    if (o.mult.all > 1) parts.push(`×${o.mult.all}`);
    msg.innerHTML = win ? `Выигрыш <b>${fmt(win)}</b>${parts.length ? ' · ' + parts.join(' · ') : ''}` : '';

    if (win) {
      if (level >= 15) {
        sfx.win(2);
        winCounter.set(win, 0);
        await bigWin(win, level, shown + win);
      } else {
        sfx.win(level >= 5 ? 1 : 0);
        const ms = level >= 5 ? 1300 : 650;
        let n = 0;
        winCounter.set(win, ms, () => { if (n++ % 4 === 0) sfx.tick(); });
        hud.bal.set(shown + win, ms);
        if (fs || auto > 0 || o.jackpot || o.pick) await sleep(ms + 250);
      }
      shown += win;
    }
    if (o.scatter.fs) {
      sfx.scatterLand(5);
      view.showWins(o.scatter.cells, [], true);
      await sleep(1100);
    }
    // по очереди показываем каждую линию, пока игрок не нажмёт «крутить»
    if (o.lineWins.length > 1) {
      let i = 0;
      const showOne = () => {
        const w = o.lineWins[i % o.lineWins.length];
        view.showWins(w.cells, [w.line]);
        const s = m.symbols[w.sym];
        msg.innerHTML = `<i class="dot" style="background:${LINE_COLORS[w.line]}"></i>Линия ${w.line + 1}: ${w.count} × ${esc(s.name)}${w.mult > 1 ? ` (×${w.mult})` : ''} — <b>${fmt(w.amount)}</b>`;
        i++;
      };
      cycle = setInterval(showOne, 1300);
    }
  }
  let shown = state.balance; // сколько монет сейчас показано в кошельке (во время показа выигрыша)

  // «Королевский покер»: каждый шаг каскада — выигравшие карты, сумма, сгорание и падение новых
  async function presentSteps(o, stake, fs) {
    let acc = 0;
    for (let i = 0; i < o.steps.length; i++) {
      const st = o.steps[i];
      const cells = st.wins.flatMap((w) => w.cells);
      if (st.royal) cells.push(...st.royal.cells);
      view.showWins(cells);
      acc += st.total;
      winCounter.set(acc, 350);
      const best = st.wins.slice().sort((a, b) => b.amount - a.amount);
      const txt = best.slice(0, 2).map((w) => `${w.count} × ${esc(m.symbols[w.sym].name)} · ${fmt(w.ways)} ${plural(w.ways, 'способ', 'способа', 'способов')}${w.jokerMult > 1 ? ' · Джокер с множителем' : ''}`).join('; ')
        + (best.length > 2 ? ` и ещё ${best.length - 2}` : '');
      msg.innerHTML = `${i ? `Каскад ${i}: ` : ''}${txt || 'Роял-флеш'}${st.mult > 1 ? ` · ×${st.mult}` : ''} — <b>${fmt(st.total)}</b>`;
      if (st.royal) {
        sfx.jackpot();
        view.showWins(st.royal.cells);
        fxBanner(`Роял-флеш ${MEGA.SUIT_SIGN[st.royal.suit]}! <b>+${fmt(Math.round(st.royal.amount))}</b>`, 'streak');
        await sleep(1800);
        view.showWins(cells);
      } else sfx.win(st.total / stake >= 5 ? 1 : 0);
      await sleep(state.turbo ? 450 : 850);
      if (!alive) return;
      if (!st.next) break;
      sfx.reveal();
      await view.cascade(st.removed, st.next, { turbo: state.turbo });
      if (!alive) return;
      if (fs && m.fs.mode === 'cascade') {
        fsMultShown = st.mult + 1;
        refreshControls();
        sfx.mult(fsMultShown);
        fxBanner(`Множитель <b>×${fsMultShown}</b>`, 'mult');
      }
    }
    view.clearWins();
  }

  async function bigWin(win, level, balanceAfter) {
    const title = level >= 100 ? 'Мега выигрыш!' : level >= 40 ? 'Огромный выигрыш!' : 'Крупный выигрыш!';
    const dur = level >= 100 ? 5500 : level >= 40 ? 4000 : 2600;
    const { el, close } = modal(`
      ${pic(COMMON.pile, '💰', 'big-pic')}
      <h2 class="glow">${title}</h2>
      <div class="big-num">0</div>
      <p class="hint">нажмите, чтобы продолжить</p>`, { cls: 'bigwin' });
    const c = new Counter(el.querySelector('.big-num'), 0);
    coinShower(dur / 1000, level >= 40 ? 60 : 35, el);
    sfx.coins();
    let n = 0;
    const counting = c.set(win, dur, () => { if (n++ % 3 === 0) sfx.tick(); });
    hud.bal.set(balanceAfter, dur);
    await new Promise((res) => {
      const finish = () => { c.finish(); hud.bal.finish(); res(); };
      el.addEventListener('click', finish, { once: true });
      counting.then(() => setTimeout(finish, auto > 0 || inFs() ? 1500 : 2500));
    });
    close();
  }

  // праздник джекпота: Гранд — большой, остальные — поменьше
  async function jackpotWin(tier, amount) {
    const grand = tier === 'grand';
    if (grand) sfx.jackpot(); else sfx.win(2);
    const { el, close } = modal(`
      ${pic(m.symbols.jackpot.img, '👑', 'big-pic')}
      <h2 class="glow jp" style="--c:${JP[tier].color}">Джекпот «${JP[tier].name}»!</h2>
      <div class="big-num">0</div>
      <p class="hint">${grand ? `Общий джекпот ваш. Он снова растёт с ${fmt(JACKPOT_SEED)}.` : 'нажмите, чтобы продолжить'}</p>`, { cls: 'bigwin jackpot' + (grand ? ' grand' : '') });
    const dur = grand ? 6000 : 2500;
    const c = new Counter(el.querySelector('.big-num'), 0);
    coinShower(dur / 1000, grand ? 80 : 40, el);
    let n = 0;
    const counting = c.set(amount, dur, () => { if (n++ % 3 === 0) sfx.tick(); });
    hud.bal.set(shown + amount, dur);
    if (grand) jpCounters.grand.set(state.jackpot, 1200);
    await new Promise((res) => {
      el.addEventListener('click', () => { c.finish(); hud.bal.finish(); res(); }, { once: true });
      counting.then(() => setTimeout(res, grand ? 3000 : 1500));
    });
    close();
    shown += amount;
    if (grand) auto = 0; // после Гранда автоигра останавливается — чтобы не пропустить праздник
  }

  async function fsIntro(count, resumed) {
    sfx.fanfare();
    const { el, close } = modal(`
      ${symPic(m, 'scatter', 'big-pic')}
      <h2 class="glow">${resumed ? 'Продолжаем!' : 'Бесплатные вращения!'}</h2>
      <div class="big-num">${count}</div>
      <p>${resumed ? 'Осталось бесплатных вращений' : plural(count, 'вращение', 'вращения', 'вращений') + ' в подарок'}</p>
      <p class="rule">${esc(m.fs.text)}</p>
      <button class="btn-gold go">Начать (<span class="cd">5</span>)</button>`, { cls: 'fs-intro' });
    await new Promise((res) => {
      let k = 5;
      const t = setInterval(() => { k--; el.querySelector('.cd').textContent = k; if (k <= 0) { clearInterval(t); res(); } }, 1000);
      el.querySelector('.go').addEventListener('click', () => { clearInterval(t); res(); }, { once: true });
    });
    close();
  }

  async function fsOutro(total, spins) {
    sfx.win(2);
    const { el, close } = modal(`
      ${pic(COMMON.pile, '💰', 'big-pic')}
      <h2 class="glow">Бесплатные вращения окончены</h2>
      <p>За ${spins} ${plural(spins, 'вращение', 'вращения', 'вращений')} вы выиграли</p>
      <div class="big-num">${fmt(total)}</div>
      <button class="btn-gold ok">Отлично!</button>`, { cls: 'fs-outro' });
    if (total > 0) coinShower(2.5, 40, el);
    await new Promise((res) => {
      el.querySelector('.ok').addEventListener('click', res, { once: true });
      setTimeout(res, auto > 0 ? 3500 : 8000);
    });
    close();
  }

  function schedule(fn, ms) {
    clearTimeout(pending);
    pending = setTimeout(() => { pending = null; if (alive) fn(); }, ms);
  }

  async function spin() {
    if (busy || !alive) return;
    clearTimeout(pending); pending = null;
    stopCycle();
    winCounter.finish(); hud.bal.finish();
    const fs = inFs();
    if (!fs && state.balance < bet) {
      auto = 0;
      const can = [...BETS].reverse().find((b) => b <= state.balance);
      if (can) { setBet(can, false); toast(`Не хватало монет — ставка уменьшена до ${fmt(can)}`); }
      else { refreshControls(); giftModal(() => refreshControls()); }
      return;
    }
    busy = true;
    const f = F();
    const stake = fs ? f.bet : bet;
    const streakBefore = state.streak[m.id] || 0;
    const on = Object.fromEntries(BOOSTERS.map((b) => [b.id, boostOn(b.id, stake)]));
    const stripsNow = fs ? fsStrips : on.magnet ? magStrips : strips;
    if (view.strips !== stripsNow) view.setStrips(stripsNow);
    const o = E.resolveSpin(m, stripsNow, {
      boostMult: on.x2 ? 2 : 1,
      giftChance: on.wilds ? GIFT_WILD_CHANCE * RAIN_WILD : GIFT_WILD_CHANCE,
      stops: (TEST && window.slots.force) || null,
      bet: stake,
      fs: fs ? { i: f.i, sticky: f.sticky, mult: f.mult || 1 } : null,
      streak: streakBefore,
      noGift: TEST && window.slots.noGift,
      forceGift: TEST && window.slots.forceGift,
    });
    if (TEST) window.slots.forceGift = false;
    window.slots.force = null;
    if (TEST) window.slots.last = o;

    // деньги считаем и сохраняем сразу — закрытие страницы посреди вращения ничего не теряет
    const win = o.total;
    const pickWin = o.pick ? o.pick.total * stake : 0;
    const tier = o.jackpot?.tier;
    const jpWin = tier ? jpValue(tier, stake) : 0;
    shown = state.balance - (fs ? 0 : stake);
    if (!fs) {
      state.balance -= stake;
      state.jackpot += stake * JACKPOT_SHARE;
      state.stats.spins++; state.stats.wagered += stake;
      if (auto > 0 && auto !== Infinity) auto--;
    } else {
      f.left--; f.i++; f.sticky = o.fx.sticky; f.collected = (f.collected || 0) + (o.fx.collected || 0);
      if (m.mega) f.mult = o.fsMultEnd; // множитель каскадов не сбрасывается до конца раунда
    }
    if (tier) { state.stats.jp[tier]++; state.stats.jackpots++; if (tier === 'grand') state.jackpot = JACKPOT_SEED; }
    if (o.pick) state.stats.picks++;
    if (o.fx.gift.length) state.stats.giftWilds++;
    if (o.mult.sum) { state.stats.multHits++; if (o.mult.cells.some(([r, row]) => o.grid[r][row] === 'x5')) state.stats.mult5++; }
    const sum = win + pickWin + jpWin;
    state.balance += sum;
    state.stats.won += sum;
    // «Горячая рука»: проигрыш серию не сбрасывает
    // у «Королевского покера» мелкие выигрыши почти в каждом вращении — серию продолжает выигрыш не меньше ставки
    const hit = m.mega ? sum >= stake : sum > 0;
    if (!fs) state.streak[m.id] = hit ? streakBefore + 1 : on.hot ? streakBefore : 0;
    const boostsEnded = [];
    for (const b of BOOSTERS) {
      if (!on[b.id]) continue;
      if (--state.boosts[b.id].left <= 0) { delete state.boosts[b.id]; boostsEnded.push(b.name); }
    }
    let fsStarted = 0, fsAdded = 0;
    if (fs) {
      f.total += sum;
      if (o.scatter.fs) { f.left += o.scatter.fs; f.count += o.scatter.fs; fsAdded = o.scatter.fs; }
    } else if (o.scatter.fs) {
      state.fs[m.id] = { left: o.scatter.fs, count: o.scatter.fs, i: 0, bet: stake, total: 0, sticky: [], mult: 1 };
      state.stats.fsRounds++;
      fsStarted = o.scatter.fs;
      fsHidden = true;
    }
    if (!fs && sum > state.stats.biggest) { state.stats.biggest = sum; state.stats.biggestMachine = m.title; }
    save();

    // «ожидание»: на первых барабанах уже 2 бонуса, 2 короны или 2 сундука
    const anticipation = [];
    let sc = 0, cr = 0, pk = 0;
    for (let r = 0; r < E.REELS; r++) {
      anticipation[r] = r >= 2 && (sc >= 2 || cr >= 2 || (pk >= 2 && r === 4));
      if (o.raw[r].includes('scatter')) sc++;
      if (o.raw[r].includes('jackpot')) cr++;
      if (o.raw[r].includes('pick')) pk++;
    }
    let landSc = 0, landCr = 0;
    view.onStop = (r) => {
      sfx.reelStop();
      if (o.raw[r].includes('scatter')) sfx.scatterLand(++landSc);
      if (o.raw[r].includes('jackpot')) sfx.jackpotLand(++landCr);
      if (o.raw[r].includes('pick')) sfx.chest();
      const nextAnt = r + 1 < E.REELS && anticipation[r + 1] && view.reel[r + 1].ant;
      sfx.anticipation(nextAnt);
      if (r === E.REELS - 1) sfx.spinStop();
    };
    view.clearWins();
    winCounter.set(0, 0);
    msg.innerHTML = fs ? `Бесплатное вращение ${f.i} из ${f.count}` : '';
    if (!fs) hud.bal.set(shown, 250);
    jpCounters.grand.set(tier === 'grand' ? jpWin : state.jackpot, 400); // при Гранде сумма держится до праздника
    sfx.spinStart(state.turbo);
    if (m.mega) { fsMultShown = fs ? o.mult.fs : null; waysEl.textContent = '…'; }
    const p = view.spin(o.stops, { turbo: state.turbo, anticipation, heights: o.heights });
    refreshControls();
    await p;
    sfx.spinStop(); sfx.anticipation(false);
    if (!alive) return;
    if (m.mega) { waysEl.textContent = fmt(o.ways); waysEl.parentElement.classList.toggle('max', o.ways >= 46656); }
    refreshControls();

    // ----- помощники -----
    if (o.fx.mystery) {
      sfx.reveal();
      view.setOverride(o.fx.mystery.cells, o.fx.mystery.sym, 'mystery');
      fxBanner(`«?» превратились: <b>${esc(m.symbols[o.fx.mystery.sym].name)}</b>`, 'mystery');
      await sleep(state.turbo ? 450 : 750);
    }
    if (o.fx.gift.length) {
      sfx.gift();
      fxBanner(`${pic(COMMON.gift, '🎁', 'fx-ico')} Подарок: <b>+${o.fx.gift.length} WILD</b>`, 'gift');
      view.setOverride(o.fx.gift, 'wild', 'gift');
      await sleep(500 + o.fx.gift.length * 130);
    }
    if (o.fx.expand.length) {
      sfx.expand();
      view.setExpanded(o.fx.expand);
      fxBanner('Маска на весь барабан!', 'expand');
      await sleep(state.turbo ? 450 : 700);
    }
    if (fs && m.features.sticky) {
      view.setSticky(o.fx.sticky);
      if (o.fx.newSticky.length) { fxBanner(`+${o.fx.newSticky.length} ${plural(o.fx.newSticky.length, 'липкий WILD', 'липких WILD', 'липких WILD')}`, 'sticky'); await sleep(400); }
    }
    if (win && o.mult.sum) { sfx.mult(o.mult.sum); fxBanner(`Множитель <b>×${o.mult.sum}</b>!`, 'mult'); view.showWins(o.mult.cells, [], false); await sleep(600); }
    if (fs && m.fs.mode === 'collect' && o.fx.collected) {
      sfx.mult(o.mult.fs);
      fxBanner(`+${o.fx.collected} ${plural(o.fx.collected, 'зайчик', 'зайчика', 'зайчиков')} · множитель <b>×${o.mult.fs}</b>`, 'mult');
      await sleep(450);
    }
    if (fs && m.fs.mode === 'random') {
      lastRandom = o.mult.fs; refreshControls();
      fxBanner(`Множитель вращения <b>×${o.mult.fs}</b>`, o.mult.fs >= 10 ? 'streak' : 'mult');
      if (o.mult.fs >= 5) sfx.mult(o.mult.fs);
      await sleep(o.mult.fs >= 5 ? 500 : 250);
    }
    if (win && on.x2) { fxBanner(`${pic(COMMON.boostX2, '💰', 'fx-ico')} Двойной выигрыш <b>×2</b>`, 'mult'); await sleep(250); }
    if (win && o.mult.streak > 1) { sfx.mult(o.mult.streak); fxBanner(`${pic(COMMON.fire, '🔥', 'fx-ico')} Горячая серия <b>×${o.mult.streak}</b>`, 'streak'); await sleep(300); }

    if (m.mega && o.steps.length) { await presentSteps(o, stake, fs); if (!alive) return; }
    fsMultShown = null;
    await present(o, win, stake, fs);
    if (!alive) return;

    // ----- бонус-игры -----
    if (o.jackpot) {
      stopCycle();
      view.showWins(o.crowns, [], true);
      await sleep(700);
      const values = Object.fromEntries(JACKPOTS.map((j) => [j.id, j.id === 'grand' && tier === 'grand' ? jpWin : jpValue(j.id, stake)]));
      if (o.jackpot.crowns < 5) await jackpotGame({ board: o.jackpot.board, values, crowns: o.jackpot.crowns, auto: auto > 0 });
      if (!alive) return;
      await jackpotWin(tier, jpWin);
      winCounter.set(win + jpWin, 400);
    }
    if (o.pick) {
      stopCycle();
      view.showWins(o.pickCells, [], true);
      sfx.chest();
      fxBanner(`${pic(m.symbols.pick.img, '🧰', 'fx-ico')} Три сундука!`, 'pick');
      await sleep(900);
      await pickGame({ board: o.pick, bet: stake, chestImg: m.symbols.pick.img, auto: auto > 0 });
      if (!alive) return;
      hud.bal.set(shown + pickWin, 600);
      shown += pickWin;
      winCounter.set(win + jpWin + pickWin, 400);
    }
    hud.bal.set(state.balance, 300);
    shown = state.balance;
    refreshStreak();
    refreshJackpots();
    if (fsAdded) { toast(`Ещё +${fsAdded} бесплатных вращений!`); sfx.fanfare(); await sleep(1200); }
    if (fsStarted) { stopCycle(); await fsIntro(fsStarted, false); fsHidden = false; if (alive) startFsReels(); }

    for (const name of boostsEnded) toast(`Усилитель «${esc(name)}» закончился`, 2600);
    refreshBoosts();
    track({ type: 'spin', machine: m.id, bet: stake, win: sum, mult: sum / stake, fs, streak: state.streak[m.id] || 0, fsWon: !!(fsStarted || fsAdded), pick: !!o.pick, jackpot: !!o.jackpot, multSym: o.mult.sum > 0, giftWild: o.fx.gift.length > 0 });
    flush();
    busy = false;
    refreshControls();
    if (!alive) return;

    if (inFs()) {
      if (F().left > 0) return schedule(spin, win ? 700 : 450);
      const { total, count } = F();
      if (total > state.stats.biggest) { state.stats.biggest = total; state.stats.biggestMachine = m.title; }
      delete state.fs[m.id]; save();
      busy = true;
      stopCycle(); view.clearWins();
      await fsOutro(total, count);
      endFsReels();
      busy = false;
      winCounter.set(total, 0);
      refreshControls();
      refreshStreak();
      if (auto > 0) schedule(spin, 600);
      return;
    }
    if (auto > 0) schedule(spin, win ? 900 : 350);
  }

  refreshControls();
  refreshStreak();
  refreshJackpots(0);
  if (inFs()) {
    busy = true;
    startFsReels();
    fsIntro(F().left, true).then(() => { busy = false; refreshControls(); if (alive) spin(); });
  } else if (state.balance < BETS[0]) {
    giftModal(() => refreshControls());
  }

  return {
    destroy() {
      alive = false; auto = 0;
      clearTimeout(pending); stopCycle();
      view.destroy();
      sfx.spinStop(); sfx.anticipation(false);
      removeEventListener('keydown', onKey);
      layer.innerHTML = '';
    },
  };
}

// ---------- выплаты и правила ----------
function paytable(m, bet) {
  if (m.mega) return megaPaytable(m, bet);
  const lb = bet / 20;
  const row = (id) => {
    const p = m.pay[id];
    return `<div class="pt-item">${symPic(m, id)}<div><b>${esc(m.symbols[id].name)}</b>
      <span>5 — ${fmt(p[5] * lb)}</span><span>4 — ${fmt(p[4] * lb)}</span><span>3 — ${fmt(p[3] * lb)}</span></div></div>`;
  };
  const item = (picHtml, title, text) => `<div class="pt-item wide">${picHtml}<div><b>${title}</b><span>${text}</span></div></div>`;
  const lines = LINES.map((ln, i) => `<div class="pt-line" title="Линия ${i + 1}"><i>${i + 1}</i>${[0, 1, 2].map((row) =>
    ln.map((r) => `<s class="${r === row ? 'on' : ''}" style="${r === row ? 'background:' + LINE_COLORS[i] : ''}"></s>`).join('')).join('')}</div>`).join('');
  const fs = m.freeSpins, sp = m.scatterPay;
  const wn = esc(m.symbols.wild.name);
  const sig = [
    m.features.expand && item(symPic(m, 'wild'), 'WILD на весь барабан', `Выпавший ${wn} растягивается на весь барабан — во всех трёх рядах WILD. И в обычной игре, и в бесплатных вращениях.`),
    m.features.sticky && item(symPic(m, 'wild'), 'Липкие WILD', `В бесплатных вращениях каждый выпавший ${wn} остаётся на месте до конца раунда — с каждым вращением WILD всё больше.`),
    m.features.mystery && item(symPic(m, 'mystery'), 'Таинственный «?»', 'Все знаки «?» на экране превращаются в один и тот же символ. Они стоят стопками — бывает, что весь барабан становится одним символом.'),
  ].filter(Boolean).join('');
  const { el } = modal(`
    <button class="x">✕</button>
    <h2>${m.title}: правила и выплаты</h2>
    <p class="sub">Цифры — выигрыш в монетах при ставке ${fmt(bet)} за 5, 4 и 3 одинаковых символа на линии, считая с левого барабана.</p>
    <h3>Помощники на барабанах</h3>
    <div class="pt-specials">${sig}</div>
    <h3>Особые знаки</h3>
    <div class="pt-specials">
      ${item(symPic(m, 'wild'), `${esc(m.symbols.wild.name)} — WILD`, 'Заменяет любой обычный символ. Бывает на барабанах 2–5.')}
      ${item(symPic(m, 'scatter'), `${esc(m.symbols.scatter.name)} — БОНУС`, `3, 4 или 5 в любом месте: ${fs[3]}, ${fs[4]} или ${fs[5]} бесплатных вращений и ${fmt(sp[3] * bet)} / ${fmt(sp[4] * bet)} / ${fmt(sp[5] * bet)} монет сразу. ${esc(m.fs.text)}. В бесплатных вращениях можно выиграть ещё вращения.`)}
      ${item(symPic(m, 'jackpot'), 'Корона — ДЖЕКПОТЫ', `3 или 4 короны в любом месте открывают джекпот-игру: Мини (${fmt(3 * bet)}), Малый (${fmt(10 * bet)}), Большой (${fmt(50 * bet)}) или Гранд (сейчас ${fmt(Math.max(state.jackpot, GRAND_MIN * bet))}). Чем больше корон, тем выше шанс на крупный. Пять корон — сразу Гранд. Гранд общий для всех автоматов, растёт на ${Math.round(JACKPOT_SHARE * 100)}% каждой ставки и всегда не меньше ${GRAND_MIN} ставок.`)}
      ${item(symPic(m, 'pick'), 'Сундук — «Выбери сундук»', 'Три сундука на барабанах 1, 3 и 5 открывают игру: выбирайте сундуки, внутри монеты и «×2 ко всему», пока не попадётся «Забрать».')}
      ${item(symPic(m, 'x3'), 'Множители ×2, ×3, ×5', 'Умножают весь выигрыш вращения. Несколько множителей складываются: ×2 и ×3 дают ×5.')}
    </div>
    <h3>Помощники для всех</h3>
    <div class="pt-specials">
      ${item(pic(COMMON.gift, '🎁'), 'Подарок', `Примерно раз в ${Math.round(1 / GIFT_WILD_CHANCE)} вращений на барабаны сами прилетают 2–4 WILD.`)}
      ${item(pic(COMMON.fire, '🔥'), 'Горячая серия', 'Два выигрыша подряд — дальше выигрыши ×2, четыре подряд — ×3. Проигрыш сбрасывает серию.')}
      ${item(pic(COMMON.bolt, '⚡'), 'Купить бонус', `За ${BUY_BONUS} ставок — сразу ${fs[3]} бесплатных вращений, без ожидания.`)}
    </div>
    <h3>Выплаты</h3>
    <div class="pt-grid">${['h1', 'h2', 'h3', 'l1', 'l2', 'l3', 'l4'].map(row).join('')}</div>
    <h3>20 линий</h3>
    <div class="pt-lines">${lines}</div>`, { cls: 'paytable', closeOnBg: true });
  return el;
}

// «Королевский покер»: способы вместо линий, каскад, Джокеры с множителем, роял-флеш
function megaPaytable(m, bet) {
  const f2 = (v) => fmt(Math.max(1, Math.round(v)));
  const row = (id) => {
    const p = m.pay[id];
    return `<div class="pt-item">${symPic(m, id)}<div><b>${esc(m.symbols[id].name)}</b>
      <span>6 — ${f2(p[6] * bet)}</span><span>5 — ${f2(p[5] * bet)}</span><span>4 — ${f2(p[4] * bet)}</span><span>3 — ${f2(p[3] * bet)}</span></div></div>`;
  };
  const item = (picHtml, title, text) => `<div class="pt-item wide">${picHtml}<div><b>${title}</b><span>${text}</span></div></div>`;
  const fs = m.freeSpins, sp = m.scatterPay;
  const { el } = modal(`
    <button class="x">✕</button>
    <h2>${m.title}: правила и выплаты</h2>
    <p class="sub">Шесть барабанов, на каждом при каждом вращении от 2 до 7 карт. Способов выиграть — произведение высот барабанов, до 117 649.
      Выигрыш — одинаковые карты на соседних барабанах начиная с левого, в любых рядах; масть не важна.</p>
    <h3>Фишки автомата</h3>
    <div class="pt-specials">
      ${item(symPic(m, 'h2'), 'Каскад', 'Выигравшие карты сгорают, оставшиеся падают вниз, сверху приходят новые — и можно выиграть ещё раз, сколько угодно раз подряд.')}
      ${item(symPic(m, 'w3'), 'Джокер с множителем', 'Джокер заменяет любую карту. Бывает с множителем ×2, ×3 или ×5 — каждый способ через такого Джокера умножается. На первом барабане Джокеров нет.')}
      ${item(symPic(m, 'l3'), 'Роял-флеш', `10, валет, дама, король и туз одной масти на пяти барабанах подряд слева направо — ${fmt(m.royal * bet)} монет (${m.royal} ставок). Может сложиться и после каскада.`)}
      ${item(symPic(m, 'scatter'), `${esc(m.symbols.scatter.name)} — БОНУС`, `3, 4, 5 или 6 в любом месте: ${fs[3]}, ${fs[4]}, ${fs[5]} или ${fs[6]} бесплатных вращений и ${fmt(sp[3] * bet)} / ${fmt(sp[4] * bet)} / ${fmt(sp[5] * bet)} / ${fmt(sp[6] * bet)} монет. ${esc(m.fs.text)}. В бесплатных вращениях можно выиграть ещё вращения.`)}
      ${item(symPic(m, 'jackpot'), 'Корона — ДЖЕКПОТЫ', `3 или 4 короны в любом месте открывают джекпот-игру: Мини (${fmt(3 * bet)}), Малый (${fmt(10 * bet)}), Большой (${fmt(50 * bet)}) или Гранд (сейчас ${fmt(Math.max(state.jackpot, GRAND_MIN * bet))}). Пять корон — сразу Гранд.`)}
      ${item(symPic(m, 'pick'), 'Сундук — «Выбери сундук»', 'Три сундука на барабанах 1, 3 и 5 открывают игру с сундуками.')}
    </div>
    <h3>Помощники для всех</h3>
    <div class="pt-specials">
      ${item(pic(COMMON.gift, '🎁'), 'Подарок', `Примерно раз в ${Math.round(1 / GIFT_WILD_CHANCE)} вращений на барабаны 2–6 прилетают 2–4 Джокера.`)}
      ${item(pic(COMMON.fire, '🔥'), 'Горячая серия', 'Два выигрыша подряд не меньше ставки — дальше выигрыши ×2, четыре подряд — ×3.')}
      ${item(pic(COMMON.bolt, '⚡'), 'Купить бонус', `За ${BUY_BONUS} ставок — сразу ${fs[3]} бесплатных вращений.`)}
    </div>
    <h3>Выплаты за один способ при ставке ${fmt(bet)}</h3>
    <p class="sub">Сумма умножается на число способов: например, 2 туза на первом барабане, 3 на втором и 1 на третьем — это 2 × 3 × 1 = 6 способов.</p>
    <div class="pt-grid">${MEGA.PAYING.map(row).join('')}</div>`, { cls: 'paytable', closeOnBg: true });
  return el;
}
