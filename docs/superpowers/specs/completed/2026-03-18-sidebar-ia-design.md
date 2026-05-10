# Sidebar Modernization — Information Architecture Design

**Issue:** #128
**Date:** 2026-03-18
**File:** `frontend/src/components/common/Sidebar.tsx`
**Scope:** `menuSections` restructure + label shortening + icon deduplication + Settings internal grouping

---

## Goal

Modernize the sidebar for better scanning speed and logical grouping without changing any routes, interaction mechanics, or page components.

---

## Current Structure (before)

The existing `menuSections` array has five sections:

| Section ID   | Items |
|--------------|-------|
| `main`       | Dashboard |
| `operations` | Sales (5 children), Purchasing (5 children), Inventory (4 children) |
| `accounting` | `accounting` item (10 children), `accounting-reports` item (5 children) |
| `analytics`  | `sales-reports` item (9 children), `purchasing-reports` item (5 children), `inventory-reports` item (5 children) |
| `system`     | Settings (12 children), Audit Logs |

The `accounting-reports`, `sales-reports`, `purchasing-reports`, and `inventory-reports` top-level items are being retired. Their leaf children (the actual report links) are preserved and moved.

---

## New Section Structure (after)

| Section ID       | Label          | Top-level items              |
|------------------|----------------|------------------------------|
| `primary`        | Primary        | Dashboard                    |
| `operations`     | Operations     | Sales, Purchasing, Inventory |
| `finance`        | Finance        | Accounting                   |
| `insights`       | Insights       | Reports                      |
| `administration` | Administration | Settings, Audit Logs         |

**Migration summary:**
- `main` → `primary` (section rename only)
- `operations` — section id and items unchanged
- `accounting` section → `finance` (rename); the `accounting-reports` sibling item is removed entirely
- `analytics` section — removed entirely; its leaf report links move to `insights`
- New `insights` section: one `reports` top-level item containing all 19 report links
- `system` → `administration` (section rename only)

---

## Accounting Item After Restructure

The `accounting` top-level item (id: `accounting`) has 10 children: Dashboard, Chart of Accounts, Journal Entries, Bank Reconciliation, Expenses, Fund Transfers, Settlements, Owner's Equity, Fiscal Periods, Account Mappings. These 10 children are **not** changing.

The `accounting-reports` sibling item (id: `accounting-reports`) — which is a separate top-level item in the current `accounting` section — is deleted. Its 5 leaf children (Trial Balance, Balance Sheet, etc.) move to the `reports` item in `insights`.

The `accounting` top-level item remains a parent node (no `path`). Its accordion/flyout behavior is unchanged.

---

## Reports Consolidation

The new `reports` top-level item:
- **id:** `reports`
- **icon:** `AssessmentIcon` (already imported; reused from the retired `accounting-reports` item)
- **path:** none (parent node — toggles accordion in expanded mode, triggers flyout in collapsed rail mode)

All 19 report links are direct children of `reports`. There is no extra data-model nesting. Sub-group separation is rendered visually via the `group` field (see Interface Changes). The visual group headers do not add a nesting level to the data model.

### Children with `group` field (full mapping)

