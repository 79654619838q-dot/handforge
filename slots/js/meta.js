// Всё, что вокруг автоматов: уровни игрока, задания дня, медали и колесо удачи.
// Автомат после каждого вращения зовёт track({...}) с итогом, а flush() показывает награды.
import { state, save, betFor } from './state.js';
import { MACHINES, COMMON } from './machines.js';
import { fairRandom, seeded } from './engine.js';
import { toast, fmt, hud, pic, esc } from './ui.js';
import { sfx } from './audio.js';
import { push } from './rating.js';

const notes = [];

function reward(coins) {
  state.balance += coins;
  state.stats.rewards += coins;
  state.stats.maxBalance = Math.max(state.stats.maxBalance, state.balance);
}

// ===================== уровни =====================
// опыт: 1 очко за каждые 10 монет ставки; до уровня n нужно 500·(n−1)^1.6 очков
export const xpFor = (lvl) => Math.round(500 * (lvl - 1) ** 1.6);
export const levelReward = (lvl) => 1000 * lvl;
export function levelInfo() {
  const l = state.level, a = xpFor(l), b = xpFor(l + 1);
  return { level: l, xp: state.xp, frac: Math.max(0, Math.min(1, (state.xp - a) / (b - a))), toNext: b - state.xp, reward: levelReward(l + 1) };
}
// призы колеса растут с уровнем: +10% за каждый
export const wheelMult = () => 1 + (state.level - 1) * 0.1;

function addXp(n) {
  state.xp += n;
  while (state.xp >= xpFor(state.level + 1)) {
    state.level++;
    const r = levelReward(state.level);
    reward(r);
    notes.push({ type: 'level', level: state.level, reward: r });
  }
}

// ===================== задания дня =====================
const TASKS = [
  { id: 'spins', text: 'Сделай 50 вращений', goal: 50, add: (e) => (e.type === 'spin' && !e.fs ? 1 : 0) },
  { id: 'wins', text: 'Выиграй 15 раз', goal: 15, add: (e) => (e.type === 'spin' && e.win > 0 ? 1 : 0) },
  { id: 'fs', text: 'Поймай бесплатные вращения', goal: 1, add: (e) => (e.fsWon ? 1 : 0) },
  { id: 'big', text: 'Выиграй за одно вращение в 20 раз больше ставки', goal: 1, add: (e) => (e.mult >= 20 ? 1 : 0) },
  { id: 'streak', text: 'Собери горячую серию: 3 выигрыша подряд', goal: 1, add: (e) => (e.streak >= 3 ? 1 : 0) },
  { id: 'machines', text: 'Сыграй во всех трёх автоматах', goal: 3, seen: true },
  { id: 'pick', text: 'Открой игру «Выбери сундук»', goal: 1, add: (e) => (e.pick ? 1 : 0) },
  { id: 'jp', text: 'Сыграй в джекпот-игру', goal: 1, add: (e) => (e.jackpot ? 1 : 0) },
  { id: 'mult', text: 'Поймай множитель на барабанах', goal: 1, add: (e) => (e.multSym ? 1 : 0) },
  { id: 'won', text: 'Выиграй в сумме 5 000 монет', goal: 5000, add: (e) => (e.type === 'spin' ? e.win : 0) },
  { id: 'wager', text: 'Поставь в сумме 20 000 монет', goal: 20000, add: (e) => (e.type === 'spin' && !e.fs ? e.bet : 0) },
  { id: 'gift', text: 'Получи подарок WILD', goal: 1, add: (e) => (e.giftWild ? 1 : 0) },
  { id: 'wheel', text: 'Крутани колесо удачи', goal: 1, add: (e) => (e.type === 'wheel' ? 1 : 0) },
];
export const TASK_REWARD = 3000;
export const TASK_XP = 300;
export const TASKS_BONUS = 10000;

const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

// на каждый день — свои три задания (одни и те же весь день)
export function tasksToday() {
  const day = today();
  if (!state.tasks || state.tasks.day !== day) {
    let h = 0;
    for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const rnd = seeded(h);
    const pool = TASKS.map((t) => t.id);
    const list = [];
    while (list.length < 3) list.push({ id: pool.splice(Math.floor(rnd() * pool.length), 1)[0], have: 0, done: false, seen: [] });
    state.tasks = { day, list, bonus: false };
    save();
  }
  return state.tasks.list.map((t) => ({ ...t, ...TASKS.find((x) => x.id === t.id) }));
}

