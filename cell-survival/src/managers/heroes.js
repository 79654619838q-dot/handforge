// Собственные супергерои Cell Survival (не Marvel/DC — свои имена, костюмы и символы).
// Герой = реалистичный человек Rocketbox + костюм (перекраска + отделка) + снаряжение + эффект силы.
// Всё снаряжение пристёгивается к костям и движется вместе с живыми движениями.
import * as THREE from 'three';

export const HEROES = [
  { id: 'forge', ru: 'Горн', en: 'Forge', tag: { ru: 'Кузнец из раскалённой стали', en: 'Molten steel smith' }, person: 'Military_Male_01', gender: 'male',
    suit: '#2a2622', finish: 'armor', glow: '#ff7a1a', emblem: 'anvil', head: 'none', eyes: '#ffa040', extra: ['bracers'], aura: 'rise' },
  { id: 'volta', ru: 'Вольта', en: 'Volta', tag: { ru: 'Живая молния', en: 'Living lightning' }, person: 'Sports_Female_02', gender: 'female',
    suit: '#14203a', finish: 'glossy', glow: '#4ad8ff', emblem: 'bolt', head: 'visor', extra: ['bracers'], aura: 'spark' },
  { id: 'kronos', ru: 'Кронос', en: 'Kronos', tag: { ru: 'Хозяин времени', en: 'Master of time' }, person: 'Business_Male_05', gender: 'male',
    suit: '#141210', finish: 'glossy', glow: '#f2c14e', emblem: 'hourglass', head: 'none', eyes: '#ffd76a', cape: '#1a1408', extra: ['halo'], aura: 'mist' },
  { id: 'abyss', ru: 'Бездна', en: 'Abyss', tag: { ru: 'Тьма, что поглощает свет', en: 'Darkness that eats light' }, person: 'Male_Adult_17', gender: 'male',
    suit: '#0c0a12', finish: 'cloth', glow: '#9b5cff', emblem: 'void', head: 'hood', eyes: '#b27dff', cape: '#0a0810', aura: 'inward' },
  { id: 'frost', ru: 'Стужа', en: 'Frost', tag: { ru: 'Королева вечного льда', en: 'Queen of endless ice' }, person: 'Female_Adult_11', gender: 'female',
    suit: '#d8ecf8', finish: 'glossy', glow: '#8fe8ff', emblem: 'snowflake', head: 'crown', eyes: '#bff4ff', cape: '#9fd8f0', capeGlass: true, aura: 'snow' },
  { id: 'phoenix', ru: 'Феникс', en: 'Phoenix', tag: { ru: 'Возрождается из пламени', en: 'Reborn from flame' }, person: 'Female_Adult_04', gender: 'female',
    suit: '#6b0f14', finish: 'glossy', glow: '#ff5a1a', emblem: 'bird', head: 'none', eyes: '#ffb040', extra: ['wings'], aura: 'fire' },
  { id: 'bastion', ru: 'Бастион', en: 'Bastion', tag: { ru: 'Непробиваемая крепость', en: 'Unbreakable fortress' }, person: 'Military_Female_01', gender: 'female',
    suit: '#3a3f45', finish: 'armor', glow: '#ff2a2a', emblem: 'shield', head: 'helmet', extra: ['shoulders'], aura: 'none' },
  { id: 'neuron', ru: 'Нейрон', en: 'Neuron', tag: { ru: 'Разум, управляющий машинами', en: 'Mind over machines' }, person: 'Male_Adult_10', gender: 'male',
    suit: '#0f3a3c', finish: 'glossy', glow: '#3dffd8', emblem: 'hex', head: 'visor', extra: ['drones'], aura: 'none' },
  { id: 'graviton', ru: 'Гравитон', en: 'Graviton', tag: { ru: 'Сгибает притяжение', en: 'Bends gravity' }, person: 'Female_Adult_12', gender: 'female',
    suit: '#221436', finish: 'glossy', glow: '#c77dff', emblem: 'planet', head: 'none', eyes: '#d9a8ff', extra: ['rocks'], aura: 'none' },
  { id: 'rune', ru: 'Руна', en: 'Rune', tag: { ru: 'Древняя магия знаков', en: 'Ancient sigil magic' }, person: 'Female_Adult_07', gender: 'female',
    suit: '#132a1c', finish: 'cloth', glow: '#5dff9a', emblem: 'rune', head: 'hood', eyes: '#7dffb0', cape: '#0f2016', extra: ['runes'], aura: 'rise' },
  { id: 'phantom', ru: 'Призрак', en: 'Phantom', tag: { ru: 'Проходит сквозь стены', en: 'Walks through walls' }, person: 'Male_Adult_04', gender: 'male',
    suit: '#5a6068', finish: 'cloth', glow: '#cfe6ff', emblem: 'crescent', head: 'mask', maskColor: '#e8eef4', ghost: true, aura: 'smoke' },
  { id: 'mirage', ru: 'Мираж', en: 'Mirage', tag: { ru: 'Обман зрения во плоти', en: 'Illusion made flesh' }, person: 'Business_Female_02', gender: 'female',
    suit: '#2a1040', finish: 'glossy', glow: '#ff4fd8', emblem: 'eye', head: 'mask', maskColor: '#3a0f52', extra: ['bracers'], aura: 'mist' },
];
export const heroOf = (p) => (p?.hero && p.hero !== 'none' ? HEROES.find((h) => h.id === p.hero) : null);

