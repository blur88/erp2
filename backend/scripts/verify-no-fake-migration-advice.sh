#!/usr/bin/env bash
#
# Rejects `--fake` in tracked files (#1466). TypeORM's `migration:run --fake`
# records every pending migration as applied without running it, so advice to
# run it skips real schema and data changes. Each permitted occurrence is
# allow-listed as an exact file and line, so new advice in the same file fails.

set -euo pipefail

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_DIR="$(cd "$REPO_DIR" && pwd)"

PATTERN='--fake'

# path<TAB>exact line text
ALLOWED_LINES=(
  # The guide owns the warning against the flag.
  $'docs/modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md\t`migration:run --fake` with the full migration configuration: that command records'
  # Applied migrations are frozen; this comment records PR #955's history.
  $'backend/src/database/migrations/1785400000000-RemoveStaleVendorPaymentDocumentNumber.ts\t        // runs `migration:run --fake`, which records genesis as applied without'
  # The entrypoint test asserts the diagnostic omits the flag.
  $'backend/scripts/__tests__/docker-entrypoint.bats\t  [[ "$output" != *--fake* ]]'
)

is_allowed() {
  local entry
  for entry in "${ALLOWED_LINES[@]}"; do
    [ "$entry" = "$1"$'\t'"$2" ] && return 0
  done
  return 1
}

found=0

while IFS= read -r -d '' path; do
  case "$path" in
    # Historical and local-only documentation.
    docs/archive/* | docs/superpowers/*) continue ;;
    # This guard's own pattern, allow-list and fixtures name the flag.
    backend/scripts/verify-no-fake-migration-advice.sh | backend/scripts/__tests__/no-fake-migration-advice.bats) continue ;;
  esac
  [ -f "$REPO_DIR/$path" ] || continue

  while IFS= read -r hit; do
    line_number="${hit%%:*}"
    text="${hit#*:}"
    is_allowed "$path" "$text" && continue
    printf '%s:%s: %s\n' "$path" "$line_number" "$text" >&2
    found=1
  done < <(grep -n -I -F -e "$PATTERN" "$REPO_DIR/$path" || true)
done < <(git -C "$REPO_DIR" ls-files -z)

if [ "$found" -ne 0 ]; then
  printf '%s\n' 'Point operators to docs/modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md, section "Existing database": --fake records every pending migration as applied without running it (#1466).' >&2
  exit 1
fi
