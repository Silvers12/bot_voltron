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
  modules/economy/         # bourses, câlins, historique
  modules/settings/        # réglages du serveur (monnaie, bienvenue)
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

## Économie

- Chaque membre a une bourse, ouverte automatiquement avec le solde de bienvenue (5 000 cœurs par défaut).
- Le solde ne peut jamais être négatif : contrainte en base + débit conditionnel atomique.
- Chaque mouvement est historisé (`Transaction`) avec auteur, motif, solde résultant.
- Récompense quotidienne depuis `/profil` : une fois par **jour civil** (fuseau `Europe/Paris`), pas par tranche de 24 h. 200 cœurs de base ; bonus égal à la série en % à partir du jour 2 (jour 2 : +2 %, jour 3 : +3 %…) ; un oubli remet la série à 1. Unicité (membre, jour) garantie en base.
- Récompense hebdomadaire `/hebdo` : 2 000 cœurs, une fois par **semaine civile ISO** (lundi → dimanche).
- La monnaie (nom singulier/pluriel, symbole), le solde de bienvenue et la récompense quotidienne sont réglables par `/admin`.

## Commandes

Membres :
- `/profil` : espace personnel (privé) : bourse, ancienneté, boutons Récompense du jour, Hebdo et Historique.
- `/calin membre montant [message]` : offre des cœurs à un membre (annonce publique).
- `/hebdo` : récompense de la semaine (réponse privée).

Administrateurs (permission Discord *Administrateur*, vérifiée côté serveur) :
- `/admin crediter membre montant [raison]` · `/admin debiter membre montant [raison]`
- `/admin solde membre` · `/admin stats`
- `/admin monnaie singulier pluriel [symbole]` · `/admin bienvenue montant` · `/admin quotidien montant` · `/admin hebdo montant`
