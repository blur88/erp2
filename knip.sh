#!/usr/bin/env bash
set -uo pipefail

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

frontend_exit=0
backend_exit=0

echo -e "${BOLD}${CYAN}========================================${RESET}"
echo -e "${BOLD}${CYAN}  Knip Dead Code Checker - ERP2         ${RESET}"
echo -e "${BOLD}${CYAN}========================================${RESET}"
echo ""

echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
(cd "$ROOT_DIR/frontend" && npx knip) || frontend_exit=$?
echo ""

echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
(cd "$ROOT_DIR/backend" && npx knip) || backend_exit=$?
echo ""

echo -e "${BOLD}${CYAN}========================================${RESET}"

exit $(( frontend_exit | backend_exit ))
