#!/bin/sh
# OPERATOR CANDIDATE ONLY — review/adapt; do not install or run without the root approval gate.
# Replaces no existing wrapper. Keeps build, migration, then web recreation on one image ID.
set -eu

OPS=/opt/rockfoundry/ops
REPO=/opt/rockfoundry/repo
COMPOSE="$OPS/compose.yaml"
MARKER="$OPS/.approved-deploy-sha"
DATA=/opt/rockfoundry/data
BACKUPS=/opt/rockfoundry/backups
RUNTIME=/opt/rockfoundry/config/runtime.env

[ "$(id -u)" -eq 0 ] || { echo 'REFUSED: run only through the root-owned release gate' >&2; exit 1; }
[ -f "$MARKER" ] || { echo 'REFUSED: approval marker absent' >&2; exit 1; }
MODE=$(stat -c '%U:%a' "$MARKER")
[ "$MODE" = root:600 ] || [ "$MODE" = root:400 ] || {
  echo 'REFUSED: approval marker must be root-owned mode 600 or 400' >&2; exit 1;
}
SHA="${1:-}"
[ "$#" -eq 1 ] && [ "$SHA" = "$(cat "$MARKER")" ] || { echo 'REFUSED: exact approved SHA argument required' >&2; exit 1; }
case "$SHA" in *[!0-9a-f]*|'') echo 'REFUSED: malformed approval SHA' >&2; exit 1;; esac
[ "${#SHA}" -eq 40 ] || { echo 'REFUSED: approval SHA must be 40 lowercase hex characters' >&2; exit 1; }
[ -d "$DATA" ] && [ -d "$BACKUPS" ] && [ -f "$DATA/rockfoundry.db" ] && [ -f "$RUNTIME" ] || {
  echo 'REFUSED: required data, backup, or runtime mount/file missing' >&2; exit 1;
}
[ "$(stat -c '%U:%a' "$RUNTIME")" = root:600 ] || { echo 'REFUSED: runtime env must be root:600' >&2; exit 1; }
docker compose --project-directory "$OPS" -f "$COMPOSE" config --quiet
cd "$REPO"
repo_git() { sudo -u ubuntu git -C "$REPO" "$@"; }
[ -z "$(repo_git status --porcelain --untracked-files=no)" ] || { echo 'REFUSED: tracked tree dirty' >&2; exit 1; }
repo_git fetch origin main --quiet
[ "$(repo_git rev-parse origin/main)" = "$SHA" ] || { echo 'REFUSED: origin/main not approved SHA' >&2; exit 1; }
repo_git merge-base --is-ancestor HEAD "$SHA" || { echo 'REFUSED: not a fast-forward' >&2; exit 1; }
repo_git pull --ff-only origin main --quiet
[ "$(repo_git rev-parse HEAD)" = "$SHA" ] || exit 1

