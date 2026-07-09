#!/bin/sh
set -e

# Prepare the schema. Prefer migrations, but fall back to schema sync because
# this repository's migration set is not bootstrap-safe on an empty database
# (core tables like users/products are created by TypeORM synchronize, not by
# migrations — the migrations are incremental ALTERs layered on top). This
# mirrors backend/test/jest-e2e-global-setup.ts.
echo "[entrypoint] Preparing database schema (migrations, with schema-sync fallback)..."
if node node_modules/.bin/typeorm migration:run -d dist/config/database.config.js; then
  echo "[entrypoint] Migrations applied."
else
  echo "[entrypoint] Migration run failed (non-bootstrap-safe chain); falling back to schema sync..."
  node node_modules/.bin/typeorm schema:sync -d dist/config/database.config.js
  echo "[entrypoint] Schema synced."
fi

echo "[entrypoint] Starting application..."
exec node dist/main
