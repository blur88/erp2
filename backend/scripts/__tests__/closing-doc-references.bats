#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-closing-doc-references.mjs"

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/docs"
  git -C "$REPO" init -q
  export GITHUB_EVENT_NAME=pull_request
  export PR_BODY_JSON='"Closes #42"'
}

@test "reports the complete handoff line when a PR closes its issue" {
  printf 'Introduction\nHelper extraction is left to [#42](https://github.com/blur88/erp2/issues/42).\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .

  run node "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = 'docs/testing.md:2: #42: Helper extraction is left to [#42](https://github.com/blur88/erp2/issues/42).' ]
}

@test "pins every fixed handoff phrase case-insensitively" {
  for phrase in 'left to' 'tracked in' 'deferred to' 'Known exception' 'until #42 is fixed'; do
    printf '%s #42\n' "$phrase" > "$REPO/docs/testing.md"
    git -C "$REPO" add .
    run node "$CHECK" "$REPO"
    [ "$status" -eq 1 ]
    [ "$output" = "docs/testing.md:1: #42: $phrase #42" ]
  done
}

@test "recognizes every closing keyword in both reference forms and mixed case" {
  printf 'Work is tracked in #42.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  for keyword in close closes closed fix fixes fixed resolve resolves resolved; do
    for reference in '#42' 'https://github.com/blur88/erp2/issues/42'; do
      export PR_BODY_JSON="\"${keyword^^} $reference\""
      run node "$CHECK" "$REPO"
      [ "$status" -eq 1 ]
      [ "$output" = 'docs/testing.md:1: #42: Work is tracked in #42.' ]
    done
  done
}

@test "ignores negation just as GitHub does" {
  printf 'Work is deferred to #42.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  export PR_BODY_JSON='"This does NOT close #42"'
  run node "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = 'docs/testing.md:1: #42: Work is deferred to #42.' ]
}

@test "reports all lines and issues once including URL-only doc references" {
  printf 'Work left to #42 and #7.\nKnown exception: [ticket](https://github.com/blur88/erp2/issues/42).\n' > "$REPO/docs/testing.md"
  printf 'Work tracked in #7.\n' > "$REPO/README.md"
  git -C "$REPO" add .
  export PR_BODY_JSON='"Closes #42, fixes #7, resolves #42"'
  run node "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = 'README.md:1: #7: Work tracked in #7.
docs/testing.md:1: #42: Work left to #42 and #7.
docs/testing.md:1: #7: Work left to #42 and #7.
docs/testing.md:2: #42: Known exception: [ticket](https://github.com/blur88/erp2/issues/42).' ]
}

@test "accepts Trace links and fixed-in citations" {
  printf '**Trace:** [#42](https://github.com/blur88/erp2/issues/42).\nThis was fixed in #42.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  run node "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "accepts a handoff reworded as a completed fix" {
  printf 'Work is left to #42.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  printf 'Work was completed in #42.\n' > "$REPO/docs/testing.md"
  run node "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  rm "$REPO/docs/testing.md"
  git -C "$REPO" add -u
  run node "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "excludes only docs/archive and includes other tracked Markdown paths" {
  mkdir -p "$REPO/docs/archive" "$REPO/docs/archives" "$REPO/archive"
  printf 'Work left to #42.\n' > "$REPO/docs/archive/old.md"
  git -C "$REPO" add .
  run node "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  printf 'Work left to #42.\n' > "$REPO/docs/archives/current.md"
  printf 'Work left to #42.\n' > "$REPO/archive/current.MD"
  git -C "$REPO" add .
  run node "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = 'archive/current.MD:1: #42: Work left to #42.
docs/archives/current.md:1: #42: Work left to #42.' ]
}

@test "excludes untracked Markdown and non-Markdown code comments" {
  printf 'Work left to #42.\n' > "$REPO/docs/untracked.md"
  printf '// Work left to #42.\n' > "$REPO/code.ts"
  git -C "$REPO" add code.ts
  run node "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "issue numbers match whole tokens in hash and URL references" {
  printf 'Work left to #420, #42suffix, issues/420, issues/42suffix.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  run node "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "limits handoffs to the same physical line and the fixed phrase list" {
  printf 'Work left to\n#42\nPending work #42.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  run node "$CHECK" "$REPO"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "does not close refs or keyword substrings or incomplete references" {
  printf 'Work left to #42.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  for body in 'Refs #42' 'prefixes #42' 'Closes #420' 'Closes #42suffix' 'Closes https://github.com/a/b/issues/420' 'Closes https://github.com/a/b/issues/42suffix' 'Closes' ''; do
    export PR_BODY_JSON="\"$body\""
    run node "$CHECK" "$REPO"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
  done
}

