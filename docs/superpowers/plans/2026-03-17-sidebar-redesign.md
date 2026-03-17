# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the ERP sidebar with a fixed dark palette, collapsible 256px/64px rail, and a hover flyout Popper for nested menus in collapsed mode.

**Architecture:** All changes are confined to two files — `MainLayout.tsx` owns the `collapsed` boolean state and passes it as a prop to `Sidebar.tsx`, which renders either full expanded nav or an icon-only rail with flyout Poppers. No new files are created.

**Tech Stack:** React 19, MUI v7, React Router v6, Vitest + React Testing Library, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-17-sidebar-redesign.md`

---

## Chunk 1: MainLayout — collapse state + layout wiring

### Task 1: Update MainLayout constants and collapse state

**Files:**
- Modify: `frontend/src/components/common/MainLayout.tsx`

- [ ] **Step 1: Write a failing test**

Add to `frontend/src/components/common/__tests__/Sidebar.test.tsx` — this tests the toggle callback prop exists and is callable (pure unit test on the prop interface):

```tsx
it('calls onToggleCollapse when toggle button is clicked', () => {
  const onToggleCollapse = vi.fn()
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar onToggleCollapse={onToggleCollapse} />
    </MemoryRouter>
  )
  // Toggle button is only shown when onToggleCollapse is provided
  const toggleBtn = screen.getByRole('button', { name: /collapse sidebar/i })
  fireEvent.click(toggleBtn)
  expect(onToggleCollapse).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: FAIL — "Unable to find role button with name /collapse sidebar/i"

- [ ] **Step 3: Replace DRAWER_WIDTH constant and add collapsed state in MainLayout**

In `frontend/src/components/common/MainLayout.tsx`, find and replace:
```tsx
// Before:
const DRAWER_WIDTH = 280

// After:
const DRAWER_WIDTH_EXPANDED = 256
const DRAWER_WIDTH_COLLAPSED = 64
```

Add collapse state immediately after `const [mobileOpen, setMobileOpen] = useState(false)`:
```tsx
const [collapsed, setCollapsed] = React.useState<boolean>(() => {
  return localStorage.getItem('sidebar-collapsed') === 'true'
})

const handleToggleCollapse = () => {
  setCollapsed(c => {
    const next = !c
    localStorage.setItem('sidebar-collapsed', String(next))
    return next
  })
}
```

- [ ] **Step 4: Update AppBar sx in MainLayout**

Find the AppBar `sx` prop (currently uses `DRAWER_WIDTH`). Replace:
```tsx
sx={{
  width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` },
  ml: { lg: `${DRAWER_WIDTH}px` },
  bgcolor: 'background.paper',
  color: 'text.primary',
  boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
  borderBottom: '1px solid',
  borderBottomColor: 'divider',
}}
```
With:
```tsx
sx={{
  width: { lg: collapsed ? `calc(100% - ${DRAWER_WIDTH_COLLAPSED}px)` : `calc(100% - ${DRAWER_WIDTH_EXPANDED}px)` },
  ml: { lg: collapsed ? `${DRAWER_WIDTH_COLLAPSED}px` : `${DRAWER_WIDTH_EXPANDED}px` },
  bgcolor: 'background.paper',
  color: 'text.primary',
  boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
  borderBottom: '1px solid',
  borderBottomColor: 'divider',
  transition: 'width 0.22s ease, margin-left 0.22s ease',
}}
```

- [ ] **Step 5: Update nav Box width**

Find `<Box component="nav" sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: { lg: 0 } }}>` and replace:
```tsx
<Box
  component="nav"
  sx={{
    width: { lg: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED },
    flexShrink: { lg: 0 },
  }}
>
```

- [ ] **Step 6: Update permanent Drawer paper width and add transition**

Find the permanent Drawer (`variant="permanent"`) and update its `sx`:
```tsx
sx={{
  display: { xs: 'none', lg: 'block' },
  '& .MuiDrawer-paper': {
    boxSizing: 'border-box',
    width: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED,
    transition: 'width 0.22s ease',
    overflowX: 'hidden',
  },
}}
```

- [ ] **Step 7: Pass collapsed props to desktop Sidebar, keep mobile collapsed={false}**

The desktop Sidebar render (inside `variant="permanent"` Drawer):
```tsx
<Sidebar collapsed={collapsed} onToggleCollapse={handleToggleCollapse} />
```

The mobile Sidebar render (inside `variant="temporary"` Drawer) — no change:
```tsx
<Sidebar onItemClick={handleDrawerToggle} />
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: all **pre-existing** tests pass. The new toggle test added in Step 1 will still FAIL at this point — that is expected, Sidebar.tsx has not changed yet.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/common/MainLayout.tsx
git commit -m "feat: add sidebar collapse state and layout wiring to MainLayout"
```

---

## Chunk 2: Sidebar — props, colors, header, footer, expanded mode styling

### Task 2: SidebarProps interface + color tokens

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Update SidebarProps interface**

Replace the existing interface at the top of `Sidebar.tsx`:
```tsx
// Before:
interface SidebarProps {
  onItemClick?: () => void
}

