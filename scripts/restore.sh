#!/usr/bin/env bash
# Restaure un dump dans la base Voltron (ÉCRASE les données actuelles).
# Usage : scripts/restore.sh backups/voltron-AAAAMMJJ-HHMMSS.sql.gz
# Arrêter le bot avant : docker compose stop bot ; le relancer après : docker compose start bot
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f "${1:-}" ] || { echo "Usage : $0 <fichier .sql.gz>"; exit 1; }
gunzip -c "$1" | docker compose exec -T postgres psql -U voltron -d voltron -q
echo "Restauration terminée depuis $1"
