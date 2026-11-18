#!/usr/bin/env bats
# Check the dependency override gate through its CLI (#1931).

setup() {
  checker="$BATS_TEST_DIRNAME/../check-dependency-overrides.mjs"
  fixtures="$BATS_TEST_DIRNAME/fixtures/dependency-overrides"
  cd "$BATS_TEST_TMPDIR"
}

@test "rejects rimraf 2 resolving glob 14 outside its declared range" {
  run node "$checker" "$fixtures/rimraf" "$fixtures/documented.md" "$fixtures/no-exceptions.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *'rimraf@2.7.1 -> glob: declared ^7.1.3, resolved 14.0.6'* ]]
}

@test "accepts a documented nested override that resolves within range" {
  run node "$checker" "$fixtures/compatible" "$fixtures/nested.md" "$fixtures/no-exceptions.json"
  [ "$status" -eq 0 ]
}

@test "rejects an undocumented nested override" {
  run node "$checker" "$fixtures/compatible" "$fixtures/missing-nested.md" "$fixtures/no-exceptions.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *'Undocumented override key "rimraf@2.7.1 → glob"'* ]]
}

@test "accepts the verified archiver-utils exception" {
  run node "$checker" "$fixtures/archiver" "$fixtures/documented.md" "$fixtures/no-exceptions.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *'archiver-utils@2.1.0 -> glob: declared ^7.1.4, resolved 14.0.6'* ]]

  run node "$checker" "$fixtures/archiver" "$fixtures/documented.md" "$fixtures/archiver-exception.json"
  [ "$status" -eq 0 ]
}

@test "does not extend the archiver-utils exception to rimraf" {
  run node "$checker" "$fixtures/rimraf" "$fixtures/documented.md" "$fixtures/archiver-exception.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *'rimraf@2.7.1 -> glob: declared ^7.1.3, resolved 14.0.6'* ]]
}
