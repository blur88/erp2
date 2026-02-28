#!/usr/bin/env bash
set -uo pipefail

frontend_exit=0
backend_exit=0

(cd frontend && npx knip) || frontend_exit=$?
(cd backend && npx knip) || backend_exit=$?

exit $(( frontend_exit | backend_exit ))
