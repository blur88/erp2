# Reports Flyout: Category-First Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the collapsed sidebar Reports flyout from a flat 24-item list into a category-first accordion that shows only Sales, Purchasing, Inventory, Accounting headers initially, expanding one at a time on click.

**Architecture:** Add `flyoutMode: 'category-first'` flag to the Reports `MenuItem`, add `flyoutExpandedGroup: string | null` state to the Sidebar component, and render a dedicated category-first layout at the Popper root when this flag is set — leaving all other flyout paths and the expanded sidebar completely untouched.

**Tech Stack:** React 19, MUI v7 (`ListItemButton`, `Collapse`, `Popper`, `Fade`, `Paper`), Vitest + React Testing Library, TypeScript

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/common/Sidebar.tsx` | Add `flyoutMode` to `MenuItem` type; add `flyoutExpandedGroup` state; add category-first render branch in Popper block; update `openFlyout` and state-reset locations; update Paper sizing |
| `frontend/src/components/common/__tests__/Sidebar.test.tsx` | Add 8 new test cases for the category-first flyout; keep all existing tests unchanged |

No other files change.

---

## Task 1: Add `flyoutMode` to `MenuItem` type and set it on Reports

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx` (MenuItem interface, Reports item definition ~line 316)

- [ ] **Step 1: Write the failing type-check**

In `frontend/src/components/common/__tests__/Sidebar.test.tsx`, this is a compile-time change — no runtime test needed for the type itself. Instead, verify the build catches the type before implementation by confirming `flyoutMode` does NOT exist yet:

```bash
cd frontend && grep -n "flyoutMode" src/components/common/Sidebar.tsx
```
Expected: no output (field does not exist yet).

- [ ] **Step 2: Add `flyoutMode` to the `MenuItem` interface**

In `Sidebar.tsx`, find the `MenuItem` interface (around line 85 — search for `interface MenuItem`). Add the optional field:

```ts
interface MenuItem {
  id: string
  title: string
  icon: React.ReactNode
  path?: string
  children?: MenuItem[]
  group?: string
  badge?: number
  flyoutMode?: 'category-first'   // <-- add this line
}
```

- [ ] **Step 3: Set `flyoutMode` on the Reports menu item**

Find the Reports item definition (around line 316 — search for `id: 'reports'`). Add the field:

```ts
{
  id: 'reports',
  title: 'Reports',
  icon: <AssessmentIcon />,
  flyoutMode: 'category-first',   // <-- add this line
  children: [
    // ... existing children unchanged
  ],
},
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: add flyoutMode field to MenuItem type, set category-first on Reports"
```

---

