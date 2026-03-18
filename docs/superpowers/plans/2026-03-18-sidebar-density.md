# Sidebar Density Adjustment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce expanded sidebar item heights (44px → 40px top-level, 40px → 36px flyout) for denser ERP navigation.

**Architecture:** Two height value changes in `Sidebar.tsx`. No new files, no test changes, no logic changes.

**Tech Stack:** React, Material UI v7, Vitest

---

## Files

- Modify: `frontend/src/components/common/Sidebar.tsx`

---

### Task 1: Reduce `renderMenuItem` item height from 44px to 40px

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Locate the target line**

In `renderMenuItem` (around line 1084), find the `ListItemButton` sx in the final `return` block — the one that handles expanded sidebar items. It is the **third and last** return statement in `renderMenuItem`, after the two collapsed early-returns. Its `height` is `44`.

- [ ] **Step 2: Make the change**

```diff
-              height: 44,
+              height: 40,
```

There is exactly one `height: 44` in this block. Do not touch the `height: 44` values at lines ~999 and ~1041 — those are inside the collapsed rail early-returns and are out of scope.

- [ ] **Step 3: Run frontend tests to confirm nothing broke**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: reduce expanded sidebar top-level item height 44px → 40px"
```

---

### Task 2: Reduce `renderFlyoutItem` item height from 40px to 36px

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Locate the target line**

In `renderFlyoutItem` (around line 833), find the `ListItemButton` sx prop. Its `height` is `40`.

- [ ] **Step 2: Make the change**

```diff
-            height: 40,
+            height: 36,
```

- [ ] **Step 3: Run frontend tests to confirm nothing broke**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: reduce flyout panel item height 40px → 36px"
```

---

## Verification

After both tasks:

```bash
cd frontend && npm run test
```

Expected: full test suite passes. No sidebar tests assert on pixel heights, so no test updates are needed.

Visual check: open the sidebar in a browser, expand a section, and confirm items are noticeably more compact. Collapsed rail should look unchanged.
