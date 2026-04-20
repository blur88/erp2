# Chart of Accounts UI Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore visual polish and consistency to the Chart of Accounts page lost during the GenericListPage refactor (issue #395), aligning it with the sales page standard.

**Architecture:** Switch the COA page from the flat paginated endpoint to the hierarchy endpoint (flatten tree in page component via `useMemo`), migrate `ChartOfAccountsTable` to `EntityTable` with type-colored chips, and align the context header and workspace card styling to match `InvoiceContextHeader`/`InvoiceWorkspaceCard`.

**Tech Stack:** React 19, TypeScript, MUI v7, Vitest, RTK Query

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/common/EntityTable.tsx` | Add `raw?: boolean` to `ColumnConfig` |
| `frontend/src/pages/accounting/ChartOfAccountsPage.tsx` | Switch to hierarchy endpoint, flatten tree |
| `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx` | Rewrite using `EntityTable` |
| `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx` | Align styling to sales standard |
| `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx` | Align styling + add fields |
| `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` | Update mock to hierarchy endpoint |

---

### Task 1: Add `raw` flag to `EntityTable`'s `ColumnConfig`

**Files:**
- Modify: `frontend/src/components/common/EntityTable.tsx`

- [ ] **Step 1: Write the failing test**

Open `frontend/src/components/common/EntityTable.tsx` — there is no dedicated test file for it. The behavior is tested indirectly through page tests. We'll verify the change works by inspecting the DOM. Skip to Step 2.

- [ ] **Step 2: Add `raw` to `ColumnConfig` interface**

In `frontend/src/components/common/EntityTable.tsx`, find the `ColumnConfig` interface and add `raw`:

```tsx
export interface ColumnConfig<T> {
  key: string
  render: (row: T) => React.ReactNode
  width?: string | number
  raw?: boolean
}
```

- [ ] **Step 3: Update cell render to respect `raw`**

In the same file, find this block inside `EntityRow`:

```tsx
{columns.map((column) => (
  <TableCell key={column.key} width={column.width}>
    <Typography
      variant="body2"
      sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}
    >
      {column.render(row)}
    </Typography>
  </TableCell>
))}
```

Replace it with:

```tsx
{columns.map((column) => (
  <TableCell key={column.key} width={column.width}>
    {column.raw
      ? column.render(row)
      : (
          <Typography
            variant="body2"
            sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}
          >
            {column.render(row)}
          </Typography>
        )}
  </TableCell>
))}
```

- [ ] **Step 4: Run type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/EntityTable.tsx
git commit -m "feat(ui): add raw flag to EntityTable ColumnConfig for unwrapped cell rendering"
```

---

### Task 2: Update `ChartOfAccountsPage` to use hierarchy endpoint

**Files:**
- Modify: `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
- Modify: `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` with:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import ChartOfAccountsPage from '../ChartOfAccountsPage'

const mockedApi = vi.hoisted(() => ({
  useGetChartOfAccountsHierarchy: vi.fn(),
  useDeleteChartOfAccountMutation: vi.fn(),
  useSeedDefaultChartOfAccountsMutation: vi.fn(),
  useCreateChartOfAccountMutation: vi.fn(),
  useUpdateChartOfAccountMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)
vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/components/accounting/AccountMappingWarning', () => ({ default: () => null }))
vi.mock('@/components/accounting/DeletedAccountsDialog', () => ({ default: () => null }))

const mockAccount = {
  id: '1',
  code: '1000',
  name: 'Cash',
  type: 'ASSET',
  isActive: true,
  fullCode: '1000',
  isParent: false,
  currentBalance: 0,
  isCashEquivalent: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetChartOfAccountsHierarchy.mockReturnValue({
      data: [mockAccount],
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useDeleteChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useSeedDefaultChartOfAccountsMutation.mockReturnValue([vi.fn()])
    mockedApi.useCreateChartOfAccountMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateChartOfAccountMutation.mockReturnValue([vi.fn()])
  })

  it('renders page title', () => {
    render(<BrowserRouter><ChartOfAccountsPage /></BrowserRouter>)
    expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
  })

  it('renders account code from hierarchy data', () => {
    render(<BrowserRouter><ChartOfAccountsPage /></BrowserRouter>)
    expect(screen.getByText('1000')).toBeInTheDocument()
  })

  it('flattens nested children into table', () => {
    const parent = {
      ...mockAccount,
      id: '1',
      code: '1000',
      name: 'Cash',
      children: [{ ...mockAccount, id: '2', code: '1010', name: 'CIMB', children: [] }],
    }
    mockedApi.useGetChartOfAccountsHierarchy.mockReturnValue({
      data: [parent],
      isLoading: false,
      refetch: vi.fn(),
    })
    render(<BrowserRouter><ChartOfAccountsPage /></BrowserRouter>)
    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('1010')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: FAIL — `useGetChartOfAccountsHierarchy` is not called yet.

- [ ] **Step 3: Update `ChartOfAccountsPage.tsx`**

Replace the entire contents of `frontend/src/pages/accounting/ChartOfAccountsPage.tsx` with:

```tsx
import React, { useMemo } from 'react'

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetChartOfAccountsHierarchy } from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

