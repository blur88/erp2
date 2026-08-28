#!/usr/bin/env bats
#
# Guard for the dist/ corruption that crash-looped the backend (2026-08-15):
# `npx tsc -p tsconfig.cli.json` recompiled a file over `nest build`'s output
# without rewriting path aliases, so dist/ shipped an unresolvable require.
#
# These tests build fixture dist/ trees rather than compiling the real project,
# so they stay fast and assert the script's own decision boundaries.

SCRIPT="$BATS_TEST_DIRNAME/../verify-dist-runtime.sh"

setup() {
  TEST_DIST="$BATS_TEST_TMPDIR/dist"
  mkdir -p "$TEST_DIST/modules/backup" "$TEST_DIST/database/entities" \
           "$TEST_DIST/config" "$TEST_DIST/database/migrations"
}

# A compiled config factory whose migrations glob is correctly dist-relative,
# plus one compiled migration for it to match.
write_good_migrations_config() {
  cat > "$TEST_DIST/database/migrations/1700000000000-Fixture.js" <<'EOF'
exports.Fixture1700000000000 = class Fixture1700000000000 {};
EOF
  cat > "$TEST_DIST/config/database-config.factory.js" <<'EOF'
const path = require("path");
exports.createDatabaseConfig = function () {
  return { migrations: [path.join(__dirname, "../database/migrations/*{.ts,.js}")] };
};
EOF
}

# A dist/ tree whose require graph resolves cleanly.
write_good_dist() {
  cat > "$TEST_DIST/database/entities/backup-schedule.entity.js" <<'EOF'
exports.BackupSchedule = class BackupSchedule {};
EOF
  cat > "$TEST_DIST/modules/backup/orphaned-scheduler-reconciler.service.js" <<'EOF'
const backup_schedule_entity_1 = require("../../database/entities/backup-schedule.entity");
exports.svc = backup_schedule_entity_1.BackupSchedule;
EOF
  cat > "$TEST_DIST/main.js" <<'EOF'
require("./modules/backup/orphaned-scheduler-reconciler.service");
EOF
  write_good_migrations_config
}

@test "passes on a dist whose imports are relative and resolvable" {
  write_good_dist
  run bash "$SCRIPT" "$TEST_DIST"

  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS"* ]]
}

@test "fails when a path alias survives into compiled output" {
  write_good_dist
  # Exactly the regression: the alias, verbatim, as plain tsc emits it.
  cat > "$TEST_DIST/modules/backup/orphaned-scheduler-reconciler.service.js" <<'EOF'
const backup_schedule_entity_1 = require("@database/entities/backup-schedule.entity");
EOF

  run bash "$SCRIPT" "$TEST_DIST"

  [ "$status" -eq 1 ]
  [[ "$output" == *"unresolved TypeScript path aliases"* ]]
  # Must name the offending file, or the message is not actionable.
  [[ "$output" == *"orphaned-scheduler-reconciler.service.js"* ]]
  # Must explain the cause, since the source file looks correct.
  [[ "$output" == *"tsconfig.cli.json"* ]]
}

@test "catches an unresolvable require even when it is not a known alias" {
  write_good_dist
  # The static scan cannot know this one; only loading main.js finds it.
  cat > "$TEST_DIST/modules/backup/orphaned-scheduler-reconciler.service.js" <<'EOF'
require("./definitely-not-here");
EOF

  run bash "$SCRIPT" "$TEST_DIST"

  [ "$status" -eq 1 ]
  [[ "$output" == *"could not resolve its module graph"* ]]
}

@test "fails when dist does not exist" {
  run bash "$SCRIPT" "$BATS_TEST_TMPDIR/nope"

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not exist"* ]]
}

@test "fails when main.js is missing from an otherwise present dist" {
  run bash "$SCRIPT" "$TEST_DIST"

  [ "$status" -eq 1 ]
  [[ "$output" == *"main.js"* ]]
}

@test "does not fail on a runtime error unrelated to module resolution" {
  # A module that resolves but throws (no DB, no Redis) must still pass: this
  # gate tests resolvability, not bootability, or it would be unusable in CI.
  write_good_dist
  cat > "$TEST_DIST/main.js" <<'EOF'
require("./modules/backup/orphaned-scheduler-reconciler.service");
throw new Error("cannot connect to postgres");
EOF

  run bash "$SCRIPT" "$TEST_DIST"

  [ "$status" -eq 0 ]
  [[ "$output" == *"PASS"* ]]
}

@test "catches a bare require of an import-only ESM package (ERR_PACKAGE_PATH_NOT_EXPORTED)" {
  # The NestJS 12 crash class: @nestjs/typeorm@12.0.0 exposed its subpath only
  # under an "import" condition, so the CommonJS app's bare require threw at
  # boot. The graph "resolves" in the sense that no file is missing, so only an
  # explicit check on this error code catches it — it would otherwise ship an
  # image that boots straight into a crash-loop.
  write_good_dist
  mkdir -p "$TEST_DIST/../node_modules/import-only-pkg"
  cat > "$TEST_DIST/../node_modules/import-only-pkg/package.json" <<'EOF'
{
  "name": "import-only-pkg",
  "version": "1.0.0",
  "type": "module",
  "exports": { ".": { "import": "./index.js" } }
}
EOF
  cat > "$TEST_DIST/../node_modules/import-only-pkg/index.js" <<'EOF'
export const x = 1;
EOF
  cat > "$TEST_DIST/main.js" <<'EOF'
require("import-only-pkg");
EOF

  run bash "$SCRIPT" "$TEST_DIST"

  [ "$status" -eq 1 ]
  [[ "$output" == *"ERR_PACKAGE_PATH_NOT_EXPORTED"* ]]
}

@test "fails when the compiled datasource resolves migrations from src/ instead of dist/" {
  # The production image copies only dist/, so a cwd-relative src/ glob matches
  # nothing and TypeORM reports zero pending migrations without erroring. This
  # is asserted statically: a runtime "did we find any migrations" count would
  # pass in the builder stage, where src/ still exists.
  write_good_dist
  cat > "$TEST_DIST/config/database-config.factory.js" <<'EOF'
const path = require("path");
exports.createDatabaseConfig = function () {
  return { migrations: [path.join(process.cwd(), "src/database/migrations/*{.ts,.js}")] };
};
EOF

  run bash "$SCRIPT" "$TEST_DIST"

  [ "$status" -eq 1 ]
  [[ "$output" == *"does not target dist/database/migrations"* ]]
}

@test "fails when dist/database/migrations holds no compiled migrations" {
  # A correct pattern that matches nothing is just as fatal as a wrong one.
  write_good_dist
  rm -f "$TEST_DIST/database/migrations/"*.js

  run bash "$SCRIPT" "$TEST_DIST"

  [ "$status" -eq 1 ]
  [[ "$output" == *"no compiled .js migrations"* ]]
}
