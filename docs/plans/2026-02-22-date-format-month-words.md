# Date Format Month Words Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 4 new date format options that display month names as words (abbreviated and full) to the Regional Settings page.

**Architecture:** Two files need changes: `formatters.ts` for the rendering logic (token replacement order must handle `MMMM` before `MMM` before `MM` to avoid substring conflicts), and `RegionalSettingsPage.tsx` for the dropdown options and live preview logic (which duplicates the same replacement).

**Tech Stack:** React 18, TypeScript, localStorage-based format tokens, Material-UI v7

---

### Task 1: Update `applyDateFormat` in formatters.ts

**Files:**
- Modify: `frontend/src/utils/formatters.ts:17-26`

**Step 1: Update the replacement logic**

Replace the current `applyDateFormat` function body with token-safe replacements in this exact order (longest tokens first to avoid partial matches):

```typescript
const applyDateFormat = (dateObj: Date, fmt: string): string => {
  const day = String(dateObj.getDate()).padStart(2, '0')
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const year = String(dateObj.getFullYear())

  const MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const MONTHS_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  const monthFull = MONTHS_FULL[dateObj.getMonth()]
  const monthShort = MONTHS_SHORT[dateObj.getMonth()]

  // Order matters: replace longer tokens first to avoid partial matches
  return fmt
    .replace('MMMM', monthFull)
    .replace('MMM', monthShort)
    .replace('MM', month)
    .replace('DD', day)
    .replace('YYYY', year)
}
```

**Step 2: Verify manually (no automated tests for this utility)**

In browser console (after frontend rebuilds):
```js
localStorage.setItem('dateFormat', 'DD MMM YYYY')
// then check any date-displaying page — should show e.g. "22 Feb 2026"
```

**Step 3: Commit**

```bash
git add frontend/src/utils/formatters.ts
git commit -m "feat: support MMM/MMMM month-word tokens in applyDateFormat"
```

---

### Task 2: Update `RegionalSettingsPage.tsx` — dropdown options and preview

**Files:**
- Modify: `frontend/src/pages/settings/RegionalSettingsPage.tsx`

**Step 1: Expand the `DATE_FORMATS` array**

Replace the existing `DATE_FORMATS` constant (lines 51–57) with:

```typescript
const DATE_FORMATS = [
  { value: 'DD/MM/YYYY',   label: 'DD/MM/YYYY (e.g. 22/02/2026)' },
  { value: 'DD-MM-YYYY',   label: 'DD-MM-YYYY (e.g. 22-02-2026)' },
  { value: 'MM/DD/YYYY',   label: 'MM/DD/YYYY (e.g. 02/22/2026)' },
  { value: 'MM-DD-YYYY',   label: 'MM-DD-YYYY (e.g. 02-22-2026)' },
  { value: 'YYYY-MM-DD',   label: 'YYYY-MM-DD (e.g. 2026-02-22)' },
  { value: 'DD MMM YYYY',  label: 'DD MMM YYYY (e.g. 22 Feb 2026)' },
  { value: 'DD MMMM YYYY', label: 'DD MMMM YYYY (e.g. 22 February 2026)' },
  { value: 'MMM DD, YYYY', label: 'MMM DD, YYYY (e.g. Feb 22, 2026)' },
  { value: 'MMMM DD, YYYY',label: 'MMMM DD, YYYY (e.g. February 22, 2026)' },
]
```

**Step 2: Update `buildPreview` to use the same token logic**

Replace the `buildPreview` function (lines 70–92) with one that uses the same month arrays and replacement order:

```typescript
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Generate a live preview string based on current form values */
const buildPreview = (dateFormat: string, timeFormat: string, numberFormat: string, currency: string): string => {
  const now = new Date(2026, 1, 22, 14, 30) // Fixed example date: 22 Feb 2026, 14:30

  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = String(now.getFullYear())
  const monthFull = MONTHS_FULL[now.getMonth()]
  const monthShort = MONTHS_SHORT[now.getMonth()]

  const datePart = dateFormat
    .replace('MMMM', monthFull)
    .replace('MMM', monthShort)
    .replace('MM', month)
    .replace('DD', day)
    .replace('YYYY', year)

  const timePart = timeFormat === '12h' ? '2:30 PM' : '14:30'
  const numPart = numberFormat === '1234.56' ? '1234.56' : '1,234.56'

  return `${datePart} ${timePart}  |  ${currency} ${numPart}`
}
```

Note: Move `MONTHS_FULL` and `MONTHS_SHORT` outside the function (module-level constants) so they aren't recreated on every render.

**Step 3: Verify in browser**

1. Navigate to Settings → Regional Settings
2. Open the Date Format dropdown — confirm 9 options are listed
3. Select "DD MMM YYYY" → preview shows "22 Feb 2026 14:30 | MYR 1,234.56"
4. Select "DD MMMM YYYY" → preview shows "22 February 2026 14:30 | ..."
5. Select "MMM DD, YYYY" → preview shows "Feb 22, 2026 14:30 | ..."
6. Select "MMMM DD, YYYY" → preview shows "February 22, 2026 14:30 | ..."
7. Save and navigate to any other page with dates — confirm they render correctly

**Step 4: Commit**

```bash
git add frontend/src/pages/settings/RegionalSettingsPage.tsx
git commit -m "feat: add month-word date format options (MMM/MMMM) to regional settings"
```