import { ChartOfAccountContextHeader } from './components/ChartOfAccountContextHeader'
import { ChartOfAccountsDialogs } from './components/ChartOfAccountsDialogs'
import { ChartOfAccountsTable } from './components/ChartOfAccountsTable'
import { ChartOfAccountWorkspaceCard } from './components/ChartOfAccountWorkspaceCard'
import { useChartOfAccountsWorkspace } from './hooks/useChartOfAccountsWorkspace'

interface CoaFilters { search: string }
const filterConfig: FilterBarConfig<CoaFilters> = { search: { placeholder: 'Search by code or name...' }, fields: [], defaults: { search: '' } }

const ChartOfAccountsPage: React.FC = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: hierarchyData, isLoading, error, refetch } = useGetChartOfAccountsHierarchy()
  const workspace = useChartOfAccountsWorkspace(() => { void refetch() })

  const accounts = useMemo(() => {
    const result: ChartOfAccount[] = []
    const walk = (nodes: ChartOfAccount[]) => {
      for (const node of nodes) {
        result.push(node)
        if (node.children?.length) walk(node.children)
      }
    }
    walk(hierarchyData ?? [])
    return result
  }, [hierarchyData])

  const filteredAccounts = useMemo(
    () => appliedFilters.search
      ? accounts.filter((a) =>
          a.code.toLowerCase().includes(appliedFilters.search.toLowerCase()) ||
          a.name.toLowerCase().includes(appliedFilters.search.toLowerCase()),
        )
      : accounts,
    [accounts, appliedFilters.search],
  )

  return (
    <>
      <AccountMappingWarning context="system" />
      <GenericListPage
        title="Chart of Accounts"
        subtitle={`Manage your accounting structure and account hierarchy (${filteredAccounts.length} total)`}
        primaryAction={{ label: 'Add Account', onClick: () => { workspace.setSelected(null); workspace.setFormDialogOpen(true) } }}
        secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedDialogOpen(true) }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'code', sortBy: 'code', sortOrder: 'asc', onSort: () => {} }}
        error={(error as any)?.data ?? null}
        listSlot={<ChartOfAccountsTable accounts={filteredAccounts} loading={isLoading} selectedId={workspace.selected?.id ?? null} onSelect={workspace.setSelected} listRef={workspace.listRef} />}
        headerSlot={<ChartOfAccountContextHeader selected={workspace.selected} onEdit={() => workspace.setFormDialogOpen(true)} onDelete={() => workspace.selected && workspace.setDeleteTarget(workspace.selected)} />}
        workspaceSlot={<ChartOfAccountWorkspaceCard selected={workspace.selected} allAccounts={accounts} />}
        dialogs={<ChartOfAccountsDialogs formDialogOpen={workspace.formDialogOpen} selected={workspace.selected} onCloseForm={() => workspace.setFormDialogOpen(false)} onFormSuccess={() => { workspace.setFormDialogOpen(false); void refetch() }} deleteTarget={workspace.deleteTarget} onConfirmDelete={() => void workspace.handleDelete()} onCancelDelete={() => workspace.setDeleteTarget(null)} seedConfirmOpen={workspace.seedConfirmOpen} onConfirmSeed={() => void workspace.handleSeed()} onCancelSeed={() => workspace.setSeedConfirmOpen(false)} deletedDialogOpen={workspace.deletedDialogOpen} onCloseDeletedDialog={() => workspace.setDeletedDialogOpen(false)} onChanged={() => void refetch()} />}
      />
    </>
  )
}

