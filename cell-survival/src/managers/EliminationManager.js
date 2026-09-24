import * as THREE from 'three';
import { CELL } from './CellManager.js';
import { PLAYER } from './PlayerManager.js';
import { tween, wait, ease } from '../scene/tween.js';

// Событие раунда: жребий, подсветка, трещины, обрушение. Возвращает выбывших.
export class EliminationManager {
  constructor(world, audio) {
    this.world = world;
    this.audio = audio;
  }

  pickTarget(cells) {
    return cells[Math.floor(Math.random() * cells.length)];
  }

  // «Рулетка»: подсветка прыгает по клеткам и замедляется — напряжение перед ударом.
  async roulette(cells, target) {
    const steps = Math.min(22, 10 + cells.length / 4);
    let prev = null;
    for (let i = 0; i < steps; i++) {
      const c = i === steps - 1 ? target : cells[Math.floor(Math.random() * cells.length)];
      if (prev && prev !== target) prev.danger = 0;
      c.danger = 0.35;
      this.audio.roulette();
      prev = c;
      await wait(0.05 + Math.pow(i / steps, 2.2) * 0.28);
    }
    for (const c of cells) if (c !== target) c.danger = 0;
  }

  async destroy(cell, players) {
    const { effects, mats } = this.world;
    this.audio.charge();
    await tween(1.0, (k) => { cell.danger = 0.35 + k * 0.65; cell.shake = k * 0.8; }, ease.inCubic);
    const crack = cell.crack();
    this.audio.crack();
    await tween(0.7, (k) => { crack.draw(k); cell.shake = 0.8 + k; if (Math.random() < 0.08) this.audio.crack(); });

    // Обрушение
    const pos = new THREE.Vector3();
    cell.group.getWorldPosition(pos);
    pos.y += cell.surfaceY - 0.1;
    const victims = players.filter((p) => p.cell === cell && p.state === PLAYER.ALIVE);
    cell.alive = false;
    cell.setState(CELL.DESTROYED);
    cell.shake = 0;
    cell.base.visible = cell.top.visible = cell.frame.visible = false;
    if (cell.crackMesh) cell.crackMesh.visible = false;
    effects.shards(pos, cell.topMat, mats.side, 1, 4);
    effects.burst(pos, mats.fx[0], 220, 3.5, 0.22, false, -3, 2.2);
    effects.burst(pos, mats.fx[1], 140, 7, 0.1, true, -9, 1.2);
    effects.flash(pos, mats.fx[1], 80);
    effects.shockwave(pos, mats.fx[1]);
    this.audio.destroy();
    this.world.shake(0.35);

    // Аватары на клетке падают вместе с ней
    const falls = victims.map((p) => {
      p.state = PLAYER.ELIMINATED;
      const a = p.avatar;
      if (!a) return Promise.resolve();
      this.world.scene.attach(a);
      const y0 = a.position.y, s0 = a.scale.x;
      const spin = (Math.random() - 0.5) * 3;
      return tween(1.6, (k) => {
        a.position.y = y0 - k * k * 9;
        a.rotation.x = k * 1.3; a.rotation.z = k * spin;
        a.scale.setScalar(s0 * (1 - k * 0.5));
      }, ease.linear).then(() => { a.visible = false; this.world.scene.remove(a); });
    });
    await Promise.all([...falls, wait(1.1)]);
    cell.group.parent?.remove(cell.group);
    return victims;
  }
}
