// Сайт выдачи доступа к HandForge Manager.
//
// Две стороны:
//   * клуб -- входит логином и паролем, видит свой срок и скачивает
//     программу;
//   * оператор -- заводит клубы, выбирает срок, получает логин и пароль
//     и готовое сообщение для отправки, продлевает и закрывает доступ.
//
// Третий вход -- для самой программы: она спрашивает «логин такой есть,
// до какого числа?» при запуске (см. /api/program/check). Без него
// скачавший программу пользовался бы ею вечно, и логин не значил бы
// ничего.
//
// Данные турниров, игроков и рейтингов сюда НЕ ПОПАДАЮТ: они живут в
// базах рядом с программой на компьютере клуба. Сайт знает только клуб,
// логин, срок и отметки входов.
import express from "express";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PLANS, accessState, checkPassword, clubMessage, daysLeft, expiryFrom,
  formatDate, hashPassword, makeLogin, makePassword, planDays, planTitle,
} from "./access.js";
import * as store from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8890;
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
// Секрет для подписи входов. На рабочем сайте задаётся в настройках
// сервиса; локально -- случайный на запуск (вход живёт до перезапуска).
const JWT_SECRET = process.env.JWT_SECRET || makePassword(32);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
// Ссылка на сборку программы. Файл большой (архив около 1,5 ГБ), поэтому
// лежит не на сайте, а в хранилище GitHub Releases: сайт только пускает
// или не пускает к нему.
const RELEASE_URL = process.env.RELEASE_URL || "";
const RELEASE_VERSION = process.env.RELEASE_VERSION || "";
const RELEASE_SIZE = process.env.RELEASE_SIZE || "";
// Сколько дней программа работает без связи после удачной проверки --
// чтобы упавший интернет не сорвал турнир.
const OFFLINE_GRACE_DAYS = Number(process.env.OFFLINE_GRACE_DAYS || 3);

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "64kb" }));

const loginLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true });

// На рабочем сайте файловая база не годится: диск там эфемерный, и
// заведённые клубы пропали бы при первом же перезапуске. Пока
// DATABASE_URL не задан, честно отвечаем «не настроен» -- это лучше, чем
// принять клуб и потерять его вместе с оплаченным сроком.
const needsDatabase = store.driver === "none"
  || (store.driver === "sqlite" && process.env.RENDER === "true");
if (needsDatabase) {
  app.use("/api", (_req, res) => res.status(503).json({
    error: "Сайт ещё не настроен: нет постоянной базы (DATABASE_URL)",
  }));
}

// --- входы ------------------------------------------------------------------
const signClub = (club) => jwt.sign({ kind: "club", id: club.id }, JWT_SECRET, { expiresIn: "12h" });
const signAdmin = () => jwt.sign({ kind: "admin" }, JWT_SECRET, { expiresIn: "12h" });

