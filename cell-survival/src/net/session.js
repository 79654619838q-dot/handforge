import { io } from 'socket.io-client';
import { Match } from '../../shared/match.js';
import { pickHeroBot } from '../../shared/heroes.js';

// Две «сессии» с одним интерфейсом для экрана испытаний:
//   onState(fn) — новое состояние матча; act(action) — ход игрока; myId; close().
// LocalSession — движок в браузере с ботами (одиночная игра),
// RemoteSession — комната на сервере (командная игра).

const BOT_NAMES = ['Орион', 'Вега', 'Кобальт', 'Сфинкс', 'Титан', 'Нова', 'Рубин', 'Шторм'];
const BOT_PEOPLE = ['Business_Male_01', 'Female_Adult_04', 'Male_Adult_12', 'Military_Female_01', 'Male_Adult_07', 'Business_Female_01', 'Male_Adult_04', 'Female_Adult_11'];

export function playerId() {
  try {
    let id = localStorage.getItem('cellsurvival.playerId');
    if (!id) { id = 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('cellsurvival.playerId', id); }
    return id;
  } catch { return 'p-' + Math.random().toString(36).slice(2); }
}

export class LocalSession {
  constructor({ profile, chain, bots = 5, options = {} }) {
    this.myId = 'me';
    this.listeners = [];
    const players = [{ id: 'me', name: profile.name, profile }];
    const used = new Set([profile.name]);
    for (let i = 0; i < bots; i++) {
      // боты — супергерои без повторов; героев не хватило — обычные люди
      const hb = pickHeroBot(used);
      if (hb) { used.add(hb.name); players.push({ id: 'bot' + i, name: hb.name, isBot: true, profile: hb.profile }); continue; }
      const person = BOT_PEOPLE[i % BOT_PEOPLE.length];
      players.push({ id: 'bot' + i, name: BOT_NAMES[i % BOT_NAMES.length], isBot: true, profile: { person, gender: /Female/.test(person) ? 'female' : 'male', background: 'forge' } });
    }
    this.match = new Match({ players, chain, options, onChange: () => this.emit() });
    this.local = true;
  }
  start() { this.match.start(); }
  emit() {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; const s = this.match.getStateFor(this.myId); this.listeners.forEach((f) => f(s)); });
  }
  onState(fn) { this.listeners.push(fn); }
  act(a) { return Promise.resolve({ ok: this.match.act(this.myId, a) }); }
  close() { this.match.destroy(); this.listeners = []; }
}

// Подключение к серверу комнат. Один сокет на всё время жизни вкладки.
export class RemoteSession {
  constructor(profile) {
    this.myId = playerId();
    this.profile = profile;
    this.listeners = { room: [], game: [], rooms: [], status: [] };
    this.socket = io(location.origin, { path: `${import.meta.env.BASE_URL}io`, transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => this.hello());
    this.socket.on('disconnect', () => this.fire('status', 'offline'));
    this.socket.on('room', (r) => { this.room = r; this.fire('room', r); });
    this.socket.on('game', (g) => { this.game = g; this.fire('game', g); });
    this.socket.on('rooms', (l) => this.fire('rooms', l));
  }
  hello() {
    this.socket.emit('hello', { playerId: this.myId, name: this.profile.name, profile: this.profile }, (r) => {
      this.fire('status', 'online');
      if (r?.rooms) this.fire('rooms', r.rooms);
    });
  }
  on(ev, fn) { this.listeners[ev].push(fn); return () => { this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn); }; }
  fire(ev, v) { this.listeners[ev].forEach((f) => f(v)); }
  call(ev, p) {
    return new Promise((res) => {
      if (!this.socket.connected) return res({ ok: false, error: 'offline' });
      const t = setTimeout(() => res({ ok: false, error: 'timeout' }), 8000);
      this.socket.emit(ev, p, (r) => { clearTimeout(t); res(r); });
    });
  }
  send(ev, p) { this.socket.emit(ev, p); }
  // интерфейс сессии матча
  onState(fn) { return this.on('game', (g) => g && fn(g)); }
  act(a) { return this.call('act', a); }
  close() { this.socket.close(); }
}
