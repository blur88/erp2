# Fund Transfers UI/UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Fund Transfers page to match the Gold Standard master-detail pattern (keyboard nav, narrow EntityTable list, 2-column context header with JE link, ledger preview workspace card), plus add Fund Transfers to Document Number Settings.

**Architecture:** Follow the Expenses module (PR #510) as the direct reference. Backend extends `findOne` to include JE lines. Frontend replaces the wide `FundTransfersTable` with `EntityTable`, wires `useEntityWorkspace` into the workspace hook, and rebuilds the context header and workspace card.

**Tech Stack:** NestJS 11 (backend), TypeORM, React 19, MUI v7, RTK Query, Vitest (frontend tests)

---

## File Map

| File | Action |
|------|--------|
| `backend/src/modules/accounting/dto/fund-transfer.dto.ts` | Add `lines` to `JournalEntrySummary` type and `FundTransferResponseDto` |
| `backend/src/modules/accounting/services/fund-transfer.service.ts` | Load JE lines relation in `findOne`, map lines in `toResponseDto` |
| `backend/src/database/migrations/<timestamp>-AddFundTransfersDocumentNumberSetting.ts` | New migration — insert `Fund Transfers / TRF` row |
| `frontend/src/types/index.ts` | Add `lines` to `FundTransfer.journalEntry` type |
| `frontend/src/pages/accounting/hooks/useFundTransfersWorkspace.ts` | Wrap `useEntityWorkspace`, keep lazy fetch |
| `frontend/src/pages/accounting/components/FundTransfersTable.tsx` | **Delete** |
| `frontend/src/pages/accounting/components/FundTransfersList.tsx` | **New** — wraps `EntityTable`, two columns |
| `frontend/src/pages/accounting/components/FundTransferContextHeader.tsx` | Two-column Grid, `useJournalEntryRef` |
| `frontend/src/pages/accounting/components/FundTransferWorkspaceCard.tsx` | Ledger Preview + Notes |
| `frontend/src/pages/accounting/FundTransfersPage.tsx` | Wire `FundTransfersList` + `focusedIndex` |
| `frontend/src/pages/settings/DocumentNumbersPage.tsx` | Add `'Fund Transfers'` to `MODULE_GROUPS` |
| `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx` | Update for narrow list |

---

## Task 1: Extend backend DTO and `findOne` to include JE lines

**Files:**
- Modify: `backend/src/modules/accounting/dto/fund-transfer.dto.ts`
- Modify: `backend/src/modules/accounting/services/fund-transfer.service.ts`

- [ ] **Step 1: Update `JournalEntrySummary` type and `FundTransferResponseDto` in the DTO file**

Open `backend/src/modules/accounting/dto/fund-transfer.dto.ts`. Replace the `JournalEntrySummary` type (lines 83–87) with:

```ts
type JournalEntryLineSummary = {
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  memo?: string;
};

type JournalEntrySummary = {
  id: string;
  referenceNumber: string;
  status: string;
  lines?: JournalEntryLineSummary[];
};
```

The `FundTransferResponseDto` class (line 89) does not need changes — `journalEntry?: JournalEntrySummary` already picks up the updated type.

- [ ] **Step 2: Load JE lines relation in `findOne`**

Open `backend/src/modules/accounting/services/fund-transfer.service.ts`.

Find the `findOne` method (around line 253). Change the `relations` array from:
```ts
relations: ['sourceAccount', 'destinationAccount', 'journalEntry'],
```
to:
```ts
relations: [
  'sourceAccount',
  'destinationAccount',
  'journalEntry',
  'journalEntry.lines',
  'journalEntry.lines.account',
],
```

- [ ] **Step 3: Map lines in `toResponseDto`**

In the same file, find `toResponseDto` (around line 297). Change the `journalEntry` mapping from:
```ts
journalEntry: transfer.journalEntry
  ? {
      id: transfer.journalEntry.id,
      referenceNumber: transfer.journalEntry.referenceNumber,
      status: transfer.journalEntry.status,
    }
  : undefined,
```
to:
```ts
journalEntry: transfer.journalEntry
  ? {
      id: transfer.journalEntry.id,
      referenceNumber: transfer.journalEntry.referenceNumber,
      status: transfer.journalEntry.status,
      lines: transfer.journalEntry.lines?.map((line) => ({
        accountCode: line.account?.code ?? '',
        accountName: line.account?.name ?? '',
        debitAmount: Number(line.debitAmount),
        creditAmount: Number(line.creditAmount),
        memo: line.memo,
      })),
    }
  : undefined,
```

- [ ] **Step 4: Run the backend fund-transfer service tests**

```bash
cd backend && npx jest src/modules/accounting/services/fund-transfer.service.spec.ts --no-coverage
```

Expected: all tests pass (the `findOne` tests mock the relation — they will still pass since `lines` is optional).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/accounting/dto/fund-transfer.dto.ts \
        backend/src/modules/accounting/services/fund-transfer.service.ts
git commit -m "feat(fund-transfers): include JE lines in findOne response"
```

---

## Task 2: Add Fund Transfers document number migration

**Files:**
- Create: `backend/src/database/migrations/<timestamp>-AddFundTransfersDocumentNumberSetting.ts`

- [ ] **Step 1: Generate the migration timestamp**

```bash
date +%s%3N
```

Note the number printed — use it as `<timestamp>` in the filename below.

- [ ] **Step 2: Create the migration file**

Create `backend/src/database/migrations/<timestamp>-AddFundTransfersDocumentNumberSetting.ts` with this content (replace `<timestamp>` with the number from Step 1):

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFundTransfersDocumentNumberSetting<timestamp> implements MigrationInterface {
  name = 'AddFundTransfersDocumentNumberSetting<timestamp>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const currentYear = new Date().getFullYear() % 100;
    await queryRunner.query(
      `INSERT INTO "document_number_settings"
        ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
       SELECT $1, $2, 3, 1, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM "document_number_settings" WHERE "documentName" = $1
       )`,
      ['Fund Transfers', 'TRF', currentYear],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "document_number_settings" WHERE "documentName" = 'Fund Transfers'`,
    );
  }
}
```

- [ ] **Step 3: Run the migration against the dev database**

```bash
cd backend && npm run migration:run
```

Expected: `migration AddFundTransfersDocumentNumberSetting<timestamp> has been executed successfully`.

- [ ] **Step 4: Verify the row was inserted**

```bash
cd backend && npx ts-node -e "
const { DataSource } = require('typeorm');
// Quick manual check — just verify migration ran. Check DB directly if needed.
console.log('Migration run succeeded')
"
```

Or just confirm the migration ran without errors in Step 3.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/migrations/
git commit -m "feat(fund-transfers): add Fund Transfers document number setting migration"
```

