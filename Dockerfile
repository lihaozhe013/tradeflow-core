FROM oven/bun:1.4.2-slim AS dependencies

WORKDIR /workspace

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN bun install --frozen-lockfile --production --omit=peer --filter backend

FROM oven/bun:1.4.2-slim

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

ENV NODE_ENV=production

RUN mkdir -p /workspace/cache /workspace/config

COPY package.json ./package.json
COPY backend/package.json ./backend/package.json
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/backend/node_modules ./backend/node_modules
COPY dist/ ./

EXPOSE 8000

CMD ["bun", "--no-install", "backend/server.js"]
