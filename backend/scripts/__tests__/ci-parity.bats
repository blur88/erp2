#!/usr/bin/env bats

CHECK="${BATS_TEST_DIRNAME}/../verify-ci-parity.sh"
MESSAGE='The CI substitution in AGENTS.md rests on this parity; restore it or recheck docs/backend/testing.md "CI substitution for backend suites" before changing the rule.'

setup() {
  REPO="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$REPO/.github/workflows"
}

write_ci() {
  local image="$1" unit="$2" e2e="$3"
  cat > "$REPO/.github/workflows/ci.yml" <<EOF
jobs:
  test-backend:
    name: Backend
    services:
      postgres:
        image: $image
      redis:
        image: redis:8.6.1-alpine3.23
    steps:
      - name: Unit tests
        run: $unit
      - name: E2E tests
        run: $e2e

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

@test "passes when the job runs both suites on the Compose PostgreSQL image" {
  write_ci postgres:18.3-alpine3.23 "npm run test -- --no-coverage" "npm run test:e2e"
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "rejects a PostgreSQL image that differs from Compose" {
  write_ci postgres:18.4-alpine3.23 "npm run test -- --no-coverage" "npm run test:e2e"
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = 'PostgreSQL image differs: ci.yml test-backend uses "postgres:18.4-alpine3.23", docker-compose.yml uses "postgres:18.3-alpine3.23"'"
$MESSAGE" ]
}

@test "rejects a job that no longer runs the unit suite, even when another job does" {
  write_ci postgres:18.3-alpine3.23 "npm run test:unit-only" "npm run test:e2e"
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "ci.yml test-backend no longer runs: npm run test
$MESSAGE" ]
}

@test "rejects a job that no longer runs the e2e suite" {
  write_ci postgres:18.3-alpine3.23 "npm run test -- --no-coverage" "npm run test:e2e:leakcheck"
  write_compose postgres:18.3-alpine3.23

  run "$CHECK" "$REPO"

  [ "$status" -eq 1 ]
  [ "$output" = "ci.yml test-backend no longer runs: npm run test:e2e
$MESSAGE" ]
}

@test "the checked-out repository keeps backend CI parity" {
  repo_dir="$(git -C "${BATS_TEST_DIRNAME}/../../../" rev-parse --show-toplevel)"

  run "$CHECK" "$repo_dir"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