function trackTasks(e) {
  tasksToday();
  for (const t of state.tasks.list) {
    if (t.done) continue;
    const def = TASKS.find((x) => x.id === t.id);
    if (def.seen) { if (e.machine && !t.seen.includes(e.machine)) t.seen.push(e.machine); t.have = t.seen.length; }
    else t.have += def.add(e);
    if (t.have >= def.goal) {
      t.have = def.goal; t.done = true;
      reward(TASK_REWARD); addXp(TASK_XP);
      notes.push({ type: 'task', text: def.text, reward: TASK_REWARD });
    }
  }
  if (!state.tasks.bonus && state.tasks.list.every((t) => t.done)) {
    state.tasks.bonus = true;
    state.stats.taskDays++;
    reward(TASKS_BONUS);
    notes.push({ type: 'tasks', reward: TASKS_BONUS });
  }
}

// ===================== медали =====================
export const MEDALS = [
  { id: 'spin1', name: 'Первое вращение', reward: 500, test: (s) => s.stats.spins >= 1 },
  { id: 'spin100', name: '100 вращений', reward: 2000, test: (s) => s.stats.spins >= 100 },
  { id: 'spin1000', name: '1 000 вращений', reward: 10000, test: (s) => s.stats.spins >= 1000 },
  { id: 'spin10000', name: '10 000 вращений', reward: 50000, test: (s) => s.stats.spins >= 10000 },
  { id: 'win10', name: 'Выигрыш ×10', reward: 1000, test: (s) => s.stats.bestMult >= 10 },
  { id: 'win50', name: 'Выигрыш ×50', reward: 5000, test: (s) => s.stats.bestMult >= 50 },
  { id: 'win100', name: 'Мега: выигрыш ×100', reward: 10000, test: (s) => s.stats.bestMult >= 100 },
  { id: 'fs1', name: 'Первые бесплатные вращения', reward: 2000, test: (s) => s.stats.fsRounds >= 1 },
  { id: 'fs25', name: '25 раундов бесплатных вращений', reward: 10000, test: (s) => s.stats.fsRounds >= 25 },
  { id: 'pick1', name: 'Первый сундук', reward: 2000, test: (s) => s.stats.picks >= 1 },
  { id: 'mini', name: 'Джекпот «Мини»', reward: 1000, test: (s) => s.stats.jp.mini >= 1 },
  { id: 'minor', name: 'Джекпот «Малый»', reward: 3000, test: (s) => s.stats.jp.minor >= 1 },
  { id: 'major', name: 'Джекпот «Большой»', reward: 10000, test: (s) => s.stats.jp.major >= 1 },
  { id: 'grand', name: 'Джекпот «Гранд»', reward: 50000, test: (s) => s.stats.jp.grand >= 1 },
  { id: 'streak5', name: 'Горячая серия: 5 подряд', reward: 5000, test: (s) => s.stats.maxStreak >= 5 },
  { id: 'all3', name: 'Все три автомата', reward: 3000, test: (s) => Object.keys(s.stats.played).length >= 3 },
  { id: 'mult5', name: 'Множитель ×5 на барабанах', reward: 2000, test: (s) => s.stats.mult5 >= 1 },
  { id: 'gift', name: 'Подарок WILD', reward: 1000, test: (s) => s.stats.giftWilds >= 1 },
  { id: 'buy', name: 'Первая покупка бонуса', reward: 1000, test: (s) => s.stats.buys >= 1 },
  { id: 'wheel', name: 'Колесо удачи', reward: 1000, test: (s) => s.stats.wheelSpins >= 1 },
  { id: 'tasks', name: 'Все задания дня', reward: 5000, test: (s) => s.stats.taskDays >= 1 },
  { id: 'lvl5', name: 'Уровень 5', reward: 5000, test: (s) => s.level >= 5 },
  { id: 'lvl10', name: 'Уровень 10', reward: 10000, test: (s) => s.level >= 10 },
  { id: 'lvl25', name: 'Уровень 25', reward: 25000, test: (s) => s.level >= 25 },
  { id: 'rich', name: 'Миллионер: 1 000 000 на счету', reward: 100000, test: (s) => s.stats.maxBalance >= 1e6 },
];

