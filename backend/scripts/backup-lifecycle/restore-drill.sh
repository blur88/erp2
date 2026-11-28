#!/usr/bin/env bash
# Restore drill for the production image (#2113).
#
# 1. Creates a Backup on a source backend whose database is changed during the
#    dump: a controlled logo reference change and a controlled e-mail change are
#    committed after the snapshot is exported and before pg_dump reads those tables.
# 2. Stops the source backend (the writer).
# 3. Restores with the runbook's own commands: every bash block under
#    "## Restore commands" in docs/deployment/BACKUP_RESTORE_RUNBOOK.md is extracted
#    and run, unchanged, against a fresh PostgreSQL 19 cluster and an empty uploads
#    directory. Only PATH adapters are added: `age`, `pg_restore` and `psql` run from
#    the production image and PostgreSQL 19 client image. `aws` is the host AWS CLI
#    in CI. DRILL_AWS_SHIM=1 uses a local adapter, for hosts without one.
# 4. Boots a second backend from the restored data, in recovery mode, and checks the
#    snapshot, records, roles, backup_settings, logos, logins and a business read.
#    It then allows scheduling and checks that it resumes.
#
# Required: IMAGE, S3_IMAGE, NET, PG_HOST, PG_PASSWORD, REDIS_HOST, S3_HOST, PG_CLIENT_IMAGE,
#   RESTORE_PG_HOST, RESTORE_PG_PORT (the fresh cluster, reachable from NET).
# Optional: DRILL_* container names (prefix them locally), DRILL_AWS_SHIM=1.
# Never prints a credential, key, or heartbeat URL.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

require_env IMAGE S3_IMAGE NET PG_HOST PG_PASSWORD REDIS_HOST S3_HOST PG_CLIENT_IMAGE RESTORE_PG_HOST RESTORE_PG_PORT

PG_USER="${PG_USER:-erp_ci}"
PG_DATABASE="erp_drill_source"
S3_BUCKET="erp-drill-backups"
S3_REGION="us-east-1"
S3_PORT=8333
S3_ENDPOINT="http://${S3_HOST}:${S3_PORT}"
S3_ENDPOINT_IN_CONTAINER="$S3_ENDPOINT"
S3C="${DRILL_S3:-erp_ci_drill_s3}"
SOURCE="${DRILL_SOURCE:-erp_ci_drill_source}"
RESTORED="${DRILL_RESTORED:-erp_ci_drill_restored}"
LOCKER="${DRILL_LOCKER:-erp_ci_drill_locker}"
RESTORE_PG="${DRILL_RESTORE_PG:-erp_ci_drill_restore_pg}"
S3_ACCESS_KEY_ID="drill$(openssl rand -hex 6)"
S3_SECRET_ACCESS_KEY="$(openssl rand -hex 24)"
JWT_SECRET="$(openssl rand -hex 48)"
ADMIN_PASSWORD="DrillAdmin-$(openssl rand -hex 8)!1"
VIEWER_USERNAME="drill-viewer"
VIEWER_EMAIL="drill-viewer@example.com"
VIEWER_PASSWORD="DrillViewer-$(openssl rand -hex 6)!1"
CHANGED_EMAIL="changed-after-snapshot@example.com"
RESTORE_ROLE="erp_drill_reader"
BACKEND="$SOURCE"
export PG_PASSWORD PG_DATABASE PG_USER S3_BUCKET S3_REGION S3_ENDPOINT_IN_CONTAINER S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY

WORK="$(mktemp -d)"
chmod 0755 "$WORK"
SHIMS="$WORK/shims"
RESTORE_DIR="$WORK/restore"
UPLOADS_DIR="$WORK/restored-uploads"
mkdir -m 0700 "$RESTORE_DIR"
mkdir -m 0755 "$UPLOADS_DIR"
mkdir -m 0777 "$WORK/source-local-copy" "$WORK/restored-local-copy"
mkdir -m 0755 "$SHIMS"
export ADMIN_TOKEN=""

