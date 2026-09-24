// Проверка сервера комнат по сети: node shared/server.test.mjs [url]
// Два человека + 2 бота играют «Двери» и «Уникальное число» до финала.
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';
const URL = process.argv[2] || 'http://localhost:8877';
const mk = (id, name) => new Promise((res) => {
  const s = io(URL, { path: '/cell/io', transports: ['websocket'] });
  s.on('connect', () => s.emit('hello', { playerId: id, name, profile: { person: 'Male_Adult_05', gender: 'male' } }, () => res(s)));
});
const call = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
const a = await mk('test-a-' + Date.now(), 'Alice');
const b = await mk('test-b-' + Date.now(), 'Bob');
const cr = await call(a, 'create', { name: 'Тест', chain: (process.argv[3] || 'doors,unique').split(','), maxPlayers: 6 });
assert.ok(cr.ok, 'create');
const code = cr.room.id;
const list = await call(b, 'rooms');
assert.ok(list.some((r) => r.id === code), 'комната видна в списке');
assert.ok((await call(b, 'join', { roomId: code })).ok, 'join');
a.emit('addBot'); a.emit('addBot');
let lastRoom;
a.on('room', (r) => { lastRoom = r; });
await new Promise((r) => setTimeout(r, 300));
assert.equal(lastRoom.members.length, 4);
assert.equal((await call(a, 'start')).ok, false, 'без готовности Боба старт запрещён');
b.emit('ready', { ready: true });
await new Promise((r) => setTimeout(r, 300));
assert.equal(lastRoom.status, 'READY');
assert.ok((await call(a, 'start')).ok, 'start');
const phases = new Set(); let final = null; let leaked = false;
for (const [s, id] of [[a, 'A'], [b, 'B']]) {
  s.on('game', (st) => {
    if (!st) return;
    phases.add(st.cid + ':' + st.phase);
    if (st.phase === 'final') final = st;
    const me = st.players.find((p) => p.name === (id === 'A' ? 'Alice' : 'Bob'));
    if (st.phase !== 'act' || !st.alive.includes(me.id) || (st.done.includes(me.id) && !['bomb', 'roulette'].includes(st.cid))) return;
    if (st.cid === 'unique' && Object.keys(st.visible).length) leaked = true;
    if (st.cid === 'bomb') { if (st.visible?.holder === me.id && Date.now() - st.visible.since > 1200) s.emit('act', { to: st.alive.find((x) => x !== me.id) }); return; }
    if (st.cid === 'roulette') { if (st.visible?.turn === me.id) s.emit('act', { pull: true }); return; }
    if (st.cid === 'cards') { s.emit('act', { stand: true }); return; }
    if (st.cid === 'shoot') { s.emit('act', { angle: Math.random() * 6.28 }); return; }
    if (st.cid === 'doors') {
      const taken = new Set(Object.values(st.visible));
      const free = Array.from({ length: st.data.doors }, (_, i) => i).filter((i) => !taken.has(i));
      s.emit('act', { door: free[Math.floor(Math.random() * free.length)] });
    } else s.emit('act', { n: 1 + Math.floor(Math.random() * st.data.max) });
  });
}
const t0 = Date.now();
while (!final && Date.now() - t0 < 600000) await new Promise((r) => setTimeout(r, 500));
assert.ok(final, 'матч дошёл до финала');
assert.equal(final.history.length, (process.argv[3] || 'doors,unique').split(',').length);
assert.ok(!leaked, 'чужие числа не видны до раскрытия');
console.log('фазы:', [...phases].join(' '));
console.log('очки:', final.players.map((p) => `${p.name}${p.isBot ? '(бот)' : ''}=${p.points}`).join(', '));
console.log('время матча:', Math.round((Date.now() - t0) / 1000), 'с');
a.close(); b.close();
process.exit(0);
