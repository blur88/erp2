# Top Bar Polish Pass (Issue #140) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply targeted visual polish to `TopBar.tsx` and `SystemStatus.tsx` — stronger breadcrumb hierarchy contrast, 16px right-side spacing, and unified hover treatment on the status and notification icons.

**Architecture:** Two-file targeted edits only. `TopBar.tsx` receives breadcrumb color/weight tweaks, right-side gap increase, and notification hover. `SystemStatus.tsx` receives an `sx` hover prop on its `IconButton`. No new files, no new components, no structural changes.

**Tech Stack:** React 19, Material-UI v7, TypeScript, Vitest (frontend tests)

---

## Files changed

| File | Change |
|---|---|
| `frontend/src/components/common/TopBar.tsx` | Breadcrumb colors, fontWeight, hover; right-side gap; notification IconButton hover |
| `frontend/src/components/common/SystemStatus.tsx` | IconButton hover style |
| `frontend/src/components/common/__tests__/TopBar.test.tsx` | Update/verify tests still pass |

---

### Task 1: Breadcrumb hierarchy — TopBar.tsx

Update breadcrumb ancestor color, separator color, current-page fontWeight, and add hover to navigable ancestor links.

**Files:**
- Modify: `frontend/src/components/common/TopBar.tsx`
- Test: `frontend/src/components/common/__tests__/TopBar.test.tsx`

- [ ] **Step 1: Read the existing tests**

  ```bash
  cd frontend && npx vitest run src/components/common/__tests__/TopBar.test.tsx --reporter=verbose 2>&1 | tail -30
  ```

  Expected: all tests pass. Note current test count as baseline.

- [ ] **Step 2: Update ancestor Link color and add hover**

  In `TopBar.tsx`, find the navigable ancestor `Link` (around line 276–285). Change `color` from `#A0A0A0` to `#8A8A8A` and add `'&:hover': { color: '#CFCFCF' }`:

  ```tsx
  <Link
    key={segment.path}
    component={RouterLink}
    to={segment.path}
    underline="hover"
    sx={{ fontSize: '12px', color: '#8A8A8A', '&:hover': { color: '#CFCFCF' } }}
  >
    {segment.label}
  </Link>
  ```

- [ ] **Step 3: Update non-navigable ancestor Typography color**

  Find the non-navigable ancestor `Typography` (around line 288–291). Change `color` from `#A0A0A0` to `#8A8A8A`:

  ```tsx
  <Typography key={segment.path} sx={{ fontSize: '12px', color: '#8A8A8A' }}>
    {segment.label}
  </Typography>
  ```

- [ ] **Step 4: Update separator color**

  Find the `NavigateNextIcon` separator (around line 259). Change `color` from `#6B7280` to `#5A5A5A`:

  ```tsx
  separator={<NavigateNextIcon sx={{ fontSize: 14, color: '#5A5A5A' }} />}
  ```

- [ ] **Step 5: Add fontWeight to current-page Typography**

  Find the last-segment `Typography` (around line 267–270). Add `fontWeight: 500`:

  ```tsx
  <Typography key={segment.path} sx={{ fontSize: '12px', color: '#E0E0E0', fontWeight: 500 }}>
    {segment.label}
  </Typography>
  ```

- [ ] **Step 6: Run tests and verify they still pass**

  ```bash
  cd frontend && npx vitest run src/components/common/__tests__/TopBar.test.tsx --reporter=verbose 2>&1 | tail -30
  ```

  Expected: same test count as Step 1, all passing. No snapshot diffs should cause failures — color values are in `sx` props, not rendered text.

- [ ] **Step 7: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | tail -20
  ```

  Expected: no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add frontend/src/components/common/TopBar.tsx
  git commit -m "style: strengthen breadcrumb hierarchy contrast and add ancestor hover"
  ```

---

### Task 2: Right-side spacing — TopBar.tsx

Increase the right-side action cluster gap from 4px to 16px.

**Files:**
- Modify: `frontend/src/components/common/TopBar.tsx`

