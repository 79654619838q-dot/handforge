import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { config, hasAI } from "./config.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

import { authRouter } from "./routes/auth.js";
import { tasksRouter } from "./routes/tasks.js";
import { assignmentsRouter } from "./routes/assignments.js";
import { submissionsRouter } from "./routes/submissions.js";
import { photosRouter } from "./routes/photos.js";
import { profileRouter } from "./routes/profile.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { achievementsRouter, notificationsRouter } from "./routes/misc.js";
import { adminRouter } from "./routes/admin.js";
import { gameRouter } from "./routes/game.js";
import { ensurePool, expireStale } from "./services/tasks.js";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: config.corsOrigin.split(","), credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(apiLimiter);

// Аватарки видны всем (в лидерборде, за покерным столом и т.п.), поэтому
// раздаём их без авторизации — в отличие от приватных фото заданий.
app.use("/avatars", express.static(path.resolve(process.cwd(), "storage/avatars")));

app.get("/health", (_req, res) =>
  res.json({ ok: true, ai: hasAI() ? "enabled" : "mock", time: new Date().toISOString() })
);

app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/assignments", assignmentsRouter);
app.use("/api/submissions", submissionsRouter);
app.use("/api/photos", photosRouter);
app.use("/api/profile", profileRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/achievements", achievementsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/game", gameRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`PhotoQuest API → http://localhost:${config.port}`);
  if (!hasAI()) {
    console.warn("Ключ ИИ не задан (OPENROUTER_API_KEY/ANTHROPIC_API_KEY): ИИ работает в mock-режиме (только локальные метрики).");
  }
});

// Фоновые задачи. В проде выносятся в отдельный воркер (docs/09-roadmap.md).
setInterval(() => expireStale().catch(() => {}), 60_000);
setInterval(() => ensurePool().catch((e) => console.error("Пул заданий:", e.message)), 3600_000);
