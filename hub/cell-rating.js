// Общий рейтинг «ЭРА»: очки за все игры (одиночные с ботами и командные), победы, сыграно.
// Хранение: Postgres из DATABASE_URL (та же база, что у PhotoQuest), отдельная схема "cell" —
// prisma db push трогает только схему public, наши таблицы он не видит и не удалит.
// Без DATABASE_URL (локально) — файл hub/.cell-rating.json.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, ".cell-rating.json");
const MAX_POINTS_PER_GAME = 400; // больше за одну игру не бывает (20 игроков × 10 + бонус) — защита от подделки
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);

let pool = null;
let ready = null;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!ready) {
    ready = (async () => {
      const { default: pg } = await import("pg");
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
      await pool.query(`CREATE SCHEMA IF NOT EXISTS cell`);
      await pool.query(`CREATE TABLE IF NOT EXISTS cell.rating (
        id text PRIMARY KEY, name text NOT NULL, hero text, points integer NOT NULL DEFAULT 0,
        wins integer NOT NULL DEFAULT 0, games integer NOT NULL DEFAULT 0, updated timestamptz NOT NULL DEFAULT now())`);
      return pool;
    })().catch((e) => { console.error("[cell-rating] база недоступна, рейтинг в файле:", e.message); ready = Promise.resolve(null); return null; });
  }
  return ready;
}

function readFile() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; } }
function writeFile(d) { try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch (e) { console.error("[cell-rating]", e.message); } }

// одна запись итога игры
export async function recordGame({ id, name, hero, points, won }) {
  id = clean(id, 64); name = clean(name, 28) || "Игрок"; hero = clean(hero, 20);
  points = Math.max(0, Math.min(MAX_POINTS_PER_GAME, Math.round(Number(points) || 0)));
  if (!id) return;
  const p = await db();
  if (p) {
    await p.query(`INSERT INTO cell.rating (id, name, hero, points, wins, games) VALUES ($1,$2,$3,$4,$5,1)
      ON CONFLICT (id) DO UPDATE SET name=$2, hero=$3, points=cell.rating.points+$4, wins=cell.rating.wins+$5, games=cell.rating.games+1, updated=now()`,
      [id, name, hero, points, won ? 1 : 0]);
    return;
  }
  const d = readFile();
  const r = d[id] || { id, points: 0, wins: 0, games: 0 };
  Object.assign(r, { name, hero, points: r.points + points, wins: r.wins + (won ? 1 : 0), games: r.games + 1 });
  d[id] = r; writeFile(d);
}

export async function topList(limit = 50, me = "") {
  const p = await db();
  let rows, mine = null;
  if (p) {
    rows = (await p.query(`SELECT id, name, hero, points, wins, games FROM cell.rating ORDER BY points DESC, wins DESC, updated ASC LIMIT $1`, [limit])).rows;
    if (me) {
      const r = (await p.query(`SELECT id, name, hero, points, wins, games, (SELECT count(*) FROM cell.rating o WHERE o.points > r.points) + 1 AS place FROM cell.rating r WHERE id=$1`, [me])).rows[0];
      if (r) mine = { ...r, place: Number(r.place) };
    }
  } else {
    const all = Object.values(readFile()).sort((a, b) => b.points - a.points || b.wins - a.wins);
    rows = all.slice(0, limit);
    const i = all.findIndex((r) => r.id === me);
    if (i >= 0) mine = { ...all[i], place: i + 1 };
  }
  return { top: rows.map((r, i) => ({ place: i + 1, name: r.name, hero: r.hero, points: r.points, wins: r.wins, games: r.games, me: r.id === me })), me: mine && { place: mine.place, name: mine.name, hero: mine.hero, points: mine.points, wins: mine.wins, games: mine.games } };
}

// Одиночные игры считаются в браузере — итог присылает клиент. Не чаще раза в 20 с с одного игрока.
const lastPost = new Map();
export function attachRatingRoutes(app) {
  app.post("/cell/api/rating", express.json({ limit: "2kb" }), async (req, res) => {
    const id = clean(req.body?.id, 64);
    const now = Date.now();
    if (!id || now - (lastPost.get(id) || 0) < 20000) return res.status(429).json({ ok: false });
    lastPost.set(id, now);
    try { await recordGame(req.body); res.json({ ok: true }); } catch (e) { console.error("[cell-rating]", e.message); res.status(500).json({ ok: false }); }
  });
  app.get("/cell/api/rating", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await topList(50, clean(req.query.me, 64))); } catch (e) { console.error("[cell-rating]", e.message); res.status(500).json({ top: [], me: null }); }
  });
}
