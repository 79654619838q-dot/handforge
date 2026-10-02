// Кошелёк игрока, джекпот, уровень, задания, медали и настройки — всё в браузере (деньги ненастоящие).
import { ls } from './storage.js';
import { START_BALANCE, JACKPOT_SEED, DEFAULT_BET, byId, betsOf } from './machines.js';

const KEY = 'slots.state.v1';

function freshStats() {
  return {
    spins: 0, wagered: 0, won: 0, biggest: 0, biggestMachine: '', jackpots: 0, fsRounds: 0, gifts: 0,
    rewards: 0,      // монеты за уровни, задания, медали и колесо
    picks: 0, buys: 0, wheelSpins: 0, maxStreak: 0, maxBalance: START_BALANCE, giftWilds: 0, multHits: 0,
    bestMult: 0, mult5: 0, taskDays: 0,
    shopSpent: 0,    // потрачено в магазине (усилители, новые автоматы) — для «Самого богатого»
    shopBuys: 0, boostsBought: 0, luxBuys: 0, luxSells: 0, luxBest: 0,
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
    boosts: {},        // действующие усилители: { x2: { left, bet } }
    unlocked: {},      // открытые за монеты автоматы
    owned: {},         // магазин роскоши: вещь → за сколько куплена
    avatar: null,      // аватар на картинке поместья (av1…av9)
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
  for (const k of ['streak', 'medals', 'bets', 'boosts', 'unlocked', 'owned']) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
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
  return betsOf(byId(id)).includes(b) ? b : DEFAULT_BET;
}

// стоимость купленного в магазине роскоши (продаётся за ту же цену)
export const ownedValue = () => Object.values(state.owned).reduce((a, b) => a + b, 0);
// «Самый богатый»: монеты + потраченное на усилители и автоматы + стоимость владений
export const wealth = () => state.balance + state.stats.shopSpent + ownedValue();

export function resetAll() {
  Object.assign(state, fresh());
  save();
}