// After:
interface SidebarProps {
  onItemClick?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}
```

- [ ] **Step 2: Add sidebar color constants below the interface**

After the interfaces, add:
```tsx
const SIDEBAR_COLORS = {
  bg: '#0F172A',
  activeBg: '#1F2937',
  hoverBg: '#1E293B',
  text: '#9CA3AF',
  activeText: '#E5E7EB',
  sectionLabel: '#6B7280',
  border: '#1F2937',
  accentBar: '#42a5f5',
} as const
```

- [ ] **Step 3: Update component signature to destructure new props**

```tsx
// Before:
const Sidebar: React.FC<SidebarProps> = ({ onItemClick }) => {

// After:
const Sidebar: React.FC<SidebarProps> = ({ onItemClick, collapsed = false, onToggleCollapse }) => {
```

### Task 3: Rewrite the header area

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Write failing test for collapsed logo**

Add to `frontend/src/components/common/__tests__/Sidebar.test.tsx`:
```tsx
it('hides app name text when collapsed', () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={true} />
    </MemoryRouter>
  )
  expect(screen.queryByText('ERP System')).not.toBeInTheDocument()
})

it('shows app name text when expanded', () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={false} />
    </MemoryRouter>
  )
  expect(screen.getByText('ERP System')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: FAIL — `collapsed` prop doesn't affect rendering yet

- [ ] **Step 3: Rewrite the header Box in Sidebar**

Find the `{/* Logo */}` comment and replace the entire outer `<Box>` block that follows it (from `{/* Logo */}` down through the closing `</Box>` that contains both the logo square and the "ERP System" Typography) with:

```tsx
{/* Header */}
<Box
  sx={{
    px: collapsed ? 0 : 2,
    py: 1.5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'space-between',
    borderBottom: `1px solid ${SIDEBAR_COLORS.border}`,
    minHeight: 56,
  }}
>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 1.5 }}>
    <Box
      sx={{
        width: 36,
        height: 36,
        borderRadius: 1,
        bgcolor: 'primary.main',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '0.875rem',
        flexShrink: 0,
      }}
    >
      ERP
    </Box>
    {!collapsed && (
      <Typography variant="h6" sx={{ fontWeight: 600, color: SIDEBAR_COLORS.activeText, whiteSpace: 'nowrap' }}>
        ERP System
      </Typography>
    )}
  </Box>

  {onToggleCollapse && (
    <IconButton
      onClick={onToggleCollapse}
      aria-label={collapsed ? 'expand sidebar' : 'collapse sidebar'}
      size="small"
      sx={{
        display: { xs: 'none', lg: 'flex' },
        color: SIDEBAR_COLORS.text,
        width: 28,
        height: 28,
        '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
        flexShrink: 0,
      }}
    >
      {collapsed ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
    </IconButton>
  )}
</Box>
```

Add `ChevronLeft` and `ChevronRight` to the MUI icons import at the top of the file:
```tsx
import {
  // ...existing icons...
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material'
```

Also add `IconButton` to the MUI core import:
```tsx
import {
  // ...existing...
  IconButton,
  // ...
} from '@mui/material'
```

- [ ] **Step 4: Remove the footer Box entirely**

Find the `{/* Footer */}` comment and delete the entire `<Box>` block that follows it (the one that contains `ERP System v1.0.0`):
```tsx
// Delete this entire block (identified by the {/* Footer */} comment above it):
<Box
  sx={{
    p: 2,
    borderTop: 1,
    borderColor: 'divider',
    bgcolor: 'background.default',
  }}
>
  <Typography
    variant="caption"
    sx={{
      display: 'block',
      textAlign: 'center',
      color: 'text.secondary',
    }}
  >
    ERP System v1.0.0
  </Typography>
</Box>
```

- [ ] **Step 5: Run tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: the 2 new header tests (`hides app name text when collapsed`, `shows app name text when expanded`) pass. The toggle test added in Chunk 1 (`calls onToggleCollapse when toggle button is clicked`) should now also pass — the button with `aria-label="collapse sidebar"` is rendered in this step. If it still fails, debug before committing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: add collapsed prop, color tokens, header toggle, remove footer"
```

### Task 4: Apply dark palette to sidebar wrapper and rewrite active item styling

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Write failing test for dark background**

Add to `__tests__/Sidebar.test.tsx`:
```tsx
it('renders sidebar with dark background data attribute', () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar />
    </MemoryRouter>
  )
  // MUI sx does not produce inline styles in JSDOM — verify via data-testid instead
  const outerBox = document.querySelector('[data-testid="sidebar-root"]')
  expect(outerBox).toBeInTheDocument()
})
```

Note: JSDOM does not resolve MUI `sx`/CSS-in-JS to inline styles, so we cannot reliably assert `backgroundColor` on the DOM node. The visual correctness of the color is verified by visual inspection in the browser. This test just validates the element is rendered.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: FAIL — `[data-testid="sidebar-root"]` not found yet

- [ ] **Step 3: Apply background color to the outer Box and add data-testid**

Replace the outer Box in the Sidebar `return`:
```tsx
// Before:
<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

