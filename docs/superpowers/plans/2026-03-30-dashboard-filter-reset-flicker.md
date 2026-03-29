# Dashboard Filter Reset Button Flicker Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Reset button layout shift in `DashboardFilterBar` by wrapping the spinner and Reset button in a shared right-anchored container.

**Architecture:** Replace the standalone `CircularProgress` (with `ml: 'auto'`) and separately rendered Reset button with a single wrapper `Box` that owns the `ml: 'auto'` positioning, keeping both elements anchored to the right regardless of their conditional visibility.

**Tech Stack:** React 19, Material-UI v7, TypeScript

---

### Task 1: Fix Reset button flicker in DashboardFilterBar

**Files:**
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx:285-298`

- [ ] **Step 1: Open the file and confirm the current code**

Read `frontend/src/components/filters/DashboardFilterBar.tsx` around lines 285–298. You should see:

```tsx
      {isFetching && (
        <CircularProgress size={16} sx={{ ml: 'auto' }} />
      )}

      {!isDefault && (
        <Button
          variant="outlined"
          size="small"
          onClick={onReset}
          sx={{ height: 40 }}
        >
          Reset
        </Button>
      )}
```

- [ ] **Step 2: Replace those lines with the wrapper Box**

Replace the block above with:

```tsx
      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
        {isFetching && <CircularProgress size={16} />}
        {!isDefault && (
          <Button
            variant="outlined"
            size="small"
            onClick={onReset}
            sx={{ height: 40 }}
          >
            Reset
          </Button>
        )}
      </Box>
```

`Box` is already imported from `@mui/material` in this file — no new imports needed. Remove the `ml: 'auto'` from `CircularProgress` since the wrapper now owns that.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

```bash
docker compose up -d
```

1. Navigate to the Inventory, Sales, or Purchasing dashboard.
2. Apply any filter so the Reset button appears.
3. Change a filter (e.g., period selector) and watch the Reset button during the fetch.
4. Confirm it stays in place while the spinner appears to its left.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/DashboardFilterBar.tsx
git commit -m "fix(dashboard): prevent Reset button flicker during filter fetch (#222)"
```
