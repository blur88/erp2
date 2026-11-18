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

@test "rejects the archiver-utils resolution unless its exact exception is listed" {
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

@test "reports an invalid allowlist as a setup error" {
  printf '[{}]\n' > invalid-allowlist.json
  run node "$checker" "$fixtures/rimraf" "$fixtures/documented.md" "$PWD/invalid-allowlist.json"
  [ "$status" -eq 2 ]
  [[ "$output" == 'Could not check dependency overrides: Expected an allowlist array'* ]]
}

@test "reports missing arguments as a setup error" {
  run node "$checker" "$fixtures/rimraf" "$fixtures/documented.md"
  [ "$status" -eq 2 ]
  [[ "$output" == 'Could not check dependency overrides: Usage:'* ]]
}
