# Refactor Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `do_refactor_radar()` function to `maintain.sh` as Step 7, with three bash-based co-occurrence detectors that identify state clusters, audit manualism, and bloat patterns.

**Architecture:** A single new bash function `do_refactor_radar()` added to `maintain.sh`, wired into the existing STEPS array, `run_step` case, `prompt_next` mapping, and start-step prompt. No new files, no new dependencies. All logic is inline bash using grep, awk, and find.

**Tech Stack:** bash, grep, awk, find — all already used in maintain.sh.

---

## Files

- Modify: `maintain.sh` — add `do_refactor_radar()` function and register it as Step 7

---

### Task 1: Add the `do_refactor_radar` function stub and wire it into the step system

This task establishes the skeleton so the new step is reachable before any detector logic exists.

**Files:**
- Modify: `maintain.sh`

- [ ] **Step 1: Add the function stub after `do_jscpd()`**

In `maintain.sh`, after the closing `}` of `do_jscpd()` (currently line 175), add:

```bash
do_refactor_radar() {
  echo -e "${BOLD}${YELLOW}--- REFACTOR RADAR (Smart Detection) ---${RESET}"
  echo ""
  # detectors will be added in subsequent tasks
}
```

- [ ] **Step 2: Add "Refactor Radar (Smart Detection)" to the STEPS array**

The STEPS array is at line 177. Change it from:

```bash
STEPS=(
  "Knip (dead code / unused deps check)"
  "Outdated packages"
  "Update packages (within semver ranges)"
  "Audit (security vulnerabilities)"
  "Top 5 files by line count"
  "jscpd (copy-paste detection)"
  "Docker: prune + rebuild + up"
)
```

To:

```bash
STEPS=(
  "Knip (dead code / unused deps check)"
  "Outdated packages"
  "Update packages (within semver ranges)"
  "Audit (security vulnerabilities)"
  "Top 5 files by line count"
  "jscpd (copy-paste detection)"
  "Refactor Radar (Smart Detection)"
  "Docker: prune + rebuild + up"
)
```

- [ ] **Step 3: Register the new step in `run_step`**

The `run_step` case statement currently ends at `6) do_docker_rebuild ;;`. Change it to:

```bash
run_step() {
  case "$1" in
    0) do_knip ;;
    1) do_outdated ;;
    2) do_update ;;
    3) do_audit ;;
    4) do_top_lines ;;
    5) do_jscpd ;;
    6) do_refactor_radar ;;
    7) do_docker_rebuild ;;
  esac
}
```

- [ ] **Step 4: Update `prompt_next` to map choice 8 to step 7**

`prompt_next` currently maps choices 1–7 to steps 0–6. Add the new mapping and update Docker to choice 8:

```bash
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
      8) echo "7" ; return ;;
      [Rr]) echo "$current" ; return ;;
      [Qq]) echo "-1" ; return ;;
      *) echo -e "${RED}Invalid choice.${RESET}" >&2 ;;
    esac
  done
}
```

- [ ] **Step 5: Update the start-step prompt range**

Near the bottom of the file, the start prompt currently reads `Start with (1–7):` and accepts `1|2|3|4|5|6|7`. Update both:

```bash
while true; do
  read -rp "$(echo -e "${BOLD}Start with (1–8): ${RESET}")" start
  case "$start" in
    1|2|3|4|5|6|7|8) current=$((start-1)) ; break ;;
    *) echo -e "${RED}Please enter 1–8.${RESET}" ;;
  esac
done
```

- [ ] **Step 6: Verify the script is syntactically valid**

```bash
bash -n maintain.sh
```

Expected: no output (syntax OK).

- [ ] **Step 7: Commit**

```bash
git add maintain.sh
git commit -m "feat: wire Refactor Radar as Step 7 in maintain.sh (stub)"
```

---

### Task 2: Implement the State Cluster Detector

Scans `frontend/src/pages/**/*.tsx` for files where ≥3 of the known report-state `useState` variable names co-occur.

**Files:**
- Modify: `maintain.sh` (replace the stub comment inside `do_refactor_radar`)

- [ ] **Step 1: Replace the stub comment with the State Cluster detector block**

Inside `do_refactor_radar()`, replace `# detectors will be added in subsequent tasks` with:

```bash
  # ── [1/3] State Cluster Detector ─────────────────────────────────────────
  echo -e "${BOLD}${YELLOW}[1/3] State Cluster Detector (Frontend)${RESET}"
  local frontend_pages="$ROOT_DIR/frontend/src/pages"
  local state_vars=("dateFrom" "dateTo" "loading" "categories" "products" "selectedProduct" "selectedCategory")
  local cluster_found=0

  while IFS= read -r -d '' file; do
    local hits=()
    for var in "${state_vars[@]}"; do
      if grep -q "useState.*${var}\|${var}.*useState\|const \[${var}" "$file" 2>/dev/null; then
        hits+=("$var")
      fi
    done
    if [[ ${#hits[@]} -ge 3 ]]; then
      cluster_found=1
      local rel="${file#$ROOT_DIR/frontend/src/}"
      echo -e "  ${RED}⚠  ${rel}${RESET}"
      echo -e "     Found: $(IFS=', '; echo "${hits[*]}")"
      echo -e "     ${CYAN}→ Extract into useReportFilters hook${RESET}"
      echo ""
    fi
  done < <(find "$frontend_pages" -name "*.tsx" -print0 2>/dev/null)

  if [[ $cluster_found -eq 0 ]]; then
    echo -e "  ${GREEN}✓  No state clusters found.${RESET}"
  fi
  echo ""

  # detectors 2 and 3 will be added in subsequent tasks
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n maintain.sh
```

Expected: no output.

- [ ] **Step 3: Smoke-test the detector**

```bash
bash maintain.sh
```

Enter `7` to start at Step 7 (Refactor Radar). You should see ~13 flagged files including `pages/sales/CustomerOrderHistory.tsx` and `pages/sales/SalesByProductSummary.tsx`. Each listing should show the detected variable names and the `→ Extract into useReportFilters hook` hint.

- [ ] **Step 4: Commit**

```bash
git add maintain.sh
git commit -m "feat: add State Cluster detector to Refactor Radar"
```

---

### Task 3: Implement the Audit Manualism Detector

Scans `backend/src/modules/**/*.controller.ts` for files that both declare `@CurrentUser('userId')` and pass `currentUserId` as a service argument — counting how many endpoints do this.

**Files:**
- Modify: `maintain.sh`

- [ ] **Step 1: Replace `# detectors 2 and 3 will be added in subsequent tasks` with the Audit Manualism block**

```bash
  # ── [2/3] Audit Manualism Detector ───────────────────────────────────────
  echo -e "${BOLD}${YELLOW}[2/3] Audit Manualism Detector (Backend)${RESET}"
  local backend_modules="$ROOT_DIR/backend/src/modules"
  local audit_found=0

  while IFS= read -r -d '' file; do
    # Must contain both signals to be flagged
    if grep -q "@CurrentUser('userId')" "$file" 2>/dev/null && \
       grep -q "currentUserId" "$file" 2>/dev/null; then
      local count
      count=$(grep -c "currentUserId" "$file" 2>/dev/null || echo 0)
      audit_found=1
      local rel="${file#$ROOT_DIR/backend/src/}"
      echo -e "  ${RED}⚠  ${rel}${RESET}"
      echo -e "     ${count} endpoint(s) pass currentUserId manually"
      echo -e "     ${CYAN}→ Consider a @CurrentUserAudit() interceptor or shared AuditService${RESET}"
      echo ""
    fi
  done < <(find "$backend_modules" -name "*.controller.ts" -print0 2>/dev/null)

  if [[ $audit_found -eq 0 ]]; then
    echo -e "  ${GREEN}✓  No audit manualism found.${RESET}"
  fi
  echo ""

  # detector 3 will be added in the next task
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n maintain.sh
```

Expected: no output.

- [ ] **Step 3: Smoke-test**

```bash
bash maintain.sh
```

Enter `7`. The Audit Manualism section should flag controllers in `modules/sales/controllers/`, `modules/inventory/controllers/`, and `modules/purchasing/controllers/`. Each should show a count and the interceptor suggestion.

- [ ] **Step 4: Commit**

```bash
git add maintain.sh
git commit -m "feat: add Audit Manualism detector to Refactor Radar"
```

---

### Task 4: Implement the Dependency/Bloat Detector

Two sub-checks: frontend pages with >10 `useState` calls, and backend files with >5 constructor-injected dependencies.

