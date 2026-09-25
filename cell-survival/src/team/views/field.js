// Испытания на 3D-поле: «Последняя клетка», «Взрывное поле», «Уникальное число», «Двери».
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { t } from '../../i18n.js';
import { GameWorld } from '../../scene/GameWorld.js';
import { CELL, CELL_H } from '../../managers/CellManager.js';
import { PLAYER } from '../../managers/PlayerManager.js';
import { EliminationManager } from '../../managers/EliminationManager.js';
import { ensurePerson, buildAvatar } from '../../managers/AvatarManager.js';
import { tween, wait, ease } from '../../scene/tween.js';
import { BaseView, Picker, confirmBox, labelSprite, prewarmAvatars } from './common.js';

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
    if (!this.warmed) { this.warmed = true; prewarmAvatars(this.stage, this.world, st.players, [], () => this.st?.phase === 'reveal'); } // один раз на испытание: поля перестраиваются каждый раунд
    this.picker = new Picker(this.world.camera, () => this.grid.alive.flatMap((c) => [c.base, c.top]), {
      onHover: (m) => { this.grid.cells.forEach((c) => { c.hover = false; }); const c = m?.userData.cell; if (c && this.pickable(c)) { c.hover = true; this.audio.hover(); } },
      onClick: (m) => this.onCell(m.userData.cell),
    });
  }
  pickable() { return true; }
  // Крупный план при выбывании убран (оператор 25.09: лаги) — камера остаётся на всём поле.
  async closeUp() {}
  closeUpEnd() {}
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
  // настроение людей на поле: nervous — пока решается судьба, cheer/clap — уцелели, sad — выбывают
  mood(ids, m) { for (const id of ids) { const a = this.pl.get(id)?.avatar; a?.userData.mood?.(m === 'joy' ? (Math.random() < 0.5 ? 'cheer' : 'clap') : m); } }
  moodAlive(st, m) { this.mood([...this.pl.keys()].filter((id) => st.alive?.includes(id) && this.pl.get(id).state === PLAYER.ALIVE), m); }
  leave() { super.leave(); this.cine?.release(); document.body.style.cursor = ''; }
}

// ---------- 1. Последняя клетка ----------
export class LastCellView extends FieldView {
  revealFxSec = 5.5;
  enter(st) {
    if (st.data) this.build(st); else this.world = backdrop(this);
    // люди готовятся во время заставки: лампы заставки и поля одинаковые — шейдеры подойдут
    if (!this.warmed) { this.warmed = true; prewarmAvatars(this.stage, this.world, st.players, [], () => this.st?.phase === 'reveal'); }
  }
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
    this.mood(Object.keys(r.stand), 'nervous');
    await this.elim.roulette(this.grid.alive, target);
    const victims = [...this.pl.values()].filter((p) => p.cell === target && p.state === PLAYER.ALIVE);
    victims.forEach((p) => p.avatar?.userData.mood?.('sad'));
    this.mood(Object.keys(r.stand).filter((id) => !victims.some((v) => v.id === id)), 'joy');
    if (victims.length) await this.closeUp(target.group.getWorldPosition(new THREE.Vector3()), 2.2);
    await this.elim.destroy(target, victims);
    if (victims.length) { await wait(0.4); this.closeUpEnd(); }
    this.mv.showOut();
    await Promise.all([this.grid.relayout(), this.world.fitCamera(this.grid.extent)]);
    setTimeout(() => this.moodAlive(this.st, 'idle'), 2500);
  }
}

