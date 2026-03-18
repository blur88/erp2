# Journal Entries UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Journal Entries list page to be view-only with dark mode styling, clickable navigation links, and aggregate totals in the summary row.

**Architecture:** Backend adds two new DTO params (`excludeDraft`, `hasReversal`) and returns aggregate totals (`totalDebitAmount`, `totalCreditAmount`) in `meta`. Frontend rewrites `JournalEntriesPage.tsx` from scratch following the `FiscalPeriodsPage` / `BankReconciliationsPage` pattern — Paper filter bar, summary row, simplified Table, no mutation controls.

**Tech Stack:** NestJS 11 (TypeORM QueryBuilder, class-validator, class-transformer), React 19, Material UI v7, RTK Query, Vitest (frontend), Jest (backend)

---

## File Map

| File | Change |
|------|--------|
| `backend/src/modules/accounting/dto/journal-entry.dto.ts` | Add `excludeDraft`, `hasReversal` to `QueryJournalEntriesDto`; add `totalDebitAmount`, `totalCreditAmount` to `JournalEntryListResponseDto.meta` |
| `backend/src/modules/accounting/services/journal-entry.service.ts` | Update `findAll()` to apply new filters and compute aggregate totals via separate `journal_entry_lines` query |
| `backend/src/modules/accounting/services/journal-entry.service.spec.ts` | Add tests for new filters and aggregate totals |
| `frontend/src/types/index.ts` | Add `JournalEntryPaginatedResponse` interface |
| `frontend/src/store/api/accountingApi.ts` | Update `getJournalEntries` return type and `transformResponse` to preserve new meta fields |
| `frontend/src/pages/accounting/JournalEntriesPage.tsx` | Full rewrite — new layout, filters, summary row, simplified table |
| `frontend/src/pages/accounting/JournalEntriesPage.test.tsx` | Full rewrite — new test coverage for redesigned page |
| `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx` | Delete — duplicate; co-located file is canonical |

---

## Chunk 1: Backend DTO and Service Changes

### Task 1: Add `excludeDraft` and `hasReversal` to `QueryJournalEntriesDto`

**Files:**
- Modify: `backend/src/modules/accounting/dto/journal-entry.dto.ts`

- [ ] **Step 1: Write the failing backend tests**

Open `backend/src/modules/accounting/services/journal-entry.service.spec.ts`. Inside the existing `describe('findAll', ...)` block (after the last `it(...)` at line ~432), add:

```typescript
it('should exclude DRAFT entries when excludeDraft is true', async () => {
  const queryDto: QueryJournalEntriesDto = { page: 1, limit: 20, excludeDraft: true };

  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawOne: jest.fn().mockResolvedValue({ totalDebitAmount: '0', totalCreditAmount: '0' }),
  };

  journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

  await service.findAll(queryDto);

  expect(queryBuilder.andWhere).toHaveBeenCalledWith(
    "entry.status != :draftStatus",
    { draftStatus: JournalEntryStatus.DRAFT },
  );
});

it('should filter entries with reversals when hasReversal is true', async () => {
  const queryDto: QueryJournalEntriesDto = { page: 1, limit: 20, hasReversal: true };

  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawOne: jest.fn().mockResolvedValue({ totalDebitAmount: '0', totalCreditAmount: '0' }),
  };

  journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

  await service.findAll(queryDto);

  expect(queryBuilder.andWhere).toHaveBeenCalledWith(
    '(entry.reversedById IS NOT NULL OR entry.reversalOfId IS NOT NULL)',
  );
});

it('should filter entries without reversals when hasReversal is false', async () => {
  const queryDto: QueryJournalEntriesDto = { page: 1, limit: 20, hasReversal: false };

  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawOne: jest.fn().mockResolvedValue({ totalDebitAmount: '0', totalCreditAmount: '0' }),
  };

  journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

  await service.findAll(queryDto);

  expect(queryBuilder.andWhere).toHaveBeenCalledWith(
    '(entry.reversedById IS NULL AND entry.reversalOfId IS NULL)',
  );
});

it('should return totalDebitAmount and totalCreditAmount in meta', async () => {
  const queryDto: QueryJournalEntriesDto = { page: 1, limit: 20 };

  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[mockJournalEntry], 1]),
    getRawOne: jest.fn().mockResolvedValue({ totalDebitAmount: '1500.00', totalCreditAmount: '1500.00' }),
  };

  journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

  const result = await service.findAll(queryDto);

  expect(result.meta.totalDebitAmount).toBe(1500);
  expect(result.meta.totalCreditAmount).toBe(1500);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage
```

