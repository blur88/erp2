# PageHeader Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 5 Accounting CRUD pages to `PageHeader`, apply subtitle spot-check across all previously migrated pages, and create `docs/ui.md` as the living design system reference.

**Architecture:** Each page migration follows the same pattern as UserManagementPage — replace legacy header Box/Typography/icon markup with `<PageHeader title subtitle primaryAction secondaryAction />`, removing icons and collapsing inline responsive logic into the component's built-in responsive behavior. `docs/ui.md` is a new top-level doc written last after all migration decisions are confirmed.

**Tech Stack:** React 19, MUI v7, TypeScript, Vitest (frontend tests)

**Spec:** `docs/superpowers/specs/2026-03-24-page-header-phase3-design.md`

---

## File Map

**Modified:**
- `frontend/src/pages/accounting/FiscalPeriodsPage.tsx` — replace legacy header (lines ~277–341)
- `frontend/src/pages/accounting/FundTransfersPage.tsx` — replace legacy header (lines ~212–258)
- `frontend/src/pages/accounting/OwnerEquityPage.tsx` — replace legacy header (lines ~225–248)
- `frontend/src/pages/accounting/SettlementsPage.tsx` — replace legacy header (lines ~88–105); fix dynamic title
- `frontend/src/pages/accounting/AccountMappingsPage.tsx` — replace legacy header (lines ~285–316)
- Previously migrated pages (spot-check only — subtitle fixes where violations found)

**Created:**
- `docs/ui.md` — living design system reference

**Tests modified:**
- `frontend/src/pages/accounting/__tests__/FiscalPeriodsPage.test.tsx` (if exists)
- `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx` (if exists)
- `frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx` (if exists)
- `frontend/src/pages/accounting/__tests__/SettlementsPage.test.tsx` (if exists)
- `frontend/src/pages/accounting/__tests__/AccountMappingsPage.test.tsx` (if exists)

> **Note on tests:** These pages may not have dedicated test files. If a test file exists, update any assertions that reference the old header markup. If it doesn't exist, no new test file is required — PageHeader itself is already tested.

---

## Reference Pattern

Before writing any migration, internalize this. All 5 migrations follow this shape:

**Before (legacy):**
```tsx
<Box sx={{ p: 3 }}>
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
    <Box>
      <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: ..., display: 'flex', alignItems: 'center', gap: 2 }}>
        <SomeIcon sx={{ fontSize: ..., color: ... }} />
        Page Title
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Subtitle text
      </Typography>
    </Box>
    <Stack direction="row" spacing={1}>
      <IconButton onClick={handleRefresh}><RefreshIcon /></IconButton>
      <Button variant="contained" onClick={handleAdd}>Add Item</Button>
    </Stack>
  </Box>
  {/* page content */}
</Box>
```

**After (PageHeader):**
```tsx
<Box sx={{ p: 3 }}>
  <PageHeader
    title="Page Title"
    subtitle="Subtitle text"
    secondaryAction={{ label: 'Refresh', onClick: handleRefresh }}
    primaryAction={{ label: 'Add Item', onClick: handleAdd }}
  />
  {/* page content */}
</Box>
```

Key changes:
- Remove the outer header `Box` wrapper (the flex container whose only purpose was the old header layout)
- Remove icon from title — `PageHeader` renders title as plain text
- `IconButton` refresh → `secondaryAction={{ label: 'Refresh', onClick: ... }}`
- Primary `Button` → `primaryAction={{ label: '...', onClick: ... }}`
- Remove `isMobile` variant switching — `PageHeader` handles responsive behavior internally
- Remove unused icon imports after migration

---

## Task 1: Migrate FiscalPeriodsPage

**Files:**
- Modify: `frontend/src/pages/accounting/FiscalPeriodsPage.tsx`

**Key changes for this page:**
- Remove `CalendarIcon` import (no longer needed after header removal)
- Remove `isMobile` responsive header logic (PageHeader handles this)
- Fix subtitle: current subtitle includes `({pagination?.total || 0} total)` — this is a dynamic count, which is a subtitle violation. Use the spec subtitle instead.
- "Generate" → `secondaryAction`, "Add Period" → `primaryAction`
- The `isMobile` variable may still be used elsewhere in the page — check before removing it

- [ ] **Step 1: Add PageHeader import**

In `FiscalPeriodsPage.tsx`, add `PageHeader` to imports. It lives at `@/components/common/PageHeader`.

