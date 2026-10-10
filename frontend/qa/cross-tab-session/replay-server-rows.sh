#!/usr/bin/env bash
# The server's own record of one replay round, read after the round has run.
# Read-only: SELECT only, no token, hash or key column is named.
#
#   replay-server-rows.sh <since-iso> > "$SCRATCH/server-rows-N.json"
#
# One JSON object on stdout: { ok, since, readAt, audit, refreshTokens, sessions }.
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
  echo "usage: replay-server-rows.sh <since-iso>" >&2
  exit 2
fi


TMP_SQL="$(mktemp)"
trap 'rm -f "${TMP_SQL}"' EXIT

# The instant is bound as a psql variable, not interpolated, so a malformed one
# is a query error and never a different query.
cat > "${TMP_SQL}" <<'SQL'
SELECT json_build_object(
  'ok', true,
  'since', :'since',
  'readAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
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
      AND rt."sessionId" IN (
        SELECT a."entityId" FROM audit_logs a
        WHERE a."action" = 'SESSION_REPLAY_REVOKED'
          AND a."createdAt" >= :'since'::timestamptz
          AND a."deletedAt" IS NULL
      )
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
      AND s."id" IN (
        SELECT a."entityId" FROM audit_logs a
        WHERE a."action" = 'SESSION_REPLAY_REVOKED'
          AND a."createdAt" >= :'since'::timestamptz
          AND a."deletedAt" IS NULL
      )
  ), '[]'::json)
);
SQL

# shellcheck disable=SC2016 # $POSTGRES_USER and $POSTGRES_DB are read inside the container
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1 -v since="$1" -f -' sh "${SINCE}" \
  < "${TMP_SQL}"

