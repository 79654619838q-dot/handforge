// Список всех реплик с голосами → detective-art/lines.json (для build_voice.py).
// node detective/tools/collect_lines.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectLines } from './lines.mjs';
import { CASES } from '../js/data/cases.js';
import { PEOPLE } from '../js/data/people.js';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const lines = collectLines(CASES, PEOPLE).map((l) => {
  const p = PEOPLE[l.who];
  if (!p) throw new Error('нет голоса у ' + l.who);
  return { ...l, voice: p.voice.voice, pitch: p.voice.pitch, rate: p.voice.rate };
});
const out = path.join(ROOT, 'detective-art', 'lines.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(lines, null, 1));
console.log('реплик:', lines.length, '→', out);
