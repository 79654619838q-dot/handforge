// Общий рейтинг игры-расследования «АРХИВ»: сумма лучших очков по делам, звёзды, раскрытые дела.
// Хранение: Postgres из DATABASE_URL, отдельная схема "detective" (prisma db push её не трогает).
// Без DATABASE_URL (локально) — файл hub/.detective-rating.json.
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, ".detective-rating.json");
const clean = (v, n) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

let ready = null;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!ready) {
    ready = (async () => {
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
      await pool.query(`CREATE SCHEMA IF NOT EXISTS detective`);
      await pool.query(`CREATE TABLE IF NOT EXISTS detective.rating (
        id text PRIMARY KEY, name text NOT NULL, score integer NOT NULL DEFAULT 0, stars integer NOT NULL DEFAULT 0,
        solved integer NOT NULL DEFAULT 0, cases integer NOT NULL DEFAULT 0, updated timestamptz NOT NULL DEFAULT now())`);
      return pool;
    })().catch((e) => { console.error("[detective-rating] база недоступна, рейтинг в файле:", e.message); ready = Promise.resolve(null); return null; });
  }
  return ready;
}
function readFile() { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; } }
function writeFile(d) { try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch (e) { console.error("[detective-rating]", e.message); } }

async function record(b) {
  const id = clean(b.id, 64), name = clean(b.name, 20);
  if (!id || !name) return;
  // 30 дел, у каждого максимум меньше 5000 очков и 3 звезды
  const row = { score: int(b.score, 150000), stars: int(b.stars, 90), solved: int(b.solved, 30), cases: int(b.cases, 30) };
  const p = await db();
  if (p) {
    await p.query(`INSERT INTO detective.rating (id, name, score, stars, solved, cases) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO UPDATE SET name=$2, score=GREATEST(detective.rating.score,$3), stars=GREATEST(detective.rating.stars,$4),
      solved=GREATEST(detective.rating.solved,$5), cases=GREATEST(detective.rating.cases,$6), updated=now()`,
      [id, name, row.score, row.stars, row.solved, row.cases]);
    return;
  }
  const d = readFile();
  const r = d[id] || { id, score: 0, stars: 0, solved: 0, cases: 0 };
  d[id] = { id, name, score: Math.max(r.score, row.score), stars: Math.max(r.stars, row.stars), solved: Math.max(r.solved, row.solved), cases: Math.max(r.cases, row.cases), updated: Date.now() };
  writeFile(d);
}

async function top(limit, me) {
  const p = await db();
  let rows, mine = null;
  if (p) {
    rows = (await p.query(`SELECT id, name, score, stars, solved, cases FROM detective.rating ORDER BY score DESC, updated ASC LIMIT $1`, [limit])).rows;
    if (me) {
      const r = (await p.query(`SELECT id, name, score, stars, solved, cases, (SELECT count(*) FROM detective.rating o WHERE o.score > r.score) + 1 AS place FROM detective.rating r WHERE id=$1`, [me])).rows[0];
      if (r) mine = { ...r, place: Number(r.place) };
    }
  } else {
    const all = Object.values(readFile()).sort((a, b) => b.score - a.score || a.updated - b.updated);
    rows = all.slice(0, limit);
    const i = all.findIndex((r) => r.id === me);
    if (i >= 0) mine = { ...all[i], place: i + 1 };
  }
  const out = (r) => ({ name: r.name, score: Number(r.score), stars: Number(r.stars), solved: Number(r.solved), cases: Number(r.cases) });
  return { store: p ? "db" : "file", top: rows.map((r, i) => ({ place: i + 1, ...out(r), me: r.id === me })), me: mine && { place: mine.place, ...out(mine) } };
}

const lastPost = new Map();
export function attachDetectiveRating(app) {
  app.post("/detective/api/rating", express.json({ limit: "2kb" }), async (req, res) => {
    const id = clean(req.body?.id, 64);
    const now = Date.now();
    if (!id || now - (lastPost.get(id) || 0) < 5000) return res.status(429).json({ ok: false });
    lastPost.set(id, now);
    try { await record(req.body); res.json({ ok: true }); } catch (e) { console.error("[detective-rating]", e.message); res.status(500).json({ ok: false }); }
  });
  app.get("/detective/api/rating", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await top(50, clean(req.query.me, 64))); } catch (e) { console.error("[detective-rating]", e.message); res.status(500).json({ top: [], me: null }); }
  });
}
