# 3. API

База: `/api`. Формат — JSON. Авторизация: `Authorization: Bearer <accessToken>`.
Ошибки единообразны: `{ "error": { "code": "TASK_EXPIRED", "message": "..." } }`.

## Auth

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| POST | `/auth/register` | `{email, username, password}` | `{user, accessToken, refreshToken}` |
| POST | `/auth/login` | `{email, password}` | `{user, accessToken, refreshToken}` |
| POST | `/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` |
| GET | `/auth/me` | — | `{user}` |

## Задания

| Метод | Путь | Описание |
|---|---|---|
| GET | `/tasks` | Пул доступных заданий. Фильтры: `?difficulty=1..5&category=` |
| GET | `/tasks/:id` | Одно задание |
| POST | `/tasks/:id/accept` | Принять → `{assignment: {id, nonce, expiresAt}}` |
| GET | `/assignments/active` | Текущее активное задание или `null` |
| POST | `/assignments/:id/cancel` | Отказаться (штраф серии) |
| POST | `/assignments/:id/capture-session` | Открыть камеру → `{captureToken, ttl}` |

## Сдача фото

`POST /submissions` — `multipart/form-data`:

| Поле | Тип | Обязательно |
|---|---|---|
| `photo` | file (jpeg/png/webp, ≤ 8 МБ) | да |
| `assignmentId` | string | да |
| `nonce` | string | да |
| `captureToken` | string | да |
| `clientMeta` | JSON-строка: `{elapsedMs, deviceRatio, hasTorch, lat?, lng?, accuracy?}` | да |

Ответ:
```json
{
  "submissionId": "sub_...",
  "status": "APPROVED",
  "score": 145,
  "breakdown": { "base": 100, "speed": 30, "streak": 15 },
  "ai": {
    "match": true,
    "confidence": 0.93,
    "detected": ["красный седан", "асфальт", "бордюр"],
    "extractedText": null,
    "reasons": ["Объект соответствует: красный автомобиль в кадре целиком"]
  },
  "user": { "points": 1420, "level": 7, "xp": 3200, "streak": 4 },
  "unlockedAchievements": [{ "code": "FIRST_BLOOD", "title": "Первый кадр" }],
  "nextTask": { "id": "tsk_...", "title": "Найти велосипед" }
}
```

При отказе: `status: "REJECTED"`, `reasonCode` из списка
`NO_MATCH | BLURRY | DUPLICATE | SCREEN_PHOTO | AI_GENERATED | EDITED | LOW_QUALITY | EXPIRED | NO_CAPTURE_TOKEN`,
плюс `attemptsLeft`.

| Метод | Путь | Описание |
|---|---|---|
| GET | `/submissions/history?page=1` | История с превью и вердиктами |
| GET | `/submissions/:id` | Детали одной попытки |
| GET | `/photos/:id` | Подписанная отдача файла (10 мин) |

## Профиль, рейтинг, прочее

| Метод | Путь | Описание |
|---|---|---|
| GET | `/profile` | Профиль + агрегированная статистика |
| PATCH | `/profile` | `{username?, avatarColor?, settings?}` |
| GET | `/leaderboard?period=week\|month\|all&limit=50` | Топ + позиция игрока |
| GET | `/achievements` | Все достижения с прогрессом |
| GET | `/notifications` | Список |
| POST | `/notifications/read` | `{ids: []}` |
| GET | `/stats/me` | Графики: сабмиты по дням, доля одобренных, средняя скорость |

## Админка (`ADMIN` / `MODERATOR`)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/admin/stats` | DAU, сабмиты, доля отказов, расход на ИИ |
| GET | `/admin/tasks` · POST · PATCH · DELETE | CRUD пула заданий |
| POST | `/admin/tasks/generate` | `{count, city?, difficultyMix?}` → генерация ИИ |
| GET | `/admin/submissions?status=` | Лента сабмитов с фото и вердиктами |
| POST | `/admin/submissions/:id/override` | `{status, note}` — ручной пересмотр |
| GET | `/admin/users` · POST `/admin/users/:id/ban` | Модерация игроков |
| GET | `/admin/fraud` | Лента срабатываний антифрода |

## Лимиты

| Эндпоинт | Лимит |
|---|---|
| `/auth/*` | 5 запросов / мин / IP |
| `/submissions` | 30 / час / пользователь, 1 / 5 сек |
| остальные | 200 / мин / пользователь |
