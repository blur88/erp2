#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
git init -q --initial-branch=main "$tmp/work"
git init -q --bare "$tmp/remote"
cd "$tmp/work"
git config user.name 'Hook Test'
git config user.email 'hooks@example.invalid'
cp -R "$root/.githooks" .githooks
git config core.hooksPath .githooks
if git commit --allow-empty -m blocked >"$tmp/output" 2>&1; then
  echo 'FAIL: main commit allowed'; exit 1
fi
grep -q 'git switch -c <branch>' "$tmp/output"
git switch -q -c feature
git commit -q --allow-empty -m allowed
git remote add origin "$tmp/remote"
git push -q origin feature
if git push origin feature:main >"$tmp/output" 2>&1; then
  echo 'FAIL: push targeting main allowed'; exit 1
fi
grep -q 'open a PR' "$tmp/output"
git branch main
if git push origin main >"$tmp/output" 2>&1; then
  echo 'FAIL: main push allowed'; exit 1
fi
grep -q 'open a PR' "$tmp/output"
# Check every ref, including a protected destination after an allowed one.
if printf 'refs/heads/feature abc refs/heads/feature def\nrefs/heads/feature abc refs/heads/main def\n' | "$root/.githooks/pre-push" >"$tmp/output" 2>&1; then
  echo 'FAIL: mixed push allowed'; exit 1
fi
# Seed remote main directly so deletion must reach the hook.
git --git-dir="$tmp/remote" update-ref refs/heads/main "$(git rev-parse feature)"
if git push --delete origin main >"$tmp/output" 2>&1; then
  echo 'FAIL: main deletion allowed'; exit 1
fi
grep -q 'open a PR' "$tmp/output"
git checkout -q --detach
before=$(git rev-parse HEAD)
git commit -q --allow-empty -m detached
test "$(git rev-parse HEAD^)" = "$before"
test "$(git log -1 --format=%s)" = detached
printf 'PASS: commit and push guards\n'
