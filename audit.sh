#!/usr/bin/env bash
set -uo pipefail

RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

frontend_exit=0
backend_exit=0

echo -e "${BOLD}${CYAN}========================================${RESET}"
echo -e "${BOLD}${CYAN}  Security Audit - ERP2                 ${RESET}"
echo -e "${BOLD}${CYAN}========================================${RESET}"
echo ""

echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
(cd "$ROOT_DIR/backend" && npm audit) || backend_exit=$?
echo ""

echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
(cd "$ROOT_DIR/frontend" && npm audit) || frontend_exit=$?
echo ""

echo -e "${BOLD}${CYAN}========================================${RESET}"

if [ $(( frontend_exit | backend_exit )) -ne 0 ]; then
  echo -e "${RED}${BOLD}Vulnerabilities found. Run 'npm audit fix' in the affected directory.${RESET}"
else
  echo -e "${GREEN}${BOLD}No vulnerabilities found.${RESET}"
fi

exit $(( frontend_exit | backend_exit ))
