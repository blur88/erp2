# Sidebar Footer Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar footer's bare logout button with an avatar-triggered dropdown menu containing settings, logout, username, and version; move logout confirmation to a lightweight inline popover; extract all interaction logic into a new `SidebarUserMenu` component.

**Architecture:** `SidebarFooter` becomes a stateless layout shell that renders `SidebarUserMenu`. `SidebarUserMenu` owns all Redux state reads, menu anchor state, logout flow, and visual differences between collapsed and expanded modes. The shared `ConfirmationDialog` is removed from this flow only — the component file is not deleted.

**Tech Stack:** React 19, Material-UI v7, Redux Toolkit, React Router v6, Vitest + @testing-library/react

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/common/SidebarUserMenu.tsx` | All interactive behavior: avatar trigger, dropdown menu, logout popover, Redux reads |
| Create | `frontend/src/components/common/__tests__/SidebarUserMenu.test.tsx` | Interaction tests for `SidebarUserMenu` |
| Modify | `frontend/src/components/common/SidebarFooter.tsx` | Strip to stateless layout shell, delegate to `SidebarUserMenu` |
| Modify | `frontend/src/components/common/__tests__/SidebarFooter.test.tsx` | Remove interaction tests, keep shell/layout tests only |

---

## Task 1: Create `SidebarUserMenu` with failing tests

Build the test file first with all expected behaviors, then implement the component.

**Files:**
- Create: `frontend/src/components/common/__tests__/SidebarUserMenu.test.tsx`
- Create: `frontend/src/components/common/SidebarUserMenu.tsx`

- [ ] **Step 1.1: Write the failing test file**

Create `frontend/src/components/common/__tests__/SidebarUserMenu.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import SidebarUserMenu from '../SidebarUserMenu'
import authReducer from '@/store/slices/authSlice'

// Mock persistor
vi.mock('@/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store')>()
  return { ...actual, persistor: { purge: vi.fn().mockResolvedValue(undefined) } }
})

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const baseUser = {
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
}

const makeStore = (authOverrides = {}) =>
  configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: baseUser,
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

const renderMenu = (props = {}, authOverrides = {}) => {
  const store = makeStore(authOverrides)
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter>
          <SidebarUserMenu collapsed={false} {...props} />
        </MemoryRouter>
      </Provider>
    ),
  }
}

