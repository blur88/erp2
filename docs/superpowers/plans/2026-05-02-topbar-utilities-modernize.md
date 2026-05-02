# TopBar Utilities Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize all three TopBar utility panels (System Status, Notifications, Keyboard Shortcuts) behind a shared `TopBarUtilityPanel` wrapper, migrate `KeyboardShortcutsModal` from Dialog to Popover, and normalize all utility icon colors to `theme.palette.text.secondary`.

**Architecture:** A new thin `TopBarUtilityPanel` component wraps MUI `Popover` with fixed positioning and a standard title + close-button header. Each existing panel is refactored to use it. `KeyboardShortcutsModal` is renamed `KeyboardShortcutsPanel` and switches from an anchor-less Dialog to an icon-anchored Popover, requiring `TopBar.tsx` to track `shortcutsAnchorEl` state instead of a boolean.

**Tech Stack:** React 19, MUI v7, Vitest, `@testing-library/react`

---

## File Map

| Action | Path |
|--------|------|
| **Create** | `frontend/src/components/common/TopBarUtilityPanel.tsx` |
| **Create** | `frontend/src/components/common/__tests__/TopBarUtilityPanel.test.tsx` |
| **Rename + rewrite** | `KeyboardShortcutsModal.tsx` → `KeyboardShortcutsPanel.tsx` |
| **Rename + rewrite** | `__tests__/KeyboardShortcutsModal.test.tsx` → `__tests__/KeyboardShortcutsPanel.test.tsx` |
| **Modify** | `frontend/src/components/common/NotificationPanel.tsx` |
| **Modify** | `frontend/src/components/common/SystemStatus.tsx` |
| **Modify** | `frontend/src/components/common/TopBar.tsx` |

---

## Task 1: Create `TopBarUtilityPanel` with tests

**Files:**
- Create: `frontend/src/components/common/TopBarUtilityPanel.tsx`
- Create: `frontend/src/components/common/__tests__/TopBarUtilityPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/common/__tests__/TopBarUtilityPanel.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import TopBarUtilityPanel from '../TopBarUtilityPanel'

function renderPanel(props: Partial<React.ComponentProps<typeof TopBarUtilityPanel>> = {}) {
  const anchorEl = document.createElement('button')
  document.body.appendChild(anchorEl)
  const onClose = vi.fn()
  render(
    <TopBarUtilityPanel anchorEl={anchorEl} onClose={onClose} title="Test Panel" {...props}>
      <div data-testid="panel-content">Content</div>
    </TopBarUtilityPanel>
  )
  return { onClose, anchorEl }
}

describe('TopBarUtilityPanel', () => {
  it('renders the title', () => {
    renderPanel()
    expect(screen.getByText('Test Panel')).toBeInTheDocument()
  })

  it('renders children', () => {
    renderPanel()
    expect(screen.getByTestId('panel-content')).toBeInTheDocument()
  })

  it('renders a headerAction when provided', () => {
    renderPanel({ headerAction: <button data-testid="header-action">Action</button> })
    expect(screen.getByTestId('header-action')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const { onClose } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render when anchorEl is null', () => {
    const onClose = vi.fn()
    render(
      <TopBarUtilityPanel anchorEl={null} onClose={onClose} title="Hidden Panel">
        <div data-testid="hidden-content">Content</div>
      </TopBarUtilityPanel>
    )
    expect(screen.queryByText('Hidden Panel')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/TopBarUtilityPanel.test.tsx
```

Expected: FAIL — `Cannot find module '../TopBarUtilityPanel'`

- [ ] **Step 3: Create `TopBarUtilityPanel.tsx`**

```tsx
// frontend/src/components/common/TopBarUtilityPanel.tsx
import React from 'react'
import { Box, IconButton, Popover, Typography } from '@mui/material'
import { default as CloseIcon } from '@mui/icons-material/Close'

interface TopBarUtilityPanelProps {
  anchorEl: HTMLElement | null
  onClose: () => void
  title: string
  width?: number
  maxHeight?: number
  headerAction?: React.ReactNode
  children: React.ReactNode
}

const TopBarUtilityPanel: React.FC<TopBarUtilityPanelProps> = ({
  anchorEl,
  onClose,
  title,
  width = 380,
  maxHeight = 600,
  headerAction,
  children,
}) => {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: {
          sx: { width, maxHeight, mt: 1, borderRadius: '12px', overflow: 'hidden' },
        },
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {headerAction}
          <IconButton aria-label="close" size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      {children}
    </Popover>
  )
}

export default TopBarUtilityPanel
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/TopBarUtilityPanel.test.tsx
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/TopBarUtilityPanel.tsx frontend/src/components/common/__tests__/TopBarUtilityPanel.test.tsx
git commit -m "feat(ui): add TopBarUtilityPanel shared wrapper component"
```