TAG="$SHA"
NEW_IMAGE="rockfoundry-web:$TAG"
# The fixed wrapper parser requires exactly one literal image declaration.
COUNT=$(grep -Ec '^[[:space:]]*image:[[:space:]]*rockfoundry-web:[^[:space:]]+[[:space:]]*$' "$COMPOSE" || true)
[ "$COUNT" = 1 ] || { echo 'REFUSED: compose must contain exactly one literal rockfoundry-web image line' >&2; exit 1; }
# Build candidate, resolve immutable local image ID, and use that exact ID for migration.
docker build --label "org.opencontainers.image.revision=$SHA" -f deployment/Dockerfile.work-os -t "$NEW_IMAGE" .
IMAGE_ID=$(docker image inspect --format '{{.Id}}' "$NEW_IMAGE")
[ "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$IMAGE_ID")" = "$SHA" ] || exit 1
case "$IMAGE_ID" in sha256:????????????????????????????????????????????????????????????????) ;; *) echo 'REFUSED: image ID is not sha256-pinned' >&2; exit 1;; esac
# Preserve both the old Compose and persistent DB backup for fail-closed rollback.
STAMP="$(date -u +%Y%m%d-%H%M%S)-$$"
RELEASE_BACKUP="$BACKUPS/release-$STAMP"
umask 077
mkdir -m 700 "$RELEASE_BACKUP"
cp -a "$COMPOSE" "$RELEASE_BACKUP/compose.yaml"
TMP=$(mktemp "$OPS/compose.yaml.XXXXXX")
WRITER_STOPPED=0
rollback() {
  docker compose --project-directory "$OPS" -f "$COMPOSE" stop web || return 1
  if [ -f "$RELEASE_BACKUP/database/rockfoundry.db" ]; then
    sha256sum -c "$RELEASE_BACKUP/database/rockfoundry.db.sha256" || return 1
    sqlite3 "$DATA/rockfoundry.db" ".restore '$RELEASE_BACKUP/database/rockfoundry.db'" || return 1
    [ "$(sqlite3 "$DATA/rockfoundry.db" 'PRAGMA integrity_check;')" = ok ] || return 1
  fi
  cp -a "$RELEASE_BACKUP/compose.yaml" "$COMPOSE"
  docker compose --project-directory "$OPS" -f "$COMPOSE" up -d --no-deps web
}
finish() {
  code=$?
  trap - EXIT HUP INT TERM
  rm -f "$TMP"
  if [ "$code" -ne 0 ] && [ "$WRITER_STOPPED" = 1 ]; then
    rollback || echo "MANUAL RECOVERY REQUIRED: $RELEASE_BACKUP" >&2
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 130' HUP INT TERM
sed -E "s@^([[:space:]]*image:[[:space:]]*)rockfoundry-web:[^[:space:]]+([[:space:]]*)$@\\1$NEW_IMAGE\\2@" "$COMPOSE" > "$TMP"

# Quiesce the sole application writer after all approval/source/build gates.
WRITER_STOPPED=1
docker compose --project-directory "$OPS" -f "$COMPOSE" stop web
# Explicit migration uses the exact just-built immutable image and persistent host mounts.
docker run --rm --network none --env-file "$RUNTIME" \
  -e ROCKFOUNDRY_EXPECTED_IMAGE_ID="$IMAGE_ID" \
  -e ROCKFOUNDRY_DATA_DIR=/opt/rockfoundry/data \
  -e ROCKFOUNDRY_BACKUP_DIR=/opt/rockfoundry/backups \
  -e ROCKFOUNDRY_DATABASE_URL=file:/opt/rockfoundry/data/rockfoundry.db \
  -e ROCKFOUNDRY_MIGRATION_BACKUP_NAME="release-$STAMP/database" \
  -v "$DATA:/opt/rockfoundry/data" -v "$BACKUPS:/opt/rockfoundry/backups" \
  --entrypoint /bin/sh "$IMAGE_ID" /app/deployment/migrate-entrypoint.sh

# Install the pinned compose only after migration passed; atomic rename prevents partial YAML.
chmod --reference="$COMPOSE" "$TMP"
chown --reference="$COMPOSE" "$TMP"
mv -f "$TMP" "$COMPOSE"
# Ensure the mutable tag still resolves to the immutable ID used for migration.
[ "$(docker image inspect --format '{{.Id}}' "$NEW_IMAGE")" = "$IMAGE_ID" ] || exit 1
docker compose --project-directory "$OPS" -f "$COMPOSE" up -d --no-deps --pull never web
[ "$(docker inspect rockfoundry_web --format '{{.Image}}')" = "$IMAGE_ID" ] || exit 1
IP=$(docker inspect rockfoundry_web --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
READY=0
for attempt in $(seq 1 30); do
  CODE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://$IP:3000/" || true)
  [ "$CODE" = 200 ] && { READY=1; break; }
  sleep 2
done
[ "$READY" = 1 ] || exit 1
[ "$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://$IP:3000/api/work")" = 401 ] || exit 1
[ "$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://foundry.rockbase.web.id/)" = 200 ] || exit 1
WRITER_STOPPED=0
printf 'DEPLOYED SHA=%s image_id=%s rollback_dir=%s\n' "$SHA" "$IMAGE_ID" "$RELEASE_BACKUP"
