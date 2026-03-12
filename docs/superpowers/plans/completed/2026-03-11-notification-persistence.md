# Notification Persistence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist notifications across browser refreshes (capped at 50, newest-first, cleared on logout) by adding the `notifications` slice to redux-persist's whitelist.

**Architecture:** Add `notifications` to the redux-persist whitelist; enforce a 50-item cap on add and on rehydration; bump persist version to 5 with a migration that normalises existing users' state; extract `PERSIST_KEY` to a neutral module to avoid a circular import.

**Tech Stack:** React 19, Redux Toolkit, redux-persist, Vitest

**Spec:** `docs/superpowers/specs/2026-03-11-notification-persistence-design.md`

---

## Chunk 1: persistKey module + store config

### Task 1: Create `persistKey.ts`

**Files:**
- Create: `frontend/src/store/persistKey.ts`

- [ ] **Step 1: Create the file**

```ts
// frontend/src/store/persistKey.ts
export const PERSIST_KEY = 'erp-app'
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors (new file is self-contained).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/persistKey.ts
git commit -m "feat: extract PERSIST_KEY constant to avoid circular import"
```

---

### Task 2: Update store config (`store/index.ts`)

**Files:**
- Modify: `frontend/src/store/index.ts`

Three changes in one edit: import `PERSIST_KEY`, add `notifications` to whitelist, bump version to 5, update `migrate`.

- [ ] **Step 1: Apply the changes**

First, add the import at the top of the file with the existing imports (not inside `persistConfig`):

```ts
import { PERSIST_KEY } from './persistKey'
```

Then replace the existing `persistConfig` block with:

```ts
const persistConfig = {
  key: PERSIST_KEY,
  storage,
  whitelist: ['theme', 'auth', 'notifications'],
  version: 5,
  migrate: (state: any) => {
    // Migration runs when persisted _persist.version !== persistConfig.version.
    // For all existing v4 users, state.notifications is undefined (was not
    // whitelisted), so the ?? [] fallback is the normal code path.
    // On a cold start (no persisted state at all), redux-persist does not call
    // migrate — REHYDRATE fires with payload === undefined instead.
    if (state) {
      const notifications: any[] = state.notifications?.notifications ?? []
      const capped = notifications.slice(0, 50) // newest-first invariant
      const unreadCount = capped.filter((n: any) => !n.read).length

      return Promise.resolve({
        ...state,
        theme: state.theme
          ? { ...state.theme, mode: 'dark' }
          : { mode: 'dark' },
        notifications: {
          notifications: capped,
          unreadCount,
        },
      })
    }
    return Promise.resolve(state)
  },
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: add notifications to persist whitelist, bump version to 5"
```

---

## Chunk 2: Slice changes (cap + floor guard + REHYDRATE)

### Task 3: Write failing tests first

**Files:**
- Modify: `frontend/src/store/slices/__tests__/notificationSlice.test.ts`

The existing test file imports `addNotification`, `selectNotifications`, `selectUnreadCount`. We need to also import `removeNotification`, `markAsRead`, `markAllAsRead` and the `REHYDRATE` action.

- [ ] **Step 1: Add the new failing tests**