function tokenFrom(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function readToken(req, kind) {
  try {
    const payload = jwt.verify(tokenFrom(req), JWT_SECRET);
    return payload.kind === kind ? payload : null;
  } catch {
    return null;
  }
}

async function requireClub(req, res, next) {
  const payload = readToken(req, "club");
  if (!payload) return res.status(401).json({ error: "Нужен вход" });
  const club = await store.clubById(payload.id);
  if (!club) return res.status(401).json({ error: "Клуб не найден" });
  req.club = club;
  next();
}

function requireAdmin(req, res, next) {
  if (!readToken(req, "admin")) return res.status(401).json({ error: "Нужен вход" });
  next();
}

const clubView = (club) => ({
  id: club.id,
  name: club.name,
  contact: club.contact,
  login: club.login,
  plan: club.plan,
  planTitle: planTitle(club.plan, daysLeft(club.expiresAt, new Date(club.startsAt))),
  startsAt: club.startsAt,
  expiresAt: club.expiresAt,
  expiresAtText: formatDate(club.expiresAt),
  daysLeft: daysLeft(club.expiresAt),
  blocked: club.blocked,
  lastLoginAt: club.lastLoginAt,
  loginCount: club.loginCount,
  downloadCount: club.downloadCount,
  note: club.note,
  state: accessState(club).reason,
});

// --- сторона клуба ------------------------------------------------------------
app.post("/api/login", loginLimit, async (req, res) => {
  const { login, password } = req.body || {};
  const club = await store.clubByLogin(String(login || "").trim().toLowerCase());
  const ok = club && await checkPassword(String(password || ""), club.passwordHash);
  if (!ok) {
    if (club) await store.addEvent(club.id, "denied", "неверный пароль");
    return res.status(401).json({ error: "Логин или пароль не подходят" });
  }
  const state = accessState(club);
  await store.updateClub(club.id, {
    lastLoginAt: new Date().toISOString(),
    loginCount: club.loginCount + 1,
  });
  await store.addEvent(club.id, state.ok ? "login" : "denied", state.ok ? "сайт" : state.reason);
  res.json({ token: signClub(club), access: state, club: clubView(await store.clubById(club.id)) });
});

app.get("/api/me", requireClub, async (req, res) => {
  const state = accessState(req.club);
  res.json({
    club: clubView(req.club),
    access: state,
    release: state.ok && RELEASE_URL
      ? { version: RELEASE_VERSION, size: RELEASE_SIZE }
      : null,
  });
});

app.get("/api/download", requireClub, async (req, res) => {
  const state = accessState(req.club);
  if (!state.ok) return res.status(403).json({ error: state.text });
  if (!RELEASE_URL) return res.status(503).json({ error: "Сборка ещё не выложена" });
  await store.updateClub(req.club.id, { downloadCount: req.club.downloadCount + 1 });
  await store.addEvent(req.club.id, "download", RELEASE_VERSION || "");
  res.redirect(302, RELEASE_URL);
});

// --- сторона программы ---------------------------------------------------------
// Программа спрашивает это при запуске. Ответ короткий и машинный:
// пускать или нет, до какого числа и сколько дней можно работать без
// связи.
app.post("/api/program/check", loginLimit, async (req, res) => {
  const { login, password } = req.body || {};
  const club = await store.clubByLogin(String(login || "").trim().toLowerCase());
  const ok = club && await checkPassword(String(password || ""), club.passwordHash);
  if (!ok) {
    if (club) await store.addEvent(club.id, "denied", "программа: неверный пароль");
    return res.status(401).json({ ok: false, reason: "unknown",
      text: "Логин или пароль не подходят" });
  }
  const state = accessState(club);
  await store.addEvent(club.id, state.ok ? "program" : "denied",
    state.ok ? "программа" : `программа: ${state.reason}`);
  if (!state.ok) return res.status(403).json({ ok: false, reason: state.reason, text: state.text });
  res.json({
    ok: true,
    club: club.name,
    plan: club.plan,
    expiresAt: club.expiresAt,
    expiresAtText: formatDate(club.expiresAt),
    daysLeft: daysLeft(club.expiresAt),
    offlineGraceDays: OFFLINE_GRACE_DAYS,
  });
});

// --- сторона оператора ----------------------------------------------------------
app.post("/api/admin/login", loginLimit, (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: "Пароль управления не задан (ADMIN_PASSWORD)" });
  if (String(password || "") !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Пароль не подходит" });
  }
  res.json({ token: signAdmin() });
});

app.get("/api/admin/clubs", requireAdmin, async (_req, res) => {
  const clubs = await store.listClubs();
  res.json({ clubs: clubs.map(clubView), plans: PLANS });
});