---

## Task 2: Rename and refactor `KeyboardShortcutsModal` → `KeyboardShortcutsPanel`

**Files:**
- Create (rename): `frontend/src/components/common/KeyboardShortcutsPanel.tsx`
- Create (rename): `frontend/src/components/common/__tests__/KeyboardShortcutsPanel.test.tsx`
- Delete: `frontend/src/components/common/KeyboardShortcutsModal.tsx`
- Delete: `frontend/src/components/common/__tests__/KeyboardShortcutsModal.test.tsx`

- [ ] **Step 1: Write the failing tests for `KeyboardShortcutsPanel`**

```tsx
// frontend/src/components/common/__tests__/KeyboardShortcutsPanel.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import KeyboardShortcutsPanel from '../KeyboardShortcutsPanel'

function renderPanel(anchorEl: HTMLElement | null = null) {
  const onClose = vi.fn()
  render(<KeyboardShortcutsPanel anchorEl={anchorEl} onClose={onClose} />)
  return { onClose }
}

function renderOpen() {
  const anchorEl = document.createElement('button')
  document.body.appendChild(anchorEl)
  return renderPanel(anchorEl)
}

describe('KeyboardShortcutsPanel', () => {
  it('renders the List Navigation group heading when open', () => {
    renderOpen()
    expect(screen.getByText('List Navigation')).toBeInTheDocument()
  })

  it('renders the Global group heading when open', () => {
    renderOpen()
    expect(screen.getByText('Global')).toBeInTheDocument()
  })

  it('renders all list navigation shortcut rows', () => {
    renderOpen()
    expect(screen.getByText('Navigate between items')).toBeInTheDocument()
    expect(screen.getByText('Jump 20 items')).toBeInTheDocument()
    expect(screen.getByText('First / last item')).toBeInTheDocument()
    expect(screen.getByText('Edit selected item')).toBeInTheDocument()
    expect(screen.getByText('Clear selection or close dialog')).toBeInTheDocument()
  })

  it('renders all global shortcut rows', () => {
    renderOpen()
    expect(screen.getByText('Open global search')).toBeInTheDocument()
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument()
  })

  it('renders the footer note', () => {
    renderOpen()
    expect(screen.getByText(/list navigation shortcuts apply on list and table pages only/i)).toBeInTheDocument()
  })

  it('does not render content when anchorEl is null', () => {
    renderPanel(null)
    expect(screen.queryByText('List Navigation')).not.toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const { onClose } = renderOpen()
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/KeyboardShortcutsPanel.test.tsx
```

Expected: FAIL — `Cannot find module '../KeyboardShortcutsPanel'`

- [ ] **Step 3: Create `KeyboardShortcutsPanel.tsx`**

```tsx
// frontend/src/components/common/KeyboardShortcutsPanel.tsx
import React from 'react'
import {
  Box,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'

import TopBarUtilityPanel from './TopBarUtilityPanel'

interface KeyboardShortcutsPanelProps {
  anchorEl: HTMLElement | null
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

const KeyboardShortcutsPanel: React.FC<KeyboardShortcutsPanelProps> = ({ anchorEl, onClose }) => {
  const theme = useTheme()

  return (
    <TopBarUtilityPanel anchorEl={anchorEl} onClose={onClose} title="Keyboard Shortcuts" width={380}>
      <Box sx={{ p: 2 }}>
        <ShortcutGroup label="List Navigation" shortcuts={LIST_NAVIGATION_SHORTCUTS} />
        <Divider sx={{ my: 2 }} />
        <ShortcutGroup label="Global" shortcuts={GLOBAL_SHORTCUTS} />
        <Box sx={{ mt: 2, pt: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
            List navigation shortcuts apply on list and table pages only.
          </Typography>
        </Box>
      </Box>
    </TopBarUtilityPanel>
  )
}

export default KeyboardShortcutsPanel
```

