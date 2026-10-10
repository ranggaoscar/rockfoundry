#!/bin/sh
# Guarded production migration runner. Runs ONLY the committed pending SQL via Prisma.
# Steps: verified pre-migration backup -> migrate status -> migrate deploy -> integrity evidence.
set -eu

DATA_DIR="${ROCKFOUNDRY_DATA_DIR:-/opt/rockfoundry/data}"
DB_FILE="${DATA_DIR}/rockfoundry.db"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_DIR="${DATA_DIR}/../backups/migrate-${STAMP}"

echo "rockfoundry migrate-entrypoint db=${DB_FILE} stamp=${STAMP}"

if [ ! -f "$DB_FILE" ]; then
  echo "REFUSED: database not found at ${DB_FILE}" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_FILE" ".backup '${BACKUP_DIR}/rockfoundry.db'"
else
  cp -a "$DB_FILE" "${BACKUP_DIR}/rockfoundry.db"
fi
echo "backup=${BACKUP_DIR}/rockfoundry.db"
sha256sum "${BACKUP_DIR}/rockfoundry.db"

cd /app
echo "--- pre-migration readiness rehearsal (read-only source, in-memory clone) ---"
python3 deployment/migration-preflight.py --database "$DB_FILE" --migrations packages/db/prisma/migrations

echo "--- prisma migrate status ---"
pnpm --filter @rockfoundry/db exec prisma migrate status || true

echo "--- prisma migrate deploy ---"
pnpm --filter @rockfoundry/db exec prisma migrate deploy

echo "--- post-migration integrity ---"
python3 - "$DB_FILE" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
projects = db.execute('SELECT COUNT(*) FROM "Project"').fetchone()[0]
integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
fk = len(db.execute("PRAGMA foreign_key_check").fetchall())
print(f"projects={projects} integrity={integrity} foreign_key_violations={fk}")
if integrity != "ok" or fk:
    raise SystemExit("post-migration integrity check failed")
PY
echo "migrate-entrypoint=ok"
