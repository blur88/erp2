#!/usr/bin/env bash
set -uo pipefail

frontend_exit=0
backend_exit=0

echo "=== FRONTEND ==="
(cd frontend && npx knip) || frontend_exit=$?

echo ""
echo "=== BACKEND ==="
(cd backend && npx knip) || backend_exit=$?

exit $(( frontend_exit | backend_exit ))
