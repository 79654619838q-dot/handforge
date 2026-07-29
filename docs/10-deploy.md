# Деплой

Единый сервис на Render (бесплатный план): один процесс, который поднимает
`hub` (меню + прокси), `poker` и `server` (PhotoQuest API) через
`concurrently`, и отдаёт собранный `web` (React SPA). Прод-БД — Postgres
(Neon, бесплатно), фото — S3-совместимое хранилище (Cloudflare R2,
бесплатно), т.к. диск контейнера на Render free эфемерный.

Что уже готово в репозитории: `render.yaml` (Blueprint), `db push` вместо
миграций для первого деплоя, единый `JWT_SECRET` на весь контейнер.

## Шаги, которые нужно сделать руками

Это учётные записи и секреты — их нельзя создать/ввести за вас.

1. **GitHub.** Создайте пустой репозиторий (без README/gitignore) и пришлите
   мне его адрес (`git remote add ...`) — дальше коммит и пуш сделаю я.

2. **Neon** (neon.tech) — бесплатный Postgres.
   - Зарегистрируйтесь, создайте проект.
   - Скопируйте `DATABASE_URL` (connection string, режим "Pooled connection").

3. **Cloudflare R2** (dash.cloudflare.com → R2) — бесплатное S3-хранилище фото.
   - Создайте bucket, например `photoquest-photos`.
   - Create API Token → S3 API credentials: получите `Access Key ID`
     (→ `S3_KEY`), `Secret Access Key` (→ `S3_SECRET`), и endpoint вида
     `https://<account_id>.r2.cloudflarestorage.com` (→ `S3_ENDPOINT`).
   - `S3_BUCKET` = имя бакета.

4. **Anthropic или OpenRouter** — ключ для ИИ-проверки фото (нужен хотя бы
   один): console.anthropic.com или openrouter.ai → API Keys.

5. **Render** (render.com) — сам хостинг.
   - Sign up (можно через GitHub).
   - New → Blueprint → выбрать этот репозиторий → Render найдёт `render.yaml`.
   - На экране создания Blueprint Render попросит значения для переменных
     `DATABASE_URL`, `ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY`, `S3_*`,
     `CORS_ORIGIN` — вставьте значения из шагов 2–4 (значение
     `CORS_ORIGIN` — это будущий адрес сервиса, например
     `https://handforge.onrender.com`; можно поставить после первого деплоя,
     когда Render покажет реальный домен, и передеплоить).
   - `JWT_SECRET`/`JWT_REFRESH_SECRET` Render сгенерирует сам.
   - Deploy.

6. **Первый сид данных.** После первого успешного деплоя (когда
   `DATABASE_URL` уже указывает на Neon) один раз локально:
   ```bash
   cd server
   DATABASE_URL="<та же строка, что в Render>" npm run seed
   ```
   Это создаст стартовые задания, ачивки и админа
   (`admin@photoquest.local` / `admin12345` — смените пароль после входа).

7. **Кастомный домен (опционально).** Render → сервис → Settings → Custom
   Domain → добавить домен → в DNS у регистратора создать CNAME/A по
   инструкции Render. HTTPS Render выпускает и обновляет сам.

## Особенности бесплатного плана Render

- Сервис засыпает после ~15 минут без запросов, первый запрос после сна
  занимает ~30–60 сек (холодный старт). Для группы друзей это нормально;
  чтобы будить пореже — можно настроить бесплатный пинг на uptimerobot.com
  или cron-job.org раз в 10 минут в часы игры.
- Диск контейнера эфемерный — поэтому БД и фото вынесены наружу (шаги 2–3).
  Данные вебо́к покера (журналы столов, `poker/data/ledgers/`) при засыпании/
  редеплое теряются — это принято как компромисс для бесплатного хостинга.