cleanup() {
  docker rm -f "$SOURCE" "$RESTORED" "$S3C" "$LOCKER" "$RESTORE_PG" >/dev/null 2>&1 || true
  # The backend writes its Backups as its own user, which the host may not be able to remove.
  rm -rf "$WORK" 2>/dev/null || docker run --rm -v "$WORK:$WORK" --entrypoint sh "$IMAGE" -c "rm -rf '$WORK'" >/dev/null 2>&1 || true
  rm -rf "$WORK" 2>/dev/null || true
}
trap cleanup EXIT

# ---- Source database, storage and backend -----------------------------------------
log "creating the source database on the CI PostgreSQL server"
docker run --rm --network "$NET" -e PGPASSWORD="$PG_PASSWORD" "$PG_CLIENT_IMAGE" \
  psql -h "$PG_HOST" -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS ${PG_DATABASE} WITH (FORCE)" -c "CREATE DATABASE ${PG_DATABASE}" \
  >/dev/null || fail "could not create the source database"

log "age key for this drill (the private half never enters a backend container)"
docker run --rm --user "$(id -u):$(id -g)" -v "$WORK:/w" --entrypoint age-keygen "$IMAGE" -o /w/age-identity.txt 2>"$WORK/keygen.log" >/dev/null \
  || fail "age-keygen failed"
RECIPIENT="$(sed -n 's/^Public key: //p' "$WORK/keygen.log" "$WORK/age-identity.txt" | head -n 1)"
case "$RECIPIENT" in age1*) ;; *) fail "could not read the age recipient" ;; esac
export RECIPIENT

log "starting the S3-compatible server (versioning and Object Lock enabled per bucket)"
cat > "$WORK/s3.json" <<JSON
{"identities":[{"name":"ci","credentials":[{"accessKey":"${S3_ACCESS_KEY_ID}","secretKey":"${S3_SECRET_ACCESS_KEY}"}],"actions":["Admin","Read","Write","List","Tagging"]}]}
JSON
docker run -d --name "$S3C" --network "$NET" -v "$WORK/s3.json:/cfg/s3.json:ro" "$S3_IMAGE" \
  server -dir=/data -s3 -s3.port="$S3_PORT" -s3.config=/cfg/s3.json >/dev/null

start_backend() { # NAME [extra -e flags...]: the production image, reading the same storage
  local name=$1 local_copy=$2 db_host=$3 db_port=$4 db=$5 uploads=$6
  shift 6
  docker run -d --name "$name" --network "$NET" \
    -v "$local_copy:/var/lib/erp-backups" -v "$uploads:/app/uploads" \
    -e NODE_ENV=development -e DB_SSL=false \
    -e DB_HOST="$db_host" -e DB_PORT="$db_port" -e DB_USERNAME="$PG_USER" -e DB_PASSWORD="$PG_PASSWORD" \
    -e DB_DATABASE="$db" -e DB_SYNCHRONIZE=false \
    -e REDIS_HOST="$REDIS_HOST" -e REDIS_PORT=6379 \
    -e JWT_SECRET="$JWT_SECRET" -e PORT="$API_PORT" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    -e BACKUP_LOCAL_COPY_DIR=/var/lib/erp-backups \
    -e BACKUP_S3_ENDPOINT="$S3_ENDPOINT" -e BACKUP_S3_REGION="$S3_REGION" -e BACKUP_S3_BUCKET="$S3_BUCKET" \
    -e BACKUP_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e BACKUP_S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
    -e BACKUP_S3_FORCE_PATH_STYLE=true -e BACKUP_AGE_RECIPIENT="$RECIPIENT" \
    "$@" "$IMAGE" >/dev/null
}

mkdir -m 0777 "$WORK/source-uploads"
start_backend "$SOURCE" "$WORK/source-local-copy" "$PG_HOST" 5432 "$PG_DATABASE" "$WORK/source-uploads"
docker cp "$HERE/s3-helper.cjs" "$SOURCE:/app/ci-s3-helper.cjs"
wait_for_backend

