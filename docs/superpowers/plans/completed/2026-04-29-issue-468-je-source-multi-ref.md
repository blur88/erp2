# Issue #468: JE Source & Multi-Ref Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs: missing `invoice` source reference in JE service, single-JE-only display on SO/Invoice/Payment headers, and missing Reset button when JE list is filtered by URL params.

**Architecture:** Backend gets a new `invoice` repository injection + `ids` comma-separated filter on `findAll`. Frontend gets a new `useJournalEntryRefs` hook (multi-source, no `limit:1`) consumed only by the three sales workspace hooks; `useJournalEntryRef` is left untouched. `EntityContextHeaderBar` gains an additive `journalEntryRefs` prop. `JournalEntriesPage` detects URL-param filters and wires a proper clear handler.

**Tech Stack:** NestJS 11, TypeORM, Jest (backend); React 19, RTK Query, Vitest (frontend)

---

## File Map

| File | Action |
|------|--------|
| `backend/src/modules/accounting/accounting.module.ts` | Modify — add `Invoice` entity |
| `backend/src/modules/accounting/dto/journal-entry.dto.ts` | Modify — add `ids` field to `QueryJournalEntriesDto` |
| `backend/src/modules/accounting/services/journal-entry.service.ts` | Modify — inject `invoiceRepository`, add `invoice` case, add `ids` filter |
| `backend/src/modules/accounting/services/journal-entry.service.spec.ts` | Modify — add tests for `invoice` resolution and `ids` filter |
| `frontend/src/hooks/useJournalEntryRefs.ts` | Create — multi-ref hook |
| `frontend/src/hooks/useJournalEntryRefs.test.ts` | Create — hook tests |
| `frontend/src/components/common/EntityContextHeaderBar.tsx` | Modify — add `journalEntryRefs` prop |
| `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` | Modify — switch to `useJournalEntryRefs` with SO + invoice sources |
| `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts` | Modify — switch to `useJournalEntryRefs` |
| `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts` | Modify — switch to `useJournalEntryRefs` |
| `frontend/src/pages/sales/components/OrderContextHeader.tsx` | Modify — render multi-ref list |
| `frontend/src/pages/sales/components/InvoiceContextHeader.tsx` | Modify — render multi-ref list |
| `frontend/src/pages/sales/components/PaymentContextHeader.tsx` | Modify — render multi-ref list |
| `frontend/src/pages/accounting/JournalEntriesPage.tsx` | Modify — `ids` param + URL filter reset |

---

### Task 1: Backend — add `Invoice` entity to accounting module and inject repository

