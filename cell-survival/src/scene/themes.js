import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCellTextures, surfaceTextures, gradientTexture, softDot, makeNoise, smokeTexture, memoTextures } from './textures.js';
import { ASSETS } from '../paths.js';

// Пять утверждённых тем (п.35 ТЗ). Каждая строит окружение вокруг поля
// и отдаёт материалы клеток и цвета эффектов. Менять состав тем — только с разрешения.
export const THEMES = {
  desert: { name: { ru: 'Пустыня — Заброшенный город', en: 'Desert — Abandoned City' }, accent: '#ffb347', glow: '#ffcf70', fx: ['#e8c48a', '#ffb347'], bloom: 0.55, grade: { lift: [0.03, 0.012, 0], gain: [1.06, 1.0, 0.9], sat: 1.1, contrast: 1.08, vignette: 0.45 } },
  space: { name: { ru: 'Космос — Космическая станция', en: 'Space — Orbital Station' }, accent: '#3da9ff', glow: '#7cc8ff', fx: ['#9fd8ff', '#3da9ff'], bloom: 0.85, grade: { lift: [0, 0.01, 0.035], gain: [0.95, 1.0, 1.08], sat: 1.08, contrast: 1.1, vignette: 0.5 } },
  bunker: { name: { ru: 'Бункер — Секретный объект', en: 'Bunker — Secret Facility' }, accent: '#ff2a2a', glow: '#ff5a3a', fx: ['#9a9590', '#ff6a2a'], bloom: 0.8, grade: { lift: [0.03, 0, 0], gain: [1.05, 0.96, 0.92], sat: 1.05, contrast: 1.12, vignette: 0.55 } },
  jungle: { name: { ru: 'Джунгли — Затерянный храм', en: 'Jungle — Lost Temple' }, accent: '#e8b54a', glow: '#ffd27a', fx: ['#7d8a5f', '#ffb347'], bloom: 0.6, grade: { lift: [0.005, 0.02, 0.005], gain: [1.02, 1.04, 0.94], sat: 1.12, contrast: 1.07, vignette: 0.45 } },
  iceberg: { name: { ru: 'Айсберг — Ледяная база', en: 'Iceberg — Ice Base' }, accent: '#5fe1ff', glow: '#a8f0ff', fx: ['#e9f8ff', '#7fe8ff'], bloom: 0.75, grade: { lift: [0, 0.015, 0.035], gain: [0.94, 1.0, 1.08], sat: 1.04, contrast: 1.08, vignette: 0.42 } },
};
export const THEME_IDS = Object.keys(THEMES);

const std = (o) => new THREE.MeshStandardMaterial(o);
const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
function place(group, mesh, x, y, z, ry = 0) { mesh.position.set(x, y, z); mesh.rotation.y = ry; group.add(shadowed(mesh)); return mesh; }

// Частицы атмосферы: пыль, снег, искры, звёзды.
function particles(count, spread, color, size, opts = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread[0];
    pos[i * 3 + 1] = opts.yMin !== undefined ? opts.yMin + Math.random() * spread[1] : (Math.random() - 0.5) * spread[1];
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread[2];
    vel[i * 3] = (opts.vx || 0) + (Math.random() - 0.5) * (opts.jitter || 0.1);
    vel[i * 3 + 1] = (opts.vy || 0) + (Math.random() - 0.5) * (opts.jitter || 0.1);
    vel[i * 3 + 2] = (opts.vz || 0) + (Math.random() - 0.5) * (opts.jitter || 0.1);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: softDot('#ffffff'), color, size, transparent: true, opacity: opts.opacity ?? 0.7, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  const yMin = opts.yMin ?? -spread[1] / 2, yMax = yMin + spread[1];
  pts.userData.update = (dt) => {
    if (opts.static) return;
    for (let i = 0; i < count; i++) {
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < yMin) pos[i * 3 + 1] = yMax;
      if (pos[i * 3 + 1] > yMax) pos[i * 3 + 1] = yMin;
      if (Math.abs(pos[i * 3]) > spread[0] / 2) pos[i * 3] *= -0.98;
      if (Math.abs(pos[i * 3 + 2]) > spread[2] / 2) pos[i * 3 + 2] *= -0.98;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}

function fogSheets(group, color, count, radius, y, opacity) {
  const tex = smokeTexture(7);
  const sheets = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false }));
    const a = Math.random() * Math.PI * 2, r = radius * (0.5 + Math.random() * 0.6);
    m.position.set(Math.cos(a) * r, y + Math.random() * 2, Math.sin(a) * r);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6;
    m.userData.spin = (Math.random() - 0.5) * 0.04;
    group.add(m);
    sheets.push(m);
  }
  return (dt) => sheets.forEach((s) => { s.rotation.z += s.userData.spin * dt; });
}