log "creating the versioned, Object Lock bucket (retried until the storage answers)"
created=""
for i in $(seq 1 60); do
  if s3 create-bucket >/dev/null 2>&1; then created=1; break; fi
  sleep 1
done
[ -n "$created" ] || fail "storage never answered, or the bucket could not be created"

# ---- Seeded state before the Backup ----------------------------------------------
log "seeding the source: an administrator, a user, a role, a logo and non-default settings"
api POST /auth/login "" "$(jq -nc --arg u admin --arg p "$ADMIN_PASSWORD" '{username:$u,password:$p}')"
expect_code 200 "admin login on the source"
ADMIN_TOKEN="$(jq_body .accessToken)"
export ADMIN_TOKEN

api POST /users "$ADMIN_TOKEN" "$(jq -nc --arg u "$VIEWER_USERNAME" --arg e "$VIEWER_EMAIL" --arg p "$VIEWER_PASSWORD" '{username:$u,email:$e,password:$p,role:"sales_staff"}')"
expect_code 201 "create the drill user"

psql_ci "CREATE ROLE ${RESTORE_ROLE} NOLOGIN" >/dev/null
docker exec "$SOURCE" sh -c 'mkdir -p /app/uploads/logos && head -c 4096 /dev/urandom > /app/uploads/logos/logo-a.png && head -c 4096 /dev/urandom > /app/uploads/logos/logo-b.png'
[ -n "$(psql_ci "UPDATE \"company_settings\" SET \"logoUrl\" = '/uploads/logos/logo-a.png' RETURNING id")" ] \
  || fail "no company settings row to hold the logo reference"

api PUT /backups/settings "$ADMIN_TOKEN" '{"intervalMinutes":30,"retentionWindowHours":24,"retentionDailyCount":9,"retentionWeeklyCount":4,"retentionMonthlyCount":12}'
expect_code 200 "save non-default Backup settings on the source"

PRE_EMAIL="$VIEWER_EMAIL"
PRE_LOGO="/uploads/logos/logo-a.png"

# ---- The Backup, with controlled changes committed during its dump ---------------
# The locker holds ACCESS EXCLUSIVE on company_settings before the Backup starts. The
# Backup exports its snapshot first, then reads upload references from company_settings,
# and blocks there. The locker commits the changes only once it sees that block. Those
# commits happen after the snapshot, so the dump cannot see them.
log "holding company_settings, then starting a Backup that must block on it"
cat > "$WORK/locker.sql" <<SQL
BEGIN;
LOCK TABLE "company_settings" IN ACCESS EXCLUSIVE MODE;
DO \$\$
DECLARE i int := 0;
BEGIN
  LOOP
    EXIT WHEN EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND query ILIKE '%company_settings%' AND pid <> pg_backend_pid()
    );
    i := i + 1;
    IF i > 900 THEN RAISE EXCEPTION 'no Backup reached company_settings'; END IF;
    PERFORM pg_sleep(0.1);
  END LOOP;
END \$\$;
UPDATE "company_settings" SET "logoUrl" = '/uploads/logos/logo-b.png';
UPDATE "users" SET "email" = '${CHANGED_EMAIL}' WHERE "username" = '${VIEWER_USERNAME}';
COMMIT;
SQL
docker run -d --name "$LOCKER" --network "$NET" -e PGPASSWORD="$PG_PASSWORD" \
  -v "$WORK/locker.sql:/locker.sql:ro" "$PG_CLIENT_IMAGE" \
  psql -h "$PG_HOST" -U "$PG_USER" -d "$PG_DATABASE" -v ON_ERROR_STOP=1 -q -f /locker.sql >/dev/null

for i in $(seq 1 60); do
  if [ "$(psql_ci "SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'company_settings' AND l.mode = 'AccessExclusiveLock' AND l.granted")" -ge 1 ]; then
    break
  fi
  sleep 1
