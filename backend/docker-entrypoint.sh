#!/bin/sh
set -e

# Migrations are the only schema path. Failure is fatal: a silent
# schema:sync fallback is what allowed the broken chain in #950 to go
# undetected across 84 migrations.
echo "[entrypoint] Running database migrations..."
node node_modules/.bin/typeorm migration:run -d dist/config/database.config.js
echo "[entrypoint] Migrations applied."

echo "[entrypoint] Starting application..."
exec node dist/main