describe('SidebarUserMenu', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders nothing when user is null', () => {
    const { container } = renderMenu({}, { user: null, isAuthenticated: false })
    expect(container.firstChild).toBeNull()
  })

  it('avatar click opens dropdown menu in expanded mode', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })

  it('avatar click opens dropdown menu in collapsed mode', async () => {
    renderMenu({ collapsed: true })
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })

  it('menu contains username, Settings, Logout, and version', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    expect(screen.getByText('jdoe')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /logout/i })).toBeInTheDocument()
    expect(screen.getByText(/^v/)).toBeInTheDocument()
  })

  it('Settings click navigates to /settings', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: /settings/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  it('Logout click closes menu and opens confirmation popover', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: /logout/i }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(screen.getByText(/log out\?/i)).toBeInTheDocument()
  })

  it('Cancel closes popover without dispatching logout', async () => {
    const { store } = renderMenu()
    const dispatchSpy = vi.spyOn(store, 'dispatch')
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: /logout/i }))
    await screen.findByText(/log out\?/i)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByText(/log out\?/i)).not.toBeInTheDocument()
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('Confirm dispatches logout thunk', async () => {
    const { store } = renderMenu()
    const dispatchSpy = vi.spyOn(store, 'dispatch')
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: /logout/i }))
    await screen.findByText(/log out\?/i)
    fireEvent.click(screen.getByRole('button', { name: /^logout$/i }))
    expect(dispatchSpy).toHaveBeenCalled()
  })

  it('menu closes on Escape key', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 1.2: Run the test to confirm it fails (component not found)**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SidebarUserMenu.test.tsx --no-coverage
```

Expected: FAIL — `Cannot find module '../SidebarUserMenu'`

- [ ] **Step 1.3: Create the `SidebarUserMenu` component**

Create `frontend/src/components/common/SidebarUserMenu.tsx`:

```tsx
import React, { useState } from 'react'
import {
  Avatar,
  Box,
  Divider,
  Menu,
  MenuItem,
  Popover,
  Typography,
  Button,
  ListItemIcon,
} from '@mui/material'
import {
  Logout as LogoutIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material'
import { useSelector } from 'react-redux'
import { useAppDispatch } from '@/hooks/useRedux'
import { useNavigate } from 'react-router-dom'
import {
  logout,
  selectCurrentUser,
  selectRefreshToken,
} from '@/store/slices/authSlice'
import { persistor } from '@/store'

// Local color constants — mirrors SIDEBAR_COLORS in Sidebar.tsx.
// Intentional duplication for Issue #138 scope. Future refactor:
// extract to a shared sidebarColors constants file.
const COLORS = {
  icon: '#6B7280',
  hoverText: '#CBD5E1',
  text: '#9CA3AF',
  mutedText: '#6B7280',
  menuBg: '#1E1E1E',
  border: '#1F2937',
} as const

interface SidebarUserMenuProps {
  collapsed: boolean
}

const SidebarUserMenu: React.FC<SidebarUserMenuProps> = ({ collapsed }) => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const user = useSelector(selectCurrentUser)
  const refreshToken = useSelector(selectRefreshToken)

  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [logoutAnchorEl, setLogoutAnchorEl] = useState<HTMLElement | null>(null)

  if (!user) return null

  const { username, firstName, lastName } = user
  const initials = (
    (firstName?.[0] ?? '') + (lastName?.[0] ?? '') || username?.[0] || 'U'
  ).toUpperCase()
  const version = __APP_VERSION__ || '0.0.0'

  const handleAvatarClick = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setMenuAnchorEl(null)
  }

  const handleSettingsClick = () => {
    handleMenuClose()
    navigate('/settings')
  }

  const handleLogoutClick = (event: React.MouseEvent<HTMLElement>) => {
    // Capture anchor BEFORE closing menu — menu item unmounts when menu closes
    setLogoutAnchorEl(event.currentTarget)
    handleMenuClose()
  }

  const handleLogoutCancel = () => {
    setLogoutAnchorEl(null)
  }

  const handleLogoutConfirm = async () => {
    setLogoutAnchorEl(null)
    if (refreshToken) {
      await dispatch(logout(refreshToken))
    }
    // persistor.purge() kept here for Issue #138 compatibility.
    // Circular import prevents moving this into the logout thunk.
    // Future: extract logoutAndClearStore() helper.
    await persistor.purge()
  }

  const avatarEl = (
    <Avatar
      sx={{
        width: 32,
        height: 32,
        bgcolor: 'primary.main',
        fontSize: '0.75rem',
        cursor: 'pointer',
        '&:hover': { filter: 'brightness(1.1)' },
      }}
    >
      {initials}
    </Avatar>
  )

  const avatarButton = (
    <Box
      component="button"
      aria-label="Open user menu"
      aria-haspopup="true"
      onClick={handleAvatarClick}
      sx={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {avatarEl}
    </Box>
  )

  return (
    <>
      {collapsed ? (
        // Collapsed: 40×40 click target wrapping avatar button
        <Box
          sx={{
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {avatarButton}
        </Box>
      ) : (
        // Expanded: full trigger row
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            height: '40px',
            px: 2,
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, transform 0.15s ease',
            '&:hover': {
              backgroundColor: '#1E1E1E',
              transform: 'translateX(1px)',
            },
          }}
          onClick={handleAvatarClick}
          role="button"
          aria-label="Open user menu"
          aria-haspopup="true"
        >
          {avatarEl}
          <Box sx={{ ml: 1.5, flex: 1, minWidth: 0 }}>
            <Typography
              noWrap
              sx={{
                color: '#FFFFFF',
                fontSize: '0.875rem',
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {username}
            </Typography>
            <Typography
              sx={{ color: COLORS.mutedText, fontSize: '0.7rem', lineHeight: 1.2, mt: '4px' }}
            >
              v{version}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Avatar dropdown Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            minWidth: 220,
            bgcolor: COLORS.menuBg,
            borderRadius: 1,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          },
        }}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
      >
        {/* Identity block */}
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ color: COLORS.text, fontSize: '0.75rem' }}>
            {username}
          </Typography>
        </Box>

        <Divider sx={{ borderColor: COLORS.border }} />

        <MenuItem
          onClick={handleSettingsClick}
          sx={{
            '& .MuiListItemIcon-root': { color: COLORS.icon },
            '&:hover .MuiListItemIcon-root': { color: COLORS.hoverText },
          }}
        >
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>

        <MenuItem
          onClick={handleLogoutClick}
          sx={{
            '& .MuiListItemIcon-root': { color: COLORS.icon },
            '&:hover .MuiListItemIcon-root': { color: COLORS.hoverText },
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>

        <Divider sx={{ borderColor: COLORS.border }} />

        {/* Version block */}
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ color: COLORS.mutedText, fontSize: '0.65rem' }}>
            v{version}
          </Typography>
        </Box>
      </Menu>

      {/* Logout confirmation Popover — sibling of Menu, not inside it */}
      <Popover
        open={Boolean(logoutAnchorEl)}
        anchorEl={logoutAnchorEl}
        onClose={handleLogoutCancel}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            bgcolor: COLORS.menuBg,
            border: `1px solid ${COLORS.border}`,
            p: 2,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ color: '#FFFFFF', fontSize: '0.875rem' }}>
            Log out?
          </Typography>
          <Button size="small" onClick={handleLogoutCancel} aria-label="Cancel">
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={handleLogoutConfirm}
            aria-label="Logout"
          >
            Logout
          </Button>
        </Box>
      </Popover>
    </>
  )
}

