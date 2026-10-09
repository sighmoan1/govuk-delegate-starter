FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci
WORKDIR /app/apps/council
EXPOSE 3305
CMD ["npm", "start"]
