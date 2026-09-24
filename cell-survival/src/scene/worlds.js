import * as THREE from 'three';
import { softDot, smokeTexture, gradientTexture, surfaceTextures } from './textures.js';
import { buildAvatar, BACKGROUNDS, ensurePerson } from '../managers/AvatarManager.js';
import { ASSETS } from '../paths.js';

function embers(count, color, spread, size = 0.08) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3), v = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    p[i * 3] = (Math.random() - 0.5) * spread; p[i * 3 + 1] = Math.random() * 10 - 3; p[i * 3 + 2] = (Math.random() - 0.5) * spread * 0.6;
    v[i] = 0.3 + Math.random() * 0.9;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: softDot('#fff'), color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.userData.update = (dt, t) => {
    for (let i = 0; i < count; i++) {
      p[i * 3 + 1] += v[i] * dt;
      p[i * 3] += Math.sin(t * 0.8 + i) * dt * 0.2;
      if (p[i * 3 + 1] > 7) p[i * 3 + 1] = -3;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

// Фон главного меню и экранов выбора: кузница — угли, дым, золото и фиолет.
// Если лежит нарисованный фон (assets/menu/background.jpg) — он заменяет 3D-пол и плиты, частицы остаются.
export class MenuWorld {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
    this.camera.position.set(0, 1.2, 8);
    this.bloom = 0.9;
    this.scene.background = gradientTexture([[0, '#050409'], [0.55, '#140c1f'], [0.8, '#2a1606'], [1, '#050302']]);
    new THREE.TextureLoader().load(`${ASSETS}menu/background.jpg`, (tx) => {
      tx.colorSpace = THREE.SRGBColorSpace;
      tx.userData.cover = true;
      tx.userData.focusX = 0.75; // на узком экране сохраняем кролика справа
      this.scene.background = tx;
      this.scene.fog.density = 0.015;
      this.forge.intensity = 0; this.floor.visible = false;
      this.slabs.forEach((m) => { m.visible = false; });
      this.smoke.forEach((m) => { m.material.opacity = 0.07; });
      this.hasImage = true;
    }, undefined, () => {});
    this.scene.fog = new THREE.FogExp2('#0b0710', 0.05);

    const floorT = surfaceTextures('#0a080d', '#1c1822', 10, 77, 6, 1.1, 1.2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ ...floorT, metalness: 0.5, roughness: 0.55 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2;
    this.scene.add(floor);
    this.floor = floor;

    this.scene.add(new THREE.HemisphereLight('#5a3d8a', '#0a0604', 0.6));
    this.forge = new THREE.PointLight('#ff8a2a', 60, 20, 1.6); this.forge.position.set(3, -1, 1); this.scene.add(this.forge);
    const violet = new THREE.PointLight('#8b5cf6', 80, 25, 1.4); violet.position.set(-5, 3, -2); this.scene.add(violet);

    // Золотые парящие плиты — отсылка к игровому полю
    this.slabs = [];
    const gold = new THREE.MeshStandardMaterial({ color: '#d9b25f', metalness: 1, roughness: 0.28, emissive: '#3a2506', emissiveIntensity: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: '#18141e', metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.9), i % 3 === 0 ? gold : dark);
      m.position.set(1.5 + (i % 3) * 1.05, -1.3 + Math.floor(i / 3) * 0.02, -1 + Math.floor(i / 3) * 1.05);
      m.userData.ph = Math.random() * 6;
      this.slabs.push(m); this.scene.add(m);
    }
    this.embers = embers(500, '#ffb347', 18);
    this.violetDust = embers(200, '#a78bfa', 18, 0.05);
    this.scene.add(this.embers, this.violetDust);
    const smoke = smokeTexture(5);
    this.smoke = [];
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: smoke, color: i % 2 ? '#6a4a9a' : '#5a4030', transparent: true, opacity: 0.18, depthWrite: false }));
      s.position.set((Math.random() - 0.5) * 14, -1 + Math.random() * 3, -3 - Math.random() * 4);
      s.userData.v = 0.1 + Math.random() * 0.2;
      this.smoke.push(s); this.scene.add(s);
    }
    this.mouse = new THREE.Vector2();
    this._mm = (e) => this.mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    addEventListener('pointermove', this._mm);
  }

  update(dt, t) {
    this.embers.userData.update(dt, t);
    this.violetDust.userData.update(dt, t);
    for (const s of this.smoke) { s.position.x += s.userData.v * dt; s.rotation.z += dt * 0.02; if (s.position.x > 9) s.position.x = -9; }
    for (const m of this.slabs) m.position.y = -1.3 + Math.sin(t * 0.8 + m.userData.ph) * 0.08;
    if (!this.hasImage) this.forge.intensity = 55 + Math.sin(t * 7) * 6 + Math.random() * 8;
    this.camera.position.x += (this.mouse.x * 0.6 - this.camera.position.x) * 0.04;
    this.camera.position.y += (1.2 - this.mouse.y * 0.4 - this.camera.position.y) * 0.04;
    this.camera.lookAt(0, 0.4, 0);
  }

  dispose() { removeEventListener('pointermove', this._mm); }
}

