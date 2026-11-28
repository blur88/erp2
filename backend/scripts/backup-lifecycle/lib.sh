#!/usr/bin/env bash
# Shared helpers for the Backup lifecycle CI job (#2111). Sourced by run.sh and
# by the Bats tests. Nothing here prints a credential, key, or heartbeat URL.

BACKEND="${BACKEND:-erp_ci_backend}"
API_PORT="${API_PORT:-3001}"

log() { printf '[backup-lifecycle] %s\n' "$*"; }

fail() {
  printf '::error::%s\n' "$*" >&2
  if docker inspect "$BACKEND" >/dev/null 2>&1; then
    printf '[backup-lifecycle] last backend log lines:\n' >&2
    docker logs "$BACKEND" 2>&1 | tail -n 60 >&2 || true
  fi
  exit 1
}

# require_env NAME... : fails listing every unset name, never the values.
require_env() {
  local name missing=()
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then missing+=("$name"); fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    fail "missing required environment: ${missing[*]}"
  fi
}

# api METHOD PATH [TOKEN] [JSON] : calls the API from inside the backend
# container, so no port is published. Sets HTTP_CODE and HTTP_BODY.
api() {
  local method=$1 path=$2 token=${3:-} body=${4:-}
  local args=(-s -w $'\n%{http_code}' -X "$method" "http://localhost:${API_PORT}/api${path}")
  if [ -n "$token" ]; then args+=(-H "Authorization: Bearer ${token}"); fi
  if [ -n "$body" ]; then args+=(-H 'Content-Type: application/json' --data "$body"); fi
  local out
  out=$(docker exec "$BACKEND" curl "${args[@]}") || out=$'\n000'
  HTTP_CODE=$(printf '%s' "$out" | tail -n 1)
  HTTP_BODY=$(printf '%s' "$out" | sed '$d')
}

# expect_code EXPECTED LABEL : checks HTTP_CODE from the last api call.
expect_code() {
  local expected=$1 label=$2
  if [ "$HTTP_CODE" != "$expected" ]; then
    fail "${label}: expected HTTP ${expected}, got ${HTTP_CODE}: ${HTTP_BODY}"
  fi
  log "ok: ${label} (HTTP ${expected})"
}

# jq_body FILTER : evaluates a filter against HTTP_BODY.
jq_body() { printf '%s' "$HTTP_BODY" | jq -r "$1"; }

# wait_for_backend : waits for /api/health from inside the container.
wait_for_backend() {
  local i
  for i in $(seq 1 90); do
    if [ "$(docker exec "$BACKEND" curl -s -o /dev/null -w '%{http_code}' "http://localhost:${API_PORT}/api/health" || true)" = "200" ]; then
      log "backend healthy after ${i}s"
      return 0
    fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$BACKEND" 2>/dev/null)" != "true" ]; then
      docker logs "$BACKEND" 2>&1 | tail -n 80 >&2 || true
      fail "backend container stopped before becoming healthy"
    fi
    sleep 1
  done
  docker logs "$BACKEND" 2>&1 | tail -n 80 >&2 || true
  fail "backend never became healthy"
}

# wait_until_idle TIMEOUT_SECONDS : polls in-memory status (never the bucket) until no attempt runs.
wait_until_idle() {
  local timeout=$1 i
  for i in $(seq 1 "$timeout"); do
    api GET /backups/status "$ADMIN_TOKEN"
    [ "$HTTP_CODE" = "200" ] || fail "status poll returned HTTP ${HTTP_CODE}"
    if [ "$(jq_body '.running == null')" = "true" ]; then return 0; fi
    sleep 1
  done
  fail "a Backup was still running after ${timeout}s"
}

# s3 COMMAND ... : runs the storage helper inside the backend container.
s3() {
  docker exec -e S3_BUCKET="$S3_BUCKET" -e S3_REGION="$S3_REGION" -e S3_ENDPOINT="$S3_ENDPOINT_IN_CONTAINER" \
    -e S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
    "$BACKEND" node /app/ci-s3-helper.cjs "$@"
}

# psql_ci SQL : runs one statement against the CI database, with the image's own psql.
psql_ci() {
  docker run --rm --network "$NET" -e PGPASSWORD="$PG_PASSWORD" "$PG_CLIENT_IMAGE" \
    psql -h "$PG_HOST" -U "$PG_USER" -d "$PG_DATABASE" -v ON_ERROR_STOP=1 -tAc "$1"
}

# list_keys PREFIX : prints the object keys under a prefix, one per line.
list_keys() { s3 list "$1" | jq -r '.[].key'; }

# count_manifests : how many prefixes under backups/ hold a manifest.
count_manifests() { list_keys "backups/" | grep -c '/manifest\.json$' || true; }

# assert_manifest FILE RECOVERY_POINT RELEASE : the published shape and values, per the spec.
assert_manifest() {
  local file=$1 rp=$2 release=$3
  jq -e --arg rp "$rp" --arg rel "$release" '
    (keys | sort) == ["age_recipient_fingerprint","archive","checks","format_version","postgres","recovery_point","release"]
    and .format_version == 1
    and .recovery_point == $rp
    and .release == $rel
    and .postgres.server_major == 19
    and .postgres.client_major == 19
    and .archive.name == "backup.tar.age"
    and (.archive.size | type == "number")
    and (.archive.sha256 | test("^[0-9a-f]{64}$"))
    and (.age_recipient_fingerprint | test("^[0-9a-f]{64}$"))
    and .checks.uploads_references == "passed"
    and .checks.dump_readable == "passed"
    and .checks.application_role_in_globals == "passed"
    and .checks.decryption == "not verified"' "$file" >/dev/null \
    || fail "manifest does not match the published shape: $(cat "$file")"
  log "ok: manifest shape and values for ${rp}"
}

# assert_no_secrets FILE... : no database password, storage secret, JWT secret, or age private key.
assert_no_secrets() {
  local file pattern
  for file in "$@"; do
    for pattern in "$PG_PASSWORD" "$S3_SECRET_ACCESS_KEY" "$JWT_SECRET" 'AGE-SECRET-KEY-'; do
      if [ -n "$pattern" ] && grep -qF -- "$pattern" "$file"; then
        fail "a secret value appeared in ${file}"
      fi
    done
  done
  log "ok: no secret values in the checked files"
}
