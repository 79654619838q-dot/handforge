// Cell Survival — сервер комнат командной игры. Живёт в том же процессе, что и hub,
// на отдельном пути socket.io "/cell/io" (путь "/socket.io" занят покером).
// Правила испытаний — общий движок cell-survival/shared/match.js, тот же, что в одиночной игре.

import { Server } from "socket.io";
import { Match, CHALLENGE_IDS } from "../cell-survival/shared/match.js";

const ROOM_STATUS = { WAITING: "WAITING", READY: "READY", PLAYING: "PLAYING", FINISHED: "FINISHED" };
const CELL_COUNTS = [16, 25, 36, 50, 64, 100];
const MAX_ROOMS = 200;
const LOBBY_GRACE_MS = 30000; // сколько ждать вернувшегося игрока в лобби

const rooms = new Map();
const cleanStr = (s, n) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);

// Профиль аватара приходит от клиента — берём только известные поля и короткие строки.
const PROFILE_KEYS = ["gender", "person", "eyewear", "watch", "chain", "headwear", "background", "mask", "headphones", "scarf", "earrings", "backpack", "outfit", "hairTint", "skinTone", "faceShape", "skin", "hair", "hairColor", "eyes", "brows", "beard", "mustache", "top", "topColor", "pantsColor"];
function cleanProfile(p) {
  const out = {};
  if (p && typeof p === "object") for (const k of PROFILE_KEYS) if (typeof p[k] === "string") out[k] = cleanStr(p[k], 40);
  return out;
}

function code() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c;
  do { c = Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join(""); } while (rooms.has(c));
  return c;
}

const BOT_NAMES = ["Орион", "Вега", "Кобальт", "Сфинкс", "Титан", "Нова", "Рубин", "Шторм", "Янтарь", "Феникс", "Граф", "Кварц", "Атлас", "Сирин", "Бастион", "Ирбис", "Мираж", "Стикс", "Хронос"];
const BOT_PEOPLE = ["Business_Male_01", "Male_Adult_07", "Male_Adult_12", "Male_Adult_04", "Military_Male_01", "Business_Female_01", "Female_Adult_04", "Female_Adult_11", "Military_Female_01", "Sports_Female_02", "Male_Adult_10", "Female_Adult_07"];

