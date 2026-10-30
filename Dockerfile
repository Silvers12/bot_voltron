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
# Polices pour le texte des images générées (sharp/librsvg) ; ffmpeg + python3 pour la lecture YouTube (yt-dlp)
RUN apk add --no-cache fontconfig ttf-dejavu font-noto-emoji ffmpeg python3 curl \
 && mkdir -p /app/bin \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /app/bin/yt-dlp \
 && chmod +x /app/bin/yt-dlp && chown node:node /app/bin/yt-dlp
# yt-dlp se met à jour seul (yt-dlp -U, chaque nuit quand rien n'est en lecture) : le binaire appartient à node
ENV PATH=/app/bin:$PATH
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY content ./content
USER node
# Applique les migrations puis démarre le bot
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
