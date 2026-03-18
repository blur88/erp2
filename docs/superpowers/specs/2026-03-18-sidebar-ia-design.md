# Sidebar Modernization — Information Architecture Design

**Issue:** #128
**Date:** 2026-03-18
**File:** `frontend/src/components/common/Sidebar.tsx`
**Scope:** `menuSections` restructure + label shortening + icon deduplication + Settings internal grouping

---

## Goal

Modernize the sidebar for better scanning speed and logical grouping without changing any routes, interaction mechanics, or page components.

---

## New Section Structure

Five sections replacing the current five (renaming, merging, and reordering):

| Section ID     | Label           | Top-level items              |
|----------------|-----------------|------------------------------|
| `primary`      | Primary         | Dashboard                    |
| `operations`   | Operations      | Sales, Purchasing, Inventory |
| `finance`      | Finance         | Accounting                   |
| `insights`     | Reports         | Reports                      |
| `administration` | Administration | Settings, Audit Logs         |

**Changes from current:**
- `main` → `primary`
- `accounting` loses its "Reports" child group
- `analytics` section is removed entirely
- New `insights` section with a single `reports` top-level item containing all 19 report links
- `system` → `administration`

---

## Reports Consolidation

All 19 report links move under one `reports` top-level item in the `insights` section. No new nesting level is added — report links are direct children of `reports`. Sub-group separation is rendered visually via `group` labels (see Interface Changes).

Four groups within the `reports` item, in this order:

**Sales** (9 items)
- Product Summary *(was: Sales by Product Summary)*
- Product Details *(was: Sales by Product Details)*
- Order Summary *(was: Sales Order Summary)*
- Order Profit *(was: Sales Order Profit Report)*
- Payment Summary *(was: Customer Payment Summary)*
- Payment by Order *(was: Customer Payment by Order)*
- Payment Details *(was: Customer Payment Details)*
- Order History *(was: Customer Order History)*
- Product Customers *(was: Product Customer Report)*

**Purchasing** (5 items)
- Order Summary *(was: Purchase Order Summary)*
- Order Details *(was: Purchase Order Details)*
- Order Status *(was: Purchase Order Status)*
- Payment Details *(was: Vendor Payment Details)*
- Vendor Products *(was: Vendor Product List)*

**Inventory** (5 items)
- Inventory Summary *(unchanged)*
- Historical Inventory *(unchanged)*
- Movement Summary *(was: Inventory Movement Summary)*
- Product Price List *(unchanged)*
- Product Cost Report *(unchanged)*

**Accounting** (5 items — moved from the `accounting` section)
- Trial Balance *(unchanged)*
- Balance Sheet *(unchanged)*
- Profit & Loss *(unchanged)*
- General Ledger *(unchanged)*
- Account Activity *(unchanged)*

All existing route paths (`/reports/sales/...`, `/accounting/reports/...`) are preserved exactly.

---

## Label Shortening Rule

Labels are shortened by removing the module prefix (e.g., "Sales", "Purchase", "Customer", "Vendor") when the group context makes it redundant. Full titles remain on page headers — no page changes needed.

The rule is applied consistently within each group. Labels must be distinct within their group.

---

## Settings Internal Grouping

Settings remains a single top-level item. Its 12 children are organized into three named groups rendered inside the expanded accordion and flyout only.

| Group    | Children |
|----------|----------|
| Business | Company, Inventory Costing, Regional, Price Lists, Payment Methods, Print Settings, Document Numbers |
| Access   | Users, Roles, Security |
| System   | Backup & Restore |

Order: operational screens first (Business), then access control (Access), then sensitive/destructive items last (System).

Group headers render only inside expanded Settings content. They never render in collapsed rail trigger state or as top-level siblings.

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
  group?: string          // NEW: visual group header trigger
  children?: MenuItem[]
}
```

The `group` field is used in two places:
1. Settings children — to render Business / Access / System headers inside the expanded accordion and flyout
2. Reports children — to render Sales / Purchasing / Inventory / Accounting headers inside the expanded accordion and flyout

**Render logic:** In `renderMenuItem` and `renderFlyoutItem`, when iterating over children, insert a small `Typography` group-label element before the first item whose `group` value differs from the previous item's `group` value (or is set for the first item). This is ~10–15 lines in each render function.

---

## Visual Hierarchy

- **Section labels** (`overline` typography, already implemented) are the primary hierarchy cue
- **Spacing** between sections carries the visual separation
- **One divider** is retained — before the Administration section only
- All other dividers are removed
- Row heights (44px top-level, 40px nested) are already correct — no changes needed

Spec wording: *Use spacing and section labels as the primary hierarchy cues; retain only one divider before Administration.*

---

## Icon Deduplication

Two duplicate icon usages in the current code are fixed in this pass:

| Item | Current icon | Replacement |
|------|-------------|-------------|
| Account Mappings | `AccountBalance` (same as Bank Reconciliation) | `AccountTree` or `TuneRounded` |
| General Ledger | `Description` (same as Journal Entries) | `LibraryBooks` or `MenuBook` |

No other icon changes. Full icon redesign is out of scope.

---

## What Does Not Change

- All route paths — unchanged
- All page components — unchanged
- Rail/collapsed mode behavior — unchanged
- Flyout mechanics (hover delay, Popper, Fade) — unchanged
- Active state detection — unchanged
- `SIDEBAR_COLORS` — unchanged
- Header (logo + product name + company name) — already implemented, unchanged
- `getFilteredMenuSections()` function — unchanged (no RBAC filtering needed)

---

## Out of Scope

- Adding RBAC filtering to menu items
- Changing page headers/titles
- Changing any route
- Any icon redesign beyond the two duplicates
- Changing sidebar width, collapse behavior, or animation
