# UI Design System Reference

This document defines UI standards for the ERP frontend. It is a living reference — rules live here, implementation history lives in `docs/superpowers/specs/`.

> **Note:** Prior to 2026-03-24 this file contained a dark theme color palette reference. That content has been superseded by the live theme implementation in `frontend/src/styles/theme.ts`.

---

## PageHeader

### Purpose

`PageHeader` is the standard page-level header component for all CRUD, list, and form pages. It provides a consistent title, optional subtitle, and up to two action buttons across all standard pages.

### Anatomy

```text
Title
Subtitle (optional)
                    [Secondary Action]  [Primary Action]
---------------------------------------------------------
```

### Props

| Prop | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| `title` | `string` | yes | - | Plain text only. No icons, counts, or dynamic values. |
| `subtitle` | `string` | no | - | Optional. See subtitle policy below. |
| `primaryAction` | `{ label, onClick, disabled? }` | no | - | Rendered as a contained button. |
| `secondaryAction` | `{ label, onClick, disabled? }` | no | - | Rendered as an outlined button. |
| `showDivider` | `boolean` | no | `true` | Set to `false` on form/create pages. |
| `children` | `ReactNode` | no | - | Escape hatch for complex cases only. |

### Action Rules

- Maximum 2 actions in the header: one primary, one secondary.
- If a page has more than 2 actions, the primary CTA goes in `primaryAction`, secondary in `secondaryAction`, and any remaining actions move to a toolbar or inline controls below the header.
- Do not add more actions by customizing `PageHeader`. If a page cannot fit within 2 actions without harming usability, defer it rather than extending the component.
- Permission-gated actions: pass `primaryAction={canDoThing ? { label: '...', onClick: ... } : undefined}` - do not render a disabled primary action for permission checks.

### Subtitle Policy

Subtitles are optional. Only add a subtitle where it adds clarity.

Required when: Page purpose is not immediately obvious from the title alone; user benefits from operational context.

Forbidden content:
- Dynamic values: counts, filter state, statuses, dates (for example `"14 pending orders"`, `"(filtered)"`)
- Redundant text that restates the title (for example Title: "Suppliers" / Subtitle: "Manage suppliers")
- Filler phrases: "This page allows you to...", "Here you can..."

Style: Short, stable, operational. Present-tense verb phrase describing what the page helps the user do.

```text
OK  "Manage accounting periods and year boundaries"
OK  "Configure default account assignments for transactions"
NO  "14 Pending Orders Found"
NO  "Manage Vendors"
```

### Do / Don't

Do:
- Use `PageHeader` for all standard CRUD, list, and form pages
- Keep titles concise, plain text, and stable
- Use at most one primary and one secondary action
- Write operational subtitles in plain English

Don't:
- Add icons to titles
- Include dynamic data in titles or subtitles
- Add more than 2 actions to the header
- Customize layout or spacing per page
- Force a subtitle if the title is self-explanatory

---

## PageHeader - When NOT to Use

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

If any item is unchecked, do not use `PageHeader` - define an appropriate pattern first.

---

## Deferred Pages

Some pages are not yet migrated to `PageHeader`. These pages are not rejected - they require pattern validation before migration.

> Deferred pages should not be force-fit into `PageHeader` until a suitable pattern is defined. Migration is only appropriate if the page can adopt `PageHeader` without introducing exceptions to layout, action constraints, or header composition.

See `docs/superpowers/specs/2026-03-24-page-header-phase3-design.md` for the full classification table.

---

## Future Expansion

This document will expand as new layout primitives are standardized. Planned additions:

- Filter Bar
- Table Toolbar / List Actions
- Form Layout
- Report & Dashboard Header Patterns