```
group: 'Sales'
  id: sales-by-product-summary   → Product Summary         /reports/sales/product-summary
  id: sales-by-product-details   → Product Details         /reports/sales/product-details
  id: sales-order-summary        → Order Summary           /reports/sales/order-summary
  id: sales-order-profit-report  → Order Profit            /reports/sales/order-profit
  id: customer-payment-summary   → Payment Summary         /reports/sales/customer-payment-summary
  id: customer-payment-by-order  → Payment by Order        /reports/sales/payment-by-order
  id: customer-payment-details   → Payment Details         /reports/sales/payment-details
  id: customer-order-history     → Order History           /reports/sales/order-history
  id: product-customer-report    → Product Customers       /reports/sales/product-customer

group: 'Purchasing'
  id: purchase-order-summary     → Order Summary           /reports/purchasing/order-summary
  id: purchase-order-details     → Order Details           /reports/purchasing/order-details
  id: purchase-order-status      → Order Status            /reports/purchasing/order-status
  id: vendor-payment-details     → Payment Details         /reports/purchasing/payment-details
  id: vendor-purchase-list       → Vendor Products         /reports/purchasing/vendor-purchase-list

group: 'Inventory'
  id: inventory-summary          → Inventory Summary       /reports/inventory/summary
  id: historical-inventory       → Historical Inventory    /reports/inventory/historical
  id: inventory-movement-summary → Movement Summary        /reports/inventory/movement-summary
  id: product-price-list         → Product Price List      /reports/inventory/price-list
  id: product-cost-report        → Product Cost Report     /reports/inventory/product-cost

group: 'Accounting'
  id: trial-balance              → Trial Balance           /accounting/reports/trial-balance
  id: balance-sheet              → Balance Sheet           /accounting/reports/balance-sheet
  id: profit-loss                → Profit & Loss           /accounting/reports/profit-loss
  id: general-ledger             → General Ledger          /accounting/reports/general-ledger
  id: account-activity           → Account Activity        /accounting/reports/account-activity
```

All leaf item `id` values are preserved from the current codebase to avoid breaking active-state detection and any external references. All route paths are preserved exactly.

Note on `vendor-purchase-list`: the current label is "Vendor Product List". This spec shortens it to "Vendor Products" — removing the "List" suffix for conciseness. The prefix "Vendor" is retained because it is the distinguishing term within the Purchasing group (unlike other groups where the prefix is the group name itself).

---

## Label Shortening Rule

Labels are shortened by removing the module prefix (e.g., "Sales", "Purchase", "Customer") when the group context makes it redundant. Full titles remain on page headers — no page changes needed.

The rule is applied consistently within each group. Labels must be distinct within their group.

---

## Settings Internal Grouping

Settings remains a single top-level item (id: `settings`, no path, parent node). Its 11 children are organized into three named groups.

### Children with `group` field (full mapping)

```
group: 'Business'
  id: company-settings       → Company              /settings/company
  id: price-costing-settings → Inventory Costing    /settings/price-costing
  id: regional-settings      → Regional             /settings/regional
  id: price-lists            → Price Lists          /settings/price-lists
  id: payment-methods        → Payment Methods      /settings/payment-methods
  id: print-settings         → Print Settings       /settings/print
  id: document-numbers       → Document Numbers     /settings/document-numbers

group: 'Access'
  id: users                  → Users                /settings/users
  id: roles                  → Roles & Permissions  /settings/roles
  id: security               → Security             /settings/security

group: 'System'
  id: backup-restore         → Backup & Restore     /settings/backup
```

Order: Business (operational config) → Access (user management) → System (sensitive/destructive). All item `id` values and paths are preserved from the current codebase.

Group headers render inside the expanded Settings accordion and inside the Settings flyout panel (same rendered output in both modes). They never render in collapsed rail trigger state (the icon-only button).

---

## Interface Changes

Add optional `group?: string` to the `MenuItem` interface:

```ts
interface MenuItem {
  id: string
  title: string
  icon: React.ReactNode
  path?: string
  badge?: number | string
  group?: string          // visual group header trigger (Settings and Reports children only)
  children?: MenuItem[]
}
```

### Render logic

In both `renderMenuItem` and `renderFlyoutItem`, when rendering the children array of an item, track the previous child's `group` value. Before rendering a child, if its `group` differs from the previous child's `group` (or it is the first child with a `group` set), insert a small `Typography` label above it.

This only activates when at least one child has a `group` field set. Items without `group` fields are rendered exactly as today.

---

## Visual Hierarchy

- **Section labels** (`overline` typography, already implemented) are the primary hierarchy cue
- **Spacing** between sections carries the visual separation
- **One divider** is retained — before the Administration section only
- All other inter-section dividers are removed

