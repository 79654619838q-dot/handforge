// Бонус-игры на экране: «Выбери сундук», джекпот-игра, колесо удачи.
// Что внутри — решено заранее (engine.js / meta.js), игрок только открывает по очереди.
import { COMMON, JACKPOTS } from './machines.js';
import { modal, pic, fmt, Counter, coinShower, sleep, esc } from './ui.js';
import { sfx } from './audio.js';
import { WHEEL, wheelPrizeCoins } from './meta.js';

// «Выбери сундук». board — из engine.pickBoard, bet — ставка; auto — открывать самому (автоигра).
export function pickGame({ board, bet, chestImg, auto = false }) {
  return new Promise((resolve) => {
    const { el, close } = modal(`
      <h2 class="glow">Выбери сундук!</h2>
      <p>Открывайте сундуки, пока не попадётся «Забрать». Внутри — монеты и «×2 ко всему».</p>
      <div class="pick-sum">Собрано: <b class="ps">0</b></div>
      <div class="pick-grid">${board.order.map((_, i) => `<button class="chest" data-i="${i}">${pic(chestImg, '🧰', 'ch-closed')}${pic(COMMON.chestOpen, '📦', 'ch-open')}<span class="prize"></span></button>`).join('')}</div>
      <button class="btn-gold done" hidden>Забрать</button>`, { cls: 'pick-game' });
    const sumC = new Counter(el.querySelector('.ps'), 0);
    let n = 0, sum = 0, dbl = 1, over = false;
    const label = (item) => (item === 'collect' ? 'Забрать' : item === 'x2' ? '×2 ко всему!' : '+' + fmt(item * bet));
    const show = (btn, item, rest = false) => {
      btn.classList.add('open', rest ? 'rest' : 'got', item === 'collect' ? 'is-collect' : item === 'x2' ? 'is-x2' : 'is-coin');
      btn.querySelector('.prize').textContent = label(item);
    };
    const finish = async () => {
      over = true;
      const total = board.total * bet;
      await sleep(700);
      // остальное показываем, что было внутри
      let j = n;
      el.querySelectorAll('.chest:not(.open)').forEach((b) => show(b, board.order[j++], true));
      sumC.set(total, 300);
      const done = el.querySelector('.done');
      done.hidden = false;
      done.textContent = total ? `Забрать ${fmt(total)}` : 'Закрыть';
      if (total) { sfx.prize(true); coinShower(1.6, 30, el); }
      let closed = false;
      const end = () => { if (closed) return; closed = true; close(); resolve(total); };
      done.addEventListener('click', end, { once: true });
      if (auto) setTimeout(end, 2600);
    };
    const open = (btn) => {
      if (over || btn.classList.contains('open')) return;
      const item = board.order[n++];
      show(btn, item);
      sfx.chest();
      if (item === 'collect') { sfx.empty(); finish(); return; }
      if (item === 'x2') { dbl = 2; sfx.mult(2); } else { sum += item; sfx.prize(false); }
      sumC.set(sum * bet * dbl, 400);
      if (n > board.stop) finish();
    };
    el.querySelectorAll('.chest').forEach((b) => b.addEventListener('click', () => open(b)));
    if (auto) {
      const t = setInterval(() => {
        if (over) return clearInterval(t);
        const left = [...el.querySelectorAll('.chest:not(.open)')];
        open(left[Math.floor(Math.random() * left.length)]);
      }, 750);
    }
  });
}

// Джекпот-игра: 12 монет, у каждого джекпота по три. Кто первым соберёт три — тот выигран.
// values — { mini, minor, major, grand } в монетах.
export function jackpotGame({ board, values, crowns, auto = false }) {
  return new Promise((resolve) => {
    const { el, close } = modal(`
      <h2 class="glow">Джекпот-игра!</h2>
      <p>${crowns} ${crowns >= 5 ? 'корон' : 'короны'} на барабанах. Открывайте монеты — три одинаковых джекпота забирают его.</p>
      <div class="jp-plates">${JACKPOTS.map((j) => `<div class="jp-plate" data-t="${j.id}" style="--c:${j.color}"><b>${j.name}</b><span>${fmt(values[j.id])}</span><i><s></s><s></s><s></s></i></div>`).join('')}</div>
      <div class="jp-grid">${board.order.map((_, i) => `<button class="jcoin" data-i="${i}">${pic(COMMON.coin, '🪙')}<span class="jl"></span></button>`).join('')}</div>`, { cls: 'jp-game' });
    const got = {};
    let n = 0, over = false;
    const names = Object.fromEntries(JACKPOTS.map((j) => [j.id, j]));
    const mark = (btn, t, rest = false) => {
      btn.classList.add('open', rest ? 'rest' : 'got');
      btn.style.setProperty('--c', names[t].color);
      btn.querySelector('.jl').textContent = names[t].name;
    };
    const open = async (btn) => {
      if (over || btn.classList.contains('open')) return;
      const t = board.order[n++];
      mark(btn, t);
      got[t] = (got[t] || 0) + 1;
      const plate = el.querySelector(`.jp-plate[data-t="${t}"]`);
      plate.querySelectorAll('s')[got[t] - 1]?.classList.add('on');
      sfx.chest();
      if (got[t] === 3) {
        over = true;
        plate.classList.add('win');
        sfx.prize(true);
        await sleep(900);
        let j = n;
        el.querySelectorAll('.jcoin:not(.open)').forEach((b) => mark(b, board.order[j++], true));
        await sleep(auto ? 1200 : 1600);
        close();
        resolve(t);
      }
    };
    el.querySelectorAll('.jcoin').forEach((b) => b.addEventListener('click', () => open(b)));
    if (auto) {
      const t = setInterval(() => {
        if (over) return clearInterval(t);
        const left = [...el.querySelectorAll('.jcoin:not(.open)')];
        open(left[Math.floor(Math.random() * left.length)]);
      }, 650);
    }
  });
}

