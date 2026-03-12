# Accounting UI Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize all accounting page headers to match the consistent pattern used by the 5 report pages.

**Architecture:** Pure UI fix — no logic changes. Each non-report accounting page is updated to use the same header structure: `<Box sx={{ p: 3 }}>` outer container, `<Box sx={{ mb: 3 }}>` header wrapper, `TYPOGRAPHY_STYLES.pageHeader.*` for title, `variant="body2" color="text.secondary"` for subtitle.

**Tech Stack:** React, Material-UI v7, TypeScript, `TYPOGRAPHY_STYLES` from `@/constants/typography`

---

## Reference Pattern (from all 5 report pages)

```jsx
<Box sx={{ p: 3 }}>
  {/* Header */}
  <Box sx={{ mb: 3 }}>
    <Typography
      variant={TYPOGRAPHY_STYLES.pageHeader.variant}
      sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}
    >
      <Icon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
      Page Title
    </Typography>
    <Typography variant="body2" color="text.secondary">
      Subtitle text
    </Typography>
  </Box>
  ...content...
</Box>
```

---

## Issues Per File

| File | Problems |
|------|---------|
| `AccountingDashboardPage.tsx` | No outer `p: 3`, header `mb: 4` |
| `ChartOfAccountsPage.tsx` | No outer `p: 3`, header `mb: 4` |
| `FiscalPeriodsPage.tsx` | No outer `p: 3`, header `mb: 4` |
| `AccountMappingsPage.tsx` | No outer `p: 3`, header `mb: 4` |
| `BankReconciliationsPage.tsx` | No outer `p: 3`, header `mb: 4` |
| `ExpensesPage.tsx` | No outer `p: 3` |
| `OwnerEquityPage.tsx` | No outer `p: 3` |
| `SettlementsPage.tsx` | No outer `p: 3` |
| `JournalEntryFormPage.tsx` | Hardcoded `variant="h4" fontWeight: 600` instead of `TYPOGRAPHY_STYLES` |
| `JournalEntryDetailsPage.tsx` | Hardcoded `variant="h4" fontWeight: 600` instead of `TYPOGRAPHY_STYLES` |
| `BankReconciliationDetailsPage.tsx` | Outer `p: 1` (should be `p: 3`), hardcoded `variant="h5" fontWeight: 600` |

---

### Task 1: Fix AccountingDashboardPage

**Files:**
- Modify: `frontend/src/pages/accounting/AccountingDashboardPage.tsx`

**Step 1: Find the outer return Box and header Box**

The return starts at line ~247:
```jsx
return (
  <Box>
    {/* Header */}
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
```

**Step 2: Apply fixes**

Change 1 — outer Box: `<Box>` → `<Box sx={{ p: 3 }}>`

Change 2 — header Box: `mb: 4` → `mb: 3`

The subtitle currently uses `TYPOGRAPHY_STYLES.pageSubtitle` — change it to match reports exactly:
```jsx
<Typography variant="body2" color="text.secondary">
  {subtitle text}
</Typography>
```

**Step 3: Verify visually**

Run frontend dev server or check Docker. Navigate to `/accounting/dashboard`. Header should have padding and consistent spacing.

**Step 4: Commit**

```bash
git add frontend/src/pages/accounting/AccountingDashboardPage.tsx
git commit -m "style(accounting): standardize dashboard page header"
```

---

### Task 2: Fix ChartOfAccountsPage

**Files:**
- Modify: `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`

**Step 1: Find the outer return and header**

The return is at line ~229. Current structure:
```jsx
return (
  <Box>
    ...
    <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', ..., mb: 4, ... }}>
```

**Step 2: Apply fixes**

Change 1 — outer Box: `<Box>` → `<Box sx={{ p: 3 }}>`

Change 2 — header Box `mb: 4` → `mb: 3`

