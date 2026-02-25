FROM node:24-slim

RUN apt-get update -y && apt-get install -y openssl ca-certificates bash bash-completion && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/data

WORKDIR /app

ENV NODE_ENV=production

RUN npm install pm2 -g

COPY dist/ .

RUN npm install --omit=dev

RUN npx prisma generate

EXPOSE 8000

CMD [ "node", "backend/server.js"]