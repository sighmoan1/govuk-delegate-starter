# Independent build: no HMRC or Delegate application code copied.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/observatory/package.json apps/observatory/
RUN npm ci --workspace apps/observatory
COPY styles ./styles
COPY apps/observatory ./apps/observatory
WORKDIR /repo/apps/observatory
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3303
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
