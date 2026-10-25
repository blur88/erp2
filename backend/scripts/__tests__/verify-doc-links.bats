#!/usr/bin/env bats
# Scope: verify-doc-links CLI behavior and user-visible output (#1429).

load helpers/load

setup() {
  TEST_REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$TEST_REPO"
  git -C "$TEST_REPO" init -q
  git -C "$TEST_REPO" config user.email test@example.com
  git -C "$TEST_REPO" config user.name Test
  mkdir -p "$TEST_REPO/backend/scripts"
  cp "$SCRIPTS_DIR/verify-doc-links.mjs" "$TEST_REPO/backend/scripts/verify-doc-links.mjs"
  SCRIPT="$TEST_REPO/backend/scripts/verify-doc-links.mjs"
}

write_file() {
  mkdir -p "$(dirname "$TEST_REPO/$1")"
  cat > "$TEST_REPO/$1"
}

run_check() {
  git -C "$TEST_REPO" add -A
  run node "$SCRIPT"
}

@test "missing local link is reported with path and line" {
  write_file README.md <<'EOF'
[broken](missing.md)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"README.md:1: [broken](missing.md) — target does not exist"* ]]
  [[ "$output" != *"found on disk"* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "same-file and percent-encoded Unicode anchors are accepted" {
  write_file notes.md <<'EOF'
# Café

[same](#café) [encoded](#caf%C3%A9)
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"2 local links checked in 1 files"* ]]
}

@test "links in headings are checked" {
  write_file README.md <<'EOF'
# [broken heading link](missing.md)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"README.md:1: [broken heading link](missing.md) — target does not exist"* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "anchor matching is case-sensitive and suggests canonical casing" {
  write_file notes.md <<'EOF'
# Foo

[bad](#Foo)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'notes.md:3: [bad](#Foo) — anchor "#Foo" not found; use "#foo"'* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "missing anchor in a different Markdown target is reported" {
  write_file README.md <<'EOF'
[missing section](guide.md#missing-section)
EOF
  write_file guide.md <<'EOF'
# Available section
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'README.md:1: [missing section](guide.md#missing-section) — anchor "#missing-section" not found'* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 2 files (0 external skipped)"* ]]
}

@test "references support full, collapsed, shortcuts and definitions" {
  write_file README.md <<'EOF'
[full][ GUIDE   ] [guide][] [guide]

[guide]: target.md
EOF
  write_file target.md <<'EOF'
target
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"4 local links checked in 2 files"* ]]
}

@test "images and encoded filenames are checked as local links" {
  write_file 'space name.png' <<'EOF'
image
EOF
  write_file README.md <<'EOF'
![preview](<space name.png>) [encoded](space%20name.png)
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"2 local links checked in 1 files"* ]]
}

@test "Markdown source filenames with spaces and Unicode are scanned" {
  write_file 'my doc.md' <<'EOF'
# My doc

[notes](café%20notes.md#notes)
EOF
  write_file 'café notes.md' <<'EOF'
# Notes
EOF
  write_file README.md <<'EOF'
[document](my%20doc.md#my-doc)
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"2 local links checked in 3 files (0 external skipped)"* ]]
}

@test "undefined full and collapsed references are reported; shortcuts stay literal" {
  write_file README.md <<'EOF'
[bad][missing] [missing][] [!NOTE] [ ] [x] [...] [sic]
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"README.md:1: [bad][missing] — undefined reference"* ]]
  [[ "$output" == *"README.md:1: [missing][] — undefined reference"* ]]
  [[ "$output" == *"2 broken links, 0 local links checked in 1 files"* ]]
}

@test "inline code across lines and fenced examples are ignored" {
  write_file README.md <<'EOF'
`[ignored](missing.md)
continued`

```md
# Not a heading
[ignored](missing-too.md)
```

[live](target.md)
EOF
  write_file target.md <<'EOF'
target
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"1 local links checked in 2 files"* ]]
}