## Task 2: Add `flyoutExpandedGroup` state and wire reset locations

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx` (state declaration ~line 673, `openFlyout` ~line 693, `closeFlyout` ~line 718, location-change `useEffect` ~line 756)

- [ ] **Step 1: Add the state declaration**

After line 673 (`const [flyoutExpandedIds, setFlyoutExpandedIds] = ...`), add:

```ts
const [flyoutExpandedGroup, setFlyoutExpandedGroup] = React.useState<string | null>(null)
```

- [ ] **Step 2: Reset in `closeFlyout` cleanup**

Inside the `clearFlyoutStateTimerRef.current = setTimeout(...)` callback in `closeFlyout` (around line 723), add `setFlyoutExpandedGroup(null)` alongside the existing clears:

```ts
clearFlyoutStateTimerRef.current = setTimeout(() => {
  setFlyoutItemId(null)
  setFlyoutAnchorEl(null)
  setFlyoutExpandedIds([])
  setFlyoutExpandedGroup(null)   // <-- add this line
  clearFlyoutStateTimerRef.current = null
}, 80)
```

- [ ] **Step 3: Reset in the location-change `useEffect`**

In the `useEffect` that watches `location.pathname` (around line 756), add the reset:

```ts
React.useEffect(() => {
  setFlyoutOpen(false)
  setFlyoutItemId(null)
  setFlyoutAnchorEl(null)
  setFlyoutExpandedIds([])
  setFlyoutExpandedGroup(null)   // <-- add this line
  if (openTimerRef.current) clearTimeout(openTimerRef.current)
  if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  if (clearFlyoutStateTimerRef.current) clearTimeout(clearFlyoutStateTimerRef.current)
}, [location.pathname])
```

- [ ] **Step 4: Wire auto-expand in `openFlyout`**

In `openFlyout` (around line 693), after the existing `setFlyoutExpandedIds(autoExpanded)` call, add the auto-expand logic for category-first items. Insert after `setFlyoutExpandedIds(autoExpanded)`:

```ts
// Auto-expand the active report category if this is a category-first flyout
if (item?.flyoutMode === 'category-first' && item.children) {
  const activeChild = item.children.find(child => isItemActive(child))
  setFlyoutExpandedGroup(activeChild?.group?.toLowerCase() ?? null)
} else {
  setFlyoutExpandedGroup(null)
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: add flyoutExpandedGroup state with auto-expand and reset wiring"
```

---

## Task 3: Implement category-first flyout rendering

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx` (Popper render block ~line 1287, Paper sizing ~line 1308)

This is the core rendering change. The Popper block currently renders `flyoutItem.children` via `renderFlyoutItem`. We add a branch: if `flyoutItem.flyoutMode === 'category-first'`, render category headers instead.

- [ ] **Step 1: Write the failing tests first** (see Task 4 for the full test suite — write test cases 1–4 now, before implementing)

Run the tests to confirm they fail:
```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```
Expected: the new tests fail (the flyout still shows all items flat).

- [ ] **Step 2: Update the Paper sizing**

In the `Paper` `sx` prop inside the Popper block (around line 1308), update from:

```ts
sx={{
  bgcolor: SIDEBAR_COLORS.hoverBg,
  minWidth: 200,
  maxWidth: 240,
  py: 1,
```

to:

```ts
sx={{
  bgcolor: SIDEBAR_COLORS.hoverBg,
  minWidth: 240,
  maxWidth: 280,
  maxHeight: 'calc(100vh - 24px)',
  overflowY: 'auto',
  py: 1,
```

- [ ] **Step 3: Add the category-first render branch**

In the Popper block, the current `<List>` render is:

```tsx
<List disablePadding>
  {flyoutItem.children.map((child, idx, arr) => (
    <React.Fragment key={child.id}>
      {child.group && (idx === 0 || child.group !== arr[idx - 1].group)
        ? renderGroupLabel(child.group)
        : null}
      {renderFlyoutItem(child, 0, idx === 0)}
    </React.Fragment>
  ))}
</List>
```

Replace the entire `<List>` block (keep the `Paper` and `Fade` wrappers) with a conditional:

```tsx
{flyoutItem.flyoutMode === 'category-first'
  ? (() => {
      // Derive ordered unique groups from children
      const groups: string[] = []
      flyoutItem.children.forEach(child => {
        if (child.group && !groups.includes(child.group)) {
          groups.push(child.group)
        }
      })

      return (
        <List disablePadding>
          {groups.map((group, groupIdx) => {
            const slug = group.toLowerCase()
            const groupChildren = flyoutItem.children.filter(c => c.group === group)
            const isGroupActive = groupChildren.some(child => isItemActive(child))
            const isExpanded = flyoutExpandedGroup === slug

            return (
              <React.Fragment key={group}>
                {/* Category header */}
                <ListItemButton
                  {...(groupIdx === 0 ? { 'data-flyout-first': 'true' } : {})}
                  selected={isGroupActive}
                  onClick={() =>
                    setFlyoutExpandedGroup(prev => (prev === slug ? null : slug))
                  }
                  sx={{
                    px: 2,
                    py: 0.75,
                    color: isGroupActive
                      ? SIDEBAR_COLORS.activeText
                      : SIDEBAR_COLORS.text,
                  }}
                >
                  <ListItemText
                    primary={group}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontWeight: isGroupActive ? 600 : 500,
                    }}
                  />
                  <ExpandMore
                    fontSize="small"
                    sx={{
                      color: SIDEBAR_COLORS.icon,
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </ListItemButton>

                {/* Expanded report items */}
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <List disablePadding>
                    {groupChildren.map(child => {
                      const isActive = isItemActive(child)
                      return (
                        <ListItemButton
                          key={child.id}
                          selected={isActive}
                          onClick={() => {
                            if (child.path) {
                              navigate(child.path)
                              onItemClick?.()
                              closeFlyout()
                            }
                          }}
                          sx={{
                            pl: 3,
                            py: 0.5,
                            color: isActive
                              ? SIDEBAR_COLORS.activeText
                              : SIDEBAR_COLORS.text,
                          }}
                        >
                          <ListItemIcon
                            sx={{
                              minWidth: 32,
                              color: isActive
                                ? SIDEBAR_COLORS.activeIcon
                                : SIDEBAR_COLORS.icon,
                              '& .MuiSvgIcon-root': { fontSize: '1.1rem' },
                            }}
                          >
                            {child.icon}
                          </ListItemIcon>
                          <ListItemText
                            primary={child.title}
                            primaryTypographyProps={{ variant: 'body2' }}
                          />
                        </ListItemButton>
                      )
                    })}
                  </List>
                </Collapse>
              </React.Fragment>
            )
          })}
        </List>
      )
    })()
  : (
    <List disablePadding>
      {flyoutItem.children.map((child, idx, arr) => (
        <React.Fragment key={child.id}>
          {child.group && (idx === 0 || child.group !== arr[idx - 1].group)
            ? renderGroupLabel(child.group)
            : null}
          {renderFlyoutItem(child, 0, idx === 0)}
        </React.Fragment>
      ))}
    </List>
  )
}
```

**Important:** `Collapse` is already imported from `@mui/material` at the top of the file. Verify it is in the import list before this step — if not, add it.

- [ ] **Step 4: Run the tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```
Expected: tests 1–4 (from Task 4) now pass. All existing tests still pass.

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: implement category-first Reports flyout in collapsed mode"
```

---

## Task 4: Write all new tests

**Files:**
- Modify: `frontend/src/components/common/__tests__/Sidebar.test.tsx`

All new tests go inside the existing `describe('Sidebar', ...)` block. The test file already has the necessary imports (`act`, `fireEvent`, `render`, `screen`, `waitFor`, `within`, `MemoryRouter`, `vi`).

**How flyout tests work in this file:** The existing tests open flyouts by calling `fireEvent.mouseEnter(railButton)` and waiting for content. The `Fade` component is NOT mocked here (unlike `react-transition-group`) — but hovering triggers `openFlyout` directly via `onClick` (the rail button also has `onClick` that calls `openFlyout`). Looking at the existing flyout tests, they use `fireEvent.mouseEnter` and `waitFor` with a 500ms timeout. Follow the same pattern.

Add a new `describe('Reports flyout (collapsed mode)', ...)` block after the existing flyout tests. Here are all 8 test cases:

- [ ] **Step 1: Add the describe block and test 1 — initial render shows only categories**

```ts
describe('Reports flyout (collapsed mode)', () => {
  const openReportsFlyout = async () => {
    const reportsButton = document.getElementById('rail-item-reports') as HTMLElement
    fireEvent.mouseEnter(reportsButton)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Sales/i })).toBeInTheDocument()
    }, { timeout: 500 })
  }

  it('shows only 4 category headers when flyout first opens', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    await openReportsFlyout()

    expect(screen.getByRole('button', { name: /^Sales$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Purchasing$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Inventory$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Accounting$/ })).toBeInTheDocument()
    // No leaf report items visible initially
    expect(screen.queryByText('Product Summary')).not.toBeInTheDocument()
    expect(screen.queryByText('Trial Balance')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Test 2 — clicking a category expands its reports**

```ts
  it('clicking a category header expands its report items', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    await openReportsFlyout()

    fireEvent.click(screen.getByRole('button', { name: /^Sales$/ }))

    await waitFor(() => {
      expect(screen.getByText('Product Summary')).toBeInTheDocument()
    })
    // Other groups still collapsed
    expect(screen.queryByText('Trial Balance')).not.toBeInTheDocument()
  })
