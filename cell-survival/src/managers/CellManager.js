import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCrackOverlay } from '../scene/textures.js';

export const CELL = {
  AVAILABLE: 'AVAILABLE',
  HOVER: 'HOVER',
  SELECTED: 'SELECTED',
  CONFIRMED: 'CONFIRMED',
  DESTROYED: 'DESTROYED',
  OCCUPIED: 'OCCUPIED',
};

export const CELL_SIZE = 1;
export const CELL_H = 0.34;

const baseGeo = new RoundedBoxGeometry(CELL_SIZE, CELL_H, CELL_SIZE, 3, 0.06);
const topGeo = new THREE.PlaneGeometry(CELL_SIZE * 0.94, CELL_SIZE * 0.94);
topGeo.rotateX(-Math.PI / 2);
const frameGeo = (() => {
  const o = 0.5, i = 0.44;
  const s = new THREE.Shape([new THREE.Vector2(-o, -o), new THREE.Vector2(o, -o), new THREE.Vector2(o, o), new THREE.Vector2(-o, o)]);
  s.holes.push(new THREE.Path([new THREE.Vector2(-i, -i), new THREE.Vector2(-i, i), new THREE.Vector2(i, i), new THREE.Vector2(i, -i)]));
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
})();

// Визуальные параметры каждого состояния: свечение поверхности, рамки, подъём.
const LOOK = {
  AVAILABLE: { emi: 0.0, frame: 0.08, lift: 0 },
  HOVER: { emi: 0.55, frame: 0.7, lift: 0.07 },
  SELECTED: { emi: 1.1, frame: 1, lift: 0.12, pulse: true },
  CONFIRMED: { emi: 1.6, frame: 1, lift: 0.05 },
  OCCUPIED: { emi: 0.35, frame: 0.45, lift: 0 },
  DESTROYED: { emi: 0, frame: 0, lift: 0 },
};

export class Cell {
  constructor(id, mats) {
    this.id = id;
    this.state = CELL.AVAILABLE;
    this.hover = false;
    this.alive = true;
    this.group = new THREE.Group();
    this.group.userData.cell = this;

    const src = mats.tops[id % mats.tops.length];
    this.topMat = src.clone();
    // фото-фактура приходит позже постройки поля — копия клетки забирает её у образца
    mats.photoReady?.then(() => { if (src.map === this.topMat.map) return; this.topMat.map = src.map; this.topMat.roughnessMap = src.roughnessMap; this.topMat.roughness = src.roughness; this.topMat.needsUpdate = true; });
    this.base = new THREE.Mesh(baseGeo, mats.side);
    this.base.castShadow = this.base.receiveShadow = true;
    this.top = new THREE.Mesh(topGeo, this.topMat);
    this.top.position.y = CELL_H / 2 + 0.002;
    this.top.receiveShadow = true;
    this.top.rotation.y = (Math.floor(Math.random() * 4) * Math.PI) / 2;
    this.frameMat = new THREE.MeshBasicMaterial({ color: mats.glow, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
    this.frame = new THREE.Mesh(frameGeo, this.frameMat);
    this.frame.position.y = CELL_H / 2 + 0.006;
    this.inner = new THREE.Group(); // поднимается/трясётся, не мешая раскладке
    this.inner.add(this.base, this.top, this.frame);
    this.group.add(this.inner);
    this.base.userData.cell = this.top.userData.cell = this;

    this.mats = mats;
    this.cur = { emi: 0, frame: 0.08, lift: 0 };
    this.danger = 0; // 0..1 — красное свечение перед уничтожением
    this.shake = 0;
    this.phase = Math.random() * 10;
  }

  get visualState() {
    if (!this.alive) return CELL.DESTROYED;
    if (this.hover && (this.state === CELL.AVAILABLE || this.state === CELL.OCCUPIED)) return CELL.HOVER;
    return this.state;
  }

  get surfaceY() { return CELL_H / 2 + this.inner.position.y; }

  setState(s) { this.state = s; }

  crack() {
    if (this.crackOverlay) return this.crackOverlay;
    const ov = makeCrackOverlay(this.id * 7 + 3);
    const m = new THREE.Mesh(topGeo, new THREE.MeshBasicMaterial({ map: ov.texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.y = CELL_H / 2 + 0.01;
    this.inner.add(m);
    this.crackMesh = m;
    this.crackOverlay = ov;
    return ov;
  }

  update(dt, t) {
    const L = LOOK[this.visualState];
    const pulse = L.pulse ? 0.55 + 0.45 * Math.sin(t * 6) : 1;
    const k = 1 - Math.exp(-dt * 12);
    this.cur.emi += (L.emi * pulse - this.cur.emi) * k;
    this.cur.frame += (L.frame * pulse - this.cur.frame) * k;
    this.cur.lift += (L.lift - this.cur.lift) * k;
    const idle = this.visualState === CELL.AVAILABLE ? 0.04 + 0.04 * Math.sin(t * 1.2 + this.phase) : 0;
    this.topMat.emissiveIntensity = this.cur.emi + idle + this.danger * 3;
    if (this.danger > 0) this.topMat.emissive.copy(this.mats.glow).lerp(new THREE.Color('#ff3a1a'), Math.min(1, this.danger * 1.5));
    else this.topMat.emissive.copy(this.mats.glow);
    this.frameMat.opacity = Math.min(1, this.cur.frame + this.danger);
    this.frameMat.color.copy(this.danger > 0 ? new THREE.Color('#ff4a2a') : this.mats.glow);
    this.inner.position.y = this.cur.lift;
    if (this.shake > 0) {
      this.inner.position.x = (Math.random() - 0.5) * this.shake * 0.08;
      this.inner.position.z = (Math.random() - 0.5) * this.shake * 0.08;
    } else { this.inner.position.x = 0; this.inner.position.z = 0; }
  }

  dispose() {
    this.topMat.dispose();
    this.frameMat.dispose();
  }
}