Expected: 4 new tests fail. Existing tests still pass.

- [ ] **Step 3: Add `excludeDraft` and `hasReversal` to `QueryJournalEntriesDto`**

In `backend/src/modules/accounting/dto/journal-entry.dto.ts`, add `Transform` and `IsBoolean` to the imports:

```typescript
// Change this line (line ~17):
import { Type } from 'class-transformer';
// To:
import { Transform, Type } from 'class-transformer';
```

Also add `IsBoolean` to the class-validator import (line ~1):
```typescript
// Add IsBoolean to the existing import:
import {
  IsString, IsEnum, IsOptional, IsDate, IsNumber, IsUUID,
  IsArray, ValidateNested, MaxLength, Min, Max, IsDecimal,
  IsDateString, ArrayMinSize, IsBoolean,
} from 'class-validator';
```

Then add two new fields at the end of `QueryJournalEntriesDto` (after the last existing field, before the closing `}`):

```typescript
@ApiPropertyOptional({ description: 'Exclude DRAFT entries' })
@IsOptional()
@Transform(({ value }) => value === 'true' || value === true)
@IsBoolean()
excludeDraft?: boolean;

@ApiPropertyOptional({ description: 'Filter by reversal relationship: true=has reversal, false=no reversal' })
@IsOptional()
@Transform(({ value }) => value === 'true' || value === true)
@IsBoolean()
hasReversal?: boolean;
```

- [ ] **Step 4: Add `totalDebitAmount` and `totalCreditAmount` to `JournalEntryListResponseDto.meta`**

Find `JournalEntryListResponseDto` (line ~363). Update the `meta` property:

```typescript
@ApiProperty({ description: 'Pagination metadata' })
meta: {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  totalDebitAmount: number;
  totalCreditAmount: number;
};
```

- [ ] **Step 5: Update the three existing `findAll` test mocks to include `getRawOne`**

The service refactor in Step 6 adds a second `createQueryBuilder` call (for the aggregate query) that calls `.getRawOne()`. The existing three `findAll` tests use `mockReturnValue` (not `mockReturnValueOnce`), so the same mock object is returned for both calls — without `getRawOne`, they will throw `TypeError: aggregateQueryBuilder.getRawOne is not a function`.

Open `backend/src/modules/accounting/services/journal-entry.service.spec.ts`. Find the three existing `findAll` test mocks (the `queryBuilder` objects at lines ~362, ~388, ~414) and add `getRawOne` to each:

```typescript
// Add this line to each of the three existing queryBuilder mocks in the findAll describe block:
getRawOne: jest.fn().mockResolvedValue({ totalDebitAmount: '0', totalCreditAmount: '0' }),
```

Run existing tests to confirm they still pass before touching the service:

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage
```

Expected: All existing tests pass.

- [ ] **Step 6: Update `findAll()` in the service**

In `backend/src/modules/accounting/services/journal-entry.service.ts`, update the `findAll()` method.

**5a** — Update the destructuring at line ~128 to include the new params:

```typescript
const {
  page = 1,
  limit = 20,
  search,
  status,
  fiscalPeriodId,
  sourceType,
  sourceId,
  startDate,
  endDate,
  sortBy = 'entryDate',
  sortOrder = 'ASC',
  excludeDraft,
  hasReversal,
} = query;
```

**5b** — Add a shared condition-building helper function directly above `findAll()` (or as a private method). This ensures both the paginated query and aggregate query use identical conditions:

```typescript
private applyJournalEntryFilters(
  queryBuilder: any,
  params: {
    search?: string;
    status?: JournalEntryStatus;
    fiscalPeriodId?: string;
    sourceType?: string;
    sourceId?: string;
    startDate?: Date;
    endDate?: Date;
    excludeDraft?: boolean;
    hasReversal?: boolean;
  },
): void {
  const { search, status, fiscalPeriodId, sourceType, sourceId, startDate, endDate, excludeDraft, hasReversal } = params;

  if (search) {
    queryBuilder.andWhere(
      '(entry.referenceNumber ILIKE :search OR entry.description ILIKE :search)',
      { search: `%${search}%` },
    );
  }
  if (status) {
    queryBuilder.andWhere('entry.status = :status', { status });
  }
  if (excludeDraft) {
    queryBuilder.andWhere('entry.status != :draftStatus', { draftStatus: JournalEntryStatus.DRAFT });
  }
  if (hasReversal === true) {
    queryBuilder.andWhere('(entry.reversedById IS NOT NULL OR entry.reversalOfId IS NOT NULL)');
  } else if (hasReversal === false) {
    queryBuilder.andWhere('(entry.reversedById IS NULL AND entry.reversalOfId IS NULL)');
  }
  if (fiscalPeriodId) {
    queryBuilder.andWhere('entry.fiscalPeriodId = :fiscalPeriodId', { fiscalPeriodId });
  }
  if (sourceType) {
    queryBuilder.andWhere('entry.sourceType = :sourceType', { sourceType });
  }
  if (sourceId) {
    queryBuilder.andWhere('entry.sourceId = :sourceId', { sourceId });
  }
  if (startDate && endDate) {
    queryBuilder.andWhere('entry.entryDate BETWEEN :startDate AND :endDate', { startDate, endDate });
  } else if (startDate) {
    queryBuilder.andWhere('entry.entryDate >= :startDate', { startDate });
  } else if (endDate) {
    queryBuilder.andWhere('entry.entryDate <= :endDate', { endDate });
  }
}
```

**5c** — Replace the filter block in `findAll()` (lines ~149–182) with a call to the helper:

```typescript
// Replace the individual if-blocks for search/status/fiscalPeriodId/etc. with:
this.applyJournalEntryFilters(queryBuilder, {
  search, status, fiscalPeriodId, sourceType, sourceId,
  startDate, endDate, excludeDraft, hasReversal,
});
```

**5d** — Add the aggregate query after the paginated `getManyAndCount()` call (line ~198), and update the return:

```typescript
// After: const [entries, total] = await queryBuilder.getManyAndCount();

