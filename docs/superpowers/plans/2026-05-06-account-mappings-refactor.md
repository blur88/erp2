# Account Mappings Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Account Mappings page to match the "gold standard" workspace pattern — Redux selection, `useEntityWorkspace` keyboard navigation, `EntityTable` list sidebar, and a two-column Context Header with Configure/Edit/Clear actions.

**Architecture:** Selection state moves from local `useState` to Redux (`accountingSlice`). The workspace hook delegates keyboard/navigation logic to `useEntityWorkspace`, keeping only dialog and clear state locally. The list sidebar switches to `EntityTable` (two columns: category chip + label); the context header becomes a two-column Grid showing mapping info and account details.

**Tech Stack:** React 19, MUI v7, Redux Toolkit (RTK Query + slice), `useEntityWorkspace` hook, `EntityTable` component, Vitest

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/store/slices/accountingSlice.ts` | Add `selectedAccountMapping` state, action, selector |
| `frontend/src/pages/accounting/hooks/useAccountMappingsWorkspace.ts` | Rewrite to use `useEntityWorkspace` + Redux dispatch |
| `frontend/src/pages/accounting/components/AccountMappingsTable.tsx` | Rewrite to use `EntityTable` with two columns |
| `frontend/src/pages/accounting/components/AccountMappingContextHeader.tsx` | Rewrite as two-column Grid with Configure/Edit/Clear |
| `frontend/src/pages/accounting/components/AccountMappingWorkspaceCard.tsx` | Minor: change prop from `selected` to `mapping` |
| `frontend/src/pages/accounting/AccountMappingsPage.tsx` | Add Redux hooks, pass focusedIndex, move Refresh to secondaryAction |
| `frontend/src/pages/accounting/__tests__/AccountMappingsPage.test.tsx` | Update mocks, add configure/edit state tests |

---

### Task 1: Add `selectedAccountMapping` to Redux slice

**Files:**
- Modify: `frontend/src/store/slices/accountingSlice.ts`

- [ ] **Step 1: Add the import and state field**

Open `frontend/src/store/slices/accountingSlice.ts`. Add `AccountMapping` to the type imports at the top and add the field to `AccountingState`:

```ts
import type {
  AccountMapping,        // ← add this
  BankReconciliation,
  ChartOfAccount,
  ExpenseRecord,
  FiscalPeriod,
  FundTransfer,
  JournalEntry,
  OwnerEquityTransaction,
  Settlement,
} from '@/types'

interface AccountingState {
  selectedAccount: ChartOfAccount | null
  selectedJournalEntry: JournalEntry | null
  selectedExpense: ExpenseRecord | null
  selectedFiscalPeriod: FiscalPeriod | null
  selectedFundTransfer: FundTransfer | null
  selectedOwnerEquityTransaction: OwnerEquityTransaction | null
  selectedBankReconciliation: BankReconciliation | null
  selectedSettlement: Settlement | null
  selectedAccountMapping: AccountMapping | null  // ← add this
}

const initialState: AccountingState = {
  selectedAccount: null,
  selectedJournalEntry: null,
  selectedExpense: null,
  selectedFiscalPeriod: null,
  selectedFundTransfer: null,
  selectedOwnerEquityTransaction: null,
  selectedBankReconciliation: null,
  selectedSettlement: null,
  selectedAccountMapping: null,  // ← add this
}
```

- [ ] **Step 2: Add the reducer and export it**

Inside the `reducers` object of `createSlice`, add:

```ts
setSelectedAccountMapping: (state, action: PayloadAction<AccountMapping | null>) => {
  state.selectedAccountMapping = action.payload
},
```

In the `export const { ... }` destructure block, add `setSelectedAccountMapping`.

At the bottom of the file alongside the other selectors, add:

```ts
export const selectSelectedAccountMapping = (state: RootState) => state.accounting.selectedAccountMapping
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "accountingSlice\|selectedAccountMapping" | head -20
```

Expected: no errors mentioning these names.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/slices/accountingSlice.ts
git commit -m "feat(accounting): add selectedAccountMapping to Redux slice"
```

