// Список всех реплик с голосами → detective-art/lines.json (для build_voice.py).
// node detective/tools/collect_lines.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectLines } from './lines.mjs';
import { CASES as RELEASED } from '../js/data/cases.js';
import { PEOPLE } from '../js/data/people.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
// озвучиваем и черновики следующих глав (все js/cases/cNN.js), чтобы к выкладке голос был готов
const dir = path.join(ROOT, 'detective', 'js', 'cases');
const CASES = [...RELEASED];
for (const f of fs.readdirSync(dir).filter((f) => /^c\d+\.js$/.test(f)).sort()) {
  const c = (await import('../js/cases/' + f)).default;
  if (!CASES.some((x) => x.id === c.id)) CASES.push(c);
}
const lines = collectLines(CASES, PEOPLE).map((l) => {
  const p = PEOPLE[l.who];
  if (!p) throw new Error('нет голоса у ' + l.who);
  return { ...l, voice: p.voice.voice, pitch: p.voice.pitch, rate: p.voice.rate };
});
const out = path.join(ROOT, 'detective-art', 'lines.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(lines, null, 1));
console.log('реплик:', lines.length, '→', out);