// Build aggregate query with identical filters
const aggregateQueryBuilder = this.journalEntryRepository
  .createQueryBuilder('entry')
  .select('COALESCE(SUM(lines.debitAmount), 0)', 'totalDebitAmount')
  .addSelect('COALESCE(SUM(lines.creditAmount), 0)', 'totalCreditAmount')
  .leftJoin('entry.lines', 'lines')
  .where('entry.deletedAt IS NULL');

this.applyJournalEntryFilters(aggregateQueryBuilder, {
  search, status, fiscalPeriodId, sourceType, sourceId,
  startDate, endDate, excludeDraft, hasReversal,
});

const aggregateResult = await aggregateQueryBuilder.getRawOne();
const totalDebitAmount = parseFloat(aggregateResult?.totalDebitAmount ?? '0');
const totalCreditAmount = parseFloat(aggregateResult?.totalCreditAmount ?? '0');

// Update the return:
return {
  data,
  meta: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPreviousPage: page > 1,
    totalDebitAmount,
    totalCreditAmount,
  },
};
```

- [ ] **Step 7: Run the tests**

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage
```

Expected: All tests pass including the 4 new ones.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/accounting/dto/journal-entry.dto.ts \
        backend/src/modules/accounting/services/journal-entry.service.ts \
        backend/src/modules/accounting/services/journal-entry.service.spec.ts
git commit -m "feat(accounting): add excludeDraft/hasReversal filters and aggregate totals to journal entries API"
```

---

## Chunk 2: Frontend Type and API Changes

### Task 2: Add `JournalEntryPaginatedResponse` type and update `getJournalEntries`

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/store/api/accountingApi.ts`

- [ ] **Step 1: Add `JournalEntryPaginatedResponse` to types**

Open `frontend/src/types/index.ts`. Find `PaginatedResponse<T>` (line ~539):

```typescript
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
  };
}
```

Add the new interface immediately after it:

```typescript
export interface JournalEntryPaginatedResponse extends PaginatedResponse<JournalEntry> {
  meta: PaginatedResponse<JournalEntry>['meta'] & {
    totalDebitAmount: number;
    totalCreditAmount: number;
  };
}
```

- [ ] **Step 2: Update `getJournalEntries` in `accountingApi.ts`**

Open `frontend/src/store/api/accountingApi.ts`.

Add `JournalEntryPaginatedResponse` to the import from `@/types` (find the existing types import line and add it).

Find the `getJournalEntries` endpoint (line ~262):

```typescript
getJournalEntries: builder.query<PaginatedResponse<JournalEntry>, Record<string, unknown> | undefined>({
  query: (params) => ({ url: '/accounting/journal-entries', params: params ?? {} }),
  transformResponse: normalizePaginated<JournalEntry>,
  providesTags: ['JournalEntry'],
}),
```

Replace with:

