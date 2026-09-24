import * as THREE from 'three';
import { buildAvatar, ensurePerson } from '../managers/AvatarManager.js';
import { tween, wait, ease } from './tween.js';
import { softDot } from './textures.js';

// Кино-сцена выбывания (по описанию в чате оператора):
// затемнение → камера крупно на выбывшего → своя причина для каждого испытания → игрок исчезает → «ВЫБЫЛ».
// Работает поверх любого GameWorld: ставит выбывших на тёмные постаменты по центру, сама двигает камеру.

const dot = softDot('#ffffff');

function textSprite(text, color = '#f6dc97', h = 0.5) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.font = '700 170px Cinzel, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 30; g.fillStyle = color; g.fillText(text, 256, 140);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
  s.scale.set(h * 2, h, 1);
  return s;
}

function sparks(scene, pos, color, n = 120, speed = 3, life = 1.4, size = 0.08, gravity = -3) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), v = [];
  for (let i = 0; i < n; i++) {
    p.set([pos.x, pos.y, pos.z], i * 3);
    const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
    v.push(d);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.PointsMaterial({ map: dot, color, size, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const pts = new THREE.Points(geo, m);
  scene.add(pts);
  return tween(life, (k) => {
    for (let i = 0; i < n; i++) { v[i].y += gravity * 0.016; p[i * 3] += v[i].x * 0.016; p[i * 3 + 1] += v[i].y * 0.016; p[i * 3 + 2] += v[i].z * 0.016; }
    geo.attributes.position.needsUpdate = true;
    m.opacity = 1 - k;
  }, ease.linear).then(() => { scene.remove(pts); geo.dispose(); m.dispose(); });
}

// Исчезновение аватара: осыпается искрами и тает.
async function dissolve(scene, a, color = '#ffb347') {
  const p = a.getWorldPosition(new THREE.Vector3()); p.y += 0.9;
  sparks(scene, p, new THREE.Color(color), 180, 1.6, 1.6, 0.07, 1.2);
  const s0 = a.scale.x;
  await tween(0.9, (k) => { a.scale.setScalar(s0 * (1 - k)); a.position.y += 0.004; }, ease.inCubic);
  a.visible = false;
}

export class Cinematic {
  constructor(world, audio, overlayRoot) {
    this.world = world;
    this.audio = audio;
    this.overlayRoot = overlayRoot;
    this.group = new THREE.Group();
    world.scene.add(this.group);
  }

  darken(on) {
    let d = this.overlayRoot.querySelector('.cine-dark');
    if (!d) { d = document.createElement('div'); d.className = 'cine-dark'; this.overlayRoot.appendChild(d); }
    requestAnimationFrame(() => d.classList.toggle('on', on));
  }

  flash(color = '#ffffff', ms = 450) {
    const f = document.createElement('div');
    f.className = 'cine-flash';
    f.style.background = color;
    this.overlayRoot.appendChild(f);
    setTimeout(() => f.remove(), ms);
  }

  // Камера плавно подъезжает к точке и смотрит на неё
  async focus(target, dist = 2.4, height = 1.25, dur = 0.8) {
    const w = this.world;
    const from = w.camera.position.clone();
    const to = target.clone().add(new THREE.Vector3(0.3 * dist, height, dist));
    const look0 = w.camLook.clone(), look1 = target.clone().add(new THREE.Vector3(0, 0.98, 0));
    w.cineCam = true; // GameWorld не трогает камеру, пока идёт сцена
    await tween(dur, (k) => {
      w.camera.position.lerpVectors(from, to, k);
      w.camera.lookAt(new THREE.Vector3().lerpVectors(look0, look1, k));
    }, ease.inOutCubic);
  }

  release() { this.world.cineCam = false; this.darken(false); }

  // Выбывшие в центре сцены на тёмных постаментах
  async stage(players) {
    await Promise.all(players.map((p) => ensurePerson(p.profile)));
    const n = players.length, gap = 1.1;
    const pedM = new THREE.MeshStandardMaterial({ color: '#141018', metalness: 0.8, roughness: 0.35, emissive: '#3a0a0a', emissiveIntensity: 0.4 });
    const avatars = players.map((p, i) => {
      const x = (i - (n - 1) / 2) * gap;
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.18, 40), pedM);
      ped.position.set(x, 0.09, 0); ped.receiveShadow = true;
      this.group.add(ped);
      const a = buildAvatar(p.profile || {});
      a.position.set(x, 0.18, 0);
      a.scale.setScalar(0.001);
      this.group.add(a);
      return a;
    });
    const key = new THREE.SpotLight('#ffe6c8', 11, 12, 0.6, 0.6, 1.2);
    key.position.set(1.5, 4, 3); key.target.position.set(0, 1, 0);
    const rim = new THREE.PointLight('#ff3b2a', 5, 6, 2); rim.position.set(0, 2, -1.5);
    this.group.add(key, key.target, rim);
    this.rim = rim;
    await tween(0.5, (k) => avatars.forEach((a) => a.scale.setScalar(k)), ease.outBack);
    return avatars;
  }

  // Главный вход: kind — id испытания, info — данные для эффекта (число, фигура и т. п.)
  async play(kind, players, info = {}) {
    const w = this.world, sc = this.group;
    this.darken(true);
    const avatars = await this.stage(players);
    const center = new THREE.Vector3(0, 0, 0);
    await this.focus(center, Math.max(3.6, players.length * 1.5), 1.35);
    const upd = w.update;
    const t0 = performance.now();
    w.update = (dt, t) => { upd.call(w, dt, t); avatars.forEach((a) => a.userData.update?.(t)); };
    const head = (a) => a.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.85, 0));
    const chest = (a) => a.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.2, 0));
    try {
      switch (kind) {
        case 'time': await this.fxTime(avatars, chest, info); break;
        case 'memory': await this.fxMemory(avatars, chest, info); break;
        case 'center': await this.fxCenter(avatars, chest, info); break;
        case 'unique': await this.fxUnique(avatars, head, info); break;
        case 'shoot': await this.fxShoot(avatars, chest); break;
        case 'bomb': await this.fxBomb(avatars, chest); break;
        case 'cards': await this.fxCards(avatars, chest); break;
        case 'roulette': await this.fxRoulette(avatars, chest); break;
        default: await Promise.all(avatars.map((a) => dissolve(sc, a)));
      }
    } finally {
      await wait(0.3);
      w.update = upd;
      void t0;
    }
  }

  dispose() {
    this.world.scene.remove(this.group);
    this.release();
  }

  // ---- эффекты по испытаниям ----
  // Останови время: вокруг игрока циферблат, частицы зависают, стрелка срывается — стекло часов разбивается.
  async fxTime(avatars, chest, info) {
    const sc = this.group;
    const rings = avatars.map((a) => {
      const g = new THREE.Group();
      const gold = new THREE.MeshBasicMaterial({ color: '#f6dc97', transparent: true, opacity: 0.9 });
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.02, 8, 64), gold));
      for (let i = 0; i < 12; i++) { const tk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.02), gold); const an = (i / 12) * Math.PI * 2; tk.position.set(Math.sin(an) * 0.66, Math.cos(an) * 0.66, 0); tk.rotation.z = -an; g.add(tk); }
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.55, 0.02), new THREE.MeshBasicMaterial({ color: '#ff3b2a' })); hand.geometry.translate(0, 0.27, 0); g.add(hand);
      g.userData.hand = hand;
      g.position.copy(chest(a)).add(new THREE.Vector3(0, 0, -0.35));
      const label = textSprite(info.text || '', '#ff5a4a', 0.32); label.position.set(0, 1.05, 0.5); g.add(label);
      sc.add(g);
      return g;
    });
    this.audio.charge();
    await tween(1.6, (k) => rings.forEach((r) => { r.userData.hand.rotation.z = -k * k * 30; }), ease.inCubic); // стрелка разгоняется
    this.flash('#ffffff', 250);
    this.audio.crack(); this.audio.destroy();
    rings.forEach((r) => { sparks(sc, r.position, new THREE.Color('#dff4ff'), 160, 3.5, 1.3, 0.06, -4); r.visible = false; });
    await Promise.all(avatars.map((a) => dissolve(sc, a, '#9fd8ff')));
  }

  // Запомни число: светящиеся цифры кружат вокруг игрока, краснеют и разлетаются.
  async fxMemory(avatars, chest, info) {
    const sc = this.group;
    const digits = String(info.number || '000').split('');
    const all = avatars.map((a) => digits.map((d, i) => { const s = textSprite(d, '#f6dc97', 0.32); s.userData.a0 = (i / digits.length) * Math.PI * 2; s.userData.c = chest(a); sc.add(s); return s; })).flat();
    await tween(1.4, (k) => all.forEach((s) => { const an = s.userData.a0 + k * 3; s.position.copy(s.userData.c).add(new THREE.Vector3(Math.cos(an) * 0.8, Math.sin(k * 6 + s.userData.a0) * 0.2, Math.sin(an) * 0.8)); }), ease.linear);
    all.forEach((s) => s.material.color.set('#ff3b2a'));
    this.audio.crack();
    await wait(0.35);
    const dirs = all.map(() => new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(3));
    await Promise.all([
      tween(0.9, (k) => all.forEach((s, i) => { s.position.addScaledVector(dirs[i], 0.03); s.material.opacity = 1 - k; }), ease.linear),
      ...avatars.map((a) => dissolve(sc, a, '#f6dc97')),
    ]);
  }

  // Центр: золотая фигура перед игроком, золотая линия от точки к центру, фигура раскалывается.
  async fxCenter(avatars, chest, info) {
    const sc = this.group;
    const pts = info.points || [[300, 300], [700, 300], [700, 700], [300, 700]];
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2((x - 500) / 500, -(y - 500) / 500)));
    const shapes = avatars.map((a) => {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: '#d9b25f', transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      m.scale.setScalar(0.55); m.position.copy(chest(a)).add(new THREE.Vector3(0, 0.1, 0.55));
      sc.add(m);
      return m;
    });
    await wait(0.9);
    this.audio.crack();
    this.flash('#f6dc97', 200);
    shapes.forEach((m) => { sparks(sc, m.position, new THREE.Color('#f6dc97'), 140, 2.5, 1.2, 0.09, -5); m.visible = false; });
    this.audio.destroy();
    await Promise.all(avatars.map((a) => dissolve(sc, a, '#f6dc97')));
  }

  // Уникальное число: над головой выбранное число, совпавшие связаны красной линией, числа разбиваются.
  async fxUnique(avatars, head, info) {
    const sc = this.group;
    const nums = avatars.map((a, i) => { const s = textSprite(String(info.numbers?.[i] ?? '?'), '#ff4a3a', 0.5); s.position.copy(head(a)).add(new THREE.Vector3(0, 0.35, 0)); sc.add(s); return s; });
    if (avatars.length > 1) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(nums.map((s) => s.position)), new THREE.LineBasicMaterial({ color: '#ff2a1a' }));
      sc.add(line);
    }
    await wait(1.1);
    this.audio.crack();
    nums.forEach((s) => { sparks(sc, s.position, new THREE.Color('#ff4a3a'), 90, 2.2, 1, 0.08, -4); s.visible = false; });
    await Promise.all(avatars.map((a) => dissolve(sc, a, '#ff5a3a')));
  }

  // Стрельба вслепую: из темноты бьёт луч, вспышка, игрока отбрасывает.
  async fxShoot(avatars, chest) {
    const sc = this.group;
    for (const a of avatars) {
      const c = chest(a);
      const from = c.clone().add(new THREE.Vector3(-6, 0.3, 2));
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 12), new THREE.MeshBasicMaterial({ color: '#7cf0ff', transparent: true, blending: THREE.AdditiveBlending }));
      sc.add(beam);
      this.audio.charge();
      await tween(0.35, (k) => {
        const tip = new THREE.Vector3().lerpVectors(from, c, k);
        beam.position.lerpVectors(from, tip, 0.5);
        beam.scale.set(1, from.distanceTo(tip) + 0.001, 1);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(from).normalize());
      }, ease.inQuad);
      this.flash('#bdf6ff', 220);
      this.audio.destroy();
      sparks(sc, c, new THREE.Color('#7cf0ff'), 150, 3.2, 1.1, 0.08, -2);
      const p0 = a.position.clone();
      tween(0.5, (k) => { beam.material.opacity = 1 - k; }).then(() => sc.remove(beam));
      await tween(0.7, (k) => { a.position.set(p0.x + k * 1.4, p0.y + Math.sin(k * Math.PI) * 0.4, p0.z - k * 0.8); a.rotation.z = -k * 1.3; }, ease.outCubic);
    }
    await Promise.all(avatars.map((a) => dissolve(sc, a, '#7cf0ff')));
  }

  // Бомба: в руках пульсирует красная бомба, тиканье ускоряется, тишина — белая вспышка — взрыв, остаются дым и искры.
  async fxBomb(avatars, chest) {
    const sc = this.group;
    const bombs = avatars.map((a) => {
      // тёмная чугунная бомба с фитилём; раскаляется изнутри красным
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), new THREE.MeshStandardMaterial({ color: '#1a1a1e', emissive: '#ff2020', emissiveIntensity: 0.05, roughness: 0.45, metalness: 0.7 }));
      b.position.copy(chest(a)).add(new THREE.Vector3(0, -0.25, 0.35));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 16), new THREE.MeshStandardMaterial({ color: '#555', metalness: 1, roughness: 0.3 })); cap.position.y = 0.16; b.add(cap);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), new THREE.MeshStandardMaterial({ color: '#c8b48a' })); fuse.position.set(0.03, 0.22, 0); fuse.rotation.z = -0.5; b.add(fuse);
      const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#ffb347', blending: THREE.AdditiveBlending, depthWrite: false })); spark.scale.setScalar(0.12); spark.position.set(0.06, 0.28, 0); b.add(spark);
      sc.add(b);
      return b;
    });
    for (let i = 0; i < 8; i++) {
      bombs.forEach((b) => { b.material.emissiveIntensity = 1.2; });
      this.audio.tick();
      await wait(0.06);
      bombs.forEach((b) => { b.material.emissiveIntensity = 0.05; });
      await wait(Math.max(0.05, 0.32 - i * 0.04));
    }
    await wait(0.45); // тишина
    this.flash('#ffffff', 700);
    this.audio.destroy(); this.audio.destroy();
    this.world.shake(0.6);
    bombs.forEach((b) => { sparks(sc, b.position, new THREE.Color('#ffb347'), 260, 5, 1.5, 0.1, -3); sparks(sc, b.position, new THREE.Color('#333'), 120, 1.2, 2.4, 0.4, 0.6); b.visible = false; });
    avatars.forEach((a) => { a.visible = false; });
    await wait(1.4);
  }

  // Очко: карты вокруг игрока переворачиваются красным и разлетаются.
  async fxCards(avatars, chest) {
    const sc = this.group;
    const cardM = new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.5, emissive: '#000' });
    const cards = avatars.map((a) => Array.from({ length: 5 }, (_, i) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.36, 0.01), cardM.clone());
      c.position.copy(chest(a)).add(new THREE.Vector3((i - 2) * 0.2, 0.1 + Math.abs(i - 2) * -0.04, 0.5));
      c.rotation.z = (i - 2) * -0.18;
      sc.add(c);
      return c;
    })).flat();
    await wait(0.8);
    cards.forEach((c) => c.material.emissive.set('#aa0000'));
    this.audio.crack();
    await wait(0.4);
    const dirs = cards.map(() => new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 2, (Math.random() - 0.2) * 3));
    await Promise.all([
      tween(1.1, (k) => cards.forEach((c, i) => { dirs[i].y -= 0.12; c.position.addScaledVector(dirs[i], 0.016); c.rotation.x += 0.2; c.rotation.y += 0.15; }), ease.linear),
      ...avatars.map((a) => dissolve(sc, a, '#ff5a3a')),
    ]);
  }

  // Рулетка: над игроком вращается барабан, щелчок — красная вспышка, игрок рассыпается в дым.
  async fxRoulette(avatars, chest) {
    const sc = this.group;
    const drums = avatars.map((a) => {
      const g = new THREE.Group();
      const metalM = new THREE.MeshStandardMaterial({ color: '#8a8f96', metalness: 1, roughness: 0.25 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 6), metalM); body.rotation.x = Math.PI / 2; g.add(body);
      for (let i = 0; i < 6; i++) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 16), new THREE.MeshStandardMaterial({ color: i === 0 ? '#ff2a1a' : '#0a0a0a', emissive: i === 0 ? '#ff2a1a' : '#000', emissiveIntensity: 1.2 })); const an = (i / 6) * Math.PI * 2; h.position.set(Math.cos(an) * 0.17, Math.sin(an) * 0.17, 0); h.rotation.x = Math.PI / 2; g.add(h); }
      g.position.copy(chest(a)).add(new THREE.Vector3(0, 1.0, 0.2));
      sc.add(g);
      return g;
    });
    this.audio.charge();
    await tween(1.4, (k) => drums.forEach((d) => { d.rotation.z = (1 - Math.pow(1 - k, 3)) * Math.PI * 8; }), ease.linear);
    await wait(0.3);
    this.flash('#ff2020', 400);
    this.audio.destroy();
    this.world.shake(0.4);
    drums.forEach((d) => { sparks(sc, d.position, new THREE.Color('#ff3b2a'), 120, 2.4, 1, 0.08, -4); d.visible = false; });
    await Promise.all(avatars.map((a) => dissolve(sc, a, '#ff3b2a')));
  }
}