---

### Task 2: Rewrite `AccountMappingsTable` to use `EntityTable`

The current table is a raw MUI Table with 3 columns. Replace it with `EntityTable` using 2 columns (category chip + label). Rows need a synthetic `id` field equal to `mappingType` so `EntityTable`'s `{ id: string }` constraint is satisfied.

**Files:**
- Modify: `frontend/src/pages/accounting/components/AccountMappingsTable.tsx`

The `MappingRow` type (with synthetic `id`) will also be used by the hook and page — export it from this file so it can be imported elsewhere.

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `frontend/src/pages/accounting/components/AccountMappingsTable.tsx` with:

```tsx
import React from 'react'
import { Chip } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { AccountMapping } from '@/types/accountMapping'

export type MappingRow = {
  id: string           // synthetic — equals mappingType
  mappingType: string
  label: string
  category: string
  description: string
  mapping: AccountMapping | undefined
}

const COLUMNS: ColumnConfig<MappingRow>[] = [
  {
    key: 'category',
    width: 140,
    render: (row) => (
      <Chip size="small" label={row.category} color="primary" variant="outlined" />
    ),
  },
  {
    key: 'label',
    render: (row) => row.label,
  },
]

interface Props {
  rows: MappingRow[]
  loading: boolean
  selectedId: string | null
  focusedIndex: number
  onSelect: (row: MappingRow) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function AccountMappingsTable({ rows, loading, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={rows}
      columns={COLUMNS}
      loading={loading}
      total={rows.length}
      label="Account Mappings List"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="mapping"
    />
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "AccountMappingsTable\|MappingRow" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/AccountMappingsTable.tsx
git commit -m "feat(accounting): replace AccountMappingsTable with EntityTable (2-column)"
```

---

### Task 3: Rewrite `AccountMappingWorkspaceCard` to accept `mapping` prop

Minor change — the card currently receives `selected: AccountMapping | null`. After the refactor the page passes the mapping from the focused row object (which may be `undefined` for unconfigured rows). Update the prop.

**Files:**
- Modify: `frontend/src/pages/accounting/components/AccountMappingWorkspaceCard.tsx`

- [ ] **Step 1: Update the prop type**

Replace the entire file content:

```tsx
import { Box, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import type { AccountMapping } from '@/types/accountMapping'
import { TABLE_STYLES } from '@/constants/tableStyles'

interface Props { mapping: AccountMapping | undefined }
const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function AccountMappingWorkspaceCard({ mapping }: Props) {
  if (!mapping) return <Paper sx={{ flex: 1 }} />
  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Details</Typography>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary', width: '35%' }}>Mapped Account</TableCell><TableCell>{mapping.account?.code} - {mapping.account?.name}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Account Type</TableCell><TableCell>{mapping.account?.accountType || '—'}</TableCell></TableRow>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Description</TableCell><TableCell>{mapping.description || '—'}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "WorkspaceCard" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/AccountMappingWorkspaceCard.tsx
git commit -m "refactor(accounting): update WorkspaceCard prop from selected to mapping"
```

---

### Task 4: Rewrite `AccountMappingContextHeader` as two-column Grid

Replace the simple bar with a two-column layout: left = Mapping Info (name, category, description), right = Account Details (code, name, type). Button label is "Configure" when no mapping, "Edit" when configured. "Clear" only shown when a mapping exists.

