# Build from the repository root: `docker build -f apps/about/Dockerfile .`
FROM node:22-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/about/package.json apps/about/
COPY packages/connected-navigation/package.json packages/connected-navigation/
RUN npm ci --workspace apps/about --workspace packages/connected-navigation
COPY packages/connected-navigation ./packages/connected-navigation
COPY styles ./styles
# The about site shows HMRC's integration code.
COPY apps/hmrc/src/lib/delegated-authority.ts ./apps/hmrc/src/lib/delegated-authority.ts
COPY apps/about ./apps/about
WORKDIR /repo/apps/about
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3304
CMD ["npm", "start"]
