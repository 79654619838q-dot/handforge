import * as THREE from 'three';
import { buildAvatar } from './AvatarManager.js';
import { tween, ease } from '../scene/tween.js';

export const PLAYER = { ALIVE: 'ALIVE', ELIMINATED: 'ELIMINATED', WINNER: 'WINNER' };

const AVATAR_SCALE = 0.7;

export class Player {
  constructor(id, profile, isLocal) {
    this.id = id;
    this.profile = profile;
    this.name = profile.name;
    this.isLocal = isLocal;
    this.state = PLAYER.ALIVE;
    this.cell = null;       // клетка, на которой стоит сейчас
    this.pending = null;    // подтверждённый выбор на этот раунд
    this.roundsSurvived = 0;
    this.avatar = null;
  }
}

export class PlayerManager {
  constructor(scene) {
    this.scene = scene;
    this.players = [];
  }

  add(profile, isLocal = false) {
    const p = new Player(this.players.length, profile, isLocal);
    this.players.push(p);
    return p;
  }

  get local() { return this.players.find((p) => p.isLocal); }
  get alive() { return this.players.filter((p) => p.state === PLAYER.ALIVE); }

  _spawnAvatar(p) {
    const a = buildAvatar(p.profile);
    a.scale.setScalar(AVATAR_SCALE);
    // световое кольцо под ногами — видно, где стоит игрок
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.2 / AVATAR_SCALE, 0.26 / AVATAR_SCALE, 40), new THREE.MeshBasicMaterial({ color: '#f6dc97', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.01;
    a.add(halo);
    a.userData.halo = halo;
    p.avatar = a;
    return a;
  }

  // Перемещение аватара на клетку: прыжок по дуге. Аватар «пристёгивается» к клетке,
  // чтобы ехать вместе с ней при перестройке поля и падать при уничтожении.
  async moveTo(p, cell) {
    const firstTime = !p.avatar;
    if (firstTime) this._spawnAvatar(p);
    const a = p.avatar;
    const targetLocal = new THREE.Vector3(0, cell.surfaceY, 0);
    const targetWorld = cell.group.localToWorld(targetLocal.clone());
    const start = new THREE.Vector3();
    if (firstTime) start.copy(targetWorld).add(new THREE.Vector3(0, 6, 0));
    else a.getWorldPosition(start);
    this.scene.attach(a);
    a.position.copy(start);
    const dur = firstTime ? 0.8 : 0.65;
    const height = firstTime ? 0 : 1.2 + start.distanceTo(targetWorld) * 0.15;
    const dir = new THREE.Vector3().subVectors(targetWorld, start);
    if (!firstTime && dir.lengthSq() > 0.001) a.rotation.y = Math.atan2(dir.x, dir.z);
    await tween(dur, (k) => {
      a.position.lerpVectors(start, targetWorld, k);
      a.position.y += Math.sin(Math.PI * k) * height;
    }, firstTime ? ease.inQuad : ease.inOutCubic);
    cell.inner.attach(a);
    a.position.set(0, cell.surfaceY - cell.inner.position.y, 0);
    await tween(0.35, (k) => { a.rotation.y *= 1 - k; });
    p.cell = cell;
  }

  update(dt, t) {
    for (const p of this.players) if (p.avatar) {
      p.avatar.userData.update?.(t);
      const h = p.avatar.userData.halo;
      if (h) h.material.opacity = 0.45 + 0.3 * Math.sin(t * 3);
    }
  }
}
