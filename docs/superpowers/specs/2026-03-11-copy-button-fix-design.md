# Copy Button Fix — Design Spec

**Issue:** #77
**Date:** 2026-03-11
**Status:** Approved

## Problem

The copy-to-clipboard button in snackbar notifications (`useNotification.tsx`) and the notification panel (`NotificationPanel.tsx`) silently fails when the app is accessed over HTTP on a non-localhost address (e.g. `http://192.168.1.x`). `navigator.clipboard` is only available in secure contexts (HTTPS or localhost); on HTTP it is `undefined`, causing the `writeText` call to throw a TypeError that is swallowed by an empty catch block. The button appears to work but nothing is copied.

## Solution

**Option A: execCommand fallback** — always show the button; try the modern Clipboard API first, fall back to `document.execCommand('copy')` via a hidden textarea.

## Design

### Shared utility: `frontend/src/utils/clipboard.ts`

A single exported function:

```ts
copyToClipboard(text: string): Promise<boolean>
```

Logic:
1. If `navigator.clipboard` is available, call `navigator.clipboard.writeText(text)` and return `true`.
2. If unavailable or it throws, fall back: create a hidden `<textarea>`, append to `document.body`, set its value, select all, call `document.execCommand('copy')`, remove the element. Return `true` on success, `false` on failure.

### `useNotification.tsx`

Replace the inline `handleCopy` body with a call to `copyToClipboard`. Only call `setCopied(true)` if the utility returns `true` (avoid a false success checkmark on failure).

### `NotificationPanel.tsx`

Same — replace inline copy logic with the shared utility. Same feedback rule.

### What is NOT changed

- The `Alert` `action`/`onClose` structure is left as-is — it is valid MUI usage and not causing the reported bug.
- No new test files are added — this is a small utility fix, not a new feature.

## Files Affected

- `frontend/src/utils/clipboard.ts` — new file
- `frontend/src/hooks/useNotification.tsx` — updated handleCopy
- `frontend/src/components/common/NotificationPanel.tsx` — updated handleCopy
