# Build from the repository root: `docker build -f apps/delegate/Dockerfile .`
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/delegate/package.json apps/delegate/
RUN npm ci --workspace apps/delegate
COPY styles ./styles
COPY dev ./dev
COPY apps/delegate ./apps/delegate
WORKDIR /repo/apps/delegate
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3300
# Migrate, seed only if the database is empty, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts --if-empty && npm start"]
