#!/usr/bin/env bash
# Backup lifecycle gate for the production image (#2111).
#
# Runs the real backend image against PostgreSQL 19 and a pinned, versioned,
# Object Lock S3-compatible server, drives it only through its HTTP API (from
# inside the backend container, so nothing is published), and checks:
#   - non-admins are refused;
#   - a Backup is created and listed, with the expected manifest and an
#     archive that decrypts with a throwaway age key held outside the backend;
#   - an overlapping start returns 409;
#   - a missing upload leaves no manifest;
#   - unreachable storage is reported as unavailable and publishes nothing;
#   - an interrupted publish leaves nothing listed;
#   - Backup settings (#2112) are admin-only, an invalid update is refused and
#     leaves the stored row alone, invalid stored settings at startup stop
#     scheduling while a manual Backup still runs, and a valid save resumes
#     scheduling without a restart.
#
# Required: IMAGE, S3_IMAGE, NET, PG_HOST, PG_PASSWORD, REDIS_HOST, S3_HOST.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
. "$HERE/lib.sh"

require_env IMAGE S3_IMAGE NET PG_HOST PG_PASSWORD REDIS_HOST S3_HOST

PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:19.0-alpine3.24}"
PG_USER="${PG_USER:-erp_ci}"
PG_DATABASE="${PG_DATABASE:-erp_backup_ci}"
S3_BUCKET="erp-ci-backups"
S3_REGION="us-east-1"
S3_PORT=8333
S3C="${S3C:-erp_ci_s3}"
S3_ENDPOINT="http://${S3_HOST}:${S3_PORT}"
S3_ENDPOINT_IN_CONTAINER="$S3_ENDPOINT"
S3_ACCESS_KEY_ID="ci$(openssl rand -hex 6)"
S3_SECRET_ACCESS_KEY="$(openssl rand -hex 24)"
JWT_SECRET="$(openssl rand -hex 48)"
ADMIN_PASSWORD="CiAdmin-$(openssl rand -hex 8)!1"
VIEWER_USERNAME="ci-viewer"
VIEWER_PASSWORD="CiViewer-$(openssl rand -hex 6)!1"
export PG_PASSWORD JWT_SECRET S3_SECRET_ACCESS_KEY S3_ACCESS_KEY_ID S3_BUCKET S3_REGION S3_ENDPOINT_IN_CONTAINER

WORK="$(mktemp -d)"
chmod 0755 "$WORK"
mkdir -m 0777 "$WORK/local-copy"
export ADMIN_TOKEN=""

cleanup() {
  docker rm -f "$BACKEND" "$S3C" >/dev/null 2>&1 || true
  rm -rf "$WORK" 2>/dev/null || true
}
trap cleanup EXIT

log "generating a throwaway age key (its private half never enters the backend container)"
docker run --rm --user "$(id -u):$(id -g)" -v "$WORK:/w" --entrypoint age-keygen "$IMAGE" -o /w/age-identity.txt 2>"$WORK/keygen.log" >/dev/null \
  || fail "age-keygen failed"
RECIPIENT="$(sed -n 's/^Public key: //p' "$WORK/keygen.log" "$WORK/age-identity.txt" | head -n 1)"
case "$RECIPIENT" in age1*) ;; *) fail "could not read the age recipient" ;; esac
export RECIPIENT

log "starting the S3-compatible server (pinned image, versioning and Object Lock enabled per bucket)"
cat > "$WORK/s3.json" <<JSON
{"identities":[{"name":"ci","credentials":[{"accessKey":"${S3_ACCESS_KEY_ID}","secretKey":"${S3_SECRET_ACCESS_KEY}"}],"actions":["Admin","Read","Write","List","Tagging"]}]}
JSON
docker run -d --name "$S3C" --network "$NET" -v "$WORK/s3.json:/cfg/s3.json:ro" "$S3_IMAGE" \
  server -dir=/data -s3 -s3.port="$S3_PORT" -s3.config=/cfg/s3.json >/dev/null

