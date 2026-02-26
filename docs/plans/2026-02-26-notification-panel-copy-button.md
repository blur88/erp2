# Notification Panel Copy Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a copy-to-clipboard button to each notification item in the NotificationPanel dropdown.

**Architecture:** Single `copiedId` state at the panel level tracks which notification was last copied. Copy button placed inline before existing mark-as-read and delete buttons. Visual feedback matches snackbar: icon swaps from ContentCopy to Check for 1.5s.

**Tech Stack:** React, MUI (IconButton, Tooltip, ContentCopy/Check icons), navigator.clipboard API

---

### Task 1: Write test for copy button in NotificationPanel

**Files:**
- Create: `frontend/src/components/common/NotificationPanel.test.tsx`

**Step 1: Write the test file**

```tsx
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NotificationPanel from './NotificationPanel'

const dispatchMock = vi.fn()

vi.mock('@/hooks/useRedux', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: () => [],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotifications: () => ({
    notifications: [
      {
        id: 'notif-1',
        type: 'success' as const,
        title: 'Order Shipped',
        message: 'Delivery expected 2026-02-27',
        timestamp: new Date(),
        read: false,
      },
    ],
    removeNotification: vi.fn(),
  }),
}))

vi.mock('@/store/slices/notificationSlice', () => ({
  markAsRead: (id: string) => ({ type: 'notification/markAsRead', payload: id }),
  markAllAsRead: () => ({ type: 'notification/markAllAsRead' }),
  removeNotification: (id: string) => ({ type: 'notification/removeNotification', payload: id }),
}))

describe('NotificationPanel copy button', () => {
  beforeEach(() => {
    dispatchMock.mockClear()
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  it('copies notification message to clipboard and shows check icon', async () => {
    const user = userEvent.setup()
    const anchorEl = document.createElement('div')
    document.body.appendChild(anchorEl)

    render(
      <NotificationPanel anchorEl={anchorEl} open={true} onClose={vi.fn()} />,
    )

    const copyButton = screen.getByTitle('Copy message')
    await user.click(copyButton)

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Delivery expected 2026-02-27')
    expect(screen.getByTestId('CheckIcon')).toBeInTheDocument()

    document.body.removeChild(anchorEl)
  })
})
```

**Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/common/NotificationPanel.test.tsx`
Expected: FAIL — no element with title "Copy message" found

---

### Task 2: Add copy button to NotificationPanel

**Files:**
- Modify: `frontend/src/components/common/NotificationPanel.tsx`

**Step 1: Add imports — line 19 of NotificationPanel.tsx**

Add `ContentCopy` and `Check` icons to the existing `@mui/icons-material` import block. The import (lines 18-26) becomes:

```tsx
import {
  Close as CloseIcon,
  MarkEmailRead as MarkReadIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from '@mui/icons-material'
```

Also add `Tooltip` to the MUI imports (line 2-17). Add it after `Chip`:

```tsx
import {
  Popover,
  Box,
  Typography,
  ListItemButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Divider,
  Button,
  Avatar,
  Chip,
  Badge,
  Tooltip,
} from '@mui/material'
```

**Step 2: Add copiedId state and handleCopy — inside the component, after `const dispatch = useAppDispatch()` (line 72)**

```tsx
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = async (notificationId: string, message: string, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(message)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      setCopiedId(notificationId)
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // Silent fallback if clipboard API unavailable
    }
  }
```

**Step 3: Add copy IconButton before existing action buttons — in the actions Box (line 237)**

Replace the action buttons `<Box>` (lines 237-254) with:

```tsx
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Tooltip title="Copy message" placement="left">
                      <IconButton
                        size="small"
                        onClick={(e) => handleCopy(notification.id, notification.message, e)}
                        title="Copy message"
                      >
                        {copiedId === notification.id ? (
                          <CheckIcon fontSize="small" color="success" />
                        ) : (
                          <CopyIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                    {!notification.read && (
                      <IconButton
                        size="small"
                        onClick={(e) => handleMarkAsRead(notification.id, e)}
                        title="Mark as read"
                      >
                        <MarkReadIcon fontSize="small" />
                      </IconButton>
                    )}
                    <IconButton
                      size="small"
                      onClick={(e) => handleRemoveNotification(notification.id, e)}
                      title="Remove"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
```

**Step 4: Clean up timeout on unmount — add after the handleCopy function**

```tsx
  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])
```

**Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/common/NotificationPanel.test.tsx`
Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/components/common/NotificationPanel.tsx frontend/src/components/common/NotificationPanel.test.tsx
git commit -m "feat: add copy-to-clipboard button in notification dropdown"
```

---

### Task 3: Run full frontend tests to verify no regressions

**Step 1: Run all frontend tests**

Run: `cd frontend && npm run test`
Expected: All tests pass

**Step 2: Run type-check**

Run: `cd frontend && npm run type-check`
Expected: No type errors

**Step 3: Fix any issues if needed**

If any test or type-check fails, fix the issue and re-run.

**Step 4: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "fix: address test/type issues from copy button addition"
```