- [ ] **Step 4: Run new tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/KeyboardShortcutsPanel.test.tsx
```

Expected: 7 tests PASS

- [ ] **Step 5: Delete old modal files**

```bash
rm frontend/src/components/common/KeyboardShortcutsModal.tsx
rm frontend/src/components/common/__tests__/KeyboardShortcutsModal.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/KeyboardShortcutsPanel.tsx frontend/src/components/common/__tests__/KeyboardShortcutsPanel.test.tsx
git rm frontend/src/components/common/KeyboardShortcutsModal.tsx frontend/src/components/common/__tests__/KeyboardShortcutsModal.test.tsx
git commit -m "feat(ui): rename KeyboardShortcutsModal to KeyboardShortcutsPanel and switch to Popover"
```

---

## Task 3: Refactor `NotificationPanel` to use `TopBarUtilityPanel`

**Files:**
- Modify: `frontend/src/components/common/NotificationPanel.tsx`

The `NotificationPanel` currently renders its own `Popover` with a local header (title + "Mark all read" button + close button). Replace the `Popover` + header block with `TopBarUtilityPanel`, passing the "Mark all read" button as `headerAction`. The notification unread badge on the title, the scrollable content list, and the footer are all preserved as `children`.

- [ ] **Step 1: Update the existing tests**

Open `frontend/src/components/common/NotificationPanel.test.tsx` and verify it still passes after the refactor. The tests check rendered content — not the Popover internals — so no test changes are needed. Run first to confirm current baseline:

```bash
cd frontend && npx vitest run src/components/common/NotificationPanel.test.tsx
```

Note the current pass count. Tests must still pass after Step 2.

- [ ] **Step 2: Refactor `NotificationPanel.tsx`**

Replace the file content with:

```tsx
import React from 'react'
import {
  Box,
  Typography,
  ListItemButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Divider,
  Chip,
  Badge,
  Tooltip,
} from '@mui/material'
import { default as MarkReadIcon } from '@mui/icons-material/MarkEmailRead'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as InfoIcon } from '@mui/icons-material/Info'
import { default as WarningIcon } from '@mui/icons-material/Warning'
import { default as ErrorIcon } from '@mui/icons-material/Error'
import { default as SuccessIcon } from '@mui/icons-material/CheckCircle'
import { default as CopyIcon } from '@mui/icons-material/ContentCopy'
import { default as CheckIcon } from '@mui/icons-material/Check'
import { formatDistanceToNow } from 'date-fns'

import { copyToClipboard } from '@/utils/clipboard'
import { useNotifications } from '@/hooks/useNotification'
import { useAppDispatch } from '@/hooks/useRedux'
import { markAsRead, markAllAsRead, removeNotification } from '@/store/slices/notificationSlice'
import type { Notification } from '@/types'
import { AppButton } from '@/components/common/AppButton'
import TopBarUtilityPanel from './TopBarUtilityPanel'

interface NotificationPanelProps {
  anchorEl: HTMLElement | null
  open: boolean
  onClose: () => void
}

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return <SuccessIcon sx={{ color: 'success.main' }} />
    case 'warning':
      return <WarningIcon sx={{ color: 'warning.main' }} />
    case 'error':
      return <ErrorIcon sx={{ color: 'error.main' }} />
    default:
      return <InfoIcon sx={{ color: 'info.main' }} />
  }
}

