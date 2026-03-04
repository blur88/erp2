# Audit Log UI/UX Redesign — Design Document

**Date**: 2026-03-04
**Status**: Approved

## Overview

Full redesign of the Audit Logs page (`/audit-logs`) with a new three-zone layout, inline expandable rows with a change diff viewer, an Analytics tab with charts, advanced sidebar filters with presets, entity drill-down navigation, and client-side export (CSV/Excel/PDF).

## Scope

UI/UX only. No changes to the audit log entity, existing endpoints, or how logs are created. One minor backend addition: `ipAddress` filter param.

## Layout

Three-zone layout replacing the current single-column page:

1. **Collapsible filter sidebar** (left) — persists collapsed/expanded state in localStorage
2. **Tab bar** (Logs | Analytics) in the content area
3. **Export button** (top-right) — applies current filters

## Section 1: Logs Tab

### Table
- Inline expandable rows (click row to expand in-place, no modal)
- Columns: Date/Time, Action (color chip), Entity Type (with drill-down link), User, Description

### Expanded Row
- **Diff viewer**: field-by-field comparison of `oldValues` vs `newValues`
  - Changed fields: highlight old (red) vs new (green)
  - Added fields (CREATE): single "Values" column in green
  - Deleted fields (DELETE): single "Values" column in red
- **Metadata strip**: IP address, parsed browser/OS from user agent (client-side parsing, no library needed)
- **Entity drill-down**: "Go to [EntityType] →" link — navigates to the record's detail/edit page in its module

### Entity Navigation Map
| entityType | Route |
|---|---|
| Product | `/inventory/products/:entityId` |
| Customer | `/sales/customers/:entityId` |
| Order | `/sales/orders/:entityId` |
| Supplier | `/purchasing/suppliers/:entityId` |
| PurchaseOrder | `/purchasing/orders/:entityId` |
| Account | `/accounting/chart-of-accounts/:entityId` |
| JournalEntry | `/accounting/journal-entries/:entityId` |

Unknown entity types show no link.

## Section 2: Analytics Tab

All charts react to the sidebar filters. Data sourced from existing `/audit-logs/statistics` endpoint.

### Charts (top to bottom)
1. **Activity Over Time** — line/bar chart, toggle: Day / Week / Month grouping
2. **Actions Breakdown** — donut chart (CREATE, UPDATE, DELETE, RESTORE, BULK_*, EXPORT, IMPORT)
3. **Top Users** — horizontal bar chart (top 10 users by activity)
4. **Activity by Entity Type** — horizontal bar chart

### Charting Library
Use **Recharts** — check if already in `frontend/package.json`; add if not. Fits MUI ecosystem, tree-shakeable.

## Section 3: Filter Sidebar

### Filters
| Filter | Control | Notes |
|---|---|---|
| Date range | Presets dropdown + custom pickers | Today, Yesterday, Last 7d, Last 30d, This month, Custom |
| Action | Multi-select chips | All `AuditAction` enum values |
| Entity Type | Autocomplete | Options populated from statistics endpoint |
| User | Text field | Searches username or userId |
| IP Address | Text field | New filter (requires backend change) |

### Saved Presets
- Save current filter state with a name → stored in localStorage
- Load/delete presets from a dropdown above the filter form
- No backend needed

### Filter Buttons
- **Apply** — triggers fetch
- **Save** — opens name dialog, saves to localStorage
- **Clear** — resets all filters

## Section 4: Export

Client-side only, no new backend endpoints.

| Format | Library | Notes |
|---|---|---|
| CSV | `xlsx` | |
| Excel (.xlsx) | `xlsx` | |
| PDF | `jsPDF` + `jspdf-autotable` | |

Export applies current filters. Max rows: 10,000 (configurable constant). Columns exported: Date, Action, Entity Type, Entity ID, User, Description, IP Address.

## Backend Change

**File**: `backend/src/modules/audit-logs/dto/query-audit-logs.dto.ts`
Add optional `ipAddress` string filter.

**File**: `backend/src/modules/audit-logs/services/audit-log.service.ts`
Add `WHERE ip_address = :ipAddress` condition in `findAll()` when param present.

## Component Structure

```
pages/audit-logs/
  AuditLogsPage.tsx          ← new top-level page (replaces current)
  components/
    FilterSidebar.tsx         ← collapsible sidebar with all filters
    LogsTab.tsx               ← table with expandable rows
    LogRow.tsx                ← single row + expanded diff view
    DiffViewer.tsx            ← field-by-field old/new comparison
    AnalyticsTab.tsx          ← charts layout
    ActivityChart.tsx         ← line/bar over time
    ActionsDonut.tsx          ← donut chart
    TopUsersChart.tsx         ← horizontal bar
    EntityTypeChart.tsx       ← horizontal bar
    ExportButton.tsx          ← dropdown with CSV/Excel/PDF actions
```

## State Management

Extend existing `auditLogSlice.ts`:
- Add `sidebarCollapsed: boolean`
- Add `activeTab: 'logs' | 'analytics'`
- Add `ipAddress` to filters state
- Saved presets read/written directly in `FilterSidebar.tsx` via localStorage (no Redux needed)

## Libraries to Add

| Library | Purpose |
|---|---|
| `recharts` | Charts (if not already present) |
| `xlsx` | CSV + Excel export |
| `jspdf` + `jspdf-autotable` | PDF export |

## Out of Scope

- Automatic audit logging across modules (separate effort)
- RBAC for audit log access
- Backend analytics endpoint changes (existing statistics endpoint is sufficient)
- IP geolocation