function displacedGround(size, seg, amp, noiseScale, material, y) {
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  const noise = makeNoise(42);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), yy = p.getY(i);
    const d = Math.hypot(x, yy);
    const k = Math.min(1, Math.max(0, (d - 7) / 6));
    p.setZ(i, (noise(x / noiseScale + 10, yy / noiseScale + 10, 4) - 0.5) * amp * (0.3 + k));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

// ---------- Окружения ----------
function buildDesert(g, ctx) {
  ctx.background = gradientTexture([[0, '#1a0f07'], [0.45, '#6b3a17'], [0.62, '#c9803b'], [0.7, '#3a2210'], [1, '#0e0804']]);
  ctx.fog = new THREE.FogExp2('#4a2c14', 0.035);
  g.add(new THREE.HemisphereLight('#ffd9a0', '#3a2410', 0.9));
  const sun = new THREE.DirectionalLight('#ffb870', 3.2);
  sun.position.set(7, 9, -8); ctx.shadowLight(sun); g.add(sun); // солнце справа сзади, как на заднике
  const sand = surfaceTextures('#7a5530', '#caa26a', 8, 5, 10, 1.1, 2);
  g.add(displacedGround(80, 120, 3.5, 9, std({ ...sand, roughness: 0.95 }), -3.5));
  const stone = surfaceTextures('#6e4a26', '#b98c56', 6, 9, 2, 1.4, 3);
  const stoneM = std({ ...stone, roughness: 0.9 });
  // колонны (часть обрушена) и обломки стен по кругу
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2;
    const r = 10 + Math.random() * 6;
    const h = 2 + Math.random() * 8;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, h, 16, 1), stoneM);
    place(g, col, Math.cos(a) * r, -3.5 + h / 2, Math.sin(a) * r);
    col.rotation.z = (Math.random() - 0.5) * 0.15;
    place(g, new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), stoneM), Math.cos(a) * r, -3.3, Math.sin(a) * r);
    if (h > 6) place(g, new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), stoneM), Math.cos(a) * r, -3.5 + h + 0.17, Math.sin(a) * r);
  }
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, r = 13 + Math.random() * 10;
    const w = new THREE.Mesh(new THREE.BoxGeometry(3 + Math.random() * 4, 2 + Math.random() * 6, 0.8), stoneM);
    place(g, w, Math.cos(a) * r, -1.5, Math.sin(a) * r, a + Math.PI / 2);
  }
  // арка за полем
  const arch = new THREE.Mesh(new THREE.TorusGeometry(4, 0.6, 12, 32, Math.PI), stoneM);
  place(g, arch, 0, 2.5, -15);
  for (const sx of [-4, 4]) place(g, new THREE.Mesh(new THREE.BoxGeometry(1.3, 6, 1.3), stoneM), sx, -0.5, -15);
  ctx.addUpdate(particles(500, [40, 12, 40], '#e8c48a', 0.12, { vx: 0.8, jitter: 0.3, opacity: 0.35 }));
  ctx.addUpdateFn(fogSheets(g, '#c08a4a', 8, 12, -2.5, 0.12));
}

