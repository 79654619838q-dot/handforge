import { verifyAccess } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { unauthorized, forbidden } from "../lib/errors.js";

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = verifyAccess(token);
    } catch {
      throw unauthorized("Токен истёк или недействителен");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw unauthorized();
    if (user.banned) throw forbidden(`Аккаунт заблокирован: ${user.banReason || "нарушение правил"}`);

    req.user = user;
    prisma.user
      .update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
      .catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