```tsx
import PageHeader from '@/components/common/PageHeader'
```

- [ ] **Step 2: Replace the legacy header markup**

Find the header `Box` wrapper (starts around line 283 — the `Box` with `display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between'` and `mb: 3`). Replace the entire block (from opening `<Box sx={{ display: 'flex'...` through the closing `</Box>` that wraps both the title-side and action-side) with:

```tsx
<PageHeader
  title="Fiscal Periods"
  subtitle="Manage accounting periods and year boundaries"
  secondaryAction={{ label: 'Generate Periods', onClick: handleGeneratePeriods }}
  primaryAction={{ label: 'Add Period', onClick: handleAddPeriod }}
/>
```

- [ ] **Step 3: Clean up unused imports**

Remove `CalendarIcon` import (was only used in the header). Do NOT remove `isMobile` if it's used elsewhere in the component for table/layout logic.

Check: search the file for any remaining uses of `CalendarIcon`. If none, remove the import.

- [ ] **Step 4: Verify no TYPOGRAPHY_STYLES.pageHeader usage remains in this file**

Search the file for `TYPOGRAPHY_STYLES.pageHeader`. It should no longer appear. If `TYPOGRAPHY_STYLES` is still imported but only used for other constants (tableHeader, etc.), keep the import. If it's no longer used at all, remove it.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep FiscalPeriodsPage
```

Expected: no errors for this file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/FiscalPeriodsPage.tsx
git commit -m "refactor(accounting): migrate FiscalPeriodsPage to PageHeader"
```

---

## Task 2: Migrate FundTransfersPage

**Files:**
- Modify: `frontend/src/pages/accounting/FundTransfersPage.tsx`

**Key changes for this page:**
- Remove `TransferIcon` (SwapHoriz) import
- The `IconButton` refresh button becomes `secondaryAction`
- The "New Transfer" button is only shown when `canManageTransfers` is true — map this to `primaryAction` with `disabled={!canManageTransfers}` or conditionally pass `primaryAction` only when permitted. Use the conditional approach: `primaryAction={canManageTransfers ? { label: 'New Transfer', onClick: () => setDialogOpen(true) } : undefined}`
- Subtitle is already good — keep "Move funds between accounts and review transfer history" (spec value; current is slightly different, use the spec version)

- [ ] **Step 1: Add PageHeader import**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

- [ ] **Step 2: Replace the legacy header markup**

Find the header `Box` (starts around line 212 — the `Box` with `justifyContent: 'space-between', alignItems: 'flex-start', mb: 3`). Replace the entire block including the `Stack` with action buttons:

```tsx
<PageHeader
  title="Fund Transfers"
  subtitle="Move funds between accounts and review transfer history"
  secondaryAction={{ label: 'Refresh', onClick: () => refetch() }}
  primaryAction={
    canManageTransfers
      ? { label: 'New Transfer', onClick: () => setDialogOpen(true) }
      : undefined
  }
/>
```

- [ ] **Step 3: Clean up unused imports**

Remove `TransferIcon` import. The `Stack` import may still be used elsewhere — check before removing.

- [ ] **Step 4: Verify no TYPOGRAPHY_STYLES.pageHeader usage remains**

Same check as Task 1.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep FundTransfersPage
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/FundTransfersPage.tsx
git commit -m "refactor(accounting): migrate FundTransfersPage to PageHeader"
```

---

## Task 3: Migrate OwnerEquityPage

**Files:**
- Modify: `frontend/src/pages/accounting/OwnerEquityPage.tsx`

**Key changes for this page:**
- Remove `OwnerEquityIcon` (AccountBalanceWallet) import
- Current title is "Owner's Equity Transactions" — spec proposes "Owner Equity". Use spec title.
- `IconButton` refresh → `secondaryAction`, "New Transaction" → `primaryAction`
- Subtitle is good — keep "Track owner contributions and equity transactions" (spec value; current is slightly different, use spec version)

- [ ] **Step 1: Add PageHeader import**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

- [ ] **Step 2: Replace the legacy header markup**

Find the header `Box` (starts around line 225 — `display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3`). Replace:

```tsx
<PageHeader
  title="Owner Equity"
  subtitle="Track owner contributions and equity transactions"
  secondaryAction={{ label: 'Refresh', onClick: () => refetch() }}
  primaryAction={{ label: 'New Transaction', onClick: openCreate }}
