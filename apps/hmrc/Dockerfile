# Build from the repository root: `docker build -f apps/hmrc/Dockerfile .`
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/hmrc/package.json apps/hmrc/
RUN npm ci --workspace apps/hmrc
COPY styles ./styles
COPY dev ./dev
COPY apps/hmrc ./apps/hmrc
WORKDIR /repo/apps/hmrc
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3302
# Migrate, seed only if the database is empty, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts --if-empty && npm start"]
