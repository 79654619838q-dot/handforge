import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ASSETS, ART_V } from '../paths.js';
import { HEROES, heroOf, applyHero } from './heroes.js';

// ---------- Реалистичные люди (Microsoft Rocketbox, MIT) ----------
// Файлы готовит tools/import_rocketbox.py → public/assets/avatar/people/<id>/.
export const PEOPLE = [
  { id: 'Business_Male_01', gender: 'male', style: 'suit' },
  { id: 'Business_Male_05', gender: 'male', style: 'suit' },
  { id: 'Male_Adult_07', gender: 'male', style: 'jacket' },
  { id: 'Male_Adult_12', gender: 'male', style: 'jacket' },
  { id: 'Male_Adult_05', gender: 'male', style: 'jacket' },
  { id: 'Male_Adult_04', gender: 'male', style: 'hoodie' },
  { id: 'Male_Adult_17', gender: 'male', style: 'hoodie' },
  { id: 'Male_Adult_09', gender: 'male', style: 'tshirt' },
  { id: 'Male_Adult_10', gender: 'male', style: 'sport' },
  { id: 'Military_Male_01', gender: 'male', style: 'tactical' },
  { id: 'Business_Female_01', gender: 'female', style: 'suit' },
  { id: 'Business_Female_02', gender: 'female', style: 'suit' },
  { id: 'Female_Adult_04', gender: 'female', style: 'leather' },
  { id: 'Female_Adult_07', gender: 'female', style: 'jacket' },
  { id: 'Female_Adult_11', gender: 'female', style: 'premium' },
  { id: 'Female_Adult_12', gender: 'female', style: 'hoodie' },
  { id: 'Female_Adult_08', gender: 'female', style: 'tshirt' },
  { id: 'Female_Adult_03', gender: 'female', style: 'tshirt' },
  { id: 'Sports_Female_02', gender: 'female', style: 'sport' },
  { id: 'Military_Female_01', gender: 'female', style: 'tactical' },
];

const personCache = new Map();
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

class BitmapTextureLoader extends THREE.Loader {
  load(url, onLoad, onProgress, onError) {
    const tex = new THREE.Texture();
    tex.userData.src = this.manager.resolveURL((this.path || '') + url);
    const l = new THREE.ImageBitmapLoader(this.manager).setPath(this.path).setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' });
    l.load(url, (bmp) => { tex.image = bmp; tex.flipY = false; tex.needsUpdate = true; onLoad?.(tex); }, onProgress, onError);
    return tex;
  }
}

export function loadPerson(id) {
  if (personCache.has(id)) return personCache.get(id);
  const dir = `${ASSETS}avatar/people/${id}/`;
  const manager = new THREE.LoadingManager();
  // В FBX текстуры записаны как *.tga (2K, 90 МБ) — подменяем на ужатые копии.
  manager.setURLModifier((url) => {
    const name = url.split('/').pop();
    if (!/\.tga$/i.test(name)) return url;
    const base = name.replace(/\.tga$/i, '');
    if (base.includes('specular')) return dir + base.replace('specular', 'roughness') + '.jpg'; // блеск → шероховатость (tools/import_rocketbox.py)
    return dir + base + (base.includes('opacity') ? '.png' : '.jpg');
  });
  // «Готов» = FBX разобран И все его текстуры скачаны; иначе портрет рисуется без текстур.
  const allLoaded = new Promise((res) => { manager.onLoad = res; }); // ошибка одной текстуры не валит человека
  // Картинки распаковываются в фоновом потоке (ImageBitmap): обычная <img> распаковывалась на главном потоке
  // при загрузке в видеокарту — профиль 25.09: 1,1–1,3 с зависаний на испытание. Адрес — в userData.src.
  if (typeof createImageBitmap === 'function') manager.addHandler(/\.tga$/i, new BitmapTextureLoader(manager));
  const loader = new FBXLoader(manager);
  loader.setResourcePath(dir);
  const job = loader.loadAsync(dir + id + '.fbx').then((fbx) => allLoaded.then(() => fbx)).then((fbx) => {
    fbx.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = mats.map((m) => toPBR(m));
      if (o.material.length === 1) o.material = o.material[0];
    });
    return fbx;
  });
  job.then((f) => { job.resolved = f; }, () => { job.failed = true; });
  personCache.set(id, job);
  return job;
}

