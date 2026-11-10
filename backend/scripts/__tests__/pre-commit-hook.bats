#!/usr/bin/env bats
#
# Guard for the tracked pre-commit hook: commits on main are refused, so work
# lands through a branch and a PR. A first implementation of #1429 was
# committed straight onto local main with nothing to stop it.
#
# Each case runs the REAL hook through `git commit` in a throwaway repo whose
# core.hooksPath points at a copy of .githooks, exactly as a configured clone.

HOOK="$BATS_TEST_DIRNAME/../../../.githooks/pre-commit"

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/.githooks"
  cp "$HOOK" "$REPO/.githooks/pre-commit"
  cd "$REPO"
  git init -q -b main
  git config user.email hook@test.invalid
  git config user.name hook-test
  git config core.hooksPath .githooks
  echo one > file.txt
  git add file.txt
}

commit() {
  run git commit -q -m "$1"
}

stub_lint() {
  mkdir -p "$REPO/bin" "$REPO/backend"
  cat > "$REPO/bin/npm" <<'EOF'
#!/bin/sh
# Records where lint ran and what it saw; fails on staged "broken" source.
printf '%s\n' "$PWD" "$*" "$(readlink node_modules)" > "$REPO/lint-call"
if grep -q broken src/a.ts 2>/dev/null; then exit 1; fi
exit "${LINT_STATUS:-0}"
EOF
  chmod +x "$REPO/bin/npm"
  export REPO
  export PATH="$REPO/bin:$PATH"
}

@test "refuses a commit on main and names the fix" {
  commit "on main"

  [ "$status" -ne 0 ]
  [[ "$output" == *"commits on main are refused"* ]]
  [[ "$output" == *"git switch -c"* ]]
  run git rev-list --all --count
  [ "$output" -eq 0 ]
}

@test "allows a commit on a branch" {
  git switch -q -c feat/1-example
  commit "on branch"

  [ "$status" -eq 0 ]
  run git rev-list --count HEAD
  [ "$output" -eq 1 ]
}

@test "allows a commit on a detached HEAD, as during a rebase" {
  git switch -q -c seed
  commit "seed"
  [ "$status" -eq 0 ]
  git switch -q --detach
  echo two > file.txt
  git add file.txt
  commit "detached"

  [ "$status" -eq 0 ]
  run git rev-list --count HEAD
  [ "$output" -eq 2 ]
}

@test "chains a clone-local pre-commit hook and keeps its verdict" {
  git switch -q -c feat/1-example
  printf '#!/bin/sh\necho local-hook-ran >&2\nexit 1\n' > .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit
  commit "blocked by local hook"

  [ "$status" -ne 0 ]
  [[ "$output" == *"local-hook-ran"* ]]
  run git rev-list --all --count
  [ "$output" -eq 0 ]
}

@test "staged ESLint config lints a staged snapshot without fixes and chains local hook" {
  git switch -q -c feat/1-example
  stub_lint
  echo 'export default [];' > backend/eslint.config.mjs
  git add backend/eslint.config.mjs
  printf '#!/bin/sh\necho local-hook-ran >&2\n' > .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit

  commit "lint config"

  [ "$status" -eq 0 ]
  snap_dir=$(sed -n 1p lint-call)
  [ "$snap_dir" != "$REPO/backend" ]
  [ "$(sed -n 2p lint-call)" = 'run lint -- --no-fix' ]
  [ "$(sed -n 3p lint-call)" = "$REPO/backend/node_modules" ]
  [ ! -e "$snap_dir" ]
  [[ "$output" == *"local-hook-ran"* ]]
}

@test "lint sees the staged file, not a fix left unstaged in the working tree" {
  git switch -q -c feat/1-example
  stub_lint
  mkdir -p backend/src
  echo broken > backend/src/a.ts
  git add backend/src/a.ts
  git commit -q -m seed --no-verify
  echo 'export default [];' > backend/eslint.config.mjs
  git add backend/eslint.config.mjs
  echo fixed > backend/src/a.ts

  commit "config ahead of its fix"

  [ "$status" -ne 0 ]
  run git rev-list --count HEAD
  [ "$output" -eq 1 ]
}

@test "lint failure blocks a config commit before the local hook" {
  git switch -q -c feat/1-example
  stub_lint
  export LINT_STATUS=1
  echo 'export default [];' > backend/eslint.config.mjs
  git add backend/eslint.config.mjs
  printf '#!/bin/sh\necho local-hook-ran >&2\n' > .git/hooks/pre-commit
  chmod +x .git/hooks/pre-commit

  commit "bad lint config"

  [ "$status" -ne 0 ]
  [ -f lint-call ]
  [[ "$output" != *"local-hook-ran"* ]]
  run git rev-list --all --count
  [ "$output" -eq 0 ]
}

@test "unstaged ESLint config does not trigger lint for an unrelated commit" {
  git switch -q -c feat/1-example
  stub_lint
  echo 'export default [];' > backend/eslint.config.mjs

  commit "unrelated change"

  [ "$status" -eq 0 ]
  [ ! -e lint-call ]
}