done
[ "$(psql_ci "SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'company_settings' AND l.mode = 'AccessExclusiveLock' AND l.granted")" -ge 1 ] \
  || fail "the locker did not take company_settings"

api POST /backups "$ADMIN_TOKEN"
[ "$HTTP_CODE" = "202" ] || fail "the drill Backup did not start (HTTP ${HTTP_CODE}: ${HTTP_BODY}); a scheduled Backup overlapped the drill, so re-run it"
RP_DRILL="$(jq_body .recoveryPoint)"
lock_status=0
timeout 240 docker wait "$LOCKER" >"$WORK/locker.exit" || lock_status=$?
[ "$lock_status" = 0 ] && [ "$(cat "$WORK/locker.exit")" = 0 ] \
  || fail "the locker did not commit the changes during the Backup: $(docker logs "$LOCKER" 2>&1 | tail -n 5)"
docker rm -f "$LOCKER" >/dev/null
log "ok: the changes were committed while the Backup was blocked on company_settings"

wait_until_idle 300
[ "$(jq_body .lastAttempt.result)" = "succeeded" ] || fail "the drill Backup did not succeed: $HTTP_BODY"
[ "$(jq_body .lastAttempt.recoveryPoint)" = "$RP_DRILL" ] || fail "the Backup status does not record ${RP_DRILL}"
[ "$(psql_ci "SELECT \"logoUrl\" FROM \"company_settings\" LIMIT 1")" = "/uploads/logos/logo-b.png" ] \
  || fail "the source does not hold the post-snapshot logo reference"
log "ok: Backup ${RP_DRILL} succeeded; the source now holds the post-snapshot values"

# ---- Stop the writer ----------------------------------------------------------------
log "stopping the source backend, the only writer"
docker rm -f "$SOURCE" >/dev/null
if [ "$(docker ps -q --filter "name=^${SOURCE}$" | wc -l)" != 0 ]; then fail "the source backend is still running"; fi

# ---- Restore, with the runbook's own commands ---------------------------------------
log "starting a fresh PostgreSQL 19 cluster for the restore"
docker run -d --name "$RESTORE_PG" --network "$NET" \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB=postgres \
  "$PG_CLIENT_IMAGE" postgres -p "$RESTORE_PG_PORT" >/dev/null
for i in $(seq 1 90); do
  if docker run --rm --network "$NET" "$PG_CLIENT_IMAGE" pg_isready -q -h "$RESTORE_PG_HOST" -p "$RESTORE_PG_PORT" -U "$PG_USER"; then
    break
  fi
  sleep 1
done
docker run --rm --network "$NET" "$PG_CLIENT_IMAGE" pg_isready -q -h "$RESTORE_PG_HOST" -p "$RESTORE_PG_PORT" -U "$PG_USER" \
  || fail "the fresh PostgreSQL 19 cluster never became ready"

# Adapters: the same binary names the runbook calls, run from the matching image.
cat > "$SHIMS/psql" <<SHIM
#!/usr/bin/env bash
exec docker run --rm -i --network "$NET" -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -v "$WORK:$WORK" -w "\$PWD" "$PG_CLIENT_IMAGE" psql "\$@"
SHIM
cat > "$SHIMS/pg_restore" <<SHIM
#!/usr/bin/env bash
exec docker run --rm -i --network "$NET" -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -v "$WORK:$WORK" -w "\$PWD" "$PG_CLIENT_IMAGE" pg_restore "\$@"
SHIM
cat > "$SHIMS/age" <<SHIM
#!/usr/bin/env bash
exec docker run --rm --user "$(id -u):$(id -g)" -v "$WORK:$WORK" -w "\$PWD" --entrypoint age "$IMAGE" "\$@"
SHIM
if [ "${DRILL_AWS_SHIM:-}" = 1 ]; then
  # Local adapter for `aws s3 cp` only: the bucket is on the Docker network, with no published port.
  cat > "$SHIMS/aws" <<SHIM
