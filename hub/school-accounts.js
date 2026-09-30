// «Школа Умки»: вход по нику и паролю, прохождение хранится на сервере.
// Хранение: Postgres из DATABASE_URL (та же база, что у PhotoQuest), своя схема "school" —
// prisma db push трогает только public. Без DATABASE_URL (локально) — файл hub/.school-accounts.json.
// Пароль — scrypt с солью; вход — подписанный токен (HMAC), в базе не хранится.
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, ".school-accounts.json");
const SECRET = process.env.JWT_SECRET || "school-local-dev-secret";
const MAX_PROGRESS = 64 * 1024; // прогресс — небольшой JSON; больше не принимаем

let ready = null;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!ready) {
    ready = (async () => {
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
      await pool.query(`CREATE SCHEMA IF NOT EXISTS school`);
      await pool.query(`CREATE TABLE IF NOT EXISTS school.accounts (
        nick_key text PRIMARY KEY, nick text NOT NULL, salt text NOT NULL, hash text NOT NULL,
        progress jsonb NOT NULL DEFAULT '{}'::jsonb, created timestamptz NOT NULL DEFAULT now(), updated timestamptz NOT NULL DEFAULT now())`);
      return pool;
    })().catch((e) => { console.error("[school] база недоступна, аккаунты в файле:", e.message); return null; });
  }
  return ready;
}
const readFile = () => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; } };
const writeFile = (d) => { try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch (e) { console.error("[school]", e.message); } };

