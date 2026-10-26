#!/usr/bin/env bash
# Déploiement rapide de Voltron.
#   ./scripts/deploy.sh                 reconstruit le conteneur et enregistre les commandes
#   ./scripts/deploy.sh 123 456         idem, après avoir autorisé les serveurs 123 et 456 (ajoutés à DISCORD_GUILD_IDS)
#   ./scripts/deploy.sh --no-build      enregistre seulement les commandes (pas de rebuild)
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Fichier .env introuvable (copier .env.example)." >&2; exit 1; }

build=1
ids=()
for arg in "$@"; do
  case "$arg" in
    --no-build) build=0 ;;
    *[!0-9]*) echo "Argument inattendu : $arg (identifiant de serveur numérique ou --no-build)" >&2; exit 1 ;;
    *) ids+=("$arg") ;;
  esac
done

# 1. Serveurs autorisés
if [ ${#ids[@]} -gt 0 ]; then
  current=$(grep -E '^DISCORD_GUILD_IDS=' .env | cut -d= -f2- | tr -d '"' || true)
  for id in "${ids[@]}"; do
    if [[ ",$current," == *",$id,"* ]]; then
      echo "Serveur $id déjà autorisé."
    else
      current="${current:+$current,}$id"
      echo "Serveur $id ajouté."
    fi
  done
  if grep -qE '^DISCORD_GUILD_IDS=' .env; then
    sed -i "s|^DISCORD_GUILD_IDS=.*|DISCORD_GUILD_IDS=$current|" .env
  else
    echo "DISCORD_GUILD_IDS=$current" >> .env
  fi
fi
echo "Serveurs autorisés : $(grep -E '^DISCORD_GUILD_IDS=' .env | cut -d= -f2-)"

# 2. Conteneur
if [ "$build" = 1 ]; then
  echo "— Reconstruction du conteneur…"
  docker compose up -d --build bot
else
  echo "— Redémarrage du conteneur (config rechargée)…"
  docker compose up -d bot
fi

# 3. Commandes slash sur chaque serveur autorisé
echo "— Enregistrement des commandes…"
npm run --silent deploy

# 4. Vérification
sleep 8
echo "— Journaux de démarrage :"
docker compose logs --tail 8 bot | sed 's/^bot-1  | //'
if docker compose logs --tail 50 bot | grep -q "Connecté en tant que"; then
  echo "✅ Voltron est en ligne."
else
  echo "⚠️ Connexion non confirmée : vérifie les journaux (docker compose logs bot)." >&2
  exit 1
fi
