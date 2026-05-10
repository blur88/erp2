# PageHeader Spacing Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the gap between `PageHeader` and the content below it from 32px to 16px across the entire application.

**Architecture:** Single one-line change to `PageHeader.tsx` — change `mb: 4` to `mb: 2` in the root `Box` sx prop. No new props, no per-page overrides. All ~75 pages that use `PageHeader` are affected uniformly.

**Tech Stack:** React 19, Material-UI v7, Vitest

---

## File Map

| Action | File |
|--------|------|
| Modify | `frontend/src/components/common/PageHeader.tsx` |
| Test   | `frontend/src/components/common/__tests__/PageHeader.test.tsx` |

---

### Task 1: Reduce PageHeader bottom margin

**Files:**
- Modify: `frontend/src/components/common/PageHeader.tsx:47`
- Test: `frontend/src/components/common/__tests__/PageHeader.test.tsx`

The test suite for `PageHeader` does not currently assert spacing values, so no test changes are needed. The existing tests will continue to pass — they test structure and behavior, not CSS values.

- [ ] **Step 1: Make the change**

In `frontend/src/components/common/PageHeader.tsx`, find the root `Box` `sx` prop (around line 47) and change `mb: 4` to `mb: 2`:

```tsx
// Before
sx={{
  mb: 4,
  pb: 2,
  ...(showDivider && {
    borderBottom: `1px solid ${theme.palette.divider}`,
  }),
}}

// After
sx={{
  mb: 2,
  pb: 2,
  ...(showDivider && {
    borderBottom: `1px solid ${theme.palette.divider}`,
  }),
}}
```

- [ ] **Step 2: Run the PageHeader tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/PageHeader.test.tsx
```

Expected: all tests pass (17 tests). None assert on spacing so no failures expected.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/common/PageHeader.tsx
git commit -m "fix: reduce PageHeader bottom margin from 32px to 16px (closes #271)"
```