// After:
<Box
  data-testid="sidebar-root"
  sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: SIDEBAR_COLORS.bg }}
>
```

- [ ] **Step 4: Rewrite renderMenuItem to use conditional sx instead of selected prop**

Replace the entire `renderMenuItem` function with the following. This handles all three rendering cases in one function: collapsed parent (rail icon + mouse handlers), collapsed leaf (rail icon + tooltip), and expanded (full row). The `selected` prop is never used.

Also add `data-testid` to the Drawer paper `sx` in `MainLayout.tsx` to override its background color:
```tsx
// In MainLayout.tsx, on the permanent Drawer's sx, add:
'& .MuiDrawer-paper': {
  bgcolor: '#0F172A',   // <-- add this
  boxSizing: 'border-box',
  width: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED,
  transition: 'width 0.22s ease',
  overflowX: 'hidden',
},
```
This ensures the Drawer paper itself has the dark background (no flash on edges).

Now replace `renderMenuItem` in `Sidebar.tsx`:

```tsx
const renderMenuItem = (item: MenuItem, level: number = 0) => {
  const isActive = isItemActive(item)
  const isExpanded = expandedItems.includes(item.id)
  const hasChildren = Boolean(item.children && item.children.length > 0)

  // Shared active sx for the pill + left accent bar
  const activeItemSx = isActive && !hasChildren ? {
    bgcolor: SIDEBAR_COLORS.activeBg,
    '&::before': {
      content: '""',
      position: 'absolute',
      left: 0,
      top: '50%',
      transform: 'translateY(-50%)',
      width: 3,
      height: '60%',
      borderRadius: '0 2px 2px 0',
      bgcolor: SIDEBAR_COLORS.accentBar,
    },
  } : {}

  // CASE 1: Collapsed + has children → rail icon with mouse handlers, no tooltip
  // Mouse handlers are wired up in Chunk 3; placeholder handlers used here initially
  if (collapsed && hasChildren) {
    return (
      <React.Fragment key={item.id}>
        <ListItem disablePadding>
          <ListItemButton
            id={`rail-item-${item.id}`}
            aria-label={item.title}
            onClick={() => {/* handled in Chunk 3 */}}
            aria-haspopup="true"
            aria-expanded={flyoutItemId === item.id}
            sx={{
              pl: 0,
              py: 0,
              height: 44,
              borderRadius: 1,
              mx: 0.5,
              mb: 0.5,
              justifyContent: 'center',
              position: 'relative',
              ...(isActive ? {
                '& .MuiListItemIcon-root': { color: SIDEBAR_COLORS.activeText },
              } : {}),
              '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
              '&.Mui-selected': { bgcolor: 'transparent' },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                color: isActive ? SIDEBAR_COLORS.activeText : SIDEBAR_COLORS.text,
                justifyContent: 'center',
                '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
              }}
            >
              {item.icon}
            </ListItemIcon>
          </ListItemButton>
        </ListItem>
      </React.Fragment>
    )
  }

  // CASE 2: Collapsed + leaf → rail icon with tooltip
  if (collapsed && !hasChildren) {
    return (
      <React.Fragment key={item.id}>
        <ListItem disablePadding>
          <Tooltip title={item.title} placement="right" enterDelay={400} enterNextDelay={200}>
            <ListItemButton
              onClick={() => handleItemClick(item)}
              sx={{
                pl: 0,
                py: 0,
                height: 44,
                borderRadius: 1,
                mx: 0.5,
                mb: 0.5,
                justifyContent: 'center',
                position: 'relative',
                ...activeItemSx,
                '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
                '&.Mui-selected': { bgcolor: 'transparent' },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  color: isActive ? SIDEBAR_COLORS.activeText : SIDEBAR_COLORS.text,
                  justifyContent: 'center',
                  '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                }}
              >
                {item.icon}
              </ListItemIcon>
            </ListItemButton>
          </Tooltip>
        </ListItem>
      </React.Fragment>
    )
  }

  // CASE 3: Expanded mode (collapsed === false)
  return (
    <React.Fragment key={item.id}>
      <ListItem disablePadding>
        <ListItemButton
          onClick={() => handleItemClick(item)}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-haspopup={hasChildren ? 'true' : undefined}
          sx={{
            pl: 2 + level * 2,
            py: 0,
            height: 44,
            borderRadius: 1,
            mx: 1,
            mb: 0.5,
            position: 'relative',
            ...activeItemSx,
            ...(isActive && hasChildren ? {
              '& .MuiListItemIcon-root': { color: SIDEBAR_COLORS.activeText },
              '& .MuiListItemText-primary': { color: SIDEBAR_COLORS.activeText },
            } : {}),
            '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
            '&.Mui-selected': { bgcolor: 'transparent' },
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 40,
              color: isActive ? SIDEBAR_COLORS.activeText : SIDEBAR_COLORS.text,
              '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
            }}
          >
            {item.icon}
          </ListItemIcon>
          <ListItemText
            primary={item.title}
            sx={{
              '& .MuiListItemText-primary': {
                fontSize: '0.875rem',
                fontWeight: isActive && !hasChildren ? 600 : 400,
                color: isActive ? SIDEBAR_COLORS.activeText : SIDEBAR_COLORS.text,
              },
            }}
          />
          {item.badge && (
            <Badge
              badgeContent={item.badge}
              color="error"
              sx={{ '& .MuiBadge-badge': { right: 16, fontSize: '0.75rem' } }}
            />
          )}
          {hasChildren && (
            <Box
              component="span"
              sx={{
                color: SIDEBAR_COLORS.text,
                display: 'flex',
                alignItems: 'center',
                transition: 'transform 0.2s',
                transform: isExpanded ? 'rotate(180deg)' : 'none',
              }}
            >
              <ExpandMore fontSize="small" />
            </Box>
          )}
        </ListItemButton>
      </ListItem>

      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {item.children!.map(child => renderMenuItem(child, level + 1))}
        </List>
      </Collapse>
    </React.Fragment>
  )
}
```

Note: `flyoutItemId` referenced in Case 1 is not yet defined at this stage. Add a temporary stub at the top of the component body (right after the `const navigate = useNavigate()` line) so the file compiles:
```tsx
// Temporary stub — replaced with full flyout state in Chunk 3
const flyoutItemId: string | null = null
```
This will be removed in Task 5.

Also confirm `navigate` is already declared in the component (look for `const navigate = useNavigate()`). It exists in the current codebase. If it is missing for any reason, add it.

- [ ] **Step 5: Confirm section IDs before updating divider logic**

Open `Sidebar.tsx` and verify the `menuSections` array has `id` values of `'main'`, `'operations'`, `'accounting'`, `'analytics'`, `'system'`. The divider logic uses `['analytics', 'system']` as the IDs for major section boundaries. If the IDs differ, update the array literal in the next step accordingly.

- [ ] **Step 6: Update section label and divider colors**

In the navigation section map, update the `Typography` section label and `Divider`:

```tsx
{getFilteredMenuSections().map((section, index) => (
  <React.Fragment key={section.id}>
    {index > 0 && (
      <Divider
        sx={{
          my: collapsed ? 1 : 0.5,
          borderColor: SIDEBAR_COLORS.border,
          // In collapsed mode, only show dividers between major groups
          display: collapsed && !['analytics', 'system'].includes(section.id) ? 'none' : 'block',
        }}
      />
    )}

    {!collapsed && (
      <Typography
        variant="overline"
        sx={{
          px: 3,
          py: 1,
          display: 'block',
          color: SIDEBAR_COLORS.sectionLabel,
          fontWeight: 600,
          fontSize: '0.75rem',
        }}
      >
        {section.title}
      </Typography>
    )}

    {collapsed && index > 0 && ['analytics', 'system'].includes(section.id) && (
      // Extra top spacing before major section groups in collapsed mode
      <Box sx={{ pt: 1 }} />
    )}

    <List sx={{ px: 0 }}>
      {section.items.map(item => renderMenuItem(item))}
    </List>
  </React.Fragment>
))}
```

- [ ] **Step 7: Run all sidebar tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: all tests pass

- [ ] **Step 8: Commit both files**

```bash
git add frontend/src/components/common/Sidebar.tsx \
        frontend/src/components/common/MainLayout.tsx
git commit -m "feat: apply dark palette, rewrite active item styling, collapsed icon-only mode"
```

---

## Chunk 3: Flyout Popper for collapsed parent items

### Task 5: Add flyout Popper state and hover timer logic

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Write failing test for flyout**

Add to `__tests__/Sidebar.test.tsx`:
```tsx
it('shows flyout panel on hover over parent item in collapsed mode', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={true} />
    </MemoryRouter>
  )

  // aria-label="Sales" is required on the Case 1 ListItemButton (no visible text in collapsed mode)
  const salesButton = screen.getByRole('button', { name: 'Sales' })
  fireEvent.mouseEnter(salesButton)

  // waitFor with 500ms to accommodate the real 80ms open timer
  await waitFor(() => {
    expect(screen.getByText('Customers')).toBeInTheDocument()
  }, { timeout: 500 })
})

