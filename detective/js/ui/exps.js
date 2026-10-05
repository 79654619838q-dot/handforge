// Эксперименты — маленькие проверочные задачи. Каждый тип — функция (x, area, report) → ничего;
// report(true) — пройден, report(false) — промах (штраф), после промаха можно пробовать ещё.
import { h, pic, sleep } from '../util.js';
import { say, sfx, stopSpeech } from '../audio.js';
import { screen } from '../main.js';
import { person } from '../data/people.js';
const nameOf = (id) => person(id).name;

const TYPES = {};

export async function runExperiment(x, C, run, onResult, onBack) {
  const area = h('div.exp-area');
  const done = run.has('x:' + x.id);
  screen(h('div.exp',
    pic('ui/lab', 'hub-bg'),
    h('div.topbar.over', h('button.btn.ghost.back', { onclick: () => { stopSpeech(); onBack(); } }, '← Назад'), h('div.top-title', x.name), h('div.top-score', run.score() + ' очков')),
    area,
  ));
  if (x.intro && !done) say(x.intro);
  const finish = h('button.btn.primary.big', { onclick: () => { stopSpeech(); onBack(); } }, 'Вернуться к делу');
  const report = async (ok, variant) => {
    if (done) return true;
    const out = await onResult(ok, variant);
    if (ok) area.append(h('div.exp-done', '✓ Эксперимент пройден', finish));
    return ok;
  };
  const fn = TYPES[x.type];
  if (!fn) { area.append(h('div.empty', 'Неизвестный эксперимент ' + x.type)); return; }
  fn(x, area, report, { C, run, done });
  if (done) area.append(h('div.exp-done', '✓ Уже пройден', finish));
  window.__exp = { x, solve: () => solveAuto(x, area) };
}

// для автопроверки — нажать верные ответы
function solveAuto(x, area) {
  const btns = area.querySelectorAll('[data-right="1"]');
  btns.forEach((b) => b.click());
  return btns.length;
}

// ——— запись камеры: кадры по времени, вопросы по кадрам ———
TYPES.cctv = (x, area, report, { done }) => {
  const d = x.data;
  let cur = 0, task = done ? d.tasks.length : 0;
  const screenImg = h('div.cctv-screen');
  const stamp = h('div.cctv-time');
  const strip = h('div.cctv-strip');
  const qbox = h('div.cctv-q');
  function show(i) {
    cur = i;
    screenImg.replaceChildren(pic(d.frames[i].img, 'cctv-img'), h('div.cctv-noise'), h('div.cctv-rec', '● REC  КАМ-1'), stamp);
    stamp.textContent = d.frames[i].t;
    strip.querySelectorAll('.cctv-thumb').forEach((b, k) => b.classList.toggle('on', k === i));
  }
  d.frames.forEach((f, i) => strip.append(h('button.cctv-thumb', { onclick: () => { sfx.click(); show(i); } }, pic(f.img, 'thumb-img'), h('span', f.t))));
  function renderTask() {
    qbox.replaceChildren();
    if (task >= d.tasks.length) { qbox.append(h('div.q-done', 'Все вопросы по записи разобраны.')); return; }
    const t = d.tasks[task];
    qbox.append(h('div.q-text', `Вопрос ${task + 1} из ${d.tasks.length}: ${t.q}`));
    if (t.frame != null) show(t.frame);
    // увеличение номера: на кадре он не читается, после «обработки» — вот он
    if (t.zoom && d.plate) qbox.append(h('div.cctv-zoom', h('div.zoom-label', 'Увеличение и резкость'), h('div.plate', d.plate)));
    if (t.pick === 'frame') {
      qbox.append(h('div.q-tip', 'Выберите кадр внизу и нажмите «Этот кадр»'),
        h('button.btn.primary', { 'data-right': '0', onclick: () => check(cur === t.ok) }, 'Этот кадр'));
      // для автопроверки: правильный ответ
      qbox.append(h('button.hidden', { 'data-right': '1', onclick: () => { show(t.ok); check(true); } }));
    } else {
      qbox.append(h('div.opts', t.opts.map((o, i) => h('button.opt', { 'data-right': i === t.ok ? '1' : '0', onclick: () => check(i === t.ok) }, o))));
    }
  }
  async function check(ok) {
    if (ok) { sfx.right(); task++; renderTask(); if (task >= d.tasks.length) await report(true); }
    else { sfx.wrong(); qbox.classList.add('shake'); setTimeout(() => qbox.classList.remove('shake'), 500); await report(false); }
  }
  area.append(h('div.cctv', screenImg, strip, qbox));
  show(0);
  renderTask();
};