// Студия профиля: аватар на пьедестале, крутится мышью.
export class ProfileWorld {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);
    this.bloom = 0.25;
    this.scene.fog = new THREE.Fog('#050409', 8, 22);
    // студийная схема для реалистичного лица: тёплый боковой ключ, холодная мягкая заливка, контровые
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#1a1208', 0.12));
    const key = new THREE.SpotLight('#ffe6c8', 12, 20, 0.45, 0.6, 1.2); key.position.set(3.2, 3.4, 1.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.target.position.set(0, 1.3, 0); this.scene.add(key, key.target);
    const fill = new THREE.DirectionalLight('#bcd2ff', 0.28); fill.position.set(-3, 1.8, 2.5); this.scene.add(fill);
    this.rimA = new THREE.DirectionalLight('#d9b25f', 3); this.rimA.position.set(-3, 3, -3); this.scene.add(this.rimA);
    this.rimB = new THREE.DirectionalLight('#8b5cf6', 2); this.rimB.position.set(3, 2, -3); this.scene.add(this.rimB);

    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.25, 64), new THREE.MeshStandardMaterial({ color: '#15121a', metalness: 0.9, roughness: 0.3 }));
    ped.position.y = -0.125; ped.receiveShadow = true; this.scene.add(ped);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.015, 8, 96), new THREE.MeshBasicMaterial({ color: '#f6dc97' }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.005; this.scene.add(ring);
    this.ringMat = ring.material;
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.rotY = 0.35; this.dragging = false; this.vel = 0;
    this.embers = embers(160, '#ffcf70', 8, 0.04);
    this.scene.add(this.embers);

    this._down = (e) => { if (e.target.tagName === 'CANVAS') { this.dragging = true; this.lastX = e.clientX; } };
    this._move = (e) => { if (this.dragging) { this.vel = (e.clientX - this.lastX) * 0.01; this.rotY += this.vel; this.lastX = e.clientX; } };
    this._up = () => { this.dragging = false; };
    addEventListener('pointerdown', this._down);
    addEventListener('pointermove', this._move);
    addEventListener('pointerup', this._up);
    this.onResize();
  }

  setProfile(p) {
    this.lastProfile = p;
    if (p.person) ensurePerson(p).then(() => { if (this.lastProfile === p) this._place(p); });
    this._place(p);
  }

  _place(p) {
    if (this.avatar) this.holder.remove(this.avatar);
    this.avatar = buildAvatar(p);
    this.holder.add(this.avatar);
    const bg = BACKGROUNDS[p.background] || BACKGROUNDS.forge;
    this.scene.background = gradientTexture([[0, bg[1]], [0.55, bg[0]], [1, bg[1]]]);
    this.scene.fog.color.set(bg[1]);
    this.rimA.color.set(bg[2]);
    this.ringMat.color.set(bg[2]);
  }

  // Аватар в левой части экрана — справа панель редактора.
  onResize() {
    const narrow = innerWidth < 900;
    this.camera.position.set(0, 1.1, 3.9);
    this.camera.lookAt(0, 0.95, 0);
    this.camera.setViewOffset(innerWidth, innerHeight, narrow ? 0 : innerWidth * 0.22, 0, innerWidth, innerHeight);
  }

  update(dt, t) {
    if (!this.dragging) { this.vel *= 0.95; this.rotY += this.vel + dt * 0.12; }
    this.holder.rotation.y = this.rotY;
    this.avatar?.userData.update?.(t);
    this.embers.userData.update(dt, t);
  }

  dispose() {
    removeEventListener('pointerdown', this._down);
    removeEventListener('pointermove', this._move);
    removeEventListener('pointerup', this._up);
  }
}
