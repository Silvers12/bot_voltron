FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
# Applique les migrations puis démarre le bot
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
