#!/usr/bin/env bash
set -euo pipefail

(cd frontend && npx knip)
(cd backend && npx knip)