export default SidebarUserMenu
```

- [ ] **Step 1.4: Run the tests — expect most to pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SidebarUserMenu.test.tsx --no-coverage
```

Expected: All tests pass. Fix any failures before continuing.

- [ ] **Step 1.5: Commit**

```bash
git add frontend/src/components/common/SidebarUserMenu.tsx \
        frontend/src/components/common/__tests__/SidebarUserMenu.test.tsx
git commit -m "feat: add SidebarUserMenu with avatar dropdown and logout popover"
```

---

## Task 2: Refactor `SidebarFooter` into a stateless layout shell

Strip `SidebarFooter` of all state, auth imports, and interaction logic. Replace its body with a layout container that renders `SidebarUserMenu`.

**Files:**
- Modify: `frontend/src/components/common/SidebarFooter.tsx`
- Modify: `frontend/src/components/common/__tests__/SidebarFooter.test.tsx`

- [ ] **Step 2.1: Update the `SidebarFooter` tests to match the new shell contract**

Replace the contents of `frontend/src/components/common/__tests__/SidebarFooter.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import SidebarFooter from '../SidebarFooter'
import authReducer from '@/store/slices/authSlice'

const baseUser = {
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
}

const makeStore = (authOverrides = {}) =>
  configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: baseUser,
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

// SidebarFooter is a layout shell — SidebarUserMenu is a Redux-connected child,
// so Provider + MemoryRouter are still required even though SidebarFooter itself
// has no Redux or router dependencies.
const renderFooter = (props = {}, authOverrides = {}) =>
  render(
    <Provider store={makeStore(authOverrides)}>
      <MemoryRouter>
        <SidebarFooter collapsed={false} {...props} />
      </MemoryRouter>
    </Provider>
  )

describe('SidebarFooter (layout shell)', () => {
  it('renders in expanded mode without crashing', () => {
    const { container } = renderFooter()
    expect(container.firstChild).not.toBeNull()
  })

  it('renders in collapsed mode without crashing', () => {
    const { container } = renderFooter({ collapsed: true })
    expect(container.firstChild).not.toBeNull()
  })

  it('passes collapsed=false to SidebarUserMenu (avatar button is present)', () => {
    renderFooter({ collapsed: false })
    expect(screen.getByRole('button', { name: /open user menu/i })).toBeInTheDocument()
  })

  it('passes collapsed=true to SidebarUserMenu (avatar button is present)', () => {
    renderFooter({ collapsed: true })
    expect(screen.getByRole('button', { name: /open user menu/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2.2: Run the updated SidebarFooter tests — expect failures (old component)**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SidebarFooter.test.tsx --no-coverage
```

