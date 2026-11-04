#!/usr/bin/env bash
# Reject single-line JSON over 1024 bytes under docs/.
# Exclude docs/archive/ (historical files); Bats pins the limit and exclusion.
set -euo pipefail
export LC_ALL=C

MAX_SINGLE_LINE_JSON_BYTES=1024
REPO_DIR="${1:-$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_DIR="$(git -C "$REPO_DIR" rev-parse --show-toplevel)"
DOCS_DIR="$REPO_DIR/docs"

if [[ ! -d "$DOCS_DIR" ]]; then
  printf 'docs directory not found: %s\n' "$DOCS_DIR" >&2
  exit 1
fi

json_files="$(mktemp)"
trap 'rm -f -- "$json_files"' EXIT
find "$DOCS_DIR" \
  -type d -path "$DOCS_DIR/archive" -prune -o \
  \( -type f -o -type l \) -name '*.json' -print0 > "$json_files"

found=0
while IFS= read -r -d '' path; do
  bytes="$(wc -c < "$path")"
  if (( bytes <= MAX_SINGLE_LINE_JSON_BYTES )); then
    continue
  fi

  lines="$(awk 'END { print NR }' "$path")"
  if (( lines == 1 )); then
    relative_path="${path#"$REPO_DIR"/}"
    printf '%s: single-line JSON exceeds %s bytes\n' \
      "$relative_path" "$MAX_SINGLE_LINE_JSON_BYTES"
    found=1
  fi
done < "$json_files"

exit "$found"