export default ChartOfAccountsPage
```

Note: the old page passed `search` to the backend query — the hierarchy endpoint doesn't accept query params, so search filtering is now done client-side in `filteredAccounts`.

- [ ] **Step 4: Run the tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/ChartOfAccountsPage.tsx \
        frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
git commit -m "feat(accounting): switch COA page to hierarchy endpoint with client-side search (issue #397)"
```

---

### Task 3: Rewrite `ChartOfAccountsTable` using `EntityTable`

**Files:**
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx` with:

```tsx
import type { RefObject } from 'react'
import { Chip } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { AccountType, ChartOfAccount } from '@/types'

interface Props {
  accounts: ChartOfAccount[]
  loading: boolean
  selectedId: string | null
  onSelect: (item: ChartOfAccount) => void
  listRef?: RefObject<HTMLDivElement | null>
}

const TYPE_COLORS: Record<AccountType, 'success' | 'error' | 'primary' | 'info' | 'warning'> = {
  ASSET: 'success',
  LIABILITY: 'error',
  EQUITY: 'primary',
  REVENUE: 'info',
  EXPENSE: 'warning',
}

const COLUMNS: ColumnConfig<ChartOfAccount>[] = [
  { key: 'code', render: (a) => a.code },
  { key: 'name', render: (a) => a.name },
  {
    key: 'type',
    raw: true,
    render: (a) => (
      <Chip
        size="small"
        label={a.type.charAt(0) + a.type.slice(1).toLowerCase()}
        color={TYPE_COLORS[a.type] ?? 'default'}
        variant="outlined"
      />
    ),
  },
  {
    key: 'status',
    raw: true,
    render: (a) => (
      <Chip
        size="small"
        label={a.isActive ? 'Active' : 'Inactive'}
        color={a.isActive ? 'success' : 'default'}
        variant="outlined"
      />
    ),
  },
]

export function ChartOfAccountsTable({ accounts, loading, selectedId, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={accounts}
      columns={COLUMNS}
      loading={loading}
      total={accounts.length}
      label="Accounts"
      selectedId={selectedId ?? undefined}
      focusedIndex={-1}
      onSelect={onSelect}
      listRef={listRef ?? { current: null }}
      dataAttr="account"
    />
  )
}
```

- [ ] **Step 2: Run type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors. If `AccountType` is not exported from `@/types`, check `frontend/src/types/index.ts` — it is exported as an enum at line ~655.

- [ ] **Step 3: Run the page test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx
git commit -m "feat(accounting): migrate ChartOfAccountsTable to EntityTable with type badge colors (issue #397)"
```

---

### Task 4: Align `ChartOfAccountContextHeader` to sales page standard

**Files:**
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx` with:

```tsx
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { AccountType, ChartOfAccount } from '@/types'

interface Props {
  selected: ChartOfAccount | null
  onEdit: () => void
  onDelete: () => void
}

const TYPE_COLORS: Record<AccountType, 'success' | 'error' | 'primary' | 'info' | 'warning'> = {
  ASSET: 'success',
  LIABILITY: 'error',
  EQUITY: 'primary',
  REVENUE: 'info',
  EXPENSE: 'warning',
}