// Phong из 3ds Max → PBR, чтобы человек освещался так же, как всё остальное в сцене.
// Реализм: шероховатость по карте блеска (кожа, глаза, губы блестят по-разному),
// лицо — физический материал с тёплым «рассеиванием» (sheen) вместо пластика,
// волосы и ресницы — alphaHash: мягкие края без «лесенки» и без проблем сортировки.
function toPBR(m) {
  const src = (m.map?.userData?.src || m.map?.image?.currentSrc || m.map?.image?.src || '').split('/').pop();
  const isHead = /head_color/.test(src);
  const cut = !!m.transparent || !!m.alphaMap;
  const params = {
    name: m.name,
    map: m.map || null,
    normalMap: m.normalMap || null,
    roughnessMap: m.specularMap || null,
    roughness: m.specularMap ? 1 : 0.62,
    metalness: 0,
    color: m.map ? 0xffffff : m.color,
    envMapIntensity: 0.6,
    side: cut ? THREE.DoubleSide : THREE.FrontSide,
  };
  const out = isHead
    ? new THREE.MeshPhysicalMaterial({ ...params, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ff9f88'), specularIntensity: 0.55 })
    : new THREE.MeshStandardMaterial(params);
  if (cut) { out.alphaMap = m.alphaMap || null; out.alphaHash = true; out.transparent = false; }
  if (out.map) { out.map.colorSpace = THREE.SRGBColorSpace; out.map.anisotropy = 8; }
  if (out.normalMap) out.normalScale = new THREE.Vector2(1, 1);
  return out;
}

export function ensurePerson(profile) {
  // человек готов, когда загружены и модель, и движения (иначе первые аватары вышли бы без анимации)
  return profile?.person ? Promise.all([loadPerson(profile.person).catch(() => null), animsReady]).then(([f]) => f) : Promise.resolve(null);
}

// ---------- Живые движения (Microsoft Rocketbox Animations, MIT) ----------
// tools/convert_anims.mjs → assets/avatar/anims.json: ожидание, волнение, радость, аплодисменты, грусть.
// Все анимированные люди обновляются из Stage.frame (updateAvatars), даже созданные сценами вне PlayerManager.
let animLib = null;
// ?noanim в адресе — без живых движений (для замера скорости)
export const animsReady = (/noanim/.test(location.search) ? Promise.reject() : fetch(`${ASSETS}avatar/anims.json`)).then((r) => r.json()).then((raw) => {
  animLib = {};
  for (const [name, c] of Object.entries(raw)) {
    const tracks = c.k.map((tr) => {
      const size = tr.p === 'quaternion' ? 4 : 3;
      const times = tr.v.length === size ? [0] : c.t;
      const T = tr.p === 'quaternion' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
      return new T(`${tr.n}.${tr.p}`, times, tr.v);
    });
    animLib[name] = new THREE.AnimationClip(name, c.d, tracks);
  }
  return animLib;
}).catch(() => null);

// какие ролики у какого настроения (m_/f_ — по полу модели)
const MOODS = {
  idle: ['idle_neutral_01', 'idle_neutral_02', 'idle_look_around_01', 'idle_waiting_01'],
  nervous: ['idle_nervous_01', 'idle_look_around_01'],
  cheer: ['cheer_01', 'cheer_03'],
  clap: ['claphands_01'],
  sad: ['gestic_listen_sad_01', 'gestic_shrug_01'],
};
const liveMixers = new Set();
const topOf = (o) => { while (o.parent) o = o.parent; return o; };
// Считаем движения только тех, кто стоит на показываемой сцене. Кто 10 с не на ней (прошлое испытание,
// удалённый аватар) — забываем, иначе старые сцены жили бы в памяти вечно.
let fxTime = 0;
let lowFx = false;
export function setLowFx(v) { lowFx = v; } // «Низкое» качество: без эффектов героев
export function updateAvatars(dt, scene) {
  fxTime += dt;
  for (const m of liveMixers) {
    if (topOf(m.getRoot()) === scene) {
      m.idle = 0;
      // движения — 30 раз в секунду (глазу хватает, нагрузка вдвое меньше); эффекты героя — не на «низком»
      m.acc = (m.acc || 0) + dt;
      if (m.acc >= 1 / 31) { m.update(m.acc); if (!lowFx) m.heroFx?.(m.acc, fxTime); m.acc = 0; }
    }
    else if ((m.idle = (m.idle || 0) + dt) > 10) liveMixers.delete(m);
  }
}

function animatePerson(root, person, female) {
  const mixer = new THREE.AnimationMixer(person);
  const pre = female ? 'f_' : 'm_';
  let cur = null, mood = 'idle', emoteLeft = 0;
  const clipOf = (list) => { const ok = list.map((n) => animLib[pre + n] || animLib['m_' + n]).filter(Boolean); return ok[Math.floor(Math.random() * ok.length)]; };
  const play = (clip, fade = 0.5) => {
    if (!clip) return;
    const a = mixer.clipAction(clip);
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
    if (cur && cur !== a) a.crossFadeFrom(cur, fade, false); else a.fadeIn(fade);
    a.play(); cur = a;
  };
  // ролик кончился — плавно следующий ролик того же настроения (шов обрезанных роликов не виден)
  mixer.addEventListener('finished', (e) => { if (e.action === cur) play(clipOf(MOODS[mood] || MOODS.idle), 0.6); });
  const first = clipOf(MOODS.idle);
  play(first, 0);
  if (cur) cur.time = Math.random() * first.duration * 0.8; // все стоят не в такт
  mixer.update(0);
  liveMixers.add(mixer);
  // настроение: idle / nervous / cheer / clap / sad
  root.userData.mood = (m) => { if (m === mood || !MOODS[m]) return; mood = m; play(clipOf(MOODS[m]), 0.4); };
  root.userData.mixer = mixer;
  mixer.heroFx = root.userData.fx; // сила героя обновляется вместе с движениями
  void emoteLeft;
}

// Скелет Rocketbox — Biped (Bip01_…), модель в T-позе. Опускаем руки вдоль тела:
// кость разворачивается так, чтобы смотреть в заданном мировом направлении.
function rotateBoneTo(bone, child, dir) {
  const a = bone.getWorldPosition(new THREE.Vector3());
  const b = child.getWorldPosition(new THREE.Vector3());
  const cur = b.sub(a).normalize();
  const qw = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.premultiply(parentQ.clone().invert().multiply(qw).multiply(parentQ));
  bone.updateMatrixWorld(true);
}

function relaxPose(root) {
  root.updateMatrixWorld(true);
  const center = root.getObjectByName('Bip01_Spine2')?.getWorldPosition(new THREE.Vector3()) || new THREE.Vector3();
  for (const side of ['L', 'R']) {
    const arm = root.getObjectByName(`Bip01_${side}_UpperArm`);
    const fore = root.getObjectByName(`Bip01_${side}_Forearm`);
    const hand = root.getObjectByName(`Bip01_${side}_Hand`);
    if (!arm || !fore || !hand) continue;
    const out = Math.sign(arm.getWorldPosition(new THREE.Vector3()).x - center.x) || 1;
    rotateBoneTo(arm, fore, new THREE.Vector3(out * 0.16, -1, 0.02)); // плечо — вниз, чуть от корпуса
    rotateBoneTo(fore, hand, new THREE.Vector3(out * 0.06, -1, 0.14)); // предплечье — вниз, лёгкий сгиб
  }
}

// Перекраска прямо в шейдере: кожа находится по цвету (пространство YCbCr), одежда — всё, что не кожа.
// Тон кожи меняется только на коже; одежда — только вне кожи; волосы — на материале волос.
const TINT_GLSL = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  vec3 cc = sampledDiffuseColor.rgb;
  vec3 sg = pow( max( cc, vec3( 0.0 ) ), vec3( 0.4545 ) );
  float yy = dot( sg, vec3( 0.299, 0.587, 0.114 ) );
  float cb = 0.5 - 0.168736 * sg.r - 0.331264 * sg.g + 0.5 * sg.b;
  float cr = 0.5 + 0.5 * sg.r - 0.418688 * sg.g - 0.081312 * sg.b;
  // кожа — пиксели, близкие к цвету лица этой модели (uSkinRef = яркость, Cb, Cr), а не «всё коричневое»
  float ratio = yy / max( uSkinRef.x, 0.05 );
  float skin = ( 1.0 - smoothstep( 0.03, 0.06, length( vec2( cb, cr ) - uSkinRef.yz ) ) ) * smoothstep( 0.45, 0.62, ratio ) * ( 1.0 - smoothstep( 1.55, 1.9, ratio ) ) * uUseSkin;
  float lum = dot( cc, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 recol = uTint * clamp( pow( lum, 0.6 ) * 2.6, 0.0, 1.0 );
  cc = mix( cc, recol, ( 1.0 - skin ) * uTintOn );
  cc = mix( cc, cc * uSkinMul, skin );
  diffuseColor *= vec4( cc, sampledDiffuseColor.a );
#endif
`;

function tintMaterial(m, tint, skinMul, skinRef, useSkin) {
  const c = m.clone();
  c.userData.u = {
    uTint: { value: new THREE.Color(tint || '#ffffff') }, uTintOn: { value: tint ? 1 : 0 }, uSkinMul: { value: skinMul },
    uSkinRef: { value: skinRef }, uUseSkin: { value: useSkin ? 1 : 0 },
  };
  c.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, c.userData.u);
    sh.fragmentShader = 'uniform vec3 uTint; uniform float uTintOn; uniform vec3 uSkinMul; uniform vec3 uSkinRef; uniform float uUseSkin;\n' + sh.fragmentShader.replace('#include <map_fragment>', TINT_GLSL);
  };
  // Уникальный ключ: при одинаковом ключе three.js берёт готовую программу и не передаёт в неё наши значения —
  // все аватары получали бы цвета первого.
  // Ключ — только вид перекраски; цвета — параметры (uniform) каждого материала. Шейдер один на всех:
  // с цветом в ключе у каждого героя был свой шейдер, а сборка шейдера на Windows — 100–200 мс (профиль 25.09).
  const key = 'tint:' + (useSkin ? 1 : 0);
  c.customProgramCacheKey = () => key;
  return c;
}

// Средний цвет кожи модели — по середине текстуры лица (там щёки и лоб). В пространстве Y/Cb/Cr, гамма sRGB.
function skinRefOf(template) {
  if (template.userData.skinRef) return template.userData.skinRef;
  let img = null;
  template.traverse((o) => {
    if (!o.isMesh || img) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const src = m.map?.userData?.src || m.map?.image?.currentSrc || m.map?.image?.src || '';
      if (/head_color/.test(src)) img = m.map.image;
    }
  });
  const ref = new THREE.Vector3(0.55, 0.42, 0.58);
  if (img) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64);
    const d = g.getImageData(16, 16, 32, 32).data;
    const ys = [], cbs = [], crs = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
      const y = 0.299 * r + 0.587 * gg + 0.114 * b, cb = 0.5 - 0.168736 * r - 0.331264 * gg + 0.5 * b, cr = 0.5 + 0.5 * r - 0.418688 * gg - 0.081312 * b;
      if (cr > 0.52 && cr < 0.7 && cb > 0.3 && cb < 0.5 && y > 0.08) { ys.push(y); cbs.push(cb); crs.push(cr); }
    }
    const med = (a) => a.sort((x, z) => x - z)[a.length >> 1];
    if (ys.length > 30) ref.set(med(ys), med(cbs), med(crs));
  }
  template.userData.skinRef = ref;
  return ref;
}

// Тон кожи: множитель цвета (темнее — теплее, светлее — чуть розовее)
const SKIN_MUL = { '-2': [0.55, 0.47, 0.42], '-1': [0.77, 0.71, 0.67], 0: [1, 1, 1], 1: [1.14, 1.1, 1.08], 2: [1.3, 1.24, 1.2] };

function applyLooks(p, person, template) {
  const outfit = p.outfit && p.outfit !== 'orig' ? p.outfit : null;
  const hair = p.hairTint && p.hairTint !== 'orig' ? p.hairTint : null;
  const sm = new THREE.Vector3(...(SKIN_MUL[p.skinTone ?? 0] || SKIN_MUL[0]));
  if (!outfit && !hair && (!p.skinTone || String(p.skinTone) === '0')) return; // без изменений — общие материалы образца
  const ref = skinRefOf(template);
  const one = new THREE.Vector3(1, 1, 1);
  person.traverse((o) => {
    if (!o.isMesh) return;
    const conv = (m) => {
      const src = (m.map?.userData?.src || m.map?.image?.currentSrc || m.map?.image?.src || '').split('/').pop();
      if (/opacity/.test(src)) { // волосы/ресницы
        if (!hair) return m;
        return tintMaterial(m, hair, one, ref, false);
      }
      if (/head_color/.test(src)) return tintMaterial(m, null, sm, ref, true);
      if (/_color/.test(src)) return tintMaterial(m, /helmet|equipment|knife/.test(src) ? null : outfit, sm, ref, true);
      return m;
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}

function buildPerson(p, template) {
  const root = new THREE.Group();
  root.name = 'avatar';
  const person = SkeletonUtils.clone(template);
  // Rocketbox в сантиметрах: переводим в метры (рост у всех свой), ступни — на ноль.
  // Габариты анимированной модели three.js считает по каждой вершине с костями (~100+ мс) — считаем раз на образец.
  const box = template.userData.box || (template.userData.box = new THREE.Box3().setFromObject(person));
  const h = box.max.y - box.min.y;
  const k = h > 100 && h < 250 ? 0.01 : 1.8 / h;
  person.scale.multiplyScalar(k);
  person.position.y -= box.min.y * k;
  root.add(person);
  relaxPose(person);
  person.updateMatrixWorld(true);
  const hero = heroOf(p);
  applyLooks(hero ? { ...p, outfit: hero.suit, skinTone: '0', hairTint: 'orig' } : p, person, template);
  if (hero) root.userData.fx = applyHero(hero, root, person); // супергерой: костюм, снаряжение, сила
  else addPersonAccessories(p, person);

  const head = person.getObjectByName('Bip01_Head');
  const spine = person.getObjectByName('Bip01_Spine1');
  const head0 = head?.quaternion.clone(), spine0 = spine?.quaternion.clone();
  const phase = Math.random() * 10;
  const qa = new THREE.Quaternion(), e = new THREE.Euler();
  root.userData.person = person;
  root.userData.height = h * k;
  // Лёгкая жизнь: дыхание корпусом и медленный поворот головы.
  const pelvis = person.getObjectByName('Bip01_Pelvis');
  const arms = ['Bip01_L_UpperArm', 'Bip01_R_UpperArm'].map((n) => person.getObjectByName(n));
  const pelvis0 = pelvis?.quaternion.clone(), arms0 = arms.map((a) => a?.quaternion.clone());
  if (animLib) { // есть живые движения — «дыхание» кодом не нужно
    animatePerson(root, person, PEOPLE.find((x) => x.id === p.person)?.gender === 'female');
    root.userData.update = () => {};
    return root;
  }
  let lastT = null;
  root.userData.update = (t) => {
    if (root.userData.fx) { root.userData.fx(lastT === null ? 0 : Math.min(0.05, t - lastT), t); lastT = t; }
    const tt = t + phase;
    if (spine) { e.set(Math.sin(tt * 1.6) * 0.012, 0, -Math.sin(tt * 0.35) * 0.02); spine.quaternion.copy(spine0).multiply(qa.setFromEuler(e)); }
    if (pelvis) { e.set(0, 0, Math.sin(tt * 0.35) * 0.018); pelvis.quaternion.copy(pelvis0).multiply(qa.setFromEuler(e)); }
    arms.forEach((a, i) => { if (a) { e.set(0, 0, Math.sin(tt * 0.8 + i * 1.7) * 0.015); a.quaternion.copy(arms0[i]).multiply(qa.setFromEuler(e)); } });
    if (head) { e.set(Math.sin(tt * 0.27) * 0.03, Math.sin(tt * 0.4) * 0.12, 0); head.quaternion.copy(head0).multiply(qa.setFromEuler(e)); }
  };
  return root;
}

// Аксессуары поверх реалистичного человека: строятся в метрах в «мировых» осях
// (Z — куда смотрит человек) и пристёгиваются к костям, чтобы двигаться вместе с ними.
function addPersonAccessories(p, person) {
  const B = (n) => person.getObjectByName(n);
  const wp = (o) => o.getWorldPosition(new THREE.Vector3());
  const head = B('Bip01_Head'), neck = B('Bip01_Neck'), foot = B('Bip01_L_Foot'), toe = B('Bip01_L_Toe0');
  const fore = B('Bip01_L_Forearm'), hand = B('Bip01_L_Hand');
  if (!head) return;
  const up = new THREE.Vector3(0, 1, 0);
  // «Вперёд» — перпендикуляр к линии плеч; знак сверяем с носком стопы.
  const la = B('Bip01_L_UpperArm'), ra = B('Bip01_R_UpperArm');
  const toeDir = foot && toe ? wp(toe).sub(wp(foot)).setY(0) : new THREE.Vector3(0, 0, 1);
  const fwd = la && ra ? new THREE.Vector3().crossVectors(wp(ra).sub(wp(la)).setY(0), up).normalize() : toeDir.clone().normalize();
  if (fwd.dot(toeDir) < 0) fwd.negate();
  if (!Number.isFinite(fwd.x) || fwd.lengthSq() < 0.5) fwd.set(0, 0, 1);
  const hp = wp(head);
  const mount = (bone, pos, build) => {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().add(fwd));
    build(g);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    person.updateMatrixWorld(true);
    bone.attach(g);
  };
  const metal = (id) => mat(METAL[id].color, METAL[id]);

  if (p.eyewear === 'visor') mount(head, hp.clone().addScaledVector(up, 0.085), (g) => {
    const m = new THREE.MeshPhysicalMaterial({ color: '#0b0f14', metalness: 0.6, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.9 });
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.05, 40, 1, true, -1.2, 2.4), m);
    v.material.side = THREE.DoubleSide; v.position.set(0, 0, 0.0); g.add(v);
  });
  else if (p.eyewear && p.eyewear !== 'none') mount(head, hp.clone().addScaledVector(up, 0.085), (g) => {
    const frame = p.eyewear === 'aviators' || p.eyewear === 'round' ? metal('gold') : mat('#101012', { roughness: 0.3, metalness: 0.3 });
    const clear = p.eyewear === 'glasses' || p.eyewear === 'round';
    const lens = new THREE.MeshPhysicalMaterial({ color: clear ? '#ffffff' : '#101418', transparent: true, opacity: clear ? 0.15 : 0.88, roughness: 0.05, metalness: 0.3 });
    const r = p.eyewear === 'aviators' ? 0.024 : p.eyewear === 'round' ? 0.02 : 0.022;
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0028, 8, 28), frame);
      ring.position.set(sx * 0.033, 0, 0.122);
      if (p.eyewear === 'aviators') ring.scale.set(1, 1.12, 1);
      const l = new THREE.Mesh(new THREE.CircleGeometry(r, 24), lens);
      l.position.copy(ring.position).add(new THREE.Vector3(0, 0, -0.001)); l.scale.copy(ring.scale);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), frame);
      arm.position.set(sx * 0.068, 0.004, 0.07);
      g.add(ring, l, arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.003, 0.003), frame);
    bridge.position.set(0, 0.006, 0.124);
    g.add(bridge);
  });

  if (p.headwear && p.headwear !== 'none') mount(head, hp.clone().addScaledVector(up, 0.15), (g) => {
    if (p.headwear === 'cap') {
      const m = cloth('#141418');
      g.add(new THREE.Mesh(shell(0.105, 0, Math.PI * 2, 0, Math.PI * 0.5), m));
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 24, 1, false, -Math.PI / 2 - 1.1, 2.2), m);
      visor.position.set(0, -0.005, 0.07); visor.rotation.x = 0.12; g.add(visor);
    } else if (p.headwear === 'beanie') {
      const m = cloth('#2a2a30');
      const b = new THREE.Mesh(shell(0.108, 0, Math.PI * 2, 0, Math.PI * 0.55), m); b.scale.y = 1.1; g.add(b);
      const fold = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.012, 8, 36), m); fold.rotation.x = Math.PI / 2; fold.position.y = -0.01; g.add(fold);
    } else if (p.headwear === 'cowboy') {
      const m = mat('#6b4526', { roughness: 0.85 });
      const brimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.008, 40, 1);
      const pos = brimGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, pos.getY(i) + Math.pow(Math.abs(x) / 0.24, 2) * 0.05); void z; }
      brimGeo.computeVertexNormals();
      const brim = new THREE.Mesh(brimGeo, m); brim.position.y = -0.03; g.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 28), m); crown.position.y = 0.03; crown.scale.z = 1.15; g.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.101, 0.101, 0.018, 28), mat('#2a1a10')); band.position.y = -0.012; band.scale.z = 1.15; g.add(band);
    } else if (p.headwear === 'beret') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.125, 28, 16), cloth('#141418'));
      b.scale.set(1, 0.34, 1.02); b.position.set(-0.02, -0.005, -0.01); b.rotation.z = 0.18; g.add(b);
    } else if (p.headwear === 'bandana') {
      const b = new THREE.Mesh(shell(0.108, 0, Math.PI * 2, 0, Math.PI * 0.42), cloth('#8e1622'));
      b.scale.set(0.98, 1.05, 1.02); b.position.y = -0.04; g.add(b);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), cloth('#8e1622')); knot.position.set(0, -0.05, -0.105); g.add(knot);
    } else {
      const m = mat('#1a1614', { roughness: 0.8 });
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.008, 36), m); brim.position.y = -0.03; g.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.11, 28), m); crown.position.y = 0.025; g.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.101, 0.101, 0.02, 28), mat('#6b0f1a')); band.position.y = -0.015; g.add(band);
    }
  });

  const spine2 = B('Bip01_Spine2');
  const colorOf = (v, fallback) => ({ black: '#141418', gold: '#b88a2e', white: '#e8e6e0', red: '#8e1622', silver: '#cfd4da', tactical: '#3a3f2c' }[v] || fallback);

  if (p.mask && p.mask !== 'none') mount(head, hp.clone(), (g) => {
    // маска на нижнюю половину лица: дуга перед носом и ртом
    const m = p.mask === 'gold' ? metal('gold') : new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.55 });
    // часть сферы по форме лица: от кончика носа до подбородка
    const arc = new THREE.Mesh(shell(0.104, FRONT - 1.05, 2.1, Math.PI * 0.55, Math.PI * 0.3), m);
    arc.material.side = THREE.DoubleSide; arc.scale.set(0.86, 1.05, 1.05); arc.position.set(0, 0.05, 0.004); g.add(arc);
  });

  if (p.headphones && p.headphones !== 'none') mount(head, hp.clone().addScaledVector(up, 0.08), (g) => {
    const m = new THREE.MeshStandardMaterial({ color: colorOf(p.headphones), roughness: 0.35, metalness: p.headphones === 'gold' ? 1 : 0.2 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 8, 32, Math.PI), m); band.position.set(0, -0.005, -0.01); band.scale.y = 1.05; g.add(band);
    for (const sx of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.022, 24), m); cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.086, -0.02, -0.01); g.add(cup);
      const pad = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 8, 20), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.9 })); pad.rotation.y = Math.PI / 2; pad.position.set(sx * 0.076, -0.02, -0.01); g.add(pad);
    }
  });

  if (p.earrings && p.earrings !== 'none') mount(head, hp.clone().addScaledVector(up, 0.035), (g) => {
    for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 8, 20), metal(p.earrings)); r.position.set(sx * 0.078, -0.012, -0.005); r.rotation.y = Math.PI / 2; g.add(r); }
  });

  if (p.scarf && p.scarf !== 'none' && neck) mount(neck, wp(neck).addScaledVector(up, -0.02), (g) => {
    const m = cloth(colorOf(p.scarf));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.022, 12, 32), m); ring.rotation.x = Math.PI / 2 - 0.3; ring.scale.set(1, 1.1, 1); ring.position.z = -0.01; g.add(ring);
    const tail = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.22, 0.016, 3, 0.007), m); tail.position.set(0.03, -0.12, 0.075); tail.rotation.set(0.25, 0, 0.1); g.add(tail);
  });

  if (p.backpack && p.backpack !== 'none' && spine2) mount(spine2, wp(spine2).addScaledVector(fwd, -0.16).addScaledVector(up, -0.04), (g) => {
    const m = p.backpack === 'gold' ? new THREE.MeshStandardMaterial({ color: '#b8923e', metalness: 0.7, roughness: 0.35 }) : cloth(colorOf(p.backpack));
    const bag = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.36, 0.13, 3, 0.04), m); g.add(bag);
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.14, 0.05, 3, 0.02), m); pocket.position.set(0, -0.08, -0.08); g.add(pocket);
    const strapM = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.7 });
    for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.012), strapM); st.position.set(sx * 0.08, 0.02, 0.2); st.rotation.x = -0.12; g.add(st); }
  });

  if (p.chain && p.chain !== 'none' && neck) mount(neck, wp(neck).addScaledVector(up, -0.035), (g) => {
    // кольцо вокруг шеи, передний край провисает на грудь
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.005, 8, 48), metal(p.chain));
    c.scale.set(1, 1.15, 1);
    c.rotation.x = Math.PI / 2 - 0.55; g.add(c);
    const pend = new THREE.Mesh(new THREE.OctahedronGeometry(0.012), metal(p.chain));
    pend.position.set(0, -0.055, 0.075); g.add(pend);
  });

  if (p.watch && p.watch !== 'none' && fore && hand) {
    const a = wp(fore), b = wp(hand);
    const pos = a.clone().lerp(b, 0.9);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.008, 8, 24), metal(p.watch));
    band.rotation.x = Math.PI / 2; g.add(band);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.008, 20), mat('#0a0a0c', { roughness: 0.1, metalness: 0.5 }));
    face.rotation.z = Math.PI / 2; face.position.x = 0.036; g.add(face);
    person.updateMatrixWorld(true);
    fore.attach(g);
  }
}

// Аватар собирается из частей: BODY + FACE + HAIR + CLOTHES + ACCESSORIES + BACKGROUND.
// Каталог ниже — единственный источник вариантов; экран профиля строится по нему.
export const CATALOG = {
  gender: ['male', 'female'],
  faceShape: ['oval', 'round', 'square', 'long', 'heart'],
  skin: ['#f6d7c3', '#eac0a0', '#d8a47f', '#b97c56', '#8d5a3b', '#5f3a26', '#3f2519'],
  hair: ['bald', 'buzz', 'short', 'slick', 'curly', 'mohawk', 'bob', 'long', 'ponytail', 'bun'],
  hairColor: ['#0f0c0a', '#2d1d12', '#5a3a22', '#8b5a2b', '#c49a5a', '#e7cf9a', '#a33a1f', '#8a8a8a', '#e8e8e8', '#5b2a86'],
  eyes: ['#3b2415', '#6b4423', '#3d6b3a', '#3a6ea5', '#7a8a95', '#b08d3a'],
  brows: ['natural', 'thin', 'thick', 'arched'],
  beard: ['none', 'stubble', 'goatee', 'short', 'full'],
  mustache: ['none', 'classic', 'chevron', 'handlebar'],
  top: ['tshirt', 'hoodie', 'jacket', 'suit', 'leather', 'tactical', 'premium', 'sport'],
  color: ['#0d0d10', '#1e1e24', '#3a3a42', '#6b0f1a', '#1c2a4a', '#2e3b1f', '#d9b25f', '#e8e4da', '#5b2a86', '#8a4b2a'],
  eyewear: ['none', 'glasses', 'sunglasses', 'aviators', 'round', 'visor'],
  watch: ['none', 'gold', 'steel', 'black'],
  chain: ['none', 'gold', 'silver'],
  rings: ['none', 'gold', 'silver'],
  headwear: ['none', 'cap', 'beanie', 'fedora', 'cowboy', 'beret', 'bandana'],
  mask: ['none', 'black', 'gold'],
  headphones: ['none', 'black', 'gold', 'white'],
  scarf: ['none', 'red', 'black', 'gold', 'white'],
  earrings: ['none', 'gold', 'silver'],
  backpack: ['none', 'black', 'tactical', 'gold'],
  // перекраска реалистичной модели: 'orig' — как у модели
  outfit: ['orig', '#101014', '#e8e4da', '#6b0f1a', '#1c2a4a', '#2e3b1f', '#5b2a86', '#8a4b2a', '#d9b25f', '#3a3a42', '#0f5257', '#b8243c'],
  hairTint: ['orig', '#0f0c0a', '#3a2414', '#7a4a24', '#c49a5a', '#efd9a0', '#a33a1f', '#9a9a9a', '#f2f2f2', '#5b2a86', '#1f4fa8'],
  skinTone: ['-2', '-1', '0', '1', '2'],
  background: ['forge', 'violet', 'steel', 'crimson', 'ice', 'jungle'],
};

export const LABELS = {
  ru: {
    oval: 'Овал', round: 'Круглое', square: 'Квадратное', long: 'Вытянутое', heart: 'Сердце',
    bald: 'Лысый', buzz: 'Ёжик', short: 'Короткая', slick: 'Зачёс', curly: 'Кудри', mohawk: 'Ирокез', bob: 'Каре', ponytail: 'Хвост', bun: 'Пучок',
    natural: 'Обычные', thin: 'Тонкие', thick: 'Густые', arched: 'Дугой',
    none: 'Нет', stubble: 'Щетина', goatee: 'Эспаньолка', full: 'Полная', classic: 'Классика', chevron: 'Шеврон', handlebar: 'Подкрученные',
    tshirt: 'Футболка', hoodie: 'Худи', jacket: 'Куртка', suit: 'Костюм', leather: 'Кожанка', tactical: 'Тактика', premium: 'Премиум', sport: 'Спорт',
    glasses: 'Очки', sunglasses: 'Солнцезащитные', aviators: 'Авиаторы', gold: 'Золото', steel: 'Сталь', black: 'Чёрные', silver: 'Серебро',
    cap: 'Кепка', beanie: 'Шапка', fedora: 'Федора', cowboy: 'Ковбойская', beret: 'Берет', bandana: 'Бандана',
    round: 'Круглые', visor: 'Визор', white: 'Белые', red: 'Красный', tactical: 'Тактический', orig: 'Как у модели',
    '-2': 'Темнее', '-1': 'Чуть темнее', '0': 'Как у модели', '1': 'Чуть светлее', '2': 'Светлее',
    forge: 'Кузница', violet: 'Неон', crimson: 'Багрянец', ice: 'Лёд', jungle: 'Джунгли',
  },
  en: {},
};

export const BACKGROUNDS = {
  forge: ['#3a2508', '#0a0604', '#d9b25f'],
  violet: ['#2a1150', '#07040d', '#8b5cf6'],
  steel: ['#2a3038', '#07080a', '#9fb4c8'],
  crimson: ['#4a0b10', '#0a0304', '#ff4b4b'],
  ice: ['#123248', '#03080d', '#7fd4ff'],
  jungle: ['#123a22', '#030a05', '#c9a54a'],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function randomProfile(name = '') {
  { const hr = pick(HEROES); return { name, gender: hr.gender, person: hr.person, hero: hr.id, background: 'violet' }; } // только герои (26.09)
  const gender = pick(CATALOG.gender);
  const person = pick(PEOPLE.filter((x) => x.gender === gender)).id;
  const male = gender === 'male';
  return {
    name,
    gender,
    person,
    faceShape: pick(CATALOG.faceShape),
    skin: pick(CATALOG.skin),
    hair: male ? pick(['buzz', 'short', 'slick', 'curly', 'mohawk', 'bald']) : pick(['bob', 'long', 'ponytail', 'bun', 'curly']),
    hairColor: pick(CATALOG.hairColor.slice(0, 7)),
    eyes: pick(CATALOG.eyes),
    brows: pick(CATALOG.brows),
    beard: male ? pick(CATALOG.beard) : 'none',
    mustache: male ? pick(['none', 'none', 'classic', 'chevron']) : 'none',
    top: pick(CATALOG.top),
    topColor: pick(CATALOG.color),
    pantsColor: pick(['#0d0d10', '#1e1e24', '#3a3a42', '#1c2a4a']),
    eyewear: pick(['none', 'none', 'glasses', 'sunglasses', 'aviators']),
    watch: pick(CATALOG.watch),
    chain: pick(['none', 'none', 'gold', 'silver']),
    rings: pick(['none', 'gold', 'silver']),
    headwear: pick(['none', 'none', 'none', 'cap', 'beanie', 'fedora']),
    background: pick(CATALOG.background),
  };
}

const FACE = {
  oval: { s: [0.9, 1.1, 1], jaw: 0.8 },
  round: { s: [0.97, 1.02, 1], jaw: 0.92 },
  square: { s: [0.97, 1.04, 0.98], jaw: 0.98 },
  long: { s: [0.86, 1.2, 0.98], jaw: 0.76 },
  heart: { s: [0.96, 1.08, 1], jaw: 0.66 },
};

const METAL = {
  gold: { color: '#e6c06a', metalness: 1, roughness: 0.22 },
  silver: { color: '#d8dde3', metalness: 1, roughness: 0.2 },
  steel: { color: '#b8c0c8', metalness: 1, roughness: 0.3 },
  black: { color: '#15161a', metalness: 0.6, roughness: 0.4 },
};

function mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o }); }
function cloth(color) { return new THREE.MeshPhysicalMaterial({ color, roughness: 0.85, sheen: 0.35, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.1), envMapIntensity: 0.5 }); }
function mesh(geo, material, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }

// Сфера-оболочка: phi — вокруг оси Y (π/2 = лицо), theta — от макушки вниз.
function shell(r, phiStart, phiLen, thetaStart, thetaLen) {
  return new THREE.SphereGeometry(r, 36, 20, phiStart, phiLen, thetaStart, thetaLen);
}
const FRONT = Math.PI / 2;

export function buildAvatar(p) {
  const job = p.person && personCache.get(p.person);
  if (job?.resolved) return buildPerson(p, job.resolved);
  if (p.person && !job?.failed) { // ещё грузится: пустое место, чтобы не мелькал манекен
    const g = new THREE.Group(); g.name = 'avatar'; g.userData.height = 1.8; g.userData.update = () => {}; return g;
  }
  const root = new THREE.Group();
  root.name = 'avatar';
  const male = p.gender === 'male';
  const H = male ? 1 : 0.95;

  const skin = new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.6, envMapIntensity: 0.4 });
  const top = p.top === 'leather'
    ? new THREE.MeshPhysicalMaterial({ color: p.topColor, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.3 })
    : cloth(p.topColor);
  const pants = cloth(p.pantsColor);
  const hairM = mat(p.hairColor, { roughness: 0.75 });
  const shoeM = mat('#0b0b0d', { roughness: 0.35, metalness: 0.2 });

  const body = new THREE.Group();
  body.scale.setScalar(H);
  root.add(body);

  // ---------- BODY ----------
  const legR = male ? 0.075 : 0.07;
  for (const sx of [-1, 1]) {
    body.add(mesh(new THREE.CapsuleGeometry(legR, 0.72, 6, 16), pants, sx * 0.1, 0.47, 0));
    const shoe = mesh(new RoundedBoxGeometry(0.12, 0.09, 0.27, 3, 0.035), shoeM, sx * 0.1, 0.045, 0.045);
    body.add(shoe);
  }
  const pelvis = mesh(new THREE.SphereGeometry(1, 24, 16), pants, 0, 0.9, 0);
  pelvis.scale.set(male ? 0.158 : 0.18, 0.1, 0.105);
  body.add(pelvis);

  const prof = male
    ? [[0.001, 0.86], [0.16, 0.88], [0.15, 1.0], [0.158, 1.1], [0.185, 1.25], [0.2, 1.37], [0.17, 1.46], [0.06, 1.5], [0.001, 1.505]]
    : [[0.001, 0.86], [0.185, 0.88], [0.14, 1.02], [0.133, 1.1], [0.168, 1.23], [0.17, 1.3], [0.158, 1.38], [0.135, 1.44], [0.055, 1.48], [0.001, 1.485]];
  const torsoGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  const torso = mesh(torsoGeo, top);
  torso.scale.z = 0.64;
  body.add(torso);

  const shoulderX = male ? 0.2 : 0.17;
  const longSleeve = p.top !== 'tshirt';
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * shoulderX, 1.4, 0);
    arm.rotation.z = sx * 0.1;
    arm.add(mesh(new THREE.SphereGeometry(male ? 0.07 : 0.062, 20, 14), top));
    arm.add(mesh(new THREE.CapsuleGeometry(male ? 0.055 : 0.048, 0.24, 6, 14), top, 0, -0.16, 0));
    const fore = new THREE.Group();
    fore.position.set(0, -0.3, 0);
    fore.rotation.x = -0.12;
    fore.add(mesh(new THREE.CapsuleGeometry(male ? 0.047 : 0.041, 0.22, 6, 14), longSleeve ? top : skin, 0, -0.13, 0));
    const hand = mesh(new THREE.SphereGeometry(0.048, 16, 12), skin, 0, -0.29, 0.005);
    hand.scale.set(0.8, 1.25, 0.6);
    fore.add(hand);
    arm.add(fore);
    arm.userData = { fore, hand, sx };
    arms.push(arm);
    body.add(arm);
  }

  body.add(mesh(new THREE.CylinderGeometry(male ? 0.052 : 0.045, 0.058, 0.12, 16), skin, 0, 1.53, 0));

  // ---------- FACE ----------
  const head = new THREE.Group();
  head.position.set(0, 1.67, 0.005);
  body.add(head);
  const f = FACE[p.faceShape] || FACE.oval;
  const R = male ? 0.116 : 0.11;
  const cranium = mesh(new THREE.SphereGeometry(R, 36, 24), skin);
  cranium.scale.set(...f.s);
  head.add(cranium);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.045, 0.004);
  jaw.scale.set(f.jaw * f.s[0], 0.72, 0.9);
  head.add(jaw);
  jaw.add(mesh(new THREE.SphereGeometry(R, 32, 20), skin));

  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.024, 12, 10), skin, sx * R * f.s[0] * 0.98, -0.005, -0.005);
    ear.scale.set(0.45, 1, 0.7);
    head.add(ear);
  }
  const fz = R * f.s[2];
  const white = mat('#f4f1ea', { roughness: 0.2 });
  const iris = mat(p.eyes, { roughness: 0.15 });
  const pupil = mat('#050505', { roughness: 0.1 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * 0.037, 0.012, fz * 0.83);
    eye.add(mesh(new THREE.SphereGeometry(0.017, 16, 12), white));
    eye.add(mesh(new THREE.SphereGeometry(0.0095, 14, 10), iris, 0, 0, 0.011));
    eye.add(mesh(new THREE.SphereGeometry(0.0048, 10, 8), pupil, 0, 0, 0.0175));
    head.add(eye);

    const bw = { natural: [0.036, 0.007], thin: [0.034, 0.004], thick: [0.038, 0.011], arched: [0.036, 0.006] }[p.brows] || [0.036, 0.007];
    const brow = mesh(new RoundedBoxGeometry(bw[0], bw[1], 0.01, 2, bw[1] / 2.2), hairM, sx * 0.038, 0.042, fz * 0.9);
    brow.rotation.z = sx * (p.brows === 'arched' ? -0.28 : -0.08);
    brow.rotation.y = sx * 0.22;
    head.add(brow);
  }
  const nose = mesh(new THREE.ConeGeometry(0.013, 0.038, 12), skin, 0, -0.012, fz * 0.97);
  nose.rotation.x = Math.PI / 2 - 0.35;
  head.add(nose);
  const lips = mesh(new RoundedBoxGeometry(male ? 0.036 : 0.038, male ? 0.008 : 0.011, 0.012, 2, 0.004), mat(male ? '#9b5c4c' : '#a8434f', { roughness: 0.4 }), 0, -0.05, fz * 0.86);
  head.add(lips);

  // ---------- HAIR ----------
  const hs = f.s;
  const hairGroup = new THREE.Group();
  hairGroup.scale.set(...hs);
  head.add(hairGroup);
  const openFace = (r, tLen) => shell(r, FRONT + 0.95, Math.PI * 2 - 1.9, 0, tLen);
  switch (p.hair) {
    case 'buzz': hairGroup.add(mesh(shell(R * 1.015, 0, Math.PI * 2, 0, Math.PI * 0.44), hairM)); break;
    case 'short':
      hairGroup.add(mesh(shell(R * 1.06, 0, Math.PI * 2, 0, Math.PI * 0.4), hairM));
      hairGroup.add(mesh(openFace(R * 1.05, Math.PI * 0.55), hairM));
      break;
    case 'slick': {
      const s = mesh(shell(R * 1.07, 0, Math.PI * 2, 0, Math.PI * 0.42), hairM);
      s.scale.set(1, 1.08, 1.04); s.position.y = 0.006; hairGroup.add(s);
      hairGroup.add(mesh(openFace(R * 1.05, Math.PI * 0.56), hairM));
      break;
    }
    case 'curly':
      hairGroup.add(mesh(shell(R * 1.04, 0, Math.PI * 2, 0, Math.PI * 0.45), hairM));
      for (let i = 0; i < 70; i++) {
        const th = Math.random() * Math.PI * 0.5, ph = Math.random() * Math.PI * 2;
        if (th > Math.PI * 0.32 && Math.sin(ph) > 0.3) continue; // лицо открыто
        const r = R * 1.1;
        hairGroup.add(mesh(new THREE.SphereGeometry(0.024, 8, 6), hairM, -r * Math.cos(ph) * Math.sin(th), r * Math.cos(th), r * Math.sin(ph) * Math.sin(th)));
      }
      break;
    case 'mohawk':
      hairGroup.add(mesh(shell(R * 1.012, 0, Math.PI * 2, 0, Math.PI * 0.4), mat(p.hairColor, { roughness: 0.9, transparent: true, opacity: 0.55 })));
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + i * 0.3;
        const spike = mesh(new THREE.ConeGeometry(0.016, 0.07, 8), hairM, 0, Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05);
        spike.rotation.x = a; hairGroup.add(spike);
      }
      break;
    case 'bob':
      hairGroup.add(mesh(shell(R * 1.07, 0, Math.PI * 2, 0, Math.PI * 0.4), hairM));
      hairGroup.add(mesh(openFace(R * 1.09, Math.PI * 0.74), hairM));
      break;
    case 'long': {
      hairGroup.add(mesh(shell(R * 1.07, 0, Math.PI * 2, 0, Math.PI * 0.4), hairM));
      hairGroup.add(mesh(openFace(R * 1.08, Math.PI * 0.7), hairM));
      const back = mesh(new RoundedBoxGeometry(0.2, 0.3, 0.06, 3, 0.028), hairM, 0, -0.14, -0.07);
      back.rotation.x = 0.12; hairGroup.add(back);
      for (const sx of [-1, 1]) hairGroup.add(mesh(new RoundedBoxGeometry(0.045, 0.24, 0.06, 3, 0.02), hairM, sx * 0.1, -0.11, 0.0));
      break;
    }
    case 'ponytail': {
      hairGroup.add(mesh(shell(R * 1.05, 0, Math.PI * 2, 0, Math.PI * 0.42), hairM));
      hairGroup.add(mesh(openFace(R * 1.04, Math.PI * 0.6), hairM));
      hairGroup.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), hairM, 0, 0.03, -0.115));
      const tail = mesh(new THREE.CapsuleGeometry(0.028, 0.2, 4, 10), hairM, 0, -0.1, -0.14);
      tail.rotation.x = 0.25; hairGroup.add(tail);
      break;
    }
    case 'bun':
      hairGroup.add(mesh(shell(R * 1.05, 0, Math.PI * 2, 0, Math.PI * 0.42), hairM));
      hairGroup.add(mesh(openFace(R * 1.04, Math.PI * 0.6), hairM));
      hairGroup.add(mesh(new THREE.SphereGeometry(0.05, 16, 12), hairM, 0, 0.1, -0.07));
      break;
    default: break;
  }

  // Борода и усы — оболочки поверх челюсти, следуют её форме.
  const beardSpec = { stubble: [1.3, 0.55, 0.45], short: [1.15, 0.56, 1], full: [1.4, 0.48, 1], goatee: [0.36, 0.68, 1] }[p.beard];
  if (beardSpec) {
    const [w, t0, op] = beardSpec;
    const bm = mat(p.hairColor, { roughness: 0.9, transparent: op < 1, opacity: op });
    const b = mesh(shell(R * (p.beard === 'full' ? 1.1 : 1.05), FRONT - w, w * 2, Math.PI * t0, Math.PI * (1 - t0)), bm);
    b.material.side = THREE.DoubleSide;
    jaw.add(b);
  }
  if (p.mustache !== 'none' && p.mustache) {
    const mw = { classic: 0.05, chevron: 0.06, handlebar: 0.055 }[p.mustache];
    const m = mesh(new RoundedBoxGeometry(mw, p.mustache === 'chevron' ? 0.016 : 0.01, 0.012, 2, 0.005), hairM, 0, -0.036, fz * 0.9);
    head.add(m);
    if (p.mustache === 'handlebar') for (const sx of [-1, 1]) {
      const curl = mesh(new THREE.TorusGeometry(0.008, 0.003, 6, 12, Math.PI * 1.2), hairM, sx * 0.03, -0.03, fz * 0.88);
      curl.rotation.z = sx > 0 ? -0.6 : Math.PI + 0.6; head.add(curl);
    }
  }

  // ---------- CLOTHES: детали поверх торса ----------
  const accent = (c) => mat(c, { roughness: 0.6 });
  const chest = (w, h, d, y, z, material) => mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) / 2.5), material, 0, y, z);
  const frontZ = (male ? 0.2 : 0.17) * 0.64;
  switch (p.top) {
    case 'hoodie': {
      const hood = mesh(new THREE.TorusGeometry(0.1, 0.045, 10, 24), top, 0, 1.5, -0.05);
      hood.rotation.x = Math.PI / 2 + 0.5; hood.scale.set(1.1, 1, 1); body.add(hood);
      body.add(chest(0.2, 0.09, 0.03, 1.02, frontZ * 0.95, top));
      for (const sx of [-1, 1]) body.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), accent('#e8e4da'), sx * 0.03, 1.4, frontZ * 1.02));
      break;
    }
    case 'jacket':
      body.add(chest(0.07, 0.5, 0.02, 1.2, frontZ * 1.0, accent('#2b2b30')));
      body.add(mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 24), top, 0, 1.47, 0));
      break;
    case 'suit': {
      const shirt = chest(0.075, 0.26, 0.02, 1.33, frontZ * 1.0, accent('#f2efe8'));
      body.add(shirt);
      body.add(chest(0.028, 0.22, 0.012, 1.3, frontZ * 1.07, accent(p.topColor === '#6b0f1a' ? '#111' : '#6b0f1a')));
      for (const sx of [-1, 1]) {
        const lapel = chest(0.045, 0.2, 0.012, 1.34, frontZ * 1.03, top);
        lapel.position.x = sx * 0.05; lapel.rotation.z = sx * 0.3; body.add(lapel);
      }
      break;
    }
    case 'leather':
      body.add(chest(0.008, 0.48, 0.012, 1.18, frontZ * 1.04, mat('#c9c9c9', { metalness: 1, roughness: 0.3 })));
      for (const sx of [-1, 1]) {
        const col = chest(0.07, 0.12, 0.02, 1.43, frontZ * 0.9, top);
        col.position.x = sx * 0.07; col.rotation.z = sx * 0.5; body.add(col);
      }
      break;
    case 'tactical': {
      const vestM = mat('#2a2d24', { roughness: 0.9 });
      const vest = mesh(new RoundedBoxGeometry(male ? 0.36 : 0.32, 0.36, 0.25, 3, 0.05), vestM, 0, 1.2, 0);
      body.add(vest);
      for (const sx of [-1, 0, 1]) body.add(chest(0.07, 0.09, 0.05, 1.12, 0.14, vestM).translateX(sx * 0.09));
      break;
    }
    case 'premium': {
      body.add(mesh(new THREE.CylinderGeometry(0.066, 0.075, 0.1, 20), top, 0, 1.52, 0));
      const trim = mesh(new THREE.TorusGeometry(male ? 0.158 : 0.15, 0.006, 6, 40), mat('#e6c06a', { metalness: 1, roughness: 0.25 }), 0, 0.9, 0);
      trim.rotation.x = Math.PI / 2; trim.scale.y = 0.64; body.add(trim);
      break;
    }
    case 'sport':
      body.add(chest(0.006, 0.5, 0.012, 1.18, frontZ * 1.03, accent('#e8e4da')));
      for (const arm of arms) {
        arm.add(mesh(new THREE.BoxGeometry(0.012, 0.3, 0.012), accent('#e8e4da'), arm.userData.sx * 0.05, -0.16, 0));
        arm.userData.fore.add(mesh(new THREE.BoxGeometry(0.012, 0.26, 0.012), accent('#e8e4da'), arm.userData.sx * 0.043, -0.13, 0));
      }
      break;
    default: break;
  }

  // ---------- ACCESSORIES ----------
  if (p.eyewear !== 'none' && p.eyewear) {
    const frame = p.eyewear === 'aviators' ? mat('#e6c06a', { metalness: 1, roughness: 0.25 }) : mat('#101012', { roughness: 0.3, metalness: 0.3 });
    const lens = new THREE.MeshPhysicalMaterial({ color: p.eyewear === 'glasses' ? '#ffffff' : '#101418', transparent: true, opacity: p.eyewear === 'glasses' ? 0.15 : 0.85, roughness: 0.05, metalness: 0.3 });
    for (const sx of [-1, 1]) {
      const ring = mesh(new THREE.TorusGeometry(0.022, 0.0032, 8, 24), frame, sx * 0.038, 0.012, fz * 0.98);
      if (p.eyewear === 'aviators') ring.scale.set(1.05, 1.15, 1);
      head.add(ring);
      const l = mesh(new THREE.CircleGeometry(0.021, 20), lens, sx * 0.038, 0.012, fz * 0.975);
      l.scale.copy(ring.scale); head.add(l);
      const arm = mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), frame, sx * 0.062, 0.015, fz * 0.5);
      head.add(arm);
    }
    head.add(mesh(new THREE.BoxGeometry(0.03, 0.003, 0.003), frame, 0, 0.018, fz * 0.99));
  }
  if (p.watch !== 'none' && p.watch) {
    const w = arms[0].userData.fore;
    const band = mesh(new THREE.TorusGeometry(0.045, 0.01, 8, 24), mat(METAL[p.watch].color, METAL[p.watch]), 0, -0.22, 0);
    band.rotation.x = Math.PI / 2; w.add(band);
    w.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 20), mat('#0a0a0c', { roughness: 0.1, metalness: 0.5 }), -0.047, -0.22, 0).rotateZ(Math.PI / 2));
  }
  if (p.chain !== 'none' && p.chain) {
    const c = mesh(new THREE.TorusGeometry(0.1, 0.007, 8, 40), mat(METAL[p.chain].color, METAL[p.chain]), 0, 1.44, 0.03);
    c.rotation.x = Math.PI / 2 - 0.45; body.add(c);
    body.add(mesh(new THREE.OctahedronGeometry(0.015), mat(METAL[p.chain].color, METAL[p.chain]), 0, 1.38, 0.115));
  }
  if (p.rings !== 'none' && p.rings) {
    for (const arm of arms) {
      const r = mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 16), mat(METAL[p.rings].color, METAL[p.rings]), 0, -0.31, 0.01);
      r.rotation.x = Math.PI / 2; arm.userData.fore.add(r);
    }
  }
  switch (p.headwear) {
    case 'cap': {
      const cm = cloth(p.topColor === '#0d0d10' ? '#1c2a4a' : '#0d0d10');
      const crown = mesh(shell(R * 1.12, 0, Math.PI * 2, 0, Math.PI * 0.45), cm, 0, 0.012, 0);
      crown.scale.set(...hs); head.add(crown);
      const visor = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 24, 1, false, -Math.PI / 2 - 1.1, 2.2), cm, 0, 0.045, fz * 0.75);
      visor.rotation.x = 0.12; head.add(visor);
      break;
    }
    case 'beanie': {
      const bm = cloth('#3a3a42');
      const b = mesh(shell(R * 1.14, 0, Math.PI * 2, 0, Math.PI * 0.5), bm, 0, 0.018, 0);
      b.scale.set(hs[0], hs[1] * 1.08, hs[2]); head.add(b);
      const fold = mesh(new THREE.TorusGeometry(R * 1.1, 0.012, 8, 36), bm, 0, 0.02, 0);
      fold.rotation.x = Math.PI / 2; fold.scale.set(hs[0], hs[2], 1); head.add(fold);
      break;
    }
    case 'fedora': {
      const fm = mat('#1a1614', { roughness: 0.8 });
      head.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.008, 36), fm, 0, 0.075, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.1, 28), fm, 0, 0.125, 0));
      const band = mesh(new THREE.CylinderGeometry(0.101, 0.101, 0.02, 28), mat('#6b0f1a'), 0, 0.09, 0);
      head.add(band);
      break;
    }
    default: break;
  }

  // Лёгкая жизнь: дыхание и покачивание головы.
  const phase = Math.random() * 10;
  root.userData.update = (t) => {
    const b = Math.sin((t + phase) * 1.6);
    torso.scale.x = 1 + b * 0.008;
    head.rotation.y = Math.sin((t + phase) * 0.4) * 0.12;
    head.rotation.x = Math.sin((t + phase) * 0.33) * 0.03;
    for (const a of arms) a.rotation.x = Math.sin((t + phase) * 1.6) * 0.02;
  };
  root.userData.height = 1.8 * H;
  return root;
}

// Портрет (по грудь) для панелей HUD и экрана результата: картинка собирается из того же 3D-аватара.
// Рисуется ОСНОВНЫМ окном отрисовки игры (setMainRenderer из Stage) в отдельную цель: шейдеры и текстуры
// общие с игрой. Раньше было своё окно — в нём всё собиралось и загружалось второй раз (долгие задачи 250–900 мс).
let portraitRenderer = null, mainRenderer = null;
export function setMainRenderer(r) { mainRenderer = r; }
function portraitComposer(w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
  const composer = new EffectComposer(mainRenderer, rt);
  composer.renderToScreen = false;
  return composer;
}
// Портрет для списка игроков/HUD/итогов. Герои — готовые картинки (tools: cellSurvival.renderPortrait),
// остальные рисуются один раз и запоминаются в браузере. Рисование портрета в игре собирало шейдеры
// под свой свет (профиль 25.09: портреты давали треть всех шейдеров и секунды зависаний).
export function portraitSrc(profile, w = 160, h = 200, full = false) {
  const hero = heroOf(profile);
  if (hero) return `${ASSETS}heroes/${hero.id}${full ? '_full' : ''}.jpg${ART_V}`;
  const key = 'cs.portrait.' + w + 'x' + h + (full ? 'f' : '') + JSON.stringify(profile || {});
  try { const v = localStorage.getItem(key); if (v) return v; } catch { /* нет хранилища */ }
  const url = renderPortrait(profile, w, h, full);
  try { localStorage.setItem(key, url); } catch { /* переполнено — просто не запомним */ }
  return url;
}

export function renderPortrait(profile, w = 480, h = 600, full = false) {
  if (!mainRenderer && !portraitRenderer) {
    portraitRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    portraitRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  portraitRenderer?.setSize(w, h, false);
  const scene = new THREE.Scene();
  const bg = BACKGROUNDS[profile.background] || BACKGROUNDS.forge;
  scene.add(new THREE.HemisphereLight('#ffffff', '#302018', 0.45));
  const key = new THREE.DirectionalLight('#ffe8cc', 3.2); key.position.set(2.2, 2.6, 1.8); scene.add(key);
  const fill = new THREE.DirectionalLight('#c4d6ff', 0.7); fill.position.set(-2.5, 1.6, 2.4); scene.add(fill);
  const rim = new THREE.DirectionalLight(bg[2], 4); rim.position.set(-2, 2, -2); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(bg[2], 2); rim2.position.set(2, 1, -2); scene.add(rim2);
  const av = buildAvatar(profile);
  scene.add(av);
  const s = av.userData.height / 1.8;
  const cam = new THREE.PerspectiveCamera(full ? 30 : 24, w / h, 0.1, 50);
  if (full) { cam.position.set(0.9, 1.2 * s, 3.6); cam.lookAt(0, 0.95 * s, 0); }
  else { cam.position.set(0.35, 1.58 * s, 1.35); cam.lookAt(0, 1.45 * s, 0); }
  let shot = null;
  if (mainRenderer) {
    const composer = portraitComposer(w, h);
    composer.addPass(new RenderPass(scene, cam));
    composer.addPass(new OutputPass()); // тон и sRGB — как в игре
    const shadows = mainRenderer.shadowMap.enabled; mainRenderer.shadowMap.enabled = false;
    const prevTM = mainRenderer.toneMapping; mainRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    const prevClear = mainRenderer.getClearColor(new THREE.Color()), prevAlpha = mainRenderer.getClearAlpha();
    mainRenderer.setClearColor(0x000000, 0); // прозрачный фон: под портретом рисуется градиент фона игрока
    composer.render();
    mainRenderer.setClearColor(prevClear, prevAlpha);
    mainRenderer.shadowMap.enabled = shadows; mainRenderer.toneMapping = prevTM;
    const px = new Uint8Array(w * h * 4);
    mainRenderer.readRenderTargetPixels(composer.readBuffer, 0, 0, w, h, px);
    composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); composer.passes.forEach((p) => p.dispose?.());
    const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
    const og = oc.getContext('2d'), id = og.createImageData(w, h);
    for (let y = 0; y < h; y++) id.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // строки снизу вверх
    og.putImageData(id, 0, 0);
    shot = oc;
  } else portraitRenderer.render(scene, cam);

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.5, h * 0.8);
  grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.drawImage(shot || portraitRenderer.domElement, 0, 0);
  const vg = g.createLinearGradient(0, h * 0.6, 0, h);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  // у реалистичного человека геометрия и материалы общие с загруженным образцом — не освобождаем
  if (!av.userData.person) av.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  scene.remove(av); // портрет готов — его движения больше не считаем (updateAvatars забудет аватар без родителя)
  return c.toDataURL('image/jpeg', 0.9);
}