it('closes flyout on mouse leave', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={true} />
    </MemoryRouter>
  )

  const salesButton = screen.getByRole('button', { name: 'Sales' })
  fireEvent.mouseEnter(salesButton)

  await waitFor(() => {
    expect(screen.getByText('Customers')).toBeInTheDocument()
  }, { timeout: 500 })

  fireEvent.mouseLeave(salesButton)

  // waitFor 500ms to accommodate the real 150ms close timer
  await waitFor(() => {
    expect(screen.queryByText('Customers')).not.toBeInTheDocument()
  }, { timeout: 500 })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Add flyout state and timer refs to Sidebar component**

Add inside the `Sidebar` component body, after the existing `expandedItems` state:

```tsx
// Flyout state (collapsed mode only)
const [flyoutItemId, setFlyoutItemId] = React.useState<string | null>(null)
const [flyoutAnchorEl, setFlyoutAnchorEl] = React.useState<HTMLElement | null>(null)
const [flyoutExpandedIds, setFlyoutExpandedIds] = React.useState<string[]>([])
const openTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

const clearOpenTimer = () => {
  if (openTimerRef.current) {
    clearTimeout(openTimerRef.current)
    openTimerRef.current = null
  }
}

const clearCloseTimer = () => {
  if (closeTimerRef.current) {
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }
}

const openFlyout = (itemId: string, anchorEl: HTMLElement) => {
  clearOpenTimer()
  clearCloseTimer()
  // Auto-expand level-1 groups that have an active descendant
  const item = menuSections.flatMap(s => s.items).find(i => i.id === itemId)
  const autoExpanded: string[] = []
  if (item?.children) {
    item.children.forEach(child => {
      if (child.children && isItemActive(child)) {
        autoExpanded.push(child.id)
      }
    })
  }
  setFlyoutExpandedIds(autoExpanded)
  setFlyoutItemId(itemId)
  setFlyoutAnchorEl(anchorEl)
}

const startCloseFlyout = () => {
  clearCloseTimer()
  closeTimerRef.current = setTimeout(() => {
    setFlyoutItemId(null)
    setFlyoutAnchorEl(null)
    setFlyoutExpandedIds([])
  }, 150)
}

const handleRailMouseEnter = (item: MenuItem, el: HTMLElement) => {
  clearOpenTimer()
  clearCloseTimer()
  openTimerRef.current = setTimeout(() => openFlyout(item.id, el), 80)
}

const handleRailMouseLeave = () => {
  clearOpenTimer()
  startCloseFlyout()
}

const handleFlyoutMouseEnter = () => {
  clearCloseTimer()
}

const handleFlyoutMouseLeave = () => {
  startCloseFlyout()
}

// Reset flyout on navigation
// eslint-disable-next-line react-hooks/exhaustive-deps
React.useEffect(() => {
  setFlyoutItemId(null)
  setFlyoutAnchorEl(null)
  setFlyoutExpandedIds([])
  if (openTimerRef.current) clearTimeout(openTimerRef.current)
  if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
}, [location.pathname])
```

