# Notification Persistence — Design Spec

**Issue:** #81
**Date:** 2026-03-11
**Status:** Approved

---

## Problem

Notifications are lost on browser refresh because the `notifications` slice is excluded from redux-persist. Users miss important system alerts and lose unread state after a page reload or browser crash.

## Goal

Persist notifications across browser sessions, capped at 50, cleared on logout.

---

## Approach

Simplest correct fix: add `notifications` to the redux-persist whitelist and enforce a 50-notification cap in the slice.

No new files. No new dependencies.

---

## Changes

### 1. `frontend/src/store/index.ts`

Add `'notifications'` to the `whitelist` in `persistConfig`:

```ts
whitelist: ['theme', 'auth', 'notifications'],
```

### 2. `frontend/src/store/slices/notificationSlice.ts`

In `addNotification`, trim the array to 50 after inserting:

```ts
addNotification: (state, action) => {
  const notification = { ... }
  state.notifications.unshift(notification)
  if (state.notifications.length > 50) {
    state.notifications = state.notifications.slice(0, 50)
  }
  state.unreadCount += 1
},
```

---

## Data Flow

- **On add:** notification unshifted to front → trimmed to 50 → persisted to localStorage
- **On refresh:** rehydrated from localStorage → notifications and unreadCount restored
- **On logout:** `logout.fulfilled` / `clearAuth` extraReducers reset state to `{ notifications: [], unreadCount: 0 }` → persisted as empty

---

## Edge Cases

- **localStorage unavailable:** redux-persist fails silently — no change needed
- **unreadCount accuracy:** persisted as-is alongside the notification array; stays correct because all mutations (add, remove, markAsRead) keep it in sync

---

## Testing

Update `frontend/src/store/slices/__tests__/notificationSlice.test.ts`:

- Add test: adding a 51st notification drops the oldest (array stays at 50)
- Add test: unreadCount stays correct after cap is applied

---

## Out of Scope

- Time-based expiry
- Per-user notification storage (server-side)
- Notification categories or filtering
