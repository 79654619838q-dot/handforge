// Испытания на 3D-поле: «Последняя клетка», «Взрывное поле», «Двери».
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { t } from '../../i18n.js';
import { GameWorld } from '../../scene/GameWorld.js';
import { CELL } from '../../managers/CellManager.js';
import { PLAYER } from '../../managers/PlayerManager.js';
import { EliminationManager } from '../../managers/EliminationManager.js';
import { ensurePerson, buildAvatar } from '../../managers/AvatarManager.js';
import { tween, wait, ease } from '../../scene/tween.js';
import { BaseView, Picker, confirmBox, labelSprite } from './common.js';

const OTHER = new THREE.Color('#a78bfa');

// пока нет данных раунда (заставка) — просто задник темы
function backdrop(v) { const w = new GameWorld(v.theme); w.fitCamera(6, true); v.stage.setWorld(w); return w; }

// Общая часть для полей из клеток: игроки-аватары, перемещение без наложения анимаций.
class FieldView extends BaseView {
  setupWorld(st, count) {
    this.world = new GameWorld(this.theme);
    this.grid = this.world.grid;
    this.grid.build(count);
    this.world.fitCamera(this.grid.extent, true);
    this.stage.setWorld(this.world);
    this.elim = new EliminationManager(this.world, this.audio);
    this.pl = new Map();
    this.ready = Promise.all(st.players.map((p) => ensurePerson(p.profile)));
    this.picker = new Picker(this.world.camera, () => this.grid.alive.flatMap((c) => [c.base, c.top]), {
      onHover: (m) => { this.grid.cells.forEach((c) => { c.hover = false; }); const c = m?.userData.cell; if (c && this.pickable(c)) { c.hover = true; this.audio.hover(); } },
      onClick: (m) => this.onCell(m.userData.cell),
    });
  }
  pickable() { return true; }
  player(st, id) {
    if (!this.pl.has(id)) {
      const info = st.players.find((p) => p.id === id);
      const p = this.world.players.add({ ...info.profile, name: info.name }, id === this.myId);
      p.id = id;
      this.pl.set(id, p);
    }
    return this.pl.get(id);
  }
  // Аватар идёт к клетке; если он уже в пути — запоминаем цель и идём после.
  async place(st, id, cell) {
    await this.ready;
    const p = this.player(st, id);
    p.target = cell;
    if (p.moving) return p.movePromise;
    p.moving = true;
    p.movePromise = (async () => {
      while (p.target && p.cell !== p.target && p.target.alive) {
        const c = p.target;
        await this.world.players.moveTo(p, c);
        if (!p.avatar.userData.tinted) {
          p.avatar.userData.tinted = true;
          if (id !== this.myId) p.avatar.userData.halo.material.color.copy(OTHER);
          const lbl = labelSprite(st.players.find((x) => x.id === id)?.name || '', id === this.myId ? '#f6dc97' : '#d8c8ff', 0.28);
          lbl.position.y = 2.25; p.avatar.add(lbl);
        }
      }
      p.moving = false;
    })();
    return p.movePromise;
  }
  leave() { super.leave(); document.body.style.cursor = ''; }
}

