# Notification Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make notifications persist across browser refreshes and clear on logout.

**Architecture:** Add `notifications` to the Redux Persist whitelist. Fix timestamp serialization from `Date` to `string` so JSON round-tripping works. Add an `extraReducers` case in the notification slice to reset state on `logout.fulfilled`.

**Tech Stack:** Redux Toolkit, redux-persist, Vitest

---

### Task 1: Fix timestamp type from `Date` to `string`

**Files:**
- Modify: `frontend/src/types/index.ts:600-607`
- Modify: `frontend/src/store/slices/notificationSlice.ts:22`

**Step 1: Update the `Notification` type**

In `frontend/src/types/index.ts`, change line 605:

```typescript
// Before
timestamp: Date;

// After
timestamp: string;
```

**Step 2: Update `addNotification` to store ISO string**

In `frontend/src/store/slices/notificationSlice.ts`, change line 22:

```typescript
// Before
timestamp: new Date(),

// After
timestamp: new Date().toISOString(),
```

**Step 3: Verify no breakage**

The only consumer of `timestamp` is `NotificationPanel.tsx:252` which already does `new Date(notification.timestamp)` — so string timestamps work without changes there.

Run: `cd frontend && npx vitest run src/components/common/NotificationPanel.test.tsx`
Expected: PASS (existing tests still pass)

**Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/store/slices/notificationSlice.ts
git commit -m "fix: store notification timestamps as ISO strings for serialization"
```

---

### Task 2: Add `notifications` to Redux Persist whitelist

**Files:**
- Modify: `frontend/src/store/index.ts:59`

**Step 1: Add to whitelist**

In `frontend/src/store/index.ts`, change line 59:

```typescript
// Before
whitelist: ['theme', 'auth', 'inventory', 'sales', 'purchasing'],

// After
whitelist: ['theme', 'auth', 'inventory', 'sales', 'purchasing', 'notifications'],
```

Note: The reducer key is `notifications` (plural, see line 33 of the same file), not `notification`.

**Step 2: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: persist notifications across browser refresh"
```

---

### Task 3: Clear notifications on logout

**Files:**
- Modify: `frontend/src/store/slices/notificationSlice.ts`

**Step 1: Write the test**

Create: `frontend/src/store/slices/__tests__/notificationSlice.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import notificationReducer, {
  addNotification,
  clearAllNotifications,
  markAsRead,
  selectNotifications,
  selectUnreadCount,
} from '../notificationSlice'
import { logout } from '../authSlice'

// Mock authApi to avoid import errors
vi.mock('@/services/authApi', () => ({
  default: {
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    register: vi.fn(),
    changePassword: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}))

function createTestStore() {
  return configureStore({
    reducer: { notifications: notificationReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  })
}

describe('notificationSlice', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore()
  })

  it('should add a notification', () => {
    store.dispatch(addNotification({ type: 'success', title: 'Test', message: 'Hello' }))
    const notifications = selectNotifications(store.getState())
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Test')
    expect(notifications[0].read).toBe(false)
    expect(typeof notifications[0].timestamp).toBe('string')
  })

  it('should clear all notifications on logout.fulfilled', () => {
    // Add some notifications
    store.dispatch(addNotification({ type: 'success', title: 'A', message: 'msg' }))
    store.dispatch(addNotification({ type: 'error', title: 'B', message: 'msg' }))
    expect(selectNotifications(store.getState())).toHaveLength(2)
    expect(selectUnreadCount(store.getState())).toBe(2)

    // Simulate logout.fulfilled
    store.dispatch({ type: logout.fulfilled.type })

    expect(selectNotifications(store.getState())).toHaveLength(0)
    expect(selectUnreadCount(store.getState())).toBe(0)
  })
})
```

**Step 2: Run the test — expect it to fail**

Run: `cd frontend && npx vitest run src/store/slices/__tests__/notificationSlice.test.ts`
Expected: FAIL — the `logout.fulfilled` test should fail because `notificationSlice` doesn't listen for that action yet.

**Step 3: Add `extraReducers` to notification slice**

In `frontend/src/store/slices/notificationSlice.ts`, add the import and `extraReducers`:

```typescript
// Add import at top
import { logout } from './authSlice'

// Add extraReducers to the slice (after reducers)
  extraReducers: (builder) => {
    builder.addCase(logout.fulfilled, (state) => {
      state.notifications = []
      state.unreadCount = 0
    })
  },
```

**Step 4: Run the test — expect it to pass**

Run: `cd frontend && npx vitest run src/store/slices/__tests__/notificationSlice.test.ts`
Expected: PASS

**Step 5: Also handle `clearAuth` for auto-logout edge case**

Check `App.tsx:136` — auto-logout calls `dispatch(clearAuth())` in the `finally` block. The `clearAuth` action is a plain reducer in authSlice. We should also listen for it in case the server logout fails but local state is cleared.

In `frontend/src/store/slices/notificationSlice.ts`, update import and add case:

```typescript
import { logout, clearAuth } from './authSlice'

  extraReducers: (builder) => {
    builder
      .addCase(logout.fulfilled, (state) => {
        state.notifications = []
        state.unreadCount = 0
      })
      .addCase(clearAuth, (state) => {
        state.notifications = []
        state.unreadCount = 0
      })
  },
```

**Step 6: Run all notification tests**

Run: `cd frontend && npx vitest run src/store/slices/__tests__/notificationSlice.test.ts`
Expected: PASS

**Step 7: Run existing NotificationPanel tests to check for regressions**

Run: `cd frontend && npx vitest run src/components/common/NotificationPanel.test.tsx`
Expected: PASS

**Step 8: Commit**

```bash
git add frontend/src/store/slices/notificationSlice.ts frontend/src/store/slices/__tests__/notificationSlice.test.ts
git commit -m "feat: clear notifications on logout and auto-logout"
```

---

### Task 4: Run full frontend test suite

**Step 1: Run all tests**

Run: `cd frontend && npm run test`
Expected: All tests PASS

**Step 2: Run type-check**

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 3: If any failures, fix them**

Common issue: other test files may create `Notification` objects with `timestamp: new Date()` — these need to change to `timestamp: new Date().toISOString()`.

**Step 4: Final commit if fixes were needed**

```bash
git commit -m "fix: update test fixtures for string timestamps"
```
