# Audit Log UI/UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Audit Logs page with a collapsible filter sidebar, inline expandable rows with a field-by-field diff viewer, an Analytics tab with charts, advanced filters with date presets and saved presets, entity drill-down navigation, and CSV/Excel/PDF export.

**Architecture:** Full redesign of `AuditLogsPage.tsx` into a three-zone layout (collapsible sidebar + tabbed content area). Existing Redux slice and API service are preserved and extended minimally. No new backend endpoints — one small backend addition: `ipAddress` filter in `QueryAuditLogsDto` and `findAll()`. Charts use the existing `chart.js` + `react-chartjs-2` stack. Export uses existing `xlsx`, `jspdf`, and `jspdf-autotable` packages.

**Tech Stack:** React 18, TypeScript, MUI v7, Redux Toolkit, chart.js + react-chartjs-2, xlsx, jspdf + jspdf-autotable, date-fns

---

## Overview of Files

**Create (new):**
- `frontend/src/pages/audit-logs/components/FilterSidebar.tsx`
- `frontend/src/pages/audit-logs/components/LogsTab.tsx`
- `frontend/src/pages/audit-logs/components/LogRow.tsx`
- `frontend/src/pages/audit-logs/components/DiffViewer.tsx`
- `frontend/src/pages/audit-logs/components/AnalyticsTab.tsx`
- `frontend/src/pages/audit-logs/components/ExportButton.tsx`

**Replace:**
- `frontend/src/pages/audit-logs/AuditLogsPage.tsx` — new top-level orchestrator

**Modify:**
- `frontend/src/store/slices/auditLogSlice.ts` — add `ipAddress` filter, `activeTab`, `sidebarCollapsed`
- `frontend/src/services/auditLogApi.ts` — add `ipAddress` to `AuditLogFilters`
- `backend/src/modules/audit-logs/dto/query-audit-logs.dto.ts` — add `ipAddress` field
- `backend/src/modules/audit-logs/services/audit-log.service.ts` — add `ipAddress` to `findAll()` query

---

## Task 1: Backend — Add `ipAddress` filter

**Files:**
- Modify: `backend/src/modules/audit-logs/dto/query-audit-logs.dto.ts`
- Modify: `backend/src/modules/audit-logs/services/audit-log.service.ts`

**Step 1: Add `ipAddress` to the DTO**

In `query-audit-logs.dto.ts`, after the `username` field (line 55), add:

```typescript
  @ApiPropertyOptional({ description: 'Filter by IP address', example: '192.168.1.1' })
  @IsOptional()
  @IsString()
  ipAddress?: string;
```

**Step 2: Add `ipAddress` to `findAll()` in the service**

In `audit-log.service.ts`, in the destructuring at line 82, add `ipAddress` to the list:

```typescript
    const {
      page = 1,
      limit = 20,
      search,
      action,
      entityType,
      entityId,
      userId,
      username,
      ipAddress,      // <-- add this
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;
```

Then after the `username` block (around line 124), add:

```typescript
    if (ipAddress) {
      where.ipAddress = ipAddress;
    }
```

**Step 3: Run backend tests to confirm no breakage**

```bash
cd backend && npx jest src/modules/audit-logs --no-coverage
```

