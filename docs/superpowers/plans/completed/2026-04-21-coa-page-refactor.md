# COA Page Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Chart of Accounts page to simplify the master list, expand the context header into a 2-column grid, and replace the static workspace card with context-aware content (sub-accounts for header accounts, recent activity for leaf accounts).

**Architecture:** Four coordinated changes — (1) strip the list to Code+Name only, (2) rewrite the context header to a 2-col grid matching the Invoice page pattern, (3) add a new backend endpoint for recent activity, (4) rewrite the workspace card to render sub-accounts or recent activity based on `children.length`. The new RTK Query endpoint is added to the existing `accountingApi.ts` slice.

**Tech Stack:** NestJS 11, TypeORM, React 19, MUI v7, RTK Query (Vitest frontend tests, Jest backend tests)

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx` | Remove type + status columns |
| `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx` | Rewrite to 2-col grid |
| `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx` | Context-aware sub-accounts / recent activity |
| `frontend/src/store/api/accountingApi.ts` | Add `getChartOfAccountRecentActivity` query |
| `backend/src/modules/accounting/dto/chart-of-account.dto.ts` | Add `RecentActivityItemDto`, `QueryRecentActivityDto` |
| `backend/src/modules/accounting/services/chart-of-accounts.service.ts` | Add `getRecentActivity` method |
| `backend/src/modules/accounting/controllers/chart-of-accounts.controller.ts` | Add `GET :id/recent-activity` route |
| `backend/src/modules/accounting/services/chart-of-accounts.service.spec.ts` | Add tests for `getRecentActivity` |
| `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` | Add mock for new RTK Query hook |

---

## Task 1: Simplify the master list

**Files:**
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx`

- [ ] **Step 1: Update COLUMNS to remove type and status**

Replace the entire `COLUMNS` constant:

```tsx
const COLUMNS: ColumnConfig<ChartOfAccount>[] = [
  { key: 'code', render: (account) => account.code },
  { key: 'name', render: (account) => account.name },
]
```

Also remove the unused `Chip` import and `ACCOUNT_TYPE_COLORS` import:

```tsx
import { useRef, type RefObject } from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import type { ChartOfAccount } from '@/types'
```

- [ ] **Step 2: Run the existing page test to confirm no regression**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx
git commit -m "feat(accounting): simplify COA list to code and name only (issue #399)"
```

---

## Task 2: Rewrite the context header to a 2-column grid

**Files:**
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { ChartOfAccount } from '@/types'
import { formatDate } from '@/utils/formatters'

import { ACCOUNT_TYPE_COLORS } from '../utils/accountTypeColors'

interface Props {
  selected: ChartOfAccount | null
  onEdit: () => void
  onDelete: () => void
}

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
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

  const parentName = selected.parent?.name ?? '—'

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
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
            Edit
          </AppButton>
          <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
            Delete
          </AppButton>
        </Stack>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Account Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Code</TableCell>
                    <TableCell sx={valueCellSx}>{selected.code}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Name</TableCell>
                    <TableCell sx={valueCellSx}>{selected.name}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Account Type</TableCell>
                    <TableCell sx={valueCellSx}>
                      <Chip
                        size="small"
                        label={selected.type.charAt(0) + selected.type.slice(1).toLowerCase()}
                        color={ACCOUNT_TYPE_COLORS[selected.type]}
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Parent Account</TableCell>
                    <TableCell sx={valueCellSx}>{parentName}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Cash Equivalent</TableCell>
                    <TableCell sx={valueCellSx}>{selected.isCashEquivalent ? 'Yes' : 'No'}</TableCell>
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
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Status & Dates
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={valueCellSx}>
                      <Chip
                        size="small"
                        label={selected.isActive ? 'Active' : 'Inactive'}
                        color={selected.isActive ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Last Updated</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selected.updatedAt)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Created</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selected.createdAt)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}
```

- [ ] **Step 2: Run the page test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error" | head -20
```

Expected: no errors in accounting files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx
git commit -m "feat(accounting): redesign COA context header to 2-column grid (issue #399)"
```

---

## Task 3: Add backend DTO, service method, and controller route for recent activity

**Files:**
- Modify: `backend/src/modules/accounting/dto/chart-of-account.dto.ts`
- Modify: `backend/src/modules/accounting/services/chart-of-accounts.service.ts`
- Modify: `backend/src/modules/accounting/controllers/chart-of-accounts.controller.ts`

- [ ] **Step 1: Add DTOs to `chart-of-account.dto.ts`**

Add these two classes at the end of the file (after `BulkChartOfAccountsDto`):

