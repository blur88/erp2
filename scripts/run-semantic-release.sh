#!/usr/bin/env bash
set -euo pipefail

output=$(mktemp)
trap 'rm -f "$output"' EXIT
# Disable errexit while collecting the release command's pipeline status.
set +e
npx semantic-release 2>&1 | tee "$output"
exit_code=${PIPESTATUS[0]}
set -e
version=$(sed -nE 's/.*Published release ([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' "$output" | tail -1)
if [ "$exit_code" -eq 0 ] && [ -n "$version" ]; then
  echo 'new_release_published=true' >> "$GITHUB_OUTPUT"
  echo "new_release_version=$version" >> "$GITHUB_OUTPUT"
else
  echo 'new_release_published=false' >> "$GITHUB_OUTPUT"
  echo 'new_release_version=' >> "$GITHUB_OUTPUT"
fi
exit "$exit_code"