log "starting the production backend image against PostgreSQL 19"
docker run -d --name "$BACKEND" --network "$NET" \
  -v "$WORK/local-copy:/var/lib/erp-backups" \
  -e NODE_ENV=development -e DB_SSL=false \
  -e DB_HOST="$PG_HOST" -e DB_PORT=5432 -e DB_USERNAME="$PG_USER" -e DB_PASSWORD="$PG_PASSWORD" \
  -e DB_DATABASE="$PG_DATABASE" -e DB_SYNCHRONIZE=false \
  -e REDIS_HOST="$REDIS_HOST" -e REDIS_PORT=6379 \
  -e JWT_SECRET="$JWT_SECRET" -e PORT="$API_PORT" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e BACKUP_LOCAL_COPY_DIR=/var/lib/erp-backups \
  -e BACKUP_S3_ENDPOINT="$S3_ENDPOINT" -e BACKUP_S3_REGION="$S3_REGION" -e BACKUP_S3_BUCKET="$S3_BUCKET" \
  -e BACKUP_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e BACKUP_S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  -e BACKUP_S3_FORCE_PATH_STYLE=true -e BACKUP_AGE_RECIPIENT="$RECIPIENT" \
  "$IMAGE" >/dev/null
docker cp "$HERE/s3-helper.cjs" "$BACKEND:/app/ci-s3-helper.cjs"
wait_for_backend

log "creating the versioned, Object Lock bucket (retried until the storage answers)"
created=""
for i in $(seq 1 60); do
  if s3 create-bucket >/dev/null 2>&1; then created=1; break; fi
  sleep 1
done
[ -n "$created" ] || fail "storage never answered, or the Object Lock bucket could not be created"

# ---- Users and authentication -------------------------------------------------
api POST /auth/login "" "$(jq -nc --arg u admin --arg p "$ADMIN_PASSWORD" '{username:$u,password:$p}')"
expect_code 200 "admin login"
ADMIN_TOKEN="$(jq_body .accessToken)"
export ADMIN_TOKEN

# An email is passed: creating a user without one hits a pre-existing TypeORM
# "undefined value in where" error in the users service (not part of #2111).
api POST /users "$ADMIN_TOKEN" "$(jq -nc --arg u "$VIEWER_USERNAME" --arg p "$VIEWER_PASSWORD" '{username:$u,email:"ci-viewer@example.com",password:$p,role:"sales_staff"}')"
expect_code 201 "create a non-admin user"
api POST /auth/login "" "$(jq -nc --arg u "$VIEWER_USERNAME" --arg p "$VIEWER_PASSWORD" '{username:$u,password:$p}')"
expect_code 200 "non-admin login"
VIEWER_TOKEN="$(jq_body .accessToken)"

log "non-admins are refused"
api GET /backups/status "$VIEWER_TOKEN"; expect_code 403 "non-admin status"
api GET /backups "$VIEWER_TOKEN"; expect_code 403 "non-admin list"
api POST /backups "$VIEWER_TOKEN"; expect_code 403 "non-admin start"
api GET /backups/status; expect_code 401 "anonymous status"

# A large upload keeps an attempt running long enough to observe overlap and the publish window.
docker exec "$BACKEND" sh -c 'head -c 134217728 /dev/urandom > /app/uploads/ci-bulk.bin'
api GET /settings/company "$ADMIN_TOKEN"; expect_code 200 "load company settings"

# ---- A Backup is created, overlapping starts are refused, and it is listed ------
log "a Backup is created; an overlapping start is refused"
api POST /backups "$ADMIN_TOKEN"; expect_code 202 "admin starts a Backup"
RP1="$(jq_body .recoveryPoint)"
api POST /backups "$ADMIN_TOKEN"; expect_code 409 "overlapping start"
wait_until_idle 240

api GET /backups/status "$ADMIN_TOKEN"; expect_code 200 "status after the run"
[ "$(jq_body .lastAttempt.result)" = "succeeded" ] || fail "the Backup did not succeed: $(jq_body .lastAttempt)"
[ "$(jq_body .lastAttempt.recoveryPoint)" = "$RP1" ] || fail "status does not record ${RP1}"

api GET /backups "$ADMIN_TOKEN"; expect_code 200 "list Backups"
[ "$(jq_body .state)" = "ok" ] || fail "listing is not ok: $HTTP_BODY"
[ "$(jq_body '.backups | length')" = "1" ] || fail "expected exactly one listed Backup: $HTTP_BODY"
[ "$(jq_body '.malformed | length')" = "0" ] || fail "unexpected malformed Backups: $HTTP_BODY"
[ "$(jq_body '.backups[0].recoveryPoint')" = "$RP1" ] || fail "listed Backup is not ${RP1}"

log "the bucket holds exactly the two objects, and the manifest matches the archive"
KEYS="$(list_keys "backups/${RP1}/" | sort)"
[ "$KEYS" = "$(printf 'backups/%s/backup.tar.age\nbackups/%s/manifest.json' "$RP1" "$RP1")" ] \
  || fail "unexpected objects under ${RP1}: ${KEYS}"