The subtitle uses `TYPOGRAPHY_STYLES.pageSubtitle` — change to:
```jsx
<Typography variant="body2" color="text.secondary">
  {subtitle text}
</Typography>
```

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/ChartOfAccountsPage.tsx
git commit -m "style(accounting): standardize chart of accounts page header"
```

---

### Task 3: Fix FiscalPeriodsPage

**Files:**
- Modify: `frontend/src/pages/accounting/FiscalPeriodsPage.tsx`

**Step 1: Find outer return and header**

Return is at line ~285. Same pattern as ChartOfAccountsPage:
```jsx
return (
  <Box>
    ...
    <Box sx={{ ..., mb: 4, ... }}>
```

**Step 2: Apply fixes**

Change 1 — outer Box: `<Box>` → `<Box sx={{ p: 3 }}>`

Change 2 — header `mb: 4` → `mb: 3`

Change subtitle to `variant="body2" color="text.secondary"`.

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/FiscalPeriodsPage.tsx
git commit -m "style(accounting): standardize fiscal periods page header"
```

---

### Task 4: Fix AccountMappingsPage

**Files:**
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`

**Step 1: Find outer return and header**

Return is at line ~295:
```jsx
return (
  <Box>
    ...
    <Box sx={{ ..., mb: 4, ... }}>
```

**Step 2: Apply fixes**

Change 1 — outer Box: `<Box>` → `<Box sx={{ p: 3 }}>`

Change 2 — header `mb: 4` → `mb: 3`

Change subtitle to `variant="body2" color="text.secondary"`.

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/AccountMappingsPage.tsx
git commit -m "style(accounting): standardize account mappings page header"
```

---

### Task 5: Fix BankReconciliationsPage

**Files:**
- Modify: `frontend/src/pages/accounting/BankReconciliationsPage.tsx`

**Step 1: Find outer return and header**

Return is at line ~175. Current:
```jsx
return (
  <Box>
    <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', ..., mb: 4, ... }}>
```

**Step 2: Apply fixes**

Change 1 — outer Box: `<Box>` → `<Box sx={{ p: 3 }}>`

Change 2 — header `mb: 4` → `mb: 3`

Change subtitle to `variant="body2" color="text.secondary"`.

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/BankReconciliationsPage.tsx
git commit -m "style(accounting): standardize bank reconciliations page header"
```

---

### Task 6: Fix ExpensesPage, OwnerEquityPage, SettlementsPage

**Files:**
- Modify: `frontend/src/pages/accounting/ExpensesPage.tsx`
- Modify: `frontend/src/pages/accounting/OwnerEquityPage.tsx`
- Modify: `frontend/src/pages/accounting/SettlementsPage.tsx`

All three have the same issue: bare `<Box>` outer container (no padding).

**Step 1: ExpensesPage** (return at line ~296)

```jsx
// Before
return (
  <Box>

// After
return (
  <Box sx={{ p: 3 }}>
```

**Step 2: OwnerEquityPage** (return at line ~272)

```jsx
// Before
return (
  <Box>

// After
return (
  <Box sx={{ p: 3 }}>
```

**Step 3: SettlementsPage** (return at line ~81)

```jsx
// Before
return (
  <Box>

// After
return (
  <Box sx={{ p: 3 }}>
```

**Step 4: Commit**

```bash
git add frontend/src/pages/accounting/ExpensesPage.tsx \
        frontend/src/pages/accounting/OwnerEquityPage.tsx \
        frontend/src/pages/accounting/SettlementsPage.tsx
git commit -m "style(accounting): add outer padding to expenses, owner equity, settlements pages"
```

---

### Task 7: Fix JournalEntryFormPage

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntryFormPage.tsx`

**Step 1: Find the header** (line ~375)

Current:
```jsx
<Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
  <IconButton onClick={handleBack}>
    <ArrowBackIcon />
  </IconButton>
  <Typography variant="h4" sx={{ fontWeight: 600 }}>
    {isEditMode ? 'Edit Journal Entry' : 'New Journal Entry'}
  </Typography>
</Box>
```

**Step 2: Apply fix**

Replace hardcoded variant/fontWeight with TYPOGRAPHY_STYLES:
```jsx
<Typography
  variant={TYPOGRAPHY_STYLES.pageHeader.variant}
  sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight }}
>
```

Note: This page already has `p: 3` on outer Box and `mb: 3` on header Box — those are correct. Only fix the Typography.

Ensure `TYPOGRAPHY_STYLES` is imported (it should already be, check imports).

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntryFormPage.tsx
git commit -m "style(accounting): standardize journal entry form page title typography"
```

---

### Task 8: Fix JournalEntryDetailsPage

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntryDetailsPage.tsx`

**Step 1: Find the header** (line ~198)

Current:
```jsx
<Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
    <IconButton onClick={() => navigate('/accounting/journal-entries')}>
      <ArrowBackIcon />
    </IconButton>
    <Typography variant="h4" sx={{ fontWeight: 600 }}>
      Journal Entry Details
    </Typography>
  </Box>
```

**Step 2: Apply fix**

Replace hardcoded variant/fontWeight:
```jsx
<Typography
  variant={TYPOGRAPHY_STYLES.pageHeader.variant}
  sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight }}
>
```

Add `TYPOGRAPHY_STYLES` import if missing:
```tsx
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
```

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntryDetailsPage.tsx
git commit -m "style(accounting): standardize journal entry details page title typography"
```

---

### Task 9: Fix BankReconciliationDetailsPage

**Files:**
- Modify: `frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx`

**Step 1: Find the outer Box and header** (line ~202)

Current:
```jsx
return (
  <Box sx={{ p: 1 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton onClick={() => navigate('/accounting/bank-reconciliations')}>
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
```

**Step 2: Apply fixes**

Change 1 — outer padding: `p: 1` → `p: 3`

Change 2 — title Typography: `variant="h5" fontWeight: 600` → `TYPOGRAPHY_STYLES.pageHeader.*`

Add `TYPOGRAPHY_STYLES` import if missing:
```tsx
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
```

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx
git commit -m "style(accounting): standardize bank reconciliation details page header"
```

---

### Task 10: Final verification

**Step 1: Type-check frontend**

```bash
cd /home/blur/erp2/frontend && npm run type-check
```

Expected: no errors

**Step 2: Run frontend tests**

```bash
cd /home/blur/erp2/frontend && npm run test
```

Expected: all tests pass

**Step 3: Visual check list**

Navigate to each of these pages and confirm consistent header style (padding, title size, spacing):
- `/accounting/dashboard`
- `/accounting/chart-of-accounts`
- `/accounting/fiscal-periods`
- `/accounting/account-mappings`
- `/accounting/bank-reconciliations`
- `/accounting/bank-reconciliations/:id`
- `/accounting/journal-entries`
- `/accounting/journal-entries/new`
- `/accounting/journal-entries/:id`
- `/accounting/expenses`
- `/accounting/owner-equity`
- `/accounting/settlements`