// ---------- 4. Взрывное поле ----------
export class MinesView extends FieldView {
  revealFxSec = 3.2;
  enter(st) {
    if (st.data) this.build(st); else this.world = backdrop(this);
    // люди готовятся во время заставки: лампы заставки и поля одинаковые — шейдеры подойдут
    if (!this.warmed) { this.warmed = true; prewarmAvatars(this.stage, this.world, st.players, [], () => this.st?.phase === 'reveal'); }
  }
  build(st) {
    this.built = true;
    this.picker?.dispose(); // старое поле освобождает Stage.setWorld, обработчики нажатий — здесь
    this.setupWorld(st, st.data.size);
    const keep = new Set(st.data.cells || []);
    if (st.data.cells && keep.size < st.data.size) {
      for (const c of this.grid.cells) if (!keep.has(c.id)) { c.alive = false; c.group.parent?.remove(c.group); }
      this.grid.relayout().then(() => this.world.fitCamera(this.grid.extent));
    }
    this.grid.intro();
    this.stand = null; this.bomb = null; this.standOk = false; this.busy = false;
    this.markers = new THREE.Group();
    this.world.scene.add(this.markers);
    this.panel();
  }
  panel() { this.el.innerHTML = ''; }
  pickable() { return this.canAct(this.st) && !this.busy; }
  async onCell(c) {
    if (!this.canAct(this.st) || this.busy) return;
    this.busy = true;
    if (!this.standOk) {
      // шаг 1: где я стою
      this.stand = c.id; this.bomb = null;
      this.audio.select(); this.drawMarkers();
      if (await confirmBox(this.root, t('confirmStand'))) { this.standOk = true; this.audio.confirm(); }
      else this.stand = null;
    } else {
      // шаг 2: какую клетку минирую — после подтверждения ход уходит на сервер
      this.bomb = c.id;
      this.audio.charge(); this.drawMarkers();
      if (await confirmBox(this.root, t('confirmBomb')) && this.canAct(this.st)) {
        const r = await this.act({ stand: this.stand, bomb: this.bomb });
        if (r?.ok) this.audio.confirm();
      } else this.bomb = null;
    }
    this.busy = false;
    this.drawMarkers();
  }
  drawMarkers() {
    this.markers.clear();
    const at = (id) => { const p = new THREE.Vector3(); this.grid.cells[id].group.getWorldPosition(p); return p; };
    if (this.stand != null) {
      const ghost = buildAvatar(this.st.players.find((p) => p.id === this.myId)?.profile || {});
      ghost.scale.setScalar(0.7); ghost.position.copy(at(this.stand)).add(new THREE.Vector3(0, 0.17, 0));
      // полупрозрачный «призрак»; у реалистичных людей на меше несколько материалов
      const ghostMat = (m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.55; c.alphaHash = false; return c; };
      ghost.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(ghostMat) : ghostMat(o.material); });
      this.markers.add(ghost);
    }
    if (this.bomb != null) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 40), new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(at(this.bomb)).add(new THREE.Vector3(0, 0.2, 0));
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.06), ring.material); cross.rotation.x = -Math.PI / 2; cross.position.copy(ring.position);
      const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2;
      this.markers.add(ring, cross, cross2);
    }
    if (this.canAct(this.st)) this.hint(!this.standOk ? t('pickStand') : t('pickBomb'));
  }
  update(st, changed) {
    const prev = this.st;
    this.st = st;
    if (!this.built) { if (!st.data) return; this.build(st); }
    this.picker.set(this.canAct(st));
    if (st.phase === 'act' && changed && prev && prev.round !== st.round) this.build(st); // каждый раунд — целое поле заново
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
    const hitCell = !r.replay && Object.values(r.moves).map((m) => m.stand).find((sid) => r.bombs.includes(sid));
    if (hitCell != null) await this.closeUp(this.grid.cells[hitCell].group.getWorldPosition(new THREE.Vector3()), 3);
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
      a.userData.mood?.(bombed.has(mv.stand) ? 'sad' : Math.random() < 0.5 ? 'cheer' : 'clap');
      if (bombed.has(mv.stand) && !r.replay) {
        const y0 = a.position.y;
        tween(1.4, (k) => { a.position.y = y0 - k * k * 7; a.rotation.x = k * 1.2; }, ease.linear).then(() => a.removeFromParent());
      } else if (bombed.has(mv.stand)) {
        tween(1.4, (k) => { a.position.y = pos.y - k * k * 7; }, ease.linear).then(() => a.removeFromParent());
      }
    }
    setTimeout(() => { this.closeUpEnd(); this.mv.showOut(); }, 1700);
  }
}

// ---------- 7. Уникальное число ----------
// Числа написаны на плитках поля. Каждый тайно встаёт на плитку; когда выбрали все — все выходят на свои плитки.
// Плитка, на которую встали двое и больше, рушится вместе с ними. Выбранные плитки из игры уходят.
function tileNumberTexture(n) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 76px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(String(n), 64, 70);
  g.fillStyle = '#f6dc97'; g.fillText(String(n), 64, 70);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
}
const numGeo = new THREE.PlaneGeometry(0.72, 0.72);

