#!/usr/bin/env bats

setup() {
  CHECKER="${BATS_TEST_DIRNAME}/../check-agent-doc-paths.mjs"
  REPO_DIR="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FIXTURE="${BATS_TEST_TMPDIR}/repo"
  mkdir -p "$FIXTURE/docs/topic" "$FIXTURE/backend/src"
  printf '# Agent guidance\n' > "$FIXTURE/AGENTS.md"
  printf '# Claude guidance\n' > "$FIXTURE/CLAUDE.md"
}

@test "all repository agent pointers exist" {
  run node "$CHECKER" "$REPO_DIR"
  [ "$status" -eq 0 ]
}

@test "a missing backticked path in CLAUDE.md fails with its source" {
  printf '\n`backend/src/missing.ts:42`\n' >> "$FIXTURE/CLAUDE.md"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"CLAUDE.md: missing path backend/src/missing.ts:42"* ]]
}

@test "a missing Markdown target fails" {
  printf '\n[topic](docs/missing.md)\n' >> "$FIXTURE/AGENTS.md"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"AGENTS.md: missing path docs/missing.md"* ]]
}

@test "a missing cross-document heading fails" {
  printf '\n[topic](docs/topic/guide.md#absent)\n' >> "$FIXTURE/CLAUDE.md"
  printf '# Present\n' > "$FIXTURE/docs/topic/guide.md"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing anchor #absent in docs/topic/guide.md"* ]]
}

@test "a broken link in a recursively reachable topic fails" {
  printf '\n[topic](docs/topic/guide.md)\n' >> "$FIXTURE/CLAUDE.md"
  printf '[next](../next.md)\n' > "$FIXTURE/docs/topic/guide.md"
  printf '[broken](missing.md)\n' > "$FIXTURE/docs/next.md"
  run node "$CHECKER" "$FIXTURE"
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
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"4 agent documents"* ]]
}

@test "a missing same-document heading fails" {
  printf '\n[here](#absent)\n' >> "$FIXTURE/AGENTS.md"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing anchor #absent in AGENTS.md"* ]]
}

@test "line suffixes, globs, placeholders, external links and exact allowlist entries are handled" {
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
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 0 ]
}

@test "allowlisted directory does not hide other missing files" {
  printf '\n`frontend/e2e/new-missing.spec.ts`\n' >> "$FIXTURE/CLAUDE.md"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
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
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing anchor #example-heading"* ]]
  [[ "$output" != *"missing path"* ]]
}

@test "dot-prefixed repository paths are checked" {
  printf '\n`./backend/src/missing.ts`\n' >> "$FIXTURE/CLAUDE.md"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path ./backend/src/missing.ts"* ]]
}

@test "missing root JSON files are checked" {
  printf '\n`package-does-not-exist.json`\n' >> "$FIXTURE/CLAUDE.md"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path package-does-not-exist.json"* ]]
}

@test "paths outside the familiar repository directories are checked" {
  printf '\n`tools/missing-checker.mjs`\n' >> "$FIXTURE/CLAUDE.md"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path tools/missing-checker.mjs"* ]]
}

@test "unqualified app configuration names must exist in an app root" {
  printf '\n`tsconfig.build.json`\n' >> "$FIXTURE/CLAUDE.md"
  printf '{}\n' > "$FIXTURE/backend/tsconfig.build.json"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 0 ]
  rm "$FIXTURE/backend/tsconfig.build.json"
  run node "$CHECKER" "$FIXTURE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"missing path tsconfig.build.json"* ]]
}

@test "explicit dot paths include root source files and extensionless directories" {
  for reference in ./missing.ts ./tools/missing-directory; do
    printf '# Claude guidance\n`%s`\n' "$reference" > "$FIXTURE/CLAUDE.md"
    run node "$CHECKER" "$FIXTURE"
    [ "$status" -eq 1 ]
    [[ "$output" == *"missing path $reference"* ]]
  done
}