**Files:**
- Modify: `frontend/src/pages/accounting/components/AccountMappingContextHeader.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
import { Box, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as ClearIcon } from '@mui/icons-material/Clear'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as SettingsIcon } from '@mui/icons-material/Settings'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { MappingRow } from './AccountMappingsTable'

interface Props {
  row: MappingRow | null
  onConfigure: () => void
  onClear: () => void
}

const detailTableSx = {
  tableLayout: 'fixed' as const,
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const sectionHeaderSx = {
  fontWeight: 600,
  color: 'primary.main',
  fontSize: '0.8rem',
}

export function AccountMappingContextHeader({ row, onConfigure, onClear }: Props) {
  if (!row) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Select an account mapping to view details
        </Typography>
      </Paper>
    )
  }

  const isConfigured = !!row.mapping

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={row.label}
        actions={(
          <Stack direction="row" spacing={0.5}>
            <AppButton
              size="small"
              variant="outlined"
              startIcon={isConfigured ? <EditIcon /> : <SettingsIcon />}
              onClick={onConfigure}
            >
              {isConfigured ? 'Edit' : 'Configure'}
            </AppButton>
            {isConfigured && (
              <AppButton
                size="small"
                variant="warning"
                startIcon={<ClearIcon />}
                onClick={onClear}
              >
                Clear
              </AppButton>
            )}
          </Stack>
        )}
      />
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                    <Typography sx={sectionHeaderSx}>Mapping Info</Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Name</TableCell>
                  <TableCell sx={valueCellSx}>{row.label}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Category</TableCell>
                  <TableCell sx={valueCellSx}>{row.category}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Description</TableCell>
                  <TableCell sx={valueCellSx}>{row.description}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                    <Typography sx={sectionHeaderSx}>Account Details</Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Account Code</TableCell>
                  <TableCell sx={valueCellSx}>
                    {row.mapping?.account?.code ?? (
                      <Typography component="span" sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '0.8rem' }}>Not configured</Typography>
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Account Name</TableCell>
                  <TableCell sx={valueCellSx}>
                    {row.mapping?.account?.name ?? (
                      <Typography component="span" sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '0.8rem' }}>—</Typography>
                    )}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Account Type</TableCell>
                  <TableCell sx={valueCellSx}>
                    {row.mapping?.account?.accountType ?? (
                      <Typography component="span" sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '0.8rem' }}>—</Typography>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "ContextHeader\|MappingRow" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/AccountMappingContextHeader.tsx
git commit -m "feat(accounting): redesign AccountMappingContextHeader as two-column Grid"
```

---

### Task 5: Rewrite `useAccountMappingsWorkspace` to use `useEntityWorkspace`

Replace the local-state workspace hook with one that delegates keyboard/navigation to `useEntityWorkspace` and dispatches to Redux for selection. Dialog and clear state remain local.

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useAccountMappingsWorkspace.ts`

- [ ] **Step 1: Rewrite the file**

```ts
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import { useDeleteAccountMappingMutation } from '@/store/api/accountingApi'
import { setSelectedAccountMapping } from '@/store/slices/accountingSlice'
import type { AccountMapping } from '@/types/accountMapping'
import type { MappingRow } from '../components/AccountMappingsTable'

