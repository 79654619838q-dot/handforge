import * as THREE from 'three';
import { buildEnvironment, cellMaterials, THEMES } from './themes.js';
import { GridManager } from '../managers/GridManager.js';
import { PlayerManager } from '../managers/PlayerManager.js';
import { Effects } from './effects.js';
import { tween, ease } from './tween.js';

// Сцена игрового поля: окружение темы + сетка + игроки + эффекты + камера.
export class GameWorld {
  constructor(themeId) {
    this.themeId = themeId;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400);
    this.env = buildEnvironment(themeId, this.scene, () => {
      // под нарисованный задник камера смотрит круче — как ракурс площадки на картинке
      this.hasBackdrop = true;
      this.camLook.set(0, 0, -0.25);
      if (this.grid.extent && !this.orbit) this.fitCamera(this.grid.extent, true);
    });
    this.mats = cellMaterials(themeId);
    this.grid = new GridManager(this.scene, this.mats);
    this.players = new PlayerManager(this.scene);
    this.effects = new Effects(this.scene);
    this.bloom = THEMES[themeId].bloom;

    this.camBase = new THREE.Vector3(0, 12, 10);
    this.camLook = new THREE.Vector3(0, 0, 0.4);
    this.parallax = new THREE.Vector2();
    this.shakeAmt = 0;
    this.orbit = null;

    // Прожектор выбранной клетки
    this.beam = new THREE.SpotLight(THEMES[themeId].glow, 0, 14, 0.22, 0.6, 1.2);
    this.beam.position.set(0, 8, 0);
    this.scene.add(this.beam, this.beam.target);

    this.onPointerMove = (e) => this.parallax.set(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
    window.addEventListener('pointermove', this.onPointerMove);
  }

  // Камера отъезжает так, чтобы всё поле помещалось между панелями HUD.
  fitCamera(extent, instant = false) {
    const aspect = window.innerWidth / window.innerHeight;
    const fitW = extent / Math.min(1, aspect / 1.6);
    const d = fitW * 1.05 + 2.2;
    const target = this.hasBackdrop ? new THREE.Vector3(0, d * 1.14, d * 0.67) : new THREE.Vector3(0, d * 0.74, d * 0.92);
    if (instant) { this.camBase.copy(target); return Promise.resolve(); }
    const from = this.camBase.clone();
    return tween(1.0, (k) => this.camBase.lerpVectors(from, target, k), ease.inOutCubic);
  }

  onResize() { if (this.grid.extent && !this.orbit) this.fitCamera(this.grid.extent, true); }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  focusBeam(cell) {
    if (!cell) { this.beamTarget = 0; return; }
    const p = new THREE.Vector3();
    cell.group.getWorldPosition(p);
    this.beam.position.set(p.x, 7, p.z + 1.5);
    this.beam.target.position.copy(p);
    this.beamTarget = 60;
  }

  // Финальная сцена победы: облёт последней клетки.
  startOrbit(cell) {
    const p = new THREE.Vector3();
    cell.group.getWorldPosition(p);
    this.orbit = { center: p, t: 0 };
  }

  update(dt, t) {
    this.env.update(dt, t);
    this.grid.update(dt, t);
    this.players.update(dt, t);
    this.effects.update(dt);
    this.beam.intensity += ((this.beamTarget || 0) - this.beam.intensity) * Math.min(1, dt * 6);

    if (this.orbit) {
      const o = this.orbit;
      o.t += dt;
      const r = Math.max(2.2, 5 - o.t * 0.6), a = o.t * 0.35;
      this.camera.position.set(o.center.x + Math.sin(a) * r, o.center.y + 1.2 + Math.max(0, 3 - o.t), o.center.z + Math.cos(a) * r);
      this.camera.lookAt(o.center.x, o.center.y + 0.45, o.center.z);
      return;
    }
    // с нарисованным задником качание почти убрано: картинка неподвижна, иначе клетки «плывут» по площадке
    const k = this.hasBackdrop ? 0.15 : 1;
    const sway = new THREE.Vector3(Math.sin(t * 0.13) * 0.25 + this.parallax.x * 0.8, Math.sin(t * 0.21) * 0.12, -this.parallax.y * 0.5).multiplyScalar(k);
    this.camera.position.copy(this.camBase).add(sway);
    if (this.shakeAmt > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 0.8);
    }
    this.camera.lookAt(this.camLook);
  }

  dispose() {
    window.removeEventListener('pointermove', this.onPointerMove);
    this.effects.clear();
    this.grid.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose(); m.normalMap?.dispose(); m.emissiveMap?.dispose(); m.dispose(); });
      o.shadow?.map?.dispose();
    });
    if (this.scene.background?.isTexture) this.scene.background.dispose();
    this.mats.tops.forEach((m) => { m.map?.dispose(); m.normalMap?.dispose(); m.emissiveMap?.dispose(); m.dispose(); });
  }
}