// ——— таблица записей (такси, банк, звонки, пропуска): найти нужную строку ———
TYPES.records = (x, area, report, { done }) => {
  const d = x.data;
  let solved = done;
  const table = h('table.records',
    h('thead', h('tr', d.cols.map((c) => h('th', c)))),
    h('tbody', d.rows.map((r, i) => h('tr', { 'data-right': i === d.ok ? '1' : '0', onclick: (e) => pick(i, e.currentTarget) }, r.map((c) => h('td', c))))),
  );
  const q = h('div.q-text', d.q);
  async function pick(i, tr) {
    if (solved) return;
    if (i === d.ok) { solved = true; sfx.right(); tr.classList.add('right'); await report(true); }
    else { sfx.wrong(); tr.classList.add('wrong'); setTimeout(() => tr.classList.remove('wrong'), 600); await report(false); }
  }
  area.append(h('div.records-box', h('div.rec-title', d.title), q, h('div.rec-scroll', table)));
  if (done) table.querySelectorAll('tbody tr')[d.ok].classList.add('right');
};

// ——— рост по кадру камеры: эталон — дверь известной высоты, игрок тянет линию к макушке ———
// Человек стоит в проёме двери, поэтому рост = (пол − макушка) / (пол − верх двери) × высота двери.
TYPES.measure = (x, area, report, { C, done }) => {
  const d = x.data;
  let y = d.startY ?? 0.5;
  let solved = done;
  const line = h('div.m-line', h('span.m-tag', 'макушка'));
  const read = h('div.m-read');
  const box = h('div.m-box',
    pic(d.img, 'm-img'),
    h('div.m-ref', { style: { top: d.refTop * 100 + '%' } }, h('span', `верх двери · ${String(d.refH).replace('.', ',')} м`)),
    h('div.m-ref.floor', { style: { top: d.floor * 100 + '%' } }, h('span', 'пол')),
    line,
  );
  const calc = () => Math.max(0, (d.floor - y) / (d.floor - d.refTop) * d.refH);
  const draw = () => {
    line.style.top = y * 100 + '%';
    read.textContent = 'Рост ≈ ' + calc().toFixed(2).replace('.', ',') + ' м';
  };
  const setFrom = (e) => {
    const r = box.getBoundingClientRect();
    y = Math.max(0.02, Math.min(d.floor - 0.02, (e.clientY - r.top) / r.height));
    draw();
  };
  let drag = false;
  box.addEventListener('pointerdown', (e) => { drag = true; box.setPointerCapture?.(e.pointerId); setFrom(e); });
  box.addEventListener('pointermove', (e) => { if (drag) setFrom(e); });
  box.addEventListener('pointerup', () => { drag = false; });
  const people = h('div.m-people', h('div.q-text', d.q), h('div.opts', d.people.map((p) => {
    return h('button.opt', { 'data-right': p.id === d.ok ? '1' : '0', onclick: async (e) => {
      if (solved) return;
      if (p.id === d.ok) { solved = true; sfx.right(); e.currentTarget.classList.add('right'); await report(true); }
      else { sfx.wrong(); const b = e.currentTarget; b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 600); await report(false); }
    } }, nameOf(p.id) + ' — ' + String(p.h.toFixed(2)).replace('.', ',') + ' м');
  })));
  area.append(h('div.measure', h('div.m-left', box, read, h('div.q-tip', 'Ведите по картинке вверх-вниз: линия должна лечь на макушку.')), people));
  draw();
};