```typescript
getJournalEntries: builder.query<JournalEntryPaginatedResponse, Record<string, unknown> | undefined>({
  query: (params) => ({ url: '/accounting/journal-entries', params: params ?? {} }),
  transformResponse: (response: any): JournalEntryPaginatedResponse => {
    const data = Array.isArray(response) ? response : (response?.data ?? [])
    const meta = response?.meta ?? {}
    return {
      data,
      meta: {
        total: meta.total ?? data.length,
        totalDebitAmount: parseFloat(meta.totalDebitAmount ?? '0'),
        totalCreditAmount: parseFloat(meta.totalCreditAmount ?? '0'),
      },
    }
  },
  providesTags: ['JournalEntry'],
}),
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No new type errors. Existing callers of `useGetJournalEntriesQuery` that only read `meta.total` continue to work because the new interface is additive.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts \
        frontend/src/store/api/accountingApi.ts
git commit -m "feat(accounting): add JournalEntryPaginatedResponse type with aggregate meta fields"
```

---

## Chunk 3: Frontend Page Rewrite

### Task 3: Rewrite `JournalEntriesPage.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx` (full rewrite)

**Before writing code, read these reference files:**
- `frontend/src/pages/accounting/FiscalPeriodsPage.tsx` — follow its header, filter bar, and table patterns
- `frontend/src/pages/accounting/BankReconciliationsPage.tsx` — follow its filter and pagination patterns
- `frontend/src/constants/typography.ts` — `TYPOGRAPHY_STYLES` and `TABLE_STYLES`

- [ ] **Step 1: Write the new `JournalEntriesPage.tsx`**

Replace the entire file content with:

```typescript
import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Breadcrumbs,
  Chip,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Stack,
  CircularProgress,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import DownloadIcon from '@mui/icons-material/Download'
import SearchIcon from '@mui/icons-material/Search'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import {
  useGetJournalEntriesQuery,
  useGetFiscalPeriodsQuery,
  useGetCurrentFiscalPeriodQuery,
} from '@/store/api/accountingApi'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'

// Maps backend lowercase sourceType values to navigation routes
const navigateToSourceTransaction = (
  navigate: ReturnType<typeof useNavigate>,
  sourceType: string,
  sourceId: string,
): void => {
  switch (sourceType) {
    case 'sales_order':
      navigate(`/sales/orders?highlight=${sourceId}`)
      break
    case 'payment':
      navigate(`/sales/payments?highlight=${sourceId}`)
      break
    case 'goods_received_note':
      navigate(`/purchasing/goods-received?grnId=${sourceId}`)
      break
    case 'vendor_payment':
      navigate(`/purchasing/vendor-payments?vpId=${sourceId}`)
      break
    case 'expense':
      navigate('/accounting/expenses')
      break
    case 'owner_equity_transaction':
      navigate('/accounting/owner-equity')
      break
    case 'stock_adjustment':
      navigate(`/inventory/stock-adjustments/${sourceId}/edit`)
      break
    case 'fund_transfer':
      navigate('/accounting/fund-transfers')
      break
    default:
      break
  }
}

const isNavigableSource = (sourceType?: string): boolean => {
  if (!sourceType || sourceType === 'manual') return false
  return [
    'sales_order', 'payment', 'goods_received_note', 'vendor_payment',
    'expense', 'owner_equity_transaction', 'stock_adjustment', 'fund_transfer',
  ].includes(sourceType)
}

const StatusChip: React.FC<{ entry: JournalEntry }> = ({ entry }) => {
  // Reversed entries: show error chip only
  if (entry.status === JournalEntryStatus.REVERSED) {
    return <Chip label="Reversed" color="error" size="small" />
  }
  // Reversal entries: show both Posted (success) AND Reversal (info) chips
  // reversalOfId is set on entries that are themselves reversals — status is POSTED
  if (entry.reversalOfId) {
    return (
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Chip label="Posted" color="success" size="small" />
        <Chip label="Reversal" color="info" size="small" />
      </Box>
    )
  }
  return <Chip label="Posted" color="success" size="small" />
}

const ReversalCell: React.FC<{ entry: JournalEntry; onNavigate: (id: string) => void }> = ({
  entry,
  onNavigate,
}) => {
  // Original entry that was reversed — points to the reversal entry
  if (entry.reversedById) {
    const label = entry.reversedBy?.referenceNumber ?? entry.reversedById
    return (
      <Link
        component="button"
        variant="body2"
        onClick={() => onNavigate(entry.reversedById!)}
        sx={{ cursor: 'pointer' }}
      >
        ↪ {label}
      </Link>
    )
  }
  // This entry is itself a reversal — points back to the original
  if (entry.reversalOfId) {
    const label = entry.reversalOf?.referenceNumber ?? entry.reversalOfId
    return (
      <Link
        component="button"
        variant="body2"
        onClick={() => onNavigate(entry.reversalOfId!)}
        sx={{ cursor: 'pointer' }}
      >
        ← {label}
      </Link>
    )
  }
  return <Typography variant="body2" color="text.secondary">—</Typography>
}

const JournalEntriesPage: React.FC = () => {
  const navigate = useNavigate()

  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [search, setSearch] = useState('')
  const [fiscalPeriodId, setFiscalPeriodId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [reversalFilter, setReversalFilter] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const queryParams: Record<string, unknown> = {
    page: page + 1,
    limit: rowsPerPage,
    excludeDraft: true,
    ...(search && { search }),
    ...(fiscalPeriodId && { fiscalPeriodId }),
    ...(statusFilter && { status: statusFilter }),
    ...(reversalFilter !== '' && { hasReversal: reversalFilter === 'has' }),
    _refresh: refreshKey,
  }

  const { data, isLoading, isFetching } = useGetJournalEntriesQuery(queryParams)
  const { data: fiscalPeriodsData } = useGetFiscalPeriodsQuery({ limit: 100 })
  const { data: currentPeriod } = useGetCurrentFiscalPeriodQuery()

  const entries: JournalEntry[] = data?.data ?? []
  const total = data?.meta?.total ?? 0
  const totalDebitAmount = data?.meta?.totalDebitAmount ?? 0
  const totalCreditAmount = data?.meta?.totalCreditAmount ?? 0
  const fiscalPeriods = fiscalPeriodsData?.data ?? []

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const handlePageChange = (_: unknown, newPage: number) => setPage(newPage)
  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10))
    setPage(0)
  }

  const periodLabel = currentPeriod
    ? `FY${new Date(currentPeriod.endDate).getFullYear()} • ${currentPeriod.name}`
    : null

  return (
    <Box sx={{ p: 3 }}>
      <AccountMappingWarning context="system" />

      {/* Breadcrumb */}
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link
          component="button"
          variant="body2"
          onClick={() => navigate('/accounting')}
          sx={{ cursor: 'pointer' }}
        >
          Accounting
        </Link>
        <Typography variant="body2" color="text.primary">
          Journal Entries
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MenuBookIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          <Box>
            <Typography sx={TYPOGRAPHY_STYLES.pageTitle}>
              Journal Entries
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {total} {total === 1 ? 'entry' : 'entries'}
              {periodLabel && (
                <Chip
                  label={periodLabel}
                  size="small"
                  variant="outlined"
                  sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export">
            <IconButton size="small">
              <DownloadIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Period</InputLabel>
            <Select
              value={fiscalPeriodId}
              label="Period"
              onChange={(e: SelectChangeEvent) => { setFiscalPeriodId(e.target.value); setPage(0) }}
            >
              <MenuItem value="">All Periods</MenuItem>
              {fiscalPeriods.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e: SelectChangeEvent) => { setStatusFilter(e.target.value); setPage(0) }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value={JournalEntryStatus.POSTED}>Posted</MenuItem>
              <MenuItem value={JournalEntryStatus.REVERSED}>Reversed</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Reversal</InputLabel>
            <Select
              value={reversalFilter}
              label="Reversal"
              onChange={(e: SelectChangeEvent) => { setReversalFilter(e.target.value); setPage(0) }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="has">Has Reversal</MenuItem>
              <MenuItem value="none">No Reversal</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            placeholder="Search JE No, reference, description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            sx={{ minWidth: 280 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Paper>

      {/* Summary Row */}
      <Box sx={{ mb: 1, display: 'flex', gap: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Entries: <strong>{total}</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Total Debit: <strong>{formatCurrency(totalDebitAmount)}</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Total Credit: <strong>{formatCurrency(totalCreditAmount)}</strong>
        </Typography>
      </Box>

      {/* Table */}
      <TableContainer component={Paper}>
        {(isLoading || isFetching) && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        <Table size={TABLE_STYLES.size}>
          <TableHead>
            <TableRow sx={{ backgroundColor: TABLE_STYLES.header.backgroundColor }}>
              <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border, ...TABLE_STYLES.header.padding }}>
                JE No
              </TableCell>
              <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border, ...TABLE_STYLES.header.padding }}>
                Date
              </TableCell>
              <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border, ...TABLE_STYLES.header.padding }}>
                Reference
              </TableCell>
              <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border, ...TABLE_STYLES.header.padding }}>
                Description
              </TableCell>
              <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border, ...TABLE_STYLES.header.padding }}>
                Status
              </TableCell>
              <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border, ...TABLE_STYLES.header.padding }}>
                Reversal
              </TableCell>
              <TableCell align="right" sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border, ...TABLE_STYLES.header.padding }}>
                Amount
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!isLoading && entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No journal entries found
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {entries.map((entry) => (
              <TableRow
                key={entry.id}
                sx={{ height: TABLE_STYLES.row.height, '&:hover': { opacity: 0.85 } }}
              >
                {/* JE No */}
                <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border }}>
                  <Link
                    component="button"
                    variant="body2"
                    onClick={() => navigate(`/accounting/journal-entries/${entry.id}`)}
                    sx={{ color: 'primary.main', cursor: 'pointer', fontWeight: 500 }}
                  >
                    {entry.referenceNumber}
                  </Link>
                </TableCell>

                {/* Date */}
                <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border }}>
                  <Typography variant="body2">{formatDate(entry.entryDate)}</Typography>
                </TableCell>

                {/* Reference */}
                <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border }}>
                  {entry.sourceType && isNavigableSource(entry.sourceType) && entry.sourceId ? (
                    <Link
                      component="button"
                      variant="body2"
                      onClick={() => navigateToSourceTransaction(navigate, entry.sourceType!, entry.sourceId!)}
                      sx={{ cursor: 'pointer' }}
                    >
                      {entry.sourceId}
                    </Link>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {entry.sourceType ?? '—'}
                    </Typography>
                  )}
                </TableCell>

                {/* Description */}
                <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border, maxWidth: 240 }}>
                  <Tooltip title={entry.description} placement="top">
                    <Typography
                      variant="body2"
                      sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {entry.description}
                    </Typography>
                  </Tooltip>
                </TableCell>

                {/* Status */}
                <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border }}>
                  <StatusChip entry={entry} />
                </TableCell>

                {/* Reversal */}
                <TableCell sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border }}>
                  <ReversalCell
                    entry={entry}
                    onNavigate={(id) => navigate(`/accounting/journal-entries/${id}`)}
                  />
                </TableCell>

                {/* Amount */}
                <TableCell align="right" sx={{ ...TABLE_STYLES.cell.padding, borderBottom: TABLE_STYLES.cell.border }}>
                  <Typography variant="body2">{formatCurrency(entry.totalDebits)}</Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handlePageChange}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={[10, 20, 50, 100]}
        />
      </TableContainer>
    </Box>
  )
}

export default JournalEntriesPage
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "feat(accounting): rewrite JournalEntriesPage with dark mode design, navigation links, and summary row"
```

