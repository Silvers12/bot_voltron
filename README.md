# Voltron — loutre paladin, bot Discord communautaire

Bot privé pour un ou plusieurs serveurs choisis (liste `DISCORD_GUILD_IDS`) : animation, jeux et fun. Sans modération ni administration (l'équipe du serveur s'en charge).

Chaque serveur autorisé a ses propres membres, bourses, boutique, réglages et classement ; les textes de `content/` et la liste des intendants (`DISCORD_ADMIN_IDS`) sont communs. Tout autre serveur est ignoré.

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
  modules/economy/         # bourses, câlins, récompenses, historique
  modules/shop/            # boutique, inventaire, administration des articles
  modules/progression/     # XP messages/vocal, classement
  modules/banter/          # compliments et insultes (textes dans content/)
  modules/casino/          # blackjack
  modules/events/          # câlin collectif (apparitions planifiées)
content/                   # textes éditables (compliments, insultes)
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

## Inviter le bot sur un serveur

Lien d'invitation (scopes `bot` + `applications.commands`, permission *Envoyer des messages*) :

```
https://discord.com/oauth2/authorize?client_id=VOTRE_CLIENT_ID&scope=bot%20applications.commands&permissions=2048
```

À retrouver dans le Developer Portal → application → **OAuth2 → URL Generator**. Ajouter *Gérer les rôles* si des articles-rôles sont vendus en boutique. Après invitation : ajouter l'identifiant du serveur à `DISCORD_GUILD_IDS`, relancer le bot, puis `npm run deploy`.

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

## Boutique

- Articles gérés par les admins : nom, description, emoji, prix, stock (optionnel), limite par membre (optionnelle).
- Deux types : **collection** (simplement possédé) et **rôle** (attribue un rôle Discord à l'achat ; le bot doit avoir « Gérer les rôles » et être placé au-dessus du rôle vendu). Si Discord refuse l'attribution, l'achat est remboursé automatiquement.
- Achat depuis `/profil` → Boutique → choix dans le menu → fiche → bouton Acheter. Débit, stock, limite et inventaire sont mis à jour dans une seule transaction.
- Un article retiré reste en base : les exemplaires achetés restent visibles dans les inventaires.

## Expérience (XP)

- +1 XP par message, dans tout salon visible par le bot (le contenu n'est pas lu : intent `GuildMessages` seulement). Au plus un message compté par minute (anti-spam, réglable).
- +1 XP par tranche de 30 min en vocal, hors salon AFK. Les sessions sont persistées (`VoiceSession`) et pointées chaque minute : un redémarrage du bot ne perd pas le temps déjà crédité.
- `/classement` : 10 membres par page avec boutons, rang du demandeur en pied de page. L'XP et le rang figurent aussi sur `/profil`.
- Réglages : `/admin xp` (sans option : affiche ; avec options : modifie).

## Compliments et insultes

- `/compliment membre` et `/insulte membre` : message public avec un texte tiré au sort. Second degré, bienveillant.
- Textes dans `content/compliments.json` et `content/insultes.json` : 3 catégories (10 classiques, 5 rares, 5 épiques) et poids de tirage (80 / 15 / 5 par défaut). Modifiables sans toucher au code ; rechargés au démarrage du bot. Variables : `{cible}`, `{auteur}`.

## Blackjack

- `/blackjack mise` : partie privée contre la banque (Voltron). Boutons Tirer / Rester / Doubler, puis Rejouer.
- Règles : banque tire jusqu'à 17 (reste sur 17 souple), blackjack naturel payé 3:2, double sur les deux premières cartes, pas de split ni d'assurance.
- La mise est débitée au départ (`BET`), le gain crédité à la fin (`BET_WIN`). Une seule partie active par membre (contrainte en base) ; le règlement est atomique, un double clic ne paie pas deux fois.
- Sans action pendant 2 min, ou après un redémarrage du bot, la partie est réglée comme si le joueur restait.
- Mises bornées par `/admin blackjack min max` (10 à 2 000 par défaut).

## Câlin collectif

- Voltron apparaît à des moments aléatoires dans l'un des salons configurés, avec un bouton **CÂLIN** ouvert pendant 60 s (réglable).
- À la clôture, chaque participant reçoit `récompense × nombre de participants` (200 par défaut : à 5, 1 000 chacun). Un clic par membre.
- Intervalle aléatoire entre deux apparitions : 1 h à 6 h par défaut. La prochaine date est persistée ; un câlin en cours survit à un redémarrage.
- `/admin calin ajouter-salon #salon` active la fonction ; `retirer-salon`, `regler`, `lancer` (manuel), `etat`.

## Commandes

Membres :
- `/profil` : espace personnel (privé) : bourse, ancienneté, boutons Récompense du jour, Hebdo, Historique, Boutique et Inventaire. Le panneau se ferme après 2 min sans clic ; rouvrir `/profil` ferme le panneau précédent.
- `/calin membre montant [message]` : offre des cœurs à un membre (annonce publique).
- `/hebdo` : récompense de la semaine (réponse privée).
- `/classement` : classement d'XP paginé (privé, se ferme après 2 min sans clic).
- `/compliment membre` · `/insulte membre` : textes aléatoires par rareté (public).
- `/blackjack mise` : blackjack contre la banque (privé).

Intendance (`DISCORD_ADMIN_IDS` dans `.env` si renseigné, sinon permission Discord *Administrateur* ; vérifié côté serveur à chaque appel) :
- `/admin crediter membre montant [raison]` · `/admin debiter membre montant [raison]`
- `/admin solde membre` · `/admin stats`
- `/admin boutique ajouter|modifier|retirer|remettre|lister` (autocomplétion des noms d'articles)
- `/admin calin ajouter-salon|retirer-salon|regler|lancer|etat`
- `/admin monnaie singulier pluriel [symbole]` · `/admin bienvenue montant` · `/admin quotidien montant` · `/admin hebdo montant`