// ---------- 1. Последняя клетка ----------
export class LastCellView extends FieldView {
  enter(st) { if (st.data) this.build(st); else this.world = backdrop(this); }
  build(st) {
    this.built = true;
    this.setupWorld(st, st.data.total);
    const keep = new Set(st.data.cells);
    for (const c of this.grid.cells) if (!keep.has(c.id)) { c.alive = false; c.group.parent?.remove(c.group); }
    if (keep.size !== st.data.total) this.grid.relayout().then(() => this.world.fitCamera(this.grid.extent));
    this.grid.intro();
  }
  pickable(c) { return this.canAct(this.st) && !this.takenBy(c.id); }
  takenBy(cellId) { const v = this.st?.visible || {}; return Object.keys(v).find((pid) => v[pid] === cellId && pid !== this.myId); }
  async onCell(c) {
    const st = this.st;
    if (!this.canAct(st) || this.takenBy(c.id) || this.busy) return;
    this.busy = true;
    this.grid.clearSelection(); c.setState(CELL.SELECTED); this.audio.select();
    const ok = await confirmBox(this.root, t('confirmQ'));
    this.busy = false;
    if (!ok || !this.canAct(this.st)) { c.setState(CELL.AVAILABLE); return; }
    const r = await this.act({ cell: c.id });
    this.audio[r?.ok ? 'confirm' : 'click']();
    if (!r?.ok) { c.setState(CELL.AVAILABLE); this.hint(t('doorTaken')); }
  }
  update(st, changed) {
    this.st = st;
    if (!this.built) { if (!st.data) return; this.build(st); }
    this.picker.set(this.canAct(st));
    if (st.phase === 'act') {
      this.hint(this.canAct(st) ? t('chooseCell') : this.alive(st) ? t('waitOthers') : '');
      for (const c of this.grid.alive) if (c.state !== CELL.SELECTED || !this.canAct(st)) c.setState(CELL.AVAILABLE);
      for (const [pid, cid] of Object.entries(st.visible || {})) {
        const c = this.grid.cells[cid];
        if (!c?.alive) continue;
        c.setState(pid === this.myId ? CELL.CONFIRMED : CELL.OCCUPIED);
        this.place(st, pid, c);
      }
    }
    if (st.phase === 'reveal' && changed && st.reveal) this.reveal(st);
  }
  async reveal(st) {
    const r = st.reveal;
    this.picker.set(false);
    this.hint(t('waiting'));
    await Promise.race([Promise.all(Object.entries(r.stand).map(([pid, cid]) => this.place(st, pid, this.grid.cells[cid]))), wait(1.2)]);
    const target = this.grid.cells[r.target];
    if (!target?.alive) return;
    await this.elim.roulette(this.grid.alive, target);
    const victims = [...this.pl.values()].filter((p) => p.cell === target && p.state === PLAYER.ALIVE);
    await this.elim.destroy(target, victims);
    await Promise.all([this.grid.relayout(), this.world.fitCamera(this.grid.extent)]);
  }
}