@test "headings inside fenced code produce no anchors" {
  write_file README.md <<'EOF'
```md
# Fenced only
```

[fenced](#fenced-only)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'README.md:5: [fenced](#fenced-only) — anchor "#fenced-only" not found'* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "unmatched backticks remain literal and indented fences follow closing rules" {
  write_file README.md <<'EOF'
` unmatched marker [live](target.md)

   ~~~md
[ignored](bad.md)
    ~~~
   ~~~~~
[also ignored](bad-too.md)
[live](target.md)
EOF
  write_file target.md <<'EOF'
target
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"README.md:7: [also ignored](bad-too.md) — target does not exist"* ]]
  [[ "$output" == *"1 broken link, 3 local links checked in 2 files"* ]]
}

@test "external URLs are skipped and absolute paths are rejected" {
  write_file README.md <<'EOF'
[web](https://example.com) [mail](mailto:a@example.com) [host](//example.com/a) [local](/etc/passwd)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'README.md:1: [local](/etc/passwd) — absolute paths are not allowed; use a relative path'* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (3 external skipped)"* ]]
}

@test "tracked targets and tracked directories pass, while prefix collisions do not" {
  write_file README.md <<'EOF'
[dir](docs) [file](LICENSE) [missing](docs/api)
EOF
  write_file docs/api-old/README.md <<'EOF'
not the requested directory
EOF
  write_file LICENSE <<'EOF'
license
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" != *"[dir](docs) —"* ]]
  [[ "$output" != *"[file](LICENSE) —"* ]]
  [[ "$output" == *"README.md:1: [missing](docs/api) — target does not exist"* ]]
  [[ "$output" == *"1 broken link, 3 local links checked in 2 files (0 external skipped)"* ]]
}

@test "directory fragments are not checked as Markdown anchors" {
  write_file README.md <<'EOF'
[present](docs/#overview) [missing](docs/#missing) [directory without README](other/#any)
EOF
  write_file docs/README.md <<'EOF'
# Overview
EOF
  write_file other/guide.md <<'EOF'
# Guide
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"3 local links checked in 3 files (0 external skipped)"* ]]
}

@test "non-Markdown fragments are not checked and an escaping path is rejected" {
  write_file docs/README.md <<'EOF'
[source](../src/a.ts#L12) [escape](../../outside.md)
EOF
  write_file src/a.ts <<'EOF'
export {};
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"docs/README.md:1: [escape](../../outside.md) — escapes repository"* ]]
  [[ "$output" == *"1 broken link, 2 local links checked in 1 files (0 external skipped)"* ]]
}

@test "setext headings produce anchors and thematic breaks do not" {
  write_file README.md <<'EOF'
Title
=====

Dash title
---

Unrelated prose

---

[good](#title) [dash](#dash-title) [bad](#unrelated-prose)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'README.md:11: [bad](#unrelated-prose) — anchor "#unrelated-prose" not found'* ]]
  [[ "$output" == *"1 broken link, 3 local links checked in 1 files (0 external skipped)"* ]]
}

@test "multi-line setext headings use all paragraph lines" {
  write_file README.md <<'EOF'
Line one
line two
---

[heading](#line-oneline-two)
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "a thematic break after a list item is not a setext heading" {
  write_file README.md <<'EOF'
- item
---

[phantom](#--item)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'README.md:4: [phantom](#--item) — anchor "#--item" not found'* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "inline HTML markup is removed when deriving heading slugs" {
  write_file README.md <<'EOF'
# <em>HTML</em> heading

[anchor](#html-heading)
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "underscores remain in heading slugs" {
  write_file README.md <<'EOF'
# my_var heading

[underscore](#my_var-heading)
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "footnote definitions and references are literal footnote syntax" {
  write_file README.md <<'EOF'
Text with a footnote[^1].

[^1]: See the docs.
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"0 local links checked in 1 files (0 external skipped)"* ]]
}

@test "footnote definition body links are still checked" {
  write_file README.md <<'EOF'
Text[^1].

[^1]: [broken](missing.md)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'README.md:3: [broken](missing.md) — target does not exist'* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "failures print in document order" {
  write_file README.md <<'EOF'
[early](missing-first.md)

[guide]: missing-later.md
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == $'README.md:1: [early](missing-first.md) — target does not exist\nREADME.md:3: [guide]: missing-later.md — target does not exist\n2 broken links, 2 local links checked in 1 files (0 external skipped)'* ]]
}

@test "duplicate headings and literal collision suffixes are unique" {
  write_file README.md <<'EOF'
# Foo
# Foo
# Foo-1

[first](#foo) [second](#foo-1) [literal](#foo-1-1) [too many](#foo-1-2)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'README.md:5: [too many](#foo-1-2) — anchor "#foo-1-2" not found'* ]]
  [[ "$output" == *"1 broken link, 4 local links checked in 1 files (0 external skipped)"* ]]
}

@test "captured GitHub slug corpus resolves through the CLI seam" {
  cp "$BATS_TEST_DIRNAME/fixtures/slugs.md" "$TEST_REPO/corpus.md"
  cp "$BATS_TEST_DIRNAME/fixtures/target.md" "$TEST_REPO/target.md"
  while IFS= read -r slug || [ -n "$slug" ]; do
    [[ "$slug" == \#* ]] && continue
    printf '[anchor](corpus.md#%s)\n' "$slug" >> "$TEST_REPO/README.md"
  done < "$BATS_TEST_DIRNAME/fixtures/slugs.expected"
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"16 local links checked in 3 files (0 external skipped)"* ]]
}

@test "slug near-misses include wrong case and an over-numbered duplicate" {
  cp "$BATS_TEST_DIRNAME/fixtures/slugs.md" "$TEST_REPO/corpus.md"
  cp "$BATS_TEST_DIRNAME/fixtures/target.md" "$TEST_REPO/target.md"
  write_file README.md <<'EOF'
[case](corpus.md#FOO) [suffix](corpus.md#foo-1-2)
[setext](corpus.md#line-one-line-two) [emoji](corpus.md#leading-emoji-heading)
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'README.md:1: [case](corpus.md#FOO) — anchor "#FOO" not found; use "#foo"'* ]]
  [[ "$output" == *'README.md:1: [suffix](corpus.md#foo-1-2) — anchor "#foo-1-2" not found'* ]]
  [[ "$output" == *'README.md:2: [setext](corpus.md#line-one-line-two) — anchor "#line-one-line-two" not found'* ]]
  [[ "$output" == *'README.md:2: [emoji](corpus.md#leading-emoji-heading) — anchor "#leading-emoji-heading" not found'* ]]
  [[ "$output" == *"4 broken links, 5 local links checked in 3 files (0 external skipped)"* ]]
}

@test "running outside the repository still finds root and rejects untracked targets" {
  write_file README.md <<'EOF'
[local](private.md)
EOF
  write_file private.md <<'EOF'
not staged
EOF
  git -C "$TEST_REPO" add README.md backend/scripts/verify-doc-links.mjs
  run env -C /tmp node "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"README.md:1: [local](private.md) — target does not exist in Git (found on disk but untracked or ignored; stage it with git add)"* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "running from a repository subdirectory still finds the repository root" {
  write_file README.md <<'EOF'
[local](private.md)
EOF
  write_file private.md <<'EOF'
not staged
EOF
  git -C "$TEST_REPO" add README.md backend/scripts/verify-doc-links.mjs
  run env -C "$TEST_REPO/backend" node "$SCRIPT"
  [ "$status" -eq 1 ]
  [[ "$output" == *"README.md:1: [local](private.md) — target does not exist"* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "gitignored targets are treated as untracked" {
  write_file .gitignore <<'EOF'
private.md
EOF
  write_file README.md <<'EOF'
[local](private.md)
EOF
  write_file private.md <<'EOF'
ignored
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *"README.md:1: [local](private.md) — target does not exist in Git (found on disk but untracked or ignored; stage it with git add)"* ]]
  [[ "$output" == *"1 broken link, 1 local links checked in 1 files (0 external skipped)"* ]]
}

@test "duplicate GLOSSARY.md terms fail, ignoring case, with both line numbers" {
  write_file GLOSSARY.md <<'EOF'
# Glossary

**Post**:
To write the journal entry.

**post**:
A second definition.
EOF
  run_check
  [ "$status" -eq 1 ]
  [[ "$output" == *'GLOSSARY.md:6: **post** — duplicate glossary term; first defined at line 3'* ]]
  [[ "$output" == *"1 duplicate glossary term, 0 local links checked in 1 files (0 external skipped)"* ]]
}

@test "distinct GLOSSARY.md terms pass; fenced and other-file repeats are not terms" {
  write_file GLOSSARY.md <<'EOF'
# Glossary

**Post**:
To write the journal entry.

**Posted**:
A state.

```md
**Post**:
An example, not a term.
```
EOF
  write_file README.md <<'EOF'
**Post**:
**Post**:
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" != *"duplicate glossary term"* ]]
  [[ "$output" == *"0 local links checked in 2 files (0 external skipped)"* ]]
}

@test "zero tracked Markdown files exits 2" {
  git -C "$TEST_REPO" add backend/scripts/verify-doc-links.mjs
  run node "$SCRIPT"
  [ "$status" -eq 2 ]
  [[ "$output" == *"zero Markdown files discovered"* ]]
}

@test "Markdown with no local links succeeds with zero checked" {
  write_file README.md <<'EOF'
Only prose and [a literal shortcut].
EOF
  run_check
  [ "$status" -eq 0 ]
  [[ "$output" == *"0 local links checked in 1 files (0 external skipped)"* ]]
}
