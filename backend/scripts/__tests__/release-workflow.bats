#!/usr/bin/env bats

setup() {
  local repo_dir
  repo_dir="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  export GITHUB_OUTPUT="$BATS_TEST_TMPDIR/outputs"
  : > "$GITHUB_OUTPUT"
  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"
  # Exercise the actual workflow body, with only the external release CLI stubbed.
  awk '
    /^        id: semantic_release$/ { step = 1; next }
    step && /^        run: \|$/ { body = 1; next }
    body && /^          / { print substr($0, 11); next }
    body { exit }
  ' "$repo_dir/.github/workflows/release.yml" > "$BATS_TEST_TMPDIR/release.sh"
  [ -s "$BATS_TEST_TMPDIR/release.sh" ]
  # Isolate the workflow log from other tests and concurrent local runs.
  sed -i "s|/tmp/sr-output.txt|$BATS_TEST_TMPDIR/sr-output.txt|g" "$BATS_TEST_TMPDIR/release.sh"
  cat > "$BATS_TEST_TMPDIR/bin/npx" <<'SH'
#!/usr/bin/env bash
[ "$*" = 'semantic-release' ] || exit 99
printf '%s\n' "$RELEASE_OUTPUT"
exit "$RELEASE_STATUS"
SH
  chmod +x "$BATS_TEST_TMPDIR/bin/npx"
}

# The workflow uses GitHub's default bash -e; also retain strict-shell coverage.
run_release_step() {
  : > "$GITHUB_OUTPUT"
  echo "# shell: $1"
  if [ "$1" = default ]; then
    run bash -e "$BATS_TEST_TMPDIR/release.sh"
  else
    run bash --noprofile --norc -eo pipefail "$BATS_TEST_TMPDIR/release.sh"
  fi
}

@test "Release step reports no release after a successful analysis" {
  export RELEASE_STATUS=0
  export RELEASE_OUTPUT='semantic-release: There are no relevant changes, so no new version is released.'

  for shell_mode in default strict; do
    run_release_step "$shell_mode"

    [ "$status" -eq 0 ]
    grep -qx 'new_release_published=false' "$GITHUB_OUTPUT"
    grep -qx 'new_release_version=' "$GITHUB_OUTPUT"
  done
}

@test "Release step preserves semantic-release failure after publication" {
  export RELEASE_STATUS=42
  export RELEASE_OUTPUT=$'Published release 3.18.0 on default channel\nsemantic-release: fixture publish failure'

  for shell_mode in default strict; do
    run_release_step "$shell_mode"

    [ "$status" -eq 42 ]
    [[ "$output" == *"semantic-release: fixture publish failure"* ]]
    ! grep -q '^new_release_published=true$' "$GITHUB_OUTPUT"
  done
}

@test "Release step preserves semantic-release failure before publication" {
  export RELEASE_STATUS=42
  export RELEASE_OUTPUT='semantic-release: fixture prepare failure'

  for shell_mode in default strict; do
    run_release_step "$shell_mode"

    [ "$status" -eq 42 ]
    [[ "$output" == *"semantic-release: fixture prepare failure"* ]]
    [ ! -s "$GITHUB_OUTPUT" ]
  done
}

@test "Release step reports the published version on success" {
  export RELEASE_STATUS=0
  export RELEASE_OUTPUT='Published release 3.18.0 on default channel'

  for shell_mode in default strict; do
    run_release_step "$shell_mode"

    [ "$status" -eq 0 ]
    grep -qx 'new_release_published=true' "$GITHUB_OUTPUT"
    grep -qx 'new_release_version=3.18.0' "$GITHUB_OUTPUT"
  done
}
