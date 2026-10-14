# Independent build: no HMRC or Delegate application code copied.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates python3 python3-venv && rm -rf /var/lib/apt/lists/*
COPY apps/observatory/research/requirements.txt /tmp/observatory-requirements.txt
RUN python3 -m venv /opt/observatory-python && /opt/observatory-python/bin/pip install --no-cache-dir -r /tmp/observatory-requirements.txt
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/observatory/package.json apps/observatory/
COPY packages/research-feed/package.json packages/research-feed/
RUN npm ci --include-workspace-root --workspace apps/observatory --workspace packages/research-feed
COPY packages/research-feed ./packages/research-feed
COPY styles ./styles
COPY apps/observatory ./apps/observatory
WORKDIR /repo/apps/observatory
RUN npm run build
ENV NODE_ENV=production
ENV OBSERVATORY_PYTHON=/opt/observatory-python/bin/python
ENV OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
EXPOSE 3303
# Existing local Compose behavior. Hosted providers override with start-hosted.mjs.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
