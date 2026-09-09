#!/usr/bin/env bash
# Verifies the RESOLVED print-gate compose config is fully isolated (#1214).
#
# Asserts against `config` output, not the source files: overrides merge, and
# only the resolved result proves what would actually run.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -p erp_print_gate
  -f docker-compose.yml -f docker-compose.print-gate.yml)

resolved="$("${COMPOSE[@]}" config)"
status=0
fail() { echo "::error::$1" >&2; status=1; }

# 1. No fixed container names — they override the project prefix.
if echo "$resolved" | grep -qE '^\s+container_name:\s*erp_'; then
  fail "resolved config keeps a shared container_name: $(echo "$resolved" | grep -E '^\s+container_name:\s*erp_' | tr -d ' ' | paste -sd, -)"
fi

# 2. No shared :latest image tags.
if echo "$resolved" | grep -qE 'image:\s*erp-(backend|frontend|nginx):latest'; then
  fail "resolved config would build/overwrite a shared :latest image tag"
fi

# 3. No writable bind mount outside the gate's own directory.
#    database/init is read-only (:ro) and shared deliberately.
bad_binds="$(echo "$resolved" \
  | grep -oE 'source:\s*/[^[:space:]]+' \
  | awk '{print $2}' \
  | grep -vE "/\.print-gate-data(/|$)" \
  | grep -vE "/database/init$" || true)"
if [ -n "$bad_binds" ]; then
  fail "writable bind path outside .print-gate-data: $(echo "$bad_binds" | paste -sd, -)"
fi

# 4. No host port collides with the dev stack's published ports.
published="$(echo "$resolved" | grep -oE 'published:\s*"?[0-9]+' | grep -oE '[0-9]+' | sort -u)"
for p in $published; do
  case "$p" in
    80|443|3000|3001|5432|6379)
      fail "host port $p collides with the dev stack; use a gate-specific port" ;;
  esac
done

# 5. nginx must not be part of the gate's service set.
if echo "$resolved" | grep -qE '^  nginx:'; then
  echo "note: nginx is defined in the merged config; the CI job MUST select" >&2
  echo "      services explicitly (postgres redis backend frontend)." >&2
fi

if [ "$status" -eq 0 ]; then
  echo "print-gate compose isolation: OK"
  echo "published host ports: $(echo "$published" | paste -sd, -)"
fi
exit "$status"
