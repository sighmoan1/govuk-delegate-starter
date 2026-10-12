# Build from the repository root. Private inputs are runtime mounts, never image files.
FROM node:22-bookworm-slim
WORKDIR /repo
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json ./
COPY apps/whenisbins/package.json apps/whenisbins/
COPY packages/connected-navigation/package.json packages/connected-navigation/
COPY packages/research-feed/package.json packages/research-feed/
COPY packages/whenisbins-email/package.json packages/whenisbins-email/
COPY packages/whenisbins-runner/package.json packages/whenisbins-runner/
RUN npm ci --workspace apps/whenisbins --omit=dev
RUN node node_modules/playwright/cli.js install --with-deps chromium
COPY styles styles
COPY packages/connected-navigation packages/connected-navigation
COPY apps/about/public/assets/fonts/LexendDeca-400.woff2 apps/about/public/assets/fonts/LexendDeca-700.woff2 apps/about/public/assets/fonts/
COPY apps/whenisbins/src apps/whenisbins/src
COPY apps/whenisbins/service-catalogue.json apps/whenisbins/service-catalogue.json
COPY apps/whenisbins/evidence.html apps/whenisbins/evidence.html
COPY apps/whenisbins/properties.json apps/whenisbins/properties.json
COPY packages/research-feed/src packages/research-feed/src
COPY packages/whenisbins-email/src packages/whenisbins-email/src
COPY packages/whenisbins-runner/src packages/whenisbins-runner/src
RUN mkdir -m 700 /state
EXPOSE 3310 3311
CMD ["npm", "start", "--workspace", "apps/whenisbins"]
