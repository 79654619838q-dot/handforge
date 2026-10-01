// Экраны: лобби (выбор автомата) и автомат. Деньги ненастоящие, всё хранится в браузере.
import { MACHINES, byId, BETS, GIFT, JACKPOT_SEED, JACKPOT_SHARE, COMMON, asset } from './machines.js';
import { buildStrips, spinStops, windowAt, evaluate, fsMultipliers, LINES, REELS } from './engine.js';
import { ReelView, LINE_COLORS } from './reels.js';
import { state, save, betFor } from './state.js';
import { sfx } from './audio.js';
import { storageWorks } from './storage.js';

const app = document.getElementById('app');
const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COIN = asset('common/coin.webp');
const GIFT_IMG = asset('common/gift.webp');
const PILE_IMG = asset('common/pile.webp');

// Для проверок (?test=1): window.slots.force = [5 остановок] — следующий исход вращения
const TEST = new URLSearchParams(location.search).has('test');
window.slots = { state, force: null };

// ---------- плавные числа ----------
class Counter {
  constructor(el, value = 0) { this.el = el; this.value = this.target = value; this.raf = 0; this.res = null; this.el.textContent = fmt(value); }
  set(target, ms = 500, onTick) {
    cancelAnimationFrame(this.raf);
    const prev = this.res; this.res = null; prev?.();
    this.target = target;
    const from = this.value, t0 = performance.now();
    if (ms <= 0 || from === target) { this.value = target; this.el.textContent = fmt(target); return Promise.resolve(); }
    return new Promise((res) => {
      this.res = res;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        this.value = from + (target - from) * (1 - (1 - k) ** 3);
        this.el.textContent = fmt(this.value);
        onTick?.();
        if (k < 1) this.raf = requestAnimationFrame(step); else this.finish();
      };
      this.raf = requestAnimationFrame(step);
    });
  }
  // досчитать сразу до конца
  finish() {
    if (!this.res) return;
    cancelAnimationFrame(this.raf);
    this.value = this.target; this.el.textContent = fmt(this.target);
    const r = this.res; this.res = null; r();
  }
}

// ---------- картинка с запасным значком ----------
function pic(src, emoji, cls = '') {
  return `<span class="pic ${cls}"><img src="${src}" alt="" data-emo="${esc(emoji)}"></span>`;
}
function wirePics(root) {
  root.querySelectorAll('img[data-emo]').forEach((img) => {
    const fail = () => { const s = document.createElement('span'); s.className = 'emo'; s.textContent = img.dataset.emo; img.replaceWith(s); };
    if (img.complete && !img.naturalWidth) fail(); else img.addEventListener('error', fail, { once: true });
  });
}
const symPic = (m, id, cls) => pic(m.symbols[id].img, m.symbols[id].emoji, cls);

// ---------- всплывающие окна ----------
const layer = document.createElement('div');
layer.id = 'layer';
document.body.append(layer);

function modal(html, { cls = '', closeOnBg = false } = {}) {
  const el = document.createElement('div');
  el.className = 'modal ' + cls;
  el.innerHTML = `<div class="modal-box">${html}</div>`;
  layer.append(el);
  wirePics(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
  if (closeOnBg) el.addEventListener('click', (e) => { if (e.target === el) close(); });
  return { el, close };
}

function toast(text, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  layer.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---------- дождь монет ----------
const coinImg = new Image();
coinImg.src = COIN;
// host — окно, под содержимым которого сыплются монеты (чтобы не закрывали сумму)
function coinShower(seconds = 3, rate = 40, host = layer) {
  const cv = document.createElement('canvas');
  cv.className = 'coins-fx';
  host.prepend(cv);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const parts = [];
  const t0 = performance.now();
  let last = t0, acc = 0;
  const size = Math.max(26, Math.min(W, H) * 0.06);
  return new Promise((res) => {
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const age = (now - t0) / 1000;
      if (age < seconds) {
        acc += rate * dt;
        while (acc > 1) {
          acc--;
          parts.push({ x: Math.random() * W, y: -size, vx: (Math.random() - 0.5) * 120, vy: 150 + Math.random() * 250, a: Math.random() * 6, va: 4 + Math.random() * 8, s: size * (0.6 + Math.random() * 0.6) });
        }
      }
      g.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
        const sx = Math.abs(Math.cos(p.a));
        g.save(); g.translate(p.x, p.y); g.scale(Math.max(0.15, sx), 1);
        if (coinImg.naturalWidth) g.drawImage(coinImg, -p.s / 2, -p.s / 2, p.s, p.s);
        else {
          const gr = g.createRadialGradient(-p.s * 0.15, -p.s * 0.15, 1, 0, 0, p.s / 2);
          gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#f2c230'); gr.addColorStop(1, '#a86e00');
          g.fillStyle = gr; g.beginPath(); g.arc(0, 0, p.s / 2, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#7a4d00'; g.lineWidth = p.s * 0.06; g.stroke();
        }
        g.restore();
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].y > H + size) parts.splice(i, 1);
      if (age < seconds || parts.length) requestAnimationFrame(frame);
      else { cv.remove(); res(); }
    };
    requestAnimationFrame(frame);
  });
}

