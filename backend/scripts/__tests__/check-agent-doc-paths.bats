#!/usr/bin/env bats
# Guard repository paths and Markdown pointers in agent guidance (#1705).

load helpers/load

setup() {
  reset_developer_env
  CHECKER="${BATS_TEST_DIRNAME}/../check-agent-doc-paths.mjs"
  REPO_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FIXTURE="${BATS_TEST_TMPDIR}/repo"
  mkdir -p "$FIXTURE/docs/topic" "$FIXTURE/backend/src"
  printf '# Agent guidance\n' > "$FIXTURE/AGENTS.md"
  printf '# Claude guidance\n' > "$FIXTURE/CLAUDE.md"
  git init -q "$FIXTURE"
}

run_checker() {
  git -C "$FIXTURE" add -A
  run node "$CHECKER" "$FIXTURE"
}

@test "all repository agent pointers exist" {
  run node "$CHECKER" "$REPO_DIR"
  [ "$status" -eq 0 ]
}

@test "a missing backticked path in CLAUDE.md fails with its source" {
  printf '\n`backend/src/missing.ts:42`\n' >> "$FIXTURE/CLAUDE.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"CLAUDE.md: missing path backend/src/missing.ts:42"* ]]
}

@test "a missing Markdown target fails" {
  printf '\n[topic](docs/missing.md)\n' >> "$FIXTURE/AGENTS.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"AGENTS.md: missing path docs/missing.md"* ]]
}

@test "a missing cross-document heading fails" {
  printf '\n[topic](docs/topic/guide.md#absent)\n' >> "$FIXTURE/CLAUDE.md"
  printf '# Present\n' > "$FIXTURE/docs/topic/guide.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing anchor #absent in docs/topic/guide.md"* ]]
}

@test "a broken link in a recursively reachable topic fails" {
  printf '\n[topic](docs/topic/guide.md)\n' >> "$FIXTURE/CLAUDE.md"
  printf '[next](../next.md)\n' > "$FIXTURE/docs/topic/guide.md"
  printf '[broken](missing.md)\n' > "$FIXTURE/docs/next.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"docs/next.md: missing path missing.md"* ]]
}

