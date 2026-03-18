# Sidebar Footer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SidebarFooter` component displaying logged-in user avatar/username, a logout action, and the app version — with correct expanded/collapsed behavior.

**Architecture:** Extract a new `SidebarFooter.tsx` leaf component that reads its own Redux state and renders conditional layouts for expanded vs collapsed sidebar modes. Wire it into `Sidebar.tsx` after the scrollable menu container. Add `__APP_VERSION__` build-time injection via Vite `define`.

**Tech Stack:** React 19, MUI v7, Redux Toolkit, Vitest + Testing Library, Vite

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/components/common/SidebarFooter.tsx` | **Create** | Footer component — user info, logout, version |
| `frontend/src/components/common/__tests__/SidebarFooter.test.tsx` | **Create** | Unit tests for footer |
| `frontend/src/components/common/Sidebar.tsx` | **Modify** | Import + render `<SidebarFooter>` |
| `frontend/vite.config.ts` | **Modify** | Add `define: { __APP_VERSION__ }` |
| `frontend/src/vite-env.d.ts` | **Modify** | Add `declare const __APP_VERSION__: string` |

---

## Task 1: Vite `__APP_VERSION__` injection

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/vite-env.d.ts`

- [ ] **Step 1: Add `define` to `vite.config.ts`**

Open `frontend/vite.config.ts`. Inside the `return { ... }` block, add `define` at the top level alongside `plugins` and `resolve` — NOT inside `build` or `test`:

```ts
define: {
  __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
},
```

The full return block should look like:
```ts
return {
  customLogger: isVitest ? vitestLogger : undefined,
  plugins: isVitest ? [] : [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  resolve: { ... },
  // ... rest unchanged
}
```

- [ ] **Step 2: Add type declaration to `vite-env.d.ts`**

`frontend/src/vite-env.d.ts` currently contains only `/// <reference types="vite/client" />`. Add the global declaration below it:

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string
```

- [ ] **Step 3: Verify TypeScript is happy**

```bash
cd frontend && npm run type-check
```
Expected: no errors mentioning `__APP_VERSION__`.

- [ ] **Step 4: Commit**

```bash
git add frontend/vite.config.ts frontend/src/vite-env.d.ts
git commit -m "feat: inject __APP_VERSION__ at build time via Vite define"
```

---

## Task 2: `SidebarFooter` — write failing tests first

**Files:**
- Create: `frontend/src/components/common/__tests__/SidebarFooter.test.tsx`

Tests use a minimal Redux store (just the `auth` slice). No `MemoryRouter` is needed since `SidebarFooter` does not navigate.

The store shape for tests:
```ts
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/store/slices/authSlice'

const makeStore = (authOverrides = {}) =>
  configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: '1', username: 'jdoe', firstName: 'Jane', lastName: 'Doe',
          email: 'j@test.com', role: 'admin', isActive: true,
          status: 'active', failedLoginAttempts: 0,
          createdAt: '2024-01-01', updatedAt: '2024-01-01',
        },
        refreshToken: 'test-token',
        accessToken: 'access-token',
        isAuthenticated: true,
        loading: false,
        error: null,
        lastActivityTime: null,
        inactivityTimeoutMinutes: 30,
        rememberMe: false,
        ...authOverrides,
      },
    },
  })
