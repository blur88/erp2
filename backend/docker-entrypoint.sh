#!/bin/sh
set -e

# Migrations are the only schema path. Failure is fatal: a silent
# schema:sync fallback is what allowed the broken chain in #950 to go
# undetected across 84 migrations.

# Guard the #950 baseline transition. A database whose schema was built by
# schema:sync has tables but an empty (or absent) migrations table. Running
# migration:run against it makes TypeORM believe nothing has been applied, so
# the InitialSchema genesis migration re-creates a schema that already exists
# and the existing data is lost. Such databases require manual baseline
# reconciliation (#1466). Detect that state and refuse to proceed.
echo "[entrypoint] Checking migration baseline..."
BASELINE_STATE="$(node dist/database/check-baseline.js)"

if [ "$BASELINE_STATE" = "NEEDS_FAKE" ]; then
  echo "[entrypoint] FATAL: this database has an existing schema but no migration history." >&2
  echo "[entrypoint] Running migrations now would re-apply InitialSchema over your data." >&2
  echo "[entrypoint] Take a backup and reconcile the schema and migration history manually." >&2
  echo "[entrypoint] Verify the schema against InitialSchema before recording only that baseline." >&2
  echo "[entrypoint] Then apply subsequent migrations normally before restarting." >&2
  echo "[entrypoint] Do not use migration:run --fake with the full migration configuration:" >&2
  echo "[entrypoint] it marks every pending migration as applied without executing it." >&2
  echo "[entrypoint] See docs/modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md (Existing database) and issue #1466." >&2
  exit 1
fi

echo "[entrypoint] Running database migrations..."
node node_modules/.bin/typeorm migration:run -d dist/config/database.config.js
echo "[entrypoint] Migrations applied."

echo "[entrypoint] Starting application..."
exec node dist/main