Add the following tests inside the existing `describe('notificationSlice', ...)` block, after the existing tests:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { REHYDRATE } from 'redux-persist'
import notificationReducer, {
  addNotification,
  removeNotification,
  markAsRead,
  markAllAsRead,
  selectNotifications,
  selectUnreadCount,
} from '../notificationSlice'
import { logout } from '../authSlice'
```

> Note: replace the existing import block at the top of the file with the above (adds `REHYDRATE`, `removeNotification`, `markAsRead`, `markAllAsRead`).

Then add these tests inside the `describe` block:

```ts
  // ── Cap at 50 ────────────────────────────────────────────────────────────

  it('caps notifications at 50 when a 51st is added', () => {
    for (let i = 0; i < 51; i++) {
      store.dispatch(addNotification({ type: 'info', title: `N${i}`, message: 'm' }))
    }
    const notifications = selectNotifications(store.getState())
    expect(notifications).toHaveLength(50)
  })

  it('drops the oldest notification when cap is exceeded', () => {
    // Add 50 notifications — oldest is "first"
    for (let i = 0; i < 50; i++) {
      store.dispatch(addNotification({ type: 'info', title: `N${i}`, message: 'm' }))
    }
    // Add a 51st — "newest" should be at index 0, "first" should be gone
    store.dispatch(addNotification({ type: 'success', title: 'newest', message: 'm' }))
    const notifications = selectNotifications(store.getState())
    expect(notifications[0].title).toBe('newest')
    expect(notifications.find((n) => n.title === 'N0')).toBeUndefined()
  })

  it('keeps unreadCount correct after cap is applied', () => {
    for (let i = 0; i < 51; i++) {
      store.dispatch(addNotification({ type: 'info', title: `N${i}`, message: 'm' }))
    }
    // unreadCount should match the number of unread notifications in the capped array
    const notifications = selectNotifications(store.getState())
    const expectedUnread = notifications.filter((n) => !n.read).length
    expect(selectUnreadCount(store.getState())).toBe(expectedUnread)
  })

  // ── removeNotification floor guard ───────────────────────────────────────

  it('does not decrement unreadCount below zero on removeNotification', () => {
    store.dispatch(addNotification({ type: 'info', title: 'X', message: 'm' }))
    const id = selectNotifications(store.getState())[0].id
    // Manually corrupt unreadCount to 0 by marking as read first
    store.dispatch(markAsRead(id))
    expect(selectUnreadCount(store.getState())).toBe(0)
    // Now remove — unreadCount must not go negative
    store.dispatch(removeNotification(id))
    expect(selectUnreadCount(store.getState())).toBe(0)
  })

  // ── REHYDRATE ─────────────────────────────────────────────────────────────

  function makeNotification(i: number, read = false) {
    return {
      id: `id-${i}`,
      type: 'info' as const,
      title: `N${i}`,
      message: 'm',
      timestamp: new Date().toISOString(),
      read,
    }
  }

  it('trims to 50 and recalculates unreadCount on REHYDRATE with 60 notifications', () => {
    const notifications = Array.from({ length: 60 }, (_, i) => makeNotification(i))
    store.dispatch({
      type: REHYDRATE,
      key: 'erp-app',
      payload: { notifications: { notifications, unreadCount: 60 } },
    })
    expect(selectNotifications(store.getState())).toHaveLength(50)
    expect(selectUnreadCount(store.getState())).toBe(50) // all unread
  })

  it('is a no-op on REHYDRATE when payload is undefined', () => {
    store.dispatch({ type: REHYDRATE, key: 'erp-app', payload: undefined })
    expect(selectNotifications(store.getState())).toHaveLength(0)
    expect(selectUnreadCount(store.getState())).toBe(0)
  })

  it('recalculates unreadCount correctly on REHYDRATE with mixed read/unread', () => {
    const notifications = [
      makeNotification(0, true),  // read
      makeNotification(1, false), // unread
      makeNotification(2, false), // unread
    ]
    store.dispatch({
      type: REHYDRATE,
      key: 'erp-app',
      payload: { notifications: { notifications, unreadCount: 99 } }, // stale count
    })
    expect(selectUnreadCount(store.getState())).toBe(2) // recalculated from read field
  })

  it('markAsRead decrements unreadCount correctly after REHYDRATE', () => {
    const notifications = [
      makeNotification(0, false),
      makeNotification(1, false),
    ]
    store.dispatch({
      type: REHYDRATE,
      key: 'erp-app',
      payload: { notifications: { notifications, unreadCount: 2 } },
    })
    store.dispatch(markAsRead('id-0'))
    expect(selectUnreadCount(store.getState())).toBe(1)
  })

  it('markAllAsRead sets unreadCount to 0 after REHYDRATE', () => {
    const notifications = [
      makeNotification(0, false),
      makeNotification(1, false),
    ]
    store.dispatch({
      type: REHYDRATE,
      key: 'erp-app',
      payload: { notifications: { notifications, unreadCount: 2 } },
    })
    store.dispatch(markAllAsRead())
    expect(selectUnreadCount(store.getState())).toBe(0)
  })
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npx vitest run src/store/slices/__tests__/notificationSlice.test.ts 2>&1 | tail -30
```

Expected: multiple FAIL — cap/floor/REHYDRATE tests not yet implemented.

- [ ] **Step 3: Commit the failing tests**

```bash
git add frontend/src/store/slices/__tests__/notificationSlice.test.ts
git commit -m "test: add failing tests for notification cap, floor guard, and REHYDRATE"
```

---

### Task 4: Implement the slice changes

**Files:**
- Modify: `frontend/src/store/slices/notificationSlice.ts`

- [ ] **Step 1: Add imports at the top of the file**

Add after the existing imports:

```ts
import { REHYDRATE } from 'redux-persist'
import { PERSIST_KEY } from '@/store/persistKey'
```

- [ ] **Step 2: Add the cap to `addNotification`**

The existing `addNotification` reducer ends with `state.unreadCount += 1`. Add the cap between `unshift` and the increment. The full updated reducer body:

```ts
addNotification: (state, action: PayloadAction<Omit<Notification, 'id' | 'timestamp' | 'read'>>) => {
  const notification: Notification = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    read: false,
    ...action.payload,
  }
  state.notifications.unshift(notification)
  if (state.notifications.length > 50) {
    state.notifications = state.notifications.slice(0, 50) // newest-first invariant
  }
  state.unreadCount += 1
},
```

- [ ] **Step 3: Add the floor guard to `removeNotification`**

Replace the existing `state.unreadCount -= 1` line with:

```ts
if (!notification.read) {
  state.unreadCount = Math.max(0, state.unreadCount - 1)
}
```

The full updated reducer body:

```ts
removeNotification: (state, action: PayloadAction<string>) => {
  const index = state.notifications.findIndex((n) => n.id === action.payload)
  if (index >= 0) {
    const notification = state.notifications[index]
    if (!notification.read) {
      state.unreadCount = Math.max(0, state.unreadCount - 1)
    }
    state.notifications.splice(index, 1)
  }
},
```

- [ ] **Step 4: Add the `REHYDRATE` extraReducer**

Inside the `extraReducers` builder, after the existing `.addCase(clearAuth, ...)` block, add:

```ts
.addCase(REHYDRATE, (state, action: any) => {
  // payload is undefined on cold start (no persisted state) — no-op
  if (action.key === PERSIST_KEY && action.payload?.notifications) {
    const persisted = action.payload.notifications
    const capped = (persisted.notifications ?? []).slice(0, 50) // newest-first
    state.notifications = capped
    state.unreadCount = capped.filter((n: any) => !n.read).length
  }
})
```

- [ ] **Step 5: Run the tests — expect all to pass**

```bash
cd frontend && npx vitest run src/store/slices/__tests__/notificationSlice.test.ts 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/store/slices/notificationSlice.ts
git commit -m "feat: persist notifications — cap at 50, floor guard, REHYDRATE normalisation"
```

---

## Chunk 3: Run full test suite + verify

### Task 5: Full frontend test run

- [ ] **Step 1: Run all frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -40
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: TypeScript full check**

```bash
cd frontend && npm run type-check 2>&1
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit if anything was auto-fixed**

Only commit if lint auto-fixed something:

```bash
git add -p
git commit -m "chore: lint fixes"
```

---

### Task 6: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Trigger a notification**

Log in as `admin / Admin@123!`. Perform any action that generates a notification (e.g., save a product or trigger a backup).

- [ ] **Step 3: Refresh the browser**

Press F5. Open the notification center. Verify the notification is still present with the correct unread count.

- [ ] **Step 4: Log out**

Verify that after logout, the notification center is empty on next login.

- [ ] **Step 5: Verify localStorage via DevTools**

Open DevTools → Application → Local Storage → `http://localhost:*`. Find the `erp-app` key. Verify it contains a `notifications` key with the persisted notifications array.