// ---------- Эмблемы: рисуются на холсте, светятся (попадают в свечение bloom) ----------
const emblemCache = new Map();
export function emblemCanvas(kind, color, S = 256) {
  const key = kind + color + S;
  if (emblemCache.has(key)) return emblemCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2); g.scale(S / 256, S / 256);
  g.strokeStyle = g.fillStyle = color; g.lineWidth = 14; g.lineJoin = g.lineCap = 'round';
  g.shadowColor = color; g.shadowBlur = 18;
  const P = (pts, fill = true) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); fill ? g.fill() : g.stroke(); };
  g.beginPath(); g.arc(0, 0, 112, 0, Math.PI * 2); g.lineWidth = 8; g.stroke(); g.lineWidth = 14; // общий ободок
  switch (kind) {
    case 'anvil': P([[-70, -30], [70, -30], [50, 0], [20, 5], [30, 50], [-30, 50], [-20, 5], [-50, 0], [-90, -10]]); break;
    case 'bolt': P([[18, -95], [-45, 10], [-5, 10], [-22, 95], [45, -15], [5, -15]]); break;
    case 'hourglass': P([[-55, -80], [55, -80], [8, 0], [55, 80], [-55, 80], [-8, 0]], false); g.fillRect(-45, 45, 90, 25); break;
    case 'void': g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(12, -8, 52, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; break;
    case 'snowflake': for (let i = 0; i < 6; i++) { g.save(); g.rotate((i * Math.PI) / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -88); g.moveTo(0, -50); g.lineTo(-22, -72); g.moveTo(0, -50); g.lineTo(22, -72); g.stroke(); g.restore(); } break;
    case 'bird': P([[0, -20], [-95, -60], [-55, 5], [-20, 10], [0, 85], [20, 10], [55, 5], [95, -60]]); break;
    case 'shield': P([[0, -90], [75, -60], [65, 20], [0, 90], [-65, 20], [-75, -60]], false); P([[0, -50], [35, -35], [30, 10], [0, 50], [-30, 10], [-35, -35]]); break;
    case 'hex': P([...Array(6)].map((_, i) => [Math.cos(i * Math.PI / 3) * 80, Math.sin(i * Math.PI / 3) * 80]), false); g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill(); break;
    case 'planet': g.beginPath(); g.arc(0, 0, 45, 0, Math.PI * 2); g.fill(); g.save(); g.rotate(-0.4); g.beginPath(); g.ellipse(0, 0, 95, 26, 0, 0, Math.PI * 2); g.lineWidth = 10; g.stroke(); g.restore(); break;
    case 'rune': P([[0, -90], [0, 90]], false); g.beginPath(); g.moveTo(0, -60); g.lineTo(55, -20); g.lineTo(0, 20); g.moveTo(0, 20); g.lineTo(-55, 60); g.stroke(); break;
    case 'crescent': g.beginPath(); g.arc(0, 0, 75, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(35, -15, 68, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; break;
    case 'eye': g.beginPath(); g.moveTo(-95, 0); g.quadraticCurveTo(0, -80, 95, 0); g.quadraticCurveTo(0, 80, -95, 0); g.stroke(); g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill(); break;
    default: break;
  }
  emblemCache.set(key, c);
  return c;
}

// ---------- Материалы ----------
const glowMat = (color, k = 2.2) => { const m = new THREE.MeshBasicMaterial({ color, toneMapped: false }); m.color.multiplyScalar(k); return m; };
const shell = (r, ps, pl, ts, tl) => new THREE.SphereGeometry(r, 36, 20, ps, pl, ts, tl);
const FRONT = Math.PI / 2;
function softDotTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let dotTex = null;

// Отделка костюма: броня — металл, «глянец» — латекс/кевлар, ткань — матовая.
function finishSuit(hero, person) {
  const F = { armor: { metalness: 0.75, roughness: 0.32 }, glossy: { metalness: 0.2, roughness: 0.28 }, cloth: { metalness: 0, roughness: 0.8 } }[hero.finish];
  person.traverse((o) => {
    if (!o.isMesh) return;
    // у военных моделей своя каска, разгрузка и нож — герою они не нужны (копия материала: образец общий с обычными людьми)
    const hide = (m) => { const src = m.map?.userData?.src || m.map?.image?.currentSrc || m.map?.image?.src || ''; if (!/helmet|equipment|knife/.test(src)) return m; const c = m.clone(); c.visible = false; return c; };
    o.material = Array.isArray(o.material) ? o.material.map(hide) : hide(o.material);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const src = (m.map?.userData?.src || m.map?.image?.currentSrc || m.map?.image?.src || '').split('/').pop();
      const isHead = /head_color/.test(src), isHair = /opacity/.test(src);
      if (!isHead && !isHair && F && m.userData.u) { m.metalness = F.metalness; m.roughness = F.roughness; if (m.roughnessMap && hero.finish !== 'cloth') m.roughnessMap = null; }
      if (hero.ghost) { m.transparent = true; m.opacity = isHair ? 0.35 : 0.55; m.depthWrite = !isHair; }
    }
  });
}

// ---------- Сборка героя ----------
// person — модель в T-позе после relaxPose (метры), root — корень аватара. Возвращает fx(dt, t) для анимации силы.
export function applyHero(hero, root, person) {
  const B = (n) => person.getObjectByName(n);
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const head = B('Bip01_Head'), spine2 = B('Bip01_Spine2'), pelvis = B('Bip01_Pelvis');
  if (!head || !spine2) return null;
  person.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0);
  const la = B('Bip01_L_UpperArm'), ra = B('Bip01_R_UpperArm');
  const fwd = la && ra ? new THREE.Vector3().crossVectors(wp(ra).sub(wp(la)).setY(0), up).normalize() : new THREE.Vector3(0, 0, 1);
  const toe = B('Bip01_L_Toe0'), foot = B('Bip01_L_Foot');
  if (toe && foot && fwd.dot(wp(toe).sub(wp(foot)).setY(0)) < 0) fwd.negate();
  const mount = (bone, pos, build) => {
    const g = new THREE.Group(); g.position.copy(pos); g.lookAt(pos.clone().add(fwd));
    build(g);
    g.traverse((o) => { if (o.isMesh && o.material.toneMapped !== false) o.castShadow = true; }); // светящееся тени не бросает
    person.updateMatrixWorld(true); bone.attach(g);
    return g;
  };
  const fx = [];
  const glow = new THREE.Color(hero.glow);
  finishSuit(hero, person);
  const hp = wp(head);

  // эмблема на груди: точку груди ищем лучом по самой модели (у всех разная фигура)
  const chestAt = (() => {
    const c = wp(spine2).addScaledVector(up, 0.03);
    const ray = new THREE.Raycaster(c.clone().addScaledVector(fwd, 0.6), fwd.clone().negate(), 0, 0.6);
    const meshes = []; person.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.point.addScaledVector(fwd, 0.012) : c.addScaledVector(fwd, 0.14);
  })();
  mount(spine2, chestAt, (g) => {
    const tex = new THREE.CanvasTexture(emblemCanvas(hero.emblem, hero.glow)); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    m.color.setScalar(1.8);
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), m); e.renderOrder = 3; g.add(e);
    fx.push((dt, t) => { m.color.setScalar(1.5 + Math.sin(t * 2.4) * 0.4); });
  });

  // голова
  const eyeLevel = hp.clone().addScaledVector(up, 0.085);
  if (hero.eyes && hero.head !== 'helmet' && hero.head !== 'visor') mount(head, eyeLevel, (g) => {
    const m = glowMat(hero.eyes, 3);
    for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.0105, 16), m); d.position.set(sx * 0.033, 0, 0.121); g.add(d); }
  });
  if (hero.head === 'helmet') mount(head, hp.clone().addScaledVector(up, 0.07), (g) => {
    // шлем: светлый оружейный металл, лицевая пластина, Т-образный визор, боковые диски
    const metal = new THREE.MeshStandardMaterial({ color: '#7d858f', metalness: 0.9, roughness: 0.34 });
    const dark = new THREE.MeshStandardMaterial({ color: '#23272c', metalness: 0.8, roughness: 0.45 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.62), metal); dome.scale.set(1, 1.12, 1.1); g.add(dome);
    const face = new THREE.Mesh(shell(0.132, FRONT - 0.85, 1.7, Math.PI * 0.42, Math.PI * 0.42), dark); face.scale.set(1, 1.1, 1.1); face.material.side = THREE.DoubleSide; g.add(face);
    const vis = glowMat(hero.glow, 3);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.016, 0.02), vis); slit.position.set(0, 0.012, 0.14); g.add(slit);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.06, 0.02), vis); nose.position.set(0, -0.02, 0.143); g.add(nose);
    for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 24), metal); d.rotation.z = Math.PI / 2; d.position.set(sx * 0.132, -0.01, 0); g.add(d); }
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.035, 0.2), dark); crest.position.set(0, 0.145, -0.01); g.add(crest);
    fx.push((dt, t) => { const k = 2.4 + Math.sin(t * 3) * 0.8; slit.material.color.set(hero.glow).multiplyScalar(k); });
  });
  if (hero.head === 'visor') mount(head, eyeLevel, (g) => {
    const m = new THREE.MeshPhysicalMaterial({ color: hero.glow, emissive: hero.glow, emissiveIntensity: 1.6, metalness: 0.5, roughness: 0.1, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.045, 40, 1, true, -1.25, 2.5), m); g.add(v);
  });
  if (hero.head === 'mask') mount(head, eyeLevel, (g) => {
    const m = new THREE.MeshStandardMaterial({ color: hero.maskColor || '#111', roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide });
    const band = new THREE.Mesh(shell(0.114, FRONT - 1.0, 2.0, Math.PI / 2 - 0.17, 0.3), m); band.scale.set(0.9, 1, 1.04); g.add(band);
    const eg = glowMat(hero.glow, 2.4);
    for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.012, 3), eg); d.position.set(sx * 0.034, 0.002, 0.123); d.rotation.z = sx * 0.5 + Math.PI / 2; d.scale.set(1.6, 0.8, 1); g.add(d); }
  });
  if (hero.head === 'hood') mount(head, hp.clone().addScaledVector(up, 0.06).addScaledVector(fwd, -0.01), (g) => {
    // капюшон: ткань вокруг головы с широким вырезом для лица, мягкий край и складка на спину
    const m = new THREE.MeshPhysicalMaterial({ color: hero.cape || hero.suit, roughness: 0.9, sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(hero.glow).multiplyScalar(0.35), side: THREE.DoubleSide });
    const geo = shell(0.128, FRONT + 1.05, Math.PI * 2 - 2.1, 0, Math.PI * 0.78);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) { // ткань: неровности и оттянутый назад низ
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const n = 1 + Math.sin(x * 60 + y * 40) * 0.02 + (y < 0 && z < 0 ? -y * 0.5 : 0);
      pos.setXYZ(k, x * n, y, z * n);
    }
    geo.computeVertexNormals();
    const hood = new THREE.Mesh(geo, m); hood.scale.set(1.08, 1.14, 1.12); g.add(hood);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.01, 8, 40, Math.PI * 1.25), m); rim.rotation.set(0, 0, -Math.PI * 0.125 + Math.PI / 2 - Math.PI * 0.5); rim.position.set(0, 0.0, 0.07); rim.scale.set(1, 1.2, 1);
    rim.rotation.set(0.35, 0, Math.PI * 1.125); g.add(rim);
    const drape = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 20, 1, true), m); drape.position.set(0, -0.17, -0.1); drape.rotation.x = Math.PI - 0.3; g.add(drape);
  });
  if (hero.head === 'crown') mount(head, hp.clone().addScaledVector(up, 0.17), (g) => {
    const ice = new THREE.MeshPhysicalMaterial({ color: '#d8f6ff', emissive: hero.glow, emissiveIntensity: 0.7, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }); // без transmission: он перерисовывает всю сцену каждый кадр
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, front = Math.cos(a - FRONT + Math.PI / 2);
      const h = 0.05 + Math.max(0, front) * 0.09;
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.014, h, 5), ice);
      s.position.set(Math.cos(a) * 0.095, h / 2 - 0.02, Math.sin(a) * 0.095); s.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(s);
    }
  });

  // плащ: полотно от плеч, развевается
  if (hero.cape) {
    const top = wp(spine2).addScaledVector(up, 0.14).addScaledVector(fwd, -0.11);
    mount(spine2, top, (g) => {
      const W = 0.44, L = 1.2, geo = new THREE.PlaneGeometry(W, L, 16, 20);
      geo.translate(0, -L / 2, 0);
      const pos = geo.attributes.position, base = pos.array.slice();
      const m = hero.capeGlass
        ? new THREE.MeshPhysicalMaterial({ color: hero.cape, roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.7, side: THREE.DoubleSide, emissive: hero.glow, emissiveIntensity: 0.2 })
        : new THREE.MeshPhysicalMaterial({ color: hero.cape, roughness: 0.75, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(hero.glow).multiplyScalar(0.5), side: THREE.DoubleSide });
      const cape = new THREE.Mesh(geo, m); cape.castShadow = true; g.add(cape);
      const shape = (t) => {
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3], y = base[i * 3 + 1], s = -y / L; // 0 у плеч → 1 внизу
          const u = x / (W / 2); // −1…1 поперёк
          pos.setX(i, x * (1 + s * 0.45));
          // по спине: края обхватывают плечи (вперёд), вниз ткань отходит от ног немного; вертикальные складки; ветер
          const wrap = u * u * 0.09 * (1 - s * 0.6);
          const folds = Math.sin(u * 9.5) * 0.014 * (0.3 + s);
          const wind = Math.sin(t * 1.7 + s * 4 + u * 2) * 0.03 * s + Math.sin(t * 0.9 + u * 5) * 0.012 * s;
          pos.setZ(i, -0.015 - s * 0.07 + wrap + folds - wind);
        }
        pos.needsUpdate = true; geo.computeVertexNormals();
      };
      shape(0.7); // плащ неподвижен: пересчёт формы каждый кадр давал нагрузку (оператор 25.09: меньше анимаций)
    });
  }

  // особое снаряжение
  const extra = hero.extra || [];
  if (extra.includes('bracers')) for (const side of ['L', 'R']) {
    const f = B(`Bip01_${side}_Forearm`), hnd = B(`Bip01_${side}_Hand`);
    if (!f || !hnd) continue;
    const a = wp(f), b = wp(hnd);
    const g = new THREE.Group(); g.position.copy(a.clone().lerp(b, 0.78));
    g.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 10, 28), glowMat(hero.glow, 2.6)); ring.rotation.x = Math.PI / 2; g.add(ring);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.037, 0.07, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#1a1a1e', metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide })); cuff.position.y = -0.04; g.add(cuff);
    person.updateMatrixWorld(true); f.attach(g);
  }
  if (extra.includes('shoulders')) for (const side of ['L', 'R']) {
    const arm = B(`Bip01_${side}_UpperArm`); if (!arm) continue;
    const p = wp(arm).addScaledVector(up, 0.05);
    const g = mount(arm, p, (gg) => {
      const m = new THREE.MeshStandardMaterial({ color: '#4a5058', metalness: 0.9, roughness: 0.3 });
      const pad = new THREE.Mesh(shell(0.1, 0, Math.PI * 2, 0, Math.PI * 0.45), m); pad.scale.set(1, 0.8, 1.15); gg.add(pad);
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 6, 24), glowMat(hero.glow, 2)); stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.03; gg.add(stripe);
    });
    void g;
  }
  if (extra.includes('halo')) mount(head, hp.clone().addScaledVector(up, 0.08).addScaledVector(fwd, -0.17), (g) => {
    const gold = glowMat(hero.glow, 1.6);
    const ring = new THREE.Group(); g.add(ring);
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.007, 8, 64), gold));
    ring.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.003, 6, 64), gold));
    for (let i = 0; i < 12; i++) { const tk = new THREE.Mesh(new THREE.BoxGeometry(0.008, i % 3 ? 0.02 : 0.04, 0.004), gold); const a = (i / 12) * Math.PI * 2; tk.position.set(Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0); tk.rotation.z = a + Math.PI / 2; ring.add(tk); }
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.15, 0.004), gold); hand.geometry.translate(0, 0.075, 0); g.add(hand);
    fx.push((dt, t) => { ring.rotation.z = t * 0.15; hand.rotation.z = -t * 1.2; });
  });
  if (extra.includes('wings')) mount(spine2, wp(spine2).addScaledVector(fwd, -0.13).addScaledVector(up, 0.05), (g) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, 'rgba(255,60,10,0)'); gr.addColorStop(0.3, 'rgba(255,90,20,0.9)'); gr.addColorStop(0.8, 'rgba(255,200,80,0.8)'); gr.addColorStop(1, 'rgba(255,240,180,0)');
    x.fillStyle = gr; for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(10 + i * 4, 250); x.quadraticCurveTo(40 + i * 12, 120, 20 + i * 16, 10 + i * 18); x.lineTo(30 + i * 16, 14 + i * 18); x.quadraticCurveTo(52 + i * 12, 120, 22 + i * 4, 250); x.fill(); }
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const wings = [-1, 1].map((sx) => {
      const pivot = new THREE.Group(); pivot.rotation.y = sx * 0.5;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.1), m); w.position.set(sx * 0.38, 0.25, 0); w.scale.x = sx; pivot.add(w);
      g.add(pivot); return [pivot, sx];
    });
    fx.push((dt, t) => wings.forEach(([p, sx]) => { p.rotation.y = sx * (0.45 + Math.sin(t * 2.2) * 0.18); }));
  });
  if (extra.includes('drones')) mount(head, hp.clone().addScaledVector(up, 0.12), (g) => {
    const orbit = new THREE.Group(); g.add(orbit);
    const body = new THREE.MeshStandardMaterial({ color: '#20262a', metalness: 0.9, roughness: 0.25 });
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Group(); const a = (i / 3) * Math.PI * 2; d.position.set(Math.cos(a) * 0.4, 0.05 * i, Math.sin(a) * 0.4);
      d.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.035), body));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), glowMat(hero.glow, 3)); eye.position.z = 0.03; d.add(eye);
      orbit.add(d);
    }
    fx.push((dt, t) => { orbit.rotation.y = t * 0.9; orbit.children.forEach((d, i) => { d.position.y = Math.sin(t * 2 + i * 2) * 0.05; d.lookAt(0, d.position.y, 0); d.rotateY(Math.PI); }); });
  });
  if (extra.includes('rocks') && pelvis) mount(pelvis, wp(pelvis).addScaledVector(up, 0.1), (g) => {
    const orbit = new THREE.Group(); g.add(orbit);
    const stone = new THREE.MeshStandardMaterial({ color: '#2a2530', roughness: 0.9, emissive: hero.glow, emissiveIntensity: 0.35 });
    for (let i = 0; i < 9; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.025 + (i % 3) * 0.012), stone); const a = (i / 9) * Math.PI * 2; r.position.set(Math.cos(a) * 0.5, Math.sin(i) * 0.06, Math.sin(a) * 0.5); orbit.add(r); }
    orbit.rotation.x = 0.25;
    fx.push((dt, t) => { orbit.rotation.y = t * 0.6; orbit.children.forEach((r, i) => { r.rotation.x = t * (0.5 + i * 0.1); r.rotation.y = t * 0.7; }); });
  });
  if (extra.includes('runes')) {
    const c = emblemCanvas('rune', hero.glow, 256);
    const rc = document.createElement('canvas'); rc.width = rc.height = 512;
    const x = rc.getContext('2d'); x.translate(256, 256); x.strokeStyle = hero.glow; x.shadowColor = hero.glow; x.shadowBlur = 16; x.lineWidth = 6;
    x.beginPath(); x.arc(0, 0, 240, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(0, 0, 190, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i < 8; i++) { x.save(); x.rotate((i / 8) * Math.PI * 2); x.drawImage(c, -26, -242, 52, 52); x.restore(); }
    const m = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(rc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const circle = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), m); circle.rotation.x = -Math.PI / 2; circle.position.y = 0.015; root.add(circle);
    fx.push((dt, t) => { circle.rotation.z = t * 0.3; m.opacity = 0.75 + Math.sin(t * 2) * 0.25; });
  }

  // аура силы: частицы вокруг тела
  if (hero.aura && hero.aura !== 'none') {
    const N = hero.aura === 'snow' ? 40 : 30; // вдвое меньше частиц (25.09)
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    const reset = (i, y0) => { const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.3; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y0 ?? Math.random() * 1.9; pos[i * 3 + 2] = Math.sin(a) * r; seed[i] = Math.random(); };
    for (let i = 0; i < N; i++) reset(i);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dotTex ||= softDotTex();
    const dark = hero.aura === 'inward' || hero.aura === 'smoke';
    const mat = new THREE.PointsMaterial({ map: dotTex, color: dark && hero.aura === 'smoke' ? '#9aa4b0' : hero.glow, size: { smoke: 0.16, mist: 0.12, snow: 0.035 }[hero.aura] || 0.045, transparent: true, opacity: { smoke: 0.25, mist: 0.3 }[hero.aura] || 0.9, depthWrite: false, blending: hero.aura === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending });
    if (hero.aura !== 'smoke' && hero.aura !== 'mist') mat.color.multiplyScalar(1.6);
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; root.add(pts);
    let skip = false;
    fx.push((dt) => {
      if ((skip = !skip)) return; // аура обновляется через кадр
      dt *= 2;
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        switch (hero.aura) {
          case 'rise': case 'fire': pos[k + 1] += dt * (0.4 + seed[i] * 0.6); pos[k] *= 1 - dt * 0.2; pos[k + 2] *= 1 - dt * 0.2; if (pos[k + 1] > 2.1) reset(i, 0); break;
          case 'snow': pos[k + 1] -= dt * (0.15 + seed[i] * 0.2); pos[k] += Math.sin(pos[k + 1] * 4 + seed[i] * 6) * dt * 0.1; if (pos[k + 1] < 0) reset(i, 2.1); break;
          case 'spark': if (Math.random() < 0.08) reset(i); break;
          case 'inward': { pos[k] *= 1 - dt * 0.9; pos[k + 2] *= 1 - dt * 0.9; const r = Math.hypot(pos[k], pos[k + 2]); if (r < 0.06) { reset(i); pos[k] *= 2.2; pos[k + 2] *= 2.2; } break; }
          default: pos[k + 1] += dt * 0.12; pos[k] += Math.sin(pos[k + 1] * 3 + seed[i] * 6) * dt * 0.05; if (pos[k + 1] > 2) reset(i, 0.1); // mist, smoke
        }
      }
      geo.attributes.position.needsUpdate = true;
      if (hero.aura === 'spark') mat.opacity = Math.random() < 0.3 ? 0.4 : 1;
    });
  }
  void glow;
  return (dt, t) => { for (const f of fx) f(dt, t); };
}
