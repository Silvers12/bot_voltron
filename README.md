# Voltron — loutre paladin, bot Discord communautaire

Bot privé pour un seul serveur (~80 membres) : animation, jeux et fun. Sans modération ni administration (l'équipe du serveur s'en charge).

## Stack

Node 22 · TypeScript · discord.js 14 · PostgreSQL 17 · Prisma 7 · Docker Compose

## Structure

```
src/
  index.ts                 # démarrage, chargement, arrêt propre
  core/                    # config (.env), logger
  infrastructure/prisma.ts # client Prisma (adapter pg)
  discord/
    client.ts              # client Discord et intents
    types.ts               # defineCommand / defineEvent
    loaders.ts             # chargement auto de commands/ et events/
    deploy-commands.ts     # enregistre les slash commands sur le serveur
    commands/              # une slash command par fichier
    events/                # un événement Discord par fichier
  modules/community/       # membres et profil
prisma/schema.prisma       # modèle de données
prisma/migrations/         # migrations versionnées
```

## Membres

Un profil `Member` est créé automatiquement :
- à l'arrivée sur le serveur (`guildMemberAdd`) ;
- par synchronisation complète au démarrage du bot ;
- à la première interaction avec le bot (filet de sécurité).

Un départ marque `leftAt` sans supprimer le profil. Nécessite l'intent **Server Members** activé dans le Developer Portal (Bot → Privileged Gateway Intents).

## Développement

```bash
cp .env.example .env            # puis remplir les valeurs
npm install
docker compose up -d postgres   # base locale sur 127.0.0.1:5432
npm run db:migrate              # applique les migrations
npm run deploy                  # enregistre les commandes sur le serveur
npm run dev                     # lance le bot avec rechargement auto
```

Après modification de `prisma/schema.prisma` : `npm run db:migrate -- --name <nom>`.

## Production (Docker)

```bash
docker compose up -d --build    # bot + postgres ; les migrations s'appliquent au démarrage
docker compose logs -f bot
```

## Commandes

- `/profil` : espace personnel du membre (réponse privée).