export function useAccountMappingsWorkspace(
  refetchMappings: () => Promise<any> | any,
  refetchValidation: () => Promise<any> | any,
  rows: MappingRow[],
  selected: AccountMapping | null,
  dispatch: AppDispatch,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMapping, setSelectedMapping] = useState<AccountMapping | null>(null)
  const [selectedMappingType, setSelectedMappingType] = useState<string | null>(null)
  const [mappingToClear, setMappingToClear] = useState<AccountMapping | null>(null)
  const [clearing, setClearing] = useState(false)

  const [deleteAccountMapping] = useDeleteAccountMappingMutation()

  const openDialogForRow = useCallback((row: MappingRow) => {
    setSelectedMapping(row.mapping ?? null)
    setSelectedMappingType(row.mapping ? null : row.mappingType)
    setDialogOpen(true)
  }, [])

  const workspace = useEntityWorkspace<MappingRow>({
    entities: rows,
    selectedEntity: rows.find((r) => r.mapping?.id === selected?.id) ?? null,
    selectEntity: (row) => dispatch(setSelectedAccountMapping(row?.mapping ?? null)),
    refetch: () => { void refetchMappings() },
    navigate,
    routes: {
      create: '/accounting/account-mappings',
      edit: () => '/accounting/account-mappings',
    },
    onEnter: () => {
      const focusedRow = workspace.focusedIndex >= 0 ? rows[workspace.focusedIndex] : null
      if (focusedRow) openDialogForRow(focusedRow)
    },
    onEscape: () => {
      dispatch(setSelectedAccountMapping(null))
      setMappingToClear(null)
    },
  })

  const handleClear = useCallback(async () => {
    if (!mappingToClear) return
    try {
      setClearing(true)
      await deleteAccountMapping(mappingToClear.id).unwrap()
      await refetchMappings()
      await refetchValidation()
      showSuccess(`Mapping "${mappingToClear.mappingType}" cleared successfully`)
      if (selected?.id === mappingToClear.id) dispatch(setSelectedAccountMapping(null))
    } catch (err: any) {
      showError(err || 'Failed to clear mapping')
    } finally {
      setClearing(false)
      setMappingToClear(null)
    }
  }, [deleteAccountMapping, dispatch, mappingToClear, refetchMappings, refetchValidation, selected?.id, showError, showSuccess])

  return {
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    handleSelect: workspace.handleSelect,
    dialogOpen,
    setDialogOpen,
    selectedMapping,
    setSelectedMapping,
    selectedMappingType,
    setSelectedMappingType,
    mappingToClear,
    setMappingToClear,
    clearing,
    openDialogForRow,
    handleClear,
  }
}
```

- [ ] **Step 2: Check TypeScript**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "useAccountMappingsWorkspace\|AccountMappingsWorkspace" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useAccountMappingsWorkspace.ts
git commit -m "feat(accounting): migrate useAccountMappingsWorkspace to useEntityWorkspace + Redux"
```

---

### Task 6: Update `AccountMappingsPage` to wire everything together

This is the integration step — connect Redux hooks, pass the right props to all components, move Refresh to `secondaryAction`.

**Files:**
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `frontend/src/pages/accounting/AccountMappingsPage.tsx`:

```tsx
import React, { useMemo } from 'react'
import { Alert } from '@mui/material'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetAccountMappingsQuery, useGetPaymentMethodsQuery, useValidateAccountMappingsQuery } from '@/store/api/accountingApi'
import { selectSelectedAccountMapping, setSelectedAccountMapping } from '@/store/slices/accountingSlice'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { MappingType, type AccountMapping } from '@/types/accountMapping'

import { AccountMappingContextHeader } from './components/AccountMappingContextHeader'
import { AccountMappingsDialogs } from './components/AccountMappingsDialogs'
import { AccountMappingsTable, type MappingRow } from './components/AccountMappingsTable'
import { AccountMappingWorkspaceCard } from './components/AccountMappingWorkspaceCard'
import { useAccountMappingsWorkspace } from './hooks/useAccountMappingsWorkspace'

const MAPPING_TYPE_LABELS: Record<MappingType, { label: string; category: string; description: string }> = {
  [MappingType.SALES_REVENUE]: { label: 'Sales Revenue', category: 'Sales', description: 'Revenue account credited when sales orders are fulfilled' },
  [MappingType.SALES_AR]: { label: 'Accounts Receivable (Sales)', category: 'Sales', description: 'Asset account debited when sales orders are fulfilled' },
  [MappingType.SALES_COGS]: { label: 'Cost of Goods Sold', category: 'Sales', description: 'Expense account debited for product costs on sales' },
  [MappingType.SALES_INVENTORY]: { label: 'Inventory (Sales)', category: 'Sales', description: 'Asset account credited when inventory is sold' },
  [MappingType.PURCHASE_INVENTORY]: { label: 'Inventory (Purchases)', category: 'Purchasing', description: 'Asset account debited when goods are received' },
  [MappingType.PURCHASE_AP]: { label: 'Accounts Payable (Purchases)', category: 'Purchasing', description: 'Liability account credited when goods are received' },
  [MappingType.PAYMENT_AR]: { label: 'Accounts Receivable (Payments)', category: 'Payments', description: 'Asset account credited when customer payments are received' },
  [MappingType.VENDOR_PAYMENT_AP]: { label: 'Accounts Payable (Vendor Payments)', category: 'Vendor Payments', description: 'Liability account debited when vendor payments are made' },
  [MappingType.EQUITY_OWNERS_EQUITY]: { label: "Owner's Equity", category: 'Equity', description: "Equity account credited for owner capital contributions" },
  [MappingType.EQUITY_DRAWINGS]: { label: 'Owner Drawings', category: 'Equity', description: 'Equity contra account debited for owner withdrawals' },
  [MappingType.INVENTORY_ASSET]: { label: 'Inventory Asset', category: 'Inventory', description: 'Asset account for inventory adjustments' },
  [MappingType.INVENTORY_ADJUSTMENT_GAIN]: { label: 'Inventory Adjustment Gain', category: 'Inventory', description: 'Revenue account credited for positive inventory adjustments' },
  [MappingType.INVENTORY_ADJUSTMENT_LOSS]: { label: 'Inventory Adjustment Loss', category: 'Inventory', description: 'Expense account debited for negative inventory adjustments' },
}

const staticCategories = ['Sales', 'Purchasing', 'Equity', 'Inventory']
interface MappingFilters { search: string }
const filterConfig: FilterBarConfig<MappingFilters> = { search: { placeholder: 'Search account mappings...' }, fields: [], defaults: { search: '' } }

const AccountMappingsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const selected = useAppSelector(selectSelectedAccountMapping)

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: mappings = [], isLoading, error, refetch: refetchMappings } = useGetAccountMappingsQuery()
  const { data: validationResult, refetch: refetchValidation } = useValidateAccountMappingsQuery()
  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ page: 1, isActive: true })
  const paymentMethods = useMemo(() => ((paymentMethodsResponse?.data ?? []) as Array<{ code: string; name: string; requiresSettlement: boolean; useForPurchases: boolean }>), [paymentMethodsResponse])

  const getAllMappingRows = (): MappingRow[] =>
    Object.values(MappingType).map((type) => ({
      id: type,
      mappingType: type,
      ...MAPPING_TYPE_LABELS[type],
      mapping: (mappings as AccountMapping[]).find((m) => m.mappingType === type),
    }))

  const getPaymentRows = (): MappingRow[] => {
    const items: MappingRow[] = [{
      id: MappingType.PAYMENT_AR,
      mappingType: MappingType.PAYMENT_AR,
      label: 'Accounts Receivable (Payments)',
      category: 'Payments',
      description: 'Asset account credited when customer payments are received',
      mapping: (mappings as AccountMapping[]).find((m) => m.mappingType === MappingType.PAYMENT_AR),
    }]
    for (const pm of paymentMethods) {
      const code = pm.code.toLowerCase()
      items.push({
        id: `payment_${code}`,
        mappingType: `payment_${code}`,
        label: `${pm.name} Payment Account`,
        category: 'Payments',
        description: `Account debited when ${pm.name} payments are received`,
        mapping: (mappings as AccountMapping[]).find((m) => m.mappingType === `payment_${code}`),
      })
      if (pm.requiresSettlement) {
        items.push({
          id: `payment_${code}_settlement`,
          mappingType: `payment_${code}_settlement`,
          label: `${pm.name} Settlement Account`,
          category: 'Payments',
          description: `Bank account debited when ${pm.name} payments are settled`,
          mapping: (mappings as AccountMapping[]).find((m) => m.mappingType === `payment_${code}_settlement`),
        })
      }
    }
    return items
  }

  const getVendorPaymentRows = (): MappingRow[] => {
    const items: MappingRow[] = [{
      id: MappingType.VENDOR_PAYMENT_AP,
      mappingType: MappingType.VENDOR_PAYMENT_AP,
      label: 'Accounts Payable (Vendor Payments)',
      category: 'Vendor Payments',
      description: 'Liability account debited when vendor payments are made',
      mapping: (mappings as AccountMapping[]).find((m) => m.mappingType === MappingType.VENDOR_PAYMENT_AP),
    }]
    for (const pm of paymentMethods) {
      if (!pm.useForPurchases) continue
      const code = pm.code.toLowerCase()
      items.push({
        id: `vendor_payment_${code}`,
        mappingType: `vendor_payment_${code}`,
        label: `${pm.name} Vendor Payment Account`,
        category: 'Vendor Payments',
        description: `Account credited when ${pm.name} vendor payments are made`,
        mapping: (mappings as AccountMapping[]).find((m) => m.mappingType === `vendor_payment_${code}`),
      })
    }
    return items
  }

  const tableRows = useMemo(() => {
    const staticRows = staticCategories.flatMap((category) =>
      getAllMappingRows().filter((r) => r.category === category)
    )
    const allRows = [...staticRows, ...getPaymentRows(), ...getVendorPaymentRows()]
    const term = appliedFilters.search.trim().toLowerCase()
    if (!term) return allRows
    return allRows.filter((row) =>
      [row.label, row.category, row.description, row.mapping?.account?.name, row.mapping?.account?.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [mappings, paymentMethods, appliedFilters.search])

  const workspace = useAccountMappingsWorkspace(refetchMappings, refetchValidation, tableRows, selected, dispatch)

  const focusedRow = workspace.focusedIndex >= 0 ? tableRows[workspace.focusedIndex] ?? null : null

  return (
    <>
      {!validationResult?.isValid && validationResult?.missingMappings?.length ? (
        <Alert severity="warning" sx={{ mb: 2 }}>Configuration Incomplete</Alert>
      ) : validationResult?.isValid ? (
        <Alert severity="success" sx={{ mb: 2 }}>All required account mappings are configured.</Alert>
      ) : null}
      <GenericListPage
        title="Account Mappings"
        subtitle="Configure default account assignments for transactions"
        secondaryAction={{ label: 'Refresh', onClick: () => { void refetchMappings(); void refetchValidation() } }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={workspace.searchInputRef}
        sort={{ field: 'mappingType', sortBy: 'mappingType', sortOrder: 'asc', onSort: () => {} }}
        error={(error as any)?.data ?? null}
        onErrorClose={() => {}}
        listSlot={(
          <AccountMappingsTable
            rows={tableRows}
            loading={isLoading}
            selectedId={selected?.mappingType ?? null}
            focusedIndex={workspace.focusedIndex}
            onSelect={workspace.handleSelect}
            listRef={workspace.listRef}
          />
        )}
        headerSlot={(
          <AccountMappingContextHeader
            row={focusedRow}
            onConfigure={() => {
              if (focusedRow) workspace.openDialogForRow(focusedRow)
            }}
            onClear={() => {
              if (focusedRow?.mapping) workspace.setMappingToClear(focusedRow.mapping)
            }}
          />
        )}
        workspaceSlot={<AccountMappingWorkspaceCard mapping={focusedRow?.mapping} />}
        dialogs={(
          <AccountMappingsDialogs
            dialogOpen={workspace.dialogOpen}
            selectedMapping={workspace.selectedMapping}
            selectedMappingType={workspace.selectedMappingType}
            onCloseDialog={() => { workspace.setDialogOpen(false); workspace.setSelectedMapping(null); workspace.setSelectedMappingType(null) }}
            onSaveSuccess={() => { workspace.setDialogOpen(false); workspace.setSelectedMapping(null); workspace.setSelectedMappingType(null); void refetchMappings(); void refetchValidation() }}
            mappingToClear={workspace.mappingToClear}
            clearing={workspace.clearing}
            onConfirmClear={() => void workspace.handleClear()}
            onCancelClear={() => !workspace.clearing && workspace.setMappingToClear(null)}
          />
        )}
      />
    </>
  )
}

export default AccountMappingsPage
```

