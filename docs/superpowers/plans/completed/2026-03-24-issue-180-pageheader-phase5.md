# PageHeader Phase 5: Unified Header System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve `PageHeader` from a strict CRUD-only component into a unified header system covering all remaining ERP page types (reports, dashboards, tree/structure, system, workflow) via new `variant`, `meta`, and `toolbar` props, while preserving full backward compatibility with all Phase 1–4 consumers.

**Architecture:** Single prop-driven component extended with named slot props (`meta`, `toolbar`) and a semantic `variant` discriminant. Fixed render order: title/actions → meta → toolbar → children → divider. Each slot renders conditionally with no empty wrappers. Six tiers: 5A component evolution, 5B report pages (24), 5C dashboards (3), 5D structure (2), 5E system (2), 5F workflow (4).

**Tech Stack:** React 19, TypeScript, Material-UI v7, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-24-issue-180-pageheader-phase5-design.md`

---

## File Map

| File | Action | Role |
|------|--------|------|
| `frontend/src/components/common/PageHeader.tsx` | Modify | Add `variant`, `meta`, `toolbar` props; conditional slot rendering |
| `frontend/src/components/common/__tests__/PageHeader.test.tsx` | Modify | Add slot tests; no changes to existing tests |
| `frontend/src/pages/inventory/InventorySummaryReport.tsx` | Modify | 5B: replace legacy header |
| `frontend/src/pages/inventory/HistoricalInventoryReport.tsx` | Modify | 5B |
| `frontend/src/pages/inventory/MovementSummaryReport.tsx` | Modify | 5B |
| `frontend/src/pages/inventory/PriceListReport.tsx` | Modify | 5B |
| `frontend/src/pages/inventory/ProductCostReport.tsx` | Modify | 5B |
| `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx` | Modify | 5B |
| `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx` | Modify | 5B |
| `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx` | Modify | 5B |
| `frontend/src/pages/purchasing/VendorProductListReport.tsx` | Modify | 5B |
| `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx` | Modify | 5B |
| `frontend/src/pages/sales/ProductCustomerReport.tsx` | Modify | 5B |
| `frontend/src/pages/sales/SalesOrderProfitReport.tsx` | Modify | 5B |
| `frontend/src/pages/sales/SalesOrderSummary.tsx` | Modify | 5B |
| `frontend/src/pages/sales/CustomerOrderHistory.tsx` | Modify | 5B |
| `frontend/src/pages/sales/CustomerPaymentByOrder.tsx` | Modify | 5B |
| `frontend/src/pages/sales/CustomerPaymentDetails.tsx` | Modify | 5B |
| `frontend/src/pages/sales/CustomerPaymentSummary.tsx` | Modify | 5B |
| `frontend/src/pages/sales/SalesByProductDetails.tsx` | Modify | 5B |
| `frontend/src/pages/sales/SalesByProductSummary.tsx` | Modify | 5B |
| `frontend/src/pages/accounting/reports/BalanceSheetPage.tsx` | Modify | 5B |
| `frontend/src/pages/accounting/reports/TrialBalancePage.tsx` | Modify | 5B |
| `frontend/src/pages/accounting/reports/ProfitAndLossPage.tsx` | Modify | 5B |
| `frontend/src/pages/accounting/reports/GeneralLedgerPage.tsx` | Modify | 5B |
| `frontend/src/pages/accounting/reports/AccountActivityPage.tsx` | Modify | 5B |
| `frontend/src/pages/dashboard/DashboardPage.tsx` | Modify | 5C |
| `frontend/src/pages/accounting/AccountingDashboardPage.tsx` | Modify | 5C |
| `frontend/src/pages/purchasing/PurchasingPage.tsx` | Modify | 5C |
| `frontend/src/pages/accounting/ChartOfAccountsPage.tsx` | Modify | 5D |
| `frontend/src/pages/inventory/CategoriesPage.tsx` | Modify | 5D (if exists, verify) |
| `frontend/src/pages/accounting/AuditLogsPage.tsx` | Modify | 5E |
| `frontend/src/pages/settings/BackupManagement.tsx` | Modify | 5E |
| `frontend/src/pages/accounting/JournalEntriesPage.tsx` | Modify | 5F |
| `frontend/src/pages/accounting/JournalEntryDetailsPage.tsx` | Modify | 5F |
| `frontend/src/pages/accounting/BankReconciliationsPage.tsx` | Modify | 5F |
| `frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx` | Modify | 5F |

---

## ⚠️ Important Pre-Flight Notes

**ExpensesPage:** The spec listed "migrate bulk-action bar from `children` → `toolbar`" as a Phase 5A scope item. On inspection, `ExpensesPage` passes no `children` to `PageHeader` — the bulk-action bar is already a sibling `<Box>` in the page body (lines 337–346), not inside the `PageHeader` as `children`. This spec item is a confirmed no-op — no change is needed for ExpensesPage in 5A. This is not an oversight; the pre-migration state is already correct.

**Report page header pattern:** All 24 report pages use a legacy `Typography` block that references `TYPOGRAPHY_STYLES.pageHeader`. The migration for each page is:
1. Import `PageHeader` from `@/components/common/PageHeader`
2. Replace the header `<Box>` + `<Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} ...>` block with `<PageHeader variant="report" title="..." subtitle="..." toolbar={...} />`
3. Extract the existing filter section (usually a `<Paper>` wrapping filter controls) as the `toolbar` prop value
4. Remove `TYPOGRAPHY_STYLES` import if `TABLE_STYLES` or other keys are still used, keep only those; if only `pageHeader` was used, remove the whole import

**`CategoriesPage`:** Verify this file exists at `frontend/src/pages/inventory/CategoriesPage.tsx` before Task 9.

---

## Phase 5A — Component Evolution

### Task 1: Add new slot tests to `PageHeader.test.tsx`

**Files:**
- Modify: `frontend/src/components/common/__tests__/PageHeader.test.tsx`

- [ ] **Step 1: Add slot tests**

Append the following `describe` block to the existing test file (after line 103, before the closing `}`):

```tsx
  describe('slot rendering', () => {
    it('renders meta when provided', () => {
      renderWithTheme(
        <PageHeader title="T" meta={<span data-testid="meta-content">Meta</span>} />
      )
      expect(screen.getByTestId('meta-content')).toBeInTheDocument()
    })

    it('does not render meta wrapper when meta is not provided', () => {
      renderWithTheme(<PageHeader title="T" />)
      expect(screen.queryByTestId('page-header-meta')).not.toBeInTheDocument()
    })

    it('renders toolbar when provided', () => {
      renderWithTheme(
        <PageHeader title="T" toolbar={<span data-testid="toolbar-content">Toolbar</span>} />
      )
      expect(screen.getByTestId('toolbar-content')).toBeInTheDocument()
    })

    it('does not render toolbar wrapper when toolbar is not provided', () => {
      renderWithTheme(<PageHeader title="T" />)
      expect(screen.queryByTestId('page-header-toolbar')).not.toBeInTheDocument()
    })

    it('does not render children wrapper when children is not provided', () => {
      renderWithTheme(<PageHeader title="T" />)
      expect(screen.queryByTestId('page-header-children')).not.toBeInTheDocument()
    })

    it('renders meta before toolbar in the DOM', () => {
      renderWithTheme(
        <PageHeader
          title="T"
          meta={<span data-testid="meta-content">Meta</span>}
          toolbar={<span data-testid="toolbar-content">Toolbar</span>}
        />
      )
      const meta = screen.getByTestId('meta-content')
      const toolbar = screen.getByTestId('toolbar-content')
      // meta should appear before toolbar in the document
      expect(meta.compareDocumentPosition(toolbar)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('renders toolbar before children in the DOM', () => {
      renderWithTheme(
        <PageHeader title="T" toolbar={<span data-testid="toolbar-content">Toolbar</span>}>
          <span data-testid="children-content">Children</span>
        </PageHeader>
      )
      const toolbar = screen.getByTestId('toolbar-content')
      const children = screen.getByTestId('children-content')
      expect(toolbar.compareDocumentPosition(children)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('accepts variant prop without error', () => {
      expect(() =>
        renderWithTheme(<PageHeader title="T" variant="report" />)
      ).not.toThrow()
    })
  })
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/PageHeader.test.tsx --no-coverage
```

Expected: multiple FAIL — `page-header-meta`, `page-header-toolbar`, `page-header-children` testids don't exist yet, `variant` prop not accepted.

---

### Task 2: Implement new props in `PageHeader.tsx`

**Files:**
- Modify: `frontend/src/components/common/PageHeader.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import type { ReactNode } from 'react'
import { Box, Button, Typography, useTheme } from '@mui/material'

type PageHeaderAction = {
  label: string
  onClick?: () => void
  disabled?: boolean
}

type PageHeaderProps = {
  title: string
  subtitle?: string
  primaryAction?: PageHeaderAction
  secondaryAction?: PageHeaderAction
  showDivider?: boolean
  variant?: 'standard' | 'report' | 'overview' | 'structure' | 'workflow' | 'system'
  meta?: ReactNode
  toolbar?: ReactNode
  children?: ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  showDivider = true,
  variant: _variant,
  meta,
  toolbar,
  children,
}: PageHeaderProps) {
  const theme = useTheme()
  const hasActions = primaryAction != null || secondaryAction != null

  return (
    <Box
      data-testid={showDivider ? 'page-header-divider' : undefined}
      sx={{
        mb: 4,
        pb: 2,
        ...(showDivider && {
          borderBottom: `1px solid ${theme.palette.divider}`,
        }),
      }}
    >
      {/* Title / subtitle / actions row */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          [theme.breakpoints.down('sm')]: {
            flexDirection: 'column',
            alignItems: 'flex-start',
          },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {hasActions && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexShrink: 0,
              [theme.breakpoints.down('sm')]: {
                alignSelf: 'flex-start',
              },
            }}
          >
            {secondaryAction && (
              <Button
                type="button"
                variant="outlined"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )}
            {primaryAction && (
              <Button
                type="button"
                variant="contained"
                disabled={primaryAction.disabled}
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
              </Button>
            )}
          </Box>
        )}
      </Box>

      {/* meta slot */}
      {meta && (
        <Box data-testid="page-header-meta" sx={{ mt: 1 }}>
          {meta}
        </Box>
      )}

      {/* toolbar slot */}
      {toolbar && (
        <Box data-testid="page-header-toolbar" sx={{ mt: 1 }}>
          {toolbar}
        </Box>
      )}

      {/* children slot */}
      {children && (
        <Box data-testid="page-header-children" sx={{ mt: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  )
}
```

Note: `_variant` is accepted but unused in 5A — it is purely semantic. The leading underscore prevents a TypeScript unused-variable warning.

- [ ] **Step 2: Run PageHeader tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/PageHeader.test.tsx --no-coverage
```

Expected: all tests PASS, including existing tests and new slot tests.

- [ ] **Step 3: Run full frontend test suite to confirm no regressions**

```bash
cd frontend && npm run test
```

Expected: all tests PASS.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/common/PageHeader.tsx src/components/common/__tests__/PageHeader.test.tsx
git commit -m "feat(ui): add variant, meta, toolbar slot props to PageHeader (Phase 5A)"
```

---

## Phase 5B — Report Pages

**Rule for each report page migration:**

Each report page has a header block like:
```tsx
<Box sx={{ mb: 3 }}>
  <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: ... }}>
    {/* optional icon */}
    Report Title
  </Typography>
  <Typography variant="body2" color="text.secondary">
    Report subtitle/description
  </Typography>
</Box>
```
Sometimes the filter section is a sibling `<Paper>` immediately below.

Replace with:
```tsx
<PageHeader
  variant="report"
  title="Report Title"
  subtitle="Report subtitle/description"
  toolbar={<existing filter Paper contents />}
/>
```

Move the filter `<Paper>` contents into `toolbar`. Remove any icons embedded in the title Typography (they don't belong in `PageHeader`'s title). Remove `TYPOGRAPHY_STYLES` import if `pageHeader` was the only key used.

**Import to add to each report page:**
```tsx
import PageHeader from '@/components/common/PageHeader'
```

---

### Task 3: Migrate Inventory report pages (5 pages)

**Files:**
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx`

For each file:

- [ ] **Step 1: Read the file** — locate the header `<Box>` + `<Typography TYPOGRAPHY_STYLES.pageHeader>` block and the filter section (usually a sibling `<Paper>`)

- [ ] **Step 2: Apply migration** — replace the header block with `<PageHeader variant="report" title="..." subtitle="..." toolbar={...} />`. Extract filter controls into a `<Box>` or `<Stack>` passed as `toolbar`. Keep the existing filter `<Paper>` wrapper if it provides useful visual grouping — pass its *contents* (not the `<Paper>` itself) as `toolbar`, or pass the full `<Paper>` if that reads more naturally.

- [ ] **Step 3: Clean up imports** — add `PageHeader` import; remove `TYPOGRAPHY_STYLES` keys no longer used

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/
git commit -m "feat(ui): migrate inventory report pages to PageHeader (Phase 5B)"
```

---

### Task 4: Migrate Purchasing report pages (5 pages)

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`

- [ ] **Step 1: Read each file** — locate header block and filter section

- [ ] **Step 2: Apply migration** — same rule as Task 3

- [ ] **Step 3: Clean up imports**

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/
git commit -m "feat(ui): migrate purchasing report pages to PageHeader (Phase 5B)"
```

---

### Task 5: Migrate Sales report pages (9 pages)

**Files:**
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx`
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx`

- [ ] **Step 1: Read each file** — locate header block and filter section. Some pages use a dynamic `reportTitle` state — use that as the `title` prop.

- [ ] **Step 2: Apply migration** — same rule as Task 3. For pages with `reportTitle` state, pass it: `title={reportTitle}`.

- [ ] **Step 3: Clean up imports**

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/
git commit -m "feat(ui): migrate sales report pages to PageHeader (Phase 5B)"
```

---

### Task 6: Migrate Accounting report pages (5 pages)

**Files:**
- Modify: `frontend/src/pages/accounting/reports/BalanceSheetPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/TrialBalancePage.tsx`
- Modify: `frontend/src/pages/accounting/reports/ProfitAndLossPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/GeneralLedgerPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/AccountActivityPage.tsx`

- [ ] **Step 1: Read each file** — locate header block (confirmed at BalanceSheetPage lines 333–345: `<Box sx={{ mb: 3 }}><Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} ...>` with icon + title + subtitle). Filter section is a sibling `<Paper>`.

- [ ] **Step 2: Apply migration** — strip icons from the title (icons in Typography are a legacy pattern, `PageHeader` title is text-only). If an icon is important branding for the report, it can go in `meta` as a `<Chip>` or be dropped — do not embed it in the title string. The filter `<Paper>` in accounting reports often contains both filter controls AND action buttons (e.g., Generate Report, Export to Excel). Pass all of this as `toolbar` — do not hoist the generate/export buttons into `primaryAction`. Per the spec: "report run/generate controls belong in `toolbar` by default; `primaryAction` is only for true page-level actions outside the filter row."

- [ ] **Step 3: Clean up imports** — accounting reports import `TYPOGRAPHY_STYLES` from `@/constants/typography`; check if `TABLE_STYLES` or other keys are still used; remove only the `pageHeader` key references, keeping any remaining used keys

- [ ] **Step 4: Run type-check and tests**

```bash
cd frontend && npm run type-check && npx vitest run src/pages/accounting/reports/ --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/reports/
git commit -m "feat(ui): migrate accounting report pages to PageHeader (Phase 5B)"
```

---

### Task 7: Run full test suite after 5B

- [ ] **Step 1: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: all tests PASS.

- [ ] **Step 2: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no new errors.

- [ ] **Step 3: Commit if any lint fixes needed; otherwise note clean**

---

## Phase 5C — Dashboard / Overview Pages

> **Gate:** Do not start 5C until 5B is merged.

### Task 8: Migrate dashboard/overview pages (3 pages)

**Files:**
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx`
- Modify: `frontend/src/pages/accounting/AccountingDashboardPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`

For each file:

- [ ] **Step 1: Read the file** — understand the existing header structure. These pages likely have a top-level `<Typography>` title or a legacy header block.

- [ ] **Step 2: Apply migration** — use `variant="overview"`. Use `meta` only for compact contextual info (date range summary, a single KPI chip). If KPI content is large (e.g., a grid of stat cards), keep it in the page body, not in `meta`. `toolbar` for date range controls or refresh controls if present.

Example:
```tsx
<PageHeader
  variant="overview"
  title="Dashboard"
  subtitle="Business performance overview"
  meta={dateRangeSummary ? <Chip label={dateRangeSummary} size="small" /> : undefined}
/>
```

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 4: Run tests for these pages**

```bash
cd frontend && npx vitest run src/pages/dashboard/ src/pages/accounting/__tests__/AccountingDashboardPage.test.tsx --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dashboard/ frontend/src/pages/accounting/AccountingDashboardPage.tsx frontend/src/pages/purchasing/PurchasingPage.tsx
git commit -m "feat(ui): migrate dashboard/overview pages to PageHeader (Phase 5C)"
```

---

## Phase 5D — Structure Pages

> **Gate:** Do not start 5D until 5C is merged.

### Task 9: Migrate structure pages (2 pages)

**Files:**
- Modify: `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
- Modify: `frontend/src/pages/inventory/CategoriesPage.tsx` *(verify file exists at this path before starting)*

For each file:

- [ ] **Step 1: Verify file paths exist**

```bash
ls frontend/src/pages/accounting/ChartOfAccountsPage.tsx frontend/src/pages/inventory/CategoriesPage.tsx
```

If `CategoriesPage.tsx` is at a different path, locate it with:
```bash
find frontend/src -name "*ategori*" -name "*.tsx"
```

- [ ] **Step 2: Read each file** — locate the header block and tree control bar

- [ ] **Step 3: Apply migration** — use `variant="structure"`. Pass tree controls (expand/collapse, search, add-node button) as `toolbar`.

```tsx
<PageHeader
  variant="structure"
  title="Chart of Accounts"
  subtitle="Manage your account hierarchy"
  toolbar={
    <Stack direction="row" spacing={1}>
      {/* existing tree controls */}
    </Stack>
  }
  primaryAction={{ label: 'Add Account', onClick: ... }}
/>
```

- [ ] **Step 4: Run type-check and tests**

```bash
cd frontend && npm run type-check
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/ChartOfAccountsPage.tsx frontend/src/pages/inventory/CategoriesPage.tsx
git commit -m "feat(ui): migrate structure pages to PageHeader (Phase 5D)"
```

---

## Phase 5E — System Pages

> **Gate:** Do not start 5E until 5D is merged.

### Task 10: Migrate system pages (2 pages)

**Files:**
- Modify: `frontend/src/pages/accounting/AuditLogsPage.tsx`
- Modify: `frontend/src/pages/settings/BackupManagement.tsx` *(note: no `Page` suffix)*

- [ ] **Step 1: Read each file**

`AuditLogsPage` was a Phase 4 "Permanent Exception" (multi-tab + sidebar filter). Phase 5's `system` variant accommodates its header. The multi-tab body content does NOT move — only the page title/header area is migrated.

`BackupManagement.tsx` uses a section-header pattern (embedded headers without a top-level PageHeader). Assess whether a top-level `PageHeader` can be added without disrupting the embedded section structure.

- [ ] **Step 2: Apply migration**

For `AuditLogsPage`:
```tsx
<PageHeader
  variant="system"
  title="Audit Logs"
  subtitle="Track all system activity and changes"
  meta={/* status chip or info row if applicable */}
/>
```
Do not move the multi-tab controls into the header.

For `BackupManagement`:
```tsx
<PageHeader
  variant="system"
  title="Backup & Restore"
  subtitle="Manage system backups and restore points"
  meta={/* status badge if applicable */}
/>
```

- [ ] **Step 3: Run type-check**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/AuditLogsPage.tsx frontend/src/pages/settings/BackupManagement.tsx
git commit -m "feat(ui): migrate system pages to PageHeader (Phase 5E)"
```

---

## Phase 5F — Workflow Pages

> **Gate:** Do not start 5F until 5E is merged.

### Task 11: Migrate workflow pages (4 pages)

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Modify: `frontend/src/pages/accounting/JournalEntryDetailsPage.tsx`
- Modify: `frontend/src/pages/accounting/BankReconciliationsPage.tsx`
- Modify: `frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx`

- [ ] **Step 1: Read each file** — understand current header and control layout

- [ ] **Step 2: Apply migration per page type**

**Full workflow pages** (`JournalEntriesPage`, `BankReconciliationsPage`) — both `meta` and `toolbar`:
```tsx
<PageHeader
  variant="workflow"
  title="Journal Entries"
  subtitle="Review and post journal entries"
  meta={<Chip label={currentPeriod} size="small" />}  // period/status context
  toolbar={
    <Stack direction="row" spacing={1}>
      {/* approve/reject/filter controls */}
    </Stack>
  }
/>
```

**Read-only detail pages** (`JournalEntryDetailsPage`, `BankReconciliationDetailsPage`) — `meta` only, no `toolbar`:
```tsx
<PageHeader
  variant="workflow"
  title="Journal Entry"
  meta={<Chip label={entry.status} size="small" />}  // status chip
/>
```

- [ ] **Step 3: Run type-check and tests**

```bash
cd frontend && npm run type-check
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx src/pages/accounting/JournalEntriesPage.test.tsx --no-coverage 2>/dev/null || true
```

Note: test files for these pages may be in `__tests__/` subdirectory or alongside the page file — check both.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx frontend/src/pages/accounting/JournalEntryDetailsPage.tsx frontend/src/pages/accounting/BankReconciliationsPage.tsx frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx
git commit -m "feat(ui): migrate workflow pages to PageHeader (Phase 5F)"
```

---

## Task 12: Final verification and docs update

- [ ] **Step 1: Run full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all tests PASS.

- [ ] **Step 2: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Update the Phase 4 adoption table** in `docs/superpowers/specs/2026-03-24-issue-173-pageheader-phase4-design.md`

Add a note at the top of the "Permanent Exceptions" section:

> **Note:** `AuditLogsPage` was reclassified in Phase 5 — its header was migrated using `variant="system"`. The multi-tab body content remains unchanged.

- [ ] **Step 5: Commit docs update**

```bash
git add docs/
git commit -m "docs(ui): update Phase 4 adoption table — AuditLogsPage reclassified in Phase 5"
```

---

## Anti-Patterns to Avoid

- **Do not add `variant`-specific layout logic unless multiple pages need it.** Escalate first.
- **Do not put large KPI content in `meta`.** Keep `meta` compact — chips, short strings, a date range label.
- **Do not embed page icons in `PageHeader`'s `title` prop.** The title is text-only. Icons from the legacy pattern should be dropped or moved to `meta` as a chip.
- **Do not use `children` where `toolbar` fits.** Structured control rows always go in `toolbar`.
- **Do not start the next tier before the previous one is merged.**
- **Do not modify `PageHeader.tsx` to accommodate a single page's layout.** If a page's content does not fit the existing slots, escalate before changing the API. Component changes require a repeating pattern across multiple pages to justify them.