async function getAccount(key) {
  const p = await db();
  if (p) return (await p.query(`SELECT nick, salt, hash, progress FROM school.accounts WHERE nick_key=$1`, [key])).rows[0] || null;
  return readFile()[key] || null;
}
async function createAccount(key, nick, salt, hash) {
  const p = await db();
  if (p) {
    const r = await p.query(`INSERT INTO school.accounts (nick_key, nick, salt, hash) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [key, nick, salt, hash]);
    return r.rowCount === 1;
  }
  const d = readFile();
  if (d[key]) return false;
  d[key] = { nick, salt, hash, progress: {} }; writeFile(d);
  return true;
}
// Прохождение только растёт: присланное объединяется с сохранённым (лучшее из двух). Раньше сервер
// заменял его целиком, и устройство, которое не успело загрузить прохождение (сайт просыпался после
// сна Render, у браузера не работало хранилище), затирало пройденные уровни своим неполным списком.
function mergeProgress(a = {}, b = {}) {
  const out = {};
  for (const src of [a, b]) {
    for (const [k, v] of Object.entries(src || {})) {
      if (k === "stars") out.stars = Math.max(out.stars || 0, Math.max(0, Math.min(1e6, Math.round(+v || 0))));
      else if (k === "stickers" && Array.isArray(v)) out.stickers = [...new Set([...(out.stickers || []), ...v.filter((x) => typeof x === "string").map((x) => x.slice(0, 30))])].slice(0, 500);
      else if (/^prog\.[a-z]{1,20}$/.test(k) && Array.isArray(v)) {
        const w = out[k] || [];
        out[k] = Array.from({ length: Math.min(200, Math.max(w.length, v.length)) }, (_, i) => Math.max(w[i] || 0, Math.max(0, Math.min(3, Math.round(+v[i] || 0)))));
      }
    }
  }
  return out;
}
async function saveProgress(key, progress) {
  const p = await db();
  if (p) {
    const c = await p.connect();
    try {
      await c.query("BEGIN");
      const cur = (await c.query(`SELECT progress FROM school.accounts WHERE nick_key=$1 FOR UPDATE`, [key])).rows[0];
      const merged = cur ? mergeProgress(cur.progress, progress) : null;
      if (cur) await c.query(`UPDATE school.accounts SET progress=$2, updated=now() WHERE nick_key=$1`, [key, merged]);
      await c.query("COMMIT");
      return merged;
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  }
  const d = readFile();
  if (!d[key]) return null;
  d[key].progress = mergeProgress(d[key].progress, progress); writeFile(d);
  return d[key].progress;
}

// ---------- пароль и токен ----------
const hashPass = (pass, salt) => new Promise((res, rej) => crypto.scrypt(pass, salt, 32, (e, k) => (e ? rej(e) : res(k.toString("hex")))));
const sign = (key) => { const b = Buffer.from(key).toString("base64url"); return b + "." + crypto.createHmac("sha256", SECRET).update(b).digest("base64url"); };
function verify(token) {
  const [b, sig] = String(token || "").split(".");
  if (!b || !sig) return null;
  const good = crypto.createHmac("sha256", SECRET).update(b).digest("base64url");
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  return Buffer.from(b, "base64url").toString();
}
const cleanNick = (v) => String(v ?? "").replace(/[\u0000-\u001f<>"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 20);
const keyOf = (nick) => nick.toLowerCase().replace(/ё/g, "е");

// ---------- защита от перебора паролей: 8 попыток входа в минуту с адреса ----------
const tries = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (tries.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now); tries.set(ip, list);
  if (tries.size > 5000) tries.clear();
  return list.length > 8;
}

// за прокси Render адрес игрока — первый в X-Forwarded-For
const ipOf = (req) => String(req.get("x-forwarded-for") || req.ip || "").split(",")[0].trim();

export function attachSchoolAccounts(app) {
  const r = express.Router();
  r.use(express.json({ limit: "80kb" }));

  r.post("/register", async (req, res) => {
    try {
      if (tooMany(ipOf(req))) return res.status(429).json({ error: "Слишком много попыток. Подожди минутку." });
      const nick = cleanNick(req.body?.nick), pass = String(req.body?.pass ?? "");
      if (nick.length < 2) return res.status(400).json({ error: "Имя — хотя бы 2 буквы." });
      if (pass.length < 4 || pass.length > 64) return res.status(400).json({ error: "Пароль — от 4 символов." });
      const key = keyOf(nick), salt = crypto.randomBytes(16).toString("hex");
      if (!(await createAccount(key, nick, salt, await hashPass(pass, salt)))) return res.status(409).json({ error: "Такое имя уже занято. Придумай другое или войди." });
      res.json({ token: sign(key), nick, progress: {} });
    } catch (e) { console.error("[school] register", e.message); res.status(500).json({ error: "Ошибка сервера, попробуй ещё раз." }); }
  });

  r.post("/login", async (req, res) => {
    try {
      if (tooMany(ipOf(req))) return res.status(429).json({ error: "Слишком много попыток. Подожди минутку." });
      const nick = cleanNick(req.body?.nick), pass = String(req.body?.pass ?? "");
      const acc = nick ? await getAccount(keyOf(nick)) : null;
      const ok = acc && crypto.timingSafeEqual(Buffer.from(await hashPass(pass, acc.salt), "hex"), Buffer.from(acc.hash, "hex"));
      if (!ok) return res.status(401).json({ error: "Неверное имя или пароль." });
      res.json({ token: sign(keyOf(nick)), nick: acc.nick, progress: acc.progress || {} });
    } catch (e) { console.error("[school] login", e.message); res.status(500).json({ error: "Ошибка сервера, попробуй ещё раз." }); }
  });

  const auth = (req, res, next) => {
    const key = verify((req.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!key) return res.status(401).json({ error: "Нужно войти заново." });
    req.key = key; next();
  };
  // где хранятся аккаунты: "db" — база (переживает перезапуск), "file" — файл (стирается при перезапуске Render)
  r.get("/health", async (_req, res) => {
    res.json({ store: (await db()) ? "db" : "file" });
  });

  r.get("/progress", auth, async (req, res) => {
    try {
      const acc = await getAccount(req.key);
      if (!acc) return res.status(401).json({ error: "Нужно войти заново." });
      res.json({ nick: acc.nick, progress: acc.progress || {} });
    } catch (e) { res.status(500).json({ error: "Ошибка сервера." }); }
  });
  r.put("/progress", auth, async (req, res) => {
    try {
      const progress = req.body?.progress;
      if (!progress || typeof progress !== "object" || Array.isArray(progress) || JSON.stringify(progress).length > MAX_PROGRESS) return res.status(400).json({ error: "Неверные данные." });
      const merged = await saveProgress(req.key, progress);
      if (!merged) return res.status(401).json({ error: "Нужно войти заново." });
      res.json({ ok: true, progress: merged });
    } catch (e) { res.status(500).json({ error: "Ошибка сервера." }); }
  });

  app.use("/school/api", r);
}
