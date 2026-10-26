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
  modules/progression/     # XP messages/vocal, classement, niveaux et paliers
  modules/banter/          # compliments et insultes (textes dans content/)
  modules/casino/          # blackjack, machine à sous
  modules/duel/            # duels entre membres (textes dans content/)
  modules/lottery/         # tombola hebdomadaire
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

Le bot et PostgreSQL tournent en conteneurs (`compose.yaml`), redémarrage automatique (`restart: unless-stopped`). Les migrations s'appliquent au démarrage du conteneur `bot`.

```bash
docker compose up -d --build    # construire et (re)lancer après une modification du code
docker compose logs -f bot      # suivre les logs
docker compose restart bot      # relancer (ex. après modification de .env ou de content/)
docker compose ps               # état des conteneurs
```

**Ne jamais lancer `npm run dev` pendant que le conteneur tourne** : deux instances traiteraient chaque événement deux fois (XP, câlins…). Arrêter d'abord avec `docker compose stop bot`.

Après avoir ajouté une commande ou une option : `npm run deploy` (depuis l'hôte, avec `npm install` fait).

### Installation en une commande

`/admin installer [categorie]` sur un serveur fraîchement invité (le bot doit avoir « Gérer les salons » et « Gérer les rôles ») : crée la catégorie « 🦦 Voltron » et cinq salons (accueil en lecture seule, commandes, jeux, comptage, annonces en lecture seule) avec les permissions du bot, règle les salons des commandes (commandes + jeux), des câlins collectifs et de la tombola (jeux), du comptage, des annonces de niveaux et de succès, crée les rôles de notification, publie la page d'accueil et la première tombola, programme le premier câlin collectif. Relançable : conserve les salons et réglages existants. Reste ensuite : `/admin succes recalculer`, montants et horaires via `/admin panneau`, boutique, rôles de palier.

### Déploiement rapide

`./scripts/deploy.sh [id_serveur…] [--no-build]` (ou `npm run redeploy`) : ajoute les serveurs donnés à `DISCORD_GUILD_IDS` s'ils n'y sont pas, reconstruit et relance le conteneur, enregistre les commandes sur tous les serveurs autorisés, affiche les journaux et confirme la connexion. `--no-build` relance sans reconstruire (changement de `.env` seul).

## Sauvegardes

- `scripts/backup.sh` : dump compressé dans `backups/`, 14 jours conservés. À planifier chaque jour dans le cron de l'hôte (`crontab -e`) :
  `0 4 * * * /opt/Voltron/scripts/backup.sh >> /opt/Voltron/backups/backup.log 2>&1`
- `scripts/restore.sh backups/<fichier>.sql.gz` : restaure (écrase la base). Arrêter le bot avant, le relancer après.
- Restauration testée dans une base temporaire le 26 octobre 2026. Les sauvegardes restent sur la même machine : copier `backups/` ailleurs (autre disque, cloud) pour se protéger d'une panne de l'hôte.

### Ajouter le serveur de production

1. Inviter le bot (lien ci-dessus) et lui donner « Gérer les rôles » si boutique-rôles ou paliers sont utilisés ; placer le rôle Voltron au-dessus des rôles à attribuer.
2. Ajouter l'identifiant du serveur à `DISCORD_GUILD_IDS` dans `.env`.
3. `docker compose restart bot` puis `npm run deploy`.
4. Sur le serveur : Intégrations → Voltron → `/admin` réservé aux intendants.
5. Configurer : `/admin calin ajouter-salon`, `/admin niveaux salon`, `/admin boutique ajouter`, etc. Chaque serveur a ses propres réglages.

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

## Niveaux et rôles de palier

- Niveau dérivé de l'XP : XP pour passer du niveau L au suivant = `base + pas × L` (20 et 10 par défaut : niv. 1 à 20 XP, niv. 5 à 200, niv. 10 à 650, niv. 20 à 2 300). Courbe réglable.
- Paliers : un rôle Discord par niveau choisi ; seul le palier le plus élevé atteint est porté. Le bot doit avoir « Gérer les rôles » et être placé au-dessus des rôles de palier.
- Montée de niveau annoncée dans un salon configurable. Le profil affiche niveau et barre de progression ; le classement affiche le niveau.
- `/admin niveaux ajouter-role niveau role`, `retirer-role`, `salon`, `courbe base pas`, `recalculer`, `lister`.

## Machine à sous

- `/machine` : installe la machine **publiquement** dans le salon (cagnotte, prix, bouton Lancer). N'importe qui appuie et joue avec sa propre bourse ; tout le monde voit les rouleaux (🦦 ❤️ 🛡️ 🐟 🌊 🪨) tourner et la cagnotte évoluer. Un seul tour à la fois par machine. Le solde du joueur lui est envoyé en privé. Prix fixe (50 par défaut) car la chance de rafler la cagnotte ne dépend pas de la mise.
- **Modèle fermé** : chaque mise entre intégralement dans la cagnotte du serveur, chaque gain en sort. Trois loutres raflent toute la cagnotte (annonce publique), qui repart du montant de départ (1 000, amorcé par la banque). La banque ne crée ni ne détruit de cœurs en dehors de l'amorce.
- Seuls les triples gagnent : trois loutres = toute la cagnotte (≈ 1 tour sur 8 000), trois autres symboles identiques = 50 % de la cagnotte (≈ 1 tour sur 23, réglable). Tout le reste reste dans la cagnotte.
- `/admin machine [prix] [cagnotte_depart] [part_triple]` (sans option : affiche l'état et le dernier jackpot).

## Duel

- `/duel membre mise` : défi public avec boutons Accepter / Refuser (défié) et Annuler (défieur). Mise du défieur bloquée à la création, celle du défié à l'acceptation ; le vainqueur empoche les deux. Pas de prélèvement.
- Résolution par jets de d20 commentés (textes dans `content/duels.json`), relance en cas d'égalité. Un défi sans réponse expire après 2 min et rembourse ; les défis en attente survivent à un redémarrage.
- Un seul défi en attente par défieur. Mises bornées par `/admin duel min max` (10 à 5 000 par défaut).

## Salon de comptage

- Nécessite l'intent privilégié **Message Content** (portail Discord → Bot → Privileged Gateway Intents). Le contenu n'est lu que dans le salon de comptage.
- `/admin comptage salon salon:#compter` active ; `amende`, `reinitialiser`, `etat`. Aussi dans le panneau (module Salon de comptage).
- Règle : chacun poste le nombre suivant (1, 2, 3…) ou une expression simple qui y mène (`2+2`, `6-1`, `(1+2)*3`, `2^3`). Bonne réponse : ✅. Le salon ne sert qu'à compter : tout autre message est une erreur.
- Erreur (mauvais nombre, texte, résultat non entier, ou deux fois de suite par le même membre) : ❌, amende de 1 000 cœurs (plafonnée à la bourse), puis pile ou face annoncé par Voltron : on continue au dernier nombre valide, ou on repart à 1.
- Voltron peut compter lui-même via `/admin message` (sans amende s'il se trompe). Les autres bots sont ignorés.
- Deux réponses simultanées : la première est acceptée, la seconde est évaluée contre le nouveau nombre.
- Record et nombre d'erreurs conservés (`/admin comptage etat`).

## Taux du jour

- `/taux type:… [membre]` : chance, choupitude, suspicion, criminalité, loutritude, flemme, sagesse, chaos. Le taux est aléatoire mais fixe pour un membre, un taux et un jour civil (hachage, aucun stockage) ; il change à minuit dans le fuseau du serveur.
- Réponse publique avec une bannière 1200 × 400 générée par `sharp` : avatar à gauche, nom, taux, barre et commentaire au centre, icône du taux à droite grisée et remplie par le bas selon le pourcentage.
- `/duo type:… membre:@… [avec:@…]` : taux entre deux membres (amour, amitié, complicité, rivalité, esprit d'équipe, chaos à deux), symétrique, fixe sur la journée. Bannière avec un avatar de chaque côté et l'icône remplie au centre. Clés d'icônes : amour, amitie, complicite, rivalite, equipe, chaos_duo.
- Icônes : PNG à fond transparent dans `content/taux/<clé>.png` (voir `content/taux/README.md`) ; sans fichier, icône vectorielle de secours. Textes et couleurs dans `src/modules/rates/rates.catalog.ts`. Le conteneur installe `ttf-dejavu` et `font-noto-emoji` (emojis des pseudos, rendus en monochrome) pour le texte des images.

## Statistiques

- `/stats [membre]` : activité (messages, vocal, niveau, meilleure série), câlins donnés et reçus, blackjack, machine à sous, duels, tombola, câlins collectifs, comptage, chacun avec son bilan net en cœurs. Seules les fonctionnalités actives apparaissent. Public.
- Même écran depuis le profil, via le menu « Explorer… » qui remplace les boutons Boutique/Inventaire/Succès : Historique, Boutique, Inventaire, Succès, Statistiques.

## Catalogue de boutique de départ

- `content/boutique.json` : 28 articles au ton absurde (chaussette sale à 5 cœurs jusqu'à la couronne de la rivière à 100 000), objets de collection et titres, stocks limités pour les plus chers. Modifiable à la main.
- Boutique paginée par 10 articles (boutons Précédent/Suivant) ; après un achat, on revient sur la page de l'article.
- `/admin boutique importer` charge le fichier sur le serveur : les articles déjà présents (même nom) ne sont pas touchés, donc relançable après avoir ajouté des lignes.

## Titres

- Un article de boutique de type **titre** (`/admin boutique ajouter nom:… prix:… titre:true`, limite 1 par membre par défaut) : son nom devient un titre de profil. L'emoji de l'article est affiché devant.
- Le premier titre acheté est porté automatiquement. Dans l'inventaire, un menu « Choisir le titre porté » permet de changer ou de n'en porter aucun.
- Le titre porté s'affiche en tête du profil et dans `/succes`. Un titre retiré de la vente reste possédé et portable.

## Succès et badges

- Catalogue de 30 succès en code (`src/modules/achievements/achievements.catalog.ts`), en quatre catégories : Compagnie (messages, vocal, niveaux), Économie (séries, câlins, bourse, achats), Jeux (blackjack, machine, duels, câlin collectif, tombola), Collection (méta : 10 succès, tous les succès). Trois paliers avec récompense : bronze 100, argent 300, or 1 000 cœurs (transaction `ACHIEVEMENT`).
- Déblocage automatique après chaque action notable (récompense du jour, câlin, fin de partie, tour de machine, duel, clôture d'un câlin collectif, tirage, achat, montée de niveau, paliers de messages et d'heures de vocal). Les conditions sont recalculées à partir de la base, donc rétroactives : `/admin succes recalculer` attribue d'un coup ce qui est déjà mérité, sans annonce.
- Annonce dans un salon configurable (panneau, module Succès, formulaire Annonces) ; sans salon, déblocage silencieux.
- Profil : ligne « Badges » avec les emojis et bouton **Succès** (débloqués avec date, verrouillés avec l'indice et la récompense). `/succes [membre]` affiche publiquement les badges d'un membre (les indices ne sont montrés que pour soi).
- `/admin succes liste` : catalogue avec le nombre de membres par succès. Interrupteur « Succès et badges » dans le panneau.

## Page d'accueil et rôles de notification

- `/admin accueil installer salon:#accueil` : crée les rôles « Câlins collectifs », « Tombola » et « Duels » s'ils manquent (mentionnables, sans permission), publie la page d'accueil (présentation de Voltron + trois boutons) et l'épingle. Le rôle de Voltron doit être au-dessus de ces rôles.
- Page en « composants V2 » (conteneur coloré, titres, séparateurs, galerie pour la bannière, menu déroulant). Intro (texte personnalisable avec `/admin accueil texte`, bannière avec `/admin accueil banniere image:` — PNG/JPG/GIF/WebP 8 Mo, stockée en base), « Ce qui t'attend » (seules les fonctionnalités actives apparaissent), « Être prévenu » avec un menu déroulant à choix multiples.
- Le menu applique exactement la sélection : rôles cochés ajoutés, décochés retirés (confirmation privée). `/admin accueil roles` pour utiliser des rôles existants, `publier` pour mettre à jour la page, `etat`. Toute modification republie la page automatiquement.
- Pings : le rôle est mentionné à l'apparition d'un câlin collectif, à chaque publication ou rappel de tombola, et quand un duel est lancé (le défié est toujours mentionné).

## Salons des commandes

- Par défaut, les commandes fonctionnent partout. `/admin commandes ajouter-salon salon:#voltron` limite les commandes des membres à ce salon (plusieurs possibles) ; `retirer-salon`, `partout`, `liste`. Aussi dans le panneau (module Salons des commandes).
- Hors de ces salons, Voltron répond en privé « Les commandes s'utilisent dans #… » et ne poste rien. `/admin` n'est jamais limité. Les boutons des messages déjà postés (câlin collectif, tombola, machine) restent utilisables là où ils sont.

## Panneau d'intendance et interrupteurs

- `/admin panneau` : écran de contrôle privé (se ferme après 5 min d'inactivité). Accueil : membres, bourses, monnaie en circulation, cagnotte de la machine, tombola en cours, prochain câlin collectif, parties et duels en attente, état de chaque fonctionnalité.
  - Menu « Cocher les fonctionnalités actives » : coche/décoche pour activer ou mettre en pause (quotidien, hebdo, câlins, boutique, XP et classement, compliments, insultes, blackjack, machine, duels, câlin collectif, tombola).
  - Menu « Voir les réglages d'un module » : valeurs actuelles, boutons Activer/Désactiver du module, et boutons « Modifier : … » qui ouvrent un formulaire pré-rempli (monnaie, montants, XP, niveaux, blackjack, machine, duels, câlin collectif, tombola tirage/rappels). Les salons se saisissent par `#mention` ou nom, les jours par leur nom. Une saisie invalide n'enregistre rien et liste les erreurs. Changer la courbe des niveaux recalcule les niveaux ; activer la tombola la publie ; changer l'intervalle des câlins reprogramme la prochaine apparition. Les rôles de palier se règlent aussi par formulaire (module XP et niveaux, bouton Paliers : une ligne par palier, `5 @Recrue`), avec resynchronisation immédiate. Les articles de boutique restent gérés par commandes. Définitions : `src/modules/admin/panel.forms.ts`.
- `/admin fonction nom:… active:true|false` : même bascule en une commande.
- Une fonctionnalité en pause : ses commandes et boutons répondent « en pause », ses boutons disparaissent du profil, ses automatismes s'arrêtent (XP non comptée, pas d'apparition de câlin collectif, ni rappel ni tirage de tombola). Les réglages sont conservés. Les câlins collectifs déjà lancés restent cliquables jusqu'à leur fin. Les sessions vocales reprennent à la réactivation de l'XP.
- Registre des clés : `src/modules/features/features.ts` (`disabledFeatures` dans `GuildSettings`).

## Tombola

- `/tombola` : message public avec cagnotte, prix du ticket, tickets vendus, date du tirage, boutons « 1 ticket » / « 5 tickets ». Chacun paie avec sa bourse, confirmation privée. Maximum de tickets par membre réglable (10 par défaut).
- Tirage automatique chaque semaine (dimanche 20 h par défaut, fuseau du serveur), pondéré par le nombre de tickets, annoncé dans le salon configuré. Le gagnant rafle toute la cagnotte ; sans ticket, elle est reportée. Modèle fermé, amorce optionnelle de la banque.
- Publication automatique : à l'activation et après chaque tirage, Voltron poste la tombola (boutons inclus) dans le salon configuré et l'épingle (permission « Gérer les messages » nécessaire ; sinon simple message). L'ancien message est désépinglé et perd ses boutons.
- Rappels : mercredi 18 h (`rappel_jour`, `rappel_heure`, 0 = aucun) et dernier rappel 2 h avant le tirage (`dernier_rappel` en heures, 0 = aucun). Chaque rappel republie la cagnotte à jour avec les boutons et devient le message épinglé. Un achat depuis n'importe quel message met aussi à jour le message épinglé.
- `/admin tombola salon #x` active ; `regler prix max_tickets jour heure amorce rappel_jour rappel_heure dernier_rappel`, `publier` (republie et épingle), `tirer`, `etat`.

## Commandes

Membres :
- Écrans en « composants V2 » (conteneur coloré, titres, séparateurs, avatar en vignette) : profil, historique, succès, boutique, fiche article, inventaire, tombola, tirage, câlin collectif, duel, machine à sous, page d'accueil. Assistants dans `src/discord/v2.ts`. Les messages publiés avant cette version restent en ancien format : `/admin tombola publier` et `/admin accueil publier` les remplacent.
- `/profil` : espace personnel (privé) : bourse, ancienneté, boutons Récompense du jour, Hebdo, Historique, Boutique et Inventaire. Le panneau se ferme après 2 min sans clic ; rouvrir `/profil` ferme le panneau précédent.
- `/calin membre montant [message]` : offre des cœurs à un membre (annonce publique).
- `/hebdo` : récompense de la semaine (réponse privée).
- `/classement` : classement d'XP paginé (privé, se ferme après 2 min sans clic).
- `/compliment membre` · `/insulte membre` : textes aléatoires par rareté (public).
- `/blackjack mise` : blackjack contre la banque (privé).
- `/machine` : machine à sous publique à cagnotte progressive, prix fixe.
- `/duel membre mise` : duel entre membres (public).
- `/tombola` : tombola hebdomadaire (public).
- `/succes [membre]` : badges d'un membre (public).
- `/stats [membre]` : statistiques de jeu (public).
- `/taux type [membre]` : taux du jour avec bannière (public).
- `/duo type membre [avec]` : taux entre deux membres (public).

Intendance (`DISCORD_ADMIN_IDS` dans `.env` si renseigné, sinon permission Discord *Administrateur* ; vérifié côté serveur à chaque appel) :
- `/admin crediter membre montant [raison]` · `/admin debiter membre montant [raison]`
- `/admin solde membre` · `/admin stats`
- `/admin boutique ajouter|modifier|retirer|remettre|lister` (autocomplétion des noms d'articles)
- `/admin calin ajouter-salon|retirer-salon|regler|lancer|etat`
- `/admin niveaux ajouter-role|retirer-role|salon|courbe|recalculer|lister`
- `/admin tombola salon|regler|publier|tirer|etat`
- `/admin succes recalculer|liste`
- `/admin comptage salon|amende|reinitialiser|etat`
- `/admin installer [categorie]`
- `/admin panneau`, `/admin fonction`
- `/admin accueil installer|roles|banniere|texte|publier|etat`
- `/admin commandes ajouter-salon|retirer-salon|partout|liste`
- `/admin messages supprimer id:… [salon]` : supprime un message · `depuis id:… [salon]` : supprime ce message et tous ceux postés après · `vider [salon]` : supprime tout le salon. Les deux derniers demandent une confirmation (bouton, 1 min). Les messages de moins de 14 jours partent par lots, les plus anciens un par un (plus lent). Le bot doit avoir « Gérer les messages » et « Lire l’historique » dans le salon.
- `/admin message texte:… [salon] [repondre_a]` : écrit en tant que Voltron (`\n` pour un retour à la ligne, mentions de membres et de rôles autorisées, pas de @everyone)
- `/admin monnaie singulier pluriel [symbole]` · `/admin bienvenue montant` · `/admin quotidien montant` · `/admin hebdo montant` · `/admin duel min max`