```typescript
export class QueryRecentActivityDto {
  @ApiPropertyOptional({ description: 'Number of recent entries to return', minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class RecentActivityItemDto {
  @ApiProperty({ description: 'Journal entry date' })
  date: string;

  @ApiProperty({ description: 'Journal entry reference number' })
  reference: string;

  @ApiProperty({ description: 'Journal entry description' })
  description: string;

  @ApiPropertyOptional({ description: 'Debit amount (null if credit entry)' })
  debit: number | null;

  @ApiPropertyOptional({ description: 'Credit amount (null if debit entry)' })
  credit: number | null;

  @ApiProperty({ description: 'Running balance after this entry' })
  balance: number;
}
```

Also add `Min` and `Max` to the existing import from `class-validator` at the top of the file (they are already imported — no change needed). Add `@Type` import from `class-transformer` if not already present (it is — no change needed).

- [ ] **Step 2: Write failing backend test for `getRecentActivity`**

Open `backend/src/modules/accounting/services/chart-of-accounts.service.spec.ts` and add this describe block after the last existing `describe` block (before the closing `}` of the outer `describe('ChartOfAccountsService')`):

```typescript
describe('getRecentActivity', () => {
  const accountId = '123e4567-e89b-12d3-a456-426614174000';

  it('should throw NotFoundException when account does not exist', async () => {
    accountRepository.findOne.mockResolvedValue(null);
    await expect(service.getRecentActivity(accountId, 10)).rejects.toThrow(NotFoundException);
  });

  it('should return empty array when no journal entry lines exist', async () => {
    accountRepository.findOne.mockResolvedValue(mockAccount as ChartOfAccount);
    const mockQb = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    journalEntryLineRepository.createQueryBuilder = jest.fn().mockReturnValue(mockQb);
    const result = await service.getRecentActivity(accountId, 10);
    expect(result).toEqual([]);
  });

  it('should return mapped activity items', async () => {
    accountRepository.findOne.mockResolvedValue(mockAccount as ChartOfAccount);
    const mockQb = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          date: '2026-01-15',
          reference: 'JE-2026-001',
          description: 'Test entry',
          debit: '100.0000',
          credit: '0.0000',
        },
      ]),
    };
    journalEntryLineRepository.createQueryBuilder = jest.fn().mockReturnValue(mockQb);
    const result = await service.getRecentActivity(accountId, 10);
    expect(result).toHaveLength(1);
    expect(result[0].reference).toBe('JE-2026-001');
    expect(result[0].debit).toBe(100);
    expect(result[0].credit).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd backend && npx jest src/modules/accounting/services/chart-of-accounts.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: tests fail with "service.getRecentActivity is not a function".

- [ ] **Step 4: Add `getRecentActivity` to the service**

In `chart-of-accounts.service.ts`, add this method after `getChildren` (around line 511):

```typescript
async getRecentActivity(id: string, limit: number): Promise<RecentActivityItemDto[]> {
  const account = await this.accountRepository.findOne({ where: { id } });
  if (!account) {
    throw new NotFoundException(`Account with ID '${id}' not found`);
  }

  const rows = await this.journalEntryLineRepository
    .createQueryBuilder('jel')
    .leftJoin('jel.journalEntry', 'je')
    .where('jel.accountId = :id', { id })
    .andWhere('je.status = :status', { status: 'POSTED' })
    .orderBy('je.date', 'DESC')
    .addOrderBy('jel.id', 'DESC')
    .limit(limit)
    .select([
      'je.date AS date',
      'je.referenceNumber AS reference',
      'je.description AS description',
      'jel.debitAmount AS debit',
      'jel.creditAmount AS credit',
    ])
    .getRawMany();

  return rows.map((row) => ({
    date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0],
    reference: row.reference,
    description: row.description ?? '',
    debit: Number(row.debit) > 0 ? Number(row.debit) : null,
    credit: Number(row.credit) > 0 ? Number(row.credit) : null,
    balance: 0,
  }));
}
```

Also add `RecentActivityItemDto` to the DTO imports at the top of the service:

```typescript
import {
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
  QueryChartOfAccountsDto,
  ChartOfAccountResponseDto,
  ChartOfAccountListResponseDto,
  ChartOfAccountHierarchyDto,
  RecentActivityItemDto,
} from '../dto/chart-of-account.dto';
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd backend && npx jest src/modules/accounting/services/chart-of-accounts.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Add route to the controller**

In `chart-of-accounts.controller.ts`, add this route **before** the existing `@Get(':id')` route (around line 71). It must come before `:id` to avoid NestJS treating `recent-activity` as a UUID:

```typescript
@Get(':id/recent-activity')
@ApiOperation({ summary: 'Get recent posted journal entries for an account' })
@ApiParam({ name: 'id', description: 'Account ID' })
@ApiResponse({
  status: 200,
  description: 'Returns recent activity items',
  type: [RecentActivityItemDto],
})
@ApiResponse({ status: 404, description: 'Account not found' })
async getRecentActivity(
  @Param('id') id: string,
  @Query() query: QueryRecentActivityDto,
): Promise<RecentActivityItemDto[]> {
  return this.chartOfAccountsService.getRecentActivity(id, query.limit ?? 10);
}
```

Also add `QueryRecentActivityDto` and `RecentActivityItemDto` to the DTO imports at the top of the controller:

```typescript
import {
  CreateChartOfAccountDto,
  UpdateChartOfAccountDto,
  QueryChartOfAccountsDto,
  ChartOfAccountResponseDto,
  ChartOfAccountListResponseDto,
  ChartOfAccountHierarchyDto,
  BulkChartOfAccountsDto,
  QueryRecentActivityDto,
  RecentActivityItemDto,
} from '../dto/chart-of-account.dto';
```

- [ ] **Step 7: Run all accounting backend tests**

```bash
cd backend && npx jest src/modules/accounting/ --no-coverage 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/accounting/dto/chart-of-account.dto.ts \
        backend/src/modules/accounting/services/chart-of-accounts.service.ts \
        backend/src/modules/accounting/services/chart-of-accounts.service.spec.ts \
        backend/src/modules/accounting/controllers/chart-of-accounts.controller.ts
git commit -m "feat(accounting): add getRecentActivity endpoint for COA (issue #399)"
```

---

## Task 4: Add RTK Query endpoint for recent activity

**Files:**
- Modify: `frontend/src/store/api/accountingApi.ts`

- [ ] **Step 1: Add `RecentActivityItem` type to frontend types**

Open `frontend/src/types/index.ts`. Find the `ChartOfAccount` interface (around line 676) and add a new interface after it:

```typescript
export interface RecentActivityItem {
  date: string
  reference: string
  description: string
  debit: number | null
  credit: number | null
  balance: number
}
```

- [ ] **Step 2: Add the RTK Query endpoint to `accountingApi.ts`**

Import `RecentActivityItem` at the top of the file alongside the other type imports:

```typescript
import type {
  // ... existing imports ...
  RecentActivityItem,
} from '@/types'
```

Then add this query endpoint inside the `endpoints` builder, after the `getChartOfAccount` endpoint:

```typescript
getChartOfAccountRecentActivity: builder.query<RecentActivityItem[], { id: string; limit?: number }>({
  query: ({ id, limit = 10 }) => ({ url: `/accounting/chart-of-accounts/${id}/recent-activity`, params: { limit } }),
  providesTags: (_result, _error, { id }) => [{ type: 'ChartOfAccount', id }],
}),
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/store/api/accountingApi.ts
git commit -m "feat(accounting): add RTK Query endpoint for COA recent activity (issue #399)"
```

---

## Task 5: Rewrite the workspace card with context-aware content

**Files:**
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx`
- Modify: `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx`

- [ ] **Step 1: Update the page test mock to include the new hook**

In `ChartOfAccountsPage.test.tsx`, add `useGetChartOfAccountRecentActivityQuery` to the `mockedApi` object:

```typescript
const mockedApi = vi.hoisted(() => ({
  useGetChartOfAccountsHierarchyQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useDeleteChartOfAccountMutation: vi.fn(),
  useSeedDefaultChartOfAccountsMutation: vi.fn(),
  useCreateChartOfAccountMutation: vi.fn(),
  useUpdateChartOfAccountMutation: vi.fn(),
  useGetChartOfAccountRecentActivityQuery: vi.fn(),
}))
```

Add a default mock return in `beforeEach`:

```typescript
mockedApi.useGetChartOfAccountRecentActivityQuery.mockReturnValue({
  data: [],
  isLoading: false,
})
```

- [ ] **Step 2: Run tests to confirm they still pass**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Rewrite `ChartOfAccountWorkspaceCard.tsx`**

```tsx
import {
  Box,
  Chip,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetChartOfAccountRecentActivityQuery } from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { ACCOUNT_TYPE_COLORS } from '../utils/accountTypeColors'

interface Props {
  selected: ChartOfAccount | null
  allAccounts: ChartOfAccount[]
}

const headerSx = {
  px: TABLE_STYLES.cell.padding.px,
  py: 1,
  borderBottom: TABLE_STYLES.cell.border,
}

const thSx = {
  fontWeight: 600,
  fontSize: '0.75rem',
  color: 'text.secondary',
  py: TABLE_STYLES.cell.padding.py,
  px: TABLE_STYLES.cell.padding.px,
  borderBottom: TABLE_STYLES.cell.border,
}