app.post("/api/admin/clubs", requireAdmin, async (req, res) => {
  const { name, contact, plan, customDays, note } = req.body || {};
  const title = String(name || "").trim();
  if (title.length < 2) return res.status(400).json({ error: "Назовите клуб" });
  const days = planDays(plan, customDays);
  if (!days) return res.status(400).json({ error: "Выберите срок" });

  const taken = new Set((await store.listClubs()).map((c) => c.login));
  const login = makeLogin(title, taken);
  const password = makePassword();
  const startsAt = new Date().toISOString();
  const club = await store.createClub({
    id: crypto.randomUUID(),
    name: title,
    contact: String(contact || "").trim() || null,
    login,
    passwordHash: await hashPassword(password),
    plan,
    startsAt,
    expiresAt: expiryFrom(startsAt, days),
    note: String(note || "").trim() || null,
    createdAt: startsAt,
  });
  await store.addEvent(club.id, "created", planTitle(plan, days));
  // Пароль возвращается ОДИН раз -- в базе только его отпечаток. Поэтому
  // здесь же готовое сообщение для отправки клубу.
  res.json({
    club: clubView(club),
    password,
    message: clubMessage({ name: club.name, login, password,
      expiresAt: club.expiresAt, siteUrl: SITE_URL }),
  });
});

app.post("/api/admin/clubs/:id/extend", requireAdmin, async (req, res) => {
  const club = await store.clubById(req.params.id);
  if (!club) return res.status(404).json({ error: "Клуб не найден" });
  const { plan, customDays } = req.body || {};
  const days = planDays(plan, customDays);
  if (!days) return res.status(400).json({ error: "Выберите срок" });
  // Продление от БОЛЬШЕЙ из двух дат: у действующего клуба срок
  // прибавляется к остатку, у просроченного -- считается от сегодня.
  const base = new Date(club.expiresAt).getTime() > Date.now()
    ? club.expiresAt : new Date().toISOString();
  const updated = await store.updateClub(club.id, {
    plan, expiresAt: expiryFrom(base, days), blocked: false,
  });
  await store.addEvent(club.id, "extended", `${planTitle(plan, days)} -> ${formatDate(updated.expiresAt)}`);
  res.json({ club: clubView(updated) });
});

app.post("/api/admin/clubs/:id/block", requireAdmin, async (req, res) => {
  const club = await store.clubById(req.params.id);
  if (!club) return res.status(404).json({ error: "Клуб не найден" });
  const blocked = Boolean(req.body?.blocked);
  const updated = await store.updateClub(club.id, { blocked });
  await store.addEvent(club.id, blocked ? "blocked" : "unblocked", "");
  res.json({ club: clubView(updated) });
});

app.post("/api/admin/clubs/:id/password", requireAdmin, async (req, res) => {
  const club = await store.clubById(req.params.id);
  if (!club) return res.status(404).json({ error: "Клуб не найден" });
  const password = makePassword();
  await store.updateClub(club.id, { passwordHash: await hashPassword(password) });
  await store.addEvent(club.id, "password", "выдан новый пароль");
  res.json({
    password,
    message: clubMessage({ name: club.name, login: club.login, password,
      expiresAt: club.expiresAt, siteUrl: SITE_URL }),
  });
});

app.get("/api/admin/clubs/:id/events", requireAdmin, async (req, res) => {
  res.json({ events: await store.clubEvents(req.params.id) });
});

app.delete("/api/admin/clubs/:id", requireAdmin, async (req, res) => {
  const club = await store.clubById(req.params.id);
  if (!club) return res.status(404).json({ error: "Клуб не найден" });
  await store.deleteClub(club.id);
  res.json({ ok: true });
});

// --- страницы -------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));
app.get("/health", (_req, res) => res.json({
  ok: !needsDatabase, driver: store.driver, needsDatabase,
}));

const start = async () => {
  try {
    await store.init();
  } catch (error) {
    console.log(`[access] база недоступна: ${error.message}`);
  }
  app.listen(PORT, () => {
    console.log(`[access] сайт доступа на ${SITE_URL} (хранилище: ${store.driver})`);
    if (!ADMIN_PASSWORD) console.log("[access] ВНИМАНИЕ: ADMIN_PASSWORD не задан, вход оператора закрыт");
    if (!RELEASE_URL) console.log("[access] ВНИМАНИЕ: RELEASE_URL не задан, скачивание недоступно");
  });
};

if (process.env.NODE_ENV !== "test") start();

export { app, start };
