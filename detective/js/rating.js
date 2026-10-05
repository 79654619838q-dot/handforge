// Общий рейтинг детективов: /detective/api/rating (hub/detective-rating.js).
import { load, totals } from './store.js';

export async function sendRating() {
  const s = load();
  if (!s.player.name) return false;
  const t = totals();
  try {
    const r = await fetch('api/rating', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.player.id, name: s.player.name, score: t.score, stars: t.stars, solved: t.solved, cases: t.cases }) });
    return r.ok;
  } catch { return false; }
}

export async function fetchRating() {
  try {
    const r = await fetch('api/rating?me=' + encodeURIComponent(load().player.id), { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