```

> **Note on `AuthUser` shape:** Check `frontend/src/store/slices/authSlice.ts` for the exact `AuthUser` interface fields if the above shape causes type errors — adjust the preloaded state accordingly.

- [ ] **Step 1: Write the test file**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import SidebarFooter from '../SidebarFooter'
import authReducer from '@/store/slices/authSlice'

// __APP_VERSION__ is declared as a global in vite-env.d.ts;
// in the test environment it's injected by Vite define with fallback '0.0.0'.

const makeStore = (authOverrides = {}) =>
  configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: '1',
          username: 'jdoe',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'j@test.com',
          role: 'admin',
          isActive: true,
          status: 'active',
          failedLoginAttempts: 0,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        refreshToken: 'test-refresh-token',
        accessToken: 'test-access-token',
        isAuthenticated: true,
        loading: false,
        error: null,
        lastActivityTime: null,
        inactivityTimeoutMinutes: 30,
        rememberMe: false,
        ...authOverrides,
      },
    },
  })

const renderFooter = (props = {}, authOverrides = {}) => {
  const store = makeStore(authOverrides)
  return render(
    <Provider store={store}>
      <SidebarFooter collapsed={false} {...props} />
    </Provider>
  )
}

describe('SidebarFooter', () => {
  it('renders username in expanded mode', () => {
    renderFooter()
    expect(screen.getByText('jdoe')).toBeInTheDocument()
  })

  it('renders avatar with initials JD', () => {
    renderFooter()
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('renders version string', () => {
    renderFooter()
    // version comes from __APP_VERSION__ with fallback '0.0.0'
    expect(screen.getByText(/^v/)).toBeInTheDocument()
  })

  it('falls back to username initial when no first/last name', () => {
    renderFooter({}, {
      user: { id: '2', username: 'bob', firstName: '', lastName: '', email: 'b@test.com', role: 'admin', isActive: true, status: 'active', failedLoginAttempts: 0, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    })
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders nothing when user is null', () => {
    const { container } = renderFooter({}, { user: null, isAuthenticated: false })
    expect(container.firstChild).toBeNull()
  })

  it('hides username and version in collapsed mode', () => {
    renderFooter({ collapsed: true })
    expect(screen.queryByText('jdoe')).not.toBeInTheDocument()
    expect(screen.queryByText(/^v/)).not.toBeInTheDocument()
  })

  it('shows avatar tooltip with username in collapsed mode', async () => {
    renderFooter({ collapsed: true })
    // Avatar is present (by initials)
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('dispatches logout when row is clicked in expanded mode', async () => {
    const store = makeStore()
    const dispatchSpy = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <SidebarFooter collapsed={false} />
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: /logout/i }))
    expect(dispatchSpy).toHaveBeenCalled()
  })

  it('dispatches logout when icon button is clicked in collapsed mode', () => {
    const store = makeStore()
    const dispatchSpy = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <SidebarFooter collapsed={true} />
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: /logout/i }))
    expect(dispatchSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — confirm they ALL fail (component doesn't exist yet)**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SidebarFooter.test.tsx --no-coverage
```

Expected: all tests fail with something like `Cannot find module '../SidebarFooter'`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add frontend/src/components/common/__tests__/SidebarFooter.test.tsx
git commit -m "test: add failing tests for SidebarFooter component"
```

---

## Task 3: Implement `SidebarFooter`

**Files:**
- Create: `frontend/src/components/common/SidebarFooter.tsx`

`SIDEBAR_COLORS` is defined in `Sidebar.tsx` as a `const` at module scope (line ~102). You need to either duplicate the relevant tokens here or move `SIDEBAR_COLORS` to a shared location. **Recommended: copy only the tokens you need as a local `const` — do not restructure `Sidebar.tsx`.**

- [ ] **Step 1: Create `SidebarFooter.tsx`**

```tsx
import React from 'react'
import {
  Avatar,
  Box,
  IconButton,
  ListItemButton,
  Tooltip,
  Typography,
} from '@mui/material'
import { Logout as LogoutIcon } from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import { logout, selectCurrentUser, selectRefreshToken } from '@/store/slices/authSlice'
import type { AppDispatch } from '@/store'

// Local copy of sidebar color tokens — keep in sync with SIDEBAR_COLORS in Sidebar.tsx
const COLORS = {
  border: '#1F2937',
  hoverBg: '#1E1E1E',
  activeText: '#FFFFFF',
  sectionLabel: '#6B7280',
  icon: '#6B7280',
  hoverText: '#CBD5E1',
} as const

interface SidebarFooterProps {
  collapsed: boolean
}

const SidebarFooter: React.FC<SidebarFooterProps> = ({ collapsed }) => {
  const dispatch = useDispatch<AppDispatch>()
  const user = useSelector(selectCurrentUser)
  const refreshToken = useSelector(selectRefreshToken)

  if (!user) return null

  const { username, firstName, lastName } = user
  const initials = (
    (firstName?.[0] ?? '') + (lastName?.[0] ?? '') ||
    username?.[0] ||
    'U'
  ).toUpperCase()

  const version = __APP_VERSION__ || '0.0.0'

  const handleLogout = () => {
    if (refreshToken) {
      dispatch(logout(refreshToken))
    }
  }

  if (collapsed) {
    return (
      <Box
        sx={{
          borderTop: `1px solid ${COLORS.border}`,
          py: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <Tooltip title={username} placement="right">
          <Box
            sx={{
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'default',
            }}
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.75rem' }}>
              {initials}
            </Avatar>
          </Box>
        </Tooltip>
        <Tooltip title="Logout" placement="right">
          <IconButton
            onClick={handleLogout}
            aria-label="Logout"
            size="small"
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              color: COLORS.icon,
              '&:hover': {
                bgcolor: COLORS.hoverBg,
                color: COLORS.hoverText,
              },
            }}
          >
            <LogoutIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
    )
  }

  return (
    <Box sx={{ borderTop: `1px solid ${COLORS.border}` }}>
      <ListItemButton
        onClick={handleLogout}
        aria-label="Logout"
        sx={{
          px: 2,
          py: 1.5,
          '&:hover': {
            bgcolor: COLORS.hoverBg,
            '& svg': { color: COLORS.hoverText },
          },
        }}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.75rem', flexShrink: 0 }}>
          {initials}
        </Avatar>
        <Box sx={{ ml: 1.5, flex: 1, minWidth: 0 }}>
          <Typography
            noWrap
            sx={{ color: COLORS.activeText, fontSize: '0.875rem', lineHeight: 1.3 }}
          >
            {username}
          </Typography>
          <Typography
            sx={{
              color: COLORS.sectionLabel,
              fontSize: '0.7rem',
              lineHeight: 1.2,
              mt: '2px',
            }}
          >
            v{version}
          </Typography>
        </Box>
        <Tooltip title="Logout">
          <LogoutIcon sx={{ color: COLORS.icon, fontSize: 18, flexShrink: 0 }} />
        </Tooltip>
      </ListItemButton>
    </Box>
  )
}

