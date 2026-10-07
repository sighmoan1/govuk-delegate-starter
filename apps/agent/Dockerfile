# Build from the repository root: `docker build -f apps/agent/Dockerfile .`
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/agent/package.json apps/agent/
RUN npm ci --workspace apps/agent
COPY dev ./dev
COPY apps/agent ./apps/agent
WORKDIR /repo/apps/agent
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3303
# Migrate, seed only if the database is empty, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
