#!/bin/sh
# Guarded production migration runner. Runs ONLY the committed pending SQL via Prisma.
# Steps: verified pre-migration backup -> migrate status -> migrate deploy -> integrity evidence.
set -eu

DATA_DIR="${ROCKFOUNDRY_DATA_DIR:-/opt/rockfoundry/data}"
BACKUP_ROOT="${ROCKFOUNDRY_BACKUP_DIR:-/opt/rockfoundry/backups}"
DB_FILE="${DATA_DIR}/rockfoundry.db"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_NAME="${ROCKFOUNDRY_MIGRATION_BACKUP_NAME:-migrate-${STAMP}-$$}"
case "$BACKUP_NAME" in /*|*..*) echo 'REFUSED: invalid backup name' >&2; exit 1;; esac
BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_NAME}"
umask 077

# A tag is mutable. Caller must resolve the approved candidate and provide its image ID.
case "${ROCKFOUNDRY_EXPECTED_IMAGE_ID:-}" in
  sha256:*) ;;
  *) echo "REFUSED: ROCKFOUNDRY_EXPECTED_IMAGE_ID must be an immutable sha256 image ID" >&2; exit 1 ;;
esac
[ "${#ROCKFOUNDRY_EXPECTED_IMAGE_ID}" -eq 71 ] || { echo "REFUSED: malformed immutable image ID" >&2; exit 1; }
case "${ROCKFOUNDRY_EXPECTED_IMAGE_ID#sha256:}" in
  *[!0-9a-f]*|'') echo "REFUSED: malformed immutable image ID" >&2; exit 1 ;;
esac

# No data/backup in-container fallback: both paths must be mounted and writable.
for path in "$DATA_DIR" "$BACKUP_ROOT"; do
  [ -d "$path" ] && [ -w "$path" ] || { echo "REFUSED: required writable mount missing: $path" >&2; exit 1; }
  awk -v p="$path" '$5 == p { found=1 } END { exit !found }' /proc/self/mountinfo || {
    echo "REFUSED: required bind mount missing: $path" >&2; exit 1;
  }
done
[ -f "$DB_FILE" ] || { echo "REFUSED: database not found at $DB_FILE" >&2; exit 1; }

mkdir -m 700 "$BACKUP_DIR"
BACKUP_DB="${BACKUP_DIR}/rockfoundry.db"
# SQLite backup API snapshots committed WAL content consistently; raw copy is unsafe.
python3 - "$DB_FILE" "$BACKUP_DB" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
try:
    src.backup(dst)
    if dst.execute("PRAGMA integrity_check").fetchall() != [("ok",)] or dst.execute("PRAGMA foreign_key_check").fetchall():
        raise SystemExit("backup integrity or foreign-key validation failed")
finally:
    dst.close(); src.close()
PY
[ -s "$BACKUP_DB" ] || { echo "REFUSED: backup missing or empty" >&2; exit 1; }
sha256sum "$BACKUP_DB" > "${BACKUP_DB}.sha256"
# Test restorable backup via SQLite backup API and verify the restored image.
python3 - "$BACKUP_DB" "${BACKUP_DIR}/restore-check.db" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
try:
    src.backup(dst)
    if dst.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise SystemExit("restored backup integrity_check failed")
finally:
    dst.close(); src.close()
PY
rm "${BACKUP_DIR}/restore-check.db"
echo "backup=${BACKUP_DB}"

cd /app
python3 deployment/migration-preflight.py --database "$BACKUP_DB" --migrations packages/db/prisma/migrations
# migrate status exits nonzero for expected pending migrations; deploy is authoritative.
pnpm --filter @rockfoundry/db exec prisma migrate deploy
pnpm --filter @rockfoundry/db exec prisma migrate status

# Compare every pre-existing table's columns and full row values against the snapshot.
python3 - "$BACKUP_DB" "$DB_FILE" <<'PY'
import sqlite3, sys
old = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
new = sqlite3.connect(f"file:{sys.argv[2]}?mode=ro", uri=True)
def tables(db): return [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'")]
def quote(s): return '"' + s.replace('"', '""') + '"'
try:
    legacy = tables(old)
    for table in legacy:
        old_cols = [r[1] for r in old.execute(f"PRAGMA table_info({quote(table)})")]
        new_cols = [r[1] for r in new.execute(f"PRAGMA table_info({quote(table)})")]
        if not set(old_cols).issubset(new_cols): raise SystemExit(f"legacy column removed: {table}")
        cols = ','.join(map(quote, old_cols))
        query = f"SELECT {cols} FROM {quote(table)} ORDER BY {cols}" if cols else f"SELECT * FROM {quote(table)}"
        if old.execute(query).fetchall() != new.execute(query).fetchall(): raise SystemExit(f"legacy rows changed: {table}")
    integrity = new.execute("PRAGMA integrity_check").fetchall()
    fk = new.execute("PRAGMA foreign_key_check").fetchall()
    if integrity != [("ok",)] or fk: raise SystemExit(f"post-migration checks failed: integrity={integrity!r}, fk={len(fk)}")
    print(f"legacy_tables_preserved={len(legacy)} integrity=ok foreign_key_violations=0")
finally:
    old.close(); new.close()
PY
echo "migrate-entrypoint=ok"
