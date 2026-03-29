# DashboardFilterBar Reset Button Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the Reset button in `DashboardFilterBar` from `variant="outlined"` to `variant="text"` with explicit left margin and opacity control to improve visual hierarchy.

**Architecture:** Single-file change in the React component. No new files, no backend changes, no migrations. The button already conditionally renders only when `!isDefault` — that behavior is unchanged.

**Tech Stack:** React 19, MUI v7, Vitest (frontend tests)

---

### Task 1: Update the Reset button in DashboardFilterBar

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardFilterBar.tsx:220-224`

- [ ] **Step 1: Open the file and locate the Reset button**

The current button is at line 220–224:

```tsx
{!isDefault && (
  <Button variant="outlined" color="inherit" size="small" onClick={onReset}>
    Reset
  </Button>
)}
```

- [ ] **Step 2: Replace the button with the new implementation**

```tsx
{!isDefault && (
  <Button
    variant="text"
    color="inherit"
    size="small"
    onClick={onReset}
    sx={{ ml: 2, opacity: 0.8, '&:hover': { opacity: 1, backgroundColor: 'transparent' } }}
  >
    Reset
  </Button>
)}
```

- [ ] **Step 3: Run the frontend tests to confirm nothing broke**

```bash
cd frontend && npm run test
```

Expected: all tests pass (no snapshot failures — this component has no snapshot tests).

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/DashboardFilterBar.tsx
git commit -m "fix(dashboard): improve Reset button visual hierarchy (#211)

- variant: outlined → text (removes border, lowers visual weight)
- ml: 2 adds explicit left margin for clear separation from filters
- opacity 0.8 at rest prevents invisibility on dark theme
- hover restores full opacity and suppresses ghost background"
```
