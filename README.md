# HandForge — PhotoQuest + Poker под одной крышей

Единый вход (`/`) → выбор игры: **PhotoQuest** (`/quest`) или **HandForge
Poker** (`/poker`). Один аккаунт на обе игры (JWT, см. `server/`), общая
навигация и дизайн. Локально всё поднимается одной командой:

```bash
cd hub && npm run start   # HUB на :8877, поднимет server:4000 и poker:3000 сам
```

Деплой — см. [docs/10-deploy.md](docs/10-deploy.md). Структура:

```
hub/     точка входа: меню выбора + реверс-прокси на poker и server
poker/   HandForge Poker (Express + Socket.io)
server/  PhotoQuest API (см. ниже)
web/     PhotoQuest React SPA (см. ниже)
```

---

# PhotoQuest — городская фото-игра с ИИ-проверкой

Браузерное приложение (PWA): игрок получает задание, находит объект в городе,
снимает его встроенной камерой, ИИ проверяет фото и начисляет очки.
Загрузка из галереи невозможна — только съёмка в момент выполнения.

## Стек

| Слой | Технология |
|---|---|
| Frontend | React 18 + Vite, react-router, PWA, getUserMedia |
| Backend | Node.js 20 + Express (ESM) |
| БД | Prisma ORM — SQLite (dev) / PostgreSQL (prod) |
| ИИ | Claude API: `claude-sonnet-5` (зрение/проверка), `claude-haiku-4-5-20251001` (генерация заданий) |
| Хранилище фото | локальный диск (dev) → S3-совместимое (prod), драйверы в `server/src/services/storage.js` |
| Авторизация | JWT + bcrypt |

## Быстрый старт

Нужен Node.js 20+ и ключ Anthropic API.

```bash
# 1. Бэкенд
cd server
cp .env.example .env          # вписать ANTHROPIC_API_KEY и JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run seed                  # 24 стартовых задания + достижения + админ
npm run dev                   # http://localhost:4000

# 2. Фронтенд (второй терминал)
cd web
npm install
npm run dev                   # http://localhost:5173
```

Админ после сида: `admin@photoquest.local` / `admin12345`.

### Камера на телефоне

`getUserMedia` работает только по HTTPS или на `localhost`. Для теста с телефона:

```bash
cd web && npm run dev -- --host      # откроется на 0.0.0.0
```
и пробросить HTTPS через `ngrok http 5173` (или mkcert + `--https`). По голому
`http://192.168.x.x:5173` камера в браузере не откроется — это ограничение браузера,
не приложения.

### Калибровка порогов

Пороги резкости и дубликатов нельзя задать «на глаз» — они зависят от того, чем и как
снимают ваши игроки. Соберите папку с реальными снимками и запустите:

```bash
cd server && npm run calibrate ./photos     # или без аргумента — самопроверка
```

Скрипт покажет резкость каждого кадра и расстояния между хэшами и предложит значения
`BLUR_MIN_SCORE` и `DUPLICATE_HAMMING` для `.env`.

### Переключение на PostgreSQL

В `server/prisma/schema.prisma` заменить `provider = "sqlite"` на `"postgresql"`,
в `.env` указать `DATABASE_URL=postgresql://...`, затем `npx prisma migrate dev`.
Есть `docker-compose.yml` с Postgres + MinIO.

## Структура

```
docs/       техническая документация (архитектура, БД, API, ИИ, антифрод, экраны, план)
server/     Express API, Prisma-схема, ИИ-сервисы, антифрод-пайплайн
web/        React-приложение (14 экранов, включая камеру и админку)
```

## Что уже проверено

- фронтенд собирается (`vite build`, 54 модуля, без ошибок);
- метрики изображений и формулы очков прогнаны на тестовых данных;
- измеренные пределы дедупликации по хэшу — в `docs/05-antifraud.md`.

Не проверено локально: миграции Prisma и живые вызовы Claude API — для первого нужен доступ
к `binaries.prisma.sh`, для второго ключ. На обычной машине оба шага проходят штатно.

Что решено не додумывать за тебя — в `docs/08-open-questions.md`.