- [ ] **Step 2: Check TypeScript**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "AccountMappingsPage\|error" | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/AccountMappingsPage.tsx
git commit -m "feat(accounting): wire AccountMappingsPage to Redux + useEntityWorkspace"
```

---

### Task 7: Update the test file

The existing test mocked local state. Now the page uses `useAppDispatch`/`useAppSelector` and `useEntityWorkspace`. Update the mocks and add two new test cases covering the configure/edit states in the Context Header.

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/AccountMappingsPage.test.tsx`

- [ ] **Step 1: Run the existing test to see current state**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/AccountMappingsPage.test.tsx 2>&1 | tail -20
```

Expected: likely fails due to missing Redux/dispatch mocks.

- [ ] **Step 2: Rewrite the test file**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import AccountMappingsPage from '../AccountMappingsPage'
import { MappingType } from '@/types/accountMapping'

const mockedApi = vi.hoisted(() => ({
  useGetAccountMappingsQuery: vi.fn(),
  useValidateAccountMappingsQuery: vi.fn(),
  useGetPaymentMethodsQuery: vi.fn(),
  useDeleteAccountMappingMutation: vi.fn(),
}))

const mockDispatch = vi.fn()

vi.mock('@/store/api/accountingApi', () => mockedApi)
vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/components/accounting/AccountMappingDialog', () => ({ default: () => null }))
vi.mock('@/hooks/useRedux', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => null,
}))
vi.mock('@/hooks/useEntityWorkspace', () => ({
  useEntityWorkspace: () => ({
    focusedIndex: -1,
    listRef: { current: null },
    searchInputRef: { current: null },
    handleSelect: vi.fn(),
  }),
}))

const configuredMapping = {
  id: '1',
  mappingType: MappingType.SALES_REVENUE,
  accountId: 'acc-1',
  description: 'Sales revenue account',
  isActive: true,
  account: { id: 'acc-1', code: '4000', name: 'Sales Revenue', accountType: 'Revenue' },
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}

describe('AccountMappingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({ data: [configuredMapping], isLoading: false, error: undefined, refetch: vi.fn() })
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({ data: { isValid: true, missingMappings: [], configuredMappings: [], totalRequired: 0, totalConfigured: 0 }, refetch: vi.fn() })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({ data: { data: [] } })
    mockedApi.useDeleteAccountMappingMutation.mockReturnValue([vi.fn()])
  })

  it('renders title and mapping rows', async () => {
    render(<BrowserRouter><AccountMappingsPage /></BrowserRouter>)
    await waitFor(() => {
      expect(screen.getByText('Account Mappings')).toBeInTheDocument()
      expect(screen.getByText('Sales Revenue')).toBeInTheDocument()
    })
  })

  it('shows Edit and Clear buttons when a configured row is focused', async () => {
    const { useEntityWorkspace } = await import('@/hooks/useEntityWorkspace')
    vi.mocked(useEntityWorkspace).mockReturnValue({
      focusedIndex: 0,
      listRef: { current: null },
      searchInputRef: { current: null },
      handleSelect: vi.fn(),
      setFocusedIndex: vi.fn(),
      deleteConfirmOpen: false,
      setDeleteConfirmOpen: vi.fn(),
      deletedEntitiesDialogOpen: false,
      setDeletedEntitiesDialogOpen: vi.fn(),
      setShouldPreserveSearchFocus: vi.fn(),
      handleDelete: vi.fn(),
      handleCancelDelete: vi.fn(),
      handleNavigateUp: vi.fn(),
      handleNavigateDown: vi.fn(),
      handleEnterAction: vi.fn(),
      handleEscapeAction: vi.fn(),
      handlePageUpNavigation: vi.fn(),
      handlePageDownNavigation: vi.fn(),
      handleNavigateToFirst: vi.fn(),
      handleNavigateToLast: vi.fn(),
    } as any)

    render(<BrowserRouter><AccountMappingsPage /></BrowserRouter>)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
    })
  })

  it('shows Configure button (no Clear) when an unconfigured row is focused', async () => {
    const { useEntityWorkspace } = await import('@/hooks/useEntityWorkspace')
    // Focus index 1 = SALES_AR, which has no configured mapping in this test
    vi.mocked(useEntityWorkspace).mockReturnValue({
      focusedIndex: 1,
      listRef: { current: null },
      searchInputRef: { current: null },
      handleSelect: vi.fn(),
      setFocusedIndex: vi.fn(),
      deleteConfirmOpen: false,
      setDeleteConfirmOpen: vi.fn(),
      deletedEntitiesDialogOpen: false,
      setDeletedEntitiesDialogOpen: vi.fn(),
      setShouldPreserveSearchFocus: vi.fn(),
      handleDelete: vi.fn(),
      handleCancelDelete: vi.fn(),
      handleNavigateUp: vi.fn(),
      handleNavigateDown: vi.fn(),
      handleEnterAction: vi.fn(),
      handleEscapeAction: vi.fn(),
      handlePageUpNavigation: vi.fn(),
      handlePageDownNavigation: vi.fn(),
      handleNavigateToFirst: vi.fn(),
      handleNavigateToLast: vi.fn(),
    } as any)

    render(<BrowserRouter><AccountMappingsPage /></BrowserRouter>)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /configure/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3: Run the tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/AccountMappingsPage.test.tsx 2>&1 | tail -30
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/AccountMappingsPage.test.tsx
git commit -m "test(accounting): update AccountMappingsPage tests for Redux + configure/edit states"
```