---

## Chunk 4: Frontend Tests

### Task 4: Rewrite the frontend tests and delete the duplicate

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.test.tsx` (full rewrite)
- Delete: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

- [ ] **Step 1: Delete the duplicate test file**

```bash
rm frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
```

- [ ] **Step 2: Rewrite `JournalEntriesPage.test.tsx`**

Replace the entire file with:

```typescript
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import JournalEntriesPage from './JournalEntriesPage'
import { JournalEntryStatus } from '@/types'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    BrowserRouter: ({ children }: any) => <div>{children}</div>,
  }
})

const mockedApi = vi.hoisted(() => ({
  useGetJournalEntriesQuery: vi.fn(),
  useGetFiscalPeriodsQuery: vi.fn(),
  useGetCurrentFiscalPeriodQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetJournalEntriesQuery: mockedApi.useGetJournalEntriesQuery,
  useGetFiscalPeriodsQuery: mockedApi.useGetFiscalPeriodsQuery,
  useGetCurrentFiscalPeriodQuery: mockedApi.useGetCurrentFiscalPeriodQuery,
}))

vi.mock('@/components/accounting/AccountMappingWarning', () => ({
  default: () => null,
}))

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  formatDate: (d: string | Date) => '01 Jan 2026',
}))

const mockCurrentPeriod = {
  id: 'period-1',
  code: '2026-03',
  name: 'Mar 2026',
  status: 'OPEN',
  startDate: '2026-03-01',
  endDate: '2026-03-31',
}

const mockEntry = {
  id: 'je-1',
  referenceNumber: 'JE-26-001',
  entryDate: '2026-03-01',
  description: 'Test journal entry description',
  status: JournalEntryStatus.POSTED,
  totalDebits: 1000,
  totalCredits: 1000,
  sourceType: 'sales_order',
  sourceId: 'so-1',
  reversalOfId: null,
  reversedById: null,
  reversalOf: null,
  reversedBy: null,
}