export class UniqueFieldView extends FieldView {
  revealFxSec = 5;
  enter(st) {
    if (st.data) this.build(st); else this.world = backdrop(this);
    // люди готовятся во время заставки: лампы заставки и поля одинаковые — шейдеры подойдут
    if (!this.warmed) { this.warmed = true; prewarmAvatars(this.stage, this.world, st.players, [], () => this.st?.phase === 'reveal'); }
  }
  build(st) {
    this.built = true;
    this.round = st.round;
    this.picker?.dispose();
    const total = st.data.total || st.data.max;
    this.setupWorld(st, total);
    const keep = new Set(st.data.pool.map((n) => n - 1));
    for (const c of this.grid.cells) {
      if (!keep.has(c.id)) { c.alive = false; c.group.parent?.remove(c.group); continue; }
      const m = new THREE.Mesh(numGeo, new THREE.MeshBasicMaterial({ map: tileNumberTexture(c.id + 1), transparent: true, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = CELL_H / 2 + 0.01; m.renderOrder = 2;
      c.inner.add(m);
    }
    if (keep.size !== total) this.grid.relayout().then(() => this.world.fitCamera(this.grid.extent));
    this.grid.intro();
    this.busy = false;
  }
  pickable() { return this.canAct(this.st) && !this.busy; }
  async onCell(c) {
    if (!this.canAct(this.st) || this.busy) return;
    this.busy = true;
    this.grid.clearSelection(); c.setState(CELL.SELECTED); this.audio.select();
    const ok = await confirmBox(this.root, `${t('chooseNumber')}: ${c.id + 1}?`);
    this.busy = false;
    if (!ok || !this.canAct(this.st)) { c.setState(CELL.AVAILABLE); return; }
    const r = await this.act({ n: c.id + 1 });
    this.audio[r?.ok ? 'confirm' : 'click']();
    if (!r?.ok) { c.setState(CELL.AVAILABLE); return; }
    c.setState(CELL.CONFIRMED);
    this.place(this.st, this.myId, c); // свою фигуру видите только вы; чужие появятся при раскрытии
  }
  update(st, changed) {
    this.st = st;
    if (!this.built) { if (!st.data) return; this.build(st); }
    if (st.phase === 'act' && changed && st.round !== this.round) this.build(st); // новый раунд — поле без выбранных плиток
    this.picker.set(this.canAct(st));
    if (st.phase === 'act') {
      this.hint(this.canAct(st) ? t('chooseNumber') : this.alive(st) ? t('waitOthers') : '');
      if (st.mine != null && !this.pl.get(this.myId)?.cell) { const c = this.grid.cells[st.mine - 1]; if (c?.alive) { c.setState(CELL.CONFIRMED); this.place(st, this.myId, c); } }
    }
    if (st.phase === 'reveal' && changed && st.reveal) this.reveal(st);
  }
  async reveal(st) {
    const r = st.reveal;
    this.picker.set(false);
    this.hint('');
    this.grid.clearSelection();
    const byCell = new Map();
    for (const [pid, n] of Object.entries(r.picks || {})) { const c = this.grid.cells[n - 1]; if (!c?.alive) continue; if (!byCell.has(c)) byCell.set(c, []); byCell.get(c).push(pid); }
    // все выходят на свои плитки одновременно
    await Promise.race([Promise.all([...byCell].flatMap(([c, ids]) => ids.map((id) => this.place(st, id, c)))), wait(2.2)]);
    // несколько на одной плитке — расставить рядом, чтобы было видно всех
    for (const [, ids] of byCell) if (ids.length > 1) ids.forEach((id, k) => { const a = this.pl.get(id)?.avatar; if (!a) return; a.position.x = (k - (ids.length - 1) / 2) * 0.36; const l = a.children.find((o) => o.isSprite); if (l) l.position.y = 2.25 + k * 0.32; });
    await wait(0.8);
    const bad = [...byCell].filter(([, ids]) => ids.length > 1).map(([c]) => c);
    const good = [...byCell].filter(([, ids]) => ids.length === 1).map(([c]) => c);
    for (const [, ids] of byCell) this.mood(ids, ids.length > 1 && !r.replay ? 'sad' : 'joy');
    good.forEach((c) => c.setState(CELL.CONFIRMED));
    bad.forEach((c) => { c.danger = 0.35; });
    this.audio[bad.length ? 'charge' : 'confirm']();
    await wait(1.4);
    if (!bad.length) { this.mv.showOut(); return; }
    await this.closeUp(bad[0].group.getWorldPosition(new THREE.Vector3()), bad.length > 1 ? 4 : 2.6);
    const players = [...this.pl.values()];
    await Promise.all(bad.map((c) => this.elim.destroy(c, players)));
    await wait(0.4);
    this.closeUpEnd();
    this.mv.showOut();
  }
}

// ---------- 2. Двери ----------
// материалы монстра создаются при входе в испытание — их шейдеры собираются заранее (prewarmAvatars)
function monsterMats() {
  return {
    dark: new THREE.MeshStandardMaterial({ color: '#050304', roughness: 0.55, metalness: 0.2, emissive: '#3a0000', emissiveIntensity: 0.4 }),
    eyeM: new THREE.MeshBasicMaterial({ color: '#ff2a1a', transparent: true, opacity: 0 }),
    tm: new THREE.MeshStandardMaterial({ color: '#0a0406', roughness: 0.4, emissive: '#5a0010', emissiveIntensity: 0.6 }),
  };
}
function doorNumberTexture(n) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1206'; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#d9b25f'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#f6dc97'; g.font = '700 64px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}

export class DoorsView extends BaseView {
  revealFxSec = 6.5;
  enter(st) {
    this.world = new GameWorld(this.theme);
    this.stage.setWorld(this.world);
    this.ready = Promise.all(st.players.map((p) => ensurePerson(p.profile)));
    this.mm = monsterMats();
    this.warmLight = new THREE.PointLight('#ffcf70', 0, 9, 1.6); this.warmLight.position.set(0, 1.4, -0.5);
    this.redLight = new THREE.PointLight('#ff2020', 0, 6, 1.6);
    this.world.scene.add(this.warmLight, this.redLight);
    // подготовка людей и монстра — во время заставки, пока игрок читает правила
    prewarmAvatars(this.stage, this.world, st.players, Object.values(this.mm).map((m) => new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), m)), () => this.st?.phase === 'reveal');
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
    // Свет раскрытия создаётся сразу и только включается: новая лампа посреди раунда заставляет three.js
    // пересобирать шейдеры всех материалов сцены (замер 25.09: +74 шейдера, рывки до 172 мс).
    // (лампы — в enter, один раз на испытание)
    this.warmLight.intensity = 0; this.redLight.intensity = 0;
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
    this.group.add(a); // в группе раунда: новый раунд убирает и двери, и фигуры
    d.avatar = a;
    tween(0.7, (k) => { a.position.y = 5 * (1 - k); }, ease.inQuad);
  }
  frame() {
    for (const d of this.doors || []) {
      if (d.dead) { d.leafM.emissive.set('#ff1a1a'); d.leafM.emissiveIntensity = 0.8; continue; }
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
    await Promise.race([Promise.all(Object.entries(r.doors).map(([pid, di]) => this.doors[di] && this.claim(st, this.doors[di], pid))), wait(0.8)]);
    this.hint('');
    await wait(0.3);
    this.audio.charge();
    // двери распахиваются по очереди, смертельная — последней
    const order = this.doors.filter((d) => d.i !== r.death).concat(this.doors[r.death] ? [this.doors[r.death]] : []);
    for (const d of order) {
      const death = d.i === r.death;
      d.inner.material.color.set(death ? '#120000' : '#ffd27a');
      let light = this.warmLight;
      if (death) { light = this.redLight; d.g.getWorldPosition(light.position).add(new THREE.Vector3(0, 1.2, -0.4)); }
      const i0 = light.intensity;
      tween(0.8, (k) => { d.hinge.rotation.y = -k * 1.8; light.intensity = death ? k * 30 : Math.max(i0, Math.min(40, i0 + k * 8)); }, ease.outCubic);
      if (death) { await wait(0.4); await this.monster(d, light); }
      else {
        // выживший шагает в свет своей двери и исчезает
        const a = d.avatar;
        if (a) { const z0 = a.position.z; tween(1.1, (k) => { a.position.z = z0 - k * 1.3; a.scale.setScalar(0.8 * (1 - k * 0.35)); }, ease.inCubic).then(() => { a.visible = false; }); }
        await wait(0.12);
      }
    }
  }

  // Монстр за смертельной дверью: из темноты загораются глаза, щупальца хватают игрока,
  // утаскивают внутрь, дверь захлопывается.
  async monster(d, light) {
    const g = new THREE.Group();
    g.position.set(0, 0, -0.35);
    d.g.add(g);
    const { dark, eyeM, tm } = this.mm || (this.mm = monsterMats());
    eyeM.opacity = 0;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 6, 16), dark); body.position.set(0, 1.0, -0.25); body.scale.set(1, 1, 0.7); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), dark); head.position.set(0, 1.78, -0.1); head.scale.set(1.1, 0.9, 1); g.add(head);
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 10), dark); horn.position.set(sx * 0.16, 2.0, -0.12); horn.rotation.z = -sx * 0.5; g.add(horn);
    }
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), eyeM); e.position.set(sx * 0.09, 1.8, 0.1); e.scale.set(1.4, 0.7, 1); g.add(e); }
    const eyeLight = { intensity: 0 }; // без настоящей лампы: глаза светятся сами (свечение bloom), шейдеры не пересобираются
    g.scale.setScalar(0.001);

    this.audio.monster();
    await tween(0.7, (k) => { g.scale.setScalar(0.001 + k); eyeM.opacity = k; eyeLight.intensity = k * 6; }, ease.outBack);

    const a = d.avatar;
    if (a) {
      // щупальца тянутся от монстра к игроку (координаты в системе монстра)
      g.updateMatrixWorld(true);
      const target = g.worldToLocal(a.getWorldPosition(new THREE.Vector3()));
      const tentacles = [];
      for (let i = 0; i < 4; i++) {
        const h = 0.55 + i * 0.3, side = i % 2 ? 1 : -1;
        const pts = [
          new THREE.Vector3(side * 0.25, 1.0 + i * 0.12, -0.1),
          new THREE.Vector3(side * 0.5, h + 0.5, target.z * 0.5),
          new THREE.Vector3(target.x + side * 0.12, target.y + h, target.z - 0.05),
        ];
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.05 - i * 0.006, 8);
        geo.setDrawRange(0, 0);
        const t = new THREE.Mesh(geo, tm);
        g.add(t); tentacles.push(t);
      }
      const grow = (k) => tentacles.forEach((t) => t.geometry.setDrawRange(0, Math.floor(t.geometry.index.count * k)));
      this.audio.crack();
      await tween(0.35, grow, ease.outCubic);
      this.world.shake(0.25);
      // рывок — игрок пытается вырваться, потом его утаскивает в дверь
      const start = a.position.clone();
      await tween(0.3, (k) => { a.position.x = start.x + Math.sin(k * 40) * 0.05; }, ease.linear);
      const doorPos = d.g.getWorldPosition(new THREE.Vector3());
      const inside = new THREE.Vector3(doorPos.x, start.y + 0.6, doorPos.z - 1.5);
      this.audio.destroy();
      await tween(0.9, (k) => {
        a.position.lerpVectors(start, inside, k);
        a.position.y += Math.sin(Math.PI * k) * 0.5;
        a.rotation.x = -k * 0.9;
        a.scale.setScalar(0.8 * (1 - k * 0.5));
        grow(1 - k);
      }, ease.inCubic);
      a.visible = false;
    }
    // монстр уходит в темноту, дверь захлопывается
    await tween(0.4, (k) => { g.scale.setScalar(1 - k * 0.999); eyeM.opacity = 1 - k; eyeLight.intensity = (1 - k) * 6; }, ease.inCubic);
    g.visible = false;
    await tween(0.25, (k) => { d.hinge.rotation.y = -1.8 * (1 - k); light.intensity = 30 * (1 - k); }, ease.inQuad);
    this.audio.destroy();
    this.world.shake(0.45);
    const p = d.g.getWorldPosition(new THREE.Vector3()); p.y += 0.2; p.z += 0.3;
    this.world.effects.burst(p, new THREE.Color('#2a2a2a'), 120, 2.5, 0.35, false, -1, 1.8);
    d.dead = true;
    await wait(0.5);
    this.mv.showOut();
  }
}
