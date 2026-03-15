#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node node_modules/.bin/typeorm migration:run -d dist/config/database.config.js

echo "[entrypoint] Starting application..."
exec node dist/main