// Колесо удачи. spin() → { index, prize } (решает meta.spinWheel), колесо докручивается до выпавшего.
export function wheelModal({ spin, ready, left }) {
  const N = WHEEL.length;
  const { el, close } = modal(`
    <button class="x">✕</button>
    <h2 class="glow">Колесо удачи</h2>
    <p class="wh-sub">Бесплатно раз в 3 часа. Чем выше уровень, тем больше призы.</p>
    <div class="wheel-box"><canvas class="wheel" width="720" height="720"></canvas><div class="wheel-pin"></div>
      <button class="wheel-go" ${ready ? '' : 'disabled'}>${ready ? 'Крутить!' : 'Ждём'}</button></div>
    <p class="wh-res">${ready ? '' : `Следующее вращение через ${left}`}</p>`, { cls: 'wheel-modal' });
  const cv = el.querySelector('.wheel'), g = cv.getContext('2d');
  const R = 350, C = 360, seg = (Math.PI * 2) / N;
  let angle = 0;
  const draw = () => {
    g.clearRect(0, 0, 720, 720);
    g.save(); g.translate(C, C); g.rotate(angle);
    WHEEL.forEach((s, i) => {
      const a0 = -Math.PI / 2 - seg / 2 + i * seg;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a0 + seg); g.closePath();
      const gr = g.createRadialGradient(0, 0, 40, 0, 0, R);
      gr.addColorStop(0, '#1a1020'); gr.addColorStop(0.35, s.color); gr.addColorStop(1, shade(s.color));
      g.fillStyle = gr; g.fill();
      g.lineWidth = 4; g.strokeStyle = '#f5d77a'; g.stroke();
      g.save(); g.rotate(a0 + seg / 2); g.translate(R * 0.66, 0); g.rotate(Math.PI / 2);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineJoin = 'round';
      const txt = s.coins ? short(wheelPrizeCoins(s)) : `${s.fs} FS`;
      g.font = `${s.coins === 100000 ? 40 : 36}px "Russo One", "Arial Black", sans-serif`;
      g.strokeText(txt, 0, 0); g.fillText(txt, 0, 0);
      g.font = '22px "Rubik", sans-serif';
      const sub = s.coins ? 'монет' : 'вращений';
      g.strokeText(sub, 0, 34); g.fillText(sub, 0, 34);
      g.restore();
    });
    g.restore();
    // обод с лампочками и центр
    g.beginPath(); g.arc(C, C, R + 4, 0, Math.PI * 2); g.lineWidth = 14; g.strokeStyle = '#c8901c'; g.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath(); g.arc(C + Math.cos(a) * (R + 4), C + Math.sin(a) * (R + 4), 6, 0, Math.PI * 2);
      g.fillStyle = i % 2 ? '#fff6c0' : '#ffb000'; g.fill();
    }
    const cg = g.createRadialGradient(C - 15, C - 15, 5, C, C, 60);
    cg.addColorStop(0, '#fff3b0'); cg.addColorStop(1, '#a86e00');
    g.beginPath(); g.arc(C, C, 58, 0, Math.PI * 2); g.fillStyle = cg; g.fill();
  };
  draw();
  return new Promise((resolve) => {
    el.querySelector('.x').addEventListener('click', () => resolve(null));
    const go = el.querySelector('.wheel-go');
    go.addEventListener('click', async () => {
      if (go.disabled) return;
      go.disabled = true; go.textContent = '…';
      el.querySelector('.x').hidden = true;
      const res = spin();
      // докрутить: 6 оборотов и встать серединой выпавшего сектора под стрелку (вверху)
      const target = Math.PI * 2 * 6 - res.index * seg + (Math.random() - 0.5) * seg * 0.6;
      const t0 = performance.now(), dur = 5200, from = angle;
      let lastSeg = -1;
      await new Promise((done) => {
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          angle = from + (target - from) * (1 - (1 - k) ** 4);
          const s = Math.floor(((angle % (Math.PI * 2)) + seg / 2) / seg);
          if (s !== lastSeg) { lastSeg = s; sfx.wheelTick(); }
          draw();
          if (k < 1) requestAnimationFrame(step); else done();
        };
        requestAnimationFrame(step);
      });
      const p = res.prize;
      el.querySelector('.wh-res').innerHTML = p.coins
        ? `Ваш приз: <b>${fmt(p.coins)}</b> монет!`
        : `Ваш приз: <b>${p.fs} бесплатных вращений</b> в автомате «${esc(p.machine.title)}»!`;
      sfx.levelUp();
      coinShower(2, 40, el);
      go.textContent = 'Отлично!'; go.disabled = false;
      go.addEventListener('click', () => { close(); resolve(res); }, { once: true });
    }, { once: true });
  }).then((r) => { close(); return r; });
}

const short = (n) => (n >= 1000 ? (n % 1000 ? (n / 1000).toFixed(1).replace('.', ',') : n / 1000) + 'K' : String(n));
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * 0.45);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