@test "relative links, same-document anchors, duplicate headings and cycles pass" {
  cat >> "$FIXTURE/CLAUDE.md" <<'DOC'
[topic](docs/topic/guide.md#hello-world)
DOC
  cat > "$FIXTURE/docs/topic/guide.md" <<'DOC'
# Hello **world**
[here](#hello-world)
[duplicate](#hello-world-1)
[back](../../CLAUDE.md#claude-guidance)
[next][reference]
[reference]: ../next.md#setext-heading
# Hello world
DOC
  printf 'Setext heading\n==============\n[cycle](topic/guide.md)\n' > "$FIXTURE/docs/next.md"
  run_checker
  [ "$status" -eq 0 ]
  [[ "$output" == *"4 agent documents"* ]]
}

@test "a missing same-document heading fails" {
  printf '\n[here](#absent)\n' >> "$FIXTURE/AGENTS.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing anchor #absent in AGENTS.md"* ]]
}

@test "line suffixes, globs, placeholders, external links and exact allowlist entries are handled" {
  mkdir -p "$FIXTURE/backend/scripts"
  printf "frontend/e2e\nplaywright.config.ts\n" > "$FIXTURE/backend/scripts/agent-doc-paths.allowlist"
  touch "$FIXTURE/backend/src/present.ts"
  cat >> "$FIXTURE/CLAUDE.md" <<'DOC'
`backend/src/present.ts:5-10`
`backend/src/**/*.ts`
`backend/src/<module>/file.ts`
`frontend/e2e/`
`playwright.config.ts`
[external](https://example.invalid/missing.md#absent)
[mail](mailto:example@example.invalid)
[glob](docs/*.md)
[placeholder](docs/<topic>.md)
[encoded](docs/topic/space%20name.md#hello-world)
DOC
  printf '# Hello world\n' > "$FIXTURE/docs/topic/space name.md"
  run_checker
  [ "$status" -eq 0 ]
}

@test "allowlisted directory does not hide other missing files" {
  mkdir -p "$FIXTURE/backend/scripts"
  printf "frontend/e2e\n" > "$FIXTURE/backend/scripts/agent-doc-paths.allowlist"
  printf '\n`frontend/e2e/new-missing.spec.ts`\n' >> "$FIXTURE/CLAUDE.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path frontend/e2e/new-missing.spec.ts"* ]]
}

@test "code fences do not introduce pointers or heading anchors" {
  cat >> "$FIXTURE/CLAUDE.md" <<'DOC'
```md
`backend/src/example.ts`
[example](missing.md)
# Example heading
```
[bad](#example-heading)
DOC
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing anchor #example-heading"* ]]
  [[ "$output" != *"missing path"* ]]
}

@test "dot-prefixed repository paths are checked" {
  printf '\n`./backend/src/missing.ts`\n' >> "$FIXTURE/CLAUDE.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path ./backend/src/missing.ts"* ]]
}

@test "missing root JSON files are checked" {
  printf '\n`package-does-not-exist.json`\n' >> "$FIXTURE/CLAUDE.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path package-does-not-exist.json"* ]]
}

@test "paths outside the familiar repository directories are checked" {
  printf '\n`tools/missing-checker.mjs`\n' >> "$FIXTURE/CLAUDE.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path tools/missing-checker.mjs"* ]]
}

@test "unqualified app configuration names must exist in an app root" {
  printf '\n`tsconfig.build.json`\n' >> "$FIXTURE/CLAUDE.md"
  printf '{}\n' > "$FIXTURE/backend/tsconfig.build.json"
  run_checker
  [ "$status" -eq 0 ]
  rm "$FIXTURE/backend/tsconfig.build.json"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path tsconfig.build.json"* ]]
}

@test "explicit dot paths include root source files and extensionless directories" {
  for reference in ./missing.ts ./tools/missing-directory; do
    printf '# Claude guidance\n`%s`\n' "$reference" > "$FIXTURE/CLAUDE.md"
    run_checker
    [ "$status" -eq 1 ]
    [[ "$output" == *"missing path $reference"* ]]
  done
}

@test "root scripts, uppercase directories and root build files are checked" {
  for reference in scripts/missing-root-script.cjs Tools/missing.txt Dockerfile missing.toml; do
    printf '# Claude guidance\n`%s`\n' "$reference" > "$FIXTURE/CLAUDE.md"
    run_checker
    [ "$status" -eq 1 ]
    [[ "$output" == *"missing path $reference"* ]]
  done
}

@test "inline code and comments do not introduce Markdown links" {
  cat >> "$FIXTURE/CLAUDE.md" <<'DOC'
`[x](nope.md)`
``[x](also-nope.md)``
<!-- [x](missing.md) `backend/missing.ts` -->
DOC
  run_checker
  [ "$status" -eq 0 ]
}

@test "heading links contribute only visible text to anchors" {
  cat >> "$FIXTURE/CLAUDE.md" <<'DOC'
## See [the guide](AGENTS.md)
[heading](#see-the-guide)
DOC
  run_checker
  [ "$status" -eq 0 ]
}

@test "fixtures do not inherit repository allowlist entries" {
  printf '\n`frontend/e2e`\n' >> "$FIXTURE/CLAUDE.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path frontend/e2e"* ]]
}

@test "a stray backtick cannot hide a broken link on a later line" {
  cat >> "$FIXTURE/CLAUDE.md" <<'DOC'
Use a ` here.

[x](missing.md)

A later ` closes nothing on the earlier line.
DOC
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"CLAUDE.md: missing path missing.md"* ]]
}

@test "an existing untracked file cannot satisfy a repository pointer" {
  printf '\n`backend/src/local-only.json`\n' >> "$FIXTURE/CLAUDE.md"
  git -C "$FIXTURE" add -A
  printf '{}\n' > "$FIXTURE/backend/src/local-only.json"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path backend/src/local-only.json"* ]]
}

@test "tracked directory prefixes pass but untracked subdirectories fail" {
  printf '{}\n' > "$FIXTURE/backend/src/present.json"
  printf '\n`backend/src/`\n' >> "$FIXTURE/CLAUDE.md"
  run_checker
  [ "$status" -eq 0 ]
  mkdir "$FIXTURE/backend/src/local-only"
  printf '\n`backend/src/local-only/`\n' >> "$FIXTURE/CLAUDE.md"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path backend/src/local-only/"* ]]
}

@test "an untracked root file cannot mask a missing app configuration" {
  printf '\n`tsconfig.build.json`\n' >> "$FIXTURE/CLAUDE.md"
  git -C "$FIXTURE" add -A
  printf '{}\n' > "$FIXTURE/tsconfig.build.json"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path tsconfig.build.json"* ]]
}

@test "removing an inner comment cannot expose a link inside a reconstructed comment" {
  cat >> "$FIXTURE/CLAUDE.md" <<'DOC'
<!<!-- inner -->-- [hidden](missing.md) -->
DOC
  run_checker
  [ "$status" -eq 0 ]
}

@test "heading HTML tags are removed without losing visible heading text" {
  cat >> "$FIXTURE/CLAUDE.md" <<'DOC'
## See <em>the <strong>guide</strong></em>
[heading](#see-the-guide)
DOC
  run_checker
  [ "$status" -eq 0 ]
  printf '\n[bad](#see-the-wrong-guide)\n' >> "$FIXTURE/CLAUDE.md"
  run_checker
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing anchor #see-the-wrong-guide"* ]]
}

@test "environment reset isolates fixtures without installing stubs" {
  local original_path="$PATH"
  export PGHOST=foreign PGPORT=1234 PGUSER=foreign PGPASSWORD=foreign PGDATABASE=foreign
  export GIT_DIR=/missing/repo GIT_WORK_TREE=/missing/tree
  export GIT_INDEX_FILE="${BATS_TEST_TMPDIR}/unrelated-index"
  export GIT_COMMON_DIR=/missing/common GIT_OBJECT_DIRECTORY=/missing/objects
  export GIT_ALTERNATE_OBJECT_DIRECTORIES=/missing/alternates
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.bare GIT_CONFIG_VALUE_0=true
  setup
  [ "$PATH" = "$original_path" ]
  for variable in PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG_COUNT; do
    [ -z "${!variable+x}" ]
  done
  run_checker
  [ "$status" -eq 0 ]
  [ ! -e "${BATS_TEST_TMPDIR}/unrelated-index" ]
  [[ "$output" == *"2 agent documents"* ]]
}

@test "a non-repository root reports a one-line setup error" {
  local directory="${BATS_TEST_TMPDIR}/not-a-repo"
  mkdir "$directory"
  run node "$CHECKER" "$directory"
  [ "$status" -eq 2 ]
  [ "$output" = "not a Git repository root: $directory" ]
}

@test "a repository subdirectory reports a setup error" {
  run node "$CHECKER" "$FIXTURE/docs"
  [ "$status" -eq 2 ]
  [ "$output" = "not a Git repository root: $FIXTURE/docs" ]
}

@test "missing git reports a one-line setup error" {
  local node_binary
  node_binary="$(command -v node)"
  mkdir "${BATS_TEST_TMPDIR}/empty-bin"
  PATH="${BATS_TEST_TMPDIR}/empty-bin" run "$node_binary" "$CHECKER" "$FIXTURE"
  [ "$status" -eq 2 ]
  [ "$output" = "git not found" ]
}

@test "a symlink to a repository root passes" {
  git -C "$FIXTURE" add -A
  ln -s "$FIXTURE" "${BATS_TEST_TMPDIR}/linked-repo"
  run node "$CHECKER" "${BATS_TEST_TMPDIR}/linked-repo"
  [ "$status" -eq 0 ]
}

@test "a nonexistent root reports a one-line setup error" {
  run node "$CHECKER" "${BATS_TEST_TMPDIR}/missing"
  [ "$status" -eq 2 ]
  [ "$output" = "not a Git repository root: ${BATS_TEST_TMPDIR}/missing" ]
}

@test "an unreadable index reports a one-line setup error" {
  printf 'invalid index' > "$FIXTURE/.git/index"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 2 ]
  [ "$output" = "cannot read Git index: $FIXTURE" ]
}

@test "setup diagnostics stay on one line for paths containing newlines" {
  local directory="$FIXTURE/"$'line\nbreak'
  mkdir "$directory"
  run node "$CHECKER" "$directory"
  [ "$status" -eq 2 ]
  [ "$output" = "not a Git repository root: $FIXTURE/line break" ]
}