function planetTexture() {
  const S = 512, noise = makeNoise(17);
  const c = document.createElement('canvas'); c.width = S * 2; c.height = S;
  const gx = c.getContext('2d'); const img = gx.createImageData(S * 2, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S * 2; x++) {
    const land = noise(x / S * 3, y / S * 3, 6, 6);
    const cloud = noise(x / S * 6 + 50, y / S * 8, 5, 12);
    let col = land > 0.52 ? [40 + land * 90, 90 + land * 60, 40] : [10, 40 + land * 60, 110 + land * 90];
    const lat = Math.abs(y / S - 0.5) * 2;
    if (lat > 0.85) col = [230, 240, 250];
    const cl = Math.max(0, cloud - 0.5) * 2.4;
    col = col.map((v) => v + (255 - v) * Math.min(1, cl));
    const i = (y * S * 2 + x) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  gx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildSpace(g, ctx) {
  ctx.background = new THREE.Color('#010207');
  ctx.fog = new THREE.FogExp2('#020612', 0.018);
  g.add(new THREE.HemisphereLight('#6aa8ff', '#05070d', 0.5));
  const key = new THREE.DirectionalLight('#dbe8ff', 2.4);
  key.position.set(8, 10, 4); ctx.shadowLight(key); g.add(key);
  const metal = surfaceTextures('#0b0e12', '#1a1f26', 16, 3, 8, 0.7, 0.8);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), std({ ...metal, metalness: 0.6, roughness: 0.55 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3; floor.receiveShadow = true; g.add(floor);
  // рёбра станции и светящиеся полосы
  const ribM = std({ color: '#2a303a', metalness: 0.9, roughness: 0.35 });
  const lightM = std({ color: '#0a1a2a', emissive: '#3da9ff', emissiveIntensity: 3 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14, 0.8), ribM);
    place(g, rib, Math.cos(a) * 16, 4, Math.sin(a) * 16, -a);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 12, 0.12), lightM);
    place(g, strip, Math.cos(a) * 15.5, 4, Math.sin(a) * 15.5);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 0.5, 12, 80), ribM);
  ring.rotation.x = Math.PI / 2; ring.position.y = 11; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.08, 8, 80), lightM);
  ring2.rotation.x = Math.PI / 2; ring2.position.y = -2.9; g.add(ring2);
  // панели-консоли по периметру
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const con = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.2, 0.8, 3, 0.1), ribM);
    place(g, con, Math.cos(a) * 12.5, -2.4, Math.sin(a) * 12.5, -a + Math.PI / 2);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.6), std({ color: '#000', emissive: i % 3 ? '#3da9ff' : '#8b5cf6', emissiveIntensity: 1.6 }));
    screen.position.set(Math.cos(a) * 12.05, -2.1, Math.sin(a) * 12.05); screen.lookAt(0, -2.1, 0); g.add(screen);
  }
  // планета за «иллюминатором»
  const planet = new THREE.Mesh(new THREE.SphereGeometry(14, 64, 48), std({ map: memoTextures('planet', () => ({ t: planetTexture() })).t, roughness: 0.9 }));
  planet.position.set(-18, -4, -48); g.add(planet);
  const atm = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('#4aa3ff'), color: '#4aa3ff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  atm.scale.set(40, 40, 1); atm.position.copy(planet.position); g.add(atm);
  const sunL = new THREE.PointLight('#bcd8ff', 400, 120); sunL.position.set(20, 20, -40); g.add(sunL);
  ctx.addUpdate(particles(1500, [220, 120, 220], '#ffffff', 0.35, { static: true, opacity: 0.9 }));
  ctx.addUpdateFn((dt) => { planet.rotation.y += dt * 0.01; });
}