Expected: all pass (or no tests exist for this file — that's fine, move on).

**Step 4: Commit**

```bash
git add backend/src/modules/audit-logs/dto/query-audit-logs.dto.ts \
        backend/src/modules/audit-logs/services/audit-log.service.ts
git commit -m "feat(audit-logs): add ipAddress filter to query DTO and service"
```

---

## Task 2: Frontend API & Redux — extend with `ipAddress`, `activeTab`, `sidebarCollapsed`

**Files:**
- Modify: `frontend/src/services/auditLogApi.ts`
- Modify: `frontend/src/store/slices/auditLogSlice.ts`

**Step 1: Add `ipAddress` to `AuditLogFilters` in `auditLogApi.ts`**

After line 16 (`sortOrder?: 'ASC' | 'DESC'`), add:

```typescript
  ipAddress?: string
```

**Step 2: Extend Redux state in `auditLogSlice.ts`**

Replace the `filters` type in `AuditLogState` (lines 17–27) with:

```typescript
  filters: {
    search: string
    action?: AuditAction
    entityType?: string
    entityId?: string
    userId?: string
    username?: string
    ipAddress?: string
    startDate?: string
    endDate?: string
  }
  activeTab: 'logs' | 'analytics'
  sidebarCollapsed: boolean
```

**Step 3: Add initial state values**

In `initialState` (after `filters: { search: '' }`), add:

```typescript
  activeTab: 'logs' as const,
  sidebarCollapsed: false,
```

**Step 4: Add reducers**

In the `reducers` object, add:

```typescript
    setActiveTab: (state, action: PayloadAction<'logs' | 'analytics'>) => {
      state.activeTab = action.payload
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload
    },
```

**Step 5: Export the new actions**

Add `setActiveTab` and `setSidebarCollapsed` to the existing exports at the bottom of the file.

**Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: 0 errors (or only pre-existing errors unrelated to audit logs).

**Step 7: Commit**

```bash
git add frontend/src/services/auditLogApi.ts \
        frontend/src/store/slices/auditLogSlice.ts
git commit -m "feat(audit-logs): extend filters with ipAddress, add activeTab/sidebarCollapsed state"
```

---

## Task 3: `DiffViewer` component

**Files:**
- Create: `frontend/src/pages/audit-logs/components/DiffViewer.tsx`

**What it does:** Given `oldValues` and `newValues` (both `Record<string, unknown> | null`), renders a table showing:
- Changed fields: old value (red background) → new value (green background)
- Added fields (in `newValues` but not `oldValues`): new value (green)
- Removed fields (in `oldValues` but not `newValues`): old value (red)
- For CREATE with only `newValues`: single column "Values"
- For DELETE with only `oldValues`: single column "Values"

**Step 1: Create the file**

```tsx
import React from 'react'
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'

interface DiffViewerProps {
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'object') return JSON.stringify(val, null, 2)
  return String(val)
}

const DiffViewer: React.FC<DiffViewerProps> = ({ oldValues, newValues }) => {
  // Single-side: CREATE (newValues only) or DELETE (oldValues only)
  if (!oldValues && newValues) {
    return (
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell><strong>Field</strong></TableCell>
            <TableCell sx={{ bgcolor: 'success.light' }}><strong>Value</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(newValues).map(([key, val]) => (
            <TableRow key={key}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{key}</TableCell>
              <TableCell sx={{ bgcolor: 'success.light', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {formatValue(val)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (oldValues && !newValues) {
    return (
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell><strong>Field</strong></TableCell>
            <TableCell sx={{ bgcolor: 'error.light' }}><strong>Value</strong></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.entries(oldValues).map(([key, val]) => (
            <TableRow key={key}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{key}</TableCell>
              <TableCell sx={{ bgcolor: 'error.light', fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {formatValue(val)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (!oldValues && !newValues) {
    return <Typography variant="body2" color="text.secondary">No value changes recorded.</Typography>
  }

  // Both sides: show diff
  const allKeys = Array.from(new Set([...Object.keys(oldValues!), ...Object.keys(newValues!)]))

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell><strong>Field</strong></TableCell>
          <TableCell sx={{ bgcolor: 'error.light' }}><strong>Old Value</strong></TableCell>
          <TableCell sx={{ bgcolor: 'success.light' }}><strong>New Value</strong></TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {allKeys.map((key) => {
          const oldVal = oldValues![key]
          const newVal = newValues![key]
          const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal)
          return (
            <TableRow key={key} sx={{ opacity: changed ? 1 : 0.45 }}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{key}</TableCell>
              <TableCell sx={{ bgcolor: changed ? 'error.light' : undefined, fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {formatValue(oldVal)}
              </TableCell>
              <TableCell sx={{ bgcolor: changed ? 'success.light' : undefined, fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {formatValue(newVal)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default DiffViewer
```

**Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "audit-logs" | head -20
```

Expected: 0 errors in this file.

**Step 3: Commit**

```bash
git add frontend/src/pages/audit-logs/components/DiffViewer.tsx
git commit -m "feat(audit-logs): add DiffViewer component for field-by-field change comparison"
```

---

## Task 4: `LogRow` component (expandable row with diff + drill-down)

**Files:**
- Create: `frontend/src/pages/audit-logs/components/LogRow.tsx`

**What it does:** Renders one `<TableRow>` that expands on click to show `DiffViewer`, IP/browser info, and entity drill-down link.

**Entity navigation map** (derives link from `entityType`):

| entityType | Route template |
|---|---|
| Product | `/inventory/products/:id/edit` |
| Category | `/inventory/categories` |
| StockAdjustment | `/inventory/stock-adjustments/:id/edit` |
| Customer | `/sales/customers` |
| Order / SalesOrder | `/sales/orders/:id/edit` |
| Invoice | `/sales/invoices` |
| Supplier | `/purchasing/suppliers` |
| PurchaseOrder | `/purchasing/orders/:id/edit` |
| Account | `/accounting/chart-of-accounts` |
| JournalEntry | `/accounting/journal-entries/:id` |

**Step 1: Create the file**

```tsx
import React, { useState } from 'react'
import {
  TableRow, TableCell, Chip, Box, Typography, Collapse,
  IconButton, Link, Divider, Stack,
} from '@mui/material'
import { KeyboardArrowDown, KeyboardArrowRight, OpenInNew } from '@mui/icons-material'
import { format } from 'date-fns'
import type { AuditLog } from '@/types'
import DiffViewer from './DiffViewer'

interface LogRowProps {
  log: AuditLog
}

function getActionColor(action: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' {
  switch (action) {
    case 'CREATE': return 'success'
    case 'UPDATE': return 'info'
    case 'DELETE': case 'BULK_DELETE': return 'error'
    case 'RESTORE': case 'BULK_RESTORE': return 'warning'
    case 'EXPORT': case 'IMPORT': return 'primary'
    default: return 'default'
  }
}

function getEntityLink(entityType: string, entityId?: string | null): string | null {
  const id = entityId
  const map: Record<string, string> = {
    Product: id ? `/inventory/products/${id}/edit` : '/inventory/products',
    Category: '/inventory/categories',
    StockAdjustment: id ? `/inventory/stock-adjustments/${id}/edit` : '/inventory/stock-adjustments',
    Customer: '/sales/customers',
    Order: id ? `/sales/orders/${id}/edit` : '/sales/orders',
    SalesOrder: id ? `/sales/orders/${id}/edit` : '/sales/orders',
    Invoice: '/sales/invoices',
    Supplier: '/purchasing/suppliers',
    PurchaseOrder: id ? `/purchasing/orders/${id}/edit` : '/purchasing/orders',
    Account: '/accounting/chart-of-accounts',
    JournalEntry: id ? `/accounting/journal-entries/${id}` : '/accounting/journal-entries',
  }
  return map[entityType] ?? null
}

function parseUserAgent(ua?: string | null): string {
  if (!ua) return 'Unknown'
  const browsers = [
    [/Chrome\/(\S+)/, 'Chrome'],
    [/Firefox\/(\S+)/, 'Firefox'],
    [/Safari\/(\S+)/, 'Safari'],
    [/Edge\/(\S+)/, 'Edge'],
  ] as [RegExp, string][]
  const os = [
    [/Windows NT/, 'Windows'],
    [/Mac OS X/, 'macOS'],
    [/Linux/, 'Linux'],
    [/Android/, 'Android'],
    [/iPhone|iPad/, 'iOS'],
  ] as [RegExp, string][]

  const browser = browsers.find(([re]) => re.test(ua))
  const operatingSystem = os.find(([re]) => re.test(ua))
  const parts = [browser?.[1], operatingSystem?.[1]].filter(Boolean)
  return parts.length ? parts.join(' / ') : 'Unknown'
}

const LogRow: React.FC<LogRowProps> = ({ log }) => {
  const [expanded, setExpanded] = useState(false)
  const entityLink = getEntityLink(log.entityType, log.entityId)
  const hasDiff = log.oldValues || log.newValues

  return (
    <>
      <TableRow
        hover
        onClick={() => setExpanded((v) => !v)}
        sx={{ cursor: 'pointer', '& > *': { borderBottom: expanded ? 'none' : undefined } }}
      >
        <TableCell sx={{ width: 32, p: 0.5 }}>
          <IconButton size="small">
            {expanded ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
          </IconButton>
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          {format(new Date(log.createdAt), 'MMM dd, yyyy HH:mm:ss')}
        </TableCell>
        <TableCell>
          <Chip label={log.action} color={getActionColor(log.action)} size="small" />
        </TableCell>
        <TableCell>{log.entityType}</TableCell>
        <TableCell>
          <Typography variant="body2">{log.username || log.userId}</Typography>
          {log.username && (
            <Typography variant="caption" color="text.secondary">{log.userId}</Typography>
          )}
        </TableCell>
        <TableCell sx={{ maxWidth: 360 }}>
          <Typography variant="body2" noWrap>{log.description}</Typography>
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      <TableRow>
        <TableCell colSpan={6} sx={{ p: 0, border: expanded ? undefined : 'none' }}>
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ p: 2, bgcolor: 'background.default' }}>
              {/* Metadata strip */}
              <Stack direction="row" spacing={3} sx={{ mb: 2 }} flexWrap="wrap">
                {log.ipAddress && (
                  <Typography variant="caption" color="text.secondary">
                    IP: <strong>{log.ipAddress}</strong>
                  </Typography>
                )}
                {log.userAgent && (
                  <Typography variant="caption" color="text.secondary">
                    Browser: <strong>{parseUserAgent(log.userAgent)}</strong>
                  </Typography>
                )}
                {log.entityId && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    Entity ID: {log.entityId}
                  </Typography>
                )}
                {entityLink && (
                  <Link
                    href={entityLink}
                    variant="caption"
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Go to {log.entityType} <OpenInNew sx={{ fontSize: 12 }} />
                  </Link>
                )}
              </Stack>

              <Divider sx={{ mb: 2 }} />

              {/* Diff viewer */}
              {hasDiff ? (
                <DiffViewer oldValues={log.oldValues as any} newValues={log.newValues as any} />
              ) : (
                <Typography variant="body2" color="text.secondary">{log.description}</Typography>
              )}

              {/* Metadata */}
              {log.metadata && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Metadata
                  </Typography>
                  <Box component="pre" sx={{ fontSize: '0.75rem', mt: 0.5, overflow: 'auto' }}>
                    {JSON.stringify(log.metadata, null, 2)}
                  </Box>
                </Box>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  )
}