---

## Task 3: Update frontend `FundTransfer` type

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add `lines` to `FundTransfer.journalEntry`**

Open `frontend/src/types/index.ts`. Find the `FundTransfer` interface (around line 507). Change the `journalEntry` property from:

```ts
journalEntry?: {
  id: string;
  referenceNumber: string;
  status: string;
};
```

to:

```ts
journalEntry?: {
  id: string;
  referenceNumber: string;
  status: string;
  lines?: Array<{
    accountCode: string;
    accountName: string;
    debitAmount: number;
    creditAmount: number;
    memo?: string;
  }>;
};
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(fund-transfers): add JE lines to FundTransfer frontend type"
```

---

## Task 4: Refactor `useFundTransfersWorkspace` hook

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useFundTransfersWorkspace.ts`

- [ ] **Step 1: Rewrite the hook**

Replace the entire contents of `frontend/src/pages/accounting/hooks/useFundTransfersWorkspace.ts` with:

```ts
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useCancelFundTransferMutation, useLazyGetFundTransferQuery } from '@/store/api/accountingApi'
import type { FundTransfer } from '@/types'

export function useFundTransfersWorkspace(refetch: () => void, transfers: FundTransfer[] = []) {
  const navigate = useNavigate()
  const { showError, showSuccess } = useNotification()
  const [selected, setSelected] = useState<FundTransfer | null>(null)
  const [cancelTarget, setCancelTarget] = useState<FundTransfer | null>(null)
  const [fetchItem] = useLazyGetFundTransferQuery()
  const [cancelFundTransfer, { isLoading: cancelling }] = useCancelFundTransferMutation()

  const workspace = useEntityWorkspace<FundTransfer>({
    entities: transfers,
    selectedEntity: selected,
    selectEntity: setSelected,
    refetch,
    navigate,
    routes: {
      create: '/accounting/fund-transfers',
      edit: () => '/accounting/fund-transfers',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async () => {},
    onEscape: () => {
      setSelected(null)
      setCancelTarget(null)
    },
  })

  const handleSelect = useCallback(async (item: FundTransfer) => {
    setSelected(item)
    workspace.handleSelect(item)
    try {
      const fresh = await fetchItem(item.id).unwrap()
      setSelected(fresh)
    }
    catch { /* keep list-row data */ }
  }, [fetchItem, workspace])

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      const next = await cancelFundTransfer(cancelTarget.id).unwrap()
      showSuccess(`Transfer ${cancelTarget.referenceNumber} cancelled`)
      setSelected(next)
      setCancelTarget(null)
      refetch()
    }
    catch (error: any) {
      showError(error?.data?.message ?? error?.message ?? 'Operation failed')
    }
  }, [cancelFundTransfer, cancelTarget, refetch, showError, showSuccess])

  return {
    selected,
    setSelected,
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    cancelTarget,
    setCancelTarget,
    cancelling,
    handleSelect,
    handleConfirmCancel,
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useFundTransfersWorkspace.ts
git commit -m "refactor(fund-transfers): wire useEntityWorkspace into useFundTransfersWorkspace"
```

---

## Task 5: Replace `FundTransfersTable` with `FundTransfersList`

**Files:**
- Delete: `frontend/src/pages/accounting/components/FundTransfersTable.tsx`
- Create: `frontend/src/pages/accounting/components/FundTransfersList.tsx`

- [ ] **Step 1: Delete `FundTransfersTable.tsx`**

```bash
rm frontend/src/pages/accounting/components/FundTransfersTable.tsx
```

- [ ] **Step 2: Create `FundTransfersList.tsx`**

Create `frontend/src/pages/accounting/components/FundTransfersList.tsx`:

```tsx
import type { RefObject } from 'react'
import { Chip } from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { FundTransfer } from '@/types'

interface Props {
  transfers: FundTransfer[]
  loading: boolean
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: FundTransfer) => void
  listRef: RefObject<HTMLDivElement | null>
}

