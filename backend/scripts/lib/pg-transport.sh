#!/usr/bin/env bash
# Postgres transport for the migration-baseline gate scripts (#1260).
#
# The gates must run in two places that reach Postgres differently:
#
#   compose (default, local) — Postgres is a container in docker-compose.yml,
#     reached via `docker compose exec -T`. No host psql/pg_dump needed.
#   tcp (CI) — Postgres is a GitHub Actions service container published on
#     localhost:5432. There is no compose stack, so `docker compose exec` fails
#     on every call.
#
# Selection is EXPLICIT (PG_TRANSPORT) and never falls back: a silent fallback
# could target a different database than the one the gate built, and a gate
# that inspects the wrong database reports a meaningless pass.
#
# Source this file; do not execute it.

PG_TRANSPORT="${PG_TRANSPORT:-compose}"

_pg_transport_die() {
  echo "$1" >&2
  exit 2
}

# ---------------------------------------------------------------------------
# Connection precedence: DB_* is the single source of truth.
#
# TypeORM (schema:sync, migration:run) reads DB_HOST/DB_PORT/DB_USERNAME/
# DB_PASSWORD/DB_DATABASE and BUILDS the databases. psql/pg_dump read
# PGHOST/PGPORT/PGUSER/PGPASSWORD and INSPECT them. If the two families
# disagree the gate builds on one server and inspects another — the diff is
# then meaningless rather than failing, which is the worst outcome for a gate.
#
# Every existing call site already passes explicit -U and -d, and an explicit
# flag beats the environment, so role and database are pinned by construction.
# The real gap is host/port: no call site passes -h or -p, so under tcp the
# clients would silently take PGHOST/PGPORT. Exporting them from DB_* closes
# it. PGDATABASE is deliberately NOT exported — -d is always explicit.
# ---------------------------------------------------------------------------
_pg_transport_export_pgvars() {
  # Abort rather than silently overwrite a conflicting inherited value: only
  # the caller can resolve an intent they expressed.
  if [ -n "${PGHOST:-}" ] && [ "${PGHOST}" != "${DB_HOST}" ]; then
    _pg_transport_die "PGHOST ($PGHOST) conflicts with DB_HOST ($DB_HOST). These must name the same server: DB_* builds the gate databases and PG* inspects them. Unset PGHOST or align the two."
  fi
  if [ -n "${PGPORT:-}" ] && [ "${PGPORT}" != "${DB_PORT}" ]; then
    _pg_transport_die "PGPORT ($PGPORT) conflicts with DB_PORT ($DB_PORT). These must name the same server: DB_* builds the gate databases and PG* inspects them. Unset PGPORT or align the two."
  fi
  if [ -n "${PGUSER:-}" ] && [ "${PGUSER}" != "${DB_USERNAME}" ]; then
    _pg_transport_die "PGUSER ($PGUSER) conflicts with DB_USERNAME ($DB_USERNAME). Unset PGUSER or align the two."
  fi

  export PGHOST="$DB_HOST"
  export PGPORT="$DB_PORT"
  export PGUSER="$DB_USERNAME"
  # Keeps the password out of the process argument list, unlike -W/-a.
  export PGPASSWORD="$DB_PASSWORD"
}

_pg_transport_require_client_major_18() {
  local version_line major
  if ! version_line="$(pg_dump --version 2>/dev/null)"; then
    _pg_transport_die "PG_TRANSPORT=tcp requires pg_dump on PATH, but running it failed. Install the PostgreSQL 18 client (postgresql-client-18)."
  fi
  # "pg_dump (PostgreSQL) 18.3" -> 18
  major="$(printf '%s' "$version_line" | sed -n 's/.*(PostgreSQL) \([0-9]\{1,\}\).*/\1/p')"
  if [ "$major" != "18" ]; then
    _pg_transport_die "pg_dump reports major version '${major:-unknown}' ($version_line), but the server is PostgreSQL 18. An older client refuses a v18 server outright. A newer client is not rejected by the server, but verify-baseline.sh's normalize() is written against PostgreSQL 18's dump dialect (it strips 18's \\restrict/\\unrestrict wrappers and filters whole statement paragraphs), so a different dialect is outside the range it was validated for. Both sides of the diff use the same client, so ordinary formatting changes cancel — the pin bounds normalization's input, it does not predict a false diff. Install postgresql-client-18."
  fi
}

case "$PG_TRANSPORT" in
  compose)
    command -v docker >/dev/null 2>&1 \
      || _pg_transport_die "PG_TRANSPORT=compose requires docker on PATH. Set PG_TRANSPORT=tcp to use host psql/pg_dump instead."

    # `command -v docker` only proves the CLI is installed. The gate needs the
    # postgres SERVICE to answer: a stopped stack, a wrong compose file, or a
    # container still starting all pass the PATH check and then fail much
    # later, inside a query, where the error reads as a schema problem.
    if ! docker compose -f ../docker-compose.yml exec -T postgres \
         pg_isready -U "${DB_USERNAME:-erp_user}" >/dev/null 2>&1; then
      _pg_transport_die "PG_TRANSPORT=compose: the 'postgres' service in ../docker-compose.yml did not answer pg_isready. Start it with 'docker compose up -d postgres', or set PG_TRANSPORT=tcp to use host psql/pg_dump."
    fi

    # NOTE: no -h/-p here. The connection is container-local, and adding host
    # flags would break every local run.
    pg_psql() {
      docker compose -f ../docker-compose.yml exec -T postgres psql "$@"
    }
    pg_dump_db() {
      docker compose -f ../docker-compose.yml exec -T postgres pg_dump "$@"
    }
    ;;

  tcp)
    command -v psql >/dev/null 2>&1 \
      || _pg_transport_die "PG_TRANSPORT=tcp requires psql on PATH. Install postgresql-client-18."
    command -v pg_dump >/dev/null 2>&1 \
      || _pg_transport_die "PG_TRANSPORT=tcp requires pg_dump on PATH. Install postgresql-client-18."
    _pg_transport_require_client_major_18
    _pg_transport_export_pgvars

    # Plain invocation, NOT `exec`. `exec psql` inside a function replaces the
    # gate script process, so the script would never reach its diff, its
    # positive index assertions, or its trap cleanup — and would exit with the
    # client's status, which reads as a pass.
    pg_psql() {
      psql "$@"
    }
    pg_dump_db() {
      pg_dump "$@"
    }
    ;;

  *)
    _pg_transport_die "PG_TRANSPORT must be 'compose' or 'tcp', got '$PG_TRANSPORT'."
    ;;
esac