s3 get "backups/${RP1}/manifest.json" > "$WORK/manifest.json"
assert_manifest "$WORK/manifest.json" "$RP1" "1.0.0"
# Three independent views of the archive, with numbers: the bytes downloaded
# from storage (written to a file, not piped), the producer's local copy that
# was hashed before upload, and the manifest values.
s3 get "backups/${RP1}/backup.tar.age" /tmp/archive-download.bin
dl="$(docker exec "$BACKEND" sh -c 'sha256sum /tmp/archive-download.bin | cut -d" " -f1; stat -c %s /tmp/archive-download.bin')"
docker cp "$BACKEND:/tmp/archive-download.bin" "$WORK/archive.tar.age"
prod="$(docker exec "$BACKEND" sh -c "sha256sum /var/lib/erp-backups/${RP1}/backup.tar.age | cut -d' ' -f1; stat -c %s /var/lib/erp-backups/${RP1}/backup.tar.age")"
man_sha="$(jq -r .archive.sha256 "$WORK/manifest.json")"
man_size="$(jq -r .archive.size "$WORK/manifest.json")"
dl_sha="$(echo "$dl" | sed -n 1p)"; dl_size="$(echo "$dl" | sed -n 2p)"
prod_sha="$(echo "$prod" | sed -n 1p)"; prod_size="$(echo "$prod" | sed -n 2p)"
host_sha="$(sha256sum "$WORK/archive.tar.age" | cut -d' ' -f1)"; host_size="$(stat -c %s "$WORK/archive.tar.age")"
log "download (storage, to file): sha256=${dl_sha} size=${dl_size}"
log "download copied to host:     sha256=${host_sha} size=${host_size}"
log "producer local copy:         sha256=${prod_sha} size=${prod_size}"
log "manifest:                    sha256=${man_sha} size=${man_size}"
[ "$dl_sha" = "$man_sha" ] && [ "$dl_size" = "$man_size" ] \
  || fail "download from storage does not match the manifest (sha256 ${dl_sha} vs ${man_sha}; size ${dl_size} vs ${man_size})"
[ "$host_sha" = "$man_sha" ] && [ "$host_size" = "$man_size" ] \
  || fail "host copy does not match the manifest (sha256 ${host_sha} vs ${man_sha}; size ${host_size} vs ${man_size})"
[ "$prod_sha" = "$man_sha" ] && [ "$prod_size" = "$man_size" ] \
  || fail "producer local copy does not match the manifest (sha256 ${prod_sha} vs ${man_sha}; size ${prod_size} vs ${man_size})"
assert_no_secrets "$WORK/manifest.json"

log "the archive decrypts with the throwaway key, outside the backend container"
docker run --rm --user "$(id -u):$(id -g)" -v "$WORK:/w" --entrypoint sh "$IMAGE" -c '
  set -e
  age -d -i /w/age-identity.txt -o /w/plain.tar /w/archive.tar.age
  tar -tf /w/plain.tar | sort > /w/members.txt
  mkdir -p /w/parts && tar -xf /w/plain.tar -C /w/parts erp_db.dump
  pg_restore --list /w/parts/erp_db.dump >/dev/null' || fail "the archive did not decrypt into a readable dump"
[ "$(tr '\n' ' ' < "$WORK/members.txt")" = "erp_db.dump globals.sql uploads.tar " ] \
  || fail "unexpected archive members: $(cat "$WORK/members.txt")"
log "ok: archive members and dump readability"

# ---- A missing upload leaves no manifest -------------------------------------
log "a missing upload fails the attempt and publishes no manifest"
before="$(count_manifests)"
[ -n "$(psql_ci 'UPDATE "company_settings" SET "logoUrl" = '"'"'/uploads/logos/ci-missing.png'"'"' RETURNING id' )" ] \
  || fail "no company settings row to hold the missing reference"
api POST /backups "$ADMIN_TOKEN"; expect_code 202 "start with a missing reference"
wait_until_idle 240
[ "$(jq_body .lastAttempt.failedStep)" = "checks" ] || fail "expected failure at checks: $HTTP_BODY"
[ "$(count_manifests)" = "$before" ] || fail "a manifest was published for a failed Backup"
psql_ci 'UPDATE "company_settings" SET "logoUrl" = NULL' >/dev/null

