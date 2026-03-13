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

do_docker_rebuild() {
  echo -e "${BOLD}${YELLOW}--- Docker: prune + rebuild + up ---${RESET}"
  docker system prune -f && docker compose up --build -d
}

do_top_lines() {
  echo -e "${BOLD}${YELLOW}--- Top 5 files by line count ---${RESET}"
  find "$ROOT_DIR" \
    -type f \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" \
    ! -path "*/.git/*" \
    -exec wc -l {} + 2>/dev/null \
    | sort -rn \
    | grep -v '^ *0 ' \
    | head -6 \
    | grep -v ' total$'
}

do_jscpd() {
  echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
  (cd "$ROOT_DIR/backend" && npx jscpd src \
    --ignore "**/node_modules/**,**/dist/**" \
    --min-lines 15 \
    --min-tokens 100 \
    --reporters console) || true
  echo ""
  echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
  (cd "$ROOT_DIR/frontend" && npx jscpd src \
    --ignore "**/node_modules/**,**/dist/**" \
    --min-lines 15 \
    --min-tokens 100 \
    --reporters console) || true
}

STEPS=(
  "Knip (dead code / unused deps check)"
  "Outdated packages"
  "Update packages (within semver ranges)"
  "Audit (security vulnerabilities)"
  "Top 5 files by line count"
  "jscpd (copy-paste detection)"
  "Docker: prune + rebuild + up"
)

run_step() {
  case "$1" in
    0) do_knip ;;
    1) do_outdated ;;
    2) do_update ;;
    3) do_audit ;;
    4) do_top_lines ;;
    5) do_jscpd ;;
    6) do_docker_rebuild ;;
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
      5) echo "4" ; return ;;
      6) echo "5" ; return ;;
      7) echo "6" ; return ;;
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
  read -rp "$(echo -e "${BOLD}Start with (1–7): ${RESET}")" start
  case "$start" in
    1|2|3|4|5|6|7) current=$((start-1)) ; break ;;
    *) echo -e "${RED}Please enter 1–7.${RESET}" ;;
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