/>
```

- [ ] **Step 3: Clean up unused imports**

Remove `OwnerEquityIcon` import. Check `Stack` usage.

- [ ] **Step 4: Verify no TYPOGRAPHY_STYLES.pageHeader usage remains**

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep OwnerEquityPage
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/OwnerEquityPage.tsx
git commit -m "refactor(accounting): migrate OwnerEquityPage to PageHeader"
```

---

## Task 4: Migrate SettlementsPage

**Files:**
- Modify: `frontend/src/pages/accounting/SettlementsPage.tsx`

**Key changes for this page:**
- This page has a dynamic title: `{title}` where `title` is computed with a count (e.g. "Settlements (3)"). This is a subtitle violation — the title must be static text. Fix: use `"Settlements"` as the static title and drop the count entirely.
- Remove `AccountBalanceWalletIcon` import
- Only 1 action button: "Create Settlement" → `primaryAction`
- Subtitle is good as-is: "Settle pending payments by payment method"

- [ ] **Step 1: Add PageHeader import**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

- [ ] **Step 2: Find and remove the dynamic title computation**

Look for the variable `title` being constructed (likely something like `` `Settlements (${count})` `` or `` `Settlements${count ? ` (${count})` : ''}` ``). Remove it or leave it unused — it won't be referenced after the migration.

- [ ] **Step 3: Replace the legacy header markup**

Find the header `Box` (starts around line 88). Replace:

```tsx
<PageHeader
  title="Settlements"
  subtitle="Settle pending payments by payment method"
  primaryAction={{ label: 'Create Settlement', onClick: () => setDialogOpen(true) }}
/>
```

- [ ] **Step 4: Clean up unused imports and variables**

Remove `AccountBalanceWalletIcon` import. Remove the unused `title` variable if it's now unreferenced.

- [ ] **Step 5: Verify no TYPOGRAPHY_STYLES.pageHeader usage remains**

- [ ] **Step 6: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep SettlementsPage
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/accounting/SettlementsPage.tsx
git commit -m "refactor(accounting): migrate SettlementsPage to PageHeader"
```

---

## Task 5: Migrate AccountMappingsPage

**Files:**
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`

**Key changes for this page:**
- Remove `SettingsIcon` import
- Current title is "Account Mappings Configuration" — spec proposes "Account Mappings". Use spec title.
- No action buttons — `PageHeader` with title and subtitle only, no `primaryAction` or `secondaryAction`
- Subtitle is good — keep "Configure default account assignments for transactions" (spec value; current is slightly different wording, use spec version)
- `isMobile` responsive header logic can be removed from the header — check if `isMobile` is used elsewhere in the component before removing the variable

- [ ] **Step 1: Add PageHeader import**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

- [ ] **Step 2: Replace the legacy header markup**

Find the header `Box` (starts around line 285 — the `Box` with `flexDirection: isMobile ? 'column' : 'row'` and `mb: 3`). Replace the entire block:

```tsx
<PageHeader
  title="Account Mappings"
  subtitle="Configure default account assignments for transactions"
/>
```

- [ ] **Step 3: Clean up unused imports and variables**

Remove `SettingsIcon` import. Check whether `isMobile` is still used elsewhere in the page (it likely is for table/layout). If not, remove it.

