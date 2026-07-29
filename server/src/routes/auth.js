import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signAccess, signRefresh, verifyRefresh } from "../lib/jwt.js";
import { badRequest, unauthorized } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { publicUser } from "../services/verification.js";
import { pickTaskFor, issueAssignment, ensurePool } from "../services/tasks.js";

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().min(3, "Логин от 3 символов").max(20),
  password: z.string().min(8, "Пароль от 8 символов"),
});

authRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const { username, password } = registerSchema.parse(req.body);

    const exists = await prisma.user.findUnique({ where: { username } });
    if (exists) throw badRequest("USER_EXISTS", "Такой логин уже занят");

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
      },
    });

    // Первое задание выдаём сразу — пустая главная убивает первую сессию
    await ensurePool().catch(() => {});
    const task = await pickTaskFor(user);
    if (task) await issueAssignment(user, task);

    res.status(201).json({
      user: publicUser(user),
      accessToken: signAccess(user),
      refreshToken: signRefresh(user),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", authLimiter, async (req, res, next) => {
  try {
    const { username, password } = z
      .object({ username: z.string().min(1), password: z.string() })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized("Неверный логин или пароль");
    }

    res.json({
      user: publicUser(user),
      accessToken: signAccess(user),
      refreshToken: signRefresh(user),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
    let payload;
    try {
      payload = verifyRefresh(refreshToken);
    } catch {
      throw unauthorized("Сессия истекла, войдите заново");
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw unauthorized();
    res.json({ accessToken: signAccess(user), refreshToken: signRefresh(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});