# ---- An interrupted publish leaves nothing listed ----------------------------
# s3 needs the backend container, which the kill has stopped. These post-kill
# checks run the same helper in a throwaway container from the production
# image, on the same network, with the same storage environment.
s3_oneshot() {
  docker run --rm --network "$NET" --entrypoint node \
    -v "$HERE/s3-helper.cjs:/app/ci-s3-helper.cjs:ro" \
    -e S3_BUCKET="$S3_BUCKET" -e S3_REGION="$S3_REGION" -e S3_ENDPOINT="$S3_ENDPOINT_IN_CONTAINER" \
    -e S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
    "$IMAGE" /app/ci-s3-helper.cjs "$@"
}

# The watcher runs inside the backend container. It waits until the archive is
# visible in storage and the manifest is not, then SIGKILLs the application, so
# the stop happens during the publish window and before the manifest upload.
# Existence is checked with HEAD, not listing, because listing can lag an upload.
log "an interrupted publish leaves nothing listed"
api POST /backups "$ADMIN_TOKEN"; expect_code 202 "start for the interruption"
RP3="$(jq_body .recoveryPoint)"
docker exec -d \
  -e S3_BUCKET="$S3_BUCKET" -e S3_REGION="$S3_REGION" -e S3_ENDPOINT="$S3_ENDPOINT_IN_CONTAINER" \
  -e S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  "$BACKEND" sh -c "node /app/ci-s3-helper.cjs watch-kill backups/${RP3}/backup.tar.age backups/${RP3}/manifest.json > /tmp/watch.log 2>&1"
for i in $(seq 1 120); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$BACKEND")" != "true" ]; then break; fi
  sleep 1
done
[ "$(docker inspect -f '{{.State.Running}}' "$BACKEND")" != "true" ] || fail "the publish was not interrupted within 120s"
docker cp "$BACKEND:/tmp/watch.log" "$WORK/watch.log" 2>/dev/null || fail "the watcher left no record"
# The helper writes "killed <pid>" synchronously before it sends SIGKILL, and it only kills once the archive
# is visible and the manifest is absent. Its shell cannot write an exit status: the application is the
# entrypoint's exec'd child under dumb-init, so the container stops and takes the watcher with it.
if ! grep -q '^killed ' "$WORK/watch.log"; then
  fail "the watcher did not kill the publish at the archive: $(tr '\n' ' ' < "$WORK/watch.log")"
fi
log "ok: $(grep '^killed ' "$WORK/watch.log") after the archive was visible and before the manifest"
s3_oneshot head "backups/${RP3}/backup.tar.age" >/dev/null || fail "the interrupted run's archive is not visible in storage"
manifest_rc=0
s3_oneshot head "backups/${RP3}/manifest.json" >/dev/null 2>&1 || manifest_rc=$?
# Exit 3 is the helper's explicit not-found. Any other failure is not absence.
[ "$manifest_rc" = "3" ] || fail "manifest check for the interrupted run was not a clean not-found (exit ${manifest_rc})"
log "ok: archive present, manifest absent for ${RP3}"

docker start "$BACKEND" >/dev/null
wait_for_backend
api GET /backups/status "$ADMIN_TOKEN"; expect_code 200 "status after restart"
[ "$(jq_body .noAttemptSinceRestart)" = "true" ] || fail "status after restart should say no attempt since restart"
api GET /backups "$ADMIN_TOKEN"; expect_code 200 "list after the interruption"
[ "$(jq_body '.backups | map(.recoveryPoint) | join(",")')" = "$RP1" ] \
  || fail "the interrupted Backup is listed or the good one is missing: $HTTP_BODY"
[ "$(jq_body '.malformed | length')" = "0" ] || fail "the incomplete prefix was reported as malformed: $HTTP_BODY"

# ---- Unreachable storage is reported, and publishes nothing ------------------
log "unreachable storage is reported as unavailable and publishes nothing"
docker stop "$S3C" >/dev/null
api GET /backups "$ADMIN_TOKEN"; expect_code 200 "list while storage is down"
[ "$(jq_body .state)" = "unavailable" ] || fail "unreachable storage was not reported as unavailable: $HTTP_BODY"
[ "$(jq_body '.backups // [] | length')" = "0" ] || fail "unavailable storage returned backups"
api POST /backups "$ADMIN_TOKEN"; expect_code 202 "start while storage is down"
wait_until_idle 240
[ "$(jq_body .lastAttempt.result)" = "failed" ] || fail "the Backup should fail while storage is down"
[ "$(jq_body .lastRetention.result)" = "failed" ] || fail "the retention failure was not recorded: $HTTP_BODY"
[ "$(jq_body .lastRetention.failedStep)" = "list" ] || fail "the retention failure is not at the listing: $HTTP_BODY"
docker start "$S3C" >/dev/null
for i in $(seq 1 90); do
  if s3 list "" >/dev/null 2>&1; then break; fi
  sleep 1
