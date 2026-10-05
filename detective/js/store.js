// Сохранение прохождения в браузере. Если хранилище недоступно (приватное окно) — в памяти,
// игра работает, но после закрытия вкладки прогресс не сохранится (предупреждаем один раз).
const KEY = 'archiv.v1';
let mem = null;
let broken = false;

function blank() {
  return {
    player: { id: Math.random().toString(36).slice(2) + Date.now().toString(36), name: '' },
    settings: { voice: 0.9, music: 0.35, subs: true },
    done: {},     // id дела → { best, stars, ending, plays }
    runs: {},     // id дела → сохранённое незаконченное расследование
    seen: {},     // id дела → список просмотренного (для значков «новое»)
    tokens: [],   // номера собранных жетонов
    intro: false,
  };
}

export function load() {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY);
    mem = raw ? { ...blank(), ...JSON.parse(raw) } : blank();
  } catch { broken = true; mem = blank(); }
  return mem;
}

export function save() {
  if (!mem) return;
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { broken = true; }
}

export const storageBroken = () => broken;

export function resetAll() {
  const keepPlayer = load().player;
  mem = blank();
  mem.player = keepPlayer;
  save();
}

// итог дела: лучший результат не уменьшается
export function recordCase(id, { score, stars, ending, tokens }) {
  const s = load();
  const prev = s.done[id] || { best: 0, stars: 0, plays: 0 };
  s.done[id] = { best: Math.max(prev.best, score), stars: Math.max(prev.stars, stars), ending: prev.ending === 'true' ? 'true' : ending, plays: prev.plays + 1 };
  for (const t of tokens || []) if (!s.tokens.includes(t)) s.tokens.push(t);
  delete s.runs[id];
  save();
}

export function totals() {
  const s = load();
  let score = 0, stars = 0, solved = 0;
  for (const d of Object.values(s.done)) { score += d.best; stars += d.stars; if (d.ending === 'true') solved++; }
  return { score, stars, solved, cases: Object.keys(s.done).length };
}
