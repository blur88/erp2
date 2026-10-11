#!/usr/bin/env bash
# The server's own record of one replay round, read after the round has run.
# Read-only: SELECT only, no token, hash or key column is named.
#
#   replay-server-rows.sh <since-iso> [session-id ...] > "$SCRATCH/server-rows-N.json"
#
# One JSON object on stdout: { ok, since, readAt, sessionIds, audit,
# refreshTokens, sessions }. The token and session rows are those of every
# session with a replay row since <since-iso>, and of every session named: a
# round that ended in no replay still needs its supersession and grace times
# (#1370).
# `readAt` is the database's now(), read in the same query, so it says how far
# the rows can possibly reach. A query that fails prints nothing and exits
# non-zero: a failed read must not leave a file that reads like an empty result.
# The evidence module treats anything it cannot parse as "no rows read", which
# is `undetermined`, never `no-replay`.
set -euo pipefail
export ON_ERROR_STOP=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "${ROOT}"

SINCE="${1:-}"
if [ -z "${SINCE}" ]; then
  echo "usage: replay-server-rows.sh <since-iso> [session-id ...]" >&2
  exit 2
fi
shift
# Session ids are UUIDs and nothing else: checked here, before anything runs,
# and bound below as a psql variable like the instant.
SESSIONS=""
for id in "$@"; do
  if ! [[ "${id}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    echo "not a session id: ${id}" >&2
    exit 2
  fi
  # In lower case, as the database prints a uuid: the comparison below is on text.
  SESSIONS="${SESSIONS:+${SESSIONS},}${id,,}"
done


TMP_SQL="$(mktemp)"
trap 'rm -f "${TMP_SQL}"' EXIT

# The instant is bound as a psql variable, not interpolated, so a malformed one
# is a query error and never a different query.
cat > "${TMP_SQL}" <<'SQL'
SELECT json_build_object(
  'ok', true,
  'since', :'since',
  'readAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'sessionIds', to_json(string_to_array(:'sessions', ',')),
  'audit', COALESCE((
    SELECT json_agg(json_build_object(
      'id', a."id",
      'createdAt', to_char(a."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'sessionId', a."entityId",
      'action', a."action",
      'presentedGeneration', (a."metadata" ->> 'presentedGeneration')::int,
      'currentGeneration', (a."metadata" ->> 'currentGeneration')::int
    ))
    FROM audit_logs a
    WHERE a."action" = 'SESSION_REPLAY_REVOKED'
      AND a."createdAt" >= :'since'::timestamptz
      AND a."deletedAt" IS NULL
  ), '[]'::json),
  'refreshTokens', COALESCE((
    SELECT json_agg(json_build_object(
      'sessionId', rt."sessionId",
      'generation', rt."generation",
      'issuedAt', to_char(rt."issuedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'supersededAt', to_char(rt."supersededAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'graceUntil', to_char(rt."graceUntil" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ))
    FROM refresh_tokens rt
    WHERE rt."deletedAt" IS NULL
      AND (rt."sessionId" IN (
        SELECT a."entityId" FROM audit_logs a
        WHERE a."action" = 'SESSION_REPLAY_REVOKED'
          AND a."createdAt" >= :'since'::timestamptz
          AND a."deletedAt" IS NULL
      ) OR rt."sessionId"::text = ANY (string_to_array(:'sessions', ',')))
  ), '[]'::json),
  'sessions', COALESCE((
    SELECT json_agg(json_build_object(
      'id', s."id",
      'generation', s."generation",
      'revokedAt', to_char(s."revokedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'revokeReason', s."revokeReason"
    ))
    FROM auth_sessions s
    WHERE s."deletedAt" IS NULL
      AND (s."id" IN (
        SELECT a."entityId" FROM audit_logs a
        WHERE a."action" = 'SESSION_REPLAY_REVOKED'
          AND a."createdAt" >= :'since'::timestamptz
          AND a."deletedAt" IS NULL
      ) OR s."id"::text = ANY (string_to_array(:'sessions', ',')))
  ), '[]'::json)
);
SQL

# shellcheck disable=SC2016 # $POSTGRES_USER and $POSTGRES_DB are read inside the container
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -v since="$1" -v sessions="$2" -f -' sh "${SINCE}" "${SESSIONS}" \
  < "${TMP_SQL}"

