# Notification Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a copy-to-clipboard button on every snackbar notification and add missing notifications to SettlementsPage.

**Architecture:** Single-file change to `useNotification.tsx` for the copy button (applies globally). One page fix for SettlementsPage which is the only page with mutation handlers missing notifications.

**Tech Stack:** React, MUI (IconButton, ContentCopy, Check icons), Clipboard API

---

### Task 1: Add Copy Button to Snackbar Notifications

**Files:**
- Modify: `frontend/src/hooks/useNotification.tsx:1-156`

**Step 1: Add imports for copy icon and state**

Add `IconButton` to the MUI import, add `ContentCopy` and `Check` icons, and add a `useState` for the copied state.

In the existing MUI import on line 2, add `IconButton`:
```typescript
import { Snackbar, Alert, AlertColor, IconButton } from '@mui/material'
```

Add new icon imports after line 2:
```typescript
import { ContentCopy as CopyIcon, Check as CheckIcon } from '@mui/icons-material'
```

**Step 2: Add copied state in NotificationProvider**

Inside `NotificationProvider`, after the `snackbar` state (line 38), add:
```typescript
const [copied, setCopied] = React.useState(false)
```

**Step 3: Add copy handler**

After the `handleClose` function (line 105), add:
```typescript
const handleCopy = async () => {
  const text = snackbar.title ? `${snackbar.title}: ${snackbar.message}` : snackbar.message
  try {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  } catch {
    // Fallback: select text for manual copy
  }
}
```

**Step 4: Reset copied state when snackbar changes**

In the `showNotification` callback, after `setSnackbar(...)` (line 60), add:
```typescript
setCopied(false)
```

**Step 5: Add copy button to Alert action area**

Replace the Alert component (lines 130-144) with:
```tsx
<Alert
  onClose={handleClose}
  severity={snackbar.type}
  variant="filled"
  action={
    <>
      <IconButton
        size="small"
        color="inherit"
        onClick={handleCopy}
        sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}
      >
        {copied ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
      </IconButton>
      <IconButton size="small" color="inherit" onClick={handleClose}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </>
  }
  sx={{
    width: '100%',
    minWidth: 300,
    maxWidth: 500,
  }}
>
  {snackbar.title && (
    <strong>{snackbar.title}: </strong>
  )}
  {snackbar.message}
</Alert>
```

Note: This uses a custom `action` prop to render both the copy button and close button, replacing the default `onClose` close button. Add `Close as CloseIcon` to the MUI icons import.

**Step 6: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add frontend/src/hooks/useNotification.tsx
git commit -m "feat: add copy-to-clipboard button on snackbar notifications"
```

---

### Task 2: Add Notifications to SettlementsPage

**Files:**
- Modify: `frontend/src/pages/accounting/SettlementsPage.tsx:60-79`

**Step 1: Add useNotification import and hook**

Add import after line 34:
```typescript
import { useNotification } from '@/hooks/useNotification'
```

Add hook usage inside the component, after line 48:
```typescript
const { showSuccess, showError } = useNotification()
```

**Step 2: Wrap onCreate with try/catch and notifications**

Replace `onCreate` (lines 60-71) with:
```typescript
const onCreate = async (data: {
  paymentMethodId: string;
  settlementDate: string;
  paymentIds: string[];
  reference?: string;
  notes?: string;
}) => {
  try {
    await dispatch(createSettlement(data)).unwrap();
    await dispatch(fetchSettlements({ page: 1, limit: 50 }));
    await dispatch(fetchPendingSummary());
    setDialogOpen(false);
    showSuccess('Settlement created successfully');
  } catch (error: any) {
    showError(error?.message || String(error) || 'Failed to create settlement');
  }
};
```

**Step 3: Wrap onCancel with try/catch and notifications**

Replace `onCancel` (lines 73-79) with:
```typescript
const onCancel = async () => {
  if (!cancelTarget) return;
  try {
    await dispatch(cancelSettlement(cancelTarget.id)).unwrap();
    await dispatch(fetchSettlements({ page: 1, limit: 50 }));
    await dispatch(fetchPendingSummary());
    setCancelTarget(null);
    showSuccess('Settlement cancelled successfully');
  } catch (error: any) {
    showError(error?.message || String(error) || 'Failed to cancel settlement');
  }
};
```

**Step 4: Verify the build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/pages/accounting/SettlementsPage.tsx
git commit -m "feat: add success/error notifications to SettlementsPage"
```

---

## Audit Summary — Pages Already Covered

The initial audit identified many pages, but upon detailed review most already have complete notification coverage:

| Page | Status | Notes |
|------|--------|-------|
| **ExpensesPage** | Complete | All CRUD + bulk operations have showSuccess/showError |
| **OwnerEquityPage** | Complete | All CRUD + bulk operations have showSuccess/showError |
| **AccountMappingsPage** | Complete | Save + clear have showSuccess/showError |
| **ChartOfAccountsPage** | Complete | Delete + seed have showSuccess/showError |
| **JournalEntriesPage** | Complete | Post + delete + bulk operations covered |
| **StockAdjustmentsPage** | Complete | Delete + complete + revert covered |
| **PriceListsPage** | Complete | CRUD + default + copy covered |
| **PriceListDetailsPage** | Complete | Save + adjustment covered |
| **PriceCostingPage** | Complete | Submit + recount covered |
| **DocumentNumbersPage** | Complete | Submit covered |
| **RegionalSettingsPage** | Complete | Submit covered |
| **GeneralTab** | Complete | Import + save covered |
| **InvoicesPage** | N/A | Delete/add are stubs ("will be implemented later") |
| **PaymentsPage** | N/A | Read-only list/detail view, no mutations |
| **VendorPaymentsPage** | N/A | Read-only list/detail view, no mutations |
| **GoodsReceivedPage** | N/A | Read-only list/detail view, no mutations |
| **SettlementsPage** | **NEEDS FIX** | onCreate and onCancel have no try/catch or notifications |
