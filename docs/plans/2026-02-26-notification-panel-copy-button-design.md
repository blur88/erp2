# Notification Panel Copy Button Design

**Date:** 2026-02-26
**Status:** Approved

## Goal

Add a copy-to-clipboard button to each notification item in the `NotificationPanel` dropdown.

## Decisions

- **Copy content:** Message field only (not title or timestamp)
- **Placement:** Inline with existing action buttons (copy, then mark-as-read, then delete)
- **Feedback:** Icon swaps from `ContentCopy` to `Check` for 1.5s, matching snackbar behavior
- **State:** Single `copiedId` at the panel level (approach B)
- **Error handling:** Silent fallback if clipboard API unavailable

## Changes

**File:** `frontend/src/components/common/NotificationPanel.tsx`

1. Add `copiedId` state (`string | null`) and a timeout ref
2. Add `handleCopy(id: string, message: string)` async function using `navigator.clipboard.writeText()`
3. Import `ContentCopy` and `Check` icons from MUI
4. Add `IconButton` with copy icon before existing read/delete buttons per notification item
5. Add tooltip "Copy message"

## Visual

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓  Order Shipped     [success]
    Delivery expected 2026-02-27
    2 minutes ago
    [Copy] [Read] [Delete]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
