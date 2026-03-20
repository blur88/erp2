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

print_outdated_table() {
  local label="$1"
  local dir="$2"
  local raw
  raw=$(cd "$dir" && npm outdated --json 2>/dev/null); [[ -z "$raw" ]] && raw="{}"
  if [[ -z "$raw" || "$raw" == "{}" ]]; then
    echo -e "  ${GREEN}All packages up to date.${RESET}"
    return
  fi
  # Header
  printf "  ${BOLD}%-38s %-16s %-16s %-16s${RESET}\n" "Package" "Current" "Wanted" "Latest"
  printf "  %-38s %-16s %-16s %-16s\n" "$(printf '%0.s-' {1..38})" "$(printf '%0.s-' {1..16})" "$(printf '%0.s-' {1..16})" "$(printf '%0.s-' {1..16})"
  echo "$raw" | python3 -c "
import sys, json
data = json.load(sys.stdin)
W_VER = 16
for pkg, info in sorted(data.items()):
    cur  = info.get('current', 'N/A')
    want = info.get('wanted',  'N/A')
    lat  = info.get('latest',  'N/A')
    color = '\033[0;31m' if lat != cur else '\033[0;33m'
    reset = '\033[0m'
    # split each version into chunks of W_VER
    def chunks(s):
        return [s[i:i+W_VER] for i in range(0, max(len(s), 1), W_VER)]
    rows = max(len(chunks(cur)), len(chunks(want)), len(chunks(lat)))
    cc, wc, lc = chunks(cur), chunks(want), chunks(lat)
    for i in range(rows):
        p   = pkg  if i == 0 else ''
        cv  = cc[i] if i < len(cc) else ''
        wv  = wc[i] if i < len(wc) else ''
        lv  = lc[i] if i < len(lc) else ''
        print(f'  {color}{p:<38} {cv:<16} {wv:<16} {lv:<16}{reset}')
"
}

do_outdated() {
  echo -e "${BOLD}${YELLOW}--- ROOT (semantic-release) ---${RESET}"
  print_outdated_table "Root" "$ROOT_DIR"
  echo ""
  echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
  print_outdated_table "Frontend" "$ROOT_DIR/frontend"
  echo ""
  echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
  print_outdated_table "Backend" "$ROOT_DIR/backend"
}

do_update() {
  echo -e "${BOLD}${YELLOW}--- ROOT (semantic-release) ---${RESET}"
  (cd "$ROOT_DIR" && npm update)
  echo -e "${GREEN}Root updated.${RESET}"
  echo ""
  echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
  (cd "$ROOT_DIR/frontend" && npm update)
  echo -e "${GREEN}Frontend updated.${RESET}"
  echo ""
  echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
  (cd "$ROOT_DIR/backend" && npm update)
  echo -e "${GREEN}Backend updated.${RESET}"
}

print_audit_table() {
  local dir="$1"
  local raw
  raw=$(cd "$dir" && npm audit --json 2>/dev/null) || true
  [[ -z "$raw" ]] && raw="{}"
  echo "$raw" | python3 -c "
import sys, json
data = json.load(sys.stdin)
vulns = data.get('vulnerabilities', {})
meta  = data.get('metadata', {}).get('vulnerabilities', {})
total = meta.get('total', 0)
if total == 0:
    print('  \033[0;32mNo vulnerabilities found.\033[0m')
    sys.exit()
sev_color = {'critical': '\033[0;31m', 'high': '\033[0;31m', 'moderate': '\033[0;33m', 'low': '\033[0;36m', 'info': '\033[0m'}
reset = '\033[0m'
bold  = '\033[1m'
# Summary row
print(f'  {bold}Summary:{reset}  ' + '  '.join(
    f\"{sev_color.get(s,reset)}{s}: {meta.get(s,0)}{reset}\"
    for s in ['critical','high','moderate','low','info'] if meta.get(s,0) > 0
))
print()
print(f'  {bold}{\"Package\":<35} {\"Severity\":<10} {\"Via\":<30} Fix{reset}')
print(f'  {\"-\"*35} {\"-\"*10} {\"-\"*30} {\"-\"*20}')
for pkg, info in sorted(vulns.items(), key=lambda x: [\"critical\",\"high\",\"moderate\",\"low\",\"info\"].index(x[1].get(\"severity\",\"info\")) if x[1].get(\"severity\",\"info\") in [\"critical\",\"high\",\"moderate\",\"low\",\"info\"] else 99):
    sev  = info.get('severity', '')
    via  = ', '.join(str(v) if isinstance(v, str) else v.get('source','?') if isinstance(v,dict) else '?' for v in info.get('via', []))[:30]
    fix  = info.get('fixAvailable', False)
    fix_str = 'fix available' if fix is True else (fix.get('name','') + '@' + fix.get('version','') if isinstance(fix,dict) else 'manual')
    col  = sev_color.get(sev, reset)
    print(f'  {col}{pkg:<35} {sev:<10} {via:<30} {fix_str}{reset}')
"
}

do_audit() {
  echo -e "${BOLD}${YELLOW}--- ROOT (semantic-release) ---${RESET}"
  print_audit_table "$ROOT_DIR"
  echo ""
  echo -e "${BOLD}${YELLOW}--- FRONTEND (React/Vite) ---${RESET}"
  print_audit_table "$ROOT_DIR/frontend"
  echo ""
  echo -e "${BOLD}${YELLOW}--- BACKEND (NestJS) ---${RESET}"
  print_audit_table "$ROOT_DIR/backend"
}

do_docker_rebuild() {
  echo -e "${BOLD}${YELLOW}--- Docker: prune + rebuild + up ---${RESET}"
  docker system prune -f && docker compose up --build -d
}

do_top_lines() {
  echo -e "${BOLD}${YELLOW}--- Top 5 files by line count ---${RESET}"
  printf "  ${BOLD}%-8s %s${RESET}\n" "Lines" "File"
  printf "  %-8s %s\n" "--------" "$(printf '%0.s-' {1..60})"
  find "$ROOT_DIR" \
    -type f \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" \
    ! -path "*/.git/*" \
    -exec wc -l {} + 2>/dev/null \
    | sort -rn \
    | grep -v '^ *0 ' \
    | grep -v ' total$' \
    | head -5 \
    | awk -v root="$ROOT_DIR/" '{
        lines = $1
        path  = $2
        sub(root, "", path)
        if (lines > 500) color = "\033[0;31m"
        else if (lines > 300) color = "\033[0;33m"
        else color = "\033[0m"
        printf "  %s%-8s %s\033[0m\n", color, lines, path
      }'
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