*Use spacing and section labels as the primary hierarchy cues; retain only one divider before Administration.*

### Divider condition update

The current render block contains two places with hard-coded section ID arrays that must be updated alongside the section renames:

1. The `display` condition on the `Divider` component:
   ```ts
   // current
   collapsed && !['analytics', 'system'].includes(section.id) ? 'none' : 'block'
   // update to show divider only before administration
   collapsed && section.id !== 'administration' ? 'none' : 'block'
   ```

2. The collapsed spacer condition:
   ```ts
   // current
   collapsed && index > 0 && ['analytics', 'system'].includes(section.id)
   // update to match new IDs
   collapsed && index > 0 && section.id === 'administration'
   ```

Row heights (44px top-level, 40px nested) are already correct — no changes needed.

---

## Icon Deduplication

**Actual duplicates in current code (verified):**

| Item | Current icon | Issue | Replacement |
|------|-------------|-------|-------------|
| `accounting` top-level item | `AccountBalanceIcon` | Same as Bank Reconciliation | `AccountBalance` stays on Accounting; Bank Reconciliation should use `AccountBalanceOutlined` instead |
| `general-ledger` | `DescriptionIcon` | Same as Journal Entries | `MenuBook` |

Note: Account Mappings currently uses `SettingsIcon` (not `AccountBalance` — the earlier spec draft was wrong). The icon review for Account Mappings shows no duplicate that needs fixing; it can stay as `SettingsIcon`.

Both `MenuBook` and `AccountBalanceOutlined` are available in `@mui/icons-material` and need to be added to the import block.

No other icon changes. Full icon redesign is out of scope.

---

## `getFilteredMenuSections` — Confirmed Safe

The function body is:
```ts
const getFilteredMenuSections = () => {
  return menuSections
}
```

It is a pass-through with no ID-dependent logic. Restructuring `menuSections` does not affect it.

---

## What Does Not Change

- All route paths — unchanged
- All page components — unchanged
- Rail/collapsed mode behavior — unchanged
- Flyout mechanics (hover delay, Popper, Fade) — unchanged
- Active state detection (`isItemActive`) — unchanged
- `SIDEBAR_COLORS` — unchanged
- Header (logo + product name + company name) — already implemented, unchanged
- `getFilteredMenuSections()` — pass-through, unchanged

---

## Test Updates Required

The following tests in `frontend/src/components/common/__tests__/Sidebar.test.tsx` will break and must be updated:

| Test | What breaks | Fix |
|------|------------|-----|
| `renders accounting as its own top-level section` (line 63) | Asserts section headers contain `'Accounting'` and `'Reports'` and checks their order. After the change, section headers are `Primary`, `Operations`, `Finance`, `Insights`, `Administration`. | Update to check for `'Finance'` and `'Insights'` and their order. |
| `renders sales, purchasing, and inventory directly under reports section` (line 96) | Calls `getSectionList('Reports')` and expects buttons named `Sales`, `Purchasing`, `Inventory` directly under it. After the change, the `Insights` section contains one `Reports` accordion button, not three. | Change `getSectionList('Reports')` to `getSectionList('Insights')`. Update to check that the Insights section contains a `Reports` accordion button, and when expanded it shows the report sub-group labels (Sales, Purchasing, etc.) rather than top-level accordion buttons. |
| `renders accounting reports as a parent group after accounting` (line 110) | Looks for `getByRole('button', { name: 'Reports' })` as a sibling of the `Accounting` button. After the change, there is no `Reports` button in the Finance section. | Delete this test or replace it with a test that verifies Trial Balance is accessible by expanding the Reports accordion under Insights. |

All other tests are unaffected by this change.

---

## Out of Scope

- Adding RBAC filtering to menu items
- Changing page headers/titles
- Changing any route
- Any icon redesign beyond the two duplicates
- Changing sidebar width, collapse behavior, or animation
