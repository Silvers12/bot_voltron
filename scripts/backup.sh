#!/usr/bin/env bash
# Sauvegarde PostgreSQL de Voltron : un dump compressé par jour, 14 jours conservés.
# Usage : scripts/backup.sh            (depuis n'importe où)
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/voltron-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T postgres pg_dump -U voltron --clean --if-exists voltron | gzip > "$file"
find "$BACKUP_DIR" -name 'voltron-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
echo "Sauvegarde : $file ($(du -h "$file" | cut -f1))"