function buildBunker(g, ctx) {
  ctx.background = new THREE.Color('#050404');
  ctx.fog = new THREE.FogExp2('#0d0706', 0.045);
  g.add(new THREE.HemisphereLight('#8a7a70', '#0a0505', 0.35));
  const key = new THREE.DirectionalLight('#ffe2c0', 1.6);
  key.position.set(3, 12, 6); ctx.shadowLight(key); g.add(key);
  const conc = surfaceTextures('#2e2d2b', '#5f5d58', 10, 21, 6, 1.3, 2.5);
  const concM = std({ ...conc, roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), concM);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3; floor.receiveShadow = true; g.add(floor);
  // стены-коробка
  for (const [x, z, ry] of [[0, -16, 0], [-16, 0, Math.PI / 2], [16, 0, -Math.PI / 2]]) {
    place(g, new THREE.Mesh(new THREE.BoxGeometry(34, 18, 1), concM), x, 6, z, ry);
  }
  const metalM = std({ color: '#3b3e42', metalness: 0.85, roughness: 0.45 });
  // гермодверь
  const door = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.8, 48), metalM);
  door.rotation.x = Math.PI / 2; place(g, door, 0, 2.5, -15.2); door.rotation.x = Math.PI / 2;
  const doorRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.3, 12, 48), std({ color: '#1a1b1d', metalness: 0.9, roughness: 0.3 }));
  doorRing.position.set(0, 2.5, -14.8); g.add(doorRing);
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.4), metalM);
    const a = (i / 8) * Math.PI * 2; b.position.set(Math.cos(a) * 3.2, 2.5 + Math.sin(a) * 3.2, -14.6); b.rotation.z = a; g.add(b);
  }
  // колонны, трубы, кабели
  for (const x of [-10, 10]) for (const z of [-10, 0, 8]) place(g, new THREE.Mesh(new THREE.BoxGeometry(1.4, 18, 1.4), concM), x, 6, z);
  const pipeM = std({ color: '#5a4a3a', metalness: 0.7, roughness: 0.5 });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18 + i * 0.03, 0.18 + i * 0.03, 34, 12), i % 2 ? pipeM : metalM);
    p.rotation.z = Math.PI / 2; p.position.set(0, 7 + i * 0.6, -15.3 + i * 0.2); g.add(p);
    const q = p.clone(); q.rotation.set(Math.PI / 2, 0, 0); q.position.set(-15.2 + i * 0.3, 8 + i * 0.5, 0); g.add(q);
  }
  const cableM = std({ color: '#0c0c0c', roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-15, 9 - i * 0.3, -8 + i * 3), new THREE.Vector3(-12, 3 - i * 0.2, -6 + i * 3), new THREE.Vector3(-8, -2.9, -3 + i * 2)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.06, 6), cableM));
  }
  // полосы опасности у пропасти и ящики
  const crateM = std({ color: '#2c3226', roughness: 0.8 });
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 4;
    place(g, new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.2, 1.2, 2, 0.05), crateM), Math.cos(a) * r, -2.4, Math.sin(a) * r, Math.random());
  }
  // аварийные красные маяки — вращаются
  const beacons = [];
  for (const [x, z] of [[-14, -14], [14, -14], [-14, 10], [14, 10]]) {
    const l = new THREE.SpotLight('#ff2020', 180, 40, 0.5, 0.6, 1.2);
    l.position.set(x, 9, z); g.add(l); g.add(l.target);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), std({ color: '#300', emissive: '#ff2020', emissiveIntensity: 4 }));
    lamp.position.copy(l.position); g.add(lamp);
    beacons.push({ l, lamp, x, z, ph: Math.random() * 6 });
  }
  let t = 0;
  ctx.addUpdateFn((dt) => {
    t += dt;
    for (const b of beacons) {
      const a = t * 2 + b.ph;
      b.l.target.position.set(b.x + Math.cos(a) * 12, -3, b.z + Math.sin(a) * 12);
      const on = 0.6 + 0.4 * Math.sin(t * 6 + b.ph);
      b.lamp.material.emissiveIntensity = 2 + on * 3;
    }
    key.intensity = Math.random() > 0.985 ? 0.3 : 1.6; // мерцание ламп
  });
  ctx.addUpdate(particles(400, [34, 14, 34], '#b0a090', 0.08, { vy: -0.05, jitter: 0.1, opacity: 0.3 }));
}

