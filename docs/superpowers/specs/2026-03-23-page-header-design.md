# PageHeader Component — Design Spec

**Issue:** #162
**Date:** 2026-03-23
**Status:** Approved

---

## Goal

Define the page header as a reusable layout primitive — not one-off per-page styling. Every page in the ERP should share the same structure, spacing, and action hierarchy. This spec covers Phase 1: creating the shared `PageHeader` component and validating it through a Sales module pilot.

---

## Scope

### Phase 1 (this issue)
- Create `frontend/src/components/common/PageHeader.tsx`
- Refactor the Sales module as a pilot to validate the component across page types:
  - Sales Orders (list page)
  - Invoices (list page — second validation target)
  - Customers (list page)
  - Create Sales Order (form page — no divider variant)
  - Sales dashboard/overview page only if it already uses the standard page shell

### Phase 2 (follow-on)
- Roll out to remaining CRUD modules (Inventory, Purchasing, Accounting, Settings)
- Handle tree/hierarchy pages (Categories, Chart of Accounts) as a separate concern — they may require edge-case handling

---

## Component API

```tsx
type PageHeaderAction = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
};

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  primaryAction?: PageHeaderAction;
  secondaryAction?: PageHeaderAction;
  showDivider?: boolean;       // default: true
  children?: React.ReactNode;  // escape hatch — not used in pilot
};
```

### Design rules

- **Max 2 actions.** This is intentional. The header communicates what the page is and what the main next action is — it is not a toolbar.
- **`children` is an escape hatch**, not a promoted pattern. Do not use it during the pilot. If needed later, it renders below the main title/action row.
- **`showDivider` defaults to `true`** so list/detail pages are consistent. Form/create pages should pass `showDivider={false}`.
- **`onClick` is optional** on actions — a button without an onClick should render and be clickable without crashing.

### What goes elsewhere

Pages that need more than 2 header actions should route those actions to:
- Table toolbar / filter bar (contextual table actions)
- Overflow/kebab menu (destructive or utility actions)
- Form action bar or sticky footer (form workflow: Save, Cancel, Save as Draft)

---

## Layout & Styling

### Structure

```
┌──────────────────────────────────────────────────────────────┐
│ Title                                   [Secondary] [Primary] │
│ Subtitle                                                      │
├──────────────────────────────────────────────────────────────┤  ← divider (conditional)
```

When `children` is provided:
```
│ Title                                   [Secondary] [Primary] │
│ Subtitle                                                      │
│ [children content]                                            │
├──────────────────────────────────────────────────────────────┤
```

### Spacing

| Token | Value | Purpose |
|---|---|---|
| Outer `mb` | `3` (24px) | Bottom margin — owned by the component |
| Outer `pb` | `2` (16px) | Padding above divider |
| Title→subtitle gap | `mt: 0.5` | Tight stack |
| Action gap | `gap: 1` (8px) | Between secondary and primary |
| Row gap | `gap: 2` | Between title block and actions |

### Typography (theme tokens)

| Element | Token | Override |
|---|---|---|
| Title | `variant="h5"` | `fontWeight: 600` always enforced |
| Subtitle | `variant="body2"` | `color: text.secondary` |

> Use `variant="h5"` but always enforce `fontWeight: 600` — do not rely on the theme's h5 weight being correct.

### Colors

- Title: `theme.palette.text.primary`
- Subtitle: `theme.palette.text.secondary`
- Divider: `borderBottom: 1px solid theme.palette.divider` — use the theme token, not hardcoded rgba

### Alignment

- Main row: `display: flex`, `justifyContent: space-between`, `alignItems: center`, `gap: 2`
- Default is `alignItems: center` — buttons align to the vertical center of the title block
- **Verify this visually during the pilot** — if multi-line titles cause misalignment, switch to `alignItems: flex-start`
- Left block: `minWidth: 0` to allow long subtitles to wrap cleanly without pushing actions out
- Actions block: `flexShrink: 0`, `display: flex`, `alignItems: center`, `gap: 1`
- Action order is always: secondary first, primary last

### Button variants

- Primary action: `variant="contained"`
- Secondary action: `variant="outlined"`

### Responsive behavior

At `xs` breakpoint (`theme.breakpoints.down('sm')`):
- Main row switches to `flexDirection: column`
- Actions align `alignSelf: flex-start` (do not stretch full width)
- Button order is preserved: secondary above primary

---

## Error Handling

None required — this is a pure presentational component with no async behavior.

Defensive rendering:
- If neither `primaryAction` nor `secondaryAction` is provided, the actions `Box` does not render (no empty right-side space)
- Optional `subtitle` collapses cleanly — no awkward gap

---

## Testing

File: `frontend/src/components/common/__tests__/PageHeader.test.tsx`

### Test cases

| # | Case |
|---|---|
| 1 | Renders title |
| 2 | Renders subtitle when provided |
| 3 | Does not render subtitle when omitted |
| 4 | Renders primary action button when provided |
| 5 | Renders secondary action button when provided |
| 6 | Calls `onClick` when primary button is clicked |
| 7 | Calls `onClick` when secondary button is clicked |
| 8 | Renders disabled primary button correctly |
| 9 | Renders disabled secondary button correctly |
| 10 | Does not render actions box when neither action is provided |
| 11 | Renders only primary button when only `primaryAction` is provided |
| 12 | Renders only secondary button when only `secondaryAction` is provided |
| 13 | Does not crash when button `onClick` is omitted |
| 14 | Shows divider by default |
| 15 | Hides divider when `showDivider={false}` |
| 16 | Renders `children` when provided |

### Approach

- **Behavior-based only** — no snapshots
- Find buttons by `role="button"` + accessible label, not by CSS class
- For divider presence/absence: apply `data-testid="page-header-divider"` to the outer header container only when `showDivider !== false` — not a separate visual element added for testing
- For `children` placement: assert render presence only, not exact spatial position

### Refactor validation

Existing Sales page unit tests passing unchanged is the acceptance criterion for the refactor. If a page's tests pass after swapping in `PageHeader`, the refactor is complete.

### Manual QA checklist (pilot)

- [ ] List page with 2 actions (Sales Orders)
- [ ] List page with 1 action only
- [ ] List page with no actions
- [ ] Create/form page with `showDivider={false}`
- [ ] Title only (no subtitle)
- [ ] Long subtitle — wraps without pushing actions
- [ ] Narrow viewport — actions stack below title

---

## Implementation Notes

- The component lives in `frontend/src/components/common/` alongside other shared layout primitives
- Do not export from a barrel index yet — import directly during the pilot
- Do not add icon support, color variants, href, or additional action props unless a real repeated need emerges across multiple pages
- After the pilot is validated, Phase 2 rollout follows the same refactor pattern: swap manual header markup for `<PageHeader>` with props
- Header action buttons must use `type="button"` to avoid accidental form submission when `PageHeader` is used inside a form page shell
- Subtitle may wrap to multiple lines when needed — do not truncate during the pilot unless a repeated need emerges
- When neither action is provided, the left content block still occupies the row naturally — do not leave an empty right-side wrapper placeholder

---

## What This Is Not

- Not a toolbar replacement
- Not a page shell / layout wrapper
- Not a form action bar
- Not a breadcrumb container
