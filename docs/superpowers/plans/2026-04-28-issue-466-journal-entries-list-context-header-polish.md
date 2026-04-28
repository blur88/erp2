# Journal Entries List & Context Header Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slim the JournalEntriesTable to a single reference-number column, rewrite JournalEntryContextHeader to use a two-column Grid layout matching PO/SO, and add `sourceRefNumber` to the backend JE response so the source document is shown as a clickable link.

**Architecture:** Backend adds `sourceRefNumber` to `JournalEntryResponseDto` and populates it in `toResponseDto` by looking up the source entity via its UUID. Frontend consumes the new field in the rewritten context header; the table is simplified to match `PurchaseOrdersTable`.

**Tech Stack:** NestJS 11 (backend), TypeORM, React 19, MUI v7, RTK Query, Vitest (frontend tests), Jest (backend tests)

---

## File Map

| File | Change |
|---|---|
| `backend/src/modules/accounting/dto/journal-entry.dto.ts` | Add `sourceRefNumber?: string` to `JournalEntryResponseDto` |
| `backend/src/modules/accounting/services/journal-entry.service.ts` | Inject source repos; add `resolveSourceRefNumber`; call it in `toResponseDto` |
| `backend/src/modules/accounting/accounting.module.ts` | Register new `@InjectRepository` entities |
| `backend/src/modules/accounting/services/journal-entry.service.spec.ts` | Add tests for `sourceRefNumber` population |
| `frontend/src/types/index.ts` | Add `sourceRefNumber?: string` to `JournalEntry` type |
| `frontend/src/pages/accounting/components/JournalEntriesTable.tsx` | Single-column rewrite |
| `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx` | Update tests |
| `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx` | Two-column Grid rewrite |
| `frontend/src/pages/accounting/components/JournalEntryContextHeader.test.tsx` | Update tests |
| `frontend/src/pages/accounting/JournalEntriesPage.tsx` | Remove `onViewSource` prop passed to table |

---

## Task 1: Add `sourceRefNumber` to the DTO

**Files:**
- Modify: `backend/src/modules/accounting/dto/journal-entry.dto.ts`

- [ ] **Step 1: Add the field to `JournalEntryResponseDto`**

Open `backend/src/modules/accounting/dto/journal-entry.dto.ts`. After the `sourceId` field (line ~316), add:

```typescript
  @ApiPropertyOptional({ description: 'Human-readable reference of the source document' })
  sourceRefNumber?: string;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -20
```

Expected: no errors (or pre-existing errors only — none introduced by this change).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/accounting/dto/journal-entry.dto.ts
git commit -m "feat(accounting): add sourceRefNumber field to JournalEntryResponseDto"
```

---

## Task 2: Inject source repositories into `JournalEntryService`

The service needs to query source entities (SalesOrder, PurchaseOrder, GoodsReceivedNote, Payment, VendorPayment, Expense, OwnerEquityTransaction, FundTransfer, StockAdjustment) to fetch their reference numbers.

**Files:**
- Modify: `backend/src/modules/accounting/accounting.module.ts`
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`

- [ ] **Step 1: Register entities in `accounting.module.ts`**

Open `backend/src/modules/accounting/accounting.module.ts`. Add missing entity imports at the top:

```typescript
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { PurchaseOrder } from '../../database/entities/purchase-order.entity';
import { GoodsReceivedNote } from '../../database/entities/goods-received-note.entity';
import { Payment } from '../../database/entities/payment.entity'; // already imported
import { VendorPayment } from '../../database/entities/vendor-payment.entity';
import { Expense } from '../../database/entities/expense.entity'; // already imported
import { OwnerEquityTransaction } from '../../database/entities/owner-equity-transaction.entity'; // already imported
import { FundTransfer } from '../../database/entities/fund-transfer.entity'; // already imported
import { StockAdjustment } from '../../database/entities/stock-adjustment.entity';
```

Note: `Payment`, `Expense`, `OwnerEquityTransaction`, `FundTransfer` are already imported and registered. Add only the new ones to `TypeOrmModule.forFeature([...])`:

```typescript
TypeOrmModule.forFeature([
  ChartOfAccount,
  FiscalPeriod,
  JournalEntry,
  JournalEntryLine,
  AccountMapping,
  BankReconciliation,
  ReconciledTransaction,
  Settlement,
  PaymentMethodEntity,
  Payment,
  OwnerEquityTransaction,
  Expense,
  FundTransfer,
  // --- new ---
  SalesOrder,
  PurchaseOrder,
  GoodsReceivedNote,
  VendorPayment,
  StockAdjustment,
]),
```

- [ ] **Step 2: Add constructor injections to `JournalEntryService`**

Open `backend/src/modules/accounting/services/journal-entry.service.ts`. Add imports at the top:

```typescript
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { GoodsReceivedNote } from '../../../database/entities/goods-received-note.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import { StockAdjustment } from '../../../database/entities/stock-adjustment.entity';
```

Then in the constructor, after the existing `@InjectRepository` params, add:

```typescript
@InjectRepository(SalesOrder)
private readonly salesOrderRepository: Repository<SalesOrder>,
@InjectRepository(PurchaseOrder)
private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
@InjectRepository(GoodsReceivedNote)
private readonly grnRepository: Repository<GoodsReceivedNote>,
@InjectRepository(VendorPayment)
private readonly vendorPaymentRepository: Repository<VendorPayment>,
@InjectRepository(StockAdjustment)
private readonly stockAdjustmentRepository: Repository<StockAdjustment>,
```

Note: `Payment`, `Expense`, `OwnerEquityTransaction`, `FundTransfer` repositories are NOT currently injected. Add them too (they are already registered in the module):

```typescript
@InjectRepository(Payment)
private readonly paymentRepository: Repository<Payment>,
@InjectRepository(Expense)
private readonly expenseRepository: Repository<Expense>,
@InjectRepository(OwnerEquityTransaction)
private readonly ownerEquityTransactionRepository: Repository<OwnerEquityTransaction>,
@InjectRepository(FundTransfer)
private readonly fundTransferRepository: Repository<FundTransfer>,
```

Also add imports for those entities (check if already imported at the top of the service file — `Payment`, `Expense`, `OwnerEquityTransaction`, `FundTransfer` are likely already imported since the service uses them for accounting logic; add only what is missing):

```typescript
import { Payment } from '../../../database/entities/payment.entity';
import { Expense } from '../../../database/entities/expense.entity';
import { OwnerEquityTransaction } from '../../../database/entities/owner-equity-transaction.entity';
import { FundTransfer } from '../../../database/entities/fund-transfer.entity';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -20
```

Expected: no errors introduced by this change.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/accounting/accounting.module.ts \
        backend/src/modules/accounting/services/journal-entry.service.ts
git commit -m "feat(accounting): inject source entity repositories into JournalEntryService"
```

---

## Task 3: Implement `resolveSourceRefNumber` and wire into `toResponseDto`

**Files:**
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`

- [ ] **Step 1: Write the failing test first**

Open `backend/src/modules/accounting/services/journal-entry.service.spec.ts`. The spec already mocks repositories — you need to add mocks for the new repositories and add a test for `sourceRefNumber` population.

In the `beforeEach` setup section, add mock repositories for the new entities. Find where `journalEntryRepository` is set up via `getRepositoryToken` and add:

```typescript
const mockSalesOrderRepo = { findOne: jest.fn() };
const mockPurchaseOrderRepo = { findOne: jest.fn() };
const mockGrnRepo = { findOne: jest.fn() };
const mockPaymentRepo = { findOne: jest.fn() };
const mockVendorPaymentRepo = { findOne: jest.fn() };
const mockExpenseRepo = { findOne: jest.fn() };
const mockOwnerEquityTransactionRepo = { findOne: jest.fn() };
const mockFundTransferRepo = { findOne: jest.fn() };
const mockStockAdjustmentRepo = { findOne: jest.fn() };
```

Add them to the `providers` array in the `Test.createTestingModule` call:

```typescript
{ provide: getRepositoryToken(SalesOrder), useValue: mockSalesOrderRepo },
{ provide: getRepositoryToken(PurchaseOrder), useValue: mockPurchaseOrderRepo },
{ provide: getRepositoryToken(GoodsReceivedNote), useValue: mockGrnRepo },
{ provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
{ provide: getRepositoryToken(VendorPayment), useValue: mockVendorPaymentRepo },
{ provide: getRepositoryToken(Expense), useValue: mockExpenseRepo },
{ provide: getRepositoryToken(OwnerEquityTransaction), useValue: mockOwnerEquityTransactionRepo },
{ provide: getRepositoryToken(FundTransfer), useValue: mockFundTransferRepo },
{ provide: getRepositoryToken(StockAdjustment), useValue: mockStockAdjustmentRepo },
```

Also add the necessary imports at the top of the spec file:

```typescript
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { GoodsReceivedNote } from '../../../database/entities/goods-received-note.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import { Expense } from '../../../database/entities/expense.entity';
import { OwnerEquityTransaction } from '../../../database/entities/owner-equity-transaction.entity';
import { FundTransfer } from '../../../database/entities/fund-transfer.entity';
import { StockAdjustment } from '../../../database/entities/stock-adjustment.entity';
```

Then add this test in the `describe('JournalEntryService')` block:

```typescript
describe('sourceRefNumber resolution', () => {
  it('resolves sourceRefNumber for sales_order sourceType', async () => {
    const entry = {
      ...mockJournalEntry,
      sourceType: 'sales_order',
      sourceId: 'so-uuid-1',
    } as JournalEntry;

    journalEntryRepository.findOne.mockResolvedValue(entry);
    mockSalesOrderRepo.findOne.mockResolvedValue({ orderNumber: 'SO-0042' });

    const result = await service.findOne('entry-1');

    expect(result.sourceRefNumber).toBe('SO-0042');
  });

  it('resolves sourceRefNumber for purchase_order sourceType', async () => {
    const entry = {
      ...mockJournalEntry,
      sourceType: 'purchase_order',
      sourceId: 'po-uuid-1',
    } as JournalEntry;

    journalEntryRepository.findOne.mockResolvedValue(entry);
    mockPurchaseOrderRepo.findOne.mockResolvedValue({ orderNumber: 'PO-0007' });

    const result = await service.findOne('entry-1');

    expect(result.sourceRefNumber).toBe('PO-0007');
  });

  it('returns undefined sourceRefNumber for manual entries', async () => {
    const entry = {
      ...mockJournalEntry,
      sourceType: 'manual',
      sourceId: undefined,
    } as JournalEntry;

    journalEntryRepository.findOne.mockResolvedValue(entry);

    const result = await service.findOne('entry-1');

    expect(result.sourceRefNumber).toBeUndefined();
  });

  it('returns undefined sourceRefNumber when source record not found', async () => {
    const entry = {
      ...mockJournalEntry,
      sourceType: 'sales_order',
      sourceId: 'so-missing',
    } as JournalEntry;

    journalEntryRepository.findOne.mockResolvedValue(entry);
    mockSalesOrderRepo.findOne.mockResolvedValue(null);

    const result = await service.findOne('entry-1');

    expect(result.sourceRefNumber).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `sourceRefNumber` does not exist yet.

- [ ] **Step 3: Implement `resolveSourceRefNumber`**

In `journal-entry.service.ts`, add this private async method before `toResponseDto`:

```typescript
private async resolveSourceRefNumber(
  sourceType: string | undefined,
  sourceId: string | undefined,
): Promise<string | undefined> {
  if (!sourceType || !sourceId) return undefined;

  try {
    switch (sourceType) {
      case 'sales_order': {
        const record = await this.salesOrderRepository.findOne({
          where: { id: sourceId },
          select: ['orderNumber'],
        });
        return record?.orderNumber;
      }
      case 'purchase_order': {
        const record = await this.purchaseOrderRepository.findOne({
          where: { id: sourceId },
          select: ['orderNumber'],
        });
        return record?.orderNumber;
      }
      case 'payment': {
        const record = await this.paymentRepository.findOne({
          where: { id: sourceId },
          select: ['paymentNumber'],
        });
        return record?.paymentNumber;
      }
      case 'goods_received_note': {
        const record = await this.grnRepository.findOne({
          where: { id: sourceId },
          select: ['grnNumber'],
        });
        return record?.grnNumber;
      }
      case 'vendor_payment': {
        const record = await this.vendorPaymentRepository.findOne({
          where: { id: sourceId },
          select: ['paymentNumber'],
        });
        return record?.paymentNumber;
      }
      case 'expense': {
        const record = await this.expenseRepository.findOne({
          where: { id: sourceId },
          select: ['referenceNumber'],
        });
        return record?.referenceNumber;
      }
      case 'owner_equity_transaction': {
        const record = await this.ownerEquityTransactionRepository.findOne({
          where: { id: sourceId },
          select: ['referenceNumber'],
        });
        return record?.referenceNumber;
      }
      case 'fund_transfer': {
        const record = await this.fundTransferRepository.findOne({
          where: { id: sourceId },
          select: ['referenceNumber'],
        });
        return record?.referenceNumber;
      }
      case 'stock_adjustment': {
        const record = await this.stockAdjustmentRepository.findOne({
          where: { id: sourceId },
          select: ['adjustmentNumber'],
        });
        return record?.adjustmentNumber;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Make `toResponseDto` async and call `resolveSourceRefNumber`**

`toResponseDto` is currently synchronous and called inline in multiple places. Change it to async and add the resolution:

```typescript
private async toResponseDto(entry: JournalEntry): Promise<JournalEntryResponseDto> {
  const sourceRefNumber = await this.resolveSourceRefNumber(entry.sourceType, entry.sourceId);
  return {
    id: entry.id,
    entryDate: entry.entryDate,
    referenceNumber: entry.referenceNumber,
    description: entry.description,
    status: entry.status,
    fiscalPeriodId: entry.fiscalPeriodId,
    reversalOfId: entry.reversalOfId,
    reversedById: entry.reversedById,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    sourceRefNumber,
    isDraft: entry.isDraft,
    isPosted: entry.isPosted,
    isReversed: entry.isReversed,
    totalDebits: entry.totalDebits,
    totalCredits: entry.totalCredits,
    isBalanced: entry.isBalanced,
    fiscalPeriod: entry.fiscalPeriod
      ? {
          id: entry.fiscalPeriod.id,
          code: entry.fiscalPeriod.code,
          name: entry.fiscalPeriod.name,
          status: entry.fiscalPeriod.status,
        }
      : undefined,
    lines: entry.lines
      ? entry.lines.map((line) => this.toLineResponseDto(line))
      : undefined,
    reversalOf: entry.reversalOf
      ? await this.toResponseDto(entry.reversalOf)
      : undefined,
    reversedBy: entry.reversedBy
      ? await this.toResponseDto(entry.reversedBy)
      : undefined,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
  };
}
```

Then update every call site of `toResponseDto` in the same file that doesn't already `await` it. Search for `this.toResponseDto(` and add `await` — e.g. `return this.toResponseDto(entry)` becomes `return this.toResponseDto(entry)` (they already return the result and the callers are async, so TypeScript will propagate the Promise naturally). Also update the `findAll` map:

```typescript
// Before:
const data = entries.map((entry) => this.toResponseDto(entry));

// After:
const data = await Promise.all(entries.map((entry) => this.toResponseDto(entry)));
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS for the new tests; all pre-existing tests pass too.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/accounting/services/journal-entry.service.ts \
        backend/src/modules/accounting/services/journal-entry.service.spec.ts
git commit -m "feat(accounting): resolve sourceRefNumber from source entity in JE response"
```

---

## Task 4: Add `sourceRefNumber` to the frontend `JournalEntry` type

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add the field**

Find the `JournalEntry` interface in `frontend/src/types/index.ts` (near line 716 where `referenceNumber: string` is). Add after `sourceId`:

```typescript
sourceRefNumber?: string;
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add sourceRefNumber to JournalEntry type"
```

---

## Task 5: Rewrite `JournalEntriesTable` to single column

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.tsx`
- Modify: `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx`
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`

- [ ] **Step 1: Update the test first**

Replace the contents of `frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx` with:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'

import { JournalEntriesTable } from './JournalEntriesTable'
import { JournalEntryStatus } from '@/types'

const makeEntry = (overrides = {}) => ({
  id: '1',
  referenceNumber: 'JE-001',
  entryDate: '2026-01-01',
  description: 'Test entry',
  status: JournalEntryStatus.DRAFT,
  totalDebits: 100,
  totalCredits: 100,
  isBalanced: true,
  sourceType: 'manual',
  sourceId: null,
  lines: [],
  ...overrides,
})

const listRef = createRef<HTMLDivElement>()

describe('JournalEntriesTable', () => {
  const defaultProps = {
    entries: [],
    loading: false,
    total: 0,
    selectedEntryId: null,
    focusedIndex: -1,
    onSelect: vi.fn(),
    listRef,
  }

  it('shows empty state when no entries', () => {
    render(<JournalEntriesTable {...defaultProps} />)
    expect(screen.getByText(/No Journal Entries found/i)).toBeInTheDocument()
  })

  it('renders entry reference number', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} />)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('calls onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('JE-001'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('does not render checkboxes', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('does not render source link, type chip, debits, credits, or status columns', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry({ sourceType: 'sales_order', sourceId: 'so-1' })]} total={1} />)
    expect(screen.queryByText('View Source')).not.toBeInTheDocument()
    expect(screen.queryByText('Sales Order')).not.toBeInTheDocument()
    expect(screen.queryByText('$100')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `onViewSource` prop missing, and extra columns still rendered.

- [ ] **Step 3: Rewrite `JournalEntriesTable.tsx`**

Replace the entire file contents:

```tsx
import React from 'react'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import { JournalEntry } from '@/types'

const COLUMNS: ColumnConfig<JournalEntry>[] = [
  { key: 'reference', render: (entry) => entry.referenceNumber },
]

interface Props {
  entries: JournalEntry[]
  loading: boolean
  total: number
  selectedEntryId: string | null
  focusedIndex: number
  onSelect: (entry: JournalEntry) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

export function JournalEntriesTable({
  entries,
  loading,
  total,
  selectedEntryId,
  focusedIndex,
  onSelect,
  listRef,
}: Props) {
  return (
    <EntityTable
      rows={entries}
      columns={COLUMNS}
      loading={loading}
      total={total}
      label="Journal Entries"
      selectedId={selectedEntryId ?? undefined}
      focusedIndex={focusedIndex}
      onSelect={onSelect}
      listRef={listRef}
      dataAttr="journal-entry"
    />
  )
}
```

- [ ] **Step 4: Remove `onViewSource` from `JournalEntriesPage.tsx`**

Open `frontend/src/pages/accounting/JournalEntriesPage.tsx`. Remove the `onViewSource` prop from `<JournalEntriesTable>`:

```tsx
// Before:
<JournalEntriesTable
  entries={entries}
  loading={isLoading}
  total={pagination?.total ?? 0}
  selectedEntryId={workspace.selectedEntry?.id ?? null}
  focusedIndex={workspace.focusedIndex}
  onSelect={workspace.handleSelect}
  onViewSource={(sourceType, sourceId) => workspace.navigateToSource(sourceType, sourceId)}
  listRef={workspace.listRef}
/>

// After:
<JournalEntriesTable
  entries={entries}
  loading={isLoading}
  total={pagination?.total ?? 0}
  selectedEntryId={workspace.selectedEntry?.id ?? null}
  focusedIndex={workspace.focusedIndex}
  onSelect={workspace.handleSelect}
  listRef={workspace.listRef}
/>
```

- [ ] **Step 5: Run the tests**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntriesTable.test.tsx 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntriesTable.tsx \
        frontend/src/pages/accounting/components/JournalEntriesTable.test.tsx \
        frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "feat(frontend): slim JournalEntriesTable to single reference-number column"
```

---

## Task 6: Rewrite `JournalEntryContextHeader` with two-column Grid layout

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx`
- Modify: `frontend/src/pages/accounting/components/JournalEntryContextHeader.test.tsx`

- [ ] **Step 1: Update the tests first**

Replace the entire contents of `frontend/src/pages/accounting/components/JournalEntryContextHeader.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { JournalEntryContextHeader } from './JournalEntryContextHeader'
import { JournalEntryStatus } from '@/types'

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value}`,
  formatDate: (date: string) => date,
}))

vi.mock('@/components/common/EntityStatusChip', () => ({
  EntityStatusChip: ({ status }: any) => <span>{status}</span>,
}))

vi.mock('@/components/common/EntityContextHeaderBar', () => ({
  EntityContextHeaderBar: ({ title, statusChip }: any) => (
    <div>
      <span>{title}</span>
      {statusChip}
    </div>
  ),
}))

const makeEntry = (overrides = {}) => ({
  id: '1',
  referenceNumber: 'JE-001',
  entryDate: '2026-01-01',
  description: 'Test entry',
  status: JournalEntryStatus.POSTED,
  totalDebits: 500,
  totalCredits: 500,
  sourceType: 'manual',
  sourceId: null,
  sourceRefNumber: undefined,
  lines: [],
  ...overrides,
})

const renderHeader = (entry: any) =>
  render(
    <MemoryRouter>
      <JournalEntryContextHeader selectedEntry={entry} />
    </MemoryRouter>,
  )

describe('JournalEntryContextHeader', () => {
  it('renders empty state when no entry is selected', () => {
    renderHeader(null)
    expect(screen.getByText(/select a journal entry/i)).toBeInTheDocument()
  })

  it('renders title with reference number', () => {
    renderHeader(makeEntry())
    expect(screen.getByText('Journal Entry Details - JE-001')).toBeInTheDocument()
  })

  it('renders left column section title', () => {
    renderHeader(makeEntry())
    expect(screen.getByText('Entry Information')).toBeInTheDocument()
  })

  it('renders right column section title', () => {
    renderHeader(makeEntry())
    expect(screen.getByText('References & Amounts')).toBeInTheDocument()
  })

  it('renders date, description, entry type in left column', () => {
    renderHeader(makeEntry())
    expect(screen.getByText('2026-01-01')).toBeInTheDocument()
    expect(screen.getByText('Test entry')).toBeInTheDocument()
    expect(screen.getByText('Manual Entry')).toBeInTheDocument()
  })

  it('renders debits and credits in right column', () => {
    renderHeader(makeEntry())
    expect(screen.getAllByText('$500').length).toBe(2)
  })

  it('renders status chip', () => {
    renderHeader(makeEntry())
    expect(screen.getByText(JournalEntryStatus.POSTED)).toBeInTheDocument()
  })

  it('renders entry type chip in header bar', () => {
    renderHeader(makeEntry({ sourceType: 'sales_order' }))
    expect(screen.getByText('Sales Order')).toBeInTheDocument()
  })

  it('does not render source row for manual entries', () => {
    renderHeader(makeEntry({ sourceType: 'manual', sourceId: null }))
    expect(screen.queryByText('Source')).not.toBeInTheDocument()
  })

  it('does not render source row when sourceId is missing', () => {
    renderHeader(makeEntry({ sourceType: 'sales_order', sourceId: null }))
    expect(screen.queryByText('Source')).not.toBeInTheDocument()
  })

  it('renders clickable sourceRefNumber when present', () => {
    const { container } = renderHeader(
      makeEntry({ sourceType: 'sales_order', sourceId: 'so-1', sourceRefNumber: 'SO-0042' }),
    )
    expect(screen.getByText('SO-0042')).toBeInTheDocument()
    const btn = container.querySelector('button')
    expect(btn).toBeTruthy()
  })

  it('does not render Edit, Post, Delete, or Reverse buttons', () => {
    renderHeader(makeEntry())
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/^post$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reverse/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntryContextHeader.test.tsx 2>&1 | tail -30
```

Expected: FAIL — Grid layout, new title format, section headers, and `sourceRefNumber` not yet implemented.

- [ ] **Step 3: Rewrite `JournalEntryContextHeader.tsx`**

Replace the entire file:

```tsx
import { Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { useNavigate } from 'react-router-dom'

import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

const ENTRY_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual Entry',
  sales_order: 'Sales Order',
  payment: 'Customer Payment',
  settlement: 'Settlement',
  goods_received_note: 'Goods Receipt',
  vendor_payment: 'Vendor Payment',
  stock_adjustment: 'Stock Adjustment',
  owner_equity_transaction: 'Owner Equity',
  expense: 'Expense',
  opening_balance: 'Opening Balance',
  fund_transfer: 'Fund Transfer',
}

const SOURCE_ROUTES: Record<string, (id: string) => string> = {
  sales_order: (id) => `/sales/orders?highlight=${id}`,
  payment: (id) => `/sales/payments?highlight=${id}`,
  goods_received_note: (id) => `/purchasing/goods-received?grnId=${id}`,
  vendor_payment: (id) => `/purchasing/vendor-payments?vpId=${id}`,
  expense: () => `/accounting/expenses`,
  owner_equity_transaction: () => `/accounting/owner-equity`,
  fund_transfer: () => `/accounting/fund-transfers`,
  stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
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

const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

interface Props {
  selectedEntry: JournalEntry | null
}

export function JournalEntryContextHeader({ selectedEntry }: Props) {
  const navigate = useNavigate()

  if (!selectedEntry) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a journal entry to view details
        </Typography>
      </Paper>
    )
  }

  const hasSource =
    !!selectedEntry.sourceType &&
    selectedEntry.sourceType !== 'manual' &&
    !!selectedEntry.sourceId

  const handleNavigateToSource = () => {
    if (!hasSource) return
    const route = SOURCE_ROUTES[selectedEntry.sourceType!]
    if (route) navigate(route(selectedEntry.sourceId!))
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={`Journal Entry Details - ${selectedEntry.referenceNumber}`}
        statusChip={(
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <EntityStatusChip status={selectedEntry.status} />
            {selectedEntry.sourceType && (
              <Chip
                label={ENTRY_TYPE_LABELS[selectedEntry.sourceType] ?? selectedEntry.sourceType}
                size="small"
                variant="outlined"
              />
            )}
          </Stack>
        )}
      />
      <Grid container spacing={3} sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TableContainer>
            <Table size={TABLE_STYLES.size} sx={detailTableSx}>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                      Entry Information
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Date</TableCell>
                  <TableCell sx={valueCellSx}>{formatDate(selectedEntry.entryDate)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={labelCellSx}>Description</TableCell>
                  <TableCell sx={valueCellSx}>{selectedEntry.description}</TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Entry Type</TableCell>
                  <TableCell sx={valueCellSx}>
                    {ENTRY_TYPE_LABELS[selectedEntry.sourceType ?? ''] ?? 'Manual Entry'}
                  </TableCell>
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
                      References & Amounts
                    </Typography>
                  </TableCell>
                </TableRow>
                {hasSource && (
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Source</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedEntry.sourceRefNumber ? (
                        <Typography
                          component="button"
                          onClick={handleNavigateToSource}
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
                          {selectedEntry.sourceRefNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow sx={hasSource ? {} : { backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Debits</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(selectedEntry.totalDebits)}</TableCell>
                </TableRow>
                <TableRow sx={hasSource ? { backgroundColor: 'grey.50' } : {}}>
                  <TableCell sx={labelCellSx}>Credits</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(selectedEntry.totalCredits)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Paper>
  )
}
```

- [ ] **Step 4: Remove `onNavigateToSource` from `JournalEntriesPage.tsx`**

Open `frontend/src/pages/accounting/JournalEntriesPage.tsx`. The `headerSlot` currently passes `onNavigateToSource`:

```tsx
// Before:
headerSlot={(
  <JournalEntryContextHeader
    selectedEntry={workspace.selectedEntry}
    onNavigateToSource={(path) => navigate(path)}
  />
)}

// After:
headerSlot={(
  <JournalEntryContextHeader
    selectedEntry={workspace.selectedEntry}
  />
)}
```

Also remove the `useNavigate` import and `navigate` variable if they are now unused (check — `navigate` may be used elsewhere in the page; if not, remove both).

- [ ] **Step 5: Run the tests**

```bash
cd frontend && npx vitest run src/pages/accounting/components/JournalEntryContextHeader.test.tsx 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx \
        frontend/src/pages/accounting/components/JournalEntryContextHeader.test.tsx \
        frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "feat(frontend): rewrite JournalEntryContextHeader with two-column Grid layout"
```

---

## Task 7: Run full test suites and verify

- [ ] **Step 1: Run all affected backend tests**

```bash
cd backend && npx jest src/modules/accounting/services/journal-entry.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 2: Run all affected frontend tests**

```bash
cd frontend && npx vitest run src/pages/accounting/ 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 3: Final commit if clean**

If all tests pass with no uncommitted changes, the implementation is complete. Otherwise fix any remaining failures before committing.