**Files:**
- Modify: `maintain.sh`

- [ ] **Step 1: Replace `# detector 3 will be added in the next task` with the Bloat detector block**

```bash
  # ── [3/3] Dependency/Bloat Detector ──────────────────────────────────────
  echo -e "${BOLD}${YELLOW}[3/3] Dependency/Bloat Detector${RESET}"

  # Frontend: >10 useState calls in a single page component
  echo -e "  ${BOLD}Frontend bloat (>10 useState calls):${RESET}"
  local fe_bloat_found=0
  while IFS= read -r -d '' file; do
    local count
    count=$(grep -c "useState" "$file" 2>/dev/null || echo 0)
    if [[ $count -gt 10 ]]; then
      fe_bloat_found=1
      local rel="${file#$ROOT_DIR/frontend/src/}"
      echo -e "    ${RED}⚠  ${rel}${RESET}"
      echo -e "       ${count} useState calls — component may need splitting"
    fi
  done < <(find "$frontend_pages" -name "*.tsx" -print0 2>/dev/null)
  if [[ $fe_bloat_found -eq 0 ]]; then
    echo -e "    ${GREEN}✓  No issues found.${RESET}"
  fi
  echo ""

  # Backend: >5 constructor-injected dependencies
  echo -e "  ${BOLD}Backend bloat (>5 constructor deps):${RESET}"
  local be_bloat_found=0
  while IFS= read -r -d '' file; do
    local count
    count=$(awk '/constructor\(/{found=1} found && /private |readonly /{n++} found && /\)/{if(found){print n; n=0; found=0}}' "$file" 2>/dev/null | sort -rn | head -1)
    count=${count:-0}
    if [[ $count -gt 5 ]]; then
      be_bloat_found=1
      local rel="${file#$ROOT_DIR/backend/src/}"
      echo -e "    ${RED}⚠  ${rel}${RESET}"
      echo -e "       ${count} constructor dependencies — consider splitting responsibilities"
    fi
  done < <(find "$backend_modules" -name "*.ts" -print0 2>/dev/null)
  if [[ $be_bloat_found -eq 0 ]]; then
    echo -e "    ${GREEN}✓  No issues found.${RESET}"
  fi
  echo ""
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n maintain.sh
```

Expected: no output.

- [ ] **Step 3: Smoke-test**

```bash
bash maintain.sh
```

Enter `7`. The Bloat section should show:
- Frontend: multiple pages flagged (e.g. `CustomerOrderHistory.tsx` has 30+ useState calls)
- Backend: any service/controller with >5 injected constructor deps flagged

Both sub-sections should print `✓  No issues found.` if none exist, or list the offending files.

- [ ] **Step 4: Commit**

```bash
git add maintain.sh
git commit -m "feat: add Dependency/Bloat detector to Refactor Radar"
```

---

### Task 5: End-to-end verification

Run the full step sequence to confirm all three detectors work together cleanly with no regressions.

**Files:**
- No changes

- [ ] **Step 1: Run a full maintain.sh session starting at Step 7**

```bash
bash maintain.sh
```

Enter `7`. Verify:
1. Header `--- REFACTOR RADAR (Smart Detection) ---` appears
2. `[1/3] State Cluster Detector` runs and flags report pages
3. `[2/3] Audit Manualism Detector` runs and flags controllers
4. `[3/3] Dependency/Bloat Detector` runs with both sub-sections
5. After the step completes, the `What next?` menu shows all 8 options (1–8 + r + q)
6. Choosing `8` runs Docker rebuild (step 7, index 7)
7. Choosing `q` exits cleanly

- [ ] **Step 2: Verify Docker step still works from the menu**

After running Refactor Radar, choose `8` from the menu. Verify the Docker step header appears:
```
========================================
  Docker: prune + rebuild + up
========================================
```
(You can immediately choose `q` to cancel — just confirm the header loads.)

- [ ] **Step 3: Verify start-from-beginning still works**

```bash
bash maintain.sh
```

Enter `1`. Confirm Knip runs normally.

- [ ] **Step 4: Final commit (if any fixups were needed)**

If any cosmetic fixes were made during verification:

```bash
git add maintain.sh
git commit -m "fix: refactor-radar end-to-end verification fixups"
```

If no changes were needed, skip this step.
