// Кошелёк игрока, джекпот, уровень, задания, медали и настройки — всё в браузере (деньги ненастоящие).
import { ls } from './storage.js';
import { START_BALANCE, JACKPOT_SEED, DEFAULT_BET, BETS } from './machines.js';

const KEY = 'slots.state.v1';

function freshStats() {
  return {
    spins: 0, wagered: 0, won: 0, biggest: 0, biggestMachine: '', jackpots: 0, fsRounds: 0, gifts: 0,
    rewards: 0,      // монеты за уровни, задания, медали и колесо
    picks: 0, buys: 0, wheelSpins: 0, maxStreak: 0, maxBalance: START_BALANCE, giftWilds: 0, multHits: 0,
    bestMult: 0, mult5: 0, taskDays: 0,
    jp: { mini: 0, minor: 0, major: 0, grand: 0 },
    played: {},      // в каких автоматах играл
  };
}

function fresh() {
  return {
    balance: START_BALANCE,
    jackpot: JACKPOT_SEED,
    bets: {},          // ставка по каждому автомату
    sound: true,
    turbo: false,
    fs: {},            // незаконченные бесплатные вращения по автоматам: { egypt: { left, count, i, bet, total, sticky } }
    streak: {},        // горячая серия по автоматам: выигрышей подряд
    xp: 0,
    level: 1,
    tasks: null,       // задания дня: { day, list: [{ id, have, done }], bonus }
    medals: {},        // медаль → когда получена
    wheelAt: 0,        // когда последний раз крутили колесо удачи
    stats: freshStats(),
  };
}

function load() {
  const s = fresh();
  try {
    const raw = JSON.parse(ls.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      Object.assign(s, raw);
      s.stats = Object.assign(freshStats(), raw.stats || {});
      s.stats.jp = Object.assign(freshStats().jp, s.stats.jp || {});
    }
  } catch {}
  if (!Number.isFinite(s.balance) || s.balance < 0) s.balance = START_BALANCE;
  if (!Number.isFinite(s.jackpot) || s.jackpot < JACKPOT_SEED) s.jackpot = JACKPOT_SEED;
  if (!s.fs || typeof s.fs !== 'object') s.fs = {};
  if (typeof s.fs.machine === 'string') { const { machine, ...rest } = s.fs; s.fs = { [machine]: rest }; } // старая запись
  for (const f of Object.values(s.fs)) f.sticky ||= [];
  for (const k of ['streak', 'medals', 'bets']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
  if (!Number.isFinite(s.xp)) s.xp = 0;
  if (!Number.isFinite(s.level) || s.level < 1) s.level = 1;
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