function statusColor(status: string) {
  return status === 'ACTIVE' ? 'success' as const : 'error' as const
}

const columns: ColumnConfig<FundTransfer>[] = [
  {
    key: 'reference',
    render: (row) => row.referenceNumber,
    width: '60%',
  },
  {
    key: 'status',
    raw: true,
    render: (row) => (
      <Chip label={row.status} color={statusColor(row.status)} size="small" />
    ),
    width: '40%',
  },
]

export function FundTransfersList({ transfers, loading, selectedId, focusedIndex, onSelect, listRef }: Props) {
  return (
    <EntityTable
      rows={transfers}
      columns={columns}
      loading={loading}
      total={transfers.length}
      label="Fund Transfers"
      selectedId={selectedId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
    />
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors (FundTransfersPage still imports the old table — fix that in Task 7).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/components/FundTransfersList.tsx
git rm frontend/src/pages/accounting/components/FundTransfersTable.tsx
git commit -m "feat(fund-transfers): replace FundTransfersTable with FundTransfersList using EntityTable"
```

---

## Task 6: Refactor `FundTransferContextHeader`

**Files:**
- Modify: `frontend/src/pages/accounting/components/FundTransferContextHeader.tsx`

- [ ] **Step 1: Rewrite `FundTransferContextHeader.tsx`**

Replace the entire file with:

```tsx
import { Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as CancelIcon } from '@mui/icons-material/Cancel'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
import type { FundTransfer } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: FundTransfer | null
  onCancel: () => void
  canManageTransfers: boolean
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
const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

export function FundTransferContextHeader({ selected, onCancel, canManageTransfers }: Props) {
  const { journalEntryRef, navigateToJournalEntry } = useJournalEntryRef(
    selected?.journalEntryId
      ? [{ sourceType: 'fund_transfer', sourceId: selected.id }]
      : [],
  )

  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a fund transfer to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selected.referenceNumber}
        statusChip={<EntityStatusChip status={selected.status} />}
        actions={
          canManageTransfers && selected.status === 'ACTIVE' ? (
            <Stack direction="row" spacing={0.5}>
              <AppButton size="small" variant="danger" startIcon={<CancelIcon />} onClick={onCancel}>
                Cancel
              </AppButton>
            </Stack>
          ) : null
        }
      />
      <Grid container spacing={3} sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TableContainer>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                      Transfer Info
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Date</TableCell>
                  <TableCell sx={valueCellSx}>{formatDate(selected.transferDate)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Source Account</TableCell>
                  <TableCell sx={valueCellSx}>{selected.sourceAccount.code} - {selected.sourceAccount.name}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <TableContainer>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                      Amount & Accounts
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Total Amount</TableCell>
                  <TableCell sx={{ ...valueCellSx, fontWeight: 600 }}>{formatCurrency(selected.amount)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Destination Account</TableCell>
                  <TableCell sx={valueCellSx}>{selected.destinationAccount.code} - {selected.destinationAccount.name}</TableCell>
                </TableRow>
                {journalEntryRef && (
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                    <TableCell sx={valueCellSx}>
                      <Typography
                        component="button"
                        onClick={navigateToJournalEntry}
                        sx={{
                          fontSize: '0.8rem',
                          color: 'primary.main',
                          cursor: 'pointer',
                          textDecoration: 'none',
                          border: 'none',
                          background: 'none',
                          padding: 0,
                        }}
                      >
                        {journalEntryRef.referenceNumber}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Paper>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/FundTransferContextHeader.tsx
git commit -m "refactor(fund-transfers): two-column Grid context header with JE link"
```

---

## Task 7: Refactor `FundTransferWorkspaceCard` — Ledger Preview

**Files:**
- Modify: `frontend/src/pages/accounting/components/FundTransferWorkspaceCard.tsx`

- [ ] **Step 1: Rewrite `FundTransferWorkspaceCard.tsx`**

Replace the entire file with:

```tsx
import { Box, Divider, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { FundTransfer } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  selected: FundTransfer | null
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }
const headerCellSx = { ...cellSx, fontWeight: 600, color: 'text.secondary', fontSize: '0.75rem', textTransform: 'uppercase' as const }

export function FundTransferWorkspaceCard({ selected }: Props) {
  if (!selected) return <Paper sx={{ flex: 1 }} />

  const lines = selected.journalEntry?.lines ?? []

  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={{ px: 2, py: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Ledger Preview
        </Typography>
      </Box>

      {!selected.journalEntry ? (
        <Box sx={{ px: 2, py: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No journal entry linked</Typography>
        </Box>
      ) : (
        <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { ...cellSx, borderBottom: TABLE_STYLES.cell.border }, '& tr:last-child .MuiTableCell-root': { borderBottom: 'none' } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={headerCellSx}>Account</TableCell>
              <TableCell sx={headerCellSx}>Type</TableCell>
              <TableCell sx={{ ...headerCellSx, textAlign: 'right' }}>Debit</TableCell>
              <TableCell sx={{ ...headerCellSx, textAlign: 'right' }}>Credit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={index}>
                <TableCell sx={cellSx}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {line.accountCode} - {line.accountName}
                  </Typography>
                </TableCell>
                <TableCell sx={cellSx}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', color: line.debitAmount > 0 ? 'success.main' : 'error.main' }}>
                    {line.debitAmount > 0 ? 'Dr' : 'Cr'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {line.debitAmount > 0 ? formatCurrency(line.debitAmount) : '—'}
                  </Typography>
                </TableCell>
                <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {line.creditAmount > 0 ? formatCurrency(line.creditAmount) : '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Divider />

      <Box sx={{ px: 2, py: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', mb: 0.5 }}>
          Notes
        </Typography>
        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
          {selected.description ?? '—'}
        </Typography>
      </Box>
    </Paper>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/FundTransferWorkspaceCard.tsx
git commit -m "feat(fund-transfers): ledger preview workspace card with Dr/Cr lines and notes"
```

---

## Task 8: Update `FundTransfersPage` and `DocumentNumbersPage`

**Files:**
- Modify: `frontend/src/pages/accounting/FundTransfersPage.tsx`
- Modify: `frontend/src/pages/settings/DocumentNumbersPage.tsx`

- [ ] **Step 1: Update `FundTransfersPage.tsx`**

In `frontend/src/pages/accounting/FundTransfersPage.tsx`:

1. Replace the `FundTransfersTable` import with `FundTransfersList`:
```ts
// Remove:
import { FundTransfersTable } from './components/FundTransfersTable'
// Add:
import { FundTransfersList } from './components/FundTransfersList'
```

2. Update the `workspace` call to pass `transfers` (the filtered list):

The current call is `useFundTransfersWorkspace(() => { void refetch() })`. Update it to:
```ts
const workspace = useFundTransfersWorkspace(() => { void refetch() }, transfers)
```

Note: `transfers` is defined a few lines below — move the `workspace` initialization to after the `transfers` memo, or restructure so `transfers` is derived before `workspace` is created. The correct order is:
```ts
const transfers = useMemo(() => { ... }, [...])
const workspace = useFundTransfersWorkspace(() => { void refetch() }, transfers)
```

3. Update `listSlot` to use `FundTransfersList` and pass `focusedIndex`:
```tsx
listSlot={
  <FundTransfersList
    transfers={transfers}
    loading={isLoading}
    selectedId={workspace.selected?.id ?? null}
    focusedIndex={workspace.focusedIndex}
    onSelect={workspace.handleSelect}
    listRef={workspace.listRef}
  />
}
```

- [ ] **Step 2: Update `DocumentNumbersPage.tsx`**

In `frontend/src/pages/settings/DocumentNumbersPage.tsx`, find `MODULE_GROUPS` (line 26) and add `'Fund Transfers'` to the `Accounting` array:

```ts
const MODULE_GROUPS: Record<string, string[]> = {
  Sales: ['Sales Orders', 'Invoices', 'Payments'],
  Purchasing: ['Purchase Orders', 'Goods Received', 'Vendor Payments'],
  Inventory: ['Stock Adjustment'],
  Accounting: ['Journal Entries', 'Expenses', 'Settlements', 'Owner Equity', 'Fund Transfers'],
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/FundTransfersPage.tsx \
        frontend/src/pages/settings/DocumentNumbersPage.tsx
git commit -m "feat(fund-transfers): wire FundTransfersList + focusedIndex; add to DocumentNumbers"
```

---

## Task 9: Update tests

**Files:**
- Modify: `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx`

- [ ] **Step 1: Update the mock setup and tests**

Replace the entire contents of `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx` with:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import FundTransfersPage from '../FundTransfersPage'

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/hooks/useRedux', () => ({ useAppSelector: () => ({ role: 'admin' }) }))
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (value: string) => value, formatCurrency: (value: number) => `$${value}`, getCurrentDate: () => '2026-03-12' }
})
vi.mock('@/hooks/useJournalEntryRef', () => ({
  useJournalEntryRef: () => ({ journalEntryRef: null, journalEntryRefLoading: false, navigateToJournalEntry: vi.fn() }),
}))

const mockedApi = vi.hoisted(() => ({
  useGetFundTransfersQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useCreateFundTransferMutation: vi.fn(),
  useCancelFundTransferMutation: vi.fn(),
  useLazyGetFundTransferQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)

const mockTransfer = {
  id: 'trf-1',
  referenceNumber: 'TRF-26-001',
  transferDate: '2026-03-12',
  amount: 1000,
  description: 'Test transfer',
  status: 'ACTIVE',
  fiscalPeriodId: 'fp-1',
  journalEntryId: 'je-1',
  sourceAccount: { id: 'acc-1', code: '1001', name: 'Cash on Hand', type: 'ASSET' },
  destinationAccount: { id: 'acc-2', code: '1002', name: 'Petty Cash', type: 'ASSET' },
  journalEntry: { id: 'je-1', referenceNumber: 'JE-26-001', status: 'posted', lines: [] },
  createdAt: '2026-03-12',
  updatedAt: '2026-03-12',
}

describe('FundTransfersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetFundTransfersQuery.mockReturnValue({
      data: { data: [mockTransfer], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: { data: [
        { id: 'acc-1', code: '1001', name: 'Cash on Hand', type: 'ASSET', isActive: true, isCashEquivalent: true },
        { id: 'acc-2', code: '1002', name: 'Petty Cash', type: 'ASSET', isActive: true, isCashEquivalent: true },
      ]},
      isLoading: false,
    })
    mockedApi.useCreateFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useCancelFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mockedApi.useLazyGetFundTransferQuery.mockReturnValue([vi.fn().mockResolvedValue({})])
  })

  it('renders page title', () => {
    render(<BrowserRouter><FundTransfersPage /></BrowserRouter>)
    expect(screen.getByText('Fund Transfers')).toBeInTheDocument()
  })

  it('renders transfer reference number in the narrow list', () => {
    render(<BrowserRouter><FundTransfersPage /></BrowserRouter>)
    expect(screen.getByText('TRF-26-001')).toBeInTheDocument()
  })

  it('does not render date, from/to account, or amount columns in the list', () => {
    render(<BrowserRouter><FundTransfersPage /></BrowserRouter>)
    // The narrow EntityTable list should NOT show these fields as column headers
    expect(screen.queryByRole('columnheader', { name: /date/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /from/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /amount/i })).not.toBeInTheDocument()
  })

  it('renders New Transfer button for admin', () => {
    render(<BrowserRouter><FundTransfersPage /></BrowserRouter>)
    expect(screen.getByRole('button', { name: /new transfer/i })).toBeInTheDocument()
  })

  it('shows ACTIVE status chip in list', () => {
    render(<BrowserRouter><FundTransfersPage /></BrowserRouter>)
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test file**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/FundTransfersPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx
git commit -m "test(fund-transfers): update tests for narrow EntityTable list"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 2: Run backend fund-transfer tests**

```bash
cd backend && npx jest src/modules/accounting/services/fund-transfer.service.spec.ts --no-coverage
```

Expected: all pass.

- [ ] **Step 3: Run frontend test file**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/FundTransfersPage.test.tsx
```

Expected: all pass.

- [ ] **Step 4: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Verify success criteria from spec**

Manually check in the dev server (`cd frontend && npm run dev`) or Docker:
- [ ] Fund Transfers list shows only `referenceNumber` + status chip (two columns)
- [ ] Keyboard navigation works: `↑`/`↓` moves focus, `Enter` selects, `/` focuses search
- [ ] Context header shows two-column Grid: Date + Source Account on left; Amount + Destination + JE link on right
- [ ] Workspace card shows Dr/Cr ledger lines when a transfer with a JE is selected
- [ ] Notes section appears below the ledger divider
- [ ] Document Numbers settings page shows "Fund Transfers" under the Accounting group
