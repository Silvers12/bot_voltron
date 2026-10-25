# Voltron — bot Discord

## Structure

```
src/
  index.js            # point d'entrée : crée le client, charge commandes et événements
  config.js           # lecture et validation du .env
  loaders.js          # chargement automatique de src/commands et src/events
  deploy-commands.js  # enregistre les slash commands auprès de Discord
  commands/           # une slash command par fichier ({ data, execute })
  events/             # un événement Discord par fichier ({ name, once?, execute })
```

## Mise en place

1. Créer l'application sur https://discord.com/developers/applications, onglet **Bot** → *Reset Token*.
2. Inviter le bot : onglet **OAuth2 → URL Generator**, scopes `bot` + `applications.commands`,
   permission *Send Messages*, puis ouvrir l'URL générée.
3. `cp .env.example .env` et remplir `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`.
4. `npm install`
5. `npm run deploy` — enregistre les commandes (instantané sur un serveur de test).
6. `npm start` (ou `npm run dev` pour relancer à chaque modification).
7. Dans Discord : `/ping` → le bot répond *Pong !* avec la latence.

## Ajouter une commande

Créer `src/commands/<nom>.js` sur le modèle de `ping.js`, puis relancer `npm run deploy`.