export function ChartOfAccountContextHeader({ selected, onEdit, onDelete }: Props) {
  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select an account to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            {selected.code} — {selected.name}
          </Typography>
          <Chip
            size="small"
            label={selected.type.charAt(0) + selected.type.slice(1).toLowerCase()}
            color={TYPE_COLORS[selected.type] ?? 'default'}
            variant="outlined"
          />
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>Edit</AppButton>
          <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>Delete</AppButton>
        </Stack>
      </Box>
    </Paper>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run the page test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx
git commit -m "feat(accounting): align ChartOfAccountContextHeader styling to sales page standard (issue #397)"
```

---

### Task 5: Align `ChartOfAccountWorkspaceCard` to sales page standard

**Files:**
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx` with:

```tsx
import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { ChartOfAccount } from '@/types'
import { formatDate } from '@/utils/formatters'

interface Props {
  selected: ChartOfAccount | null
  allAccounts: ChartOfAccount[]
}

const labelSx = {
  border: 'none',
  py: TABLE_STYLES.cell.padding.py,
  px: TABLE_STYLES.cell.padding.px,
  color: 'text.secondary',
  width: '40%',
  fontWeight: 600,
  fontSize: '0.8rem',
}

const valueSx = {
  border: 'none',
  py: TABLE_STYLES.cell.padding.py,
  px: TABLE_STYLES.cell.padding.px,
  fontSize: '0.8rem',
}

const rows: { label: string; getValue: (a: ChartOfAccount, allAccounts: ChartOfAccount[]) => string }[] = [
  { label: 'Account Type', getValue: (a) => a.type.charAt(0) + a.type.slice(1).toLowerCase() },
  { label: 'Parent Account', getValue: (a, all) => a.parentId ? all.find((x) => x.id === a.parentId)?.name ?? '—' : '—' },
  { label: 'Description', getValue: (a) => a.description || '—' },
  { label: 'Balance', getValue: (a) => a.currentBalance != null ? String(a.currentBalance) : '—' },
  { label: 'Cash Equivalent', getValue: (a) => a.isCashEquivalent ? 'Yes' : 'No' },
  { label: 'Created', getValue: (a) => formatDate(a.createdAt) },
  { label: 'Updated', getValue: (a) => formatDate(a.updatedAt) },
]

export function ChartOfAccountWorkspaceCard({ selected, allAccounts }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />

  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: TABLE_STYLES.cell.padding.px, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Details
        </Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none' } }}>
        <TableBody>
          {rows.map(({ label, getValue }, index) => (
            <TableRow key={label} sx={index % 2 === 1 ? { backgroundColor: 'grey.50' } : {}}>
              <TableCell sx={labelSx}>{label}</TableCell>
              <TableCell sx={valueSx}>{getValue(selected, allAccounts)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  )
}
```

- [ ] **Step 2: Check `formatDate` is exported from formatters**

```bash
grep -n "formatDate" /home/blur/erp2/frontend/src/utils/formatters.ts | head -5
```

Expected: `export function formatDate` or `export const formatDate`. If missing, use `new Date(a.createdAt).toLocaleDateString()` inline instead.

- [ ] **Step 3: Run type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Run the page test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx
git commit -m "feat(accounting): align ChartOfAccountWorkspaceCard styling and add missing fields (issue #397)"
```

---

### Task 6: Final verification and PR

- [ ] **Step 1: Run full accounting test suite**

```bash
cd frontend && npx vitest run src/pages/accounting/
```

Expected: all tests pass.

- [ ] **Step 2: Run type check one final time**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Create PR**

```bash
gh pr create \
  --title "feat(accounting): restore COA page visual polish and consistency (issue #397)" \
  --body "$(cat <<'EOF'
## Summary
- Switches COA page from flat paginated endpoint to hierarchy endpoint with client-side search
- Migrates `ChartOfAccountsTable` to `EntityTable` with type-specific badge colors (Asset=green, Liability=red, Equity=blue, Revenue=cyan, Expense=orange)
- Adds `raw` flag to `EntityTable`'s `ColumnConfig` to support unwrapped chip cells
- Aligns `ChartOfAccountContextHeader` and `ChartOfAccountWorkspaceCard` to sales page styling standard
- Adds missing workspace fields: Cash Equivalent, Created, Updated

## Test plan
- [ ] COA page loads and shows accounts
- [ ] Type badges show correct colors per account type
- [ ] Search filters accounts client-side
- [ ] Selecting an account shows details in workspace card with all 7 fields
- [ ] Edit/Delete buttons in context header work
- [ ] All existing page tests pass

Closes #397

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
