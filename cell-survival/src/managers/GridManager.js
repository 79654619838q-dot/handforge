import * as THREE from 'three';
import { Cell, CELL } from './CellManager.js';
import { tween, wait, ease } from '../scene/tween.js';

export const SPACING = 1.14;

// Раскладка поля: почти квадрат, неполный последний ряд по центру (50 → 8×7, последний ряд из 2).
export function layout(n) {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const pos = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
    const c = i - r * cols;
    pos.push(new THREE.Vector3((c - (inRow - 1) / 2) * SPACING, 0, (r - (rows - 1) / 2) * SPACING));
  }
  return { pos, cols, rows, extent: Math.max(cols, rows) * SPACING };
}

export class GridManager {
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;
    this.cells = [];
    this.root = new THREE.Group();
    scene.add(this.root);
    this.raycaster = new THREE.Raycaster();
  }

  build(count) {
    for (let i = 0; i < count; i++) {
      const c = new Cell(i, this.mats);
      this.cells.push(c);
      this.root.add(c.group);
    }
    const L = layout(count);
    this.cells.forEach((c, i) => c.group.position.copy(L.pos[i]));
    this.extent = L.extent;
    return this.cells;
  }

  // Появление поля: клетки поднимаются из глубины волной от центра.
  async intro() {
    const jobs = this.cells.map((c) => {
      const d = c.group.position.length();
      const target = c.group.position.y;
      c.group.position.y = -8;
      c.inner.visible = true;
      return wait(d * 0.09 + 0.001).then(() =>
        tween(0.9, (k) => { c.group.position.y = -8 + (target + 8) * k; }, ease.outBack));
    });
    await Promise.all(jobs);
  }

  get alive() { return this.cells.filter((c) => c.alive); }

  // Оставшиеся клетки перестраиваются в более плотную сетку.
  async relayout() {
    const alive = this.alive;
    const L = layout(alive.length);
    this.extent = L.extent;
    const from = alive.map((c) => c.group.position.clone());
    await tween(0.9, (k) => alive.forEach((c, i) => c.group.position.lerpVectors(from[i], L.pos[i], k)), ease.inOutCubic);
  }

  pick(ndc, camera) {
    this.raycaster.setFromCamera(ndc, camera);
    const meshes = [];
    for (const c of this.cells) if (c.alive) meshes.push(c.base, c.top);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return hit ? hit.object.userData.cell : null;
  }

  clearSelection(except = null) {
    for (const c of this.cells) if (c !== except && (c.state === CELL.SELECTED)) c.setState(CELL.AVAILABLE);
  }

  update(dt, t) { for (const c of this.cells) if (c.group.parent) c.update(dt, t); }

  dispose() { this.cells.forEach((c) => c.dispose()); this.scene.remove(this.root); }
}
