#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REPO_DIR="$(git -C "$REPO_DIR" rev-parse --show-toplevel)"
CLAUDE_DOC_NAME='CLAUDE''.md'
GITIGNORE_IMPORT_NOTE="# NOTE: ${CLAUDE_DOC_NAME} is NOT ignored - it imports AGENTS.md, the authoritative project instructions"
GITIGNORE_PROJECT_NOTE="# - ${CLAUDE_DOC_NAME} (project instructions)"
found=0

while IFS= read -r -d '' file; do
  case "$file" in
    "$CLAUDE_DOC_NAME"|docs/*) continue ;;
  esac

  if matches="$(grep -nI -F -- "$CLAUDE_DOC_NAME" "$REPO_DIR/$file")"; then
    while IFS=: read -r line_number line; do
      case "$file:$line" in
        .gitignore:"$GITIGNORE_IMPORT_NOTE"|.gitignore:"$GITIGNORE_PROJECT_NOTE") continue ;;
        .dockerignore:"$CLAUDE_DOC_NAME"|*/.dockerignore:"$CLAUDE_DOC_NAME") continue ;;
      esac

      printf '%s:%s:%s\n' "$file" "$line_number" "$line" >&2
      found=1
    done <<< "$matches"
  fi
done < <(git -C "$REPO_DIR" ls-files -z)

if [ "$found" -ne 0 ]; then
  printf '%s is only an instruction-file importer; cite AGENTS.md as the documentation source.\n' "$CLAUDE_DOC_NAME" >&2
  exit 1
fi
