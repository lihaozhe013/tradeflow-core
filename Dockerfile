FROM node:24-slim

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /workspace/cache
RUN mkdir -p /workspace/config

WORKDIR /workspace

ENV NODE_ENV=production

COPY dist/ .

RUN npm install -g pnpm && pnpm install --prod

EXPOSE 8000

CMD [ "node", "backend/server.js"]