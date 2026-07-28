#!/bin/sh
set -e

# Migrations are the only schema path. Failure is fatal: a silent
# schema:sync fallback is what allowed the broken chain in #950 to go
# undetected across 84 migrations.

# Guard the #950 baseline transition. A database whose schema was built by
# schema:sync has tables but an empty (or absent) migrations table. Running
# migration:run against it makes TypeORM believe nothing has been applied, so
# the InitialSchema genesis migration re-creates a schema that already exists
# and the existing data is lost. Such databases must record the baseline with
# `migration:run --fake` first. Detect that state and refuse to proceed.
echo "[entrypoint] Checking migration baseline..."
BASELINE_STATE="$(node dist/database/check-baseline.js)"

if [ "$BASELINE_STATE" = "NEEDS_FAKE" ]; then
  echo "[entrypoint] FATAL: this database has an existing schema but no migration history." >&2
  echo "[entrypoint] Running migrations now would re-apply InitialSchema over your data." >&2
  echo "[entrypoint] Record the baseline first, then restart:" >&2
  echo "[entrypoint]   npm run typeorm -- -d dist/config/database.config.js migration:run --fake" >&2
  echo "[entrypoint] Take a backup before doing so. See issue #950." >&2
  exit 1
fi

echo "[entrypoint] Running database migrations..."
node node_modules/.bin/typeorm migration:run -d dist/config/database.config.js
echo "[entrypoint] Migrations applied."

echo "[entrypoint] Starting application..."
exec node dist/main
