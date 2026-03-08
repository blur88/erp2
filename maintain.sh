#!/usr/bin/env bash
set -uo pipefail

RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Step functions ────────────────────────────────────────────────────────────

do_knip() {
  echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
  (cd "$ROOT_DIR/frontend" && npx knip) || true
  echo ""
  echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
  (cd "$ROOT_DIR/backend" && npx knip) || true
}

do_outdated() {
  echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
  (cd "$ROOT_DIR/backend" && npm outdated 2>/dev/null) || true
  echo ""
  echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
  (cd "$ROOT_DIR/frontend" && npm outdated 2>/dev/null) || true
}

do_update() {
  echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
  (cd "$ROOT_DIR/backend" && npm update)
  echo -e "${GREEN}Backend updated.${RESET}"
  echo ""
  echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
  (cd "$ROOT_DIR/frontend" && npm update)
  echo -e "${GREEN}Frontend updated.${RESET}"
}

do_audit() {
  echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
  (cd "$ROOT_DIR/backend" && npm audit) || true
  echo ""
  echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
  (cd "$ROOT_DIR/frontend" && npm audit) || true
}

STEPS=(
  "Knip (dead code / unused deps check)"
  "Outdated packages"
  "Update packages (within semver ranges)"
  "Audit (security vulnerabilities)"
)

run_step() {
  case "$1" in
    0) do_knip ;;
    1) do_outdated ;;
    2) do_update ;;
    3) do_audit ;;
  esac
}

prompt_next() {
  local current="$1"
  while true; do
    echo "" >&2
    echo -e "${BOLD}What next?${RESET}" >&2
    for i in "${!STEPS[@]}"; do
      echo -e "  ${BOLD}$((i+1))${RESET}. ${STEPS[$i]}" >&2
    done
    echo -e "  ${BOLD}r${RESET}. Rerun current" >&2
    echo -e "  ${BOLD}q${RESET}. Quit" >&2
    echo "" >&2
    read -rp "$(echo -e "${BOLD}Choice: ${RESET}")" choice
    case "$choice" in
      1) echo "0" ; return ;;
      2) echo "1" ; return ;;
      3) echo "2" ; return ;;
      4) echo "3" ; return ;;
      [Rr]) echo "$current" ; return ;;
      [Qq]) echo "-1" ; return ;;
      *) echo -e "${RED}Invalid choice.${RESET}" >&2 ;;
    esac
  done
}

# ── Main ──────────────────────────────────────────────────────────────────────

echo -e "${BOLD}${CYAN}========================================${RESET}"
echo -e "${BOLD}${CYAN}  ERP2 Maintenance Tool                 ${RESET}"
echo -e "${BOLD}${CYAN}========================================${RESET}"
echo ""
echo -e "Steps:"
for i in "${!STEPS[@]}"; do
  echo -e "  ${BOLD}$((i+1))${RESET}. ${STEPS[$i]}"
done
echo ""

# Pick starting step
while true; do
  read -rp "$(echo -e "${BOLD}Start with (1/2/3/4): ${RESET}")" start
  case "$start" in
    1|2|3|4) current=$((start-1)) ; break ;;
    *) echo -e "${RED}Please enter 1, 2, 3, or 4.${RESET}" ;;
  esac
done

while [[ $current -ge 0 ]]; do
  echo ""
  echo -e "${BOLD}${CYAN}========================================${RESET}"
  echo -e "${BOLD}${CYAN}  ${STEPS[$current]}${RESET}"
  echo -e "${BOLD}${CYAN}========================================${RESET}"
  echo ""
  run_step "$current"
  current=$(prompt_next "$current")
done

echo ""
echo -e "${BOLD}${CYAN}========================================${RESET}"
echo -e "${GREEN}${BOLD}Done.${RESET}"
echo -e "For major version upgrades use ${BOLD}npx npm-check-updates -u${RESET} in backend/ or frontend/."
