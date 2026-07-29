export class AppError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (code, msg, details) => new AppError(code, msg, 400, details);
export const unauthorized = (msg = "Требуется авторизация") => new AppError("UNAUTHORIZED", msg, 401);
export const forbidden = (msg = "Недостаточно прав") => new AppError("FORBIDDEN", msg, 403);
export const notFound = (msg = "Не найдено") => new AppError("NOT_FOUND", msg, 404);