const mockReversedEntry = {
  ...mockEntry,
  id: 'je-2',
  referenceNumber: 'JE-26-002',
  status: JournalEntryStatus.REVERSED,
  reversedById: 'je-3',
  reversedBy: { referenceNumber: 'JE-26-003' },
  reversalOfId: null,
  sourceType: null,
  sourceId: null,
}

const mockReversalEntry = {
  ...mockEntry,
  id: 'je-3',
  referenceNumber: 'JE-26-003',
  status: JournalEntryStatus.POSTED,
  reversalOfId: 'je-2',
  reversalOf: { referenceNumber: 'JE-26-002' },
  reversedById: null,
  sourceType: null,
  sourceId: null,
}

const defaultMeta = { total: 3, totalDebitAmount: 3000, totalCreditAmount: 3000 }

const renderPage = () =>
  render(
    <BrowserRouter>
      <JournalEntriesPage />
    </BrowserRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.useGetJournalEntriesQuery.mockReturnValue({
    data: { data: [mockEntry], meta: defaultMeta },
    isLoading: false,
    isFetching: false,
  })
  mockedApi.useGetFiscalPeriodsQuery.mockReturnValue({ data: { data: [] } })
  mockedApi.useGetCurrentFiscalPeriodQuery.mockReturnValue({ data: mockCurrentPeriod })
})