function buildJungle(g, ctx) {
  ctx.background = gradientTexture([[0, '#020604'], [0.5, '#0b1f12'], [0.72, '#1c3a22'], [1, '#020403']]);
  ctx.fog = new THREE.FogExp2('#0d1f14', 0.032);
  g.add(new THREE.HemisphereLight('#bfe3a0', '#0b140a', 0.6));
  const key = new THREE.DirectionalLight('#ffe0a0', 1.8);
  key.position.set(-6, 12, 5); ctx.shadowLight(key); g.add(key);
  const stone = surfaceTextures('#2f352a', '#6f7563', 7, 31, 3, 1.3, 3);
  const stoneM = std({ ...stone, roughness: 0.85 });
  const ground = surfaceTextures('#0f1a0c', '#2c3d1f', 8, 33, 10, 1.2, 2);
  g.add(displacedGround(80, 100, 2.5, 6, std({ ...ground, roughness: 1 }), -3.5));
  // ступенчатый храм за полем
  for (let i = 0; i < 6; i++) place(g, new THREE.Mesh(new THREE.BoxGeometry(22 - i * 3, 1.6, 8 - i * 0.6), stoneM), 0, -2.7 + i * 1.6, -17 - i * 0.6);
  place(g, new THREE.Mesh(new THREE.BoxGeometry(4, 4, 3), stoneM), 0, 8.5, -20.5);
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), std({ color: '#000', emissive: '#ffae3a', emissiveIntensity: 0.6 }));
  doorway.position.set(0, 8, -18.98); g.add(doorway);
  // статуи-стражи
  for (const sx of [-1, 1]) for (const z of [-9, 1]) {
    const st = new THREE.Group();
    st.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.6), stoneM)));
    const bodyS = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 3, 8), stoneM)); bodyS.position.y = 2; st.add(bodyS);
    const headS = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 1), stoneM)); headS.position.y = 4.1; st.add(headS);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.05), std({ color: '#000', emissive: '#ffcf70', emissiveIntensity: 2.5 }));
    eyes.position.set(0, 4.2, 0.52); st.add(eyes);
    st.position.set(sx * 11, -3, z); st.rotation.y = -sx * Math.PI / 2; g.add(st);
  }
  // факелы с живым огнём
  const flames = [];
  for (const [x, z] of [[-8, -12], [8, -12], [-12, -3], [12, -3], [-10, 7], [10, 7]]) {
    place(g, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.6, 8), std({ color: '#2a1a0c' })), x, -2.2, z);
    const light = new THREE.PointLight('#ff9a3a', 25, 14, 1.6); light.position.set(x, -0.5, z); g.add(light);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot('#ffb347'), color: '#ffae40', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    fl.position.set(x, -0.6, z); fl.scale.set(0.9, 1.3, 1); g.add(fl);
    flames.push({ light, fl, ph: Math.random() * 10 });
  }
  // листва: инстансы вытянутых листьев
  const leafM = std({ color: '#1f3a17', roughness: 0.7, side: THREE.DoubleSide });
  const leafGeo = new THREE.PlaneGeometry(0.6, 2.4); leafGeo.translate(0, 1.2, 0);
  const leaves = new THREE.InstancedMesh(leafGeo, leafM, 900);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < 900; i++) {
    // листва — по бокам и позади поля, перед камерой пусто
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5, r = 10 + Math.random() * 14;
    p.set(Math.cos(a) * r, -3.3, Math.sin(a) * r);
    e.set((Math.random() - 0.5) * 1.4, Math.random() * 6, (Math.random() - 0.5) * 1.4); q.setFromEuler(e);
    const k = 0.6 + Math.random() * 1.6; s.set(k, k, k);
    m4.compose(p, q, s); leaves.setMatrixAt(i, m4);
    leaves.setColorAt(i, new THREE.Color().setHSL(0.28 + Math.random() * 0.06, 0.5, 0.12 + Math.random() * 0.12));
  }
  leaves.castShadow = true; g.add(leaves);
  // водопад слева
  const wc = document.createElement('canvas'); wc.width = 64; wc.height = 256;
  const wg = wc.getContext('2d');
  for (let i = 0; i < 200; i++) { wg.fillStyle = `rgba(220,240,255,${Math.random() * 0.5})`; wg.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 2, 20 + Math.random() * 60); }
  const wt = new THREE.CanvasTexture(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(3, 1);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(5, 18), new THREE.MeshBasicMaterial({ map: wt, transparent: true, opacity: 0.8, depthWrite: false, color: '#cfe8ff' }));
  fall.position.set(-16, 5, -12); fall.rotation.y = Math.PI / 4; g.add(fall);
  place(g, new THREE.Mesh(new THREE.BoxGeometry(8, 22, 4), stoneM), -18.5, 4, -14, Math.PI / 4);
  const mist = particles(200, [6, 3, 6], '#dfefff', 0.6, { vy: 0.3, jitter: 0.4, opacity: 0.18, yMin: -3.5 });
  mist.position.set(-15, 0, -11); ctx.addUpdate(mist);
  let t = 0;
  ctx.addUpdateFn((dt) => {
    t += dt;
    wt.offset.y += dt * 1.4;
    for (const f of flames) { const k = 0.75 + Math.sin(t * 13 + f.ph) * 0.12 + Math.random() * 0.13; f.light.intensity = 25 * k; f.fl.scale.set(0.9 * k, 1.4 * k, 1); }
  });
  ctx.addUpdate(particles(250, [30, 8, 30], '#ffcf70', 0.07, { vy: 0.15, jitter: 0.3, opacity: 0.6, additive: true, yMin: -3 }));
  ctx.addUpdateFn(fogSheets(g, '#5a8a60', 8, 12, -2.8, 0.1));
}

