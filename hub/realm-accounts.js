// «Сокрытая сила»: вход по нику и паролю, прохождение хранится на сервере.
// Хранение: Postgres из DATABASE_URL, своя схема "realm" (как у школы — prisma трогает только public).
// Без DATABASE_URL (локально) — файл hub/.realm-accounts.json.
// Сохранение — целиком одним JSON с номером версии rev: сервер принимает только более новую версию,
// поэтому устройство со старым сохранением не затрёт прохождение, сделанное на другом.
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, ".realm-accounts.json");
const SECRET = (process.env.JWT_SECRET || "realm-local-dev-secret") + ":realm";
const MAX_SAVE = 600 * 1024;

let ready = null;
async function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!ready) {
    ready = (async () => {
      const { default: pg } = await import("pg");
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
      await pool.query(`CREATE SCHEMA IF NOT EXISTS realm`);
      await pool.query(`CREATE TABLE IF NOT EXISTS realm.accounts (
        nick_key text PRIMARY KEY, nick text NOT NULL, salt text NOT NULL, hash text NOT NULL,
        save jsonb, rev integer NOT NULL DEFAULT 0, created timestamptz NOT NULL DEFAULT now(), updated timestamptz NOT NULL DEFAULT now())`);
      return pool;
    })().catch((e) => { console.error("[realm] база недоступна, аккаунты в файле:", e.message); return null; });
  }
  return ready;
}
const readFile = () => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; } };
const writeFile = (d) => { try { fs.writeFileSync(FILE, JSON.stringify(d)); } catch (e) { console.error("[realm]", e.message); } };

async function getAccount(key) {
  const p = await db();
  if (p) return (await p.query(`SELECT nick, salt, hash, save, rev FROM realm.accounts WHERE nick_key=$1`, [key])).rows[0] || null;
  return readFile()[key] || null;
}
async function createAccount(key, nick, salt, hash) {
  const p = await db();
  if (p) return (await p.query(`INSERT INTO realm.accounts (nick_key, nick, salt, hash) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [key, nick, salt, hash])).rowCount === 1;
  const d = readFile();
  if (d[key]) return false;
  d[key] = { nick, salt, hash, save: null, rev: 0 }; writeFile(d);
  return true;
}
// Принять, только если версия новее сохранённой. Возвращает { ok, rev, save? } — при отказе отдаёт сохранённое.
async function putSave(key, save, rev) {
  const p = await db();
  if (p) {
    const c = await p.connect();
    try {
      await c.query("BEGIN");
      const cur = (await c.query(`SELECT save, rev FROM realm.accounts WHERE nick_key=$1 FOR UPDATE`, [key])).rows[0];
      if (!cur) { await c.query("ROLLBACK"); return null; }
      if (rev <= cur.rev) { await c.query("COMMIT"); return { ok: false, rev: cur.rev, save: cur.save }; }
      await c.query(`UPDATE realm.accounts SET save=$2, rev=$3, updated=now() WHERE nick_key=$1`, [key, save, rev]);
      await c.query("COMMIT");
      return { ok: true, rev };
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  }
  const d = readFile();
  if (!d[key]) return null;
  if (rev <= (d[key].rev || 0)) return { ok: false, rev: d[key].rev, save: d[key].save };
  d[key].save = save; d[key].rev = rev; writeFile(d);
  return { ok: true, rev };
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

const tries = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (tries.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now); tries.set(ip, list);
  if (tries.size > 5000) tries.clear();
  return list.length > 8;
}
const ipOf = (req) => String(req.get("x-forwarded-for") || req.ip || "").split(",")[0].trim();

export function attachRealmAccounts(app) {
  const r = express.Router();
  r.use(express.json({ limit: "700kb" }));

  r.post("/register", async (req, res) => {
    try {
      if (tooMany(ipOf(req))) return res.status(429).json({ error: "Слишком много попыток. Подожди минутку." });
      const nick = cleanNick(req.body?.nick), pass = String(req.body?.pass ?? "");
      if (nick.length < 2) return res.status(400).json({ error: "Ник — хотя бы 2 символа." });
      if (pass.length < 4 || pass.length > 64) return res.status(400).json({ error: "Пароль — от 4 символов." });
      const key = keyOf(nick), salt = crypto.randomBytes(16).toString("hex");
      if (!(await createAccount(key, nick, salt, await hashPass(pass, salt)))) return res.status(409).json({ error: "Этот ник уже занят. Придумай другой или войди." });
      res.json({ token: sign(key), nick, save: null, rev: 0 });
    } catch (e) { console.error("[realm] register", e.message); res.status(500).json({ error: "Ошибка сервера, попробуй ещё раз." }); }
  });

  r.post("/login", async (req, res) => {
    try {
      if (tooMany(ipOf(req))) return res.status(429).json({ error: "Слишком много попыток. Подожди минутку." });
      const nick = cleanNick(req.body?.nick), pass = String(req.body?.pass ?? "");
      const acc = nick ? await getAccount(keyOf(nick)) : null;
      const ok = acc && crypto.timingSafeEqual(Buffer.from(await hashPass(pass, acc.salt), "hex"), Buffer.from(acc.hash, "hex"));
      if (!ok) return res.status(401).json({ error: "Неверный ник или пароль." });
      res.json({ token: sign(keyOf(nick)), nick: acc.nick, save: acc.save || null, rev: acc.rev || 0 });
    } catch (e) { console.error("[realm] login", e.message); res.status(500).json({ error: "Ошибка сервера, попробуй ещё раз." }); }
  });

  const auth = (req, res, next) => {
    const key = verify((req.get("authorization") || "").replace(/^Bearer\s+/i, ""));
    if (!key) return res.status(401).json({ error: "Нужно войти заново." });
    req.key = key; next();
  };
  r.get("/health", async (_req, res) => res.json({ store: (await db()) ? "db" : "file" }));
  r.get("/save", auth, async (req, res) => {
    try {
      const acc = await getAccount(req.key);
      if (!acc) return res.status(401).json({ error: "Нужно войти заново." });
      res.json({ nick: acc.nick, save: acc.save || null, rev: acc.rev || 0 });
    } catch { res.status(500).json({ error: "Ошибка сервера." }); }
  });
  r.put("/save", auth, async (req, res) => {
    try {
      const { save, rev } = req.body || {};
      if (!save || typeof save !== "object" || Array.isArray(save) || !Number.isInteger(rev) || rev < 1 || JSON.stringify(save).length > MAX_SAVE) return res.status(400).json({ error: "Неверные данные." });
      const out = await putSave(req.key, save, rev);
      if (!out) return res.status(401).json({ error: "Нужно войти заново." });
      res.status(out.ok ? 200 : 409).json(out);
    } catch (e) { console.error("[realm] save", e.message); res.status(500).json({ error: "Ошибка сервера." }); }
  });

  app.use("/realm/api", r);
}