- [ ] **Step 4: Verify no TYPOGRAPHY_STYLES.pageHeader usage remains**

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep AccountMappingsPage
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/AccountMappingsPage.tsx
git commit -m "refactor(accounting): migrate AccountMappingsPage to PageHeader"
```

---

## Task 6: Subtitle Spot-Check (Previously Migrated Pages)

**Files:** All previously migrated pages. Check each for violations — fix only violations, do not add subtitles.

**Previously migrated pages to check:**

Sales: `CustomersPage.tsx`, `CreateSalesOrderPage.tsx`, `SalesPage.tsx`, `PaymentsPage.tsx`, `OrdersToolbar.tsx`, `InvoicesToolbar.tsx`

Inventory: `InventoryPage.tsx`, `StockAdjustmentsPage.tsx`, `CreateProductPage.tsx`, `ProductsToolbar.tsx`

Settings: `UserManagementPage.tsx`, `RoleManagementPage.tsx`, `CompanySettingsPage.tsx`, `RegionalSettingsPage.tsx`, `SecuritySettingsPage.tsx`, `PaymentMethodsPage.tsx`, `DocumentNumbersPage.tsx`, `PriceCostingPage.tsx`, `PriceListsPage.tsx`, `PrintSettingsPage.tsx`

Purchasing: `SuppliersPage.tsx`, `VendorPaymentsPage.tsx`, `GoodsReceivedPage.tsx`, `PurchaseOrdersToolbar.tsx`

**Violation rules — fix these:**
1. **Dynamic subtitle** — any subtitle containing a count, filter state, or computed value. Remove the dynamic part or rewrite as static text.
2. **Redundant subtitle** — subtitle that merely restates the title (e.g. Title: "Suppliers" / Subtitle: "Manage suppliers"). Remove or rewrite.
3. **Filler text** — "This page allows you to…" or "Here you can…". Rewrite or remove.
4. **Vague subtitle** — "Manage settings" with no specificity. Upgrade to operational phrasing.

**Do not touch** subtitles that are already good or pages that have no subtitle.

- [ ] **Step 1: Scan all migrated pages for subtitle violations**

Search for subtitle props containing dynamic expressions:

```bash
cd frontend && grep -rn "subtitle={" src/pages/ | grep -v "//.*subtitle"
```

Review each result. Flag any that:
- Contain template literals with variables (e.g. `` subtitle={`${count} items`} ``)
- Contain function calls or expressions
- Are obviously redundant or filler

- [ ] **Step 2: Fix any violations found**

For each violation, apply the fix inline. If no violations are found, skip this step.

Example fixes:
- Dynamic: `` subtitle={`${count} orders`} `` → remove subtitle or rewrite as `subtitle="Review and manage sales orders"`
- Redundant: `subtitle="Manage suppliers"` with title "Suppliers" → remove subtitle
- Filler: `subtitle="This page allows you to configure..."` → rewrite or remove

- [ ] **Step 3: Type-check any modified files**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "(Page|Toolbar)"
```

- [ ] **Step 4: Commit if any changes were made**

```bash
git add [any modified files]
git commit -m "refactor(ui): subtitle spot-check — remove violations from migrated pages"
```

If no violations were found and no changes were made, skip this commit.

---

## Task 7: Create `docs/ui.md`

**Files:**
- Create: `docs/ui.md`

This is the living design system reference. Write it based on all decisions confirmed during this phase and previous phases. Keep it lean — rules and examples only.

- [ ] **Step 1: Create `docs/ui.md`**

Create the file at `/home/blur/erp2/docs/ui.md` with this content:

````markdown
# UI Design System Reference

This document defines UI standards for the ERP frontend. It is a living reference — rules live here, implementation history lives in `docs/superpowers/specs/`.

---

## PageHeader

### Purpose

`PageHeader` is the standard page-level header component for all CRUD, list, and form pages. It provides a consistent title, optional subtitle, and up to two action buttons across all standard pages.

### Anatomy

```
Title
Subtitle (optional)
                    [Secondary Action]  [Primary Action]
─────────────────────────────────────────────────────────
```

### Props

| Prop | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| `title` | `string` | yes | — | Plain text only. No icons, counts, or dynamic values. |
| `subtitle` | `string` | no | — | Optional. See subtitle policy below. |
| `primaryAction` | `{ label, onClick, disabled? }` | no | — | Rendered as a contained button. |
| `secondaryAction` | `{ label, onClick, disabled? }` | no | — | Rendered as an outlined button. |
| `showDivider` | `boolean` | no | `true` | Set to `false` on form/create pages. |
| `children` | `ReactNode` | no | — | Escape hatch for complex cases only. |

### Action Rules

- Maximum 2 actions in the header: one primary, one secondary.
- If a page has more than 2 actions, the primary CTA goes in `primaryAction`, secondary in `secondaryAction`, and any remaining actions move to a toolbar or inline controls below the header.
- Do not add more actions by customizing `PageHeader`. If a page cannot fit within 2 actions without harming usability, defer it rather than extending the component.
- Permission-gated actions: pass `primaryAction={canDoThing ? { label: '...', onClick: ... } : undefined}` — do not render a disabled primary action for permission checks.

### Subtitle Policy

Subtitles are **optional**. Only add a subtitle where it adds clarity.

**Required when:** Page purpose is not immediately obvious from the title alone; user benefits from operational context.