// ——— проверка по данным: таблица и факты, потом вопрос с вариантами ———
TYPES.check = (x, area, report, { done }) => {
  const d = x.data;
  let solved = done;
  const opts = h('div.opts', d.opts.map((o, i) => h('button.opt', { 'data-right': i === d.ok ? '1' : '0', onclick: async (e) => {
    if (solved) return;
    const b = e.currentTarget;
    if (i === d.ok) { solved = true; sfx.right(); b.classList.add('right'); await report(true); }
    else { sfx.wrong(); b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 600); await report(false); }
  } }, o)));
  area.append(h('div.records-box',
    h('div.rec-title', d.title),
    d.img ? pic(d.img, 'check-img') : null,
    d.rows ? h('div.rec-scroll', h('table.records.static', h('thead', h('tr', d.cols.map((c) => h('th', c)))), h('tbody', d.rows.map((r) => h('tr', r.map((c) => h('td', c))))))) : null,
    d.facts ? h('ul.facts', d.facts.map((f) => h('li', f))) : null,
    h('div.q-text', d.q),
    opts,
  ));
  if (done) opts.children[d.ok].classList.add('right');
};

// ——— план помещения: нажимая на клетки, игрок узнаёт данные и выбирает нужную ———
TYPES.plan = (x, area, report, { done }) => {
  const d = x.data;
  let sel = null, solved = done;
  const info = h('div.plan-info', 'Нажимайте на клетки плана.');
  const cells = d.cells.map((c) => h('button.plan-cell' + (c.id === 'P' ? '.panel' : ''), { 'data-id': c.id, onclick: (e) => {
    sfx.click(); sel = c.id;
    const b = e.currentTarget; b.classList.add('seen');
    b.querySelector('.pc-val').textContent = c.val;
    grid.querySelectorAll('.plan-cell').forEach((x) => x.classList.toggle('sel', x === b));
    info.textContent = `${c.label}: ${c.val}`;
  } }, h('b', c.label), h('span.pc-val', '?')));
  const grid = h('div.plan-grid', cells);
  const go = h('button.btn.primary', { onclick: async () => {
    if (solved) return;
    if (!sel) return info.textContent = 'Сначала выберите клетку.';
    if (sel === d.ok) { solved = true; sfx.right(); grid.querySelector(`[data-id="${d.ok}"]`).classList.add('right'); await report(true); }
    else { sfx.wrong(); grid.classList.add('shake'); setTimeout(() => grid.classList.remove('shake'), 500); await report(false); }
  } }, 'Это здесь');
  // для автопроверки
  const auto = h('button.hidden', { 'data-right': '1', onclick: () => { grid.querySelector(`[data-id="${d.ok}"]`).click(); go.click(); } });
  area.append(h('div.records-box', h('div.rec-title', d.title), h('div.q-text', d.q), grid, info, go, auto));
  if (done) grid.querySelector(`[data-id="${d.ok}"]`).classList.add('right');
};

// ——— почерк: образцы настоящей подписи и спорная; найти буквы, написанные чужой рукой ———
TYPES.hand = (x, area, report, { done }) => {
  const d = x.data;
  const need = new Set(d.diff);
  const found = new Set(done ? d.diff : []);
  let solved = done;
  const sample = () => h('div.sig.genuine', [...d.word].map((ch) => h('span', ch)));
  const q = h('div.sig.questioned', [...d.word].map((ch, i) => h('span' + (need.has(i) ? '.forged' : ''), {
    'data-right': need.has(i) ? '1' : '0',
    onclick: async (e) => {
      if (solved || found.has(i)) return;
      const s = e.currentTarget;
      if (need.has(i)) {
        found.add(i); s.classList.add('right'); sfx.right();
        if (found.size === need.size) { solved = true; await report(true); }
      } else { sfx.wrong(); s.classList.add('wrong'); setTimeout(() => s.classList.remove('wrong'), 600); await report(false); }
    },
  }, ch)));
  area.append(h('div.records-box.hand',
    h('div.rec-title', 'Почерковедческая экспертиза'),
    h('div.hand-cols',
      h('div', h('div.hand-label', 'Подписи Нины из документов'), sample(), sample(), sample()),
      h('div', h('div.hand-label', 'Подпись на заявлении'), q, h('div.q-tip', `Нажмите на буквы, которые написаны иначе (их ${need.size}).`)),
    ),
  ));
  if (done) q.querySelectorAll('.forged').forEach((s) => s.classList.add('right'));
};

