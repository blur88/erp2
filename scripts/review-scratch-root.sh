#!/bin/sh
(
  common=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1
  layout=$(git config --local --get review.scratchRoot || true)
  if [ -z "$layout" ]; then
    top=$(git rev-parse --show-toplevel 2>/dev/null || true)
    if [ -n "$top" ] && [ "$common" = "$top/.git" ] && [ -d "$top/.git" ]; then
      layout=../.scratch
    elif [ "$(git rev-parse --path-format=absolute --git-dir)" != "$common" ]; then
      echo 'Initialize review.scratchRoot from the primary checkout or bare repository first.' >&2
      exit 1
    else
      layout=review-scratch
    fi
    git config --local review.scratchRoot "$layout" || exit 1
  fi
  case "$layout" in
    ../.scratch) scratch="$(dirname "$common")/.scratch" ;;
    review-scratch) scratch="$common/review-scratch" ;;
    *) echo 'Unsupported review.scratchRoot; reset it from the primary location.' >&2; exit 1 ;;
  esac
  printf '%s\n' "$scratch"
)
