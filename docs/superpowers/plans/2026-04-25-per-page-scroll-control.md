# Per-Page Scroll Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix dashboard scrolling (issue #432) by introducing a `useLayoutScroll` hook that lets pages opt in to scrolling, with all pages defaulting to no-scroll.

**Architecture:** A `LayoutScrollContext` holds a boolean `scrollEnabled` state. `MainLayout` wraps `<Outlet>` with the provider and reads the value to toggle `overflow` on the `<main>` box. Pages call `useLayoutScroll(true)` to opt in; the hook resets to `false` on unmount so scroll never leaks between routes.

**Tech Stack:** React 19, MUI v7, React Router v6, Vitest

---

## File Map

- Create: `frontend/src/contexts/LayoutScrollContext.tsx` — context, provider, two hooks
- Modify: `frontend/src/components/common/MainLayout.tsx` — wrap Outlet, consume context
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx` — call `useLayoutScroll(true)`

---

### Task 1: Create LayoutScrollContext

**Files:**
- Create: `frontend/src/contexts/LayoutScrollContext.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/contexts/LayoutScrollContext.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LayoutScrollProvider, useLayoutScroll, useLayoutScrollContext } from './LayoutScrollContext'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LayoutScrollProvider>{children}</LayoutScrollProvider>
)

describe('LayoutScrollContext', () => {
  it('defaults to scrollEnabled = false', () => {
    const { result } = renderHook(() => useLayoutScrollContext(), { wrapper })
    expect(result.current).toBe(false)
  })

  it('useLayoutScroll(true) enables scroll on mount', () => {
    const { result } = renderHook(() => {
      useLayoutScroll(true)
      return useLayoutScrollContext()
    }, { wrapper })
    expect(result.current).toBe(true)
  })

  it('useLayoutScroll resets to false on unmount', () => {
    const { result, unmount } = renderHook(() => {
      useLayoutScroll(true)
      return useLayoutScrollContext()
    }, { wrapper })
    expect(result.current).toBe(true)
    unmount()
    // After unmount, a new consumer sees the reset default
    const { result: result2 } = renderHook(() => useLayoutScrollContext(), { wrapper })
    expect(result2.current).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/contexts/LayoutScrollContext.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement the context**

Create `frontend/src/contexts/LayoutScrollContext.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react'

const LayoutScrollContext = createContext<boolean>(false)
const LayoutScrollSetContext = createContext<React.Dispatch<React.SetStateAction<boolean>>>(() => {})

export const LayoutScrollProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scrollEnabled, setScrollEnabled] = useState(false)
  return (
    <LayoutScrollContext.Provider value={scrollEnabled}>
      <LayoutScrollSetContext.Provider value={setScrollEnabled}>
        {children}
      </LayoutScrollSetContext.Provider>
    </LayoutScrollContext.Provider>
  )
}

export const useLayoutScrollContext = () => useContext(LayoutScrollContext)

export const useLayoutScroll = (enabled: boolean) => {
  const setScrollEnabled = useContext(LayoutScrollSetContext)
  useEffect(() => {
    setScrollEnabled(enabled)
    return () => setScrollEnabled(false)
  }, [enabled, setScrollEnabled])
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/contexts/LayoutScrollContext.test.tsx
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/LayoutScrollContext.tsx frontend/src/contexts/LayoutScrollContext.test.tsx
git commit -m "feat: add LayoutScrollContext for per-page scroll control"
```

---

### Task 2: Wire context into MainLayout

**Files:**
- Modify: `frontend/src/components/common/MainLayout.tsx`

- [ ] **Step 1: Update MainLayout**

In `frontend/src/components/common/MainLayout.tsx`, add the import at the top with other imports:

```tsx
import { LayoutScrollProvider, useLayoutScrollContext } from '@/contexts/LayoutScrollContext'
```

Extract the inner content into a child component so the hook can consume the context that wraps it. Replace the entire file content with:

```tsx
import React, { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Box, Drawer } from '@mui/material'
import { useTheme } from '@mui/material/styles'

import { DRAWER_WIDTH_COLLAPSED, DRAWER_WIDTH_EXPANDED } from '@/constants/layout'
import { LayoutScrollProvider, useLayoutScrollContext } from '@/contexts/LayoutScrollContext'

import Sidebar from './Sidebar'
import TopBar from './TopBar'

const MainContent: React.FC = () => {
  const scrollEnabled = useLayoutScrollContext()
  return (
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
        overflow: scrollEnabled ? 'auto' : 'hidden',
        maxWidth: '100%',
      }}
    >
      <Outlet />
    </Box>
  )
}

const MainLayout: React.FC = () => {
  const theme = useTheme()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleDrawerToggle = () => {
    setMobileOpen(open => !open)
  }

  const handleToggleCollapse = () => {
    setCollapsed(current => {
      const next = !current
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', height: '100vh' }}>
      <TopBar collapsed={collapsed} onMobileMenuOpen={handleDrawerToggle} />

      <Box
        component="nav"
        sx={{
          width: { lg: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED },
          flexShrink: { lg: 0 },
        }}
      >
        <Drawer
          key={location.pathname}
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: false }}
          sx={{
            display: { xs: 'block', lg: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH_EXPANDED,
            },
          }}
        >
          <Sidebar collapsed={false} onItemClick={handleDrawerToggle} />
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', lg: 'block' },
            '& .MuiDrawer-paper': {
              bgcolor: theme.palette.background.default,
              boxSizing: 'border-box',
              width: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED,
              transition: 'width 0.22s ease',
              overflowX: 'hidden',
            },
          }}
          open
        >
          <Sidebar collapsed={collapsed} onToggleCollapse={handleToggleCollapse} />
        </Drawer>
      </Box>

      <LayoutScrollProvider>
        <MainContent />
      </LayoutScrollProvider>
    </Box>
  )
}

export default MainLayout
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/MainLayout.tsx
git commit -m "feat: wire LayoutScrollContext into MainLayout"
```

---

### Task 3: Enable scroll on DashboardPage

**Files:**
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx`

- [ ] **Step 1: Add the hook call**

In `frontend/src/pages/dashboard/DashboardPage.tsx`, add the import after the existing imports:

```tsx
import { useLayoutScroll } from '@/contexts/LayoutScrollContext'
```

Then at the top of the `DashboardPage` component body (before any other logic), add:

```tsx
useLayoutScroll(true)
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Run existing Dashboard tests**

```bash
cd frontend && npx vitest run src/pages/dashboard/DashboardPage.test.tsx
```

Expected: all tests PASS (the hook is a side-effect-only call; tests mock context or won't break)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat: enable scroll on DashboardPage (fixes #432)"
```
