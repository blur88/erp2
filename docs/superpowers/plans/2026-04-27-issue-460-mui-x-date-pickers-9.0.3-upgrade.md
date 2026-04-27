# @mui/x-date-pickers 9.0.3 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump `@mui/x-date-pickers` from 9.0.2 to 9.0.3 in the frontend to pick up four bug fixes (disabled-state border color, `data-*`/`aria-*` attribute forwarding, `AdapterDayjs` drag fix, `K`/`k` hour token support).

**Architecture:** Single version change in `frontend/package.json`, followed by a lockfile refresh. No code changes required — 9.0.3 contains only bug fixes and no breaking changes for `@mui/x-date-pickers`.

**Tech Stack:** Node.js ≥20, npm, @mui/x-date-pickers, Vitest

---

### Task 1: Bump @mui/x-date-pickers and refresh lockfile

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json` (auto-generated)

- [ ] **Step 1: Create a feature branch**

```bash
git checkout -b chore/issue-460-mui-x-date-pickers-9.0.3
```

Expected: switched to a new branch `chore/issue-460-mui-x-date-pickers-9.0.3`

- [ ] **Step 2: Update the version pin**

In `frontend/package.json`, change:

```json
"@mui/x-date-pickers": "9.0.2",
```

to:

```json
"@mui/x-date-pickers": "9.0.3",
```

- [ ] **Step 3: Install and refresh the lockfile**

```bash
cd frontend && npm install
```

Expected: npm resolves `@mui/x-date-pickers` 9.0.3 and updates `package-lock.json`. No peer dependency errors or ERESOLVE warnings.

- [ ] **Step 4: Verify the installed version**

```bash
cd frontend && npm ls @mui/x-date-pickers
```

Expected output includes:

```
@mui/x-date-pickers@9.0.3
```

- [ ] **Step 5: Run the frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: exits with 0 errors.

- [ ] **Step 6: Run a targeted smoke test on date-picker-related tests**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | grep -i "date\|picker\|calendar" | head -30
```

If no date/picker test files exist, run the full suite smoke sample instead:

```bash
cd frontend && npx vitest run src/components --reporter=verbose 2>&1 | tail -20
```

Expected: all matched tests pass, no failures.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): bump @mui/x-date-pickers from 9.0.2 to 9.0.3"
```

---

### Task 2: Open PR and close issue

**Files:** (none — GitHub operations only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin chore/issue-460-mui-x-date-pickers-9.0.3
```

- [ ] **Step 2: Create the pull request**

```bash
gh pr create \
  --title "chore(deps): bump @mui/x-date-pickers from 9.0.2 to 9.0.3" \
  --body "$(cat <<'EOF'
## Summary

- Bumps `@mui/x-date-pickers` from 9.0.2 to 9.0.3 in `frontend/package.json`
- Patch release — bug fixes only, no breaking changes for date pickers
- Release highlights: disabled-state border color fix, `data-*`/`aria-*` attribute forwarding, AdapterDayjs drag fix, K/k hour token support

Closes #460
EOF
)"
```

- [ ] **Step 3: Merge the PR**

```bash
gh pr merge --merge --delete-branch
```

Expected: PR merged and branch deleted.
