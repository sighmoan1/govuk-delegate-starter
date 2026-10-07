# Build from the repository root: `docker build -f apps/onelogin/Dockerfile .`
FROM node:22-slim
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/onelogin/package.json apps/onelogin/
RUN npm ci --workspace apps/onelogin
COPY apps/onelogin ./apps/onelogin
WORKDIR /repo/apps/onelogin
# Rewrites are fixed at build time, so the simulator's address is a build arg.
ARG SIMULATOR_INTERNAL_URL=http://simulator:3000
ENV SIMULATOR_INTERNAL_URL=$SIMULATOR_INTERNAL_URL
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3301
CMD ["npm", "start"]