function checkMedals() {
  // награда за медаль может открыть следующую (уровень, миллион) — проверяем, пока открываются
  for (let again = true; again;) {
    again = false;
    for (const md of MEDALS) {
      if (state.medals[md.id] || !md.test(state)) continue;
      state.medals[md.id] = Date.now();
      reward(md.reward);
      notes.push({ type: 'medal', name: md.name, reward: md.reward });
      again = true;
    }
  }
}

// ===================== колесо удачи =====================
export const WHEEL_EVERY = 3 * 3600e3;
// coins — монеты (умножаются на уровень), fs — бесплатные вращения в случайном автомате
export const WHEEL = [
  { coins: 1000, w: 16, color: '#c0392b' },
  { coins: 2500, w: 13, color: '#1f6fc5' },
  { coins: 1500, w: 15, color: '#8e44ad' },
  { coins: 5000, w: 9, color: '#16a085' },
  { fs: 10, w: 6, color: '#d35400' },
  { coins: 2000, w: 15, color: '#2c3e8f' },
  { coins: 10000, w: 5, color: '#b8860b' },
  { coins: 3000, w: 12, color: '#7a1f5c' },
  { coins: 25000, w: 2, color: '#1e8449' },
  { coins: 4000, w: 10, color: '#a93226' },
  { fs: 20, w: 2, color: '#6c3483' },
  { coins: 100000, w: 0.4, color: '#f1c40f' },
];
export const wheelLeft = () => Math.max(0, state.wheelAt + WHEEL_EVERY - Date.now());
export const wheelPrizeCoins = (seg) => Math.round((seg.coins * wheelMult()) / 100) * 100;

export function spinWheel() {
  let x = fairRandom() * WHEEL.reduce((s, g) => s + g.w, 0), index = 0;
  for (; index < WHEEL.length - 1; index++) { if ((x -= WHEEL[index].w) < 0) break; }
  const seg = WHEEL[index];
  state.wheelAt = Date.now();
  state.stats.wheelSpins++;
  const prize = {};
  if (seg.coins) { prize.coins = wheelPrizeCoins(seg); reward(prize.coins); }
  else {
    const m = MACHINES[Math.floor(fairRandom() * MACHINES.length)];
    prize.fs = seg.fs; prize.machine = m;
    const f = state.fs[m.id];
    if (f) { f.left += seg.fs; f.count += seg.fs; }
    else state.fs[m.id] = { left: seg.fs, count: seg.fs, i: 0, bet: betFor(m.id), total: 0, sticky: [] };
  }
  track({ type: 'wheel' });
  return { index, prize };
}

// ===================== общий вход =====================
// e: { type: 'spin', machine, bet, win, mult, fs, streak, fsWon, pick, jackpot, multSym, giftWild } | { type: 'wheel' }
export function track(e) {
  if (e.type === 'spin') {
    if (!e.fs) addXp(Math.round(e.bet / 10));
    if (e.machine) state.stats.played[e.machine] = 1;
    state.stats.bestMult = Math.max(state.stats.bestMult, e.mult || 0);
    state.stats.maxStreak = Math.max(state.stats.maxStreak, e.streak || 0);
    state.stats.maxBalance = Math.max(state.stats.maxBalance, state.balance);
  }
  if (e.type === 'buy') addXp(Math.round(e.cost / 10));
  trackTasks(e);
  checkMedals();
  save();
}

export function flush() {
  for (const n of notes.splice(0)) {
    if (n.type === 'level') {
      sfx.levelUp();
      toast(`${pic(COMMON.star, '⭐', 't-ico')}<div><b>Новый уровень ${n.level}!</b><span>+${fmt(n.reward)} монет · призы колеса удачи больше</span></div>`, 4000, 'big');
    } else if (n.type === 'medal') {
      sfx.medal();
      toast(`${pic(COMMON.medal, '🏅', 't-ico')}<div><b>Медаль: ${esc(n.name)}</b><span>+${fmt(n.reward)} монет</span></div>`, 3500);
    } else if (n.type === 'task') {
      sfx.medal();
      toast(`<i class="t-ok">✔</i><div><b>Задание выполнено</b><span>${esc(n.text)} · +${fmt(n.reward)}</span></div>`, 3500);
    } else if (n.type === 'tasks') {
      sfx.levelUp();
      toast(`${pic(COMMON.chestOpen, '🎁', 't-ico')}<div><b>Все задания дня выполнены!</b><span>+${fmt(n.reward)} монет</span></div>`, 4000, 'big');
    }
  }
  hud.bal?.set(state.balance, 800);
  hud.level?.();
  push();
}