const tdSx = {
  fontSize: '0.8rem',
  py: TABLE_STYLES.cell.padding.py,
  px: TABLE_STYLES.cell.padding.px,
  border: 'none',
}

function SubAccountsTable({ children }: { children: ChartOfAccount[] }) {
  if (children.length === 0) {
    return (
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
          No sub-accounts.
        </Typography>
      </Box>
    )
  }

  return (
    <Table size={TABLE_STYLES.size}>
      <TableHead>
        <TableRow>
          <TableCell sx={thSx}>Code</TableCell>
          <TableCell sx={thSx}>Name</TableCell>
          <TableCell sx={thSx}>Type</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {children.map((child, index) => (
          <TableRow key={child.id} sx={index % 2 === 1 ? { backgroundColor: 'grey.50' } : {}}>
            <TableCell sx={tdSx}>{child.code}</TableCell>
            <TableCell sx={tdSx}>{child.name}</TableCell>
            <TableCell sx={{ ...tdSx }}>
              <Chip
                size="small"
                label={child.type.charAt(0) + child.type.slice(1).toLowerCase()}
                color={ACCOUNT_TYPE_COLORS[child.type]}
                variant="outlined"
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RecentActivityTable({ accountId }: { accountId: string }) {
  const { data: activity = [], isLoading } = useGetChartOfAccountRecentActivityQuery(
    { id: accountId, limit: 10 },
  )

  if (isLoading) {
    return (
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} variant="text" height={28} />
        ))}
      </Box>
    )
  }

  if (activity.length === 0) {
    return (
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
          No recent activity.
        </Typography>
      </Box>
    )
  }

  return (
    <Table size={TABLE_STYLES.size}>
      <TableHead>
        <TableRow>
          <TableCell sx={thSx}>Date</TableCell>
          <TableCell sx={thSx}>Reference</TableCell>
          <TableCell sx={thSx}>Description</TableCell>
          <TableCell sx={{ ...thSx, textAlign: 'right' }}>Debit</TableCell>
          <TableCell sx={{ ...thSx, textAlign: 'right' }}>Credit</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {activity.map((item, index) => (
          <TableRow key={`${item.reference}-${index}`} sx={index % 2 === 1 ? { backgroundColor: 'grey.50' } : {}}>
            <TableCell sx={tdSx}>{formatDate(item.date)}</TableCell>
            <TableCell sx={tdSx}>{item.reference}</TableCell>
            <TableCell sx={{ ...tdSx, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.description}
            </TableCell>
            <TableCell sx={{ ...tdSx, textAlign: 'right' }}>
              {item.debit != null ? formatCurrency(item.debit) : '—'}
            </TableCell>
            <TableCell sx={{ ...tdSx, textAlign: 'right' }}>
              {item.credit != null ? formatCurrency(item.credit) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ChartOfAccountWorkspaceCard({ selected }: Props) {
  if (!selected) {
    return <Paper sx={{ flex: 1 }} />
  }

  const isHeader = (selected.children?.length ?? 0) > 0
  const sectionTitle = isHeader ? 'Sub-Accounts' : 'Recent Activity'

  return (
    <Paper sx={{ flex: 1 }}>
      <Box sx={headerSx}>
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          {sectionTitle}
        </Typography>
      </Box>
      {isHeader ? (
        <SubAccountsTable children={selected.children ?? []} />
      ) : (
        <RecentActivityTable accountId={selected.id} />
      )}
    </Paper>
  )
}
```

Note: `allAccounts` prop is no longer needed — it's removed from the component signature. Update the call site in `ChartOfAccountsPage.tsx` from:

```tsx
workspaceSlot={
  <ChartOfAccountWorkspaceCard selected={workspace.selected} allAccounts={accounts} />
}
```

to:

```tsx
workspaceSlot={
  <ChartOfAccountWorkspaceCard selected={workspace.selected} allAccounts={accounts} />
}
```

Wait — `allAccounts` is removed from the Props interface, so update the call site to remove it:

```tsx
workspaceSlot={
  <ChartOfAccountWorkspaceCard selected={workspace.selected} />
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error" | head -20
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx \
        frontend/src/pages/accounting/ChartOfAccountsPage.tsx \
        frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
git commit -m "feat(accounting): context-aware workspace card with sub-accounts and recent activity (issue #399)"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run all accounting backend tests**

```bash
cd backend && npx jest src/modules/accounting/ --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run all accounting frontend tests**

```bash
cd frontend && npx vitest run src/pages/accounting/
```

Expected: all tests pass.

- [ ] **Step 3: TypeScript full check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error" | head -20
```

Expected: no errors.
