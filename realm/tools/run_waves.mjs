// Рисует очередь до конца, переживая дневной лимит ChatGPT: запускает gen.mjs, при лимите или сбое ждёт и
// повторяет, пока в realm-art/raw не будет всех картинок. После каждого прохода нарезает готовое (build_assets).
// node realm/tools/run_waves.mjs realm-art/jobs/wave2.json
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const RAW = path.join(ROOT, 'realm-art', 'raw');
const files = process.argv.slice(2);
const jobs = files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const log = (s) => { const l = `${new Date().toLocaleString('ru-RU')} [waves] ${s}`; console.log(l); fs.appendFileSync(path.join(RAW, 'gen.log'), l + '\n'); };
const missing = () => jobs.filter((j) => !fs.existsSync(path.join(RAW, j.name + '.png'))).map((j) => j.name);
const wait = (min) => { log(`жду ${min} мин`); spawnSync(process.execPath, ['-e', `setTimeout(()=>{}, ${min * 60000})`]); };

let idle = 0;
while (missing().length) {
  const before = missing().length;
  log(`осталось ${before}, запускаю очередь`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'realm', 'tools', 'gen.mjs'), ...files], { stdio: 'inherit' });
  spawnSync('python', [path.join(ROOT, 'realm', 'tools', 'build_assets.py')], { stdio: 'inherit' });
  const after = missing().length;
  if (after === 0) break;
  if (after < before) { idle = 0; if (r.status === 2) wait(60); continue; } // лимит — ждём час
  idle++;
  wait(idle > 3 ? 120 : 30); // ничего не нарисовалось: ChatGPT закрыт или сбой — ждём дольше
}
log('ВСЁ НАРИСОВАНО');
