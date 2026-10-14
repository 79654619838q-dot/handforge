# Второй сайт: Hugging Face Spaces (Docker, бесплатно, не засыпает без 48 ч тишины).
# Тот же набор, что на Render (render.yaml): PhotoQuest (server + web), Poker, Cell Survival и хаб со всеми играми.
# База — та же Postgres из DATABASE_URL, поэтому аккаунты, сохранения и рейтинги на обоих сайтах общие.
# Схему базы здесь не трогаем (prisma db push делает Render) — только генерируем клиент.
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
# Hugging Face запускает контейнер под пользователем с uid 1000 — это пользователь node
USER node
WORKDIR /home/node/app
COPY --chown=node . .
RUN npm install --prefix server && npm run generate --prefix server \
 && npm install --prefix web && npm run build --prefix web \
 && npm install --prefix poker \
 && npm install --prefix cell-survival && npm run build --prefix cell-survival \
 && npm install --prefix hub \
 && npm cache clean --force
ENV NODE_ENV=production PORT=7860
EXPOSE 7860
CMD ["npm", "run", "start", "--prefix", "hub"]