describe('JournalEntriesPage', () => {
  describe('Header and breadcrumb', () => {
    it('renders breadcrumb with Accounting and Journal Entries', () => {
      renderPage()
      expect(screen.getByText('Accounting')).toBeInTheDocument()
      expect(screen.getByText('Journal Entries')).toBeInTheDocument()
    })

    it('renders fiscal period indicator', () => {
      renderPage()
      expect(screen.getByText(/Mar 2026/)).toBeInTheDocument()
    })
  })

  describe('Summary row', () => {
    it('renders entry count and aggregate totals from meta', () => {
      renderPage()
      expect(screen.getByText('3')).toBeInTheDocument() // total entries
      expect(screen.getByText('$3000.00')).toBeInTheDocument() // totalDebitAmount (appears twice)
    })
  })

  describe('Table columns', () => {
    it('renders JE No, Date, Reference, Description, Status, Reversal, Amount columns', () => {
      renderPage()
      expect(screen.getByText('JE No')).toBeInTheDocument()
      expect(screen.getByText('Date')).toBeInTheDocument()
      expect(screen.getByText('Reference')).toBeInTheDocument()
      expect(screen.getByText('Description')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Reversal')).toBeInTheDocument()
      expect(screen.getByText('Amount')).toBeInTheDocument()
    })

    it('does not render checkbox column or bulk actions', () => {
      renderPage()
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      expect(screen.queryByText('Post Selected')).not.toBeInTheDocument()
      expect(screen.queryByText('Delete Selected')).not.toBeInTheDocument()
    })
  })

  describe('JE No navigation', () => {
    it('navigates to journal entry detail on JE No click', () => {
      renderPage()
      fireEvent.click(screen.getByText('JE-26-001'))
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries/je-1')
    })
  })

  describe('Reference navigation', () => {
    it('navigates to sales order on sales_order sourceType click', () => {
      renderPage()
      fireEvent.click(screen.getByText('so-1'))
      expect(mockNavigate).toHaveBeenCalledWith('/sales/orders?highlight=so-1')
    })

    it('navigates to goods received for goods_received_note sourceType', () => {
      mockedApi.useGetJournalEntriesQuery.mockReturnValue({
        data: { data: [{ ...mockEntry, sourceType: 'goods_received_note', sourceId: 'grn-1' }], meta: defaultMeta },
        isLoading: false,
        isFetching: false,
      })
      renderPage()
      fireEvent.click(screen.getByText('grn-1'))
      expect(mockNavigate).toHaveBeenCalledWith('/purchasing/goods-received?grnId=grn-1')
    })

    it('navigates to vendor payments for vendor_payment sourceType', () => {
      mockedApi.useGetJournalEntriesQuery.mockReturnValue({
        data: { data: [{ ...mockEntry, sourceType: 'vendor_payment', sourceId: 'vp-1' }], meta: defaultMeta },
        isLoading: false,
        isFetching: false,
      })
      renderPage()
      fireEvent.click(screen.getByText('vp-1'))
      expect(mockNavigate).toHaveBeenCalledWith('/purchasing/vendor-payments?vpId=vp-1')
    })
  })

  describe('Reversal column', () => {
    it('shows ↪ link for reversed entry and navigates to reversal JE', () => {
      mockedApi.useGetJournalEntriesQuery.mockReturnValue({
        data: { data: [mockReversedEntry], meta: defaultMeta },
        isLoading: false,
        isFetching: false,
      })
      renderPage()
      expect(screen.getByText(/↪ JE-26-003/)).toBeInTheDocument()
      fireEvent.click(screen.getByText(/↪ JE-26-003/))
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries/je-3')
    })

    it('shows ← link for reversal entry and navigates to original JE', () => {
      mockedApi.useGetJournalEntriesQuery.mockReturnValue({
        data: { data: [mockReversalEntry], meta: defaultMeta },
        isLoading: false,
        isFetching: false,
      })
      renderPage()
      expect(screen.getByText(/← JE-26-002/)).toBeInTheDocument()
      fireEvent.click(screen.getByText(/← JE-26-002/))
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries/je-2')
    })

    it('shows — for entries with no reversal relationship', () => {
      renderPage()
      expect(screen.getByText('—')).toBeInTheDocument()
    })
  })

  describe('Status chips', () => {
    it('renders success chip for Posted entries', () => {
      renderPage()
      expect(screen.getByText('Posted')).toBeInTheDocument()
    })

    it('renders error chip for Reversed entries', () => {
      mockedApi.useGetJournalEntriesQuery.mockReturnValue({
        data: { data: [mockReversedEntry], meta: defaultMeta },
        isLoading: false,
        isFetching: false,
      })
      renderPage()
      expect(screen.getByText('Reversed')).toBeInTheDocument()
    })

    it('renders both "Posted" and "Reversal" chips for entries with reversalOfId set', () => {
      mockedApi.useGetJournalEntriesQuery.mockReturnValue({
        data: { data: [mockReversalEntry], meta: defaultMeta },
        isLoading: false,
        isFetching: false,
      })
      renderPage()
      // Reversal entries show both chips: Posted (success) + Reversal (info)
      expect(screen.getByText('Reversal')).toBeInTheDocument()
      expect(screen.getAllByText('Posted').length).toBeGreaterThan(0)
    })
  })

  describe('Filters', () => {
    it('passes excludeDraft: true in query params at all times', () => {
      renderPage()
      expect(mockedApi.useGetJournalEntriesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ excludeDraft: true }),
      )
    })

    it('passes hasReversal: true when Has Reversal filter selected', () => {
      renderPage()
      const reversalSelect = screen.getByLabelText('Reversal')
      fireEvent.change(reversalSelect, { target: { value: 'has' } })
      expect(mockedApi.useGetJournalEntriesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ hasReversal: true }),
      )
    })

    it('passes search string when entered', () => {
      renderPage()
      const searchInput = screen.getByPlaceholderText(/Search JE No/)
      fireEvent.change(searchInput, { target: { value: 'JE-26' } })
      expect(mockedApi.useGetJournalEntriesQuery).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'JE-26' }),
      )
    })
  })

  describe('Empty state', () => {
    it('shows empty message when no entries', () => {
      mockedApi.useGetJournalEntriesQuery.mockReturnValue({
        data: { data: [], meta: { total: 0, totalDebitAmount: 0, totalCreditAmount: 0 } },
        isLoading: false,
        isFetching: false,
      })
      renderPage()
      expect(screen.getByText('No journal entries found')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 3: Run the frontend tests**

```bash
cd frontend && npx vitest run src/pages/accounting/JournalEntriesPage.test.tsx
```

Expected: All tests pass.

- [ ] **Step 4: Run the full frontend test suite to check for regressions**

```bash
cd frontend && npm run test
```

Expected: All tests pass. No regressions in other files.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.test.tsx
git rm frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
git commit -m "test(accounting): rewrite JournalEntriesPage tests for redesigned view-only page"
```

---

## Final Verification

- [ ] **Run full backend test suite**

```bash
cd backend && npm run test
```

Expected: All tests pass.

- [ ] **Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Start the dev server and manually verify**

```bash
cd frontend && npm run dev
```

Navigate to `/accounting/journal-entries` and verify:
- Breadcrumb shows `Accounting / Journal Entries`
- Fiscal period indicator visible in header
- Filter bar with Period, Status, Reversal, Search
- Summary row shows Entries / Total Debit / Total Credit
- No checkboxes, no bulk actions, no edit buttons
- JE No clicks open detail page
- Reference clicks navigate to source transaction
- Reversal links navigate to related journal entry
- Status chips: Posted (green), Reversed (red), Reversal (blue)
