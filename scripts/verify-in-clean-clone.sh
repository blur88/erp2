#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  echo 'Usage: scripts/verify-in-clean-clone.sh <command…>' >&2
  exit 2
fi

repo=$(git rev-parse --show-toplevel)
if [ -n "$(git -C "$repo" status --porcelain --untracked-files=all)" ]; then
  echo 'Refusing to verify a dirty working tree: commit or stash uncommitted changes first; the clone tests HEAD only.' >&2
  exit 2
fi

temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Git decodes percent escapes in file URLs; preserve literal percent signs.
repo_url=$(printf '%s\n' "$repo" | sed 's/%/%25/g')
git clone --depth 1 "file://$repo_url" "$temporary/repo"
cd "$temporary/repo"
printf 'Cloned SHA: %s\n' "$(git rev-parse HEAD)"
printf 'Shallow: %s\n' "$(git rev-parse --is-shallow-repository)"
(cd backend && npm ci)
"$@"
