#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
expect_blocked() {
  remedy=$1
  shift
  if "$@" >"$tmp/output" 2>&1; then
    echo "FAIL: command was allowed: $*" >&2
    exit 1
  fi
  if ! grep -Fq "$remedy" "$tmp/output"; then
    cat "$tmp/output" >&2
    echo "FAIL: missing remedy: $remedy" >&2
    exit 1
  fi
}
git init -q --initial-branch=main "$tmp/work"
git init -q --bare "$tmp/remote"
cd "$tmp/work"
git config user.name 'Hook Test'
git config user.email 'hooks@example.invalid'
cp -R "$root/.githooks" .githooks
git config core.hooksPath .githooks
expect_blocked 'git switch -c <branch>' git commit --allow-empty -m blocked
git switch -q -c feature
git commit -q --allow-empty -m allowed
git remote add origin "$tmp/remote"
git push -q origin feature
expect_blocked 'open a PR' git push origin feature:main
git branch main
expect_blocked 'open a PR' git push origin main
# Check every ref, including a protected destination after an allowed one.
printf 'refs/heads/feature abc refs/heads/feature def\nrefs/heads/feature abc refs/heads/main def\n' |
  expect_blocked 'open a PR' .githooks/pre-push
# Seed remote main directly so deletion must reach the hook.
git --git-dir="$tmp/remote" update-ref refs/heads/main "$(git rev-parse feature)"
expect_blocked 'open a PR' git push --delete origin main
git checkout -q --detach
before=$(git rev-parse HEAD)
git commit -q --allow-empty -m detached
test "$(git rev-parse HEAD^)" = "$before"
test "$(git log -1 --format=%s)" = detached
printf 'PASS: commit and push guards\n'
