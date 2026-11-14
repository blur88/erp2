#!/usr/bin/env bash
# Check PR commits and description using the shared hook rules (#1832).
# Run from the repository root with the pull_request event JSON path.
set -euo pipefail

event_file="${1:?Usage: check-pr-attribution.sh EVENT_JSON}"
base_sha=$(jq -er '.pull_request.base.sha' "$event_file")
head_sha=$(jq -er '.pull_request.head.sha' "$event_file")
# Validate before using event fields as git revision arguments.
[[ "$base_sha" =~ ^[0-9a-f]{40}$ && "$head_sha" =~ ^[0-9a-f]{40}$ ]]

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
jq -r '.pull_request.body // ""' "$event_file" > "$work_dir/message"
failed=0
if ! sh .githooks/commit-msg "$work_dir/message"; then
  echo "Prohibited attribution in PR description." >&2
  failed=1
fi

# Materialize the list first so a missing revision cannot silently pass.
git rev-list "$base_sha..$head_sha" > "$work_dir/commits"
while IFS= read -r commit; do
  git show -s --format=%B "$commit" > "$work_dir/message"
  if ! sh .githooks/commit-msg "$work_dir/message"; then
    echo "Prohibited attribution in commit $commit." >&2
    failed=1
  fi
done < "$work_dir/commits"
exit "$failed"
