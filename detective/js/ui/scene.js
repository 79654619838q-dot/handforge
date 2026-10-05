// Осмотр места: большая картинка в темноте, игрок водит фонариком и нажимает на подозрительное.
// Улики не подсвечены. Найденные отмечаются кружком. Можно приблизить и двигать картинку.
import { h, pic, sleep, toast } from '../util.js';
import { say, sfx, ambient } from '../audio.js';
import { screen } from '../main.js';
import { LINES } from '../data/common.js';

export function sceneView({ C, run, placeId, onBack, onEnter, onSearch }) {
  const P = C.places[placeId];
  ambient(C.diff >= 4 ? 'tense' : 'calm');
  const image = pic(P.img, 'scene-img');
  const marks = h('div.scene-marks');
  const stage = h('div.scene-stage', image, marks);
  const dark = h('div.scene-dark');
  const viewport = h('div.scene-viewport', stage, dark);
  const counter = h('div.top-score');
  const zoomIn = h('button.zoom-btn', { onclick: () => setZoom(zi + 1) }, '+');
  const zoomOut = h('button.zoom-btn', { onclick: () => setZoom(zi - 1) }, '−');
  screen(h('div.scene',
    viewport,
    h('div.topbar.over', h('button.btn.ghost.back', { onclick: () => onBack() }, '← Назад'), h('div.top-title', P.name), counter),
    h('div.scene-tools', zoomOut, zoomIn),
    h('div.scene-help', 'Водите фонариком и нажимайте на всё подозрительное'),
  ));
  // темнота: чем сложнее дело, тем гуще
  const darkness = Math.min(0.9, 0.66 + C.diff * 0.03);
  viewport.style.setProperty('--dark', darkness);

  // телефон вертикально: картинка узкой полосой — сразу крупнее, двигать пальцем
  const portrait = () => window.innerHeight > window.innerWidth * 1.2;
  const ZOOMS = portrait() ? [1, 2, 3] : [1, 1.7, 2.6];
  let zi = portrait() ? 1 : 0, tx = 0, ty = 0;
  if (portrait()) {
    let shown = false;
    try { shown = !!sessionStorage.getItem('rotHint'); sessionStorage.setItem('rotHint', '1'); } catch { }
    if (!shown) toast('Удобнее искать улики, повернув телефон боком');
  }
  function fit() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const ar = 1.5;
    let w = vw, hh = vw / ar;
    if (hh > vh) { hh = vh; w = vh * ar; }
    stage.style.width = w + 'px'; stage.style.height = hh + 'px';
    clamp(); apply();
  }
  function clamp() {
    const s = ZOOMS[zi];
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const w = stage.offsetWidth * s, hh = stage.offsetHeight * s;
    const mx = Math.max(0, (w - vw) / 2), my = Math.max(0, (hh - vh) / 2);
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  }
  function apply() { stage.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${ZOOMS[zi]})`; }
  function setZoom(n) {
    n = Math.max(0, Math.min(ZOOMS.length - 1, n));
    if (n === zi) return;
    const k = ZOOMS[n] / ZOOMS[zi];
    tx *= k; ty *= k; zi = n; clamp(); apply(); sfx.click();
    zoomOut.disabled = zi === 0; zoomIn.disabled = zi === ZOOMS.length - 1;
  }
  zoomOut.disabled = zi === 0;

  function drawMarks() {
    marks.replaceChildren(...run.spots(placeId).filter((s) => run.has(`s:${placeId}.${s.id}`) && (s.ev || s.gives)).map((s) => {
      const [x, y, w, hh] = s.r;
      return h('div.mark', { style: { left: (x + w / 2) * 100 + '%', top: (y + hh / 2) * 100 + '%' } });
    }));
    const total = run.spotsTotal(placeId), left = run.spotsLeft(placeId);
    counter.textContent = `Находки: ${total - left} из ${total}`;
    counter.classList.toggle('all', left === 0);
  }
  drawMarks();

  // фонарик
  const light = (cx, cy) => {
    const r = viewport.getBoundingClientRect();
    dark.style.setProperty('--x', cx - r.left + 'px');
    dark.style.setProperty('--y', cy - r.top + 'px');
  };
  let down = null, moved = false;
  viewport.addEventListener('pointermove', (e) => {
    light(e.clientX, e.clientY);
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
      if (moved && zi > 0) { tx = down.tx + dx; ty = down.ty + dy; clamp(); apply(); }
    }
  });
  viewport.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, tx, ty }; moved = false;
    light(e.clientX, e.clientY);
    viewport.setPointerCapture?.(e.pointerId);
  });
  let busy = false;
  viewport.addEventListener('pointerup', async (e) => {
    const wasMoved = moved; down = null;
    if (wasMoved || busy) return;
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    ripple(e.clientX, e.clientY);
    busy = true;
    const res = await onSearch(x, y);
    busy = false;
    if (res && !res.miss && !res.already) {
      drawMarks();
      if (run.spotsLeft(placeId) === 0 && run.spotsTotal(placeId) > 0) {
        await sleep(600);
        say([LINES.allFound]);
      }
    }
  });
  function ripple(cx, cy) {
    const vr = viewport.getBoundingClientRect();
    const d = h('div.ripple', { style: { left: cx - vr.left + 'px', top: cy - vr.top + 'px' } });
    viewport.append(d);
    setTimeout(() => d.remove(), 700);
  }

  const ro = new ResizeObserver(() => fit());
  ro.observe(viewport);
  requestAnimationFrame(() => {
    fit();
    const r = viewport.getBoundingClientRect();
    light(r.left + r.width / 2, r.top + r.height / 2);
  });
  onEnter?.();

  // для автопроверки: нажать в долях картинки
  window.__sceneTap = async (x, y) => {
    const r = stage.getBoundingClientRect();
    const res = await onSearch(x, y);
    if (res && !res.miss) drawMarks();
    return res;
  };
}