// ——— кто на снимке: эталонная картинка и портреты знакомых ———
TYPES.pick = (x, area, report, { done }) => {
  const d = x.data;
  let solved = done;
  area.append(h('div.pick',
    h('div.pick-ref', pic(d.img, 'pick-img')),
    h('div.pick-side', h('div.q-text', d.q), h('div.pick-people', d.people.map((id) => h('button.pick-person' + (done && id === d.ok ? '.right' : ''), {
      'data-right': id === d.ok ? '1' : '0',
      onclick: async (e) => {
        if (solved) return;
        const b = e.currentTarget;
        if (id === d.ok) { solved = true; b.classList.add('right'); sfx.right(); await report(true); }
        else { sfx.wrong(); b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 600); await report(false); }
      },
    }, pic('p/' + id, 'pick-face'), h('b', nameOf(id)))))),
  ));
};

// ——— хронология: нажимать события от раннего к позднему, потом ответить, что не сходится ———
TYPES.timeline = (x, area, report, { done }) => {
  const d = x.data;
  let next = done ? d.events.length : 0, solved = done;
  const order = d.events.map((e, i) => ({ ...e, i }));
  // перемешиваем раз и навсегда для этого показа (детерминированно — по длине текста), чтобы порядок не совпадал с верным
  const shuffled = [...order].sort((a, b) => ((a.text.length * 7 + a.i * 13) % 11) - ((b.text.length * 7 + b.i * 13) % 11));
  const line = h('div.tl-line');
  const pool = h('div.tl-pool');
  const qbox = h('div.tl-q');
  const place = (e) => line.append(h('div.tl-item', h('b', e.t), h('span', e.text)));
  shuffled.forEach((e) => pool.append(h('button.tl-card', { 'data-right': '0', 'data-i': e.i, onclick: async (ev) => {
    if (solved || next >= d.events.length) return;
    const b = ev.currentTarget;
    if (e.i === next) { sfx.click(); b.remove(); place(e); next++; markRight(); if (next === d.events.length) askQ(); }
    else { sfx.wrong(); b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 600); await report(false); }
  } }, h('span', e.text))));
  function markRight() { pool.querySelectorAll('.tl-card').forEach((b) => b.dataset.right = +b.dataset.i === next ? '1' : '0'); }
  function askQ() {
    qbox.replaceChildren(h('div.q-text', d.q), h('div.opts', d.opts.map((o, i) => h('button.opt', { 'data-right': i === d.ok ? '1' : '0', onclick: async (e) => {
      if (solved) return;
      const b = e.currentTarget;
      if (i === d.ok) { solved = true; sfx.right(); b.classList.add('right'); await report(true); }
      else { sfx.wrong(); b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 600); await report(false); }
    } }, o))));
  }
  area.append(h('div.records-box', h('div.rec-title', 'Хронология'), h('div.q-tip', 'Нажимайте события по порядку — от раннего к позднему.'), line, pool, qbox));
  if (done) { d.events.forEach(place); pool.replaceChildren(); askQ(); qbox.querySelectorAll('.opt')[d.ok].classList.add('right'); }
  else markRight();
};

