// Броня героев по артам ChatGPT: пластины на груди, плечах, руках, ногах — жёсткие детали на костях,
// двигаются вместе с живыми движениями. Размер каждой детали меряется лучами по самой модели
// (у каждого человека своя фигура). Материалов на героя три (металл, отделка, свечение) — шейдеры общие.
import * as THREE from 'three';

// части и стиль по артам (см. assets/heroes/*_full.jpg)
export const ARMOR = {
  forge: { metal: '#3a322b', trim: '#c8962e', glow: '#ff7a1a', pattern: 'cracks', parts: ['chest', 'shoulders', 'bracers', 'gauntlets', 'thighs', 'knees', 'shins', 'boots', 'belt'], bulk: 1 },
  volta: { metal: '#16243f', trim: '#9fb4c8', glow: '#4ad8ff', pattern: 'lines', parts: ['chest', 'gauntlets', 'knees', 'shins', 'belt'], bulk: 0.85 },
  kronos: { metal: '#16120c', trim: '#d9a63a', glow: '#f2c14e', pattern: 'gold', parts: ['chest', 'shoulders', 'bracers', 'belt', 'collar'], bulk: 1 },
  abyss: { metal: '#0e0b16', trim: '#3b2a5c', glow: '#9b5cff', pattern: 'veins', parts: ['shoulders', 'bracers', 'gauntlets', 'shins', 'belt'], bulk: 1, spikes: true },
  frost: { metal: '#7fa6c2', trim: '#cfe6f5', glow: '#8fe8ff', pattern: 'frost', glowK: 0.6, parts: ['chest', 'shoulders', 'gauntlets', 'shins', 'belt'], bulk: 0.9, crystals: true },
  phoenix: { metal: '#5a0c10', trim: '#d9a63a', glow: '#ff5a1a', pattern: 'veins', parts: ['chest', 'shoulders', 'bracers', 'thighs', 'shins', 'belt'], bulk: 0.95 },
  bastion: { metal: '#5a616a', trim: '#8a2a22', glow: '#ff2a2a', pattern: 'lines', parts: ['chest', 'shoulders', 'bracers', 'gauntlets', 'thighs', 'knees', 'shins', 'boots', 'belt', 'collar'], bulk: 1.12 },
  neuron: { metal: '#0f2f31', trim: '#2c4a4c', glow: '#3dffd8', pattern: 'circuit', parts: ['chest', 'shoulders', 'bracers', 'knees', 'shins', 'belt'], bulk: 0.95 },
  graviton: { metal: '#221436', trim: '#4a2a6a', glow: '#c77dff', pattern: 'cracks', parts: ['chest', 'shoulders', 'gauntlets', 'shins', 'belt'], bulk: 0.9 },
  rune: { metal: '#15261b', trim: '#8a6a2a', glow: '#5dff9a', pattern: 'runes', parts: ['bracers', 'belt', 'collar'], bulk: 0.9 },
  phantom: { metal: '#5d646c', trim: '#8a939c', glow: '#cfe6ff', pattern: 'lines', parts: ['shoulders', 'bracers'], bulk: 0.85 },
  mirage: { metal: '#2a1040', trim: '#6a2a8a', glow: '#ff4fd8', pattern: 'lines', parts: ['chest', 'shoulders', 'gauntlets', 'belt'], bulk: 0.85 },
};