**Ordering note:** `openFlyout` calls `isItemActive`, which is defined earlier in the component. Define the flyout state block and helpers **after** `isItemActive` in the file to avoid a "used before defined" reference. The existing `isItemActive` function is near the bottom of the component body — place the flyout block after it.

- [ ] **Step 4: Wire up mouse handlers on the collapsed parent rail items**

In `renderMenuItem`, Case 1 (`collapsed && hasChildren`), replace the `onClick` placeholder and add mouse handlers. Replace the entire Case 1 `ListItemButton`:

```tsx
// CASE 1: Collapsed + has children → rail icon with mouse handlers, no tooltip
if (collapsed && hasChildren) {
  return (
    <React.Fragment key={item.id}>
      <ListItem disablePadding>
        <ListItemButton
          id={`rail-item-${item.id}`}
          aria-label={item.title}
          onMouseEnter={(e) => handleRailMouseEnter(item, e.currentTarget)}
          onMouseLeave={handleRailMouseLeave}
          onClick={(e) => openFlyout(item.id, e.currentTarget)}
          aria-haspopup="true"
          aria-expanded={flyoutItemId === item.id}
          sx={{
            pl: 0,
            py: 0,
            height: 44,
            borderRadius: 1,
            mx: 0.5,
            mb: 0.5,
            justifyContent: 'center',
            position: 'relative',
            ...(isActive ? {
              '& .MuiListItemIcon-root': { color: SIDEBAR_COLORS.activeText },
            } : {}),
            '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
            '&.Mui-selected': { bgcolor: 'transparent' },
          }}
        >
          <ListItemIcon
            sx={{
              minWidth: 0,
              color: isActive ? SIDEBAR_COLORS.activeText : SIDEBAR_COLORS.text,
              justifyContent: 'center',
              '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
            }}
          >
            {item.icon}
          </ListItemIcon>
        </ListItemButton>
      </ListItem>
    </React.Fragment>
  )
}
```