// ——— продавленная страница: штриховать «карандашом», пока не проступит текст ———
TYPES.rubbing = (x, area, report, { done }) => {
  const d = x.data;
  const W = 640, H = 300;
  const cv = h('canvas.rub', { width: W, height: H });
  const g = cv.getContext('2d');
  // бумага
  g.fillStyle = '#efe6cf'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(70,110,170,.25)'; g.beginPath(); g.moveTo(0, 40 + i * 30); g.lineTo(W, 40 + i * 30); g.stroke(); }
  // маска с текстом: где текст — бумага остаётся светлой под штрихом (продавленные бороздки)
  const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
  const m = mask.getContext('2d');
  m.fillStyle = '#000'; m.font = 'italic 34px "Bad Script", cursive';
  d.lines.forEach((t, i) => m.fillText(t, 30, 80 + i * 70));
  const md = m.getImageData(0, 0, W, H).data;
  const textPx = []; for (let i = 0; i < W * H; i++) if (md[i * 4 + 3] > 80) textPx.push(i);
  const shaded = new Uint8Array(W * H);
  let solved = done, count = 0;
  const bar = h('div.rub-bar', h('i'));
  function rub(px, py) {
    const r = 18;
    for (let y = Math.max(0, py - r); y < Math.min(H, py + r); y++) for (let x2 = Math.max(0, px - r); x2 < Math.min(W, px + r); x2++) {
      if ((x2 - px) ** 2 + (y - py) ** 2 > r * r) continue;
      const i = y * W + x2;
      if (shaded[i]) continue;
      shaded[i] = 1;
      const isText = md[i * 4 + 3] > 80;
      if (isText) count++;
      // штрих графитом, бороздки остаются светлыми
      g.fillStyle = isText ? 'rgba(239,230,207,1)' : `rgba(60,60,70,${0.55 + Math.random() * 0.25})`;
      g.fillRect(x2, y, 1, 1);
    }
    const p = count / textPx.length;
    bar.firstChild.style.width = Math.min(100, p / 0.6 * 100) + '%';
    if (!solved && p >= 0.6) finish();
  }
  async function finish() {
    solved = true; sfx.right();
    area.querySelector('.rub-text')?.classList.add('show');
    await report(true);
  }
  let down = false;
  const at = (e) => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * W), Math.round((e.clientY - r.top) / r.height * H)]; };
  cv.addEventListener('pointerdown', (e) => { down = true; cv.setPointerCapture?.(e.pointerId); rub(...at(e)); });
  cv.addEventListener('pointermove', (e) => { if (down) rub(...at(e)); });
  cv.addEventListener('pointerup', () => { down = false; });
  // для автопроверки — заштриховать всё
  const auto = h('button.hidden', { 'data-right': '1', onclick: () => { for (let y = 10; y < H; y += 24) for (let x2 = 10; x2 < W; x2 += 24) rub(x2, y); } });
  area.append(h('div.records-box', h('div.rec-title', 'Продавленная страница'), h('div.q-tip', 'Водите по листу — штрихуйте карандашом.'), cv, bar,
    h('div.rub-text' + (done ? '.show' : ''), d.lines.map((t) => h('div', t))), auto));
  if (done) { for (let y = 10; y < H; y += 24) for (let x2 = 10; x2 < W; x2 += 24) rub(x2, y); }
};

// ——— чужой телефон: подобрать PIN по подсказке, потом найти важное ———
TYPES.phone = (x, area, report, { done }) => {
  const d = x.data;
  let code = '', solved = done, unlocked = done;
  const dots = h('div.ph-dots');
  const screenBox = h('div.ph-screen');
  const drawDots = () => dots.replaceChildren(...[0, 1, 2, 3].map((i) => h('i' + (i < code.length ? '.on' : ''))));
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  const pad = h('div.ph-pad', keys.map((k) => (k ? h('button.ph-key', {
    'data-right': '0',
    onclick: () => {
      if (unlocked) return;
      sfx.click();
      if (k === 'del') code = code.slice(0, -1); else if (code.length < 4) code += k;
      drawDots();
      if (code.length === 4) {
        if (code === d.pin) { unlocked = true; sfx.right(); showItems(); }
        else { sfx.wrong(); dots.classList.add('shake'); setTimeout(() => { dots.classList.remove('shake'); code = ''; drawDots(); }, 500); }
      }
    },
  }, k === 'del' ? '←' : k) : h('span'))));
  // для автопроверки: ввести верный код
  const auto = h('button.hidden', { 'data-right': '1', onclick: () => { code = d.pin; unlocked = true; showItems(); } });
  function showItems() {
    screenBox.replaceChildren(h('div.q-text', d.q), h('div.ph-items', d.items.map((it, i) => h('button.ph-item', {
      'data-right': i === d.ok ? '1' : '0',
      onclick: async (e) => {
        if (solved) return;
        const b = e.currentTarget;
        if (i === d.ok) { solved = true; sfx.right(); b.classList.add('right'); await report(true); }
        else { sfx.wrong(); b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 600); await report(false); }
      },
    }, h('b', it.kind), h('span', it.text)))));
  }
  screenBox.append(h('div.ph-lock', 'Введите код'), dots, h('div.q-tip', d.tip || ''), pad, auto);
  drawDots();
  area.append(h('div.phone-box', h('div.ph-frame', screenBox)));
  if (done) { showItems(); screenBox.querySelectorAll('.ph-item')[d.ok].classList.add('right'); }
};

