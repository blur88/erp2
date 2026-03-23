# PageHeader Phase 3: Adoption Audit & Standard CRUD Completion

**Date:** 2026-03-24
**Issue:** #166
**Status:** Approved

---

## Goal

Complete PageHeader adoption across all remaining standard CRUD pages, enforce subtitle quality via targeted spot-check, and establish `docs/ui.md` as the living design system reference for PageHeader usage rules and exceptions.

---

## Approach

Migrate-first with inline audit. The audit work is complete — the classification table below serves as the Phase 3A audit artifact. No separate audit phase is needed. Each page migration naturally validates classification, subtitle rules, and action constraints.

---

## Phase 3A — Classification Table (Inline Audit)

### Migrate Now (Phase 3B)

| Page | Module | Notes |
|------|--------|-------|
| FiscalPeriodsPage | Accounting | Clean admin CRUD |
| FundTransfersPage | Accounting | Clean CRUD |
| OwnerEquityPage | Accounting | Clean CRUD |
| SettlementsPage | Accounting | Clean CRUD |
| AccountMappingsPage | Accounting | Clean CRUD |

### Deferred — Requires Pattern Validation

These pages are not yet migrated. They should not be force-fit into `PageHeader` until a suitable pattern is defined. Migration is only appropriate if the page can adopt `PageHeader` without introducing exceptions to layout, action constraints, or header composition.

| Page | Reason |
|------|--------|
| JournalEntriesPage | Dense workflow, complex toolbar |
| JournalEntryFormPage | Nonstandard form shell |
| JournalEntryDetailsPage | Detail / read-only layout |
| BankReconciliationsPage | Reconciliation-heavy layout |
| BankReconciliationDetailsPage | Detail layout |
| ExpensesPage | Complex page shell |
| PurchasingPage | Multi-section overview, multiple header zones |
| BackupManagement | Embedded section-header pattern |
| PriceListDetailsPage | Detail page, nonstandard layout |
| CustomerProfilePage | Detail + tabs layout |

### Permanent Exceptions

These pages do not use `PageHeader` by pattern, not by implementation gap. They require specialized header patterns.

| Page | Exception Category |
|------|-------------------|
| ChartOfAccountsPage | Tree / hierarchy |
| CategoriesPage | Tree / hierarchy |
| AccountingDashboardPage | Dashboard / multi-section |
| DashboardPage | Dashboard / multi-section |
| AuditLogsPage | Multi-tab + sidebar filter |
| All report pages (21) | Report / analytical layout |
| LoginPage | Auth — no header |
| MandatoryPasswordChangePage | Auth — no header |
| NotFoundPage | Error page — no header |

---

## Phase 3B — Migration Rules

These rules apply to every page in the "Migrate Now" list.

1. **Remove legacy header markup** — remove any existing page-level header markup and header-only wrapper elements whose sole purpose was the legacy header layout, including those tied to `TYPOGRAPHY_STYLES.pageHeader`, icon-title combinations, or custom header dividers. Eliminate leftover spacing and container artifacts.

2. **Add `<PageHeader />`** — replace with `<PageHeader title="..." subtitle="..." primaryAction={...} secondaryAction={...} />`.

3. **Remove title icons** — page identity comes from sidebar + breadcrumb + text. Do not carry icons forward.

4. **Enforce max 2 actions** — the primary CTA goes in `primaryAction`, secondary CTA in `secondaryAction`. Any remaining actions move to a toolbar, menu, or inline controls below the header. Do not invent header exceptions to preserve extra actions. If a page cannot be reduced to one primary and one secondary header action without harming usability, defer the page rather than expanding `PageHeader`.

5. **`showDivider`** — defaults to `true`. Only set `showDivider={false}` on form/create pages.

### Proposed Titles & Subtitles for Phase 3B Pages

| Page | Title | Subtitle |
|------|-------|----------|
| FiscalPeriodsPage | Fiscal Periods | Manage accounting periods and year boundaries |
| FundTransfersPage | Fund Transfers | Move funds between accounts and review transfer history |
| OwnerEquityPage | Owner Equity | Track owner contributions and equity transactions |
| SettlementsPage | Settlements | Manage payment settlements and clearing entries |
| AccountMappingsPage | Account Mappings | Configure default account assignments for transactions |

---

## Phase 3C — Subtitle Spot-Check

Apply targeted rules across all previously migrated pages. Do not add subtitles just for consistency — they remain optional and should only be present where they add clarity.

**Fix immediately:**
- Dynamic or stateful subtitles — remove any subtitle containing counts, filter state, or computed values (e.g. "14 Pending Orders Found", "(filtered)", "(active)")
- Redundant subtitles — remove or rewrite if the subtitle just restates the title (e.g. Title: "Vendors" / Subtitle: "Manage vendors")
- Filler text — remove "This page allows you to…" or "Here you can…"

**Improve when obvious:**
- Vague or weak subtitles — upgrade to short, stable, operational phrasing (e.g. "Manage settings" → "Configure company-wide security and access policies")

**Do not force:**
- Missing subtitles — leave absent if the page works fine without one

**Definition of done for subtitles:**
- No dynamic subtitles anywhere
- No filler text
- No obviously redundant subtitles
- Subtitles are either useful or intentionally absent

---

## Phase 3D — `docs/ui.md` Structure

A new top-level design system reference doc. Rules live here; implementation history stays in `docs/superpowers/specs/`.

```
docs/ui.md

1. PageHeader
   - Purpose
   - Anatomy (visual)
   - Props summary
   - Action rules (max 2 + overflow rule)
   - Subtitle policy
   - Do / Don't

2. PageHeader — When NOT to use
   - Decision rule (one sentence)
   - Exception categories with examples

3. Deferred pages
   - Short explanation of intent
   - Link to this spec for full classification table

4. Future expansion note
```

**Content guidelines for `docs/ui.md`:**
- Keep it lean — rules and examples only, no implementation details
- The anatomy section uses a text diagram, not prose
- The Do/Don't section is a short bullet list
- The decision rule is a single sentence at the top of section 2
- The deferred note explicitly states pages should not be force-fit

---

## Acceptance Criteria

- [ ] FiscalPeriodsPage, FundTransfersPage, OwnerEquityPage, SettlementsPage, AccountMappingsPage migrated to `PageHeader`
- [ ] No legacy `TYPOGRAPHY_STYLES.pageHeader` usage remaining on any migrated page
- [ ] No wrapper/container artifacts left over from old header markup
- [ ] Subtitle spot-check complete — no dynamic values, no filler, no obviously redundant subtitles across all migrated pages
- [ ] `docs/ui.md` created with anatomy, do/don't, decision rule, exception categories, deferred note, future expansion line
- [ ] Classification table committed to spec (this document)
- [ ] `docs/ui.md` committed to repo

---

## Previously Completed (Phases 1 & 2)

**Phase 1 — Sales pilot:**
CustomersPage, CreateSalesOrderPage, SalesPage, PaymentsPage, OrdersToolbar, InvoicesToolbar

**Phase 2 — Rollout:**
- Inventory: InventoryPage, StockAdjustmentsPage, CreateProductPage, ProductsToolbar
- Settings: UserManagementPage, RoleManagementPage, CompanySettingsPage, RegionalSettingsPage, SecuritySettingsPage, PaymentMethodsPage, DocumentNumbersPage, PriceCostingPage, PriceListsPage, PrintSettingsPage
- Purchasing: SuppliersPage, VendorPaymentsPage, GoodsReceivedPage, PurchaseOrdersToolbar

**Component polish applied in Phase 2:**
- Title weight: 600 → 700
- Bottom margin: mb 3 → mb 4