function buildIceberg(g, ctx) {
  ctx.background = gradientTexture([[0, '#01040a'], [0.5, '#0c2336'], [0.68, '#3f6f8e'], [0.75, '#0b1a26'], [1, '#02060a']]);
  ctx.fog = new THREE.FogExp2('#16293a', 0.03);
  g.add(new THREE.HemisphereLight('#9fc4e0', '#0a121a', 0.45));
  const key = new THREE.DirectionalLight('#cfe6ff', 1.5);
  key.position.set(6, 12, 8); ctx.shadowLight(key); g.add(key);
  const snow = surfaceTextures('#5f7589', '#b4c6d4', 8, 51, 10, 1, 1.5);
  g.add(displacedGround(90, 120, 3, 8, std({ ...snow, roughness: 0.9 }), -3.5));
  const iceM = new THREE.MeshPhysicalMaterial({ color: '#8fd3f0', roughness: 0.15, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.88, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 12;
    const geo = new THREE.IcosahedronGeometry(2 + Math.random() * 3, 1);
    const pp = geo.attributes.position; for (let k = 0; k < pp.count; k++) pp.setXYZ(k, pp.getX(k) * (0.7 + Math.random() * 0.5), pp.getY(k) * (1 + Math.random() * 1.2), pp.getZ(k) * (0.7 + Math.random() * 0.5));
    geo.computeVertexNormals();
    place(g, new THREE.Mesh(geo, iceM), Math.cos(a) * r, -2 + Math.random() * 2, Math.sin(a) * r, Math.random() * 6);
  }
  // исследовательская база: модули, окна, вертолётная площадка
  const hullM = std({ color: '#c8ccd0', metalness: 0.6, roughness: 0.4 });
  const winM = std({ color: '#000', emissive: '#ffd79a', emissiveIntensity: 2 });
  for (const [x, z, w, h] of [[-11, -12, 6, 3], [-4, -15, 5, 4], [6, -14, 7, 3]]) {
    place(g, new THREE.Mesh(new RoundedBoxGeometry(w, h, 3, 3, 0.2), hullM), x, -3.5 + h / 2 + 0.6, z);
    for (let k = 0; k < Math.floor(w / 1.4); k++) { const wi = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), winM); wi.position.set(x - w / 2 + 0.9 + k * 1.4, -3.5 + h / 2 + 0.9, z + 1.52); g.add(wi); }
    for (const sx of [-1, 1]) place(g, new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8), hullM), x + sx * (w / 2 - 0.4), -3.2, z);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 9, 8), hullM); place(g, mast, 11, 1, -10);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), std({ color: '#300', emissive: '#ff3030', emissiveIntensity: 4 })); beacon.position.set(11, 5.6, -10); g.add(beacon);
  const padC = document.createElement('canvas'); padC.width = padC.height = 256;
  const pg = padC.getContext('2d'); pg.fillStyle = '#2a3036'; pg.fillRect(0, 0, 256, 256);
  pg.strokeStyle = '#ffd23a'; pg.lineWidth = 10; pg.beginPath(); pg.arc(128, 128, 110, 0, Math.PI * 2); pg.stroke();
  pg.fillStyle = '#f2f2f2'; pg.font = 'bold 150px sans-serif'; pg.textAlign = 'center'; pg.textBaseline = 'middle'; pg.fillText('H', 128, 136);
  const padT = new THREE.CanvasTexture(padC); padT.colorSpace = THREE.SRGBColorSpace;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.3, 48), [hullM, std({ map: padT, roughness: 0.8 }), hullM]);
  place(g, pad, 14, -3.2, 2);
  // прожекторы, скользящие по полю
  const lights = [];
  for (const [x, z] of [[-13, 8], [13, -6]]) {
    const l = new THREE.SpotLight('#dff4ff', 90, 60, 0.16, 0.5, 1.2);
    l.position.set(x, 10, z); g.add(l); g.add(l.target);
    lights.push({ l, ph: Math.random() * 6 });
  }
  let t = 0;
  ctx.addUpdateFn((dt) => {
    t += dt;
    for (const s of lights) s.l.target.position.set(Math.sin(t * 0.4 + s.ph) * 7, -1, Math.cos(t * 0.3 + s.ph) * 5);
    beacon.material.emissiveIntensity = Math.sin(t * 4) > 0.6 ? 6 : 0.5;
  });
  ctx.addUpdate(particles(1400, [44, 18, 44], '#dff2ff', 0.07, { vx: -1.6, vy: -0.9, jitter: 0.5, opacity: 0.6 }));
  ctx.addUpdateFn(fogSheets(g, '#a8c8e0', 10, 13, -2.6, 0.08));
}

