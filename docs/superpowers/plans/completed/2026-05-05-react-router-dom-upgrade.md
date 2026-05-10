# react-router-dom 7.15.0 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `react-router-dom` from `7.14.2` to `7.15.0` in the frontend package.

**Architecture:** Edit the version string in `frontend/package.json`, regenerate the lockfile with `npm install`, verify no regressions via type-check and the existing test suite, then open a PR closing #528 and mark #527 as duplicate.

**Tech Stack:** React 19, react-router-dom 7.x, npm, Vitest, TypeScript

---

### Task 1: Bump the version in package.json

**Files:**
- Modify: `frontend/package.json:41`

- [ ] **Step 1: Edit the version string**

In `frontend/package.json`, change line 41:

```json
"react-router-dom": "7.15.0",
```

- [ ] **Step 2: Regenerate the lockfile**

```bash
cd frontend && npm install
```

Expected: npm output shows `react-router-dom@7.15.0` and `react-router@7.15.0` installed. No peer dependency warnings related to react-router.

- [ ] **Step 3: Verify installed version**

```bash
cd frontend && npm list react-router-dom
```

Expected output includes:
```
react-router-dom@7.15.0
```

- [ ] **Step 4: Commit**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "chore(deps): upgrade react-router-dom to 7.15.0"
```

---

### Task 2: Verify no TypeScript regressions

**Files:**
- No changes — verification only

- [ ] **Step 1: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: exits 0 with no errors. If any errors reference react-router types, they are introduced by this bump and must be fixed before proceeding.

---

### Task 3: Run routing-related tests

**Files:**
- No changes — verification only

- [ ] **Step 1: Run full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass. The suite takes ~12 minutes — do not assume it is hung. If any routing-related tests fail, investigate before proceeding.

---

### Task 4: Open PR and close duplicate issue

- [ ] **Step 1: Push branch and open PR**

```bash
gh pr create --title "chore(deps): upgrade react-router-dom to 7.15.0" --body "$(cat <<'EOF'
## Summary

- Bumps `react-router-dom` from `7.14.2` to `7.15.0` in `frontend/package.json`
- `react-router` co-versions at `7.15.0` automatically
- No application code changes required

Closes #528

## Test plan
- [x] `npm install` completes without peer dependency warnings
- [x] `npm list react-router-dom` confirms `7.15.0`
- [x] `npm run type-check` exits 0
- [x] Full frontend test suite passes

🤖 Generated with [Claude Code](https://claude.ai/code)
EOF
)"
```

- [ ] **Step 2: Close duplicate issue**

After the PR is merged, close #527 as a duplicate:

```bash
gh issue close 527 --comment "Duplicate of #528, which was resolved in PR #<PR_NUMBER>."
```
