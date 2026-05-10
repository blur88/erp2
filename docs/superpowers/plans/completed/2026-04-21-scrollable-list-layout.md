# Scrollable List Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all `GenericListPage`-based pages so the list panel scrolls independently while the page header and filter bar remain fixed in the viewport.

**Architecture:** A single property change in `MainLayout.tsx` — the `<main>` Box changes from `minHeight: '100vh'` to `height: '100%'`. The flex chain below (`GenericListPage` → `MasterDetailWorkspace` → `EntityTable`) is already correctly set up with `flex: 1`, `minHeight: 0`, and `overflow: auto`; they just need their parent to be height-constrained.

**Tech Stack:** React 19, Material-UI v7, Vitest (frontend tests)

---

### Task 1: Fix MainLayout height constraint

**Files:**
- Modify: `frontend/src/components/common/MainLayout.tsx:82-98`

- [ ] **Step 1: Open the file and locate the `<main>` Box**

The `<main>` Box starts at line 82. It currently has:
```tsx
<Box
  component="main"
  sx={{
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    pt: 11,
    px: { xs: 2, sm: 3 },
    pb: 3,
    bgcolor: 'background.default',
    minHeight: '100vh',   // <-- this is the problem
    overflow: 'hidden',
    maxWidth: '100%',
  }}
>
```

- [ ] **Step 2: Change `minHeight: '100vh'` to `height: '100%'`**

Replace the `<main>` Box sx prop so it reads:
```tsx
<Box
  component="main"
  sx={{
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    pt: 11,
    px: { xs: 2, sm: 3 },
    pb: 3,
    bgcolor: 'background.default',
    height: '100%',
    overflow: 'hidden',
    maxWidth: '100%',
  }}
>
```

- [ ] **Step 3: Run the frontend type-check to confirm no errors**

```bash
cd frontend && npm run type-check
```
Expected: exits with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/MainLayout.tsx
git commit -m "fix(layout): constrain main content area height so list panels scroll independently (issue #403)"
```

---

### Task 2: Verify in the browser

- [ ] **Step 1: Start the frontend dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Open the Chart of Accounts page**

Navigate to `/accounting/chart-of-accounts`. Add enough accounts that the list overflows (or reduce the browser window height). Confirm:
- The list panel scrolls independently with its own scrollbar
- The page header ("Chart of Accounts" title + filter bar) stays fixed at the top
- The right-side workspace card stays in place

- [ ] **Step 3: Check other list pages**

Repeat the scroll check on:
- Inventory → Products (or any inventory list page)
- Sales → Orders (or any sales list page)
- Purchasing → Purchase Orders (or any purchasing list page)

Each should show the same behaviour: list scrolls, header fixed.

- [ ] **Step 4: Check short pages**

Navigate to Settings and Dashboard. Confirm pages with little content are not visually clipped or broken.

- [ ] **Step 5: Check mobile layout**

Narrow the browser window to < 960px (MUI `md` breakpoint). On the COA page the layout switches to a stacked column. Confirm rows stack normally and the page still scrolls as a whole on mobile (the constrained-height behaviour is desktop-only by design since `MasterDetailWorkspace` renders a column on mobile).

- [ ] **Step 6: Stop the dev server and commit verification note**

No code changes needed if all checks pass. If a regression is found, fix it before committing.

---

### Task 3: Update frontend snapshot / unit tests if needed

**Files:**
- Test: `frontend/src/components/common/__tests__/MainLayout.test.tsx` (if it exists)

- [ ] **Step 1: Check if a MainLayout test exists**

```bash
cd frontend && npx vitest run src/components/common --reporter=verbose 2>&1 | head -40
```

- [ ] **Step 2: If snapshot tests fail due to the sx change, update snapshots**

```bash
cd frontend && npx vitest run src/components/common -u
```
Expected: snapshots updated, all tests pass.

- [ ] **Step 3: Run the full component test suite to check for regressions**

```bash
cd frontend && npx vitest run src/components/common
```
Expected: all tests pass.

- [ ] **Step 4: Commit updated snapshots if any were changed**

```bash
git add frontend/src/components/common/__tests__/
git commit -m "test(layout): update snapshots after main content height constraint fix (issue #403)"
```

If no snapshot files changed, skip this commit.

---

### Task 4: Close the issue via PR

- [ ] **Step 1: Push the branch**

```bash
git push
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create \
  --title "fix(layout): scrollable list panels, fixed page header (#403)" \
  --body "$(cat <<'EOF'
## Summary

- Change `<main>` Box in `MainLayout.tsx` from `minHeight: '100vh'` to `height: '100%'`
- This gives the flex chain below a concrete height to constrain against; `GenericListPage`, `MasterDetailWorkspace`, and `EntityTable` already had the correct `flex: 1 / minHeight: 0 / overflow: auto` properties in place
- All pages using `GenericListPage` (COA, Inventory, Sales, Purchasing) now scroll the list panel independently while keeping the header fixed

Closes #403

## Test plan

- [ ] COA list scrolls independently; page header + filter bar stay fixed
- [ ] Inventory, Sales, Purchasing list pages behave the same
- [ ] Settings and Dashboard (short pages) render correctly
- [ ] Mobile stacked layout renders correctly at < 960px

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
