# Notification Persistence — Design Spec

**Issue:** #81
**Date:** 2026-03-11
**Status:** Approved

---

## Problem

Notifications are lost on browser refresh because the `notifications` slice is excluded from redux-persist. Users miss important system alerts and lose unread state after a page reload or browser crash.

## Goal

Persist notifications across browser sessions, capped at 50 (newest-first), cleared on logout.

---

## Approach

Simplest correct fix: add `notifications` to the redux-persist whitelist, enforce a 50-notification cap on add and on rehydration, and bump the persist version with an updated migration.

One new file (`persistKey.ts`) to avoid a circular import. No new dependencies.

---

## Invariant

**The notifications array is always newest-first** (items are `unshift`-ed). `slice(0, 50)` therefore always retains the 50 most recent notifications. Any code that reorders the array breaks this invariant and must also update the cap logic.

---

## Changes

### 0. `frontend/src/store/persistKey.ts` (new file)

Extract the persist key as a named constant in its own module to avoid a circular import (`notificationSlice` is imported by `store/index.ts`, so it cannot safely import back from `store/index.ts`):

```ts
export const PERSIST_KEY = 'erp-app'
```

Both `store/index.ts` and `notificationSlice.ts` import `PERSIST_KEY` from this neutral module.

### 1. `frontend/src/store/index.ts`

**a) Import `PERSIST_KEY` from `./persistKey`** and use it as the `key` in `persistConfig`.

**b) Add `'notifications'` to the `whitelist`:**

```ts
whitelist: ['theme', 'auth', 'notifications'],
```

**c) Bump `version` from `4` to `5` and update the `migrate` function** to sanitise the rehydrated notifications state — cap to 50 (newest-first) and recalculate `unreadCount` from the actual `read` field. Note: this migration runs for **all existing v4 users** (not just hypothetical edge cases), because `notifications` was not whitelisted at v4 — `state.notifications` will be `undefined` for every existing user, so the `?? []` fallback is the normal path:

```ts
version: 5,
migrate: (state: any) => {
  // Migration runs only when the persisted _persist.version differs from
  // persistConfig.version. On a cold start (no persisted state), redux-persist
  // does not call migrate — REHYDRATE fires with payload === undefined instead.
  if (state) {
    const notifications: any[] = state.notifications?.notifications ?? []
    const capped = notifications.slice(0, 50) // newest-first invariant
    const unreadCount = capped.filter((n: any) => !n.read).length

    return Promise.resolve({
      ...state,
      theme: state.theme ? { ...state.theme, mode: 'dark' } : { mode: 'dark' },
      notifications: {
        notifications: capped,
        unreadCount,
      },
    })
  }
  return Promise.resolve(state)
},
```

### 2. `frontend/src/store/slices/notificationSlice.ts`

**a) In `addNotification`, add a cap after `unshift`.** Keep the existing notification-construction code (id, timestamp, read fields) unchanged — only add the cap lines after `unshift`:

```ts
addNotification: (state, action) => {
  // ...existing notification construction (id, timestamp, read)...
  state.notifications.unshift(notification)
  if (state.notifications.length > 50) {
    state.notifications = state.notifications.slice(0, 50) // newest-first
  }
  state.unreadCount += 1
},
```

**b) Add a floor guard to `removeNotification`** to prevent `unreadCount` going negative if persisted state is ever corrupt:

```ts
removeNotification: (state, action) => {
  // ...existing logic...
  if (!notification.read) {
    state.unreadCount = Math.max(0, state.unreadCount - 1)
  }
  // ...
},
```

**c) Add a `REHYDRATE` extraReducer** to enforce the cap and recalculate `unreadCount` on rehydration. This is a secondary safety net — the migration already normalises data, but this guard handles cold starts and any future edge cases:

```ts
import { REHYDRATE } from 'redux-persist'
import { PERSIST_KEY } from '@/store/persistKey'

// in extraReducers:
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

Note: `PERSIST_KEY` is imported from `@/store/persistKey` (not `@/store`) to avoid a circular import. Do not hard-code the string `'erp-app'` here.

---

## Data Flow

- **On add:** notification unshifted to front → trimmed to 50 → persisted to localStorage
- **On refresh (returning user, same version):** REHYDRATE fires with persisted payload → cap enforced, unreadCount recalculated from `read` field
- **On version upgrade (v4 → v5):** migration runs first, caps to 50, recalculates unreadCount → REHYDRATE fires on already-normalised data (double-cap is harmless)
- **On cold start (no persisted state):** migration does not run; REHYDRATE fires with `payload === undefined`; the guard is a no-op; initialState used
- **On logout:** `logout.fulfilled` / `clearAuth` extraReducers reset state to `{ notifications: [], unreadCount: 0 }` → persisted as empty

---

## Edge Cases

- **localStorage unavailable:** redux-persist fails silently — no change needed
- **unreadCount accuracy:** recalculated from the actual `read` field on every rehydration — not susceptible to drift from corrupt legacy state
- **Pre-cap persisted state:** migration and REHYDRATE extraReducer both enforce the 50-item cap (newest-first)
- **unreadCount floor:** `removeNotification` guards against decrement below zero with `Math.max(0, ...)`
- **Persist key rename:** `PERSIST_KEY` constant ensures the REHYDRATE guard stays in sync with `persistConfig.key`
- **`markAsRead` / `markAllAsRead` floor guards:** not needed — the REHYDRATE extraReducer recalculates `unreadCount` from source-of-truth `read` fields before any of these actions can fire. `markAllAsRead` sets `unreadCount = 0` unconditionally (always safe).
- **`serializableCheck.ignoredActions`:** already includes `'persist/REHYDRATE'` in `store/index.ts` — no change needed

---

## Testing

Update `frontend/src/store/slices/__tests__/notificationSlice.test.ts`:

- Add test: adding a 51st notification drops the oldest, array stays at 50, unreadCount is correct
- Add test: dispatching `REHYDRATE` with 60 notifications trims to 50 and recalculates unreadCount correctly
- Add test: dispatching `REHYDRATE` with `payload === undefined` is a no-op (state stays as initialState)
- Add test: dispatching `REHYDRATE` with a mix of read/unread notifications, then calling `markAsRead` decrements unreadCount correctly
- Add test: dispatching `REHYDRATE` with a mix of read/unread notifications, then calling `markAllAsRead` sets unreadCount to 0
- Add test: `removeNotification` with `unreadCount` already at 0 does not go negative

---

## Out of Scope

- Time-based expiry
- Per-user notification storage (server-side)
- Notification categories or filtering
- `clearAuth` test coverage (pre-existing gap, separate issue)
