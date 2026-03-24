# PageHeader Action Button Wrapping Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix action buttons wrapping below the title row on desktop by adding `flexWrap: 'nowrap'` to the top row container and `flex: '1 1 auto'` to the title/subtitle block in `PageHeader`.

**Architecture:** Two property additions to the existing sx objects in `PageHeader.tsx`. No structural changes, no new components, no API changes. The responsive `breakpoints.down('sm')` stacking behavior is untouched.

**Tech Stack:** React 19, MUI v7, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-25-issue-182-pageheader-nowrap-fix-design.md`

---

### Task 1: Fix PageHeader flex layout to prevent desktop row wrapping

**Files:**
- Modify: `frontend/src/components/common/PageHeader.tsx:47-57` (top row container)
- Modify: `frontend/src/components/common/PageHeader.tsx:59` (left block)
- Test: `frontend/src/components/common/PageHeader.test.tsx` (existing file)

---

- [ ] **Step 1: Find the existing PageHeader test file and read it**

```bash
cd frontend && npx vitest run src/components/common/PageHeader.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: All existing tests pass. Note what is already covered so you don't duplicate.

- [ ] **Step 2: Apply Change 1 — add `flexWrap: 'nowrap'` to the top row container**

In `frontend/src/components/common/PageHeader.tsx`, find the outer `Box` starting at line ~47:

```tsx
<Box
  sx={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 2,
    [theme.breakpoints.down('sm')]: {
      flexDirection: 'column',
      alignItems: 'flex-start',
    },
  }}
>
```

Add `flexWrap: 'nowrap'` after `gap: 2`:

```tsx
<Box
  sx={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 2,
    flexWrap: 'nowrap',
    [theme.breakpoints.down('sm')]: {
      flexDirection: 'column',
      alignItems: 'flex-start',
    },
  }}
>
```

- [ ] **Step 3: Apply Change 2 — add `flex: '1 1 auto'` to the left block**

Find the left block `Box` at line ~59:

```tsx
<Box sx={{ minWidth: 0 }}>
```

Change it to:

```tsx
<Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 5: Run all PageHeader tests**

```bash
cd frontend && npx vitest run src/components/common/PageHeader.test.tsx --reporter=verbose 2>&1 | tail -40
```

Expected: All tests pass.

- [ ] **Step 6: Run full frontend test suite**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: All tests pass. No regressions.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/PageHeader.tsx
git commit -m "fix(ui): prevent PageHeader action buttons from wrapping on desktop (#182)"
```

---

## Manual QA Checklist (after implementation)

Run the app (`docker compose up -d` or `cd frontend && npm run dev`) and verify:

- [ ] Page with a long title — title wraps within left column, actions stay inline on the right
- [ ] Page with both Primary and Secondary action buttons — both stay on the same row as the title
- [ ] Page with only one action button — same row as title
- [ ] Report page with toolbar slot populated — top row is unaffected by toolbar below
- [ ] Page with meta slot populated — top row is unaffected by meta below
- [ ] Page with both meta and toolbar populated — top row is unaffected
- [ ] Mobile width (< 600px) — stacks correctly: title above, actions below
