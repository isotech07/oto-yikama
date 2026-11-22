# Tek servisli imaj (Render vb.): API + derlenmiş web arayüzü. Derleme bağlamı: depo kökü.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
RUN npm ci
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w apps/web \
 && cd apps/api && npx prisma generate && npx tsc -p tsconfig.json
RUN npm prune --omit=dev -w apps/api --include-workspace-root

FROM node:22-bookworm-slim
ENV NODE_ENV=production WEB_DIST_DIR=/app/web
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/web/dist ./web
COPY --chown=node:node deploy/render/start.sh /app/start.sh
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "/app/start.sh"]