export default LogRow
```

**Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "LogRow\|log-row\|audit-logs" | head -20
```

Expected: 0 errors.

**Step 3: Commit**

```bash
git add frontend/src/pages/audit-logs/components/LogRow.tsx
git commit -m "feat(audit-logs): add LogRow with inline expand, diff viewer, and entity drill-down"
```

---

## Task 5: `LogsTab` component

**Files:**
- Create: `frontend/src/pages/audit-logs/components/LogsTab.tsx`

**What it does:** Renders the full table of audit logs using `LogRow`, with pagination. Receives logs, pagination state, and loading/error from props (no direct Redux in this component).

**Step 1: Create the file**

```tsx
import React from 'react'
import {
  Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, CircularProgress, Typography, Alert,
} from '@mui/material'
import type { AuditLog } from '@/types'
import LogRow from './LogRow'

interface LogsTabProps {
  logs: AuditLog[]
  loading: boolean
  error: string | null
  total: number
  page: number          // 1-based
  limit: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
}

const LogsTab: React.FC<LogsTabProps> = ({
  logs, loading, error, total, page, limit, onPageChange, onLimitChange,
}) => {
  return (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 32 }} />
                <TableCell>Date & Time</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Entity Type</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography variant="body2" color="text.secondary">
                      No audit logs found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => <LogRow key={log.id} log={log} />)
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={total}
          rowsPerPage={limit}
          page={page - 1}
          onPageChange={(_e, p) => onPageChange(p + 1)}
          onRowsPerPageChange={(e) => onLimitChange(parseInt(e.target.value, 10))}
        />
      </Paper>
    </>
  )
}

export default LogsTab
```

**Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "LogsTab\|audit-logs" | head -20
```

**Step 3: Commit**

```bash
git add frontend/src/pages/audit-logs/components/LogsTab.tsx
git commit -m "feat(audit-logs): add LogsTab component"
```

---

## Task 6: `AnalyticsTab` component

**Files:**
- Create: `frontend/src/pages/audit-logs/components/AnalyticsTab.tsx`

**What it does:** Renders 4 charts using `chart.js` + `react-chartjs-2`:
1. Activity over time (bar chart, grouped by day — using `byAction` from statistics as a proxy since the statistics endpoint doesn't return time-series; show a bar per action with count)
2. Actions breakdown (doughnut chart)
3. Top Users (horizontal bar)
4. Activity by Entity Type (horizontal bar)

**Note:** The existing `/audit-logs/statistics` endpoint doesn't provide time-series data. For the "Activity Over Time" chart, show `byAction` data as a vertical bar chart labeled by action name. This is honest given the available API — do not fabricate time-series data.

**Step 1: Create the file**

```tsx
import React from 'react'
import {
  Box, Paper, Typography, GridLegacy as Grid, CircularProgress,
} from '@mui/material'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, ArcElement,
  Title, Tooltip, Legend,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import type { AuditLogStatistics } from '@/services/auditLogApi'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

const ACTION_COLORS: Record<string, string> = {
  CREATE: '#4caf50',
  UPDATE: '#2196f3',
  DELETE: '#f44336',
  RESTORE: '#ff9800',
  BULK_DELETE: '#e91e63',
  BULK_RESTORE: '#ff5722',
  EXPORT: '#9c27b0',
  IMPORT: '#00bcd4',
}

interface AnalyticsTabProps {
  statistics: AuditLogStatistics | null
  loading: boolean
}