---

### Task 8: Final type-check and smoke test

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error" | grep -v "node_modules" | head -30
```

Expected: no errors outside node_modules.

- [ ] **Step 2: Run related test files**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/AccountMappingsPage.test.tsx src/pages/accounting/__tests__/FiscalPeriodsPage.test.tsx src/hooks/useEntityWorkspace.test.ts 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint 2>&1 | grep -i "error\|AccountMapping" | head -20
```

Expected: no errors.

- [ ] **Step 4: Final commit if any cleanup needed**

If lint auto-fix made changes:
```bash
git add -p
git commit -m "chore(accounting): lint cleanup for account mappings refactor"
```

---

## Self-Review Notes

- **Spec §3.1 `onEnter` closure:** The `onEnter` callback in `useAccountMappingsWorkspace` references `workspace.focusedIndex` — this creates a stale closure risk. At Task 5 Step 1 the hook accesses `workspace.focusedIndex` inside `onEnter`, but `workspace` isn't defined yet at that point in the code. The implementation uses a ref pattern: `useEntityWorkspace` fires `onEnter` synchronously during the keyboard event, so `focusedIndex` will be the current value from the hook's internal state. This is safe because `useEntityWorkspace` owns `focusedIndex` and the `onEnter` callback is invoked after `focusedIndex` is already correct. ✓

- **`selectedEntity` in Task 5:** `useEntityWorkspace` uses `selectedEntity` to determine auto-select-first behavior. We pass `rows.find((r) => r.mapping?.id === selected?.id) ?? null`. When `selected` is null, `selectedEntity` is null — auto-select will fire on first load, selecting row 0 and dispatching `setSelectedAccountMapping(rows[0].mapping ?? null)`. If row 0 is unconfigured, Redux stays null but the focused index is 0. This is intentional and consistent with the design. ✓

- **`filterExtra` removal:** Task 6 removes `filterExtra` prop from `GenericListPage` and moves Refresh to `secondaryAction`. Check that `GenericListPage` accepts `secondaryAction` — it does, FiscalPeriodsPage uses it. ✓