- [ ] **Step 1: Update gap value**

  Find the right-side `Box` (around line 298). Change `gap: 0.5` to `gap: 2`:

  ```tsx
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
  ```

  This applies to all three children: search bar (lg+ only), SystemStatus icon, and notification button.

- [ ] **Step 2: Run tests**

  ```bash
  cd frontend && npx vitest run src/components/common/__tests__/TopBar.test.tsx --reporter=verbose 2>&1 | tail -20
  ```

  Expected: all pass.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/common/TopBar.tsx
  git commit -m "style: increase top bar right-side action spacing to 16px"
  ```

---

### Task 3: Notification button hover — TopBar.tsx

Add hover background to the notification `IconButton` to match the SystemStatus icon treatment.

**Files:**
- Modify: `frontend/src/components/common/TopBar.tsx`

- [ ] **Step 1: Add sx prop to notification IconButton**

  Find the notification `IconButton` (around line 342). Add `sx`:

  ```tsx
  <Tooltip title="Notifications">
    <IconButton
      onClick={(event) => setNotificationAnchorEl(event.currentTarget)}
      color="inherit"
      sx={{ '&:hover': { bgcolor: '#2A2A2A', borderRadius: '8px' } }}
    >
      <Badge badgeContent={unreadCount} color="error">
        <NotificationsIcon />
      </Badge>
    </IconButton>
  </Tooltip>
  ```

- [ ] **Step 2: Run tests**

  ```bash
  cd frontend && npx vitest run src/components/common/__tests__/TopBar.test.tsx --reporter=verbose 2>&1 | tail -20
  ```

  Expected: all pass.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/common/TopBar.tsx
  git commit -m "style: add hover treatment to notification IconButton"
  ```

---

### Task 4: SystemStatus hover — SystemStatus.tsx

Add hover background to the `IconButton` in `SystemStatus.tsx`.

**Files:**
- Modify: `frontend/src/components/common/SystemStatus.tsx`

- [ ] **Step 1: Add sx prop to the IconButton**

  Find the `IconButton` at around line 148. Add `sx`:

  ```tsx
  <IconButton
    onClick={handleClick}
    color="inherit"
    size="small"
    sx={{ '&:hover': { bgcolor: '#2A2A2A', borderRadius: '8px' } }}
  >
  ```

- [ ] **Step 2: Run full frontend test suite**

  ```bash
  cd frontend && npm run test 2>&1 | tail -30
  ```

  Expected: all tests pass.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | tail -20
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/common/SystemStatus.tsx
  git commit -m "style: add hover treatment to SystemStatus IconButton"
  ```

---

### Task 5: Final verification

Confirm all changes are correct and the full test suite is green.

**Files:** none

- [ ] **Step 1: Run full frontend test suite**

  ```bash
  cd frontend && npm run test 2>&1 | tail -30
  ```

  Expected: all tests pass.

- [ ] **Step 2: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | tail -20
  ```

  Expected: no errors.

- [ ] **Step 3: Lint**

  ```bash
  cd frontend && npm run lint 2>&1 | tail -20
  ```

  Expected: no errors.

- [ ] **Step 4: Verify exact values in source**

  Spot-check these values are present in the source:

  | File | What to check |
  |---|---|
  | `TopBar.tsx` | Ancestor link `color: '#8A8A8A'` |
  | `TopBar.tsx` | Ancestor link hover `color: '#CFCFCF'` |
  | `TopBar.tsx` | Separator `color: '#5A5A5A'` |
  | `TopBar.tsx` | Current page `fontWeight: 500` |
  | `TopBar.tsx` | Right-side Box `gap: 2` |
  | `TopBar.tsx` | Notification button `bgcolor: '#2A2A2A'` on hover |
  | `SystemStatus.tsx` | IconButton `bgcolor: '#2A2A2A'` on hover |

  ```bash
  grep -n "8A8A8A\|5A5A5A\|CFCFCF\|fontWeight: 500\|gap: 2\|2A2A2A" frontend/src/components/common/TopBar.tsx
  grep -n "2A2A2A" frontend/src/components/common/SystemStatus.tsx
  ```

  Expected: each pattern appears in the correct location.