// ---------- шапка: кошелёк, джекпот, звук ----------
let balCounter = null, jpCounter = null;
function topWallet() {
  return `
    <div class="wallet" title="Ваши монеты (ненастоящие)">${pic(COIN, '🪙', 'coin')}<span class="bal">${fmt(state.balance)}</span></div>`;
}
function soundBtn() {
  return `<button class="icon-btn sound" title="Звук">${state.sound ? '🔊' : '🔇'}</button>`;
}
function wireSound(root) {
  const b = root.querySelector('.sound');
  b?.addEventListener('click', () => {
    state.sound = !state.sound; save();
    b.textContent = state.sound ? '🔊' : '🔇';
    sfx.click();
  });
}

// =====================================================================
// ЛОББИ
// =====================================================================
let current = null; // активный экран (для уборки)

function lobby() {
  const fsBadge = (m) => state.fs[m.id]
    ? `<div class="badge">Ждут бесплатные вращения: ${state.fs[m.id].left}</div>` : '';
  app.innerHTML = `
  <div class="screen lobby">
    <div class="bg" style="--img:url(${asset('bg/lobby.jpg')})"></div>
    <header class="top">
      <div class="brand">Золотые <b>барабаны</b></div>
      <div class="top-right">${topWallet()}${soundBtn()}</div>
    </header>
    <section class="jp-banner">
      ${pic(COMMON.jackpot.img, '👑', 'jp-crown')}
      <div>
        <div class="jp-label">Джекпот</div>
        <div class="jp-value">${fmt(state.jackpot)}</div>
        <div class="jp-hint">Пять корон — по одной на каждом барабане — и он ваш. Растёт с каждой ставкой.</div>
      </div>
    </section>
    <section class="machines">
      ${MACHINES.map((m) => `
        <a class="mcard theme-${m.id}" href="#/m/${m.id}">
          <div class="mcard-art" style="--img:url(${asset(`bg/${m.id}.jpg`)})">
            <div class="mcard-syms">${['h1', 'wild', 'scatter'].map((id) => symPic(m, id)).join('')}</div>
            ${fsBadge(m)}
          </div>
          <div class="mcard-body">
            <h3>${m.title}</h3>
            <p>${m.tagline}</p>
            <p class="feat">Бесплатные вращения: ${m.fs.text.toLowerCase()}</p>
            <span class="play">Играть</span>
          </div>
        </a>`).join('')}
    </section>
    <footer class="stats">
      <span>Вращений: <b>${fmt(state.stats.spins)}</b></span>
      <span>Самый крупный выигрыш: <b>${fmt(state.stats.biggest)}</b>${state.stats.biggestMachine ? ` <i>(${esc(state.stats.biggestMachine)})</i>` : ''}</span>
      <span>Джекпотов: <b>${state.stats.jackpots}</b></span>
      ${state.balance < BETS[0] ? '<button class="gift-btn">🎁 Получить подарок</button>' : ''}
    </footer>
    ${storageWorks ? '' : '<div class="warn">Браузер не даёт сайту хранить данные — монеты не запомнятся после закрытия страницы.</div>'}
  </div>`;
  wirePics(app);
  wireSound(app);
  balCounter = new Counter(app.querySelector('.bal'), state.balance);
  jpCounter = new Counter(app.querySelector('.jp-value'), state.jackpot);
  app.querySelector('.gift-btn')?.addEventListener('click', () => giftModal(() => lobby()));
  app.querySelectorAll('.mcard').forEach((a) => a.addEventListener('click', () => sfx.click()));
  current = { destroy() {} };
}

