# Keyboard Shortcuts Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `KeyboardShortcutsModal` triggered by a TopBar icon and the `?` key, and standardize all four TopBar overlay state patterns.

**Architecture:** All overlay open/close state lives in `TopBar.tsx`. `SystemStatus` is refactored to accept `anchorEl`/`open`/`onOpen`/`onClose` props (matching `NotificationPanel`'s pattern). `KeyboardShortcutsModal` is a new MUI `Dialog` component rendered at the bottom of `TopBar`'s return alongside `SearchModal` and `NotificationPanel`.

**Tech Stack:** React 19, MUI v7, Vitest, React Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/common/SystemStatus.tsx` | Modify | Accept open/anchor props; remove internal anchorEl state |
| `src/components/common/KeyboardShortcutsModal.tsx` | Create | Dialog showing grouped keyboard shortcuts |
| `src/components/common/TopBar.tsx` | Modify | Add systemStatusAnchorEl + shortcutsOpen state, `?` key listener, KeyboardIcon button |
| `src/components/common/__tests__/SystemStatus.test.tsx` | Modify | Update to pass required props |
| `src/components/common/__tests__/KeyboardShortcutsModal.test.tsx` | Create | Tests for modal content and close behavior |
| `src/components/common/__tests__/TopBar.test.tsx` | Modify | Tests for `?` key, icon click, input suppression |

---

### Task 1: Refactor SystemStatus to accept open/anchor props

**Files:**
- Modify: `src/components/common/SystemStatus.tsx`
- Modify: `src/components/common/__tests__/SystemStatus.test.tsx`

- [ ] **Step 1: Update the SystemStatus test to pass the new required props**

Open `src/components/common/__tests__/SystemStatus.test.tsx`. Replace every `render(<SystemStatus />)` call with a helper that passes the required props:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SystemStatus from '../SystemStatus'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  ApiService: { get: mockGet },
}))

const healthyResponse = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: 3600,
  environment: 'test',
  services: {
    backend: { status: 'healthy', message: 'OK' },
    database: { status: 'healthy', message: 'OK' },
    redis: { status: 'healthy', message: 'OK' },
  },
}

function renderSystemStatus(anchorEl: HTMLElement | null = null, open = false) {
  const onOpen = vi.fn()
  const onClose = vi.fn()
  render(<SystemStatus anchorEl={anchorEl} open={open} onOpen={onOpen} onClose={onClose} />)
  return { onOpen, onClose }
}

describe('SystemStatus', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(healthyResponse)
  })

  it('renders an icon button and not a chip text label', () => {
    renderSystemStatus()

    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument()
    expect(screen.queryByText('UNHEALTHY')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows a system tooltip label after data loads', async () => {
    renderSystemStatus()

    await waitFor(() => {
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(mockGet).toHaveBeenCalled()
    })
  })

  it('shows unknown status state during initial load', () => {
    mockGet.mockReturnValue(new Promise(() => {}))

    renderSystemStatus()

    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument()
    expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls onOpen when the icon button is clicked', () => {
    const { onOpen } = renderSystemStatus()

    fireEvent.click(screen.getByRole('button'))

    expect(onOpen).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SystemStatus.test.tsx
```

Expected: FAIL — `SystemStatus` does not accept these props yet.

- [ ] **Step 3: Refactor SystemStatus.tsx to accept props**

Replace the component signature and internals. Remove internal `anchorEl` state and the `handleClick`/`handleClose` functions. The full updated file:

```tsx
import React, { useEffect, useState } from 'react'
import { keyframes } from '@emotion/react'
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Popover,
  Tooltip,
  Typography,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { default as NginxIcon } from '@mui/icons-material/CloudQueue'
import { default as BackendIcon } from '@mui/icons-material/Computer'
import { default as DnsRoundedIcon } from '@mui/icons-material/DnsRounded'
import { default as InfoIcon } from '@mui/icons-material/InfoOutlined'
import { default as RedisIcon } from '@mui/icons-material/Memory'
import { default as DatabaseIcon } from '@mui/icons-material/Storage'

import { ApiService } from '@/services/api'

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'unknown'
  message: string
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  environment: string
  services: {
    backend: ServiceHealth
    database: ServiceHealth
    redis: ServiceHealth
  }
}

interface SystemStatusProps {
  anchorEl: HTMLElement | null
  open: boolean
  onOpen: (event: React.MouseEvent<HTMLElement>) => void
  onClose: () => void
}

const statusPulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.3); }
`

const SystemStatus: React.FC<SystemStatusProps> = ({ anchorEl, open, onOpen, onClose }) => {
  const theme = useTheme()
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [frontendStatus, setFrontendStatus] = useState<'healthy' | 'unknown'>('healthy')

  const checkHealth = async () => {
    setLoading(true)
    try {
      const response = await ApiService.get<HealthResponse>('/health')
      const healthData = response as HealthResponse
      setHealth(healthData)
      setFrontendStatus('healthy')
    } catch (error) {
      setHealth(null)
      console.error('Health check failed:', error)
    }
    setLoading(false)
  }

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    onOpen(event)
    void checkHealth()
  }

  const getStatusColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
    switch (status) {
      case 'healthy': return 'success'
      case 'unhealthy': return 'error'
      case 'degraded': return 'warning'
      default: return 'default'
    }
  }

  const getOverallStatus = (): 'healthy' | 'degraded' | 'unhealthy' | 'unknown' => {
    if (loading && !health) return 'unknown'
    if (!health) return 'unknown'
    return health.status
  }

  const getDotColor = (status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'): string => {
    switch (status) {
      case 'healthy': return theme.palette.success.main
      case 'degraded': return theme.palette.warning.main
      case 'unhealthy': return theme.palette.error.main
      default: return theme.palette.text.secondary
    }
  }

  const getTooltipText = (status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'): string => {
    switch (status) {
      case 'healthy': return 'System: Healthy - All services operational'
      case 'degraded': return 'System: Degraded - One or more services affected'
      case 'unhealthy': return 'System: Unhealthy - Backend may be offline'
      default: return 'System: Unknown - Checking status...'
    }
  }

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  const overallStatus = getOverallStatus()
  const dotColor = getDotColor(overallStatus)
  const tooltipText = getTooltipText(overallStatus)
  const shouldPulse = overallStatus === 'degraded' || overallStatus === 'unhealthy'

  return (
    <>
      <Tooltip title={tooltipText}>
        <IconButton
          onClick={handleClick}
          color="inherit"
          size="small"
          sx={{ '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' } }}
        >
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <DnsRoundedIcon sx={{ fontSize: 22, color: theme.palette.text.secondary }} />
            <Box
              sx={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: dotColor,
                animation: shouldPulse ? `${statusPulse} 1.8s ease-in-out infinite` : 'none',
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            />
          </Box>
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={onClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 350, mt: 1 } } }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>System Status</Typography>
            {loading && <CircularProgress size={20} />}
          </Box>

          {health && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Overall Status</Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Chip label={health.status.toUpperCase()} color={getStatusColor(health.status)} size="small" sx={{ fontWeight: 600 }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                    Uptime: {formatUptime(health.uptime)}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Services</Typography>

              <List sx={{ p: 0 }}>
                {[
                  { icon: <NginxIcon fontSize="small" color="action" />, label: 'Frontend', status: frontendStatus, message: 'Web server running' },
                  { icon: <BackendIcon fontSize="small" color="action" />, label: 'Backend API', status: health.services.backend.status, message: health.services.backend.message },
                  { icon: <DatabaseIcon fontSize="small" color="action" />, label: 'PostgreSQL', status: health.services.database.status, message: health.services.database.message },
                  { icon: <RedisIcon fontSize="small" color="action" />, label: 'Redis', status: health.services.redis.status, message: health.services.redis.message },
                ].map(({ icon, label, status, message }) => (
                  <ListItem key={label} sx={{ px: 0, py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>{icon}</ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="body2">{label}</Typography>
                          <Chip label={status.toUpperCase()} color={getStatusColor(status)} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />
                        </Box>
                      }
                      secondary={<Typography variant="caption" sx={{ color: 'text.secondary' }}>{message}</Typography>}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}

          {!health && !loading && (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <InfoIcon color="disabled" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Unable to fetch system health information
              </Typography>
            </Box>
          )}
        </Box>
      </Popover>
    </>
  )
}

export default SystemStatus
```

- [ ] **Step 4: Run the SystemStatus tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SystemStatus.test.tsx
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/common/SystemStatus.tsx src/components/common/__tests__/SystemStatus.test.tsx
git commit -m "refactor(topbar): move SystemStatus anchorEl state to TopBar props (issue #452)"
```

---

### Task 2: Create KeyboardShortcutsModal

**Files:**
- Create: `src/components/common/KeyboardShortcutsModal.tsx`
- Create: `src/components/common/__tests__/KeyboardShortcutsModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/common/__tests__/KeyboardShortcutsModal.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import KeyboardShortcutsModal from '../KeyboardShortcutsModal'

function renderModal(open = true) {
  const onClose = vi.fn()
  render(<KeyboardShortcutsModal open={open} onClose={onClose} />)
  return { onClose }
}

describe('KeyboardShortcutsModal', () => {
  it('renders the List Navigation group heading', () => {
    renderModal()
    expect(screen.getByText('List Navigation')).toBeInTheDocument()
  })

  it('renders the Global group heading', () => {
    renderModal()
    expect(screen.getByText('Global')).toBeInTheDocument()
  })

  it('renders all list navigation shortcut rows', () => {
    renderModal()
    expect(screen.getByText('Navigate between items')).toBeInTheDocument()
    expect(screen.getByText('Jump 20 items')).toBeInTheDocument()
    expect(screen.getByText('First / last item')).toBeInTheDocument()
    expect(screen.getByText('Edit selected item')).toBeInTheDocument()
    expect(screen.getByText('Clear selection or close dialog')).toBeInTheDocument()
  })

  it('renders all global shortcut rows', () => {
    renderModal()
    expect(screen.getByText('Open global search')).toBeInTheDocument()
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument()
  })

  it('renders the footer note', () => {
    renderModal()
    expect(screen.getByText(/list navigation shortcuts apply on list and table pages only/i)).toBeInTheDocument()
  })

  it('does not render when open is false', () => {
    renderModal(false)
    expect(screen.queryByText('List Navigation')).not.toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/components/common/__tests__/KeyboardShortcutsModal.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create KeyboardShortcutsModal.tsx**

Create `src/components/common/KeyboardShortcutsModal.tsx`:

```tsx
import React from 'react'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'
import { default as CloseIcon } from '@mui/icons-material/Close'
import { useTheme } from '@mui/material/styles'

interface KeyboardShortcutsModalProps {
  open: boolean
  onClose: () => void
}

const LIST_NAVIGATION_SHORTCUTS = [
  { key: '↑ / ↓', action: 'Navigate between items' },
  { key: 'Page Up / Page Down', action: 'Jump 20 items' },
  { key: 'Home / End', action: 'First / last item' },
  { key: 'Enter', action: 'Edit selected item' },
  { key: 'Escape', action: 'Clear selection or close dialog' },
]

const GLOBAL_SHORTCUTS = [
  { key: 'Ctrl+K', action: 'Open global search' },
  { key: '?', action: 'Show keyboard shortcuts' },
]

function ShortcutGroup({ label, shortcuts }: { label: string; shortcuts: { key: string; action: string }[] }) {
  const theme = useTheme()

  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        variant="overline"
        sx={{ color: theme.palette.text.secondary, fontWeight: 600, letterSpacing: '0.08em', display: 'block', mb: 1 }}
      >
        {label}
      </Typography>
      <Table size="small">
        <TableBody>
          {shortcuts.map(({ key, action }) => (
            <TableRow key={key} sx={{ '&:last-child td': { border: 0 } }}>
              <TableCell sx={{ pl: 0, width: 160, border: 0, py: 0.75 }}>
                <Box
                  component="kbd"
                  sx={{
                    bgcolor: theme.palette.action.hover,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: '4px',
                    px: 0.75,
                    py: 0.25,
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: theme.palette.text.primary,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {key}
                </Box>
              </TableCell>
              <TableCell sx={{ pr: 0, border: 0, py: 0.75 }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {action}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ open, onClose }) => {
  const theme = useTheme()

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>Keyboard Shortcuts</Typography>
        <IconButton aria-label="close" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <ShortcutGroup label="List Navigation" shortcuts={LIST_NAVIGATION_SHORTCUTS} />
        <Divider sx={{ my: 2 }} />
        <ShortcutGroup label="Global" shortcuts={GLOBAL_SHORTCUTS} />

        <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
            List navigation shortcuts apply on list and table pages only.
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

export default KeyboardShortcutsModal
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/KeyboardShortcutsModal.test.tsx
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/common/KeyboardShortcutsModal.tsx src/components/common/__tests__/KeyboardShortcutsModal.test.tsx
git commit -m "feat(topbar): add KeyboardShortcutsModal component (issue #452)"
```

---

### Task 3: Wire everything into TopBar

**Files:**
- Modify: `src/components/common/TopBar.tsx`
- Modify: `src/components/common/__tests__/TopBar.test.tsx`

- [ ] **Step 1: Add new TopBar tests**

Open `src/components/common/__tests__/TopBar.test.tsx`. Update the `SystemStatus` mock and add a new mock for `KeyboardShortcutsModal`, then add a new `describe` block. The full updated file:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import TopBar from '../TopBar'

vi.mock('../NotificationPanel', () => ({ default: () => null }))
vi.mock('../SystemStatus', () => ({
  default: ({ onOpen }: { onOpen: (e: React.MouseEvent<HTMLElement>) => void }) => (
    <button data-testid="system-status" onClick={onOpen}>SystemStatus</button>
  ),
}))
vi.mock('../SearchModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="search-modal" /> : null),
}))
vi.mock('../KeyboardShortcutsModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="shortcuts-modal" /> : null),
}))

const mockUseMatches = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useMatches: () => mockUseMatches(),
  }
})

function makeStore(unreadCount = 0) {
  return configureStore({
    reducer: {
      notifications: (state = { notifications: [], unreadCount }) => state,
    },
  })
}

function renderTopBar(path: string, collapsed = false) {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[path]}>
        <TopBar collapsed={collapsed} onMobileMenuOpen={vi.fn()} />
      </MemoryRouter>
    </Provider>
  )
}

describe('TopBar breadcrumbs', () => {
  it('shows leaf segment for a known single-segment path', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])
    renderTopBar('/dashboard')
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('shows multi-segment breadcrumb for deep path', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Create Product' } }])
    renderTopBar('/inventory/products/create')
    expect(screen.getByText('Inventory')).toBeInTheDocument()
    expect(screen.getByText('Products')).toBeInTheDocument()
    expect(screen.getByText('Create Product')).toBeInTheDocument()
  })

  it('renders nothing in breadcrumb area for unmapped path', () => {
    mockUseMatches.mockReturnValue([])
    renderTopBar('/unknown/path')
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('renders ancestor breadcrumb segments as links for navigable paths', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Products' } }])
    renderTopBar('/inventory/products')
    const inventoryLink = screen.getByRole('link', { name: 'Inventory' })
    expect(inventoryLink).toBeInTheDocument()
    expect(inventoryLink).toHaveAttribute('href', '/inventory')
  })

  it('shows inventory costing for the renamed settings path', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Inventory Costing' } }])
    renderTopBar('/settings/inventory-costing')
    expect(screen.getByText('Inventory Costing')).toBeInTheDocument()
  })
})

describe('TopBar search', () => {
  it('opens search modal when search trigger is clicked', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])
    renderTopBar('/dashboard')
    fireEvent.click(screen.getByRole('button', { name: /open global search/i }))
    expect(screen.getByTestId('search-modal')).toBeInTheDocument()
  })

  it('opens search modal on Ctrl+K', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])
    renderTopBar('/dashboard')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByTestId('search-modal')).toBeInTheDocument()
  })

  it('does not open search modal when Ctrl+K fires inside an input', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])
    renderTopBar('/dashboard')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'k', ctrlKey: true })
    expect(screen.queryByTestId('search-modal')).not.toBeInTheDocument()
    document.body.removeChild(input)
  })
})

describe('TopBar keyboard shortcuts modal', () => {
  it('opens shortcuts modal when keyboard icon is clicked', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])
    renderTopBar('/dashboard')
    fireEvent.click(screen.getByRole('button', { name: /keyboard shortcuts/i }))
    expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument()
  })

  it('opens shortcuts modal when ? key is pressed', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])
    renderTopBar('/dashboard')
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByTestId('shortcuts-modal')).toBeInTheDocument()
  })

  it('does not open shortcuts modal when ? fires inside an input', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])
    renderTopBar('/dashboard')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: '?' })
    expect(screen.queryByTestId('shortcuts-modal')).not.toBeInTheDocument()
    document.body.removeChild(input)
  })

  it('does not open shortcuts modal when ? fires inside a textarea', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Dashboard' } }])
    renderTopBar('/dashboard')
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
    fireEvent.keyDown(textarea, { key: '?' })
    expect(screen.queryByTestId('shortcuts-modal')).not.toBeInTheDocument()
    document.body.removeChild(textarea)
  })
})

describe('TopBar mobile layout', () => {
  it('shows leaf page title on mobile and hides search trigger', () => {
    mockUseMatches.mockReturnValue([{ handle: { title: 'Create Product' } }])
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
    renderTopBar('/inventory/products/create')
    expect(screen.getByText('Create Product')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open drawer/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/TopBar.test.tsx
```

Expected: FAIL — `KeyboardShortcutsModal` mock not found, `keyboard shortcuts` button not found.

- [ ] **Step 3: Update TopBar.tsx**

Replace `src/components/common/TopBar.tsx` with:

```tsx
import React, { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation, useMatches } from 'react-router-dom'
import {
  AppBar,
  Badge,
  Box,
  Breadcrumbs,
  IconButton,
  Link,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { default as KeyboardIcon } from '@mui/icons-material/Keyboard'
import { default as MenuIcon } from '@mui/icons-material/Menu'
import { default as NavigateNextIcon } from '@mui/icons-material/NavigateNext'
import { default as NotificationsIcon } from '@mui/icons-material/Notifications'
import { default as SearchIcon } from '@mui/icons-material/Search'

import { DRAWER_WIDTH_COLLAPSED, DRAWER_WIDTH_EXPANDED, TOPBAR_HEIGHT } from '@/constants/layout'
import { useAppSelector } from '@/hooks/useRedux'
import { selectUnreadCount } from '@/store/slices/notificationSlice'

import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import NotificationPanel from './NotificationPanel'
import SearchModal from './SearchModal'
import SystemStatus from './SystemStatus'

const BREADCRUMB_MAP: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/inventory': 'Inventory',
  '/sales': 'Sales',
  '/purchasing': 'Purchasing',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/accounting': 'Accounting',
  '/audit-logs': 'Audit Logs',
  '/inventory/products': 'Products',
  '/inventory/products/create': 'Create Product',
  '/inventory/categories': 'Categories',
  '/inventory/stock-adjustments': 'Stock Adjustments',
  '/inventory/stock-adjustments/create': 'Create Stock Adjustment',
  '/sales/customers': 'Customers',
  '/sales/orders': 'Sales Orders',
  '/sales/orders/create': 'Create Sales Order',
  '/sales/invoices': 'Invoices',
  '/sales/payments': 'Payments',
  '/purchasing/suppliers': 'Suppliers',
  '/purchasing/orders': 'Purchase Orders',
  '/purchasing/orders/create': 'Create Purchase Order',
  '/purchasing/goods-received': 'Goods Received',
  '/purchasing/vendor-payments': 'Vendor Payments',
  '/reports/inventory': 'Inventory',
  '/reports/purchasing': 'Purchasing',
  '/reports/sales': 'Sales',
  '/reports/inventory/summary': 'Inventory Summary',
  '/reports/inventory/historical': 'Historical Inventory',
  '/reports/inventory/movement-summary': 'Inventory Movement Summary',
  '/reports/inventory/price-list': 'Product Price List',
  '/reports/inventory/product-cost': 'Product Cost Report',
  '/reports/purchasing/order-summary': 'Purchase Order Summary',
  '/reports/purchasing/order-status': 'Purchase Order Status',
  '/reports/purchasing/order-details': 'Purchase Order Details',
  '/reports/purchasing/payment-details': 'Vendor Payment Details',
  '/reports/purchasing/vendor-purchase-list': 'Vendor Product List',
  '/reports/sales/product-summary': 'Sales by Product Summary',
  '/reports/sales/product-details': 'Sales by Product Details',
  '/reports/sales/order-summary': 'Sales Order Summary',
  '/reports/sales/order-profit': 'Sales Order Profit Report',
  '/reports/sales/customer-payment-summary': 'Customer Payment Summary',
  '/reports/sales/payment-by-order': 'Customer Payment by Order',
  '/reports/sales/payment-details': 'Customer Payment Details',
  '/reports/sales/order-history': 'Customer Order History',
  '/reports/sales/product-customer': 'Product Customer Report',
  '/settings/company': 'Company',
  '/settings/inventory-costing': 'Inventory Costing',
  '/settings/regional': 'Regional',
  '/settings/price-lists': 'Price Lists',
  '/settings/payment-methods': 'Payment Methods',
  '/settings/print': 'Print Settings',
  '/settings/document-numbers': 'Document Numbers',
  '/settings/users': 'Users',
  '/settings/roles': 'Roles & Permissions',
  '/settings/security': 'Security',
  '/settings/backup': 'Backup & Restore',
  '/accounting/dashboard': 'Dashboard',
  '/accounting/chart-of-accounts': 'Chart of Accounts',
  '/accounting/fiscal-periods': 'Fiscal Periods',
  '/accounting/journal-entries': 'Journal Entries',
  '/accounting/journal-entries/new': 'Create Journal Entry',
  '/accounting/account-mappings': 'Account Mappings',
  '/accounting/settlements': 'Settlements',
  '/accounting/owner-equity': "Owner's Equity",
  '/accounting/expenses': 'Expenses',
  '/accounting/fund-transfers': 'Fund Transfers',
  '/accounting/bank-reconciliations': 'Bank Reconciliation',
  '/accounting/bank-reconciliations/new': 'New Bank Reconciliation',
  '/accounting/reports': 'Reports',
  '/accounting/reports/trial-balance': 'Trial Balance',
  '/accounting/reports/balance-sheet': 'Balance Sheet',
  '/accounting/reports/profit-loss': 'Profit & Loss',
  '/accounting/reports/general-ledger': 'General Ledger',
  '/accounting/reports/account-activity': 'Account Activity',
}

const NAVIGABLE_PATHS = new Set([
  '/dashboard',
  '/inventory',
  '/sales',
  '/purchasing',
  '/audit-logs',
  '/inventory/products',
  '/inventory/categories',
  '/inventory/stock-adjustments',
  '/sales/customers',
  '/sales/orders',
  '/sales/invoices',
  '/sales/payments',
  '/purchasing/suppliers',
  '/purchasing/orders',
  '/purchasing/goods-received',
  '/purchasing/vendor-payments',
  '/accounting/dashboard',
  '/accounting/chart-of-accounts',
  '/accounting/fiscal-periods',
  '/accounting/journal-entries',
  '/accounting/account-mappings',
  '/accounting/settlements',
  '/accounting/owner-equity',
  '/accounting/expenses',
  '/accounting/fund-transfers',
  '/accounting/bank-reconciliations',
  '/settings/company',
  '/settings/inventory-costing',
  '/settings/regional',
  '/settings/price-lists',
  '/settings/payment-methods',
  '/settings/print',
  '/settings/document-numbers',
  '/settings/users',
  '/settings/roles',
  '/settings/security',
  '/settings/backup',
])

type RouteHandle = { title?: string }
type MatchShape = { handle?: RouteHandle | null }

interface BreadcrumbSegment {
  label: string
  path: string
  isNavigable: boolean
}

function buildBreadcrumbs(pathname: string, matches: MatchShape[]): BreadcrumbSegment[] {
  const leafMatch = [...matches].reverse().find(match => (match.handle as RouteHandle | undefined)?.title)
  const leafHandleTitle = (leafMatch?.handle as RouteHandle | undefined)?.title
  const parts = pathname.split('/').filter(Boolean)
  const prefixes = parts.map((_, index) => `/${parts.slice(0, index + 1).join('/')}`)

  return prefixes.reduce<BreadcrumbSegment[]>((segments, prefix, index) => {
    const isLast = index === prefixes.length - 1
    const label = isLast && leafHandleTitle ? leafHandleTitle : BREADCRUMB_MAP[prefix]
    if (!label) return segments
    segments.push({ label, path: prefix, isNavigable: NAVIGABLE_PATHS.has(prefix) && !isLast })
    return segments
  }, [])
}

interface TopBarProps {
  collapsed: boolean
  onMobileMenuOpen: () => void
}

const TopBar: React.FC<TopBarProps> = ({ collapsed, onMobileMenuOpen }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'))
  const location = useLocation()
  const matches = useMatches() as MatchShape[]
  const unreadCount = useAppSelector(selectUnreadCount)

  const [notificationAnchorEl, setNotificationAnchorEl] = useState<HTMLElement | null>(null)
  const [systemStatusAnchorEl, setSystemStatusAnchorEl] = useState<HTMLElement | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const sidebarWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED
  const breadcrumbs = buildBreadcrumbs(location.pathname, matches)
  const leafLabel = breadcrumbs[breadcrumbs.length - 1]?.label ?? ''

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const editable = target?.isContentEditable

      if (tag === 'input' || tag === 'textarea' || editable) return

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
        return
      }

      if (event.key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          width: { lg: `calc(100% - ${sidebarWidth}px)` },
          ml: { lg: `${sidebarWidth}px` },
          bgcolor: theme.palette.background.paper,
          color: 'text.primary',
          boxShadow: 'none',
          boxSizing: 'border-box',
          height: TOPBAR_HEIGHT,
          minHeight: TOPBAR_HEIGHT,
          borderBottom: `1px solid ${theme.palette.divider}`,
          transition: 'width 0.22s ease, margin-left 0.22s ease',
        }}
      >
        <Toolbar sx={{ minHeight: `${TOPBAR_HEIGHT}px !important`, height: TOPBAR_HEIGHT, gap: 1 }}>
          {isMobile && (
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={onMobileMenuOpen}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', height: '100%' }}>
            {isMobile ? (
              <Typography noWrap variant="body2" sx={{ color: theme.palette.text.primary, fontWeight: 500 }}>
                {leafLabel}
              </Typography>
            ) : breadcrumbs.length > 0 ? (
              <Breadcrumbs
                separator={<NavigateNextIcon sx={{ fontSize: 14, color: theme.palette.text.secondary, mx: 0.5 }} />}
                aria-label="breadcrumb"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
                  '& .MuiBreadcrumbs-separator': { mx: 0.75 },
                }}
              >
                {breadcrumbs.map((segment, index) => {
                  const isLast = index === breadcrumbs.length - 1
                  if (isLast) {
                    return (
                      <Typography key={segment.path} sx={{ fontSize: '13px', color: theme.palette.text.primary, fontWeight: 500, display: 'flex', alignItems: 'center', lineHeight: 1.4 }}>
                        {segment.label}
                      </Typography>
                    )
                  }
                  if (segment.isNavigable) {
                    return (
                      <Link key={segment.path} component={RouterLink} to={segment.path} underline="hover" sx={{ fontSize: '13px', fontWeight: 400, color: theme.palette.text.secondary, display: 'flex', alignItems: 'center', lineHeight: 1.4, transition: 'color 0.15s ease', '&:hover': { color: theme.palette.text.primary } }}>
                        {segment.label}
                      </Link>
                    )
                  }
                  return (
                    <Typography key={segment.path} sx={{ fontSize: '13px', fontWeight: 400, color: theme.palette.text.secondary, display: 'flex', alignItems: 'center', lineHeight: 1.4 }}>
                      {segment.label}
                    </Typography>
                  )
                })}
              </Breadcrumbs>
            ) : null}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <Box
              role="button"
              aria-label="Open global search"
              onClick={() => setSearchOpen(true)}
              sx={{
                display: { xs: 'none', lg: 'flex' },
                alignItems: 'center',
                gap: 1,
                width: 220,
                px: 1.5,
                py: 0.75,
                bgcolor: theme.palette.divider,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: '8px',
                cursor: 'pointer',
                '&:hover': { borderColor: theme.palette.grey[700] },
              }}
            >
              <SearchIcon sx={{ fontSize: 16, color: theme.palette.text.secondary, flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.8125rem', color: theme.palette.text.secondary, flexGrow: 1 }}>
                Search...
              </Typography>
              <Box component="kbd" sx={{ bgcolor: theme.palette.background.default, border: `1px solid ${theme.palette.grey[700]}`, borderRadius: '4px', px: 0.75, py: 0.25, fontSize: '11px', color: theme.palette.text.secondary, flexShrink: 0 }}>
                Ctrl+K
              </Box>
            </Box>

            <SystemStatus
              anchorEl={systemStatusAnchorEl}
              open={Boolean(systemStatusAnchorEl)}
              onOpen={(e) => setSystemStatusAnchorEl(e.currentTarget)}
              onClose={() => setSystemStatusAnchorEl(null)}
            />

            <Tooltip title="Keyboard Shortcuts">
              <IconButton
                aria-label="Keyboard Shortcuts"
                onClick={() => setShortcutsOpen(true)}
                color="inherit"
                sx={{ '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' } }}
              >
                <KeyboardIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Notifications">
              <IconButton
                onClick={(event) => setNotificationAnchorEl(event.currentTarget)}
                color="inherit"
                sx={{ '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' } }}
              >
                <Badge badgeContent={unreadCount} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      <NotificationPanel
        anchorEl={notificationAnchorEl}
        open={Boolean(notificationAnchorEl)}
        onClose={() => setNotificationAnchorEl(null)}
      />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  )
}

export default TopBar
```

- [ ] **Step 4: Run all three updated test files**

```bash
cd frontend && npx vitest run src/components/common/__tests__/TopBar.test.tsx src/components/common/__tests__/KeyboardShortcutsModal.test.tsx src/components/common/__tests__/SystemStatus.test.tsx
```

Expected: PASS (all tests in all three files)

- [ ] **Step 5: Run type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/common/TopBar.tsx src/components/common/__tests__/TopBar.test.tsx
git commit -m "feat(topbar): add keyboard shortcuts modal and standardize overlay state (issue #452)"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run the full set of affected tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/TopBar.test.tsx src/components/common/__tests__/KeyboardShortcutsModal.test.tsx src/components/common/__tests__/SystemStatus.test.tsx
```

Expected: all pass

- [ ] **Step 2: Type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit plan doc**

```bash
git add docs/superpowers/plans/2026-04-26-keyboard-shortcuts-guide.md
git commit -m "docs(plans): add implementation plan for keyboard shortcuts guide (issue #452)"
```
