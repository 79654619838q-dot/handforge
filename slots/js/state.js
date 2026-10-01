// Кошелёк игрока, общий джекпот, ставки и настройки — всё в браузере (деньги ненастоящие).
import { ls } from './storage.js';
import { START_BALANCE, JACKPOT_SEED, DEFAULT_BET, BETS } from './machines.js';

const KEY = 'slots.state.v1';

function fresh() {
  return {
    balance: START_BALANCE,
    jackpot: JACKPOT_SEED,
    bets: {},          // ставка по каждому автомату
    sound: true,
    turbo: false,
    fs: {},            // незаконченные бесплатные вращения по автоматам: { egypt: { left, count, i, bet, total } }
    stats: { spins: 0, wagered: 0, won: 0, biggest: 0, biggestMachine: '', jackpots: 0, fsRounds: 0, gifts: 0 },
  };
}

function load() {
  const s = fresh();
  try {
    const raw = JSON.parse(ls.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      Object.assign(s, raw);
      s.stats = Object.assign(fresh().stats, raw.stats || {});
    }
  } catch {}
  if (!Number.isFinite(s.balance) || s.balance < 0) s.balance = START_BALANCE;
  if (!Number.isFinite(s.jackpot) || s.jackpot < JACKPOT_SEED) s.jackpot = JACKPOT_SEED;
  if (!s.fs || typeof s.fs !== 'object') s.fs = {};
  if (typeof s.fs.machine === 'string') { const { machine, ...rest } = s.fs; s.fs = { [machine]: rest }; } // старая запись
  return s;
}

export const state = load();

export function save() {
  ls.setItem(KEY, JSON.stringify(state));
}

export function betFor(id) {
  const b = state.bets[id];
  return BETS.includes(b) ? b : DEFAULT_BET;
}

export function resetAll() {
  Object.assign(state, fresh());
  save();
}