export function attachCellServer(httpServer) {
  const io = new Server(httpServer, { path: "/cell/io", cors: { origin: true } });

  const lobbyList = () => [...rooms.values()]
    .filter((r) => r.status === ROOM_STATUS.WAITING || r.status === ROOM_STATUS.READY)
    .map((r) => ({ id: r.id, name: r.name, host: r.members.get(r.hostId)?.name || "—", players: r.members.size, max: r.maxPlayers, cells: r.cells, chain: r.chain }));

  const pushLobby = () => io.to("lobby").emit("rooms", lobbyList());

  function roomView(r) {
    return {
      id: r.id, name: r.name, hostId: r.hostId, status: r.status, maxPlayers: r.maxPlayers, cells: r.cells, chain: r.chain,
      members: [...r.members.values()].map((m) => ({ id: m.id, name: m.name, profile: m.profile, isBot: m.isBot, ready: m.isBot || m.ready || m.id === r.hostId, connected: m.connected })),
    };
  }

  function updateStatus(r) {
    if (r.status === ROOM_STATUS.PLAYING || r.status === ROOM_STATUS.FINISHED) return;
    const all = [...r.members.values()];
    const ready = all.length >= 2 && all.every((m) => m.isBot || m.ready || m.id === r.hostId);
    r.status = ready ? ROOM_STATUS.READY : ROOM_STATUS.WAITING;
  }

  function pushRoom(r) {
    updateStatus(r);
    io.to("room:" + r.id).emit("room", roomView(r));
    pushLobby();
  }

  function pushGame(r) {
    if (!r.match || r.pushQueued) return;
    r.pushQueued = true;
    setImmediate(() => { // несколько изменений подряд — одна рассылка
      r.pushQueued = false;
      if (!r.match) return;
      for (const m of r.members.values()) if (!m.isBot && m.socketId) io.to(m.socketId).emit("game", r.match.getStateFor(m.id));
      if (r.match.phase === "final" && r.status !== ROOM_STATUS.FINISHED) { r.status = ROOM_STATUS.FINISHED; pushRoom(r); }
    });
  }

  function deleteRoom(r) {
    r.match?.destroy();
    rooms.delete(r.id);
    pushLobby();
  }

  function removeMember(r, id) {
    r.members.delete(id);
    if (![...r.members.values()].some((m) => !m.isBot)) return deleteRoom(r); // людей не осталось
    if (r.hostId === id) r.hostId = [...r.members.values()].find((m) => !m.isBot).id;
    pushRoom(r);
  }

  io.on("connection", (socket) => {
    let me = null;      // { id, name, profile }
    let roomId = null;

    const room = () => (roomId ? rooms.get(roomId) : null);
    const isHost = () => room()?.hostId === me?.id;

    socket.on("hello", (p, ack) => {
      const id = cleanStr(p?.playerId, 64);
      if (!id) return ack?.({ ok: false });
      me = { id, name: cleanStr(p?.name, 16) || "Игрок", profile: cleanProfile(p?.profile) };
      socket.join("lobby");
      // вернулся после обрыва связи — возвращаем в его комнату
      for (const r of rooms.values()) {
        const m = r.members.get(id);
        if (m && !m.isBot) {
          m.socketId = socket.id; m.connected = true; clearTimeout(m.dropTimer);
          roomId = r.id; socket.join("room:" + r.id);
          if (r.match) { r.match.player(id) && (r.match.player(id).connected = true); pushGame(r); }
          pushRoom(r);
          break;
        }
      }
      ack?.({ ok: true, roomId, rooms: lobbyList() });
    });

    socket.on("rooms", (_, ack) => ack?.(lobbyList()));

    const join = (r) => {
      r.members.set(me.id, { ...me, isBot: false, ready: false, connected: true, socketId: socket.id });
      roomId = r.id;
      socket.join("room:" + r.id);
      pushRoom(r);
    };

    socket.on("create", (p, ack) => {
      if (!me || room()) return ack?.({ ok: false, error: "already" });
      if (rooms.size >= MAX_ROOMS) return ack?.({ ok: false, error: "full" });
      const chain = Array.isArray(p?.chain) ? p.chain.filter((c) => CHALLENGE_IDS.includes(c)) : [];
      const r = {
        id: code(),
        name: cleanStr(p?.name, 28) || "Комната",
        hostId: me.id,
        status: ROOM_STATUS.WAITING,
        maxPlayers: Math.max(2, Math.min(20, Number(p?.maxPlayers) || 8)),
        cells: CELL_COUNTS.includes(Number(p?.cells)) ? Number(p.cells) : 25,
        chain: chain.length ? chain : CHALLENGE_IDS.slice(),
        members: new Map(),
        match: null,
      };
      rooms.set(r.id, r);
      join(r);
      ack?.({ ok: true, room: roomView(r) });
    });

    socket.on("join", (p, ack) => {
      const r = rooms.get(cleanStr(p?.roomId, 8).toUpperCase());
      if (!me || !r) return ack?.({ ok: false, error: "notfound" });
      if (room() && room() !== r) return ack?.({ ok: false, error: "already" });
      if (r.members.has(me.id)) return ack?.({ ok: true, room: roomView(r) });
      if (r.status === ROOM_STATUS.PLAYING || r.status === ROOM_STATUS.FINISHED) return ack?.({ ok: false, error: "started" });
      if (r.members.size >= r.maxPlayers) return ack?.({ ok: false, error: "full" });
      join(r);
      ack?.({ ok: true, room: roomView(r) });
    });

    socket.on("leave", (_, ack) => {
      const r = room();
      if (r) { socket.leave("room:" + r.id); removeMember(r, me.id); }
      roomId = null;
      ack?.({ ok: true });
    });

    socket.on("ready", (p) => {
      const r = room(); const m = r?.members.get(me?.id);
      if (!m || r.status === ROOM_STATUS.PLAYING) return;
      m.ready = !!p?.ready;
      pushRoom(r);
    });

    socket.on("settings", (p) => {
      const r = room();
      if (!r || !isHost() || r.match) return;
      if (typeof p?.name === "string") r.name = cleanStr(p.name, 28) || r.name;
      if (CELL_COUNTS.includes(Number(p?.cells))) r.cells = Number(p.cells);
      if (Array.isArray(p?.chain)) { const c = p.chain.filter((x) => CHALLENGE_IDS.includes(x)); if (c.length) r.chain = c; }
      if (p?.maxPlayers) r.maxPlayers = Math.max(r.members.size, 2, Math.min(20, Number(p.maxPlayers) || r.maxPlayers));
      pushRoom(r);
    });

    socket.on("addBot", () => {
      const r = room();
      if (!r || !isHost() || r.match || r.members.size >= r.maxPlayers) return;
      const used = new Set([...r.members.values()].map((m) => m.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) || "Бот " + r.members.size;
      const person = BOT_PEOPLE[Math.floor(Math.random() * BOT_PEOPLE.length)];
      const id = "bot-" + Math.random().toString(36).slice(2, 9);
      r.members.set(id, { id, name, isBot: true, ready: true, connected: true, profile: { person, gender: /Female/.test(person) ? "female" : "male", background: "forge" } });
      pushRoom(r);
    });

    socket.on("removeBot", (p) => {
      const r = room();
      if (!r || !isHost() || r.match) return;
      const m = r.members.get(p?.id);
      if (m?.isBot) { r.members.delete(m.id); pushRoom(r); }
    });

    socket.on("start", (_, ack) => {
      const r = room();
      if (!r || !isHost() || r.match) return ack?.({ ok: false });
      updateStatus(r);
      if (r.status !== ROOM_STATUS.READY) return ack?.({ ok: false, error: "notready" });
      r.status = ROOM_STATUS.PLAYING;
      r.match = new Match({
        players: [...r.members.values()].map((m) => ({ id: m.id, name: m.name, profile: m.profile, isBot: m.isBot, connected: m.connected })),
        chain: r.chain,
        options: { cells: r.cells },
        onChange: () => pushGame(r),
      });
      pushRoom(r);
      r.match.start();
      ack?.({ ok: true });
    });

    socket.on("act", (a, ack) => {
      const r = room();
      const ok = !!(r?.match && r.match.act(me.id, a));
      ack?.({ ok });
    });

    // Хост возвращает комнату в ожидание после финала — та же компания играет снова.
    socket.on("again", () => {
      const r = room();
      if (!r || !isHost() || r.status !== ROOM_STATUS.FINISHED) return;
      r.match?.destroy(); r.match = null;
      for (const m of r.members.values()) if (!m.isBot) m.ready = false;
      r.status = ROOM_STATUS.WAITING;
      io.to("room:" + r.id).emit("game", null);
      pushRoom(r);
    });

    socket.on("disconnect", () => {
      const r = room();
      if (!r || !me) return;
      const m = r.members.get(me.id);
      if (!m || m.socketId !== socket.id) return;
      m.connected = false;
      if (r.match) { const p = r.match.player(me.id); if (p) p.connected = false; pushGame(r); pushRoom(r); return; } // в игре ходы идут по тайм-ауту
      m.dropTimer = setTimeout(() => { if (!m.connected && rooms.get(r.id) === r) removeMember(r, m.id); }, LOBBY_GRACE_MS);
      pushRoom(r);
    });
  });

  // Закончившиеся и брошенные комнаты не копятся: раз в минуту убираем пустые по людям.
  setInterval(() => {
    for (const r of rooms.values()) if (![...r.members.values()].some((m) => !m.isBot && m.connected)) {
      r.idleSince ??= Date.now();
      if (Date.now() - r.idleSince > 10 * 60 * 1000) deleteRoom(r);
    } else r.idleSince = null;
  }, 60000).unref();

  return io;
}