// ---------- 4. Взрывное поле ----------
export class MinesView extends FieldView {
  enter(st) { if (st.data) this.build(st); else this.world = backdrop(this); }
  build(st) {
    this.built = true;
    this.picker?.dispose(); // старое поле освобождает Stage.setWorld, обработчики нажатий — здесь
    this.setupWorld(st, st.data.size);
    this.grid.intro();
    this.stand = null; this.bomb = null;
    this.markers = new THREE.Group();
    this.world.scene.add(this.markers);
    this.panel();
  }
  panel() {
    this.el.innerHTML = `<div class="cv-bar panel hit"><button class="btn ghost" data-reset>${t('again')}</button><button class="btn primary" data-ok disabled>${t('confirmChoice')}</button></div>`;
    this.el.querySelector('[data-reset]').onclick = () => { this.stand = null; this.bomb = null; this.drawMarkers(); };
    this.el.querySelector('[data-ok]').onclick = async () => {
      if (this.stand == null || this.bomb == null || !this.canAct(this.st)) return;
      const r = await this.act({ stand: this.stand, bomb: this.bomb });
      if (r?.ok) this.audio.confirm();
    };
  }
  pickable() { return this.canAct(this.st); }
  onCell(c) {
    if (!this.canAct(this.st)) return;
    if (this.stand == null) this.stand = c.id; else this.bomb = c.id;
    if (this.bomb != null && this.stand != null) this.audio.charge(); else this.audio.select();
    this.drawMarkers();
  }
  drawMarkers() {
    this.markers.clear();
    const at = (id) => { const p = new THREE.Vector3(); this.grid.cells[id].group.getWorldPosition(p); return p; };
    if (this.stand != null) {
      const ghost = buildAvatar(this.st.players.find((p) => p.id === this.myId)?.profile || {});
      ghost.scale.setScalar(0.7); ghost.position.copy(at(this.stand)).add(new THREE.Vector3(0, 0.17, 0));
      ghost.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
      this.markers.add(ghost);
    }
    if (this.bomb != null) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 40), new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(at(this.bomb)).add(new THREE.Vector3(0, 0.2, 0));
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.06), ring.material); cross.rotation.x = -Math.PI / 2; cross.position.copy(ring.position);
      const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
      this.markers.add(ring, cross, cross2);
    }
    const ok = this.el.querySelector('[data-ok]');
    if (ok) ok.disabled = this.stand == null || this.bomb == null;
    this.hint(this.stand == null ? t('pickStand') : this.bomb == null ? t('pickBomb') : t('confirmChoice'));
  }
  update(st, changed) {
    const prev = this.st;
    this.st = st;
    if (!this.built) { if (!st.data) return; this.build(st); }
    this.picker.set(this.canAct(st));
    if (st.phase === 'act' && changed && prev && prev.round !== st.round) this.build(st); // каждый раунд — целое поле заново
    const bar = this.el.querySelector('.cv-bar');
    if (bar) bar.style.display = this.canAct(st) ? '' : 'none';
    if (st.phase === 'act') {
      if (this.canAct(st)) { if (changed) this.drawMarkers(); } else this.hint(this.alive(st) ? t('waitOthers') : '');
    }
    if (st.phase === 'reveal' && changed && st.reveal) this.reveal(st);
  }
  async reveal(st) {
    const r = st.reveal;
    this.markers.clear();
    this.hint('');
    const bombs = r.bombs.map((id) => this.grid.cells[id]).filter(Boolean);
    await tween(1.1, (k) => bombs.forEach((c) => { c.danger = k; c.shake = k * 0.6; }), ease.inCubic);
    this.audio.destroy();
    this.world.shake(0.4);
    for (const c of bombs) {
      const p = new THREE.Vector3(); c.group.getWorldPosition(p); p.y += 0.1;
      this.world.effects.shards(p, c.topMat, this.world.mats.side, 1, 3);
      this.world.effects.burst(p, new THREE.Color('#ff7a2a'), 120, 6, 0.14, true, -8, 1.2);
      this.world.effects.burst(p, new THREE.Color('#3a3a3a'), 90, 2.5, 0.35, false, -1, 2.2);
      this.world.effects.flash(p, '#ff6a2a', 70);
      c.alive = false; c.shake = 0; c.base.visible = c.top.visible = c.frame.visible = false;
    }
    await wait(0.7);
    // раскрываем, кто где стоял; стоявшие на взорванных клетках падают
    const bombed = new Set(r.bombs);
    await this.ready;
    for (const [pid, mv] of Object.entries(r.moves)) {
      const cell = this.grid.cells[mv.stand];
      const p = this.player(st, pid);
      const a = buildAvatar(st.players.find((x) => x.id === pid)?.profile || {});
      a.scale.setScalar(0.7);
      const pos = new THREE.Vector3(); cell.group.getWorldPosition(pos); pos.y += 0.17;
      a.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3));
      const lbl = labelSprite(p.profile.name, pid === this.myId ? '#f6dc97' : '#d8c8ff', 0.28); lbl.position.y = 2.25; a.add(lbl);
      this.world.scene.add(a);
      if (bombed.has(mv.stand) && !r.replay) {
        const y0 = a.position.y;
        tween(1.4, (k) => { a.position.y = y0 - k * k * 7; a.rotation.x = k * 1.2; }, ease.linear).then(() => a.removeFromParent());
      } else if (bombed.has(mv.stand)) {
        tween(1.4, (k) => { a.position.y = pos.y - k * k * 7; }, ease.linear).then(() => a.removeFromParent());
      }
    }
  }
}

// ---------- 2. Двери ----------
function doorNumberTexture(n) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1206'; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d9b25f'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#f6dc97'; g.font = '700 64px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}