done
s3 list "" >/dev/null || fail "storage did not come back"
[ "$(count_manifests)" = "1" ] || fail "storage outage changed the published Backups"

api GET /backups "$ADMIN_TOKEN"; expect_code 200 "final listing"
[ "$(jq_body '.backups | map(.recoveryPoint) | join(",")')" = "$RP1" ] \
  || fail "final listing does not show exactly ${RP1}: $HTTP_BODY"
# ---- Settings (#2112): validated, admin-only, and scheduling follows them ------
# Runs last: the manual Backup below would change the single-Backup listing checks above.
log "settings are admin-only and an invalid update is refused"
api GET /backups/settings "$VIEWER_TOKEN"; expect_code 403 "non-admin reads settings"
VALID_SETTINGS='{"intervalMinutes":15,"retentionWindowHours":24,"retentionDailyCount":7,"retentionWeeklyCount":4,"retentionMonthlyCount":12}'
api PUT /backups/settings "$VIEWER_TOKEN" "$VALID_SETTINGS"; expect_code 403 "non-admin saves settings"

api GET /backups/settings "$ADMIN_TOKEN"; expect_code 200 "admin reads settings"
[ "$(jq_body .state)" = "valid" ] || fail "seeded settings are not valid: $HTTP_BODY"
[ "$(jq_body .settings.intervalMinutes)" = "30" ] || fail "seeded interval is not the 30-minute default: $HTTP_BODY"

api PUT /backups/settings "$ADMIN_TOKEN" '{"intervalMinutes":20,"retentionWindowHours":24,"retentionDailyCount":7,"retentionWeeklyCount":4,"retentionMonthlyCount":12}'
expect_code 400 "an interval of 20 minutes is refused"
printf '%s' "$HTTP_BODY" | grep -q intervalMinutes || fail "the refusal does not name intervalMinutes: $HTTP_BODY"
api GET /backups/settings "$ADMIN_TOKEN"; expect_code 200 "settings after the refusal"
[ "$(jq_body .settings.intervalMinutes)" = "30" ] || fail "a refused update changed the stored interval: $HTTP_BODY"

api GET /backups/status "$ADMIN_TOKEN"; expect_code 200 "status with valid settings"
[ "$(jq_body .scheduling.state)" = "scheduled" ] || fail "scheduling is not on with valid settings: $HTTP_BODY"
[ "$(jq_body .scheduling.intervalMinutes)" = "30" ] || fail "scheduling does not use the stored interval: $HTTP_BODY"

# Invalid stored settings, as after restoring an old database: the row is changed
# directly, then the backend restarts and must stop scheduling without refusing manual Backups.
log "invalid stored settings stop scheduling at startup; a manual Backup still runs"
psql_ci 'UPDATE "backup_settings" SET "intervalMinutes" = 20' >/dev/null
docker restart "$BACKEND" >/dev/null
wait_for_backend
api GET /backups/status "$ADMIN_TOKEN"; expect_code 200 "status after restarting with invalid settings"
[ "$(jq_body .scheduling.state)" = "unavailable" ] || fail "invalid stored settings did not stop scheduling: $HTTP_BODY"
printf '%s' "$HTTP_BODY" | grep -q 'invalid' || fail "the scheduling reason does not say the settings are invalid: $HTTP_BODY"
api GET /backups/settings "$ADMIN_TOKEN"; expect_code 200 "settings with invalid stored values"
[ "$(jq_body .state)" = "invalid" ] || fail "stored invalid settings were not reported as invalid: $HTTP_BODY"
[ "$(jq_body .values.intervalMinutes)" = "20" ] || fail "the stored value was not returned for correction: $HTTP_BODY"

wait_until_idle 60
api POST /backups "$ADMIN_TOKEN"; expect_code 202 "manual Backup while stored settings are invalid"
wait_until_idle 240
[ "$(jq_body .lastAttempt.result)" = "succeeded" ] || fail "the manual Backup did not succeed with invalid settings: $HTTP_BODY"
[ "$(jq_body .lastRetention.result)" = "skipped" ] || fail "retention was not skipped under invalid settings: $HTTP_BODY"

