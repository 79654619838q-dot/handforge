// Общий рейтинг «Золотых барабанов»: два списка — «Рекорд» (выше всех поднялся со стартовых 10 000)
// и «Самый богатый» (монеты сейчас + всё, что куплено в магазине игры).
// Хранение: Postgres из DATABASE_URL (та же база, что у PhotoQuest), отдельная схема "slots" —
// prisma db push трогает только схему public, наши таблицы он не видит и не удалит.
// Без DATABASE_URL (локально) — файл hub/.slots-rating.json.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, ".slots-rating.json");
const MAX_COINS = 1e13; // больше не бывает — защита от подделки
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const num = (v) => Math.max(0, Math.min(MAX_COINS, Math.floor(Number(v) || 0)));

let pool = null;
let ready = null;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!ready) {
    ready = (async () => {
      const { default: pg } = await import("pg");
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
      await pool.query(`CREATE SCHEMA IF NOT EXISTS slots`);
      await pool.query(`CREATE TABLE IF NOT EXISTS slots.rating (
        id text PRIMARY KEY, name text NOT NULL, best bigint NOT NULL DEFAULT 0, balance bigint NOT NULL DEFAULT 0,
        spins integer NOT NULL DEFAULT 0, jackpots integer NOT NULL DEFAULT 0, level integer NOT NULL DEFAULT 1,
        updated timestamptz NOT NULL DEFAULT now())`);
      await pool.query(`ALTER TABLE slots.rating ADD COLUMN IF NOT EXISTS wealth bigint NOT NULL DEFAULT 0`);
      await pool.query(`ALTER TABLE slots.rating ADD COLUMN IF NOT EXISTS avatar text`);
      await pool.query(`ALTER TABLE slots.rating ADD COLUMN IF NOT EXISTS showcase text`);
      return pool;
    })().catch((e) => { console.error("[slots-rating] база недоступна, рейтинг в файле:", e.message); ready = Promise.resolve(null); return null; });
  }
  return ready;
}

function readFile() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; } }
function writeFile(d) { try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch (e) { console.error("[slots-rating]", e.message); } }

// рекорд только растёт; остальное — как прислал игрок
export async function recordScore(b) {
  const id = clean(b.id, 64), name = clean(b.name, 24) || "Игрок";
  if (!id) return;
  // аватар — основа b1…b4 (раньше av1…av9), витрина — до 24 названий вещей из магазина
  const avatar = /^(av[1-9]|b[1-4])$/.test(b.avatar) ? b.avatar : null;
  const showcase = (Array.isArray(b.showcase) ? b.showcase : []).filter((x) => typeof x === "string" && /^[a-z0-9_]{3,24}$/.test(x)).slice(0, 24).join(",");
  const row = { best: num(b.best), wealth: num(b.wealth ?? b.balance), balance: num(b.balance), spins: Math.min(2e9, num(b.spins)), jackpots: Math.min(1e6, num(b.jackpots)), level: Math.max(1, Math.min(9999, num(b.level))) };
  const p = await db();
  if (p) {
    await p.query(`INSERT INTO slots.rating (id, name, best, balance, spins, jackpots, level, wealth, avatar, showcase) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET name=$2, best=GREATEST(slots.rating.best,$3), balance=$4, spins=$5, jackpots=$6, level=$7, wealth=$8, avatar=$9, showcase=$10, updated=now()`,
      [id, name, row.best, row.balance, row.spins, row.jackpots, row.level, row.wealth, avatar, showcase]);
    return;
  }
  const d = readFile();
  const r = d[id] || { id, best: 0 };
  Object.assign(r, row, { name, avatar, showcase, best: Math.max(r.best, row.best), updated: Date.now() });
  d[id] = r; writeFile(d);
}

// by: "best" — по рекорду, "wealth" — по богатству (имя столбца берём только из этого списка)
export async function topList(limit = 50, me = "", by = "best") {
  const col = by === "wealth" ? "wealth" : "best";
  const p = await db();
  let rows, mine = null;
  if (p) {
    rows = (await p.query(`SELECT id, name, best, wealth, balance, spins, jackpots, level, avatar, showcase FROM slots.rating ORDER BY ${col} DESC, updated ASC LIMIT $1`, [limit])).rows;
    if (me) {
      const r = (await p.query(`SELECT id, name, best, wealth, balance, spins, jackpots, level, avatar, showcase, (SELECT count(*) FROM slots.rating o WHERE o.${col} > r.${col}) + 1 AS place FROM slots.rating r WHERE id=$1`, [me])).rows[0];
      if (r) mine = { ...r, place: Number(r.place) };
    }
  } else {
    const all = Object.values(readFile()).sort((a, b) => (b[col] || 0) - (a[col] || 0) || a.updated - b.updated);
    rows = all.slice(0, limit);
    const i = all.findIndex((r) => r.id === me);
    if (i >= 0) mine = { ...all[i], place: i + 1 };
  }
  const out = (r) => ({ name: r.name, best: Number(r.best), wealth: Number(r.wealth || 0), balance: Number(r.balance), spins: r.spins, jackpots: r.jackpots, level: r.level,
    avatar: r.avatar || null, showcase: r.showcase ? String(r.showcase).split(",").filter(Boolean) : [] });
  return { store: p ? "db" : "file", top: rows.map((r, i) => ({ place: i + 1, ...out(r), me: r.id === me })), me: mine && { place: mine.place, ...out(mine) } };
}

// Игра идёт в браузере — итог присылает клиент. Не чаще раза в 10 с с одного игрока.
const lastPost = new Map();
export function attachSlotsRating(app) {
  app.post("/slots/api/rating", express.json({ limit: "2kb" }), async (req, res) => {
    const id = clean(req.body?.id, 64);
    const now = Date.now();
    if (!id || now - (lastPost.get(id) || 0) < 10000) return res.status(429).json({ ok: false });
    lastPost.set(id, now);
    try { await recordScore(req.body); res.json({ ok: true }); } catch (e) { console.error("[slots-rating]", e.message); res.status(500).json({ ok: false }); }
  });
  app.get("/slots/api/rating", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await topList(50, clean(req.query.me, 64), req.query.by === "wealth" ? "wealth" : "best")); } catch (e) { console.error("[slots-rating]", e.message); res.status(500).json({ top: [], me: null }); }
  });
}