const BUILDERS = { desert: buildDesert, space: buildSpace, bunker: buildBunker, jungle: buildJungle, iceberg: buildIceberg };

// Атмосфера над полем: крупные пылинки/снежинки/светлячки между камерой и полем — глубина кадра.
// (Лучи света пробовал: камера смотрит почти сверху, вертикальные лучи уходят за кадр; на задниках лучи уже нарисованы.)
const MOTES = {
  desert: ['#f3d3a0', 170, 0.22, { vx: 0.7, vy: 0.04, jitter: 0.25, opacity: 0.45 }],
  space: ['#bfe0ff', 110, 0.12, { vy: 0.06, jitter: 0.1, opacity: 0.7, additive: true }],
  bunker: ['#c8b8a8', 150, 0.17, { vy: -0.08, jitter: 0.12, opacity: 0.4 }],
  jungle: ['#ffd27a', 90, 0.19, { vy: 0.12, jitter: 0.3, opacity: 0.8, additive: true }],
  iceberg: ['#ffffff', 280, 0.24, { vx: -1.1, vy: -0.8, jitter: 0.4, opacity: 0.75 }],
};
function atmosphere(themeId, ctx) {
  const m = MOTES[themeId];
  if (!m) return;
  const [col, n, size, opts] = m;
  ctx.addUpdate(particles(n, [18, 6, 14], col, size, { ...opts, yMin: 0 }));
}

export function buildEnvironment(themeId, scene, onBackdrop) {
  const group = new THREE.Group();
  const updates = [];
  const ctx = {
    background: null, fog: null,
    shadowLight(l) {
      l.castShadow = true;
      l.shadow.mapSize.set(2048, 2048);
      const c = l.shadow.camera; c.left = -9; c.right = 9; c.top = 9; c.bottom = -9; c.near = 1; c.far = 40;
      l.shadow.bias = -0.0005;
    },
    addUpdate(obj) { group.add(obj); updates.push(obj.userData.update); },
    addUpdateFn(fn) { updates.push(fn); },
  };
  BUILDERS[themeId](group, ctx);
  scene.background = ctx.background;
  scene.fog = ctx.fog;
  // Нарисованный задник темы (ASSETS.md): картинка становится окружением, процедурные декорации
  // прячутся, остаются свет и частицы. Клетки стоят на нарисованной площадке и бросают на неё тень.
  new THREE.TextureLoader().load(`${ASSETS}${themeId}/backdrop.jpg`, (tx) => {
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.userData.cover = true;
    if (scene.background?.isTexture) scene.background.dispose();
    scene.background = tx;
    scene.fog = null;
    group.traverse((o) => {
      if ((o.isMesh || o.isSprite) && !o.isPoints) o.visible = false;
      if (o.isHemisphereLight) o.intensity *= 0.45; // картинка тёмная — рассеянный свет не должен высветлять клетки
    });
    // пылинки над полем (atmosphere) убраны 25.09 по слову оператора — лишняя анимация
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.45 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = -0.17;
    catcher.receiveShadow = true;
    group.add(catcher);
    onBackdrop?.();
  }, undefined, () => {});
  scene.add(group);
  return { group, update: (dt, t) => updates.forEach((u) => u(dt, t)) };
}

