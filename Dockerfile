FROM node:22-alpine AS build
WORKDIR /app
# `prisma generate` charge prisma.config.ts, qui exige DATABASE_URL ; aucune connexion n'est faite au build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Polices pour le texte des images générées (sharp/librsvg)
RUN apk add --no-cache fontconfig ttf-dejavu
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY content ./content
USER node
# Applique les migrations puis démarre le bot
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
