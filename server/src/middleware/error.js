import { AppError } from "../lib/errors.js";

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Маршрут не найден" } });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.name === "ZodError") {
    return res.status(400).json({
      error: { code: "VALIDATION", message: "Некорректные данные", details: err.errors },
    });
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: { code: "FILE_TOO_LARGE", message: "Файл больше 8 МБ" } });
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Внутренняя ошибка сервера" } });
}
