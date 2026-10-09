# Build from the repository root: `docker build -f apps/delegate/Dockerfile .`
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/delegate/package.json apps/delegate/
COPY packages/web-bot-auth/package.json packages/web-bot-auth/
COPY packages/research-feed/package.json packages/research-feed/
RUN npm ci --workspace apps/delegate --workspace packages/research-feed --workspace packages/web-bot-auth
COPY packages/web-bot-auth ./packages/web-bot-auth
COPY packages/research-feed ./packages/research-feed
COPY styles ./styles
COPY dev ./dev
COPY apps/delegate ./apps/delegate
# Local demo bootstrap configuration is owned by HMRC; Delegate imports no HMRC code.
COPY apps/hmrc/service-catalogue.json ./apps/hmrc/service-catalogue.json
WORKDIR /repo/apps/delegate
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3300
# Migrate, seed only if the database is empty, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts --if-empty && npm start"]
