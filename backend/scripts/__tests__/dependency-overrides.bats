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
  run node "$checker" "$fixtures/archiver" "$fixtures/archiver-documentation.md" "$fixtures/no-exceptions.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *'archiver-utils@2.1.0 -> glob: declared ^7.1.4, resolved 14.0.6'* ]]

  run node "$checker" "$fixtures/archiver" "$fixtures/archiver-documentation.md" "$fixtures/archiver-exception.json"
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

@test "rejects a documented key for a removed override" {
  run node "$checker" "$fixtures/compatible" "$fixtures/stale-documentation.md" "$fixtures/no-exceptions.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *'Stale documented override key "rimraf@2.7.1 → obsolete-dependency"'* ]]
}

@test "rejects an allowlist entry for a resolution that is absent" {
  run node "$checker" "$fixtures/compatible" "$fixtures/nested.md" "$fixtures/archiver-exception.json"
  [ "$status" -eq 1 ]
  [[ "$output" == 'Stale allowlist entry: archiver-utils@2.1.0 -> glob: declared ^7.1.4, resolved 14.0.6' ]]
}

# Write allowlist.json from shared-exceptions.json with the rimraf entry's spec
# set to a JSON value, or removed when the value is null.
rimraf_spec_json() {
  node -e '
    const [source, spec] = process.argv.slice(1);
    const entries = JSON.parse(require("fs").readFileSync(source, "utf8"));
    entries[1].spec = JSON.parse(spec) ?? undefined;
    process.stdout.write(JSON.stringify(entries));
  ' "$fixtures/shared-exceptions.json" "$1" > allowlist.json
}

rimraf_spec() {
  rimraf_spec_json "\"$1\""
}

@test "rejects an exception without a spec reference" {
  rimraf_spec_json null
  run node "$checker" "$fixtures/shared" "$fixtures/documented.md" "$PWD/allowlist.json"
  [ "$status" -eq 1 ]
  [ "$output" == 'Missing spec reference: rimraf@2.7.1 -> glob: declared ^7.1.3, resolved 14.0.6' ]
}

@test "rejects a spec reference to a nonexistent file" {
  rimraf_spec test/unit/dependency-rimraf.spec.ts
  run node "$checker" "$fixtures/shared" "$fixtures/documented.md" "$PWD/allowlist.json"
  [ "$status" -eq 1 ]
  [ "$output" == 'Nonexistent spec "test/unit/dependency-rimraf.spec.ts": rimraf@2.7.1 -> glob: declared ^7.1.3, resolved 14.0.6' ]
}

@test "accepts one tracked spec shared by two exceptions" {
  run node "$checker" "$fixtures/shared" "$fixtures/documented.md" "$fixtures/shared-exceptions.json"
  [ "$status" -eq 0 ]
  [ "$output" == 'Dependency override compatibility and documentation checks passed.' ]
}

@test "rejects a spec outside the Jest roots or test pattern" {
  for spec in notes/dependency-glob.spec.ts test/unit/dependency-glob.ts; do
    rimraf_spec "$spec"
    run node "$checker" "$fixtures/shared" "$fixtures/documented.md" "$PWD/allowlist.json"
    [ "$status" -eq 1 ]
    [ "$output" == "Spec \"$spec\" is not in the Jest test suite: rimraf@2.7.1 -> glob: declared ^7.1.3, resolved 14.0.6" ]
  done
}

# Copy the shared fixture into a fresh Git repository and commit it.
shared_repository() {
  cp -R "$fixtures/shared" repository
  git -C repository init --quiet
  git -C repository add .
  git -C repository -c user.name=fixture -c user.email=fixture@example.invalid \
    commit --quiet --message fixture
}

@test "rejects an untracked spec" {
  shared_repository
  touch repository/test/unit/dependency-rimraf.spec.ts
  rimraf_spec test/unit/dependency-rimraf.spec.ts
  run node "$checker" repository "$fixtures/documented.md" "$PWD/allowlist.json"
  [ "$status" -eq 1 ]
  [ "$output" == 'Untracked spec "test/unit/dependency-rimraf.spec.ts": rimraf@2.7.1 -> glob: declared ^7.1.3, resolved 14.0.6' ]

  git -C repository add test/unit/dependency-rimraf.spec.ts
  run node "$checker" repository "$fixtures/documented.md" "$PWD/allowlist.json"
  [ "$status" -eq 0 ]
}

@test "rejects a spec that escapes the repository" {
  shared_repository
  touch outside.spec.ts
  ln -s ../../../outside.spec.ts repository/test/unit/outside.spec.ts
  git -C repository add test/unit/outside.spec.ts
  for spec in ../outside.spec.ts test/unit/outside.spec.ts; do
    rimraf_spec "$spec"
    run node "$checker" repository "$fixtures/documented.md" "$PWD/allowlist.json"
    [ "$status" -eq 1 ]
    [ "$output" == "Spec \"$spec\" is outside the repository: rimraf@2.7.1 -> glob: declared ^7.1.3, resolved 14.0.6" ]
  done
}

@test "rejects a spec reference that is not a relative path" {
  for spec in 42 '""' "\"$fixtures/shared/test/unit/dependency-glob.spec.ts\""; do
    rimraf_spec_json "$spec"
    run node "$checker" "$fixtures/shared" "$fixtures/documented.md" "$PWD/allowlist.json"
    [ "$status" -eq 1 ]
    [ "$output" == "Invalid spec reference $spec, expected a path relative to the project: rimraf@2.7.1 -> glob: declared ^7.1.3, resolved 14.0.6" ]
  done
}
