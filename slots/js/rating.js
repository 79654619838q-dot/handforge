// Общий рейтинг игроков на сайте: кто выше всех поднялся со стартовых 10 000 (рекорд счёта).
// Игрок — случайный номер в браузере + имя, которое он ввёл сам.
import { ls } from './storage.js';
import { state } from './state.js';

const KEY = 'slots.player';

export function player() {
  let p = null;
  try { p = JSON.parse(ls.getItem(KEY) || 'null'); } catch {}
  if (!p || !p.id) {
    p = { id: (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()), name: '' };
    ls.setItem(KEY, JSON.stringify(p));
  }
  return p;
}

export function setName(name) {
  const p = player();
  p.name = String(name).replace(/[<>]/g, '').trim().slice(0, 24);
  ls.setItem(KEY, JSON.stringify(p));
  lastSent = 0;
  return push(true);
}

let lastSent = 0, lastBest = -1, timer = null;
// отправить рекорд: не чаще раза в 12 с и только если что-то изменилось
export function push(force = false) {
  const p = player();
  if (!p.name) return Promise.resolve(false);
  const best = state.stats.maxBalance;
  const wealth = state.balance + state.stats.shopSpent;
  const key = best + ':' + wealth;
  if (!force && key === lastBest && Date.now() - lastSent < 60000) return Promise.resolve(false);
  const wait = 12000 - (Date.now() - lastSent);
  if (wait > 0) {
    clearTimeout(timer);
    timer = setTimeout(() => push(force), wait);
    return Promise.resolve(false);
  }
  lastSent = Date.now(); lastBest = key;
  return fetch('api/rating', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: p.id, name: p.name, best, wealth, balance: state.balance, spins: state.stats.spins, jackpots: state.stats.jackpots, level: state.level }),
  }).then((r) => r.ok).catch(() => false);
}

// by: 'best' — по рекорду, 'wealth' — «Самый богатый» (монеты + покупки)
export function loadTop(by = 'best') {
  return fetch(`api/rating?by=${by}&me=` + encodeURIComponent(player().id), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}
