# PageHeader Phase 4: Adoption Completion & Enforcement

**Date:** 2026-03-24
**Issue:** [#173](https://github.com/blur88/erp2/issues/173)
**Status:** Approved

---

## Goal

Complete PageHeader adoption across all remaining standard pages, document the full authoritative adoption map, and establish automated enforcement to prevent regression to the legacy header pattern.

---

## Approach

Audit-first, then migrate in two tiers. The full adoption table below serves as the Phase 4 audit artifact. Tier 1 migrates zero-compromise form pages immediately. Tier 2 migrates ExpensesPage with a contained layout refactor. Governance (ESLint + docs) is added after all migrations are complete, so the rule lands on a clean codebase with zero violations.

---

## Phase 4A — Full Adoption Table

### Migrated (Phases 1–3)

| Page | Module | Notes |
|------|--------|-------|
| CustomersPage | Sales | Phase 1 |
| CreateSalesOrderPage | Sales | Phase 1 |
| SalesPage | Sales | Phase 1 |
| PaymentsPage | Sales | Phase 1 |
| OrdersPage | Sales | Phase 1 — header via OrdersToolbar (embedded PageHeader) |
| InvoicesPage | Sales | Phase 1 — header via InvoicesToolbar (embedded PageHeader) |
| OrdersToolbar | Sales | Phase 1 — embedded PageHeader |
| InvoicesToolbar | Sales | Phase 1 — embedded PageHeader |
| InventoryPage | Inventory | Phase 2 |
| StockAdjustmentsPage | Inventory | Phase 2 |
| CreateProductPage | Inventory | Phase 2 |
| ProductsPage | Inventory | Phase 2 — header via ProductsToolbar (embedded PageHeader) |
| ProductsToolbar | Inventory | Phase 2 — embedded PageHeader |
| UserManagementPage | Settings | Phase 2 |
| RoleManagementPage | Settings | Phase 2 |
| CompanySettingsPage | Settings | Phase 2 |
| RegionalSettingsPage | Settings | Phase 2 |
| SecuritySettingsPage | Settings | Phase 2 |
| PaymentMethodsPage | Settings | Phase 2 |
| DocumentNumbersPage | Settings | Phase 2 |
| PriceCostingPage | Settings | Phase 2 |
| PriceListsPage | Settings | Phase 2 |
| PrintSettingsPage | Settings | Phase 2 |
| SuppliersPage | Purchasing | Phase 2 |
| VendorPaymentsPage | Purchasing | Phase 2 |
| GoodsReceivedPage | Purchasing | Phase 2 |
| PurchaseOrdersPage | Purchasing | Phase 2 — header via PurchaseOrdersToolbar (embedded PageHeader) |
| PurchaseOrdersToolbar | Purchasing | Phase 2 — embedded PageHeader |
| FiscalPeriodsPage | Accounting | Phase 3 |
| FundTransfersPage | Accounting | Phase 3 |
| OwnerEquityPage | Accounting | Phase 3 |
| SettlementsPage | Accounting | Phase 3 |
| AccountMappingsPage | Accounting | Phase 3 |

### Phase 4 Targets

| Page | Module | Tier | Notes |
|------|--------|------|-------|
| CreatePurchaseOrderPage | Purchasing | Tier 1 | Clean form-shell, matches CreateSalesOrderPage pattern |
| CreateStockAdjustmentPage | Inventory | Tier 1 | Clean form-shell, matches CreateSalesOrderPage pattern |
| JournalEntryFormPage | Accounting | Tier 1 | Clean form-shell, matches CreateSalesOrderPage pattern |
| ExpensesPage | Accounting | Tier 2 | Standard list page; bulk-action buttons move below header |

### Deferred — Requires Pattern Validation

These pages are not yet migrated. Do not force-fit them into `PageHeader` until a suitable pattern is defined.

| Page | Module | Reason |
|------|--------|--------|
| JournalEntriesPage | Accounting | Dense workflow, complex toolbar |
| JournalEntryDetailsPage | Accounting | Detail / read-only layout |
| BankReconciliationsPage | Accounting | Workflow-heavy, mobile-responsive header |
| BankReconciliationDetailsPage | Accounting | Detail layout |
| PurchasingPage | Purchasing | Multi-section overview, multiple header zones |
| PriceListDetailsPage | Settings | Detail page, nonstandard layout |
| CustomerProfilePage | Sales | Detail + tabs layout |
| BackupManagement | Settings | Embedded section-header pattern (filename: `BackupManagement.tsx` — no Page suffix) |

### Permanent Exceptions

| Page | Module | Exception Category |
|------|--------|-------------------|
| ChartOfAccountsPage | Accounting | Tree / hierarchy |
| CategoriesPage | Inventory | Tree / hierarchy |
| AccountingDashboardPage | Accounting | Dashboard / multi-section |
| DashboardPage | Dashboard | Dashboard / multi-section |
| AuditLogsPage | Audit | Multi-tab + sidebar filter |
| All report pages (21+) | Various | Report / analytical layout |
| LoginPage | Auth | Auth — no header |
| MandatoryPasswordChangePage | Auth | Auth — no header |
| NotFoundPage | — | Error page — no header |

---

## Phase 4B — Tier 1 Migrations

All three pages follow the same pattern as `CreateSalesOrderPage`: a back-button + dynamic title, no header actions.

### Migration rules

1. Keep the `IconButton` back-arrow as a sibling element above `PageHeader` — consistent with `CreateSalesOrderPage`. Back navigation is navigation, not a page action. Do not put it inside `PageHeader`.
2. The back-arrow `IconButton` must use `sx={{ mb: 1 }}` — matching `CreateSalesOrderPage` line 422. That reference also has `mr: 2` but since `PageHeader` is a block element on the next line, `mr` has no visual effect and may be omitted.
3. Replace the legacy `Typography` title block and its wrapper `Box` with `<PageHeader title="..." showDivider={false} />`.
4. No subtitle — form pages with dynamic titles do not benefit from one.
5. Remove `TYPOGRAPHY_STYLES.pageHeader` import if no other keys from `TYPOGRAPHY_STYLES` remain in use.

### CreatePurchaseOrderPage

| | Value |
|---|---|
| Title | `isEditMode ? 'Edit Purchase Order' : 'Create Purchase Order'` |
| Subtitle | none |
| `showDivider` | `false` |
| Primary action | none |
| Secondary action | none |

### CreateStockAdjustmentPage

| | Value |
|---|---|
| Title | `isEditMode ? 'Edit Stock Adjustment' : 'Create Stock Adjustment'` (or equivalent dynamic title from current code) |
| Subtitle | none |
| `showDivider` | `false` |
| Primary action | none |
| Secondary action | none |

### JournalEntryFormPage

| | Value |
|---|---|
| Title | `isEditMode ? 'Edit Journal Entry' : 'New Journal Entry'` |
| Subtitle | none |
| `showDivider` | `false` |
| Primary action | none |
| Secondary action | none |

---

## Phase 4C — Tier 2 Migration: ExpensesPage

### Current header structure

- Title: "Expenses" (with icon)
- Subtitle: "Record and manage business expense transactions"
- Refresh `IconButton` (always visible)
- "New Expense" primary button (always visible)
- "Bulk Post (N)" contained button (visible only when `selectedIds.size > 0`)
- "Bulk Delete (N)" outlined error button (visible only when `selectedIds.size > 0`)

### Migration plan

**PageHeader:**
```tsx
<PageHeader
  title="Expenses"
  subtitle="Record and manage business expense transactions"
  primaryAction={{ label: 'New Expense', onClick: openCreate }}
/>
```

**Refresh icon:** Move to an inline toolbar area just above the data table, alongside any existing filter controls. This is a data action, not a page action.

**Bulk actions:** Move to a selection-context bar rendered conditionally between the filter controls and the table:

```text
[ Filter Bar                              ] [Refresh]
[ Bulk Post (N) ] [ Bulk Delete (N) ]        ← only when selectedIds.size > 0
[ Table                                   ]
```

The selection-context bar uses `Stack`, `Box`, and existing `Button` components — no new abstractions. If a net-new `BulkActionsToolbar` component is required to implement this cleanly, stop and defer ExpensesPage instead.

**Title icon:** Remove. Page identity comes from sidebar, breadcrumb, and text title.

**Stop condition:** If any of the following are true, defer ExpensesPage and do not complete the migration:
- The bulk-action bar requires a new shared component
- Moving the refresh icon causes layout issues with existing filter controls
- Any aspect of the migration requires adding exceptions to `PageHeader` props or layout

---

## Phase 4D — Subtitle Consistency Pass

Spot-check only. Same policy as Phase 3.

- **Tier 1 pages (CreatePurchaseOrderPage, CreateStockAdjustmentPage, JournalEntryFormPage):** No subtitle added — form pages with dynamic titles.
- **ExpensesPage:** Keep existing subtitle unchanged ("Record and manage business expense transactions" — operational, stable, non-dynamic).
- **All other migrated pages:** No changes needed; the Phase 3 pass already cleaned up previously migrated pages.

Do not add subtitles to pages that currently lack one unless the title is genuinely unclear without it.

---

## Phase 4E — ESLint Enforcement

Add two selectors to the `no-restricted-syntax` rule in the frontend ESLint config (`frontend/eslint.config.js`). This rule is added **after** all Tier 1 and Tier 2 migrations are complete, so it lands on a codebase with zero existing violations.

The project uses ESLint flat config with `tseslint.config(...)`. Add the rule to the existing `rules` object — the block that already contains `'react-hooks/exhaustive-deps': 'off'` (lines 22–57 of `eslint.config.js`):

```js
// In frontend/eslint.config.js, inside the rules object:
'no-restricted-syntax': [
  'error',
  {
    selector: "MemberExpression[object.name='TYPOGRAPHY_STYLES'][property.name='pageHeader']",
    message: 'Use the <PageHeader> component instead of TYPOGRAPHY_STYLES.pageHeader. See docs/ui.md for usage rules and exception categories.',
  },
  {
    selector: "VariableDeclarator[init.name='TYPOGRAPHY_STYLES'] > ObjectPattern > Property[key.name='pageHeader']",
    message: 'Do not destructure TYPOGRAPHY_STYLES.pageHeader. Use <PageHeader> instead. See docs/ui.md.',
  },
],
```

The first selector catches direct access (`TYPOGRAPHY_STYLES.pageHeader.variant`). The second catches destructuring (`const { pageHeader } = TYPOGRAPHY_STYLES`) — it is scoped to `VariableDeclarator` whose `init` is `TYPOGRAPHY_STYLES`, so it will not fire on any other object that happens to have a `pageHeader` property.

Other `TYPOGRAPHY_STYLES` keys (`tableCell`, `pageSubtitle`, etc.) are not affected.

---

## Phase 4F — docs/ui.md Updates

Two additions to `docs/ui.md`:

### 1. New Page Checklist

Add to the PageHeader section, after the Do/Don't list:

```markdown
### New Page Checklist

- Is this a standard CRUD, list, or form page? → Use `PageHeader`
- Does the page have at most 2 header actions? If not, move extras to a toolbar below
- Subtitle: stable, operational, non-dynamic — or omit it entirely
- Do not use `TYPOGRAPHY_STYLES.pageHeader` — it is lint-blocked
- If the page does not fit `PageHeader` without introducing exceptions, classify it as Deferred/Exception — do not customize the component
```

### 2. Adoption Map reference

In the Deferred Pages section of `docs/ui.md`, replace the reference to `docs/superpowers/specs/2026-03-24-page-header-phase3-design.md` with `docs/superpowers/specs/2026-03-24-issue-173-pageheader-phase4-design.md`.

---

## Acceptance Criteria

- [ ] Full adoption table documented in this spec
- [ ] `CreatePurchaseOrderPage` migrated to `PageHeader` with `showDivider={false}`
- [ ] `CreateStockAdjustmentPage` migrated to `PageHeader` with `showDivider={false}`
- [ ] `JournalEntryFormPage` migrated to `PageHeader` with `showDivider={false}`
- [ ] `ExpensesPage` migrated to `PageHeader`; bulk actions moved to inline selection-context bar; refresh icon moved below header; OR explicitly deferred with documented reason
- [ ] No legacy `TYPOGRAPHY_STYLES.pageHeader` usage in any Tier 1 or Tier 2 page after migration
- [ ] Subtitle consistency pass complete — no changes required beyond Tier 2 page
- [ ] ESLint `no-restricted-syntax` rule added with both selectors (member access + destructuring)
- [ ] ESLint rule lands with zero existing violations
- [ ] `docs/ui.md` updated: New Page Checklist added, Deferred Pages section updated to reference Phase 4 spec
- [ ] All migrated pages pass TypeScript check and existing tests

---

## Previously Completed

- **Phase 1:** Sales pilot — CustomersPage, CreateSalesOrderPage, SalesPage, PaymentsPage, OrdersToolbar, InvoicesToolbar
- **Phase 2:** Rollout across Inventory, Settings, Purchasing
- **Phase 3:** Accounting CRUD pages + `docs/ui.md` creation
