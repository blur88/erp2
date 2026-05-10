# Update jsdom to 29.1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the `jsdom` development dependency in the `frontend` module to version `29.1.1` to stay current.

**Architecture:** Issue-first workflow. Use GitHub CLI to create a tracking issue, then apply the dependency update using npm.

**Tech Stack:** GitHub CLI (`gh`), npm, Vitest.

---

### Task 1: Create GitHub Issue

**Files:**
- N/A (creates a remote resource)

- [ ] **Step 1: Create the GitHub issue**

Run:
```bash
gh issue create --title "chore(deps): update jsdom to 29.1.1" --body "Update the \`jsdom\` development dependency in the \`frontend\` module to ensure the project stays current with the latest patch releases.

**Rationale:**
Maintenance update. \`jsdom\` is currently at version \`29.1.0\`. Moving to \`29.1.1\` maintains environment parity with the latest upstream fixes.

**Impact:**
- **Module:** \`frontend\`
- **Scope:** Unit testing environment (Vitest/Testing Library).

**Proposed Checklist:**
- [ ] Update \`jsdom\` in \`frontend/package.json\` to \`29.1.1\`.
- [ ] Regenerate \`frontend/package-lock.json\` via \`npm install\`.
- [ ] Verify changes by running the frontend test suite: \`cd frontend && npm run test\`."
```
Expected: Output containing the URL of the new issue.

---

### Task 2: Update jsdom Dependency

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

- [ ] **Step 1: Update jsdom version in package.json**

Run:
```bash
cd frontend && npm install jsdom@29.1.1 --save-dev
```
Expected: `frontend/package.json` reflects `"jsdom": "29.1.1"` and `package-lock.json` is updated.

- [ ] **Step 2: Verify the change in package.json**

Run:
```bash
grep "jsdom" frontend/package.json
```
Expected: `"jsdom": "29.1.1"`

---

### Task 3: Verification

**Files:**
- Test: `frontend/src/**/__tests__/*.test.tsx` (existing tests)

- [ ] **Step 1: Run frontend tests**

Run:
```bash
cd frontend && npm run test
```
Expected: All tests pass.

- [ ] **Step 2: Commit changes**

Run:
```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): update jsdom to 29.1.1"
```
Expected: Successful commit.
