# Notification Persistence Across Browser Refresh

## Problem

Notifications disappear when the browser is refreshed. The `notification` Redux slice is excluded from the Redux Persist whitelist, so all notification state is lost on page reload.

## Solution

Add `notification` to the Redux Persist whitelist and clear notifications on logout.

## Changes

### 1. Add to persist whitelist (`frontend/src/store/index.ts`)

Add `'notification'` to the existing whitelist array so Redux Persist serializes notification state to localStorage.

### 2. Ensure timestamp serialization (`frontend/src/store/slices/notificationSlice.ts`)

Verify timestamps are stored as ISO strings (not `Date` objects) so JSON round-tripping works correctly.

### 3. Clear on logout

Dispatch `clearAllNotifications` when the user logs out (manual or automatic/token expiry). This prevents stale notifications from a previous session appearing after re-login.

## What stays the same

- Snackbar behavior (transient, auto-dismiss)
- NotificationPanel UI
- WebSocket notification flow
- All existing notification actions

## Testing

- Notifications persist after F5 refresh
- Notifications clear after manual logout
- Notifications clear after token expiry / auto-logout
