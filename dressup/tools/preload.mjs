// Прописывает в index.html параллельную загрузку модулей и картинок первого экрана
// (хостинг отвечает ~1,3 с на файл — цепочка import'ов иначе растягивает старт). Запускается из build_assets.py.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { DOLL } = await import(pathToFileURL(path.join(ROOT, 'js', 'doll-manifest.js')).href);
const file = path.join(ROOT, 'index.html');
let h = fs.readFileSync(file, 'utf8');
const ver = (h.match(/app\.js\?v=(\d+)/) || [0, '1'])[1];
const P = DOLL.princesses.lilia || Object.values(DOLL.princesses)[0];
const dress = DOLL.items.dress_flower || DOLL.items.ball_pink;
const hair = DOLL.items[P.hair];
const imgs = [hair?.back, P.body, dress?.layer, P.arms, hair?.front].filter(Boolean).map((l) => `assets/doll/${l.f}.webp`);
if (dress?.bodymask) imgs.push(`assets/doll/${dress.bodymask}.png`);
const mods = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const lines = [
  ...mods.map((m) => `<link rel="modulepreload" href="js/${m}${m === 'app.js' ? `?v=${ver}` : ''}" />`),
  '<link rel="preload" as="image" href="assets/bg/palace.jpg" />',
  ...imgs.map((u) => `<link rel="preload" as="image" href="${u}" />`),
];
h = h.replace(/<link rel="(modulepreload|preload)"[^>]*>\r?\n/g, '');
h = h.replace('<link rel="stylesheet"', lines.join('\n') + '\n<link rel="stylesheet"');
fs.writeFileSync(file, h);
console.log('preload', lines.length);