@test "dispatch skips explicitly even without a body or repository" {
  export GITHUB_EVENT_NAME=workflow_dispatch
  unset PR_BODY_JSON
  run node "$CHECK" "$REPO/missing"
  [ "$status" -eq 0 ]
  [ "$output" = 'Skipping closing-document references: workflow_dispatch has no PR body.' ]
}

@test "missing or unreadable PR bodies fail closed" {
  unset PR_BODY_JSON
  run node "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = 'Closing-document reference check failed: PR_BODY_JSON is missing or unreadable' ]
  export PR_BODY_JSON='not JSON'
  run node "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = 'Closing-document reference check failed: PR_BODY_JSON is missing or unreadable' ]
  for value in null '{}' '42' 'true'; do
    export PR_BODY_JSON="$value"
    run node "$CHECK" "$REPO"
    [ "$status" -eq 1 ]
    [ "$output" = 'Closing-document reference check failed: PR_BODY_JSON must contain a PR body string' ]
  done
}

@test "unknown and missing event names fail closed" {
  for event in '' push; do
    export GITHUB_EVENT_NAME="$event"
    run node "$CHECK" "$REPO"
    [ "$status" -eq 1 ]
    [ "$output" = 'Closing-document reference check failed: expected GITHUB_EVENT_NAME=pull_request or workflow_dispatch' ]
  done
}

@test "git root and tracked-file command failures fail closed even with no closures" {
  mkdir "$BATS_TEST_TMPDIR/bin"
  cat > "$BATS_TEST_TMPDIR/bin/git" <<'STUB'
#!/usr/bin/env bash
case " $* " in
  *" $FAIL_COMMAND "*) printf 'planted git failure\n' >&2; exit 9 ;;
esac
exec "$REAL_GIT" "$@"
STUB
  chmod +x "$BATS_TEST_TMPDIR/bin/git"
  export REAL_GIT="$(command -v git)"
  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"
  export PR_BODY_JSON='""'
  for command in rev-parse ls-files; do
    export FAIL_COMMAND="$command"
    run node "$CHECK" "$REPO"
    [ "$status" -eq 1 ]
    [ "$output" = "Closing-document reference check failed: Command failed: git -C $REPO $command $([ "$command" = rev-parse ] && printf '%s' '--show-toplevel' || printf '%s' '-z')
planted git failure" ]
  done
}

@test "unreadable tracked Markdown fails closed" {
  printf 'Work left to #42.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  rm "$REPO/docs/testing.md"
  run node "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = "Closing-document reference check failed: ENOENT: no such file or directory, open '$REPO/docs/testing.md'" ]
}

@test "the Backend CI step gates on the event body passed through environment" {
  mkdir -p "$REPO/backend/scripts"
  cp "$CHECK" "$REPO/backend/scripts/"
  printf 'Work left to #42.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  workflow="${BATS_TEST_DIRNAME}/../../../.github/workflows/ci.yml"
  run node - "$workflow" "$REPO" <<'NODE'
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const workflow = yaml.load(readFileSync(process.argv[2], 'utf8'));
const job = workflow.jobs['test-backend'];
assert.equal(job.name, 'Backend - Lint, Type Check, Unit Tests, E2E Tests');
assert.equal(job.if, undefined);
assert.equal(job['continue-on-error'], undefined);
const steps = job.steps.filter(step => step.run === 'node scripts/verify-closing-doc-references.mjs');
assert.equal(steps.length, 1);
const step = steps[0];
assert.equal(step.if, undefined);
assert.equal(step['continue-on-error'], undefined);
assert.equal(step.env.GITHUB_EVENT_NAME, '${{ github.event_name }}');
assert.equal(step.env.PR_BODY_JSON, '${{ toJSON(github.event.pull_request.body) }}');
const result = spawnSync(step.run, {
  shell: true,
  cwd: `${process.argv[3]}/backend`,
  env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', PR_BODY_JSON: '"Closes #42"' },
  encoding: 'utf8',
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exit(result.status ?? 2);
NODE
  [ "$status" -eq 1 ]
  [ "$output" = 'docs/testing.md:1: #42: Work left to #42.' ]
}

@test "handles Markdown filenames with spaces and invocation from a subdirectory" {
  printf 'Work LEFT TO #42.\r\n' > "$REPO/docs/with spaces.md"
  git -C "$REPO" add .
  cd "$REPO/docs"
  run node "$CHECK"
  [ "$status" -eq 1 ]
  [ "$output" = 'docs/with spaces.md:1: #42: Work LEFT TO #42.' ]
}

@test "treats shell syntax and multiline PR body text as data" {
  export PR_BODY_JSON='"A quoted \"body\"\n$(exit 99) `exit 99`\nCloses #42"'
  printf 'Work tracked in #42.\n' > "$REPO/docs/testing.md"
  git -C "$REPO" add .
  run node "$CHECK" "$REPO"
  [ "$status" -eq 1 ]
  [ "$output" = 'docs/testing.md:1: #42: Work tracked in #42.' ]
}
