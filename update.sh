#!/bin/bash

# Update packages for both frontend and backend within semver ranges

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BOLD}${CYAN}========================================${RESET}"
echo -e "${BOLD}${CYAN}  Package Updater - ERP2                ${RESET}"
echo -e "${BOLD}${CYAN}========================================${RESET}"
echo ""

# Backend
echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
cd "$ROOT_DIR/backend"
npm update
echo -e "${GREEN}Backend updated.${RESET}"
echo ""

# Frontend
echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
cd "$ROOT_DIR/frontend"
npm update
echo -e "${GREEN}Frontend updated.${RESET}"
echo ""

echo -e "${BOLD}${CYAN}========================================${RESET}"
echo -e "${GREEN}${BOLD}All packages updated within semver ranges.${RESET}"
echo -e "For major version upgrades use ${BOLD}npx npm-check-updates -u${RESET} in backend/ or frontend/."