// Материалы клеток темы: 4 варианта поверхности, боковина — тёмная версия.
export function cellMaterials(themeId) {
  const th = THEMES[themeId];
  const conf = {
    desert: { rough: 0.85, metal: 0, side: '#4a311a' },
    space: { rough: 0.35, metal: 0.8, side: '#15191f' },
    bunker: { rough: 0.9, metal: 0.1, side: '#252422' },
    jungle: { rough: 0.8, metal: 0, side: '#22271e' },
    iceberg: { rough: 0.2, metal: 0.1, side: '#1c2e3e' },
  }[themeId];
  const tops = [0, 1, 2, 3].map((v) => {
    const t = makeCellTextures(themeId, v);
    const M = themeId === 'iceberg' ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const extra = themeId === 'iceberg' ? { clearcoat: 1, clearcoatRoughness: 0.1 } : {};
    return new M({ ...t, roughness: conf.rough, metalness: conf.metal, emissive: new THREE.Color(th.glow), emissiveIntensity: 0.0, ...extra });
  });
  const side = new THREE.MeshStandardMaterial({ color: conf.side, roughness: conf.rough, metalness: conf.metal });
  const photoReady = addPhotoDetail(themeId, tops, side, conf);
  return { photoReady, tops, side, accent: new THREE.Color(th.accent), glow: new THREE.Color(th.glow), fx: th.fx.map((c) => new THREE.Color(c)) };
}

// Фактура клеток из фото-материалов Poly Haven (CC0): assets/cells/<тема>_diff.jpg / _rough.jpg.
// Рисунок темы (гравировка, свечение) остаётся — фото накладывается «перекрытием» и даёт настоящий камень/металл/лёд.
// У каждого варианта клетки свой участок фото, чтобы соседние клетки не были одинаковыми.
const photoCache = new Map();
const photoMemo = new Map(); // тема:вариант → составленная фактура (считается один раз)
const PHOTO_MIX = { iceberg: 0.35, desert: 0.55 }; // лёд должен остаться синим — фото только прожилками
function loadPhoto(url) {
  if (!photoCache.has(url)) photoCache.set(url, new THREE.ImageLoader().loadAsync(url).catch(() => null));
  return photoCache.get(url);
}
function addPhotoDetail(themeId, tops, side, conf) {
  return Promise.all([loadPhoto(`${ASSETS}cells/${themeId}_diff.jpg`), loadPhoto(`${ASSETS}cells/${themeId}_rough.jpg`)]).then(([diff, rough]) => {
    if (!diff) return;
    const S = 512;
    const piece = (img, v, g) => { const o = (v * 0.37) % 1; g.drawImage(img, -o * S, -((v * 0.61) % 1) * S, S * 2, S * 2); };
    tops.forEach((m, v) => {
      const base = m.map?.image;
      if (!base) return;
      const done = photoMemo.get(themeId + ':' + v);
      if (done) { m.map.dispose(); m.map = done.map.clone(); if (done.rough) { m.roughnessMap = done.rough.clone(); m.roughness = Math.min(1, conf.rough * 1.3); } m.needsUpdate = true; return; }
      const c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d');
      g.drawImage(base, 0, 0, S, S);
      g.globalCompositeOperation = 'overlay'; g.globalAlpha = PHOTO_MIX[themeId] ?? 0.85;
      piece(diff, v, g);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      m.map.dispose(); m.map = t;
      if (rough) {
        const rc = document.createElement('canvas'); rc.width = rc.height = S;
        piece(rough, v, rc.getContext('2d'));
        m.roughnessMap = new THREE.CanvasTexture(rc);
        m.roughness = Math.min(1, conf.rough * 1.3);
      }
      photoMemo.set(themeId + ':' + v, { map: m.map, rough: m.roughnessMap || null });
      m.map = m.map.clone(); if (m.roughnessMap) m.roughnessMap = m.roughnessMap.clone(); // в памяти — образец, у материала — копия
      m.needsUpdate = true;
    });
    // бока клеток — та же фактура, темнее
    const sc = document.createElement('canvas'); sc.width = sc.height = 256;
    const sg = sc.getContext('2d'); sg.fillStyle = conf.side; sg.fillRect(0, 0, 256, 256);
    sg.globalCompositeOperation = 'overlay'; sg.globalAlpha = 0.9; sg.drawImage(diff, 0, 0, 256, 256);
    side.map = new THREE.CanvasTexture(sc); side.map.colorSpace = THREE.SRGBColorSpace; side.color.set('#ffffff'); side.needsUpdate = true;
  });
}