const AnalyticsTab: React.FC<AnalyticsTabProps> = ({ statistics, loading }) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!statistics) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No statistics available.
      </Typography>
    )
  }

  const actionLabels = statistics.byAction.map((a) => a.action)
  const actionCounts = statistics.byAction.map((a) => Number(a.count))
  const actionColors = actionLabels.map((l) => ACTION_COLORS[l] ?? '#9e9e9e')

  const entityLabels = statistics.byEntityType.map((e) => e.entityType)
  const entityCounts = statistics.byEntityType.map((e) => Number(e.count))

  const userLabels = statistics.topUsers.map((u) => u.username || u.userId)
  const userCounts = statistics.topUsers.map((u) => Number(u.count))

  const barOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { font: { size: 11 } } } },
  }

  const horizontalBarOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { font: { size: 11 } } } },
  }

  return (
    <Grid container spacing={3}>
      {/* Actions Breakdown */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Actions Breakdown
          </Typography>
          <Doughnut
            data={{
              labels: actionLabels,
              datasets: [{
                data: actionCounts,
                backgroundColor: actionColors,
                borderWidth: 1,
              }],
            }}
            options={{ responsive: true, plugins: { legend: { position: 'right' } } }}
          />
        </Paper>
      </Grid>

      {/* Activity by Action (bar) */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Activity by Action
          </Typography>
          <Bar
            data={{
              labels: actionLabels,
              datasets: [{
                label: 'Count',
                data: actionCounts,
                backgroundColor: actionColors,
              }],
            }}
            options={barOptions}
          />
        </Paper>
      </Grid>

      {/* Top Users */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Top Users
          </Typography>
          <Bar
            data={{
              labels: userLabels,
              datasets: [{
                label: 'Actions',
                data: userCounts,
                backgroundColor: '#2196f3',
              }],
            }}
            options={horizontalBarOptions}
          />
        </Paper>
      </Grid>

      {/* Activity by Entity Type */}
      <Grid item xs={12} md={6}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Activity by Entity Type
          </Typography>
          <Bar
            data={{
              labels: entityLabels,
              datasets: [{
                label: 'Count',
                data: entityCounts,
                backgroundColor: '#9c27b0',
              }],
            }}
            options={horizontalBarOptions}
          />
        </Paper>
      </Grid>
    </Grid>
  )
}

export default AnalyticsTab
```

**Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "AnalyticsTab\|audit-logs" | head -20
```

**Step 3: Commit**

```bash
git add frontend/src/pages/audit-logs/components/AnalyticsTab.tsx
git commit -m "feat(audit-logs): add AnalyticsTab with chart.js charts"
```

---

## Task 7: `ExportButton` component

**Files:**
- Create: `frontend/src/pages/audit-logs/components/ExportButton.tsx`

**What it does:** A dropdown button (CSV / Excel / PDF). Uses `xlsx` for CSV/Excel, `jspdf` + `jspdf-autotable` for PDF. Receives all logs already fetched (up to 10,000 max — the caller handles fetching all pages if needed; for now export the current page's data and note this limitation with a TODO comment).

**Step 1: Create the file**

```tsx
import React, { useState } from 'react'
import {
  Button, Menu, MenuItem, CircularProgress,
} from '@mui/material'
import { GetApp, KeyboardArrowDown } from '@mui/icons-material'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import type { AuditLog } from '@/types'

interface ExportButtonProps {
  logs: AuditLog[]
  disabled?: boolean
}

const COLUMNS = ['Date', 'Action', 'Entity Type', 'Entity ID', 'User', 'Description', 'IP Address']

function toRows(logs: AuditLog[]) {
  return logs.map((log) => [
    format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss'),
    log.action,
    log.entityType,
    log.entityId ?? '',
    log.username || log.userId,
    log.description,
    log.ipAddress ?? '',
  ])
}

const ExportButton: React.FC<ExportButtonProps> = ({ logs, disabled }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [exporting, setExporting] = useState(false)
  const open = Boolean(anchorEl)

  const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)
  const handleClose = () => setAnchorEl(null)

  const exportCSV = () => {
    handleClose()
    const rows = toRows(logs)
    const ws = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs')
    XLSX.writeFile(wb, `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`, { bookType: 'csv' })
  }

  const exportExcel = () => {
    handleClose()
    const rows = toRows(logs)
    const ws = XLSX.utils.aoa_to_sheet([COLUMNS, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Logs')
    XLSX.writeFile(wb, `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
  }

  const exportPDF = () => {
    handleClose()
    setExporting(true)
    try {
      const doc = new jsPDF({ orientation: 'landscape' })
      doc.setFontSize(14)
      doc.text('Audit Logs', 14, 15)
      doc.setFontSize(10)
      doc.text(`Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 22)
      autoTable(doc, {
        head: [COLUMNS],
        body: toRows(logs),
        startY: 28,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [33, 150, 243] },
      })
      doc.save(`audit-logs-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={exporting ? <CircularProgress size={16} /> : <GetApp />}
        endIcon={<KeyboardArrowDown />}
        onClick={handleOpen}
        disabled={disabled || exporting || logs.length === 0}
      >
        Export
      </Button>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuItem onClick={exportCSV}>Export as CSV</MenuItem>
        <MenuItem onClick={exportExcel}>Export as Excel (.xlsx)</MenuItem>
        <MenuItem onClick={exportPDF}>Export as PDF</MenuItem>
      </Menu>
    </>
  )
}

export default ExportButton
```

**Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "ExportButton\|audit-logs" | head -20
```

**Step 3: Commit**

```bash
git add frontend/src/pages/audit-logs/components/ExportButton.tsx
git commit -m "feat(audit-logs): add ExportButton for CSV/Excel/PDF export"
```

---

## Task 8: `FilterSidebar` component

**Files:**
- Create: `frontend/src/pages/audit-logs/components/FilterSidebar.tsx`

**What it does:**
- Collapsible sidebar (uses `sidebarCollapsed` from Redux; persist open/closed state to `localStorage` under key `audit-logs-sidebar-collapsed`)
- Filter controls: search (text), action (multi-select chips), entity type (autocomplete from statistics), user (text), IP address (text), date range (presets + custom pickers)
- Saved presets: stored in `localStorage` under key `audit-logs-filter-presets`
- Buttons: Apply, Save Preset, Clear

**Date presets:** Today, Yesterday, Last 7 days, Last 30 days, This month, Custom

**Step 1: Create the file**

```tsx
import React, { useEffect, useState } from 'react'
import {
  Box, Button, Chip, Collapse, Divider, IconButton, MenuItem,
  Paper, Stack, TextField, Tooltip, Typography, Autocomplete,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import {
  ChevronLeft, ChevronRight, FilterList, Save, Clear,
} from '@mui/icons-material'
import { format, subDays, startOfMonth } from 'date-fns'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  setFilters, clearFilters, setSidebarCollapsed,
} from '@/store/slices/auditLogSlice'
import { AuditAction } from '@/types'

const STORAGE_KEY_COLLAPSED = 'audit-logs-sidebar-collapsed'
const STORAGE_KEY_PRESETS = 'audit-logs-filter-presets'

interface FilterPreset {
  name: string
  filters: Record<string, string>
}

const DATE_PRESETS = [
  { label: 'Today', getValue: () => ({ startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Yesterday', getValue: () => ({ startDate: format(subDays(new Date(), 1), 'yyyy-MM-dd'), endDate: format(subDays(new Date(), 1), 'yyyy-MM-dd') }) },
  { label: 'Last 7 days', getValue: () => ({ startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Last 30 days', getValue: () => ({ startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This month', getValue: () => ({ startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Custom', getValue: () => ({}) },
]

interface FilterSidebarProps {
  entityTypes: string[]
  onApply: () => void
}

const FilterSidebar: React.FC<FilterSidebarProps> = ({ entityTypes, onApply }) => {
  const dispatch = useAppDispatch()
  const { filters, sidebarCollapsed } = useAppSelector((state) => state.auditLogs)

  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>(null)

  // Load saved presets and sidebar state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY_PRESETS)
    if (stored) setPresets(JSON.parse(stored))
    const collapsed = localStorage.getItem(STORAGE_KEY_COLLAPSED)
    if (collapsed !== null) dispatch(setSidebarCollapsed(collapsed === 'true'))
  }, [])

  const handleCollapse = (val: boolean) => {
    dispatch(setSidebarCollapsed(val))
    localStorage.setItem(STORAGE_KEY_COLLAPSED, String(val))
  }

  const handleFilter = (patch: Record<string, string | undefined>) => {
    dispatch(setFilters(patch as any))
  }

  const handleDatePreset = (label: string) => {
    const preset = DATE_PRESETS.find((p) => p.label === label)
    if (!preset) return
    setActiveDatePreset(label)
    if (label !== 'Custom') {
      const { startDate, endDate } = preset.getValue()
      dispatch(setFilters({ startDate, endDate }))
    }
  }

  const handleClear = () => {
    dispatch(clearFilters())
    setActiveDatePreset(null)
    onApply()
  }

  const handleSavePreset = () => {
    const updated = [...presets, { name: presetName, filters: filters as any }]
    setPresets(updated)
    localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(updated))
    setSaveDialogOpen(false)
    setPresetName('')
  }

  const handleLoadPreset = (preset: FilterPreset) => {
    dispatch(clearFilters())
    dispatch(setFilters(preset.filters as any))
  }

  const handleDeletePreset = (name: string) => {
    const updated = presets.filter((p) => p.name !== name)
    setPresets(updated)
    localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(updated))
  }

  if (sidebarCollapsed) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 1 }}>
        <Tooltip title="Expand filters" placement="right">
          <IconButton onClick={() => handleCollapse(false)}>
            <ChevronRight />
          </IconButton>
        </Tooltip>
        <FilterList sx={{ color: 'text.secondary', mt: 1 }} />
      </Box>
    )
  }

  return (
    <Paper sx={{ p: 2, height: '100%', minWidth: 240 }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          <FilterList sx={{ mr: 0.5, fontSize: 18, verticalAlign: 'middle' }} />
          Filters
        </Typography>
        <Tooltip title="Collapse sidebar">
          <IconButton size="small" onClick={() => handleCollapse(true)}>
            <ChevronLeft />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Saved presets */}
      {presets.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Saved Presets
          </Typography>
          <Stack spacing={0.5} sx={{ mb: 2, mt: 0.5 }}>
            {presets.map((p) => (
              <Stack key={p.name} direction="row" justifyContent="space-between" alignItems="center">
                <Button size="small" variant="text" onClick={() => handleLoadPreset(p)} sx={{ textAlign: 'left', justifyContent: 'flex-start' }}>
                  {p.name}
                </Button>
                <IconButton size="small" onClick={() => handleDeletePreset(p.name)} title="Delete preset">
                  <Clear fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
          <Divider sx={{ mb: 2 }} />
        </>
      )}

      {/* Search */}
      <TextField
        fullWidth size="small" label="Search description"
        value={filters.search || ''}
        onChange={(e) => handleFilter({ search: e.target.value })}
        sx={{ mb: 2 }}
      />

      {/* Action chips */}
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Action</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, mb: 2 }}>
        {Object.values(AuditAction).map((a) => (
          <Chip
            key={a}
            label={a}
            size="small"
            clickable
            color={filters.action === a ? 'primary' : 'default'}
            onClick={() => handleFilter({ action: filters.action === a ? undefined : a })}
          />
        ))}
      </Box>

      {/* Entity Type */}
      <Autocomplete
        freeSolo
        size="small"
        options={entityTypes}
        value={filters.entityType || ''}
        onInputChange={(_e, val) => handleFilter({ entityType: val })}
        renderInput={(params) => <TextField {...params} label="Entity Type" />}
        sx={{ mb: 2 }}
      />

      {/* User */}
      <TextField
        fullWidth size="small" label="Username"
        value={filters.username || ''}
        onChange={(e) => handleFilter({ username: e.target.value })}
        sx={{ mb: 2 }}
      />

      {/* IP Address */}
      <TextField
        fullWidth size="small" label="IP Address"
        value={(filters as any).ipAddress || ''}
        onChange={(e) => handleFilter({ ipAddress: e.target.value })}
        sx={{ mb: 2 }}
      />

      {/* Date range presets */}
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>Date Range</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, mb: 1 }}>
        {DATE_PRESETS.map((p) => (
          <Chip
            key={p.label}
            label={p.label}
            size="small"
            clickable
            color={activeDatePreset === p.label ? 'primary' : 'default'}
            onClick={() => handleDatePreset(p.label)}
          />
        ))}
      </Box>

      {(activeDatePreset === 'Custom' || (!activeDatePreset && (filters.startDate || filters.endDate))) && (
        <Stack spacing={1} sx={{ mb: 2 }}>
          <TextField
            fullWidth size="small" type="date" label="Start Date"
            value={filters.startDate || ''}
            onChange={(e) => handleFilter({ startDate: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth size="small" type="date" label="End Date"
            value={filters.endDate || ''}
            onChange={(e) => handleFilter({ endDate: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />
        </Stack>
      )}

      {/* Action buttons */}
      <Divider sx={{ my: 2 }} />
      <Stack spacing={1}>
        <Button variant="contained" fullWidth onClick={onApply}>Apply</Button>
        <Button variant="outlined" fullWidth startIcon={<Save />} onClick={() => setSaveDialogOpen(true)}>
          Save Preset
        </Button>
        <Button variant="text" fullWidth startIcon={<Clear />} onClick={handleClear}>
          Clear All
        </Button>
      </Stack>

      {/* Save preset dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save Filter Preset</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth size="small" label="Preset name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePreset} disabled={!presetName.trim()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

export default FilterSidebar
```

**Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "FilterSidebar\|audit-logs" | head -20
```

**Step 3: Commit**

```bash
git add frontend/src/pages/audit-logs/components/FilterSidebar.tsx
git commit -m "feat(audit-logs): add FilterSidebar with date presets and saved presets"
```

---

## Task 9: Rewrite `AuditLogsPage.tsx`

**Files:**
- Replace: `frontend/src/pages/audit-logs/AuditLogsPage.tsx`

**What it does:** Top-level orchestrator. Three-zone layout: sidebar + tab content area. Fetches logs and statistics. Passes data down to `FilterSidebar`, `LogsTab`, `AnalyticsTab`, `ExportButton`.

**Step 1: Replace the file completely**

```tsx
import React, { useEffect } from 'react'
import {
  Box, Typography, Tabs, Tab, Stack,
} from '@mui/material'
import { History as AuditIcon } from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchAuditLogs,
  fetchAuditLogStatistics,
  setPage,
  setLimit,
  setActiveTab,
} from '@/store/slices/auditLogSlice'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
import FilterSidebar from './components/FilterSidebar'
import LogsTab from './components/LogsTab'
import AnalyticsTab from './components/AnalyticsTab'
import ExportButton from './components/ExportButton'

const AuditLogsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const {
    auditLogs, statistics, loading, error,
    pagination, filters, activeTab, sidebarCollapsed,
  } = useAppSelector((state) => state.auditLogs)

  const fetchLogs = () => {
    dispatch(fetchAuditLogs({
      page: pagination.page,
      limit: pagination.limit,
      ...filters,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    }))
  }

  const fetchStats = () => {
    dispatch(fetchAuditLogStatistics({
      startDate: filters.startDate,
      endDate: filters.endDate,
    }))
  }

  useEffect(() => {
    fetchLogs()
  }, [pagination.page, pagination.limit])

  useEffect(() => {
    fetchStats()
  }, [filters.startDate, filters.endDate])

  const handleApply = () => {
    dispatch(setPage(1))
    fetchLogs()
    fetchStats()
  }

  const handlePageChange = (page: number) => {
    dispatch(setPage(page))
  }

  const handleLimitChange = (limit: number) => {
    dispatch(setLimit(limit))
    dispatch(setPage(1))
  }

  const entityTypes = statistics?.byEntityType.map((e) => e.entityType) ?? []

  return (
    <Box sx={{ display: 'flex', height: '100%', gap: 2, p: 3 }}>
      {/* Sidebar */}
      <Box sx={{ flexShrink: 0, width: sidebarCollapsed ? 48 : 260, transition: 'width 0.2s' }}>
        <FilterSidebar entityTypes={entityTypes} onApply={handleApply} />
      </Box>

      {/* Main content */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography
              variant={TYPOGRAPHY_STYLES.pageHeader.variant}
              sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, display: 'flex', alignItems: 'center', gap: 1 }}
            >
              <AuditIcon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
              Audit Logs
            </Typography>
            <Typography variant="body2" color="text.secondary">
              View all system changes and user activities
            </Typography>
          </Box>
          <ExportButton logs={auditLogs} disabled={loading} />
        </Stack>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_e, val) => dispatch(setActiveTab(val))}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Logs" value="logs" />
          <Tab label="Analytics" value="analytics" />
        </Tabs>

        {/* Tab content */}
        {activeTab === 'logs' && (
          <LogsTab
            logs={auditLogs}
            loading={loading}
            error={error}
            total={pagination.total}
            page={pagination.page}
            limit={pagination.limit}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab statistics={statistics} loading={loading} />
        )}
      </Box>
    </Box>
  )
}

