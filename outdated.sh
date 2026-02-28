#!/bin/bash

# Check outdated packages for both frontend and backend

RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BOLD}${CYAN}========================================${RESET}"
echo -e "${BOLD}${CYAN}  Outdated Package Checker - ERP2       ${RESET}"
echo -e "${BOLD}${CYAN}========================================${RESET}"
echo ""

# Backend
echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
cd "$ROOT_DIR/backend"
npm outdated 2>/dev/null || true
echo ""

# Frontend
echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
cd "$ROOT_DIR/frontend"
npm outdated 2>/dev/null || true
echo ""

echo -e "${BOLD}${CYAN}========================================${RESET}"
echo -e "Done. Run ${BOLD}npm update${RESET} in each directory to update within semver ranges."
echo -e "For major upgrades use ${BOLD}npx npm-check-updates -u${RESET} in backend/ or frontend/."
