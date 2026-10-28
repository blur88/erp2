#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-ci-parity.sh"
MESSAGE='The CI substitution in AGENTS.md rests on this parity; restore it or recheck docs/backend/testing.md "CI substitution for backend suites" before changing the rule.'

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/.github/workflows"
}

# write_ci IMAGE UNIT_STEP E2E_STEP [JOB_EXTRA]: each step argument is the
# step's body lines after "- name:", already indented eight spaces.
write_ci() {
  local image="$1" unit="$2" e2e="$3" job_extra="${4:-}"
  cat > "$REPO/.github/workflows/ci.yml" <<EOF
jobs:
  test-backend:
    name: Backend
${job_extra}
    services:
      postgres:
        image: $image
      redis:
        image: redis:8.6.1-alpine3.23
    steps:
      - name: Unit tests
$unit
      - name: E2E tests
$e2e

  migrations-fresh-db:
    services:
      postgres:
        image: postgres:17-alpine
    steps:
      - run: npm run test
      - run: npm run test:e2e
EOF
}

write_compose() {
  cat > "$REPO/docker-compose.yml" <<EOF
services:
  postgres:
    image: $1
  redis:
    image: redis:8.6.2-alpine3.23
EOF
}

UNIT='        run: npm run test -- --no-coverage'
E2E='        run: npm run test:e2e'

@test "passes when the job runs both suites on the Compose PostgreSQL image" {
  write_ci postgres:18.3-alpine3.23 "$UNIT" "$E2E"
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "accepts quoted images, a commented job key and one-line run steps" {
  write_ci '"postgres:18.3-alpine3.23"' "$UNIT" "$E2E"
  sed -i 's/^  test-backend:$/  test-backend: # backend gate/' "$REPO/.github/workflows/ci.yml"
  sed -i 's/^      - name: E2E tests$/      - run: npm run test:e2e/; /^        run: npm run test:e2e$/d' "$REPO/.github/workflows/ci.yml"
  write_compose "'postgres:18.3-alpine3.23'"

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "rejects a PostgreSQL image that differs from Compose" {
  write_ci postgres:18.4-alpine3.23 "$UNIT" "$E2E"
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = 'PostgreSQL image differs: ci.yml test-backend uses "postgres:18.4-alpine3.23", docker-compose.yml uses "postgres:18.3-alpine3.23"'"
$MESSAGE" ]
}

@test "rejects a job that no longer runs the unit suite, even when another job does" {
  write_ci postgres:18.3-alpine3.23 '        run: npm run test:unit-only' "$E2E"
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "ci.yml test-backend no longer runs: npm run test
$MESSAGE" ]
}

@test "rejects a job that no longer runs the e2e suite" {
  write_ci postgres:18.3-alpine3.23 "$UNIT" '        run: npm run test:e2e:leakcheck'
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "ci.yml test-backend no longer runs: npm run test:e2e
$MESSAGE" ]
}

@test "rejects a suite step that is skipped or does not gate" {
  write_compose postgres:18.3-alpine3.23
  for key in "if: false" "continue-on-error: true"; do
    write_ci postgres:18.3-alpine3.23 "$UNIT" "        $key
$E2E"

    run "$CHECK" "$REPO"

    [ "$status" -eq 1 ]
    [ "$output" = "ci.yml test-backend step running npm run test:e2e is conditional or non-gating (if: or continue-on-error:)
$MESSAGE" ]
  done
}

@test "rejects a job that is skipped or does not gate" {
  write_compose postgres:18.3-alpine3.23
  for key in "if: false" "continue-on-error: true"; do
    write_ci postgres:18.3-alpine3.23 "$UNIT" "$E2E" "    $key"

    run "$CHECK" "$REPO"

    [ "$status" -eq 1 ]
    [ "$output" = "ci.yml test-backend is conditional or non-gating at job level (if: or continue-on-error:)
$MESSAGE" ]
  done
}

@test "rejects a workflow without the backend job" {
  printf 'jobs:\n  test-frontend:\n    steps: []\n' > "$REPO/.github/workflows/ci.yml"
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = ".github/workflows/ci.yml: job test-backend not found
$MESSAGE" ]
}

@test "exits 2 when an input file is missing" {
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 2 ]
  [ "$output" = "File not found: $REPO/.github/workflows/ci.yml" ]
}

@test "the checked-out repository keeps backend CI parity" {
  run "$CHECK"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