log "saving valid settings resumes scheduling without a restart"
api PUT /backups/settings "$ADMIN_TOKEN" "$VALID_SETTINGS"; expect_code 200 "save valid settings"
api GET /backups/status "$ADMIN_TOKEN"; expect_code 200 "status after saving valid settings"
[ "$(jq_body .scheduling.state)" = "scheduled" ] || fail "saving valid settings did not resume scheduling: $HTTP_BODY"
[ "$(jq_body .scheduling.intervalMinutes)" = "15" ] || fail "scheduling did not pick up the saved interval: $HTTP_BODY"

# ---- Retention (#2114): an expired Backup is removed; the newest Verified Backup is kept ----
# Controlled timestamps: a copy of the first Backup is published under an old recovery point, and a
# one-hour window with single-period tiers makes that copy expired. The bucket is then checked directly.
log "retention removes a controlled expired Backup and keeps the newest Verified Backup"
api PUT /backups/settings "$ADMIN_TOKEN" '{"intervalMinutes":15,"retentionWindowHours":1,"retentionDailyCount":1,"retentionWeeklyCount":1,"retentionMonthlyCount":1}'
expect_code 200 "tighter retention settings"

EXP_RP="20200101T000000000Z"
s3 get "backups/${RP1}/backup.tar.age" /tmp/ci-expired-archive.bin
jq --arg rp "$EXP_RP" '.recovery_point = $rp' "$WORK/manifest.json" > "$WORK/expired-manifest.json"
docker cp "$WORK/expired-manifest.json" "$BACKEND:/tmp/ci-expired-manifest.json"
s3 put "backups/${EXP_RP}/backup.tar.age" /tmp/ci-expired-archive.bin >/dev/null
s3 put "backups/${EXP_RP}/manifest.json" /tmp/ci-expired-manifest.json >/dev/null
api GET /backups "$ADMIN_TOKEN"; expect_code 200 "list with the controlled expired Backup present"
printf '%s' "$HTTP_BODY" | jq -e --arg rp "$EXP_RP" '[.backups[].recoveryPoint] | index($rp) != null' >/dev/null \
  || fail "the controlled expired Backup is not a complete, listed Backup: $HTTP_BODY"

# A scheduled run can share the boundary, so a manual start may need to wait for it.
for i in $(seq 1 30); do
  api POST /backups "$ADMIN_TOKEN"
  if [ "$HTTP_CODE" = "202" ]; then break; fi
  [ "$HTTP_CODE" = "409" ] || fail "start for retention returned HTTP ${HTTP_CODE}: ${HTTP_BODY}"
  wait_until_idle 60
done
expect_code 202 "start a Backup with the expired Backup present"
RP_NEW="$(jq_body .recoveryPoint)"
wait_until_idle 240
[ "$(jq_body .lastAttempt.result)" = "succeeded" ] || fail "the retention Backup did not succeed: $HTTP_BODY"
[ "$(jq_body .lastRetention.result)" = "succeeded" ] || fail "retention did not succeed: $HTTP_BODY"

[ -z "$(list_keys "backups/${EXP_RP}/")" ] || fail "the expired Backup still has objects: $(list_keys "backups/${EXP_RP}/")"
api GET /backups "$ADMIN_TOKEN"; expect_code 200 "list after retention"
[ "$(jq_body '.backups[0].recoveryPoint')" = "$RP_NEW" ] || fail "the newest Backup is not first in the listing: $HTTP_BODY"
printf '%s' "$HTTP_BODY" | jq -e --arg rp "$EXP_RP" '[.backups[].recoveryPoint] | index($rp) == null' >/dev/null \
  || fail "the expired Backup is still listed: $HTTP_BODY"
KEYS_NEW="$(list_keys "backups/${RP_NEW}/" | sort)"
[ "$KEYS_NEW" = "$(printf 'backups/%s/backup.tar.age\nbackups/%s/manifest.json' "$RP_NEW" "$RP_NEW")" ] \
  || fail "the newest Verified Backup does not have both objects: ${KEYS_NEW}"
log "ok: ${EXP_RP} removed; ${RP_NEW} kept as the newest Verified Backup"

# The abandoned archive from the interrupted publish is younger than 24 hours, so it must stay.
s3_oneshot head "backups/${RP3}/backup.tar.age" >/dev/null || fail "an abandoned archive younger than 24 hours was deleted"
log "ok: the abandoned archive for ${RP3} is kept until it is 24 hours old"

log "all Backup lifecycle checks passed"