export class DoorsView extends BaseView {
  enter(st) {
    this.world = new GameWorld(this.theme);
    this.stage.setWorld(this.world);
    this.ready = Promise.all(st.players.map((p) => ensurePerson(p.profile)));
    this.picker = new Picker(this.world.camera, () => (this.doors || []).map((d) => d.leaf), {
      onHover: (m) => { (this.doors || []).forEach((d) => { d.hover = d.leaf === m; }); if (m) this.audio.hover(); },
      onClick: (m) => this.onDoor(this.doors.find((d) => d.leaf === m)),
    });
    if (st.data) this.build(st);
  }
  build(st) {
    if (this.group) { this.world.scene.remove(this.group); }
    this.group = new THREE.Group();
    this.world.scene.add(this.group);
    const n = st.data.doors;
    const perRow = n <= 8 ? n : Math.ceil(n / 2);
    const gap = 1.45;
    const frameM = new THREE.MeshStandardMaterial({ color: '#1b1814', metalness: 0.85, roughness: 0.35 });
    const goldM = new THREE.MeshStandardMaterial({ color: '#d9b25f', metalness: 1, roughness: 0.3, emissive: '#3a2506', emissiveIntensity: 0.5 });
    this.doors = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow), col = i % perRow;
      const inRow = row === 0 ? Math.min(perRow, n) : n - perRow;
      const x = (col - (inRow - 1) / 2) * gap, z = -row * 2.6;
      const d = new THREE.Group(); d.position.set(x, 0, z);
      const post = new THREE.BoxGeometry(0.12, 2.15, 0.2);
      const put = (m, x, y) => { m.position.set(x, y, 0); m.castShadow = true; d.add(m); };
      put(new THREE.Mesh(post, frameM), -0.56, 1.07);
      put(new THREE.Mesh(post, frameM), 0.56, 1.07);
      put(new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.14, 0.22), goldM), 0, 2.2);
      // проём: светится после открытия (золото — безопасно, красный — смерть)
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.05), new THREE.MeshBasicMaterial({ color: '#050304' }));
      inner.position.set(0, 1.03, -0.06); d.add(inner);
      const hinge = new THREE.Group(); hinge.position.set(-0.5, 0, 0.02); d.add(hinge);
      const leafM = new THREE.MeshStandardMaterial({ color: '#2a2218', metalness: 0.6, roughness: 0.45, emissive: new THREE.Color('#d9b25f'), emissiveIntensity: 0 });
      const leaf = new THREE.Mesh(new RoundedBoxGeometry(1.0, 2.04, 0.08, 3, 0.02), leafM);
      leaf.position.set(0.5, 1.03, 0); leaf.castShadow = true; hinge.add(leaf);
      const plate = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), new THREE.MeshBasicMaterial({ map: doorNumberTexture(i + 1) }));
      plate.position.set(0.5, 1.45, 0.045); hinge.add(plate);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), goldM); knob.position.set(0.86, 1.0, 0.07); hinge.add(knob);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), new THREE.MeshBasicMaterial({ color: '#f6dc97', transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.02, 0.45); d.add(glow);
      this.group.add(d);
      this.doors.push({ i, g: d, hinge, leaf, leafM, inner, glow, hover: false, owner: null, avatar: null });
    }
    const width = Math.min(perRow, n) * gap;
    const rows = n > 8 ? 2 : 1;
    // отъезд так, чтобы ряд дверей влез по ширине экрана (важно для телефона в портрете)
    const aspect = innerWidth / innerHeight, halfTan = Math.tan((this.world.camera.fov / 2) * Math.PI / 180);
    const z = Math.max(width * 0.72 + 3.8 + rows, (width * 1.1) / (2 * halfTan * aspect) + rows);
    this.world.camBase.set(0, 3.2 + rows * 1.2 + (z - 8) * 0.25, z);
    this.world.camLook.set(0, 1.0, -(rows - 1) * 1.3);
    this.round = st.round;
  }
  async onDoor(d) {
    const st = this.st;
    if (!d || !this.canAct(st) || d.owner || this.busy) return;
    this.busy = true; this.audio.select();
    const ok = await confirmBox(this.root, `${t('chooseDoor')} ${d.i + 1}?`);
    this.busy = false;
    if (!ok) return;
    const r = await this.act({ door: d.i });
    if (r?.ok) this.audio.confirm(); else { this.audio.click(); this.hint(t('doorTaken')); }
  }
  async claim(st, d, pid) {
    if (d.owner === pid) return;
    d.owner = pid;
    await this.ready;
    const info = st.players.find((p) => p.id === pid);
    const a = buildAvatar(info?.profile || {});
    a.scale.setScalar(0.8);
    const lbl = labelSprite(info?.name || '', pid === this.myId ? '#f6dc97' : '#d8c8ff', 0.3); lbl.position.y = 2.3; a.add(lbl);
    const p = new THREE.Vector3(); d.g.getWorldPosition(p);
    a.position.set(p.x, 5, p.z + 0.75);
    this.world.scene.add(a);
    d.avatar = a;
    tween(0.7, (k) => { a.position.y = 5 * (1 - k); }, ease.inQuad);
  }
  frame() {
    for (const d of this.doors || []) {
      const mine = d.owner === this.myId;
      const target = d.hover && !d.owner ? 0.45 : d.owner ? (mine ? 0.9 : 0.5) : 0.05;
      d.leafM.emissiveIntensity += (target - d.leafM.emissiveIntensity) * 0.2;
      d.leafM.emissive.set(d.owner && !mine ? '#8b5cf6' : '#d9b25f');
      d.glow.material.color.set(d.owner && !mine ? '#a78bfa' : '#f6dc97');
      d.glow.material.opacity = d.owner ? 0.55 : d.hover ? 0.35 : 0.12;
    }
  }
  update(st, changed) {
    this.st = st;
    if (!st.data) return;
    if (!this.doors || (st.phase === 'act' && changed && st.round !== this.round)) this.build(st);
    this.picker.set(this.canAct(st));
    if (st.phase === 'act') {
      this.hint(this.canAct(st) ? t('chooseDoor') : this.alive(st) ? t('waitOthers') : '');
      for (const [pid, di] of Object.entries(st.visible || {})) if (this.doors[di]) this.claim(st, this.doors[di], pid);
    }
    if (st.phase === 'reveal' && changed && st.reveal) this.reveal(st);
  }
  async reveal(st) {
    const r = st.reveal;
    for (const [pid, di] of Object.entries(r.doors)) if (this.doors[di]) await Promise.race([this.claim(st, this.doors[di], pid), wait(0.3)]);
    this.hint('');
    await wait(0.6);
    this.audio.charge();
    // двери распахиваются по очереди, смертельная — последней
    const order = this.doors.filter((d) => d.i !== r.death).concat(this.doors[r.death] ? [this.doors[r.death]] : []);
    for (const d of order) {
      const death = d.i === r.death;
      d.inner.material.color.set(death ? '#ff1a1a' : '#ffd27a');
      const light = new THREE.PointLight(death ? '#ff2020' : '#ffcf70', 0, 6, 1.6);
      light.position.set(0, 1.2, -0.4); d.g.add(light);
      tween(0.8, (k) => { d.hinge.rotation.y = -k * 1.8; light.intensity = k * (death ? 45 : 18); }, ease.outCubic);
      if (death) {
        await wait(0.5);
        this.audio.destroy();
        this.world.shake(0.35);
        const p = new THREE.Vector3(); d.g.getWorldPosition(p); p.y += 1;
        this.world.effects.burst(p, new THREE.Color('#1a1a1a'), 160, 3, 0.4, false, -0.5, 2.4);
        this.world.effects.burst(p, new THREE.Color('#ff3b1a'), 120, 6, 0.12, true, -6, 1.2);
        this.world.effects.flash(p, '#ff2a1a', 90);
        const a = d.avatar;
        if (a) { const y0 = a.position.y, z0 = a.position.z; tween(1.3, (k) => { a.position.z = z0 - k * 1.2; a.position.y = y0 - k * k * 4; a.rotation.x = k * 0.8; }, ease.inQuad).then(() => a.removeFromParent()); }
      } else await wait(0.18);
    }
  }
}