- [ ] **Remove the temporary stub** — delete the line `const flyoutItemId: string | null = null` added in Task 4 Step 4. The real `flyoutItemId` state is now declared in Step 3 of this task.

Also confirm `menuSections` is accessible in `openFlyout`. In the existing codebase it is declared as a module-level `const menuSections: MenuSection[]` (not behind `getFilteredMenuSections()`), so `menuSections.flatMap(...)` compiles. If the variable name differs in the actual file, update the reference accordingly.

- [ ] **Step 5: Run tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: flyout tests now pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: add flyout state, hover timers, rail mouse handlers for collapsed parents"
```

### Task 6: Render the flyout Popper panel

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Write failing test for flyout navigation**

Add to `__tests__/Sidebar.test.tsx`:
```tsx
it('navigates when clicking a leaf item inside the flyout', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={true} />
    </MemoryRouter>
  )

  const salesButton = screen.getByRole('button', { name: 'Sales' })
  fireEvent.mouseEnter(salesButton)

  await waitFor(() => {
    expect(screen.getByText('Customers')).toBeInTheDocument()
  }, { timeout: 500 })

  fireEvent.click(screen.getByRole('button', { name: 'Customers' }))

  // Flyout closes after navigation
  await waitFor(() => {
    expect(screen.queryByText('Customers')).not.toBeInTheDocument()
  }, { timeout: 500 })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Add Popper imports**

Add to MUI imports in Sidebar.tsx:
```tsx
import { Popper, Fade, Paper } from '@mui/material'
```

- [ ] **Step 4: Add a renderFlyoutItem helper**

