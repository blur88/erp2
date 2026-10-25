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

case "$BASELINE_STATE" in
  FRESH|BASELINED)
    ;;
  UNTRACKED_SCHEMA)
    echo "[entrypoint] FATAL: this database has an existing schema but no migration history." >&2
    echo "[entrypoint] Manual reconciliation is required before startup." >&2
    echo '[entrypoint] See repository documentation: docs/modules/price-lists/PRICE_LIST_DEPLOYMENT_GUIDE.md, section "Existing database".' >&2
    exit 1
    ;;
  *)
    echo "[entrypoint] FATAL: unrecognised baseline state: '$BASELINE_STATE'." >&2
    exit 1
    ;;
esac

echo "[entrypoint] Running database migrations..."
node node_modules/.bin/typeorm migration:run -d dist/config/database.config.js
echo "[entrypoint] Migrations applied."

echo "[entrypoint] Starting application..."
exec node dist/main