#!/usr/bin/env bash
[ "\$1 \$2" = "s3 cp" ] || { echo "aws shim: only 's3 cp' is supported" >&2; exit 2; }
key="\${3#s3://${S3_BUCKET}/}"
exec docker run --rm --network "$NET" --user "$(id -u):$(id -g)" --entrypoint node -v "$WORK:$WORK" -v "$HERE/s3-helper.cjs:/app/ci-s3-helper.cjs:ro" \\
  -e S3_BUCKET="$S3_BUCKET" -e S3_REGION="$S3_REGION" -e S3_ENDPOINT="$S3_ENDPOINT_IN_CONTAINER" \\
  -e S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \\
  "$IMAGE" /app/ci-s3-helper.cjs get "\$key" "\$4"
SHIM
else
  command -v aws >/dev/null || fail "the AWS CLI is required on the host"
  # Path-style addressing for the S3-compatible server; the endpoint is the only other setting.
  printf '[default]\ns3 =\n  addressing_style = path\n' > "$WORK/aws-config"
  export AWS_CONFIG_FILE="$WORK/aws-config" AWS_ENDPOINT_URL="$S3_ENDPOINT" AWS_EC2_METADATA_DISABLED=true
  export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" AWS_REGION="$S3_REGION"
fi
chmod 0755 "$SHIMS"/*

# The runbook's own commands, extracted unchanged from the runbook at this commit.
node "$HERE/runbook-blocks.cjs" "$REPO/docs/deployment/BACKUP_RESTORE_RUNBOOK.md" "## Restore commands" > "$WORK/restore-commands.sh" \
  || fail "the runbook's restore commands could not be extracted"

log "running the runbook's restore commands: fetch, check, decrypt, confirm, globals, database, uploads"
(
  cd "$WORK"
  export PATH="$SHIMS:$PATH"
  export RESTORE_DIR RESTORE_RECOVERY_POINT="$RP_DRILL" RESTORE_SOURCE=cloud RESTORE_BUCKET="$S3_BUCKET"
  export RESTORE_RELEASE=1.0.0 AGE_IDENTITY_FILE="$WORK/age-identity.txt" RESTORE_UPLOADS_DIR="$UPLOADS_DIR"
  export PGHOST="$RESTORE_PG_HOST" PGPORT="$RESTORE_PG_PORT" PGUSER="$PG_USER" PGPASSWORD="$PG_PASSWORD"
  unset RESTORE_CONFIRM RESTORE_ALLOW_UNRELEASED
  bash "$WORK/restore-commands.sh"
) || fail "the runbook's restore commands failed"
rm -f "$WORK/age-identity.txt"
log "ok: the runbook's restore commands completed"

# ---- Boot the recovery environment --------------------------------------------------
log "booting a second backend from the restored data, in recovery mode"
start_backend "$RESTORED" "$WORK/restored-local-copy" "$RESTORE_PG_HOST" "$RESTORE_PG_PORT" "$PG_DATABASE" "$UPLOADS_DIR" \
  -e BACKUP_RECOVERY_ENVIRONMENT=true
BACKEND="$RESTORED"
wait_for_backend

psql_restore() { # SQL: one statement against the restored database, from the same client image
  docker run --rm --network "$NET" -e PGPASSWORD="$PG_PASSWORD" "$PG_CLIENT_IMAGE" \
    psql -h "$RESTORE_PG_HOST" -p "$RESTORE_PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -v ON_ERROR_STOP=1 -tAc "$1"
}

log "checking the restored ERP2 against the snapshot"
api POST /auth/login "" "$(jq -nc --arg u admin --arg p "$ADMIN_PASSWORD" '{username:$u,password:$p}')"
expect_code 200 "admin login on the restored ERP2"
ADMIN_TOKEN="$(jq_body .accessToken)"
api POST /auth/login "" "$(jq -nc --arg u "$VIEWER_USERNAME" --arg p "$VIEWER_PASSWORD" '{username:$u,password:$p}')"
expect_code 200 "drill user login on the restored ERP2"

[ "$(psql_restore "SELECT email FROM users WHERE username = '${VIEWER_USERNAME}'")" = "$PRE_EMAIL" ] \
  || fail "the restored user e-mail is not the snapshot value"
[ "$(psql_restore "SELECT count(*) FROM users WHERE email = '${CHANGED_EMAIL}'")" = 0 ] \
  || fail "a post-snapshot e-mail change is in the restore"
log "ok: the user's e-mail is the snapshot value; the post-snapshot change is absent"

[ "$(psql_restore 'SELECT "logoUrl" FROM "company_settings" LIMIT 1')" = "$PRE_LOGO" ] \
  || fail "the restored logo reference is not the snapshot value"
log "ok: the logo reference is the snapshot value"

[ "$(psql_restore "SELECT count(*) FROM pg_roles WHERE rolname = '${RESTORE_ROLE}'")" = 1 ] \
  || fail "the role ${RESTORE_ROLE} is missing from the restore"
[ "$(psql_restore "SELECT count(*) FROM pg_roles WHERE rolname = '${PG_USER}' AND rolsuper")" = 1 ] \
  || fail "the application role is missing or not a superuser"
log "ok: roles restored from globals"

api GET /backups/settings "$ADMIN_TOKEN"; expect_code 200 "restored backup settings"
[ "$(jq_body .state)" = "valid" ] || fail "restored backup settings are not valid: $HTTP_BODY"
[ "$(jq_body .settings.retentionDailyCount)" = "9" ] || fail "restored backup_settings does not hold the saved value: $HTTP_BODY"

# Every upload reference in the restored database must resolve.
refs="$(psql_restore 'SELECT "logoUrl" FROM "company_settings" WHERE "logoUrl" IS NOT NULL UNION ALL SELECT "logoUrl" FROM "print_settings" WHERE "logoUrl" IS NOT NULL')"
[ -n "$refs" ] || fail "the restored database holds no logo reference to check"
while IFS= read -r ref; do
  [ -n "$ref" ] || continue
  code="$(docker exec "$RESTORED" curl -s -o /dev/null -w '%{http_code}' "http://localhost:${API_PORT}${ref}")"
  [ "$code" = 200 ] || fail "the restored reference ${ref} does not resolve (HTTP ${code})"
done <<< "$refs"
log "ok: every restored upload reference resolves"

api GET /customers "$ADMIN_TOKEN"; expect_code 200 "representative business read"

api GET /backups/status "$ADMIN_TOKEN"; expect_code 200 "status in the recovery environment"
[ "$(jq_body .scheduling.state)" = "unavailable" ] || fail "scheduling is not held in the recovery environment: $HTTP_BODY"
printf '%s' "$HTTP_BODY" | grep -q 'recovery environment' || fail "the hold reason is missing: $HTTP_BODY"
[ "$(jq_body .running == null)" = "true" ] || fail "a Backup is running in the recovery environment"
log "ok: scheduling is held, and the reason is shown"

# ---- Allow scheduling and retention, as the runbook describes --------------------
log "allowing scheduling and retention, then checking that scheduling resumes"
docker rm -f "$RESTORED" >/dev/null
start_backend "$RESTORED" "$WORK/restored-local-copy" "$RESTORE_PG_HOST" "$RESTORE_PG_PORT" "$PG_DATABASE" "$UPLOADS_DIR" \
  -e BACKUP_RECOVERY_ENVIRONMENT=true -e BACKUP_RECOVERY_ALLOW_SCHEDULING_AND_RETENTION=true
wait_for_backend
api POST /auth/login "" "$(jq -nc --arg u admin --arg p "$ADMIN_PASSWORD" '{username:$u,password:$p}')"
ADMIN_TOKEN="$(jq_body .accessToken)"
api GET /backups/status "$ADMIN_TOKEN"; expect_code 200 "status after the operator allows scheduling"
[ "$(jq_body .scheduling.state)" = "scheduled" ] || fail "scheduling did not resume after the operator allowed it: $HTTP_BODY"

log "all restore drill checks passed"