// ---------- текстуры пластин (рисуются кодом, одна на героя) ----------
const texCache = new Map();
function plateTextures(id, cfg) {
  if (texCache.has(id)) return texCache.get(id);
  const S = 256, rnd = mulberry(id.length * 97 + id.charCodeAt(0));
  const base = document.createElement('canvas'); base.width = base.height = S;
  const g = base.getContext('2d');
  g.fillStyle = cfg.metal; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) { // потёртости и зерно металла
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.06})`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1);
  }
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; // швы пластин
  for (let y = 64; y < S; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
  for (let y = 66; y < S; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  const emi = document.createElement('canvas'); emi.width = emi.height = S;
  const e = emi.getContext('2d'); e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  e.strokeStyle = e.fillStyle = cfg.glow; e.lineCap = 'round'; e.shadowColor = cfg.glow; e.shadowBlur = 6;
  const crack = (x, y, len, w) => { e.lineWidth = w; e.beginPath(); e.moveTo(x, y); for (let k = 0; k < len; k++) { x += (rnd() - 0.5) * 30; y += 8 + rnd() * 14; e.lineTo(x, y); if (rnd() < 0.25) crack(x, y, len - k - 1, w * 0.6); } e.stroke(); };
  switch (cfg.pattern) {
    case 'cracks': for (let i = 0; i < 12; i++) crack(rnd() * S, rnd() * S * 0.4, 8, 1.6); break;
    case 'veins': for (let i = 0; i < 8; i++) crack(rnd() * S, rnd() * S * 0.5, 6, 1.2); break;
    case 'lines': e.lineWidth = 1.6; for (let x = 24; x < S; x += 56) { e.beginPath(); e.moveTo(x, 0); e.lineTo(x, S); e.stroke(); } break;
    case 'circuit': e.lineWidth = 2; for (let i = 0; i < 14; i++) { let x = Math.round(rnd() * 8) * 32, y = Math.round(rnd() * 8) * 32; e.beginPath(); e.moveTo(x, y); for (let k = 0; k < 3; k++) { if (rnd() < 0.5) x += 32; else y += 32; e.lineTo(x, y); } e.stroke(); e.beginPath(); e.arc(x, y, 4, 0, Math.PI * 2); e.fill(); } break;
    case 'frost': e.lineWidth = 1.5; for (let i = 0; i < 10; i++) { const x = rnd() * S, y = rnd() * S; for (let a = 0; a < 6; a++) { e.beginPath(); e.moveTo(x, y); e.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 18); e.stroke(); } } break;
    case 'runes': e.lineWidth = 2.5; e.font = '28px serif'; for (let i = 0; i < 10; i++) e.fillText('ᚠᚱᚦᛟᛉᛗ'[i % 6], rnd() * S, rnd() * S); break;
    case 'gold': default: break;
  }
  const out = { map: new THREE.CanvasTexture(base), emissiveMap: new THREE.CanvasTexture(emi) };
  out.map.colorSpace = THREE.SRGBColorSpace; out.emissiveMap.colorSpace = THREE.SRGBColorSpace;
  for (const t of Object.values(out)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  texCache.set(id, out);
  return out;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const matCache = new Map();
function materials(id, cfg) {
  if (matCache.has(id)) return matCache.get(id);
  const t = plateTextures(id, cfg);
  const m = {
    plate: new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: '#ffffff', emissiveIntensity: cfg.pattern === 'gold' ? 0 : 1.6 * (cfg.glowK ?? 1), metalness: 0.85, roughness: 0.38, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: cfg.trim, metalness: 1, roughness: 0.3 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(cfg.glow).multiplyScalar(2.2), toneMapped: false }),
  };
  matCache.set(id, m);
  return m;
}

// ---------- сборка ----------
// ctx: { person, B, wp, up, fwd, meshes }
export function addArmor(heroId, person) {
  const cfg = ARMOR[heroId];
  if (!cfg) return;
  const M = materials(heroId, cfg);
  const B = (n) => person.getObjectByName(n);
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  person.updateMatrixWorld(true);
  // Лучи — по неподвижной копии тела (вершины со скелетом считаются один раз): луч по «живой» модели
  // пересчитывает скелет на каждый треугольник — десятки лучей на героя давали секунды рывков в начале испытания.
  const meshes = [];
  person.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry, n = g.attributes.position.count, arr = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3)); if (g.index) sg.setIndex(g.index);
    const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.updateMatrixWorld(true);
    meshes.push(m);
  });
  const up = new THREE.Vector3(0, 1, 0);
  const la = B('Bip01_L_UpperArm'), ra = B('Bip01_R_UpperArm');
  const fwd = new THREE.Vector3().crossVectors(wp(ra).sub(wp(la)).setY(0), up).normalize();
  const toe = B('Bip01_L_Toe0'), foot = B('Bip01_L_Foot');
  if (toe && foot && fwd.dot(wp(toe).sub(wp(foot)).setY(0)) < 0) fwd.negate();
  const ray = new THREE.Raycaster();
  // толщина тела в точке p поперёк оси axis: лучи с 6 сторон к оси, берём дальнюю поверхность
  const radiusAt = (p, axis, fallback, cap = 0.11) => {
    // лучи с 8 сторон к оси; попадания дальше cap — это соседняя часть тела (туловище рядом с рукой), их отбрасываем
    const side = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? fwd : up).normalize();
    const rs = [];
    for (let k = 0; k < 8; k++) {
      const d = side.clone().applyAxisAngle(axis, (k / 8) * Math.PI * 2);
      ray.set(p.clone().addScaledVector(d, cap), d.clone().negate()); ray.far = cap;
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit) { const r = cap - hit.distance; if (r > 0.01) rs.push(r); }
    }
    if (rs.length < 3) return fallback;
    rs.sort((a, b) => a - b);
    return rs[Math.floor(rs.length * 0.7)]; // верхняя часть распределения — чтобы пластина не врезалась в тело
  };
  const attach = (bone, obj) => { obj.traverse((o) => { if (o.isMesh) { o.castShadow = o.material !== M.glow; } }); person.updateMatrixWorld(true); bone.attach(obj); };
  const bulk = cfg.bulk;

  // расстояние от точки p до поверхности тела в направлении dir (луч снаружи внутрь)
  const surf = (p, dir, cap, fallback) => {
    ray.set(p.clone().addScaledVector(dir, cap), dir.clone().negate()); ray.far = cap;
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit && cap - hit.distance > 0.01 ? cap - hit.distance : fallback;
  };
  // система координат детали: Y — вдоль кости, Z — вперёд (к зрителю)
  const frame = (pos, axis) => {
    const z = fwd.clone().addScaledVector(axis, -fwd.dot(axis)).normalize(), x = new THREE.Vector3().crossVectors(axis, z);
    const g = new THREE.Group(); g.position.copy(pos); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, axis, z));
    return g;
  };
  // изогнутая пластина по профилю: радиус меняется по высоте (выпуклость), дуга — только спереди или вокруг
  const shell = (h, prof, arc) => {
    const pts = []; const N = 10;
    for (let k = 0; k <= N; k++) { const t = k / N; pts.push(new THREE.Vector2(prof(t), (t - 0.5) * h)); }
    const geo = new THREE.LatheGeometry(pts, 24, Math.PI - arc / 2 + Math.PI, arc); // дуга по центру смотрит в +Z
    return geo;
  };

  // щиток вдоль кости: от a до b (доля from…to)
  const sleeve = (boneName, childName, from, to, pad, opts = {}) => {
    const b = B(boneName), c = B(childName); if (!b || !c) return;
    const A = wp(b), Bp = wp(c), axis = Bp.clone().sub(A).normalize(), len = A.distanceTo(Bp);
    const p0 = A.clone().lerp(Bp, from), p1 = A.clone().lerp(Bp, to), mid = p0.clone().lerp(p1, 0.5);
    const r0 = radiusAt(p0, axis, 0.05) + pad * bulk, r1 = radiusAt(p1, axis, 0.045) + pad * bulk;
    const h = len * (to - from), arc = opts.arc ?? Math.PI * 1.35;
    const g = frame(mid, axis);
    // выпуклая пластина + вторая поменьше внахлёст — «сегментированная» броня
    const bulge = opts.bulge ?? 0.14;
    g.add(new THREE.Mesh(shell(h, (t) => (r0 + (r1 - r0) * t) * (1 + bulge * Math.sin(Math.PI * t)), arc), M.plate));
    const over = new THREE.Mesh(shell(h * 0.38, (t) => (r0 + (r1 - r0) * (0.62 + t * 0.38)) * (1 + bulge * 0.6) + 0.006, arc * 0.8), M.plate);
    over.position.y = h * 0.31; g.add(over);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(r1 * (1 + bulge * 0.2) + 0.004, 0.005, 6, 24, arc), M.trim);
    edge.rotation.set(Math.PI / 2, 0, Math.PI / 2 - arc / 2 - Math.PI / 2 + Math.PI); edge.position.y = h / 2; g.add(edge);
    if (opts.glowBand) { const band = new THREE.Mesh(new THREE.TorusGeometry((r0 + r1) / 2 * (1 + bulge) + 0.006, 0.004, 6, 24, arc * 0.7), M.glow); band.rotation.set(Math.PI / 2, 0, Math.PI / 2 - arc * 0.35 - Math.PI / 2 + Math.PI); band.position.y = -h * 0.12; g.add(band); }
    attach(b, g);
    return g;
  };

  const P = new Set(cfg.parts);
  let chestFront = null;
  for (const s of ['L', 'R']) {
    if (P.has('bracers')) sleeve(`Bip01_${s}_Forearm`, `Bip01_${s}_Hand`, 0.2, 0.9, 0.012, { glowBand: true });
    if (P.has('gauntlets')) sleeve(`Bip01_${s}_Forearm`, `Bip01_${s}_Hand`, 0.55, 1.0, 0.016, { glowBand: true });
    if (P.has('thighs')) sleeve(`Bip01_${s}_Thigh`, `Bip01_${s}_Calf`, 0.2, 0.72, 0.006, { bulge: 0.05, arc: Math.PI });
    if (P.has('shins')) sleeve(`Bip01_${s}_Calf`, `Bip01_${s}_Foot`, 0.15, 0.8, 0.006, { glowBand: true, bulge: 0.08, arc: Math.PI * 1.1 });
    if (P.has('boots')) sleeve(`Bip01_${s}_Calf`, `Bip01_${s}_Foot`, 0.82, 1.02, 0.014, { bulge: 0.04 });
    if (P.has('knees')) { // наколенник: полусфера спереди у колена
      const c = B(`Bip01_${s}_Calf`); if (c) {
        const p = wp(c), r = Math.min(0.075, radiusAt(p, up, 0.055, 0.09)) * 1.05 * bulk;
        const k = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.plate);
        k.position.copy(p).addScaledVector(fwd, r * 0.55); k.quaternion.setFromUnitVectors(up, fwd); k.scale.set(0.95, 0.45, 1.1);
        const g = new THREE.Group(); g.add(k); attach(c, g);
      }
    }
    if (P.has('shoulders')) { // наплечник: купол над плечом, слоями
      const arm = B(`Bip01_${s}_UpperArm`); if (arm) {
        const p = wp(arm), out = p.clone().sub(wp(B('Bip01_Spine2'))).setY(0).normalize();
        const r = Math.min(0.13, (radiusAt(p, out, 0.06, 0.1) + 0.03) * 1.1 * bulk);
        const g = new THREE.Group(); g.position.copy(p).addScaledVector(up, r * 0.35).addScaledVector(out, r * 0.15);
        g.quaternion.setFromUnitVectors(up, up.clone().addScaledVector(out, 0.55).normalize());
        for (let l = 0; l < (bulk > 1.1 ? 3 : 2); l++) {
          const dome = new THREE.Mesh(new THREE.SphereGeometry(r * (1 - l * 0.12), 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), l ? M.plate : M.plate);
          dome.position.y = -l * r * 0.28; dome.scale.set(1, 0.75, 1.1); g.add(dome);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(r * (1 - l * 0.12) * Math.sin(Math.PI * 0.42), 0.006, 6, 28), l === 0 ? M.glow : M.trim);
          rim.rotation.x = Math.PI / 2; rim.position.y = dome.position.y + r * (1 - l * 0.12) * Math.cos(Math.PI * 0.42) * 0.75; rim.scale.set(1, 1.1, 1); g.add(rim);
        }
        if (cfg.spikes) for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 6), M.trim); sp.position.set((k - 1) * r * 0.45, r * 0.7, 0); g.add(sp); }
        if (cfg.crystals) for (let k = 0; k < 5; k++) { const cr = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08 + k % 2 * 0.05, 5), M.glow); cr.position.set((k - 2) * r * 0.3, r * 0.65, (k % 2 - 0.5) * r * 0.4); cr.rotation.z = (k - 2) * 0.25; g.add(cr); }
        attach(arm, g);
      }
    }
  }
  const spine2 = B('Bip01_Spine2'), spine1 = B('Bip01_Spine1'), neck = B('Bip01_Neck'), pelvis = B('Bip01_Pelvis');
  if (P.has('chest') && spine1 && neck) { // нагрудник по форме груди: ширина и глубина меряются отдельно
    const a = wp(spine1), b = wp(neck).addScaledVector(up, -0.04), axis = b.clone().sub(a).normalize();
    const mid = a.clone().lerp(b, 0.55), h = a.distanceTo(b) * 1.08;
    const side = new THREE.Vector3().crossVectors(axis, fwd).normalize();
    const front = surf(mid, fwd, 0.3, 0.12) + 0.012 * bulk, wide = Math.max(surf(mid, side, 0.3, 0.16), surf(mid, side.clone().negate(), 0.3, 0.16)) + 0.004 * bulk;
    const g = frame(mid, axis);
    // профиль: живот уже, грудь шире, к ключицам сужается и заворачивает внутрь
    const prof = (t) => 0.9 + 0.1 * Math.sin(Math.PI * Math.min(1, t * 1.25)) - (t > 0.85 ? (t - 0.85) * 1.2 : 0);
    const plate = new THREE.Mesh(shell(h, prof, Math.PI * 1.1), M.plate); plate.scale.set(wide, 1, front); g.add(plate);
    const abs = new THREE.Mesh(shell(h * 0.35, (t) => 0.9 + 0.05 * Math.sin(Math.PI * t), Math.PI * 0.8), M.plate); abs.scale.set(wide * 0.97, 1, front * 1.04); abs.position.y = -h * 0.36; g.add(abs);
    const top = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006 / Math.max(wide, front), 6, 30, Math.PI * 1.1), M.trim);
    top.scale.set(wide * prof(1) * 1.01, front * prof(1) * 1.01, 1); top.rotation.set(Math.PI / 2, 0, -Math.PI * 0.05); top.position.y = h / 2;
    const topG = new THREE.Group(); topG.add(top); topG.rotation.y = 0; g.add(topG);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, h * 0.7, 0.006), M.glow); seam.position.set(0, -h * 0.05, front * 1.02); g.add(seam);
    chestFront = mid.clone().addScaledVector(fwd, front * 0.98 + 0.004);
    attach(spine2 || spine1, g);
  }
  if (P.has('collar') && neck) { const n = wp(neck), r = radiusAt(n, up, 0.06, 0.1) + 0.02; const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.15, r * 1.35, 0.06, 20, 1, true), M.plate); c.position.copy(n).addScaledVector(up, -0.02); const g = new THREE.Group(); g.add(c); attach(neck, g); }
  if (P.has('belt') && pelvis) { // пояс с пряжкой
    const p = wp(pelvis).addScaledVector(up, 0.07), r = radiusAt(p, up, 0.15, 0.26) + 0.012;
    const g = new THREE.Group(); g.position.copy(p);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.055, 28, 1, true), M.plate); g.add(belt);
    const buckle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20), M.trim); buckle.rotation.x = Math.PI / 2; buckle.position.copy(fwd.clone().multiplyScalar(r + 0.004)); buckle.lookAt(fwd.clone().multiplyScalar(2)); buckle.rotateX(Math.PI / 2); g.add(buckle);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), M.glow); gem.position.copy(fwd.clone().multiplyScalar(r + 0.012)); g.add(gem);
    attach(pelvis, g);
  }
  meshes.forEach((m) => m.geometry.dispose());
  return { chestFront };
}