```

- [ ] **Step 3: Test 3 — accordion: expanding a second category collapses the first**

```ts
  it('expanding a second category collapses the first', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    await openReportsFlyout()

    fireEvent.click(screen.getByRole('button', { name: /^Sales$/ }))
    await waitFor(() => expect(screen.getByText('Product Summary')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Purchasing$/ }))
    await waitFor(() => expect(screen.getByText('Order Summary')).toBeInTheDocument())

    // Sales items gone
    expect(screen.queryByText('Product Summary')).not.toBeInTheDocument()
  })
```

- [ ] **Step 4: Test 4 — clicking the open category collapses it**

```ts
  it('clicking the open category collapses it', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    await openReportsFlyout()

    fireEvent.click(screen.getByRole('button', { name: /^Sales$/ }))
    await waitFor(() => expect(screen.getByText('Product Summary')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /^Sales$/ }))
    await waitFor(() => expect(screen.queryByText('Product Summary')).not.toBeInTheDocument())
  })
```

- [ ] **Step 5: Test 5 — leaf click navigates and closes flyout**

```ts
  it('clicking a leaf report navigates and closes the flyout', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    await openReportsFlyout()

    fireEvent.click(screen.getByRole('button', { name: /^Sales$/ }))
    await waitFor(() => expect(screen.getByText('Product Summary')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Product Summary' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Sales$/ })).not.toBeInTheDocument()
    }, { timeout: 500 })
  })