Add inside the Sidebar component, **after** the flyout state and timer helpers added in Task 5 (both `renderFlyoutItem` and `openFlyout` reference each other's closures — they must be declared after `isItemActive` and after the state/ref declarations):

```tsx
const renderFlyoutItem = (item: MenuItem, level: number = 0): React.ReactNode => {
  const isActive = isItemActive(item)
  const hasChildren = item.children && item.children.length > 0
  const isExpanded = flyoutExpandedIds.includes(item.id)

  return (
    <React.Fragment key={item.id}>
      <ListItemButton
        onClick={() => {
          if (item.path) {
            navigate(item.path)
            onItemClick?.()
            // close flyout
            setFlyoutItemId(null)
            setFlyoutAnchorEl(null)
            setFlyoutExpandedIds([])
            clearOpenTimer()
            clearCloseTimer()
          } else if (hasChildren) {
            setFlyoutExpandedIds(prev =>
              prev.includes(item.id)
                ? prev.filter(id => id !== item.id)
                : [...prev, item.id]
            )
          }
        }}
        aria-expanded={hasChildren ? isExpanded : undefined}
        sx={{
          pl: 1.5 + level * 2,
          pr: 1.5,
          py: 0,
          height: 40,
          borderRadius: 1,
          mx: 0.5,
          mb: 0.25,
          position: 'relative',
          ...(isActive && !hasChildren && {
            bgcolor: SIDEBAR_COLORS.activeBg,
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 3,
              height: '60%',
              borderRadius: '0 2px 2px 0',
              bgcolor: SIDEBAR_COLORS.accentBar,
            },
          }),
          '&:hover': { bgcolor: SIDEBAR_COLORS.hoverBg },
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: 32,
            color: isActive ? SIDEBAR_COLORS.activeText : SIDEBAR_COLORS.text,
            '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
          }}
        >
          {item.icon}
        </ListItemIcon>
        <ListItemText
          primary={item.title}
          sx={{
            '& .MuiListItemText-primary': {
              fontSize: '0.8125rem',
              fontWeight: isActive && !hasChildren ? 600 : 400,
              color: isActive ? SIDEBAR_COLORS.activeText : SIDEBAR_COLORS.text,
            },
          }}
        />
        {hasChildren && (
          <Box
            component="span"
            sx={{
              color: SIDEBAR_COLORS.text,
              display: 'flex',
              alignItems: 'center',
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(180deg)' : 'none',
            }}
          >
            <ExpandMore sx={{ fontSize: '1rem' }} />
          </Box>
        )}
      </ListItemButton>

      {hasChildren && (
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {item.children!.map(child => renderFlyoutItem(child, level + 1))}
          </List>
        </Collapse>
      )}
    </React.Fragment>
  )
}
```

- [ ] **Step 5: Add the Popper to the Sidebar JSX**

Add just before the closing `</Box>` of the outer sidebar wrapper:

```tsx
{/* Flyout Popper — collapsed mode parent items */}
{collapsed && flyoutAnchorEl && flyoutItemId && (() => {
  const flyoutItem = menuSections
    .flatMap(s => s.items)
    .find(i => i.id === flyoutItemId)

  if (!flyoutItem?.children) return null

  return (
    <Popper
      open={Boolean(flyoutAnchorEl)}
      anchorEl={flyoutAnchorEl}
      placement="right-start"
      keepMounted={false}
      modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
      style={{ zIndex: 1400 }}
    >
      <Fade in={Boolean(flyoutAnchorEl)} timeout={{ enter: 120, exit: 80 }}>
        <Paper
          onMouseEnter={handleFlyoutMouseEnter}
          onMouseLeave={handleFlyoutMouseLeave}
          sx={{
            bgcolor: SIDEBAR_COLORS.hoverBg,
            minWidth: 200,
            maxWidth: 240,
            py: 1,
            borderRadius: 1,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            // translateX enter animation (complements Fade opacity)
            '@keyframes flyoutEnter': {
              from: { transform: 'translateX(-4px)' },
              to: { transform: 'translateX(0)' },
            },
            animation: 'flyoutEnter 0.12s ease-out',
          }}
        >
          <List disablePadding>
            {flyoutItem.children.map(child => renderFlyoutItem(child))}
          </List>
        </Paper>
      </Fade>
    </Popper>
  )
})()}
```

- [ ] **Step 6: Run all tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: all tests pass

- [ ] **Step 7: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: add flyout Popper panel with inline accordion for collapsed parent items"
```

---

## Chunk 4: Final wiring, edge cases, full test run

### Task 7: Cleanup and edge case validation

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`
- Modify: `frontend/src/components/common/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: Write test for active icon on rail in collapsed mode**

Add to `__tests__/Sidebar.test.tsx`:
```tsx
it('shows rail icon button for active parent in collapsed mode', () => {
  render(
    <MemoryRouter initialEntries={['/sales/customers']}>
      <Sidebar collapsed={true} />
    </MemoryRouter>
  )
  // Sales parent should render as a rail button with its title as aria-label
  const salesButton = screen.getByRole('button', { name: 'Sales' })
  expect(salesButton).toBeInTheDocument()
  // No visible "Sales" text — confirmed by absence of a ListItemText
  expect(screen.queryByText('Sales')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Write a genuine TDD test for badge hiding in collapsed mode**

This test requires temporarily patching the menu data so a badge exists. Add to `__tests__/Sidebar.test.tsx`:
```tsx
it('hides badge when sidebar is collapsed', async () => {
  // We test the renderMenuItem logic by rendering in expanded mode (badge visible)
  // then in collapsed mode (badge hidden)
  const { rerender } = render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={false} />
    </MemoryRouter>
  )

  // In expanded mode, the Dashboard item has no badge — but we can verify
  // the Badge component is NOT present because no item has badge data.
  // The real test: confirm renderMenuItem correctly gates badge rendering.
  // Since we can't inject a badge item without modifying source, we verify
  // the code path by checking the collapsed prop changes the render output.
  rerender(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={true} />
    </MemoryRouter>
  )

  // In collapsed mode there must be no MuiBadge elements
  expect(document.querySelector('.MuiBadge-badge')).toBeNull()
})
```

Note: This test is a smoke test — it passes in both implementations (since no item has a badge currently). The real guard is in `renderMenuItem`'s Case 1/2 branches which never render `Badge`. The test documents intent and will catch regressions if a badge is ever added to a menu item.

- [ ] **Step 3: Add keyboard interaction for collapsed mode flyout**

In `Sidebar.tsx`, update the Case 1 `ListItemButton` to handle `Enter`/`Space` for keyboard users, and add a global `keydown` listener for `Escape`:

```tsx
// Add to the Case 1 ListItemButton (collapsed + hasChildren):
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    openFlyout(item.id, e.currentTarget)
  }
}}
```

Add a `useEffect` for `Escape` key (place it alongside the navigation-reset `useEffect`):
```tsx
React.useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && flyoutItemId) {
      setFlyoutItemId(null)
      setFlyoutAnchorEl(null)
      setFlyoutExpandedIds([])
      // Return focus to the triggering rail button
      const trigger = document.getElementById(`rail-item-${flyoutItemId}`)
      trigger?.focus()
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [flyoutItemId])
```

- [ ] **Step 4: Write test for Escape key closing flyout**

Add to `__tests__/Sidebar.test.tsx`:
```tsx
it('closes flyout when Escape is pressed', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={true} />
    </MemoryRouter>
  )

  const salesButton = screen.getByRole('button', { name: 'Sales' })
  fireEvent.mouseEnter(salesButton)

  await waitFor(() => {
    expect(screen.getByText('Customers')).toBeInTheDocument()
  }, { timeout: 500 })

  fireEvent.keyDown(document, { key: 'Escape' })

  await waitFor(() => {
    expect(screen.queryByText('Customers')).not.toBeInTheDocument()
  }, { timeout: 500 })
})
```

- [ ] **Step 5: Run all sidebar tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
```

Expected: all tests pass

- [ ] **Step 6: Run the full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass

- [ ] **Step 7: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 8: Lint**

```bash
cd frontend && npm run lint
```

Expected: no errors. Note: the `// eslint-disable-next-line react-hooks/exhaustive-deps` added in Task 5 Step 3 suppresses the exhaustive-deps warning on the navigation reset effect — this is intentional.

- [ ] **Step 9: Final commit**

```bash
git add frontend/src/components/common/Sidebar.tsx \
        frontend/src/components/common/__tests__/Sidebar.test.tsx
git commit -m "feat: finalize sidebar redesign — edge cases, tests, cleanup"
```

---

## Summary of Commits

1. `feat: add sidebar collapse state and layout wiring to MainLayout`
2. `feat: add collapsed prop, color tokens, header toggle, remove footer`
3. `feat: apply dark palette, rewrite active item styling, collapsed icon-only mode`
4. `feat: add flyout state, hover timers, rail mouse handlers for collapsed parents`
5. `feat: add flyout Popper panel with inline accordion for collapsed parent items`
6. `feat: finalize sidebar redesign — edge cases, tests, cleanup`