**Files:**
- Modify: `backend/src/modules/accounting/accounting.module.ts`
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`

- [ ] **Step 1: Add `Invoice` to `accounting.module.ts`**

Open `backend/src/modules/accounting/accounting.module.ts`. Add the import and add `Invoice` to `TypeOrmModule.forFeature([...])`:

```ts
import { Invoice } from '../../database/entities/invoice.entity';
```

In the `TypeOrmModule.forFeature([...])` array (currently ends with `StockAdjustment`), add `Invoice` after `StockAdjustment`:

```ts
StockAdjustment,
Invoice,
```

- [ ] **Step 2: Inject `invoiceRepository` in `JournalEntryService`**

Open `backend/src/modules/accounting/services/journal-entry.service.ts`.

Add the import at the top alongside the other entity imports:
```ts
import { Invoice } from '../../../database/entities/invoice.entity';
```

In the constructor (currently ends with `private readonly stockAdjustmentRepository: Repository<StockAdjustment>,`), add after it:

```ts
@InjectRepository(Invoice)
private readonly invoiceRepository: Repository<Invoice>,
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/accounting/accounting.module.ts backend/src/modules/accounting/services/journal-entry.service.ts
git commit -m "feat(accounting): inject Invoice repository into JournalEntryService"
```

---

### Task 2: Backend — add `invoice` case to `resolveSourceRefNumber`

**Files:**
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`
- Modify: `backend/src/modules/accounting/services/journal-entry.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Open `backend/src/modules/accounting/services/journal-entry.service.spec.ts`.

At the top of the file, add `Invoice` to the imports (alongside existing entity imports):
```ts
import { Invoice } from '../../../database/entities/invoice.entity';
```

Add `mockInvoiceRepo` to the declared variables at the top of `describe('JournalEntryService')`:
```ts
let mockInvoiceRepo: { findOne: jest.Mock };
```

In `beforeEach`, initialize it (alongside the other mock repos):
```ts
mockInvoiceRepo = { findOne: jest.fn() };
```

In the `providers` array inside `Test.createTestingModule`, add (alongside the other repo providers):
```ts
{ provide: getRepositoryToken(Invoice), useValue: mockInvoiceRepo },
```

Then add a new `describe` block. Find the end of the existing test suite (before the final closing `}`), and add:

```ts
describe('resolveSourceRefNumber for invoice', () => {
  it('returns invoiceNumber when sourceType is invoice', async () => {
    const mockEntry = {
      ...mockJournalEntry,
      sourceType: 'invoice',
      sourceId: 'invoice-1',
      lines: [mockJournalEntryLine1, mockJournalEntryLine2],
    };
    journalEntryRepository.findOne.mockResolvedValue(mockEntry as JournalEntry);
    mockInvoiceRepo.findOne.mockResolvedValue({ invoiceNumber: 'INV-0042' });

    const result = await service.findOne('entry-1');
    expect(result.sourceRefNumber).toBe('INV-0042');
    expect(mockInvoiceRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      select: ['invoiceNumber'],
    });
  });

  it('returns undefined when invoice not found', async () => {
    const mockEntry = {
      ...mockJournalEntry,
      sourceType: 'invoice',
      sourceId: 'invoice-missing',
      lines: [mockJournalEntryLine1, mockJournalEntryLine2],
    };
    journalEntryRepository.findOne.mockResolvedValue(mockEntry as JournalEntry);
    mockInvoiceRepo.findOne.mockResolvedValue(null);

    const result = await service.findOne('entry-1');
    expect(result.sourceRefNumber).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: failures in the `resolveSourceRefNumber for invoice` describe block.

- [ ] **Step 3: Add the `invoice` case**

Open `backend/src/modules/accounting/services/journal-entry.service.ts`.

In `resolveSourceRefNumber`, find the `case 'stock_adjustment':` block (the last case before `default`). Add the `invoice` case immediately before `default:`:

```ts
case 'invoice': {
  const record = await this.invoiceRepository.findOne({
    where: { id: sourceId },
    select: ['invoiceNumber'],
  });
  return record?.invoiceNumber;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/accounting/services/journal-entry.service.ts backend/src/modules/accounting/services/journal-entry.service.spec.ts
git commit -m "feat(accounting): resolve invoice source reference number in JE service"
```

---

### Task 3: Backend — add `ids` filter to `QueryJournalEntriesDto` and `findAll`

**Files:**
- Modify: `backend/src/modules/accounting/dto/journal-entry.dto.ts`
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`
- Modify: `backend/src/modules/accounting/services/journal-entry.service.spec.ts`

- [ ] **Step 1: Write the failing test**

In `backend/src/modules/accounting/services/journal-entry.service.spec.ts`, add a new `describe` block (alongside the existing `describe` blocks):

```ts
describe('findAll with ids filter', () => {
  it('filters by comma-separated ids when ids param is provided', async () => {
    const andWhereMock = jest.fn().mockReturnThis();
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: andWhereMock,
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

    await service.findAll({ ids: 'entry-1,entry-2' });

    expect(andWhereMock).toHaveBeenCalledWith(
      'entry.id IN (:...idList)',
      { idList: ['entry-1', 'entry-2'] },
    );
  });

  it('does not apply ids filter when ids param is absent', async () => {
    const andWhereMock = jest.fn().mockReturnThis();
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: andWhereMock,
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

    await service.findAll({});

    const calls = andWhereMock.mock.calls.map((c: any[]) => c[0] as string);
    expect(calls.some((c) => c.includes('id IN'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage -t "findAll with ids filter" 2>&1 | tail -20
```

Expected: failures (ids not yet in DTO or service).

- [ ] **Step 3: Add `ids` to `QueryJournalEntriesDto`**

Open `backend/src/modules/accounting/dto/journal-entry.dto.ts`.

Find the line:
```ts
sortOrder?: 'ASC' | 'DESC';
}
```

Add the `ids` field before `sortOrder`:
```ts
@ApiPropertyOptional({ description: 'Filter by comma-separated entry UUIDs' })
@IsOptional()
@IsString()
ids?: string;

@ApiPropertyOptional({ description: 'Sort direction', enum: ['ASC', 'DESC'] })
@IsOptional()
@IsString()
sortOrder?: 'ASC' | 'DESC';
```

- [ ] **Step 4: Add `ids` filter to `findAll`**

Open `backend/src/modules/accounting/services/journal-entry.service.ts`.

In `findAll`, find the destructuring at the top of the method:
```ts
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
} = query;
```

Add `ids` to the destructuring:
```ts
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
  ids,
} = query;
```

Then find the `if (sourceType)` block:
```ts
if (sourceType) {
  queryBuilder.andWhere('entry.sourceType = :sourceType', { sourceType });
}

if (sourceId) {
  queryBuilder.andWhere('entry.sourceId = :sourceId', { sourceId });
}
```

Replace it with:
```ts
if (ids) {
  const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
  if (idList.length > 0) {
    queryBuilder.andWhere('entry.id IN (:...idList)', { idList });
  }
} else {
  if (sourceType) {
    queryBuilder.andWhere('entry.sourceType = :sourceType', { sourceType });
  }

  if (sourceId) {
    queryBuilder.andWhere('entry.sourceId = :sourceId', { sourceId });
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/accounting/dto/journal-entry.dto.ts backend/src/modules/accounting/services/journal-entry.service.ts backend/src/modules/accounting/services/journal-entry.service.spec.ts
git commit -m "feat(accounting): add ids filter to journal entry findAll query"
```

---

### Task 4: Frontend — create `useJournalEntryRefs` hook

**Files:**
- Create: `frontend/src/hooks/useJournalEntryRefs.ts`
- Create: `frontend/src/hooks/useJournalEntryRefs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hooks/useJournalEntryRefs.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useJournalEntryRefs } from './useJournalEntryRefs'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const mockFetchJournalEntries = vi.fn()
vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: () => [mockFetchJournalEntries],
}))

describe('useJournalEntryRefs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no valid sources', async () => {
    const { result } = renderHook(() =>
      useJournalEntryRefs([{ sourceType: 'sales_order', sourceId: undefined }]),
    )
    expect(result.current.journalEntryRefs).toEqual([])
    expect(result.current.journalEntryRefsLoading).toBe(false)
  })

  it('collects refs from all sources', async () => {
    mockFetchJournalEntries
      .mockResolvedValueOnce({ data: [{ id: 'je-1', referenceNumber: 'JE-001' }] })
      .mockResolvedValueOnce({ data: [{ id: 'je-2', referenceNumber: 'JE-002' }] })

    const { result } = renderHook(() =>
      useJournalEntryRefs([
        { sourceType: 'sales_order', sourceId: 'so-1' },
        { sourceType: 'invoice', sourceId: 'inv-1' },
      ]),
    )

    await waitFor(() => expect(result.current.journalEntryRefsLoading).toBe(false))
    expect(result.current.journalEntryRefs).toHaveLength(2)
    expect(result.current.journalEntryRefs[0].referenceNumber).toBe('JE-001')
    expect(result.current.journalEntryRefs[1].referenceNumber).toBe('JE-002')
  })

  it('navigates with sourceType/sourceId when exactly one ref', async () => {
    mockFetchJournalEntries.mockResolvedValueOnce({
      data: [{ id: 'je-1', referenceNumber: 'JE-001' }],
    })

    const { result } = renderHook(() =>
      useJournalEntryRefs([{ sourceType: 'sales_order', sourceId: 'so-1' }]),
    )

    await waitFor(() => expect(result.current.journalEntryRefsLoading).toBe(false))
    result.current.navigateToJournalEntries()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/accounting/journal-entries?sourceType=sales_order&sourceId=so-1',
    )
  })

  it('navigates with ids param when multiple refs', async () => {
    mockFetchJournalEntries
      .mockResolvedValueOnce({ data: [{ id: 'je-1', referenceNumber: 'JE-001' }] })
      .mockResolvedValueOnce({ data: [{ id: 'je-2', referenceNumber: 'JE-002' }] })

    const { result } = renderHook(() =>
      useJournalEntryRefs([
        { sourceType: 'sales_order', sourceId: 'so-1' },
        { sourceType: 'invoice', sourceId: 'inv-1' },
      ]),
    )

    await waitFor(() => expect(result.current.journalEntryRefsLoading).toBe(false))
    result.current.navigateToJournalEntries()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/accounting/journal-entries?ids=je-1,je-2',
    )
  })

  it('does not navigate when no refs', async () => {
    mockFetchJournalEntries.mockResolvedValueOnce({ data: [] })

    const { result } = renderHook(() =>
      useJournalEntryRefs([{ sourceType: 'sales_order', sourceId: 'so-1' }]),
    )

    await waitFor(() => expect(result.current.journalEntryRefsLoading).toBe(false))
    result.current.navigateToJournalEntries()
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd frontend && npx vitest run src/hooks/useJournalEntryRefs.test.ts 2>&1 | tail -20
```

Expected: error — module not found.

- [ ] **Step 3: Create the hook**

Create `frontend/src/hooks/useJournalEntryRefs.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { JournalEntryRef } from './useJournalEntryRef'

export function useJournalEntryRefs(
  sources: Array<{ sourceType: string; sourceId: string | undefined }>,
): {
  journalEntryRefs: JournalEntryRef[]
  journalEntryRefsLoading: boolean
  navigateToJournalEntries: () => void
} {
  const navigate = useNavigate()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const [journalEntryRefs, setJournalEntryRefs] = useState<JournalEntryRef[]>([])
  const [journalEntryRefsLoading, setJournalEntryRefsLoading] = useState(false)

  const validSources = sources.filter(
    (s): s is { sourceType: string; sourceId: string } => Boolean(s.sourceId),
  )

  const sourcesKey = validSources.map((s) => `${s.sourceType}:${s.sourceId}`).join(',')

  useEffect(() => {
    if (validSources.length === 0) {
      setJournalEntryRefs([])
      setJournalEntryRefsLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefsLoading(true)

    ;(async () => {
      try {
        const collected: JournalEntryRef[] = []
        for (const source of validSources) {
          const response = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
          }).unwrap()

          if (cancelled) return

          const entries = response.data ?? []
          for (const entry of entries) {
            collected.push({
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
          }
        }
        if (!cancelled) setJournalEntryRefs(collected)
      } catch {
        if (!cancelled) setJournalEntryRefs([])
      } finally {
        if (!cancelled) setJournalEntryRefsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchJournalEntries, sourcesKey])

  const navigateToJournalEntries = useCallback(() => {
    if (journalEntryRefs.length === 0) return
    if (journalEntryRefs.length === 1) {
      const ref = journalEntryRefs[0]
      navigate(
        `/accounting/journal-entries?sourceType=${ref.sourceType}&sourceId=${ref.sourceId}`,
      )
      return
    }
    const ids = journalEntryRefs.map((r) => {
      // We need the entry id, not sourceId — collect it separately
      return (r as any).id as string
    }).join(',')
    navigate(`/accounting/journal-entries?ids=${ids}`)
  }, [journalEntryRefs, navigate])

  return { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries }
}
```

**Note:** The hook needs to store the entry `id` (not just `sourceId`) to build the `?ids=` URL. Update the internal `collected` array to also capture the entry's own `id`. Update `JournalEntryRef` usage — since the type from `useJournalEntryRef` doesn't include `id`, we store it internally. Update the hook to use an extended internal type:

Replace the hook body with this corrected version:

```ts
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { JournalEntryRef } from './useJournalEntryRef'

interface JournalEntryRefWithId extends JournalEntryRef {
  id: string
}

export function useJournalEntryRefs(
  sources: Array<{ sourceType: string; sourceId: string | undefined }>,
): {
  journalEntryRefs: JournalEntryRef[]
  journalEntryRefsLoading: boolean
  navigateToJournalEntries: () => void
} {
  const navigate = useNavigate()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const [journalEntryRefs, setJournalEntryRefs] = useState<JournalEntryRefWithId[]>([])
  const [journalEntryRefsLoading, setJournalEntryRefsLoading] = useState(false)

  const validSources = sources.filter(
    (s): s is { sourceType: string; sourceId: string } => Boolean(s.sourceId),
  )

  const sourcesKey = validSources.map((s) => `${s.sourceType}:${s.sourceId}`).join(',')

  useEffect(() => {
    if (validSources.length === 0) {
      setJournalEntryRefs([])
      setJournalEntryRefsLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefsLoading(true)

    ;(async () => {
      try {
        const collected: JournalEntryRefWithId[] = []
        for (const source of validSources) {
          const response = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
          }).unwrap()

          if (cancelled) return

          const entries = response.data ?? []
          for (const entry of entries) {
            collected.push({
              id: entry.id,
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
          }
        }
        if (!cancelled) setJournalEntryRefs(collected)
      } catch {
        if (!cancelled) setJournalEntryRefs([])
      } finally {
        if (!cancelled) setJournalEntryRefsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchJournalEntries, sourcesKey])

  const navigateToJournalEntries = useCallback(() => {
    if (journalEntryRefs.length === 0) return
    if (journalEntryRefs.length === 1) {
      const ref = journalEntryRefs[0]
      navigate(
        `/accounting/journal-entries?sourceType=${ref.sourceType}&sourceId=${ref.sourceId}`,
      )
      return
    }
    const ids = journalEntryRefs.map((r) => r.id).join(',')
    navigate(`/accounting/journal-entries?ids=${ids}`)
  }, [journalEntryRefs, navigate])

  return { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries }
}
```

Also update the test mock to include `id` in the returned entries:

```ts
mockFetchJournalEntries
  .mockResolvedValueOnce({ data: [{ id: 'je-1', referenceNumber: 'JE-001' }] })
  .mockResolvedValueOnce({ data: [{ id: 'je-2', referenceNumber: 'JE-002' }] })
```

(Already included in the test above — `id` is present in all mock entries.)

- [ ] **Step 4: Run to verify tests pass**

```bash
cd frontend && npx vitest run src/hooks/useJournalEntryRefs.test.ts 2>&1 | tail -20
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useJournalEntryRefs.ts frontend/src/hooks/useJournalEntryRefs.test.ts
git commit -m "feat(frontend): add useJournalEntryRefs hook for multi-source JE lookup"
```

---

### Task 5: Frontend — update `EntityContextHeaderBar` to support multiple refs

**Files:**
- Modify: `frontend/src/components/common/EntityContextHeaderBar.tsx`

- [ ] **Step 1: Update the component**

Open `frontend/src/components/common/EntityContextHeaderBar.tsx`. Replace the entire file contents with:

```tsx
import type { ReactNode } from 'react'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'

import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'

interface EntityContextHeaderBarProps {
  title: string
  statusChip?: ReactNode
  actions?: ReactNode
  journalEntryRef?: JournalEntryRef | null
  journalEntryRefs?: JournalEntryRef[]
  journalEntryRefLoading?: boolean
  onNavigateToJournalEntry?: () => void
}

export function EntityContextHeaderBar({
  title,
  statusChip,
  actions,
  journalEntryRef,
  journalEntryRefs,
  journalEntryRefLoading,
  onNavigateToJournalEntry,
}: EntityContextHeaderBarProps) {
  const activeRefs = journalEntryRefs && journalEntryRefs.length > 0
    ? journalEntryRefs
    : journalEntryRef
      ? [journalEntryRef]
      : []

  const tooltipTitle = activeRefs.length > 1
    ? `Journal Entries: ${activeRefs.map((r) => r.referenceNumber).join(', ')}`
    : activeRefs.length === 1
      ? `Journal Entry: ${activeRefs[0].referenceNumber}`
      : ''

  return (
    <Box
      sx={{
        p: TABLE_STYLES.cell.padding.px,
        borderBottom: TABLE_STYLES.cell.border,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography
          variant="tableHeader"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {title}
        </Typography>
        {statusChip}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {actions}
        {journalEntryRefLoading && activeRefs.length === 0 && (
          <CircularProgress size={16} sx={{ mx: 0.5 }} />
        )}
        {activeRefs.length > 0 && (
          <Tooltip title={tooltipTitle}>
            <IconButton size="small" onClick={onNavigateToJournalEntry}>
              <MenuBookIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/EntityContextHeaderBar.tsx
git commit -m "feat(frontend): EntityContextHeaderBar supports multiple JE refs"
```

---

### Task 6: Frontend — update `useOrdersWorkspace` to use `useJournalEntryRefs`

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`

- [ ] **Step 1: Update the import and hook call**

Open `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`.

Find the import:
```ts
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
```
Replace with:
```ts
import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
```

Find the hook call (around line 111):
```ts
const { journalEntryRef, journalEntryRefLoading } = useJournalEntryRef([
  {
    sourceType: 'sales_order',
    sourceId: selectedOrder?.isFulfilled ? selectedOrder?.id : undefined,
  },
])
```
Replace with:
```ts
const invoiceSources = (selectedOrder?.invoices ?? []).map((invoice: any) => ({
  sourceType: 'invoice' as const,
  sourceId: invoice.id as string | undefined,
}))

const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs([
  {
    sourceType: 'sales_order',
    sourceId: selectedOrder?.isFulfilled ? selectedOrder?.id : undefined,
  },
  ...invoiceSources,
])
```

Find the old `navigateToJournalEntry` callback (around line 770):
```ts
const navigateToJournalEntry = useCallback(() => {
  if (selectedOrder) {
    navigate(`/accounting/journal-entries?sourceType=sales_order&sourceId=${selectedOrder.id}`)
  }
}, [navigate, selectedOrder])
```
Delete it entirely (the hook now provides `navigateToJournalEntries`).

Find the return object and replace the JE-related fields:
```ts
journalEntryRef,
journalEntryRefLoading,
```
with:
```ts
journalEntryRefs,
journalEntryRefsLoading,
navigateToJournalEntries,
```

Also remove `navigateToJournalEntry` from the return object (it was listed separately).

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "ordersWorkspace\|OrderContext\|OrdersPage" | head -20
```

Expected: errors about `journalEntryRef` no longer existing — these will be fixed in Task 8.

- [ ] **Step 3: Commit (partial — types will be fixed in Task 8)**

```bash
git add frontend/src/pages/sales/hooks/useOrdersWorkspace.ts
git commit -m "feat(sales): useOrdersWorkspace switched to multi-ref JE hook"
```

---

### Task 7: Frontend — update `useInvoicesWorkspace` and `usePaymentsWorkspace`

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`

- [ ] **Step 1: Update `useInvoicesWorkspace`**

Open `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`.

Replace the import:
```ts
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
```
with:
```ts
import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
```

Replace the hook call (around line 91):
```ts
const { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry } = useJournalEntryRef([
  { sourceType: 'invoice', sourceId: selectedInvoice?.id },
  { sourceType: 'sales_order', sourceId: selectedInvoice?.salesOrder?.id },
])
```
with:
```ts
const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs([
  { sourceType: 'invoice', sourceId: selectedInvoice?.id },
  { sourceType: 'sales_order', sourceId: selectedInvoice?.salesOrder?.id },
])
```

In the return object, replace:
```ts
journalEntryRef,
journalEntryRefLoading,
```
and:
```ts
navigateToJournalEntry,
```
with:
```ts
journalEntryRefs,
journalEntryRefsLoading,
navigateToJournalEntries,
```

- [ ] **Step 2: Update `usePaymentsWorkspace`**

Open `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`.

Replace the import:
```ts
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
```
with:
```ts
import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
```

Replace the hook call (around line 99):
```ts
const { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry } = useJournalEntryRef([
  { sourceType: 'payment', sourceId: selectedPayment?.id },
])
```
with:
```ts
const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs([
  { sourceType: 'payment', sourceId: selectedPayment?.id },
])
```

Replace the `handleNavigateToJournalEntry` callback:
```ts
const handleNavigateToJournalEntry = useCallback(
  (journalRef: PaymentJournalEntryRef | null) => {
    if (!journalRef) return
    navigateToJournalEntry()
  },
  [navigateToJournalEntry],
)
```
with:
```ts
const handleNavigateToJournalEntry = useCallback(
  () => {
    navigateToJournalEntries()
  },
  [navigateToJournalEntries],
)
```

In the return object, replace:
```ts
journalEntryRef,
journalEntryRefLoading,
```
with:
```ts
journalEntryRefs,
journalEntryRefsLoading,
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts
git commit -m "feat(sales): invoices and payments workspaces switched to multi-ref JE hook"
```

---

### Task 8: Frontend — update three context headers to render multi-ref list

**Files:**
- Modify: `frontend/src/pages/sales/components/OrderContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/InvoiceContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/PaymentContextHeader.tsx`
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/pages/sales/InvoicesPage.tsx`
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`

- [ ] **Step 1: Update `OrderContextHeader`**

Open `frontend/src/pages/sales/components/OrderContextHeader.tsx`.

Remove the import:
```ts
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
```

Update the props interface — replace:
```ts
journalEntryRef: JournalEntryRef | null
journalEntryRefLoading: boolean
onNavigateToJournalEntry: () => void
```
with:
```ts
journalEntryRefs: JournalEntryRef[]
journalEntryRefsLoading: boolean
onNavigateToJournalEntries: () => void
```

Add the import for `JournalEntryRef` from the new hook (since we removed the old import):
```ts
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
```

Update the destructured props in the component function — replace `journalEntryRef`, `journalEntryRefLoading`, `onNavigateToJournalEntry` with `journalEntryRefs`, `journalEntryRefsLoading`, `onNavigateToJournalEntries`.

Update the `EntityContextHeaderBar` props:
```tsx
journalEntryRef={journalEntryRef}
journalEntryRefLoading={journalEntryRefLoading}
onNavigateToJournalEntry={onNavigateToJournalEntry}
```
becomes:
```tsx
journalEntryRefs={journalEntryRefs}
journalEntryRefLoading={journalEntryRefsLoading}
onNavigateToJournalEntry={onNavigateToJournalEntries}
```

Find the "Journal Entry No" table cell (around line 265–303). Replace the content with:

```tsx
<TableCell sx={labelCellSx}>Journal Entry No</TableCell>
<TableCell sx={valueCellSx}>
  {!selectedOrder.isFulfilled ? (
    <Typography
      sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
    >
      Not fulfilled
    </Typography>
  ) : journalEntryRefsLoading ? (
    <Typography
      sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
    >
      Loading...
    </Typography>
  ) : journalEntryRefs.length > 0 ? (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {journalEntryRefs.map((ref, index) => (
        <Box key={ref.referenceNumber} component="span">
          <Typography
            component="button"
            onClick={onNavigateToJournalEntries}
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
            {ref.referenceNumber}
          </Typography>
          {index < journalEntryRefs.length - 1 && (
            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
              ,
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  ) : (
    <Typography
      sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
    >
      Pending
    </Typography>
  )}
</TableCell>
```

- [ ] **Step 2: Update `InvoiceContextHeader`**

Open `frontend/src/pages/sales/components/InvoiceContextHeader.tsx`.

Update the import:
```ts
import type { InvoiceJournalEntryRef, InvoiceListItem } from '../hooks/useInvoicesWorkspace'
```
Remove `InvoiceJournalEntryRef` from this import (it will no longer be used). Add a direct import of `JournalEntryRef`:
```ts
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
import type { InvoiceListItem } from '../hooks/useInvoicesWorkspace'
```

Update the props interface — replace:
```ts
journalEntryRef: InvoiceJournalEntryRef | null
journalEntryRefLoading: boolean
onNavigateToJournalEntry: () => void
```
with:
```ts
journalEntryRefs: JournalEntryRef[]
journalEntryRefsLoading: boolean
onNavigateToJournalEntries: () => void
```

Update the destructured props in the component function.

Update `EntityContextHeaderBar` props:
```tsx
journalEntryRef={journalEntryRef}
journalEntryRefLoading={journalEntryRefLoading}
onNavigateToJournalEntry={onNavigateToJournalEntry}
```
becomes:
```tsx
journalEntryRefs={journalEntryRefs}
journalEntryRefLoading={journalEntryRefsLoading}
onNavigateToJournalEntry={onNavigateToJournalEntries}
```

Find the "Journal Entry No" table cell (around line 199–224). Replace with:

```tsx
<TableCell sx={labelCellSx}>Journal Entry No</TableCell>
<TableCell sx={valueCellSx}>
  {journalEntryRefsLoading ? (
    <Typography
      sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
    >
      Loading...
    </Typography>
  ) : journalEntryRefs.length > 0 ? (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {journalEntryRefs.map((ref, index) => (
        <Box key={ref.referenceNumber} component="span">
          <Typography
            component="button"
            onClick={onNavigateToJournalEntries}
            sx={linkButtonSx}
          >
            {ref.referenceNumber}
          </Typography>
          {index < journalEntryRefs.length - 1 && (
            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
              ,{' '}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  ) : (
    <Typography
      sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
    >
      Pending
    </Typography>
  )}
</TableCell>
```

- [ ] **Step 3: Update `PaymentContextHeader`**

Open `frontend/src/pages/sales/components/PaymentContextHeader.tsx`.

Find the import:
```ts
import type { PaymentJournalEntryRef, PaymentListItem } from '../hooks/usePaymentsWorkspace'
```
Remove `PaymentJournalEntryRef`. Add:
```ts
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
import type { PaymentListItem } from '../hooks/usePaymentsWorkspace'
```

Update the props interface — replace:
```ts
journalEntryRef: PaymentJournalEntryRef | null
journalEntryRefLoading: boolean
onNavigateToJournalEntry: (ref: PaymentJournalEntryRef | null) => void
```
with:
```ts
journalEntryRefs: JournalEntryRef[]
journalEntryRefsLoading: boolean
onNavigateToJournalEntry: () => void
```

Update destructured props. Update `EntityContextHeaderBar` props similarly to above (using `journalEntryRefs`, `journalEntryRefsLoading`).

Find the "Journal Entry" table cell (around line 226–249). Replace with:

```tsx
<TableCell sx={labelCellSx}>Journal Entry</TableCell>
<TableCell sx={valueCellSx}>
  {journalEntryRefsLoading ? (
    <Typography
      sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
    >
      Loading...
    </Typography>
  ) : journalEntryRefs.length > 0 ? (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {journalEntryRefs.map((ref, index) => (
        <Box key={ref.referenceNumber} component="span">
          <Typography
            component="button"
            onClick={onNavigateToJournalEntry}
            sx={linkButtonSx}
          >
            {ref.referenceNumber}
          </Typography>
          {index < journalEntryRefs.length - 1 && (
            <Typography component="span" sx={{ fontSize: '0.8rem' }}>
              ,{' '}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  ) : (
    <Typography
      sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}
    >
      N/A
    </Typography>
  )}
</TableCell>
```

- [ ] **Step 4: Update the three page files**

**`OrdersPage.tsx`** — find the props passed to `OrderContextHeader` and replace:
```tsx
journalEntryRef={workspace.journalEntryRef}
journalEntryRefLoading={workspace.journalEntryRefLoading}
onNavigateToJournalEntry={workspace.navigateToJournalEntry}
```
with:
```tsx
journalEntryRefs={workspace.journalEntryRefs}
journalEntryRefsLoading={workspace.journalEntryRefsLoading}
onNavigateToJournalEntries={workspace.navigateToJournalEntries}
```

**`InvoicesPage.tsx`** — find the props passed to `InvoiceContextHeader` and replace:
```tsx
journalEntryRef={workspace.journalEntryRef}
journalEntryRefLoading={workspace.journalEntryRefLoading}
onNavigateToJournalEntry={workspace.navigateToJournalEntry}
```
with:
```tsx
journalEntryRefs={workspace.journalEntryRefs}
journalEntryRefsLoading={workspace.journalEntryRefsLoading}
onNavigateToJournalEntries={workspace.navigateToJournalEntries}
```

**`PaymentsPage.tsx`** — find the props passed to `PaymentContextHeader` and replace:
```tsx
journalEntryRef={workspace.journalEntryRef}
journalEntryRefLoading={workspace.journalEntryRefLoading}
```
with:
```tsx
journalEntryRefs={workspace.journalEntryRefs}
journalEntryRefsLoading={workspace.journalEntryRefsLoading}
```
Also update `onNavigateToJournalEntry` if it passes the ref argument — the new signature takes no args.

- [ ] **Step 5: TypeScript check — all errors should be resolved**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Remove now-unused `InvoiceJournalEntryRef` and `PaymentJournalEntryRef` types**

Open `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`. Delete the `InvoiceJournalEntryRef` interface (lines 40–44) — it is no longer exported or used.

Open `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`. Delete the `PaymentJournalEntryRef` interface — it is no longer exported or used.

Run type-check again to confirm:
```bash
cd frontend && npm run type-check 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/components/OrderContextHeader.tsx \
        frontend/src/pages/sales/components/InvoiceContextHeader.tsx \
        frontend/src/pages/sales/components/PaymentContextHeader.tsx \
        frontend/src/pages/sales/OrdersPage.tsx \
        frontend/src/pages/sales/InvoicesPage.tsx \
        frontend/src/pages/sales/PaymentsPage.tsx \
        frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts \
        frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts
git commit -m "feat(sales): context headers render multi-ref JE list"
```

---

### Task 9: Frontend — `JournalEntriesPage` URL filter reset

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`

- [ ] **Step 1: Update the page**

Open `frontend/src/pages/accounting/JournalEntriesPage.tsx`.

Add `useNavigate` to the router import (the file currently only imports `useLocation`):
```ts
import { useLocation, useNavigate } from 'react-router-dom'
```

Add after the existing `useFilterBar` call:
```ts
const navigate = useNavigate()
```

After the existing `sourceIdParam` line (around line 60), add:
```ts
const idsParam = urlParams.get('ids')
const hasUrlFilters = Boolean(sourceIdParam || idsParam)
```

Update `queryArgs` — add `ids`:
```ts
const queryArgs = useMemo(() => ({
  search: appliedFilters.search || undefined,
  status: appliedFilters.status ? appliedFilters.status.toUpperCase() : undefined,
  sourceType: sourceIdParam ? sourceTypeParam ?? undefined : appliedFilters.entryType || undefined,
  sourceId: sourceIdParam ?? undefined,
  ids: idsParam ?? undefined,
  startDate: dateRange.fromDate,
  endDate: dateRange.toDate,
  sortBy,
  sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
}), [appliedFilters, dateRange, sortBy, sortOrder, sourceTypeParam, sourceIdParam, idsParam])
```

Add a `handleClearAll` callback after `filterHandlers`:
```ts
const handleClearAll = useCallback(() => {
  handlers.onClearAll()
  if (hasUrlFilters) {
    navigate('/accounting/journal-entries', { replace: true })
  }
}, [handlers, hasUrlFilters, navigate])
```

Update `filterHandlers` to override `onClearAll`:
```ts
const filterHandlers = useMemo(() => ({
  ...handlers,
  onClearAll: handleClearAll,
  onSearchChange: (value: string) => {
    handlers.onSearchChange(value)
    window.setTimeout(() => {
      workspace.searchInputRef.current?.focus()
    }, 0)
  },
}), [handlers, handleClearAll, workspace])
```

Update the `hasActiveFilters` prop passed to `GenericListPage`:
```tsx
hasActiveFilters={hasActiveFilters || hasUrlFilters}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "fix(accounting): show Reset button and clear URL filters on JournalEntriesPage"
```

---

### Task 10: Run full test suites and create PR

- [ ] **Step 1: Run backend tests**

```bash
cd backend && npm run test 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 2: Run targeted frontend tests**

```bash
cd frontend && npx vitest run src/hooks/useJournalEntryRefs.test.ts src/pages/accounting/__tests__/JournalEntriesPage.test.tsx 2>&1 | tail -30
```

Expected: all tests pass. If `JournalEntriesPage.test.tsx` tests for `hasActiveFilters` behaviour, update them to reflect the new `hasUrlFilters` logic.

- [ ] **Step 3: Create the PR**

```bash
gh pr create \
  --title "fix(accounting): JE source reference, multi-ref display, and filter reset (#468)" \
  --body "$(cat <<'EOF'
## Summary
- Adds `invoice` case to `resolveSourceRefNumber` so Invoice-sourced JEs show their reference number
- Adds `ids` comma-separated filter to `GET /accounting/journal-entries` for targeted multi-JE navigation
- New `useJournalEntryRefs` hook fetches all JEs across multiple sources; Sales Order, Invoice, and Payment headers now display all related JE references
- `JournalEntriesPage` shows the Reset button when `sourceId` or `ids` URL params are active, and clears them on reset

## Test plan
- [ ] Create a Sales Order, fulfill it (generates SO JE), then create an Invoice from it (generates Invoice JE) — SO header should show both JE reference numbers
- [ ] Click the JE link from an SO header — JE list should be filtered to show both JEs
- [ ] Navigate to JE list from any transaction — Reset button should appear; clicking it returns to unfiltered list
- [ ] Verify Invoice header shows its own JE reference number (was blank before)
- [ ] Backend: `npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage`
- [ ] Frontend: `npx vitest run src/hooks/useJournalEntryRefs.test.ts`

Closes #468

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