Expected: Multiple failures because `SidebarFooter` still has the old implementation.

- [ ] **Step 2.3: Rewrite `SidebarFooter.tsx` as a stateless shell**

Replace the full contents of `frontend/src/components/common/SidebarFooter.tsx`:

```tsx
import React from 'react'
import { Box } from '@mui/material'
import SidebarUserMenu from './SidebarUserMenu'

interface SidebarFooterProps {
  collapsed: boolean
}

const SidebarFooter: React.FC<SidebarFooterProps> = ({ collapsed }) => {
  return (
    <Box
      sx={{
        backgroundColor: '#141414',
        borderTop: '1px solid #1F2937',
        py: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: collapsed ? 'center' : 'stretch',
      }}
    >
      <SidebarUserMenu collapsed={collapsed} />
    </Box>
  )
}

export default SidebarFooter
```

- [ ] **Step 2.4: Run both test files — all should pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SidebarFooter.test.tsx \
  src/components/common/__tests__/SidebarUserMenu.test.tsx --no-coverage
```

Expected: All tests pass. Fix any failures before continuing.

- [ ] **Step 2.5: Commit**

```bash
git add frontend/src/components/common/SidebarFooter.tsx \
        frontend/src/components/common/__tests__/SidebarFooter.test.tsx
git commit -m "refactor: make SidebarFooter a stateless layout shell, delegate to SidebarUserMenu"
```

---

## Task 3: Run the full frontend test suite and TypeScript check

Verify nothing in the broader codebase broke.

**Files:** No changes — verification only.

- [ ] **Step 3.1: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors. If TypeScript errors appear, fix them before proceeding.

- [ ] **Step 3.2: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: All tests pass (including pre-existing tests unrelated to this feature). If failures appear in other files, investigate — they may be unrelated flakes or they may indicate a genuine regression.

- [ ] **Step 3.3: Commit if any fixes were required**

Only if you had to make additional fixes in step 3.1 or 3.2:

```bash
git add -p  # stage only the fix files
git commit -m "fix: resolve type errors from sidebar footer refactor"
```

---

## Verification Checklist

After Task 3 completes, manually verify in the browser (run `docker compose up -d` or `cd frontend && npm run dev`):

- [ ] Sidebar in **expanded mode**: clicking the avatar row opens the dropdown menu
- [ ] Menu shows username (top, non-clickable), Settings, Logout, version (bottom, non-clickable)
- [ ] Settings click navigates to `/settings`
- [ ] Logout click closes the menu and opens the inline "Log out?" popover
- [ ] Cancel closes the popover with no action
- [ ] Logout button in popover logs out (redirected to `/login` by `ProtectedRoute`)
- [ ] Sidebar in **collapsed mode**: clicking the avatar opens the same dropdown menu
- [ ] No separate logout icon button visible in collapsed mode
- [ ] Footer background is visibly `#141414` (slightly lighter than sidebar body)
- [ ] Expanded trigger row shows subtle hover background + 1px rightward shift

---

## Notes

**`ConfirmationDialog` is NOT deleted** — it is used in 18+ other pages across the app. Only its import in `SidebarFooter` is removed.

**`persistor.purge()` lives in `SidebarUserMenu`** — this is a deliberate compatibility carry-forward. Moving it to the `logout` thunk would require importing `persistor` into `authSlice.ts`, which creates a circular dependency (`authSlice` ← `store` ← `authSlice`). A future refactor should introduce a `logoutAndClearStore()` helper to resolve this cleanly.

**Color constants are duplicated** in `SidebarUserMenu` — `SIDEBAR_COLORS` in `Sidebar.tsx` is module-private and not exported. The duplication is intentional and scoped to this issue.