export default AuditLogsPage
```

**Step 2: TypeScript check — full**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: 0 errors (fix any that appear before moving on).

**Step 3: Run frontend tests**

```bash
cd frontend && npm run test -- --run 2>&1 | tail -20
```

Expected: all pass (the existing audit log tests, if any, should still pass).

**Step 4: Commit**

```bash
git add frontend/src/pages/audit-logs/AuditLogsPage.tsx
git commit -m "feat(audit-logs): full page redesign with sidebar, tabs, diff viewer, analytics, export"
```

---

## Task 10: Final verification

**Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1
```

Expected: 0 errors.

**Step 2: Backend test**

```bash
cd backend && npm run test -- --testPathPattern=audit-log --no-coverage 2>&1 | tail -20
```

**Step 3: Frontend lint**

```bash
cd frontend && npm run lint 2>&1 | tail -20
```

Fix any lint errors before proceeding.

**Step 4: Final commit if any lint fixes needed**

```bash
git add -p
git commit -m "fix(audit-logs): lint fixes"
```

**Step 5: Summary**

Verify these features work end-to-end (manual or with dev server):
- [ ] Sidebar collapses and state persists on refresh
- [ ] Filter by action chips works
- [ ] Date preset chips apply correct date range
- [ ] Save/load/delete preset works via localStorage
- [ ] Clicking a table row expands inline with diff viewer
- [ ] "Go to [Entity] →" link navigates correctly
- [ ] Analytics tab shows 4 charts
- [ ] Export CSV/Excel/PDF downloads correct file
- [ ] `ipAddress` filter sends param to backend (verify in browser network tab)