// ——— маршрут: выбрать дорогу и посчитать, успевал ли человек туда, на место и обратно ———
TYPES.route = (x, area, report, { done }) => {
  const d = x.data;
  let solved = done;
  const calc = h('div.route-calc', 'Выберите дорогу, чтобы посчитать время.');
  const cards = h('div.route-cards', d.routes.map((r) => h('button.route-card', {
    onclick: (e) => {
      sfx.click();
      cards.querySelectorAll('.route-card').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
      const total = r.min * 2 + d.work;
      const ok = total <= d.window;
      const seg = (w, cls, label) => h('div.route-seg.' + cls, { style: { flex: w } }, label);
      calc.replaceChildren(
        h('div.route-bar', seg(r.min, 'go', `туда ${r.min}`), seg(d.work, 'work', `${d.work}`), seg(r.min, 'back', `обратно ${r.min}`)),
        h('div.route-limit', { style: { width: Math.min(100, d.window / total * 100) + '%' } }, h('span', `было ${d.window} мин`)),
        h('div.route-total' + (ok ? '.ok' : '.no'), `Итого ${total} мин — ${ok ? 'успевал' : 'не успевал'}`),
      );
    },
  }, h('b', r.name), h('span', `${r.km} км · ${r.min} мин в одну сторону`))));
  const opts = h('div.opts', d.opts.map((o, i) => h('button.opt', { 'data-right': i === d.ok ? '1' : '0', onclick: async (e) => {
    if (solved) return;
    const b = e.currentTarget;
    if (i === d.ok) { solved = true; sfx.right(); b.classList.add('right'); await report(true); }
    else { sfx.wrong(); b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 600); await report(false); }
  } }, o)));
  area.append(h('div.records-box',
    h('div.rec-title', `${d.from} → ${d.to} → обратно`),
    h('div.q-tip', `Он отсутствовал ${d.window} минут. На месте нужно ${d.work} минут.`),
    cards, calc, h('div.q-text', d.q), opts));
  if (done) opts.children[d.ok].classList.add('right');
};

// ——— выбор без «правильного» ответа: от него зависит, что удастся спасти ———
TYPES.choice = (x, area, report, { done, run }) => {
  const d = x.data;
  let picked = done;
  area.append(h('div.records-box',
    h('div.rec-title', d.title),
    d.facts ? h('ul.facts', d.facts.map((f) => h('li', f))) : null,
    h('div.q-text', d.q),
    h('div.choice-cards', d.opts.map((o, i) => h('button.choice-card' + (done && run.test(o.gives?.[0]) ? '.right' : ''), {
      'data-right': i === (d.best ?? 0) ? '1' : '0',
      onclick: async (e) => {
        if (picked) return;
        picked = true; sfx.stamp();
        e.currentTarget.classList.add('right');
        await report(true, i);
      },
    }, h('b', o.text), o.sub ? h('span', o.sub) : null))),
    h('div.q-tip', 'Решение одно. Отменить его будет нельзя.'),
  ));
};
