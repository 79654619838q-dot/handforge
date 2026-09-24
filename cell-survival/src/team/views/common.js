import * as THREE from 'three';
import { h } from '../../managers/UIManager.js';
import { t } from '../../i18n.js';
import { GameWorld } from '../../scene/GameWorld.js';
import { clearTweens } from '../../scene/tween.js';

// Выбор 3D-объекта мышью: наведение и клик по списку мешей.
export class Picker {
  constructor(camera, meshes, { onHover, onClick }) {
    this.camera = camera;
    this.meshes = meshes; // функция → массив мешей
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.enabled = false;
    this.hovered = null;
    const pick = (e) => {
      this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.ray.setFromCamera(this.ndc, this.camera);
      const hit = this.ray.intersectObjects(this.meshes(), false)[0];
      return hit ? hit.object : null;
    };
    this._move = (e) => {
      if (!this.enabled) return;
      const o = pick(e);
      if (o !== this.hovered) { this.hovered = o; onHover?.(o); document.body.style.cursor = o ? 'pointer' : ''; }
    };
    this._down = (e) => {
      if (!this.enabled || e.button !== 0 || e.target.closest?.('.hit, .modal-wrap')) return;
      const o = pick(e);
      if (o) onClick?.(o);
    };
    addEventListener('pointermove', this._move);
    addEventListener('pointerdown', this._down);
  }
  set(on) { this.enabled = on; if (!on && this.hovered) { this.hovered = null; document.body.style.cursor = ''; } }
  dispose() { removeEventListener('pointermove', this._move); removeEventListener('pointerdown', this._down); document.body.style.cursor = ''; }
}

// Окно «Подтвердить / Отмена» (как в одиночной игре).
export function confirmBox(root, title) {
  return new Promise((resolve) => {
    const w = h('div', 'modal-wrap hit', `<div class="modal panel"><h2 class="title">${title}</h2><div class="label">&nbsp;</div>
      <div class="btns"><button class="btn primary" data-ok>${t('confirm')}</button><button class="btn" data-no>${t('cancel')}</button></div></div>`);
    const done = (v) => { w.remove(); removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
    w.querySelector('[data-ok]').onclick = () => done(true);
    w.querySelector('[data-no]').onclick = () => done(false);
    addEventListener('keydown', key);
    root.appendChild(w);
  });
}

// Текстовая табличка над головой (имя игрока, номер двери).
export function labelSprite(text, color = '#f6dc97', scale = 0.9) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 64px Rajdhani, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(5,4,9,0.72)';
  const w = Math.min(500, g.measureText(text).width + 60);
  g.beginPath(); g.roundRect?.(256 - w / 2, 14, w, 100, 18); g.fill();
  g.fillStyle = color; g.fillText(text, 256, 66);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false }));
  s.scale.set(scale * 4, scale, 1);
  s.renderOrder = 10;
  return s;
}

// Сцена-фон для «плоских» испытаний: задник темы и частицы, без поля.
export function backdropWorld(stage, theme) {
  const w = new GameWorld(theme);
  w.env.group.visible = false; // плоским испытаниям нужен только нарисованный задник — без 3D-декораций, пока он грузится
  w.fitCamera(6, true);
  stage.setWorld(w);
  return w;
}

// Общий каркас вида: DOM-панель поверх сцены.
export class BaseView {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.el = h('div', 'cv');
    this.root.appendChild(this.el);
  }
  enter() {}
  update() {}
  leave() { clearTweens(); this.el.remove(); this.picker?.dispose(); }
  alive(st) { return st.alive?.includes(this.myId); }
  canAct(st) { return st.phase === 'act' && this.alive(st) && !st.done?.includes(this.myId); }
  name(st, id) { return st.players.find((p) => p.id === id)?.name ?? '?'; }
}
