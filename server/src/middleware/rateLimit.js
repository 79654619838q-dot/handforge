import rateLimit from "express-rate-limit";

const keyByUser = (req) => req.user?.id || req.ip;

export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMIT", message: "Слишком много попыток входа, подождите минуту" } },
});

export const submissionLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 12,
  keyGenerator: keyByUser,
  message: { error: { code: "RATE_LIMIT", message: "Лимит 12 отправок в час исчерпан, попробуйте позже" } },
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 200,
  keyGenerator: keyByUser,
  message: { error: { code: "RATE_LIMIT", message: "Слишком много запросов" } },
});