```

- [ ] **Step 6: Test 6 — auto-expand when on a report page**

```ts
  it('auto-expands the active report category on flyout open', async () => {
    render(
      <MemoryRouter initialEntries={['/reports/sales/product-summary']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    await openReportsFlyout()

    // Sales should be auto-expanded
    await waitFor(() => {
      expect(screen.getByText('Product Summary')).toBeInTheDocument()
    })
    // Other groups not expanded
    expect(screen.queryByText('Trial Balance')).not.toBeInTheDocument()
  })
```

- [ ] **Step 7: Test 7 — keyboard focus moves to first category header**

```ts
  it('pressing Enter on the rail Reports button moves focus to the first category header', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    const reportsButton = document.getElementById('rail-item-reports') as HTMLElement
    fireEvent.keyDown(reportsButton, { key: 'Enter' })

    await waitFor(() => {
      const firstHeader = document.querySelector('[data-flyout-first="true"]') as HTMLElement
      expect(firstHeader).toBeInTheDocument()
      expect(firstHeader).toHaveFocus()
    }, { timeout: 500 })
  })
```

- [ ] **Step 8: Test 8 — auto-expand for Accounting report (different path prefix)**

```ts
  it('auto-expands Accounting category when on an accounting report page', async () => {
    render(
      <MemoryRouter initialEntries={['/accounting/reports/trial-balance']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    await openReportsFlyout()

    await waitFor(() => {
      expect(screen.getByText('Trial Balance')).toBeInTheDocument()
    })
    expect(screen.queryByText('Product Summary')).not.toBeInTheDocument()
  })
```

- [ ] **Step 9: Test 9 — Settings flyout unchanged (non-regression)**

```ts
  it('Settings flyout still renders flat group labels, not category-first', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar collapsed={true} />
      </MemoryRouter>
    )

    const settingsButton = document.getElementById('rail-item-settings') as HTMLElement
    fireEvent.mouseEnter(settingsButton)

    await waitFor(() => {
      expect(screen.getByText('Business')).toBeInTheDocument()
    }, { timeout: 500 })

    // Settings items should be visible directly (no click-to-expand needed)
    expect(screen.getByRole('button', { name: 'Company' })).toBeInTheDocument()
    // Should NOT render as a category-first accordion (no chevron-style expand needed)
    expect(screen.queryByRole('button', { name: /^Business$/ })).not.toBeInTheDocument()
  })
})
```

Note: `'Business'` appears as a group label (Typography), not a clickable button. The assertion `queryByRole('button', { name: /^Business$/ })` confirms it is not rendered as a `ListItemButton` category header.

- [ ] **Step 10: Run the full test suite**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```
Expected: all tests pass (existing + 9 new).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/common/__tests__/Sidebar.test.tsx
git commit -m "test: add category-first Reports flyout test suite"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run the full frontend test suite**

```bash
cd frontend && npm run test
```
Expected: all tests pass, no regressions.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint
```
Expected: no new lint errors.

- [ ] **Step 4: Final commit if any lint fixes were needed**

If lint auto-fixed anything:
```bash
git add frontend/src/components/common/Sidebar.tsx frontend/src/components/common/__tests__/Sidebar.test.tsx
git commit -m "fix: lint cleanup for category-first flyout"
```

---

## Reference

- Spec: `docs/superpowers/specs/2026-03-18-reports-flyout-category-first-design.md`
- Implementation file: `frontend/src/components/common/Sidebar.tsx`
- Test file: `frontend/src/components/common/__tests__/Sidebar.test.tsx`
- Flyout Popper block: `Sidebar.tsx` around line 1287–1336
- `openFlyout`: `Sidebar.tsx` around line 693–716
- `closeFlyout`: `Sidebar.tsx` around line 718–729
- `isItemActive`: `Sidebar.tsx` around line 661–669
- `MenuItem` interface: `Sidebar.tsx` around line 85
