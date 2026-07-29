// Единая точка входа под одну публичную ссылку. Ничего не переписывает изнутри
// Poker и PhotoQuest — просто раскладывает трафик по путям: "/" — меню выбора,
// "/poker" — HandForge Poker, "/quest" — PhotoQuest.
// PhotoQuest отдаёт готовую сборку (npm run build), Poker работает как обычно.

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8877;
const POKER_TARGET = process.env.POKER_TARGET || "http://localhost:3000";
const QUEST_API_TARGET = process.env.QUEST_API_TARGET || "http://localhost:4000";
const QUEST_DIST = path.join(__dirname, "..", "web", "dist");

const app = express();

// Ассеты PhotoQuest (favicon, логотип, собранные js/css) ссылаются на себя
// от корня сайта — отдаём их с корня, но index.html руками не отдаём,
// чтобы "/" осталась за меню, а не была тихо перехвачена сборкой квеста.
app.use(express.static(QUEST_DIST, { index: false }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "menu.html"));
});

// PhotoQuest API — бэкенд сам ждёт путь ровно "/api/...", префикс не срезаем.
app.use(
  "/api",
  createProxyMiddleware({ target: QUEST_API_TARGET, changeOrigin: true, pathFilter: "/api" })
);

// Аватарки профиля (свои загруженные фото) отдаёт тот же бэкенд, что и API,
// но публично (без авторизации) — см. server/src/index.js.
app.use(
  "/avatars",
  createProxyMiddleware({ target: QUEST_API_TARGET, changeOrigin: true, pathFilter: "/avatars" })
);

// Клиент Poker всегда стучится в "/socket.io/..." от корня (так устроен
// socket.io-client) — резервируем этот путь целиком за Poker.
app.use(
  "/socket.io",
  createProxyMiddleware({ target: POKER_TARGET, changeOrigin: true, ws: true, pathFilter: "/socket.io" })
);

// Ассеты Poker — относительные (css/..., js/...), поэтому без хвостового "/"
// index.html резолвил бы их от корня сайта, а не от /poker — редиректим.
// Express без strict routing считает "/poker" и "/poker/" одним и тем же
// маршрутом, поэтому проверяем req.path руками — иначе "/poker/" редиректило
// бы само на себя и уходило в бесконечный редирект-луп.
app.get("/poker", (req, res, next) => {
  if (req.path === "/poker") return res.redirect(301, "/poker/");
  next();
});

// Poker: свои ассеты у него относительные (css/..., js/...), поэтому под
// префиксом /poker всё резолвится само — префикс перед проксированием срезаем,
// чтобы бэкенд Poker видел привычные для себя пути от корня.
app.use(
  "/poker",
  createProxyMiddleware({
    target: POKER_TARGET,
    changeOrigin: true,
    pathFilter: "/poker",
    pathRewrite: { "^/poker": "" },
  })
);

// PhotoQuest — SPA на React Router: любой путь внутри /quest отдаём одним
// и тем же index.html, дальше маршрутизацией занимается сам React Router.
app.get(["/quest", "/quest/*"], (_req, res) => {
  res.sendFile(path.join(QUEST_DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`HandForge Hub → http://localhost:${PORT}`);
  console.log(`  /        меню`);
  console.log(`  /poker   → ${POKER_TARGET}`);
  console.log(`  /quest   → ${QUEST_DIST}`);
  console.log(`  /api     → ${QUEST_API_TARGET}`);
});
