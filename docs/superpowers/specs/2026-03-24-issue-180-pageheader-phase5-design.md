# PageHeader Phase 5: Unified Header System

**Date:** 2026-03-24
**Issue:** [#180](https://github.com/blur88/erp2/issues/180)
**Status:** Approved

---

## Goal

Evolve `PageHeader` from a strict CRUD-only component into a unified header system that covers all remaining page types in the ERP — reports, dashboards, tree/structure pages, system pages, and workflow pages — while preserving full backward compatibility with all Phase 1–4 consumers.

---

## Approach

**Option C — Named slot props** (chosen over compound-component and in-place extension approaches).

`PageHeader` remains a single prop-driven component. Phase 5 extends it with a semantic `variant` prop plus named slot props (`meta`, `toolbar`) while keeping `children` as the general lower-content escape hatch. This preserves backward compatibility, keeps migration simple, and provides the structure needed to unify all remaining page types under one shared header component.

Phase 5 is tiered: component evolution first (5A), then report pages (5B), then dashboards (5C), then structure pages (5D), then system pages (5E), then workflow pages (5F). Each tier is merged before the next begins.

---

## Component API

### Updated type

```typescript
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
  meta?: ReactNode      // contextual chips, status, period, or summary content rendered below the title/actions row
  toolbar?: ReactNode   // filter rows, tree controls, bulk-action bars, workflow control rows
  children?: ReactNode  // escape hatch for uncommon lower-header content not suited to meta or toolbar
}
```

### Slot semantics

| Slot | Purpose |
|------|---------|
| `meta` | Small contextual content: status chips, selected period, date range summary, context notes |
| `toolbar` | Structured controls: report filters, bulk actions, tree controls, workflow control rows |
| `children` | Last-resort lower content: uncommon page-specific extras, transitional migration support |

### Render order (fixed)

```
1. Title / subtitle / actions
2. meta
3. toolbar
4. children
5. divider
```

`meta`, `toolbar`, and `children` render conditionally — only when provided. No empty wrappers are emitted for omitted slots. Spacing (`mt: 1`) is applied only between rendered rows, not reserved for absent slots.

### Variant behavior

`variant` is optional; when omitted, `PageHeader` behaves as the `standard` variant.

In Phase 5, `variant` is **semantic and layout-affecting, not a visual skin switch**. All variants share the same header shell: same title typography, same subtitle treatment, same action button hierarchy, same divider style. Variants may produce light structural differences in slot spacing or layout density, but must preserve the shared `PageHeader` visual identity.

`variant` does not enforce slot restrictions at runtime. Slot expectations are documented below and in code review, not validated by the component.

**Expected slot usage per variant:**

| Variant | `meta` | `toolbar` | `children` |
|---------|--------|-----------|------------|
| `standard` | uncommon | uncommon | uncommon |
| `report` | uncommon | expected (filter row) | rare |
| `overview` | expected (KPI/context) | possible (controls) | rare |
| `structure` | uncommon | expected (tree controls) | rare |
| `workflow` | expected (period/status) | expected (control row) | rare |
| `system` | possible (status/info) | optional | rare |

---

## Phase 5A — Component Evolution

**Scope:** Update `PageHeader.tsx` and `ExpensesPage` only. No other page migrations.

### Changes

1. Add `variant`, `meta`, `toolbar` to `PageHeaderProps`
2. Render `meta`, `toolbar`, `children` conditionally in fixed order with `mt: 1` between rendered rows; no empty wrapper `<Box>` for omitted slots
3. Add `data-testid` attributes to slot regions: `page-header-meta`, `page-header-toolbar`, `page-header-children`
4. In 5A, `variant` is semantic only — it does not yet affect layout or spacing
5. Migrate `ExpensesPage` bulk-action context bar from `children` → `toolbar` (one-prop change, no visual change)

### What does NOT change in 5A

- No variant-specific layout logic
- No page migrations beyond the `ExpensesPage` cleanup

### Test coverage

New tests verify:
- `meta` renders below title/actions when provided; absent when not
- `toolbar` renders below `meta` when provided; absent when not
- `children` renders below `toolbar` when provided; absent when not
- No empty wrapper emitted for any omitted slot
- All existing tests pass unchanged (backward compatibility)

Tests target slot presence/absence and render order. No CSS margin assertions.

---

## Phase 5B — Report Pages

### Report header pattern

```
Title                        [Secondary] [Primary]
Subtitle
[toolbar: filter row — date range, selects, generate/run]
──────────────────────────────────────────────────────────
```

- `variant="report"`
- `subtitle` — brief report description
- `primaryAction` — optional; only when the page has a clear page-level primary action not already handled inside the toolbar
- `toolbar` — the main home for report filters and run/generate controls
- `showDivider={true}` (default)

### Migration rule

Replace the legacy `Typography` + `TYPOGRAPHY_STYLES.pageHeader` title block with `PageHeader`, using `variant="report"` and `toolbar` for the page's filter/control row. Remove `TYPOGRAPHY_STYLES` import if no other keys remain in use.

### Named inventory — all 24 report pages (in scope)

| Page | Module | Notes |
|------|--------|-------|
| `InventorySummaryReport` | Inventory | |
| `HistoricalInventoryReport` | Inventory | |
| `MovementSummaryReport` | Inventory | |
| `PriceListReport` | Inventory | |
| `ProductCostReport` | Inventory | |
| `PurchaseOrderStatusReport` | Purchasing | |
| `PurchaseOrderDetailsReport` | Purchasing | |
| `VendorPaymentDetailsReport` | Purchasing | |
| `VendorProductListReport` | Purchasing | |
| `PurchaseOrderSummary` | Purchasing | Confirmed: uses `TYPOGRAPHY_STYLES` + `reportTitle` state |
| `ProductCustomerReport` | Sales | |
| `SalesOrderProfitReport` | Sales | |
| `SalesOrderSummary` | Sales | Confirmed: uses `TYPOGRAPHY_STYLES` + `reportTitle` state |
| `CustomerOrderHistory` | Sales | Confirmed: uses `TYPOGRAPHY_STYLES` + report data state |
| `CustomerPaymentByOrder` | Sales | Confirmed: uses `TYPOGRAPHY_STYLES` + `reportTitle` state |
| `CustomerPaymentDetails` | Sales | Confirmed: uses `TYPOGRAPHY_STYLES` + `reportTitle` state |
| `CustomerPaymentSummary` | Sales | Confirmed: uses `TYPOGRAPHY_STYLES` + `reportTitle` state |
| `SalesByProductDetails` | Sales | Confirmed: uses `TYPOGRAPHY_STYLES` + report data state |
| `SalesByProductSummary` | Sales | Confirmed: uses `TYPOGRAPHY_STYLES` + report data state |
| `BalanceSheetPage` | Accounting | |
| `TrialBalancePage` | Accounting | |
| `ProfitAndLossPage` | Accounting | |
| `GeneralLedgerPage` | Accounting | |
| `AccountActivityPage` | Accounting | |

> Several initially borderline pages were reviewed and confirmed as standard report pages because they already use `TYPOGRAPHY_STYLES.pageHeader` together with `reportTitle` or report-data state, and follow the standard report layout pattern.

---

## Phase 5C — Overview / Dashboard Pages

### Pattern

```
Title                        [Refresh]
Subtitle
[meta: KPI strip, date range summary, or context note]
[toolbar: date range controls, filter controls]
──────────────────────────────────────────────────────
```

- `variant="overview"`
- `meta` for KPI summary, date range, or contextual header info
- `toolbar` for interactive controls (date range pickers, refresh controls)

### Pages

| Page | Module |
|------|--------|
| `DashboardPage` | Dashboard |
| `AccountingDashboardPage` | Accounting |
| `PurchasingPage` | Purchasing |

---

## Phase 5D — Structure Pages

### Pattern

```
Title                        [Add]
Subtitle
[toolbar: expand/collapse, search, tree action controls]
──────────────────────────────────────────────────────
```

- `variant="structure"`
- `toolbar` for tree controls

### Pages

| Page | Module |
|------|--------|
| `ChartOfAccountsPage` | Accounting |
| `CategoriesPage` | Inventory |

---

## Phase 5E — System Pages

### Pattern

```
Title                        [Action]
Subtitle
[meta: status badges, info rows — where applicable]
──────────────────────────────────────────────────────
```

- `variant="system"`
- `meta` for status/info rows where applicable

### Pages

| Page | File | Module |
|------|------|--------|
| `AuditLogsPage` | `AuditLogsPage.tsx` | Audit |
| `BackupManagement` | `BackupManagement.tsx` | Settings |

> `BackupManagement.tsx` has no `Page` suffix — use the exact filename when searching or modifying.

---

## Phase 5F — Workflow Pages

### Pattern

```
Title                        [Action]
[meta: period indicator, status chip, context note]
[toolbar: workflow control row — approve/reject/filter]
──────────────────────────────────────────────────────
```

- `variant="workflow"`
- `meta` for period/status context
- `toolbar` for operational control row

### Pages

| Page | Module |
|------|--------|
| `JournalEntriesPage` | Accounting |
| `JournalEntryDetailsPage` | Accounting |
| `BankReconciliationsPage` | Accounting |
| `BankReconciliationDetailsPage` | Accounting |

---

## Shared Rules (5C–5F)

1. Each phase begins only after the prior phase is merged.
2. Variants in 5C–5F may change slot usage and spacing behavior, but must preserve the shared `PageHeader` visual shell.
3. **No component changes are allowed for a single-page use case.** If a pattern doesn't fit, escalate before bending the API.
4. If a page requires a component evolution to support its layout, that evolution must be validated across multiple pages before it is implemented.

---

## Deferred Pages

These pages remain out of scope for Phase 5. They require a separate detail-page pattern before migration.

| Page | Module | Reason |
|------|--------|--------|
| `PriceListDetailsPage` | Settings | Detail + non-standard layout |
| `CustomerProfilePage` | Sales | Detail + tabs layout |

---

## Governance

- Variant slot expectations are documented in the table above and enforced by code review, not runtime validation.
- The existing Phase 4 ESLint guard remains in place for `standard` pages.
- Phase 5 does not add new lint rules — governance is documentation-first until all migrations are complete.
