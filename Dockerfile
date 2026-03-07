FROM node:24-slim

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/data

WORKDIR /app

ENV NODE_ENV=production

COPY dist/ .

RUN npm install --omit=dev

EXPOSE 8000

CMD [ "node", "backend/server.js"]