function giftModal(after) {
  sfx.coins();
  const { el, close } = modal(`
    ${pic(GIFT_IMG, '🎁', 'big-pic')}
    <h2>Монеты закончились!</h2>
    <p>Держите подарок — <b>${fmt(GIFT)}</b> монет. Деньги ненастоящие, играйте сколько хочется.</p>
    <button class="btn-gold take">Забрать подарок</button>`, { cls: 'gift' });
  el.querySelector('.take').addEventListener('click', () => {
    state.balance += GIFT; state.stats.gifts++; save();
    sfx.coins();
    coinShower(1.8, 50);
    close();
    after?.();
  });
}

// =====================================================================
// АВТОМАТ
// =====================================================================
function machineScreen(m) {
  const strips = buildStrips(m);
  let bet = betFor(m.id);
  let busy = false;          // крутятся барабаны или открыто окно, которое надо досмотреть
  let auto = 0;              // осталось автовращений (Infinity — без конца)
  let alive = true;
  let cycle = null;          // показ выигрышных линий по очереди
  let pending = null;        // отложенный следующий шаг (авто/бесплатные)
  let fsHidden = false;      // бесплатные вращения уже выиграны, но барабаны ещё крутятся — не подсказывать

  app.innerHTML = `
  <div class="screen machine theme-${m.id}">
    <div class="bg" style="--img:url(${asset(`bg/${m.id}.jpg`)})"></div>
    <header class="top">
      <a class="icon-btn back" href="#/" title="В лобби">←</a>
      <div class="m-title">${m.title}</div>
      <div class="jp-mini" title="Общий джекпот">${pic(COMMON.jackpot.img, '👑', 'jp-ico')}<span class="jp-value">${fmt(state.jackpot)}</span></div>
      <div class="top-right">${topWallet()}${soundBtn()}</div>
    </header>
    <main class="stage">
      <div class="cabinet">
        <div class="m-head">${m.title}</div>
        <div class="fs-banner" hidden></div>
        <div class="reels-wrap"><div class="frame"><canvas class="reels"></canvas></div></div>
        <div class="msg"></div>
      </div>
    </main>
    <footer class="controls">
      <button class="ctl info" title="Выплаты и правила">i</button>
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
  wirePics(app);
  wireSound(app);
  const $ = (s) => app.querySelector(s);
  const view = new ReelView($('.reels'), m, strips, $('.reels-wrap'));
  balCounter = new Counter($('.bal'), state.balance);
  jpCounter = new Counter($('.jp-value'), state.jackpot);
  const winCounter = new Counter($('.win'), 0);
  const msg = $('.msg'), banner = $('.fs-banner'), spinBtn = $('.spin'), autoBtn = $('.auto');

  const inFs = () => !!state.fs[m.id];
  const F = () => state.fs[m.id]; // бесплатные вращения этого автомата

  function refreshControls() {
    const fs = inFs() && !fsHidden;
    $('.bet').textContent = fmt(fs ? F().bet : bet);
    $('.minus').disabled = fs || busy || bet <= BETS[0];
    $('.plus').disabled = fs || busy || bet >= BETS[BETS.length - 1];
    autoBtn.disabled = fs;
    autoBtn.classList.toggle('on', auto > 0);
    autoBtn.textContent = auto > 0 ? `Стоп ${auto === Infinity ? '∞' : auto}` : 'Авто';
    spinBtn.classList.toggle('busy', view.spinning);
    spinBtn.classList.toggle('free', fs);
    $('.spin-txt').textContent = view.spinning ? 'Стоп' : fs ? `Бесплатно\n${F().left}` : '';
    if (fs) {
      // пока идёт показ — множитель этого вращения, после — следующего
      const { fsMult, wildMult } = fsMultipliers(m, Math.max(0, F().i - (busy ? 1 : 0)));
      const multTxt = m.fs.mode === 'wildMult' ? `капитан ×${wildMult}` : `×${fsMult}`;
      banner.hidden = false;
      banner.innerHTML = `<b>Бесплатные вращения</b><span>осталось <b>${F().left}</b></span><span class="mult">${multTxt}</span><span>выигрыш <b>${fmt(F().total)}</b></span>`;
    } else banner.hidden = true;
  }

  function setBet(v, sound = true) {
    bet = v;
    state.bets[m.id] = v; save();
    if (sound) sfx.bet(true);
    refreshControls();
  }
  $('.minus').addEventListener('click', () => { const i = BETS.indexOf(bet); if (i > 0) { setBet(BETS[i - 1], false); sfx.bet(false); } });
  $('.plus').addEventListener('click', () => { const i = BETS.indexOf(bet); if (i < BETS.length - 1) setBet(BETS[i + 1]); });
  $('.turbo').addEventListener('click', (e) => { state.turbo = !state.turbo; save(); e.currentTarget.classList.toggle('on', state.turbo); sfx.click(); });
  $('.info').addEventListener('click', () => { sfx.click(); paytable(m, inFs() ? F().bet : bet); });

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

  spinBtn.addEventListener('click', () => {
    if (view.spinning) { view.slam(); return; }
    if (auto > 0 && !inFs()) { auto = 0; refreshControls(); }
    spin();
  });
  const onKey = (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (layer.querySelector('.modal')) return;
    e.preventDefault();
    document.activeElement?.blur?.();
    spinBtn.click();
  };
  addEventListener('keydown', onKey);

  function stopCycle() { if (cycle) { clearInterval(cycle); cycle = null; } }

  // Показ выигрыша. Возвращает обещание, когда можно делать следующий шаг.
  async function present(res, win, jpWin, stake, fs) {
    const level = win / stake;
    const all = [];
    res.lineWins.forEach((w) => all.push(...w.cells));
    if (res.scatter.amount || res.scatter.fs) all.push(...res.scatter.cells);
    if (jpWin) all.push(...res.jackpot.cells);
    if (!win && !jpWin && !res.scatter.fs) { msg.innerHTML = fs ? '' : 'Ещё разок?'; return; }
    view.showWins(all, res.lineWins.map((w) => w.line));
    const parts = [];
    if (res.lineWins.length) parts.push(`${res.lineWins.length} ${plural(res.lineWins.length, 'линия', 'линии', 'линий')}`);
    if (res.scatter.amount) parts.push(`бонус ${fmt(res.scatter.amount)}`);
    msg.innerHTML = win ? `Выигрыш <b>${fmt(win)}</b>${parts.length ? ' · ' + parts.join(' · ') : ''}` : '';

    if (win) {
      if (level >= 15) {
        sfx.win(2);
        winCounter.set(win, 0);
        await bigWin(win, level, state.balance - jpWin);
      } else {
        sfx.win(level >= 5 ? 1 : 0);
        const ms = level >= 5 ? 1300 : 650;
        let n = 0;
        winCounter.set(win, ms, () => { if (n++ % 4 === 0) sfx.tick(); });
        balCounter.set(state.balance - jpWin, ms);
        if (fs || auto > 0) await sleep(ms + 250);
      }
    }
    if (res.scatter.fs) {
      sfx.scatterLand(5);
      view.showWins(res.scatter.cells, [], true);
      await sleep(1100);
    }
    if (jpWin) await jackpotWin(jpWin);
    // по очереди показываем каждую линию, пока игрок не нажмёт «крутить»
    if (res.lineWins.length > 1) {
      let i = 0;
      const showOne = () => {
        const w = res.lineWins[i % res.lineWins.length];
        view.showWins(w.cells, [w.line]);
        const s = m.symbols[w.sym];
        msg.innerHTML = `<i class="dot" style="background:${LINE_COLORS[w.line]}"></i>Линия ${w.line + 1}: ${w.count} × ${esc(s.name)}${w.mult > 1 ? ` (×${w.mult})` : ''} — <b>${fmt(w.amount)}</b>`;
        i++;
      };
      cycle = setInterval(showOne, 1300);
    }
  }

  async function bigWin(win, level, balanceAfter) {
    const title = level >= 100 ? 'Мега выигрыш!' : level >= 40 ? 'Огромный выигрыш!' : 'Крупный выигрыш!';
    const dur = level >= 100 ? 5500 : level >= 40 ? 4000 : 2600;
    const { el, close } = modal(`
      ${pic(PILE_IMG, '💰', 'big-pic')}
      <h2 class="glow">${title}</h2>
      <div class="big-num">0</div>
      <p class="hint">нажмите, чтобы продолжить</p>`, { cls: 'bigwin' });
    const c = new Counter(el.querySelector('.big-num'), 0);
    coinShower(dur / 1000, level >= 40 ? 60 : 35, el);
    sfx.coins();
    let n = 0;
    const counting = c.set(win, dur, () => { if (n++ % 3 === 0) sfx.tick(); });
    balCounter.set(balanceAfter, dur);
    await new Promise((res) => {
      const finish = () => { c.finish(); balCounter.finish(); res(); };
      el.addEventListener('click', finish, { once: true });
      counting.then(() => setTimeout(finish, auto > 0 || inFs() ? 1500 : 2500));
    });
    close();
  }

  async function jackpotWin(amount) {
    sfx.jackpot();
    const { el, close } = modal(`
      ${pic(COMMON.jackpot.img, '👑', 'big-pic')}
      <h2 class="glow jp">Джекпот!</h2>
      <div class="big-num">0</div>
      <p class="hint">Общий джекпот ваш. Он снова растёт с ${fmt(JACKPOT_SEED)}.</p>`, { cls: 'bigwin jackpot' });
    const c = new Counter(el.querySelector('.big-num'), 0);
    coinShower(6, 80, el);
    let n = 0;
    const counting = c.set(amount, 6000, () => { if (n++ % 3 === 0) sfx.tick(); });
    balCounter.set(state.balance, 6000);
    jpCounter.set(state.jackpot, 1200);
    await new Promise((res) => {
      el.addEventListener('click', () => { c.finish(); res(); }, { once: true });
      counting.then(() => setTimeout(res, 3000));
    });
    close();
    auto = 0; // после джекпота автоигра останавливается — чтобы не пропустить праздник
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
      ${pic(PILE_IMG, '💰', 'big-pic')}
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
    winCounter.finish(); balCounter.finish();
    const fs = inFs();
    if (!fs && state.balance < bet) {
      auto = 0;
      const can = [...BETS].reverse().find((b) => b <= state.balance);
      if (can) { setBet(can, false); toast(`Не хватало монет — ставка уменьшена до ${fmt(can)}`); }
      else { refreshControls(); giftModal(() => { balCounter.set(state.balance, 800); refreshControls(); }); }
      return;
    }
    busy = true;
    const stake = fs ? F().bet : bet;
    const stops = (TEST && window.slots.force) || spinStops(strips);
    window.slots.force = null;
    const grid = windowAt(strips, stops);
    const mult = fs ? fsMultipliers(m, F().i) : { fsMult: 1, wildMult: 1 };
    const res = evaluate(m, grid, { lineBet: stake / 20, totalBet: stake, ...mult });

    // деньги считаем и сохраняем сразу — закрытие страницы посреди вращения ничего не теряет
    const win = res.total;
    let jpWin = 0;
    if (!fs) {
      state.balance -= stake;
      state.jackpot += stake * JACKPOT_SHARE;
      state.stats.spins++; state.stats.wagered += stake;
      if (auto > 0 && auto !== Infinity) auto--;
    } else { F().left--; F().i++; }
    if (res.jackpot.hit) {
      jpWin = Math.floor(state.jackpot);
      state.jackpot = JACKPOT_SEED;
      state.stats.jackpots++;
    }
    state.balance += win + jpWin;
    state.stats.won += win + jpWin;
    let fsStarted = 0, fsAdded = 0;
    if (fs) {
      const f = F();
      f.total += win;
      if (res.scatter.fs) { f.left += res.scatter.fs; f.count += res.scatter.fs; fsAdded = res.scatter.fs; }
    } else if (res.scatter.fs) {
      state.fs[m.id] = { left: res.scatter.fs, count: res.scatter.fs, i: 0, bet: stake, total: 0 };
      state.stats.fsRounds++;
      fsStarted = res.scatter.fs;
      fsHidden = true;
    }
    if (!fs && win + jpWin > state.stats.biggest) { state.stats.biggest = win + jpWin; state.stats.biggestMachine = m.title; }
    save();

    // «ожидание»: на первых барабанах уже 2 бонуса — или все короны подряд
    const anticipation = [];
    let sc = 0, jpRun = true;
    for (let r = 0; r < REELS; r++) {
      anticipation[r] = r >= 2 && (sc >= 2 || (jpRun && r >= 3));
      if (grid[r].includes('scatter')) sc++;
      if (!grid[r].includes('jackpot')) jpRun = false;
    }
    let landedSc = 0, landedJp = 0;
    view.onStop = (r) => {
      sfx.reelStop();
      if (grid[r].includes('scatter')) sfx.scatterLand(++landedSc);
      if (grid[r].includes('jackpot') && landedJp === r) sfx.jackpotLand(++landedJp);
      const nextAnt = r + 1 < REELS && anticipation[r + 1] && view.reel[r + 1].ant;
      sfx.anticipation(nextAnt);
      if (r === REELS - 1) sfx.spinStop();
    };
    view.clearWins();
    winCounter.set(0, 0);
    msg.innerHTML = fs ? `Бесплатное вращение ${F().i} из ${F().count}` : '';
    if (!fs) balCounter.set(state.balance - win - jpWin, 250);
    jpCounter.set(jpWin || state.jackpot, 400); // при джекпоте сумма держится до праздника
    sfx.spinStart(state.turbo);
    const p = view.spin(stops, { turbo: state.turbo, anticipation });
    refreshControls();
    await p;
    sfx.spinStop(); sfx.anticipation(false);
    if (!alive) return;
    refreshControls();
    await present(res, win, jpWin, stake, fs);
    if (!alive) return;
    if (fsAdded) { toast(`Ещё +${fsAdded} бесплатных вращений!`); sfx.fanfare(); await sleep(1200); }

    if (fsStarted) { stopCycle(); await fsIntro(fsStarted, false); fsHidden = false; }
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
      busy = false;
      winCounter.set(total, 0);
      refreshControls();
      if (auto > 0) schedule(spin, 600);
      return;
    }
    if (auto > 0) schedule(spin, win ? 900 : 350);
  }

  refreshControls();
  if (inFs()) {
    busy = true;
    fsIntro(F().left, true).then(() => { busy = false; refreshControls(); if (alive) spin(); });
  } else if (state.balance < BETS[0]) {
    giftModal(() => { balCounter.set(state.balance, 800); refreshControls(); });
  }

  current = {
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
  const lb = bet / 20;
  const row = (id) => {
    const p = m.pay[id];
    return `<div class="pt-item">${symPic(m, id)}<div><b>${esc(m.symbols[id].name)}</b>
      <span>5 — ${fmt(p[5] * lb)}</span><span>4 — ${fmt(p[4] * lb)}</span><span>3 — ${fmt(p[3] * lb)}</span></div></div>`;
  };
  const lines = LINES.map((ln, i) => `<div class="pt-line" title="Линия ${i + 1}"><i>${i + 1}</i>${[0, 1, 2].map((row) =>
    ln.map((r) => `<s class="${r === row ? 'on' : ''}" style="${r === row ? 'background:' + LINE_COLORS[i] : ''}"></s>`).join('')).join('')}</div>`).join('');
  const fs = m.freeSpins, sp = m.scatterPay;
  const { close, el } = modal(`
    <button class="x">✕</button>
    <h2>${m.title}: выплаты</h2>
    <p class="sub">Цифры — выигрыш в монетах при ставке ${fmt(bet)} за 5, 4 и 3 одинаковых символа на линии, считая с левого барабана.</p>
    <div class="pt-specials">
      <div class="pt-item wide">${symPic(m, 'wild')}<div><b>${esc(m.symbols.wild.name)} — WILD</b><span>Заменяет любой символ, кроме бонуса и короны. Бывает на барабанах 2–5.</span></div></div>
      <div class="pt-item wide">${symPic(m, 'scatter')}<div><b>${esc(m.symbols.scatter.name)} — БОНУС</b><span>3, 4 или 5 в любом месте: ${fs[3]}, ${fs[4]} или ${fs[5]} бесплатных вращений и ${fmt(sp[3] * bet)} / ${fmt(sp[4] * bet)} / ${fmt(sp[5] * bet)} монет сразу. ${esc(m.fs.text)}. В бесплатных вращениях можно выиграть ещё вращения.</span></div></div>
      <div class="pt-item wide">${pic(COMMON.jackpot.img, '👑')}<div><b>Корона — ДЖЕКПОТ</b><span>Пять корон, по одной на каждом барабане, забирают весь общий джекпот (сейчас ${fmt(state.jackpot)}). Он общий для всех автоматов и растёт на ${Math.round(JACKPOT_SHARE * 100)}% каждой ставки.</span></div></div>
    </div>
    <div class="pt-grid">${['h1', 'h2', 'h3', 'l1', 'l2', 'l3', 'l4'].map(row).join('')}</div>
    <h3>20 линий</h3>
    <div class="pt-lines">${lines}</div>`, { cls: 'paytable', closeOnBg: true });
  el.querySelector('.x').addEventListener('click', close);
}

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

// ---------- переходы ----------
function route() {
  current?.destroy();
  layer.innerHTML = '';
  const mm = location.hash.match(/^#\/m\/(\w+)/);
  const m = mm && byId(mm[1]);
  if (m) machineScreen(m); else lobby();
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();