**Forbidden content:**
- Dynamic values: counts, filter state, statuses, dates (e.g. `"14 pending orders"`, `"(filtered)"`)
- Redundant text that restates the title (e.g. Title: "Suppliers" / Subtitle: "Manage suppliers")
- Filler phrases: "This page allows you to…", "Here you can…"

**Style:** Short, stable, operational. Present-tense verb phrase describing what the page helps the user do.

```
✅ "Manage accounting periods and year boundaries"
✅ "Configure default account assignments for transactions"
❌ "14 Pending Orders Found"
❌ "Manage Vendors"  (when title is already "Vendors")
```

### Do / Don't

**Do:**
- Use `PageHeader` for all standard CRUD, list, and form pages
- Keep titles concise, plain text, and stable
- Use at most one primary and one secondary action
- Write operational subtitles in plain English

**Don't:**
- Add icons to titles
- Include dynamic data in titles or subtitles
- Add more than 2 actions to the header
- Customize layout or spacing per page
- Force a subtitle if the title is self-explanatory

---

## PageHeader — When NOT to Use

Do not use `PageHeader` if the page requires more than one header region or custom header composition.

### Exception Categories

| Category | Examples | Why |
|----------|----------|-----|
| Tree / hierarchy | ChartOfAccountsPage, CategoriesPage | Require hierarchical navigation context, not a single title |
| Dashboard / multi-section overview | DashboardPage, AccountingDashboardPage | Multiple header zones, no single page-level title |
| Report / analytical | All report pages (TrialBalance, GeneralLedger, SalesOrderSummary, etc.) | Filter-heavy, parameter-driven layouts |
| Multi-tab + sidebar filter | AuditLogsPage | Custom layout with multiple header regions |
| Detail pages | CustomerProfilePage, JournalEntryDetailsPage, PriceListDetailsPage | Breadcrumb-led, read-only or tab-based layouts |
| Multi-section overview | PurchasingPage | Multiple sub-headers, not a single page title |
| Embedded section-header pattern | BackupManagement | Section headers are structural, not page-level |
| Auth / error | LoginPage, MandatoryPasswordChangePage, NotFoundPage | No page header expected |

### Decision Checklist

Use `PageHeader` if ALL of the following are true:

- [ ] The page has a single page-level title
- [ ] The page has at most 2 primary actions in the header
- [ ] No custom header widgets (date pickers, tabs, filter bars embedded in the header)
- [ ] No multiple header zones
- [ ] The title is stable, plain text

If any item is unchecked, do not use `PageHeader` — define an appropriate pattern first.

---

## Deferred Pages

Some pages are not yet migrated to `PageHeader`. These pages are not rejected — they require pattern validation before migration.

> Deferred pages should not be force-fit into `PageHeader` until a suitable pattern is defined. Migration is only appropriate if the page can adopt `PageHeader` without introducing exceptions to layout, action constraints, or header composition.

See `docs/superpowers/specs/2026-03-24-page-header-phase3-design.md` for the full classification table.

---

## Future Expansion

This document will expand as new layout primitives are standardized. Planned additions:

- Filter Bar
- Table Toolbar / List Actions
- Form Layout
- Report & Dashboard Header Patterns
````

- [ ] **Step 2: Commit**

```bash
git add docs/ui.md
git commit -m "docs: create docs/ui.md — living UI design system reference"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Confirm no legacy pageHeader usage on migrated pages**

```bash
cd frontend && grep -rn "TYPOGRAPHY_STYLES.pageHeader" src/pages/accounting/FiscalPeriodsPage.tsx src/pages/accounting/FundTransfersPage.tsx src/pages/accounting/OwnerEquityPage.tsx src/pages/accounting/SettlementsPage.tsx src/pages/accounting/AccountMappingsPage.tsx
```

Expected: no output.

- [ ] **Step 2: Confirm PageHeader is used in all 5 pages**

```bash
cd frontend && grep -rn "PageHeader" src/pages/accounting/FiscalPeriodsPage.tsx src/pages/accounting/FundTransfersPage.tsx src/pages/accounting/OwnerEquityPage.tsx src/pages/accounting/SettlementsPage.tsx src/pages/accounting/AccountMappingsPage.tsx
```

Expected: one import and one usage in each file.

- [ ] **Step 3: Full type-check**

```bash
cd frontend && npm run type-check
```

Expected: no new errors.

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npm run test
```

Expected: all tests pass. If accounting page tests fail due to stale header assertions, update them to match the new PageHeader output (look for `data-testid="page-header-divider"` or the title text).
