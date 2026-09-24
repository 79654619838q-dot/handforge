// Анимации Microsoft Rocketbox (MIT) → один компактный JSON для игры.
// node tools/convert_anims.mjs <папка с *.max.fbx> public/assets/avatar/anims.json
// Берём только повороты костей тела (+ положение таза): без пальцев и мимики, 15 кадров/с, 3 знака,
// неподвижная кость — одно значение, длинные ролики обрезаются (игра переключает ролики плавно, шов не виден).
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

const [src, out] = process.argv.slice(2);
const FPS = 15;
const r4 = (v) => Math.round(v * 1e3) / 1e3;
const MAX_SEC = 12;
const SKIP = /Finger|Eye|Mouth|Jaw|Lip|Tongue|Masseter|Caninus|Cheek|brow|Nose|Footsteps|MotionExtraction/i;
const loader = new FBXLoader();
const clips = {};
for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.fbx')).sort()) {
  const buf = fs.readFileSync(path.join(src, f));
  const fbx = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const clip = fbx.animations[0];
  if (!clip) { console.log('нет анимации', f); continue; }
  const name = f.replace('.max.fbx', '');
  const dur = Math.min(clip.duration, MAX_SEC);
  const n = Math.max(2, Math.round(dur * FPS) + 1);
  const times = Array.from({ length: n }, (_, i) => r4((i / (n - 1)) * dur));
  const tracks = [];
  for (const tr of clip.tracks) {
    const [node, prop] = tr.name.split('.');
    const isQ = prop === 'quaternion';
    const isRootPos = prop === 'position' && /Pelvis$|Bip01$/.test(node);
    if ((!isQ && !isRootPos) || SKIP.test(node)) continue;
    const it = tr.createInterpolant(); const size = isQ ? 4 : 3;
    const vals = [];
    for (const t of times) { const v = it.evaluate(t); for (let k = 0; k < size; k++) vals.push(r4(v[k])); }
    // кость не двигается — хватит одного значения
    const still = vals.every((v, i) => Math.abs(v - vals[i % size]) < 0.002);
    tracks.push({ n: node, p: prop, v: still ? vals.slice(0, size) : vals });
  }
  clips[name] = { d: r4(dur), t: times, k: tracks };
  console.log(name, dur.toFixed(2) + ' с', tracks.length, 'дорожек');
}
fs.writeFileSync(out, JSON.stringify(clips));
console.log('записано', out, (fs.statSync(out).size / 1e6).toFixed(2), 'МБ');
