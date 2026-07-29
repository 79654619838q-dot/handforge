import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { storage } from "../services/storage.js";
import { notFound, forbidden } from "../lib/errors.js";

export const photosRouter = Router();
photosRouter.use(requireAuth);

/**
 * Фото не лежат в публичной раздаче. В проде здесь генерируется подписанная
 * ссылка на S3 (10 минут), в dev файл отдаётся напрямую.
 */
photosRouter.get("/:submissionId", async (req, res, next) => {
  try {
    const s = await prisma.submission.findUnique({ where: { id: req.params.submissionId } });
    if (!s) throw notFound("Фото не найдено");
    const isOwner = s.userId === req.user.id;
    const isStaff = ["ADMIN", "MODERATOR"].includes(req.user.role);
    if (!isOwner && !isStaff) throw forbidden();

    const key =
      req.query.variant === "thumb" ? s.photoKey.replace("-orig.jpg", "-thumb.jpg") : s.photoKey;
    const buffer = await storage.get(key);

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=600");
    res.send(buffer);
  } catch (err) {
    if (err?.code === "ENOENT") return next(notFound("Файл фото отсутствует"));
    next(err);
  }
});