const getNotificationColor = (type: Notification['type']): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (type) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'info'
  }
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({
  anchorEl,
  open,
  onClose,
}) => {
  const { notifications } = useNotifications()
  const dispatch = useAppDispatch()
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const unreadNotifications = notifications.filter(n => !n.read)
  const recentNotifications = notifications.slice(0, 10)

  const handleMarkAsRead = (notificationId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    dispatch(markAsRead(notificationId))
  }

  const handleRemoveNotification = (notificationId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    dispatch(removeNotification(notificationId))
  }

  const handleMarkAllAsRead = () => {
    dispatch(markAllAsRead())
  }

  const handleCopy = async (notificationId: string, message: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const success = await copyToClipboard(message, document.body)
    if (success) {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      setCopiedId(notificationId)
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1500)
    }
  }

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      dispatch(markAsRead(notification.id))
    }
    onClose()
  }

  return (
    <TopBarUtilityPanel
      anchorEl={anchorEl}
      onClose={onClose}
      title="Notifications"
      width={400}
      maxHeight={600}
      headerAction={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {unreadNotifications.length > 0 && (
            <Badge badgeContent={unreadNotifications.length} color="error" />
          )}
          {unreadNotifications.length > 0 && (
            <AppButton
              size="small"
              startIcon={<MarkReadIcon />}
              onClick={handleMarkAllAsRead}
              sx={{ fontSize: '0.75rem' }}
            >
              Mark all read
            </AppButton>
          )}
        </Box>
      }
    >
      {/* Content */}
      <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
        {recentNotifications.length === 0 ? (
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No notifications yet
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            {recentNotifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                <ListItemButton
                  onClick={() => handleNotificationClick(notification)}
                  sx={{
                    py: 2,
                    px: 2,
                    bgcolor: notification.read ? 'transparent' : 'action.hover',
                    '&:hover': { bgcolor: 'action.selected' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {getNotificationIcon(notification.type)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: notification.read ? 400 : 600, flexGrow: 1 }}
                        >
                          {notification.title}
                        </Typography>
                        <Chip
                          label={notification.type}
                          size="small"
                          color={getNotificationColor(notification.type)}
                          variant={notification.read ? 'outlined' : 'filled'}
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                          {notification.message}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                          {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
                        </Typography>
                      </Box>
                    }
                    slotProps={{ secondary: { component: 'div' } }}
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Tooltip title="Copy message" placement="left">
                      <IconButton
                        size="small"
                        onClick={(e) => handleCopy(notification.id, notification.message, e)}
                        aria-label="Copy message"
                      >
                        {copiedId === notification.id ? (
                          <CheckIcon fontSize="small" color="success" />
                        ) : (
                          <CopyIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                    {!notification.read && (
                      <IconButton size="small" onClick={(e) => handleMarkAsRead(notification.id, e)} title="Mark as read">
                        <MarkReadIcon fontSize="small" />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={(e) => handleRemoveNotification(notification.id, e)} title="Remove">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </ListItemButton>
                {index < recentNotifications.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>
      {/* Footer */}
      {notifications.length > 10 && (
        <>
          <Divider />
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <AppButton size="small" onClick={onClose} fullWidth sx={{ fontSize: '0.875rem' }}>
              View All Notifications
            </AppButton>
          </Box>
        </>
      )}
    </TopBarUtilityPanel>
  )
}

export default NotificationPanel
```

- [ ] **Step 3: Run tests to verify they still pass**

```bash
cd frontend && npx vitest run src/components/common/NotificationPanel.test.tsx
```

Expected: same pass count as baseline from Step 1

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/NotificationPanel.tsx
git commit -m "refactor(ui): migrate NotificationPanel to TopBarUtilityPanel"
```

---

## Task 4: Refactor `SystemStatus` to use `TopBarUtilityPanel`

**Files:**
- Modify: `frontend/src/components/common/SystemStatus.tsx`

The `SystemStatus` currently renders a fragment with an `IconButton` (the trigger) and a `Popover`. Replace the bare `Popover` with `TopBarUtilityPanel`, passing `loading && <CircularProgress size={20} />` as `headerAction`. The `IconButton` trigger stays exactly as-is — it lives outside the panel.

- [ ] **Step 1: Run existing tests as baseline**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SystemStatus.test.tsx
```

Note current pass count. All must still pass after Step 2.

- [ ] **Step 2: Refactor `SystemStatus.tsx`**

Replace the file content with:

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
import TopBarUtilityPanel from './TopBarUtilityPanel'

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
  const frontendStatus = 'healthy' as const

  const checkHealth = async () => {
    setLoading(true)
    try {
      const response = await ApiService.get<HealthResponse>('/health')
      setHealth(response as HealthResponse)
    } catch (error) {
      setHealth(null)
      console.error('Health check failed:', error)
    } finally {
      setLoading(false)
    }
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
          size="small"
          sx={{
            color: theme.palette.text.secondary,
            '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' },
          }}
        >
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <DnsRoundedIcon sx={{ fontSize: 22 }} />
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
      <TopBarUtilityPanel
        anchorEl={anchorEl}
        onClose={onClose}
        title="System Status"
        width={350}
        headerAction={loading ? <CircularProgress size={20} /> : undefined}
      >
        <Box sx={{ p: 2 }}>
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
      </TopBarUtilityPanel>
    </>
  )
}

export default SystemStatus
```

- [ ] **Step 3: Run tests to verify they still pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/SystemStatus.test.tsx
```

Expected: same pass count as baseline from Step 1

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/SystemStatus.tsx
git commit -m "refactor(ui): migrate SystemStatus to TopBarUtilityPanel"
```

---

## Task 5: Update `TopBar.tsx` — anchor state + icon colors

**Files:**
- Modify: `frontend/src/components/common/TopBar.tsx`

Three changes:
1. Replace `shortcutsOpen: boolean` state with `shortcutsAnchorEl: HTMLElement | null`
2. Update the Keyboard icon button `onClick` and pass `anchorEl` to `KeyboardShortcutsPanel`
3. Standardize all utility `IconButton` colors to `theme.palette.text.secondary`

- [ ] **Step 1: Run existing TopBar tests as baseline**

```bash
cd frontend && npx vitest run src/components/common/__tests__/TopBar.test.tsx
```

Note current pass count.

- [ ] **Step 2: Update `TopBar.tsx`**

Apply these diffs to `frontend/src/components/common/TopBar.tsx`:

**a) Change import** (line 26) — replace `KeyboardShortcutsModal` with `KeyboardShortcutsPanel`:

```tsx
import KeyboardShortcutsPanel from './KeyboardShortcutsPanel'
```

**b) Replace state** (line 187) — change:
```tsx
const [shortcutsOpen, setShortcutsOpen] = useState(false)
```
to:
```tsx
const [shortcutsAnchorEl, setShortcutsAnchorEl] = useState<HTMLElement | null>(null)
```

**c) Update `?` key handler** (inside the `useEffect` keydown handler, line 207–210) — change:
```tsx
if (event.key === '?') {
  event.preventDefault()
  setShortcutsOpen(true)
}
```
to:
```tsx
if (event.key === '?') {
  event.preventDefault()
  // Open anchored to the keyboard shortcuts icon button
  const btn = document.querySelector<HTMLElement>('[aria-label="Keyboard Shortcuts"]')
  setShortcutsAnchorEl(btn)
}
```

**d) Update SystemStatus icon button** (line 133 in the component, inside `<SystemStatus>` — actually this is in `SystemStatus.tsx` which is already handled in Task 4). For the TopBar's own IconButtons, make these changes:

Replace the Keyboard Shortcuts `IconButton` block (lines 324–333):
```tsx
<Tooltip title="Keyboard Shortcuts">
  <IconButton
    aria-label="Keyboard Shortcuts"
    onClick={(e) => setShortcutsAnchorEl(e.currentTarget)}
    sx={{
      color: theme.palette.text.secondary,
      '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' },
    }}
  >
    <KeyboardIcon />
  </IconButton>
</Tooltip>
```

Replace the Notifications `IconButton` block (lines 335–345):
```tsx
<Tooltip title="Notifications">
  <IconButton
    onClick={(event) => setNotificationAnchorEl(event.currentTarget)}
    sx={{
      color: theme.palette.text.secondary,
      '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' },
    }}
  >
    <Badge badgeContent={unreadCount} color="error">
      <NotificationsIcon />
    </Badge>
  </IconButton>
</Tooltip>
```

**e) Update `KeyboardShortcutsModal` usage** (line 356) — replace:
```tsx
<KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
```
with:
```tsx
<KeyboardShortcutsPanel anchorEl={shortcutsAnchorEl} onClose={() => setShortcutsAnchorEl(null)} />
```

- [ ] **Step 3: Update the TopBar test mock** for the renamed component

In `frontend/src/components/common/__tests__/TopBar.test.tsx`, replace the `KeyboardShortcutsModal` mock:

```tsx
// Replace this:
vi.mock('../KeyboardShortcutsModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="shortcuts-modal" /> : null),
}))

// With this:
vi.mock('../KeyboardShortcutsPanel', () => ({
  default: ({ anchorEl }: { anchorEl: HTMLElement | null }) =>
    anchorEl ? <div data-testid="shortcuts-modal" /> : null,
}))
```

- [ ] **Step 4: Run TopBar tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/TopBar.test.tsx
```

Expected: same pass count as baseline from Step 1

- [ ] **Step 5: Verify search bar colors are already correct**

The search bar `Box` in `TopBar.tsx` already uses `theme.palette.text.secondary` for `SearchIcon`, the placeholder `Typography`, and the `kbd` box. Confirm by checking lines 308–312 — no changes needed if they read `color: theme.palette.text.secondary`.

- [ ] **Step 6: Run full type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/TopBar.tsx frontend/src/components/common/__tests__/TopBar.test.tsx
git commit -m "refactor(ui): update TopBar to use KeyboardShortcutsPanel and standardize icon colors"
```

---

## Task 6: Final integration check

- [ ] **Step 1: Run all affected test files**

```bash
cd frontend && npx vitest run \
  src/components/common/__tests__/TopBarUtilityPanel.test.tsx \
  src/components/common/__tests__/KeyboardShortcutsPanel.test.tsx \
  src/components/common/NotificationPanel.test.tsx \
  src/components/common/__tests__/SystemStatus.test.tsx \
  src/components/common/__tests__/TopBar.test.tsx
```

Expected: all tests pass, no failures

- [ ] **Step 2: Verify no stale imports remain**

```bash
grep -r "KeyboardShortcutsModal" frontend/src/
```

Expected: no output — all references should be gone

- [ ] **Step 3: Commit and close issue**

```bash
git commit --allow-empty -m "chore: verify TopBar utilities modernization complete (closes #506)"
```

Or if there are any uncommitted changes, stage and commit them first, then push and open a PR with `Closes #506`.
