# react-router-dom v7.14.0 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump `react-router-dom` from `7.13.2` to `7.14.0` in the frontend with no code changes required.

**Architecture:** This is a single dependency version bump. The app uses react-router-dom in library mode (`createBrowserRouter`), so none of the v7.14.0 breaking changes apply. Verification is via type-check and targeted tests.

**Tech Stack:** React 19, react-router-dom, Vitest, TypeScript

---

## File Map

| File | Change |
|---|---|
| `frontend/package.json` | Update `react-router-dom` version string |
| `frontend/package-lock.json` | Auto-updated by `npm install` |

---

### Task 1: Bump the version and install

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Update the version in package.json**

In `frontend/package.json`, change:
```json
"react-router-dom": "7.13.2",
```
to:
```json
"react-router-dom": "7.14.0",
```

- [ ] **Step 2: Install updated dependencies**

```bash
cd frontend && npm install
```

Expected: install completes without errors. `package-lock.json` updated.

- [ ] **Step 3: Verify the installed version**

```bash
cd frontend && npm list react-router-dom
```

Expected output contains:
```
react-router-dom@7.14.0
```

---

### Task 2: Type-check

**Files:**
- No changes — verification only

- [ ] **Step 1: Run TypeScript type check**

```bash
cd frontend && npm run type-check
```

Expected: exits with code 0, no errors printed.

---

### Task 3: Run targeted tests

**Files:**
- No changes — verification only

- [ ] **Step 1: Run router tests**

```bash
cd frontend && npx vitest run src/__tests__/router.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Run route error boundary tests**

```bash
cd frontend && npx vitest run src/components/errors/RouteErrorBoundary.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Run protected route tests**

```bash
cd frontend && npx vitest run src/components/auth/__tests__/ProtectedRoute.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Run login page tests**

```bash
cd frontend && npx vitest run src/pages/auth/__tests__/LoginPage.test.tsx
```

Expected: all tests pass.

---

### Task 4: Commit

- [ ] **Step 1: Stage and commit**

```bash
cd frontend && git add package.json package-lock.json
cd .. && git commit -m "chore(deps): upgrade react-router-dom to 7.14.0 (#263)"
```

Expected: commit succeeds.

---

## Post-implementation smoke test (optional, manual)

If running Docker:

```bash
docker compose build frontend && docker compose up -d frontend
```

Then verify in browser:
- Login flow works
- Navigation between pages works (Inventory, Sales, Purchasing, Accounting)
- 404 page shows for unknown routes