export default SidebarFooter
```

- [ ] **Step 2: Run tests — all should pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SidebarFooter.test.tsx --no-coverage
```

Expected: all 9 tests PASS.

If the `__APP_VERSION__` global is not defined in Vitest, add it explicitly to `vite.config.ts` inside the `test` block:
```ts
test: {
  globals: true,
  // ...existing...
  env: { npm_package_version: '0.0.0' },
}
```
But the `define` at top level should already cover it since Vite processes `define` replacements for Vitest too.

- [ ] **Step 3: Run the full frontend test suite to catch regressions**

```bash
cd frontend && npm run test
```

Expected: all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/SidebarFooter.tsx
git commit -m "feat: add SidebarFooter component with user info, logout, and version"
```

---

## Task 4: Wire `SidebarFooter` into `Sidebar.tsx`

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

The insertion point is line ~1293 — immediately after the closing `</Box>` of the scrollable menu container (the `<Box sx={{ flexGrow: 1, overflow: 'auto', py: 1 }}>` block). The Popper/flyout code follows after.

- [ ] **Step 1: Add import at the top of `Sidebar.tsx`**

Find the existing imports near the top of the file (around line 1–80). Add after the last import line:

```tsx
import SidebarFooter from './SidebarFooter'
```

- [ ] **Step 2: Render `<SidebarFooter>` in the return block**

Find the closing `</Box>` at line ~1293 (end of the scrollable menu container), just before the `{/* Popper gated... */}` comment. Insert the footer between the menu box close and the Popper block:

```tsx
      </Box>  {/* ← this is the existing end of the scrollable menu box */}

      <SidebarFooter collapsed={collapsed} />

      {collapsed && flyoutItemId && (() => {  {/* ← existing Popper block */}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 4: Mock `SidebarFooter` in `Sidebar.test.tsx`**

The existing `Sidebar.test.tsx` renders `<Sidebar>` without a Redux `Provider`. Now that `Sidebar` renders `<SidebarFooter>` as a child, and `SidebarFooter` calls `useSelector`, tests will throw a Redux store error. Mock the footer so `Sidebar.test.tsx` stays focused on navigation behaviour:

Open `frontend/src/components/common/__tests__/Sidebar.test.tsx` and add this mock after the existing `vi.mock(...)` calls:

```ts
vi.mock('../SidebarFooter', () => ({
  default: () => null,
}))
```

- [ ] **Step 5: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: all pass.

- [ ] **Step 6: Re-run all tests to confirm everything passes**

```bash
cd frontend && npm run test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx frontend/src/components/common/__tests__/Sidebar.test.tsx
git commit -m "feat: wire SidebarFooter into Sidebar layout"
```

---

## Task 5: Final verification

- [ ] **Step 1: TypeScript full check**

```bash
cd frontend && npm run type-check
```

Expected: 0 errors.

- [ ] **Step 2: Lint**

```bash
cd frontend && npm run lint
```

Expected: 0 errors (warnings are acceptable).

- [ ] **Step 3: Full test suite**

```bash
cd frontend && npm run test
```

Expected: all pass.

- [ ] **Step 4: Commit if any lint fixes were needed, otherwise done**

```bash
git add -p  # only if lint auto-fixed something
git commit -m "chore: lint fixes for sidebar footer"
```

---

## Reference

- Spec: `docs/superpowers/specs/2026-03-18-sidebar-footer-design.md`
- `SIDEBAR_COLORS` definition: `frontend/src/components/common/Sidebar.tsx:102`
- `AuthUser` interface + `logout` thunk + selectors: `frontend/src/store/slices/authSlice.ts`
- `AppDispatch` type: `frontend/src/store/index.ts`
- Existing sidebar test patterns: `frontend/src/components/common/__tests__/Sidebar.test.tsx`
