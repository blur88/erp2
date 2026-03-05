# Accounting Module Phase 5: Polish & Production Ready

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finalize the accounting module for production with opening balance posting, role-based access control, keyboard shortcuts, bulk operations, and improved error handling.

**Architecture:** Phase 5 builds on the complete Phases 1-4 foundation (7 entities, 7 services, 6 controllers, 14 frontend pages, 247 backend tests passing). This phase adds cross-cutting concerns: RBAC on all 6 controllers, keyboard shortcuts on 6 more pages, opening balance posting endpoint, bulk journal entry operations, and frontend UX polish.

**Tech Stack:** NestJS 11 (backend), React 18.3.1 + MUI v7 + Redux Toolkit (frontend), Jest (backend tests), Vitest (frontend tests), TypeORM (PostgreSQL)

---

## Current State (Post Phase 4)

| Area | Status |
|------|--------|
| Backend services | 7 services, 247 tests passing |
| Backend controllers | 6 controllers, full Swagger docs, **no RBAC** |
| Frontend pages | 14 pages (9 main + 5 reports) |
| Frontend components | 8 reusable components |
| Redux slices | 6 slices |
| Keyboard shortcuts | Only on ChartOfAccountsPage, FiscalPeriodsPage |
| Bulk operations | Only on BankReconciliationDetailsPage |
| Opening balance | Calculated in reports, **no posting endpoint** |
| Role-based access | **None** - all endpoints open to any authenticated user |

---

## Task 1: Add Role-Based Access Control to All Controllers

**Files:**
- Modify: `backend/src/modules/accounting/controllers/chart-of-accounts.controller.ts`
- Modify: `backend/src/modules/accounting/controllers/journal-entry.controller.ts`
- Modify: `backend/src/modules/accounting/controllers/fiscal-period.controller.ts`
- Modify: `backend/src/modules/accounting/controllers/account-mapping.controller.ts`
- Modify: `backend/src/modules/accounting/controllers/accounting-reports.controller.ts`
- Modify: `backend/src/modules/accounting/controllers/reconciliation.controller.ts`
- Test: `backend/src/modules/accounting/controllers/accounting-rbac.spec.ts`

### Access Control Matrix

| Action | Admin | Manager | Sales | Inventory | Procurement |
|--------|-------|---------|-------|-----------|-------------|
| View COA, entries, reports | Yes | Yes | Yes | Yes | Yes |
| Create manual journal entry | Yes | Yes | No | No | No |
| Post/reverse journal entry | Yes | Yes | No | No | No |
| Manage COA (create/edit/delete) | Yes | Yes | No | No | No |
| Seed COA | Yes | No | No | No | No |
| Close/reopen fiscal periods | Yes | No | No | No | No |
| Generate fiscal periods | Yes | No | No | No | No |
| Manage account mappings | Yes | No | No | No | No |
| Complete/reopen reconciliation | Yes | Yes | No | No | No |
| Delete entries/accounts | Yes | No | No | No | No |

**Step 1: Write the failing test**

Create `backend/src/modules/accounting/controllers/accounting-rbac.spec.ts`:

```typescript
import 'reflect-metadata';
import { ChartOfAccountsController } from './chart-of-accounts.controller';
import { JournalEntryController } from './journal-entry.controller';
import { FiscalPeriodController } from './fiscal-period.controller';
import { AccountMappingController } from './account-mapping.controller';
import { AccountingReportsController } from './accounting-reports.controller';
import { ReconciliationController } from './reconciliation.controller';

// Helper: check if method has Auth decorator with specific roles
function getAuthMetadata(controller: any, methodName: string): any {
  const guards = Reflect.getMetadata('__guards__', controller.prototype[methodName]) || [];
  const roles = Reflect.getMetadata('roles', controller.prototype[methodName]) || [];
  return { hasGuards: guards.length > 0, roles };
}

// Helper: check if controller class has Auth decorator
function getControllerAuthMetadata(controller: any): any {
  const guards = Reflect.getMetadata('__guards__', controller) || [];
  const roles = Reflect.getMetadata('roles', controller) || [];
  return { hasGuards: guards.length > 0, roles };
}

describe('Accounting RBAC', () => {
  describe('ChartOfAccountsController', () => {
    it('should have Auth() on class level for read access', () => {
      const meta = getControllerAuthMetadata(ChartOfAccountsController);
      expect(meta.hasGuards).toBe(true);
    });

    it('should require ADMIN role for seed endpoint', () => {
      const meta = getAuthMetadata(ChartOfAccountsController, 'seedDefaults');
      expect(meta.roles).toContain('admin');
    });

    it('should require ADMIN or MANAGER role for create', () => {
      const meta = getAuthMetadata(ChartOfAccountsController, 'create');
      expect(meta.roles).toEqual(expect.arrayContaining(['admin', 'manager']));
    });

    it('should require ADMIN role for delete', () => {
      const meta = getAuthMetadata(ChartOfAccountsController, 'remove');
      expect(meta.roles).toContain('admin');
    });
  });

  describe('JournalEntryController', () => {
    it('should require ADMIN or MANAGER for create', () => {
      const meta = getAuthMetadata(JournalEntryController, 'create');
      expect(meta.roles).toEqual(expect.arrayContaining(['admin', 'manager']));
    });

    it('should require ADMIN or MANAGER for post', () => {
      const meta = getAuthMetadata(JournalEntryController, 'postEntry');
      expect(meta.roles).toEqual(expect.arrayContaining(['admin', 'manager']));
    });

    it('should require ADMIN for delete', () => {
      const meta = getAuthMetadata(JournalEntryController, 'remove');
      expect(meta.roles).toContain('admin');
    });
  });

  describe('FiscalPeriodController', () => {
    it('should require ADMIN for close period', () => {
      const meta = getAuthMetadata(FiscalPeriodController, 'closePeriod');
      expect(meta.roles).toContain('admin');
    });

    it('should require ADMIN for reopen period', () => {
      const meta = getAuthMetadata(FiscalPeriodController, 'reopenPeriod');
      expect(meta.roles).toContain('admin');
    });

    it('should require ADMIN for generate periods', () => {
      const meta = getAuthMetadata(FiscalPeriodController, 'generatePeriods');
      expect(meta.roles).toContain('admin');
    });
  });

  describe('AccountMappingController', () => {
    it('should require ADMIN for create mapping', () => {
      const meta = getAuthMetadata(AccountMappingController, 'create');
      expect(meta.roles).toContain('admin');
    });

    it('should require ADMIN for update mapping', () => {
      const meta = getAuthMetadata(AccountMappingController, 'update');
      expect(meta.roles).toContain('admin');
    });

    it('should require ADMIN for delete mapping', () => {
      const meta = getAuthMetadata(AccountMappingController, 'remove');
      expect(meta.roles).toContain('admin');
    });
  });

  describe('ReconciliationController', () => {
    it('should require ADMIN or MANAGER for complete', () => {
      const meta = getAuthMetadata(ReconciliationController, 'complete');
      expect(meta.roles).toEqual(expect.arrayContaining(['admin', 'manager']));
    });

    it('should require ADMIN for reopen', () => {
      const meta = getAuthMetadata(ReconciliationController, 'reopen');
      expect(meta.roles).toContain('admin');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="accounting-rbac" --verbose`
Expected: FAIL - no guards/roles metadata found

**Step 3: Add Auth decorators to all 6 controllers**

Add to each controller file. Import at top of each:

```typescript
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
```

**chart-of-accounts.controller.ts** - Add `@Auth()` at class level. Add method-level overrides:
- `@Auth(UserRole.ADMIN, UserRole.MANAGER)` on `create`, `update`, `restore`
- `@Auth(UserRole.ADMIN)` on `remove`, `seedDefaults`

**journal-entry.controller.ts** - Add `@Auth()` at class level. Add method-level overrides:
- `@Auth(UserRole.ADMIN, UserRole.MANAGER)` on `create`, `update`, `postEntry`, `reverseEntry`
- `@Auth(UserRole.ADMIN)` on `remove`

**fiscal-period.controller.ts** - Add `@Auth()` at class level. Add method-level overrides:
- `@Auth(UserRole.ADMIN)` on `create`, `update`, `remove`, `closePeriod`, `reopenPeriod`, `generatePeriods`, `restore`

**account-mapping.controller.ts** - Add `@Auth()` at class level. Add method-level overrides:
- `@Auth(UserRole.ADMIN)` on `create`, `update`, `remove`

**accounting-reports.controller.ts** - Add `@Auth()` at class level (all authenticated users can view reports). No method-level overrides needed.

**reconciliation.controller.ts** - Add `@Auth()` at class level. Add method-level overrides:
- `@Auth(UserRole.ADMIN, UserRole.MANAGER)` on `create`, `update`, `markCleared`, `unmarkCleared`, `complete`
- `@Auth(UserRole.ADMIN)` on `remove`, `reopen`

**Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPatterns="accounting-rbac" --verbose`
Expected: PASS

**Step 5: Run full accounting test suite to verify no regressions**

Run: `cd backend && npx jest --testPathPatterns="accounting" --verbose`
Expected: 247+ tests PASS (existing + new RBAC tests)

**Step 6: Commit**

```bash
git add backend/src/modules/accounting/controllers/ backend/src/modules/accounting/controllers/accounting-rbac.spec.ts
git commit -m "feat(accounting): add role-based access control to all controllers"
```

---

## Task 2: Opening Balance Posting Endpoint

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting.service.ts`
- Modify: `backend/src/modules/accounting/controllers/journal-entry.controller.ts`
- Modify: `backend/src/modules/accounting/dto/journal-entry.dto.ts`
- Test: `backend/src/modules/accounting/services/accounting.service.spec.ts` (add tests)

Opening balance posting creates a single journal entry with lines for each account's starting balance. It uses a designated Equity account (Retained Earnings / Opening Balance Equity) to balance the entry.

**Step 1: Write the failing test**

Add to `backend/src/modules/accounting/services/accounting.service.spec.ts`:

```typescript
describe('postOpeningBalances', () => {
  it('should create a balanced journal entry with opening balances', async () => {
    // Arrange
    const dto = {
      asOfDate: '2026-01-01',
      balances: [
        { accountId: 'cash-id', amount: 50000 },      // Asset: debit
        { accountId: 'ar-id', amount: 25000 },         // Asset: debit
        { accountId: 'ap-id', amount: -15000 },        // Liability: credit
        { accountId: 'equity-id', amount: -60000 },    // Equity: credit
      ],
      equityAccountId: 'equity-id',
    };

    // Mock account lookups to return correct types
    jest.spyOn(chartOfAccountsService, 'findOne')
      .mockResolvedValueOnce({ id: 'cash-id', type: 'ASSET' } as any)
      .mockResolvedValueOnce({ id: 'ar-id', type: 'ASSET' } as any)
      .mockResolvedValueOnce({ id: 'ap-id', type: 'LIABILITY' } as any)
      .mockResolvedValueOnce({ id: 'equity-id', type: 'EQUITY' } as any);

    // Mock journal entry creation
    jest.spyOn(journalEntryService, 'create').mockResolvedValue({ id: 'je-id' } as any);
    jest.spyOn(journalEntryService, 'postEntry').mockResolvedValue({ id: 'je-id', status: 'POSTED' } as any);

    // Act
    const result = await service.postOpeningBalances(dto);

    // Assert
    expect(journalEntryService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('Opening Balance'),
        sourceType: 'opening_balance',
      }),
    );
    expect(journalEntryService.postEntry).toHaveBeenCalledWith('je-id');
  });

  it('should reject if total debits do not equal total credits', async () => {
    const dto = {
      asOfDate: '2026-01-01',
      balances: [
        { accountId: 'cash-id', amount: 50000 },
        { accountId: 'ar-id', amount: 25000 },
      ],
      equityAccountId: 'equity-id',
    };

    jest.spyOn(chartOfAccountsService, 'findOne')
      .mockResolvedValueOnce({ id: 'cash-id', type: 'ASSET' } as any)
      .mockResolvedValueOnce({ id: 'ar-id', type: 'ASSET' } as any);

    await expect(service.postOpeningBalances(dto)).rejects.toThrow(BadRequestException);
  });

  it('should reject if no open fiscal period exists for the date', async () => {
    const dto = {
      asOfDate: '2025-01-01',
      balances: [{ accountId: 'cash-id', amount: 50000 }],
      equityAccountId: 'equity-id',
    };

    jest.spyOn(fiscalPeriodService, 'validatePeriod').mockResolvedValue({
      isValid: false,
      period: null,
    } as any);

    await expect(service.postOpeningBalances(dto)).rejects.toThrow(BadRequestException);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="accounting.service.spec" --verbose`
Expected: FAIL - `postOpeningBalances` method not found

**Step 3: Add the DTO**

Add to `backend/src/modules/accounting/dto/journal-entry.dto.ts`:

```typescript
export class OpeningBalanceLineDto {
  @IsUUID()
  @ApiProperty({ description: 'Account ID' })
  accountId: string;

  @IsNumber()
  @ApiProperty({ description: 'Positive = debit (asset/expense), negative = credit (liability/equity/revenue)' })
  amount: number;
}

export class PostOpeningBalancesDto {
  @IsDateString()
  @ApiProperty({ description: 'Opening balance date (typically first day of fiscal year)' })
  asOfDate: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningBalanceLineDto)
  @ArrayMinSize(1)
  @ApiProperty({ description: 'Account balances', type: [OpeningBalanceLineDto] })
  balances: OpeningBalanceLineDto[];

  @IsUUID()
  @ApiProperty({ description: 'Equity account to use for balancing (e.g., Opening Balance Equity)' })
  equityAccountId: string;
}
```

**Step 4: Implement the service method**

Add to `backend/src/modules/accounting/services/accounting.service.ts`:

```typescript
/**
 * Post opening balances as a single balanced journal entry.
 * Positive amounts become debits, negative amounts become credits.
 * An equity line is auto-calculated to balance the entry.
 */
async postOpeningBalances(dto: PostOpeningBalancesDto): Promise<JournalEntry> {
  this.logger.log(`Posting opening balances as of ${dto.asOfDate}`);

  // Validate period is open
  const periodValidation = await this.fiscalPeriodService.validatePeriod({
    date: dto.asOfDate,
  });

  if (!periodValidation.isValid || !periodValidation.period) {
    throw new BadRequestException(
      `No open fiscal period found for date ${dto.asOfDate}`,
    );
  }

  // Build journal entry lines
  const lines: CreateJournalEntryLineDto[] = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (const balance of dto.balances) {
    if (balance.amount === 0) continue;

    if (balance.amount > 0) {
      lines.push({
        accountId: balance.accountId,
        debitAmount: Math.abs(balance.amount),
        creditAmount: 0,
        memo: 'Opening balance',
      });
      totalDebits += Math.abs(balance.amount);
    } else {
      lines.push({
        accountId: balance.accountId,
        debitAmount: 0,
        creditAmount: Math.abs(balance.amount),
        memo: 'Opening balance',
      });
      totalCredits += Math.abs(balance.amount);
    }
  }

  // Add equity balancing line if needed
  const difference = totalDebits - totalCredits;
  if (Math.abs(difference) > 0.01) {
    if (difference > 0) {
      // More debits than credits - credit equity
      lines.push({
        accountId: dto.equityAccountId,
        debitAmount: 0,
        creditAmount: difference,
        memo: 'Opening balance equity',
      });
    } else {
      // More credits than debits - debit equity
      lines.push({
        accountId: dto.equityAccountId,
        debitAmount: Math.abs(difference),
        creditAmount: 0,
        memo: 'Opening balance equity',
      });
    }
  }

  // Create and post the journal entry
  const entry = await this.journalEntryService.create({
    entryDate: dto.asOfDate,
    description: `Opening Balance Entry as of ${dto.asOfDate}`,
    fiscalPeriodId: periodValidation.period.id,
    sourceType: 'opening_balance',
    lines,
  });

  return this.journalEntryService.postEntry(entry.id);
}
```

**Step 5: Add the controller endpoint**

Add to `backend/src/modules/accounting/controllers/journal-entry.controller.ts` (before the `:id` routes):

```typescript
@Post('opening-balances')
@Auth(UserRole.ADMIN)
@ApiOperation({ summary: 'Post opening balances' })
@ApiResponse({
  status: 201,
  description: 'Opening balance entry created and posted',
  type: JournalEntryResponseDto,
})
@ApiResponse({ status: 400, description: 'Invalid balances or no open period' })
async postOpeningBalances(
  @Body() dto: PostOpeningBalancesDto,
): Promise<JournalEntryResponseDto> {
  return this.accountingService.postOpeningBalances(dto);
}
```

Update constructor to inject AccountingService:

```typescript
constructor(
  private readonly journalEntryService: JournalEntryService,
  private readonly accountingService: AccountingService,
) {}
```

**Step 6: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPatterns="accounting.service.spec" --verbose`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/src/modules/accounting/
git commit -m "feat(accounting): add opening balance posting endpoint"
```

---

## Task 3: Bulk Journal Entry Operations (Bulk Post, Bulk Delete)

**Files:**
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`
- Modify: `backend/src/modules/accounting/controllers/journal-entry.controller.ts`
- Modify: `backend/src/modules/accounting/dto/journal-entry.dto.ts`
- Test: `backend/src/modules/accounting/services/journal-entry.service.spec.ts` (add tests)

**Step 1: Write the failing tests**

Add to `journal-entry.service.spec.ts`:

```typescript
describe('bulkPost', () => {
  it('should post multiple draft entries', async () => {
    const ids = ['id1', 'id2', 'id3'];
    jest.spyOn(service, 'postEntry')
      .mockResolvedValueOnce({ id: 'id1', status: 'POSTED' } as any)
      .mockResolvedValueOnce({ id: 'id2', status: 'POSTED' } as any)
      .mockResolvedValueOnce({ id: 'id3', status: 'POSTED' } as any);

    const result = await service.bulkPost(ids);

    expect(result.succeeded).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
  });

  it('should return partial results when some entries fail', async () => {
    const ids = ['id1', 'id2'];
    jest.spyOn(service, 'postEntry')
      .mockResolvedValueOnce({ id: 'id1', status: 'POSTED' } as any)
      .mockRejectedValueOnce(new BadRequestException('Not balanced'));

    const result = await service.bulkPost(ids);

    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe('id2');
    expect(result.failed[0].error).toContain('Not balanced');
  });
});

describe('bulkDelete', () => {
  it('should delete multiple draft entries', async () => {
    const ids = ['id1', 'id2'];
    jest.spyOn(service, 'remove')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await service.bulkDelete(ids);

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
  });

  it('should return failures for non-draft entries', async () => {
    const ids = ['id1', 'id2'];
    jest.spyOn(service, 'remove')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new BadRequestException('Cannot delete posted entry'));

    const result = await service.bulkDelete(ids);

    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="journal-entry.service.spec" --verbose`
Expected: FAIL - `bulkPost` and `bulkDelete` not found

**Step 3: Add DTOs**

Add to `backend/src/modules/accounting/dto/journal-entry.dto.ts`:

```typescript
export class BulkOperationDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMinSize(1)
  @ApiProperty({ description: 'Array of journal entry IDs' })
  ids: string[];
}

export class BulkOperationResultDto {
  @ApiProperty({ description: 'Successfully processed entry IDs' })
  succeeded: string[];

  @ApiProperty({ description: 'Failed entries with error messages' })
  failed: { id: string; error: string }[];
}
```

**Step 4: Implement service methods**

Add to `journal-entry.service.ts`:

```typescript
async bulkPost(ids: string[]): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      await this.postEntry(id);
      succeeded.push(id);
    } catch (error) {
      failed.push({ id, error: error.message });
    }
  }

  return { succeeded, failed };
}

async bulkDelete(ids: string[]): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      await this.remove(id);
      succeeded.push(id);
    } catch (error) {
      failed.push({ id, error: error.message });
    }
  }

  return { succeeded, failed };
}
```

**Step 5: Add controller endpoints**

Add to `journal-entry.controller.ts`:

```typescript
@Post('bulk-post')
@Auth(UserRole.ADMIN, UserRole.MANAGER)
@ApiOperation({ summary: 'Post multiple draft journal entries' })
@ApiResponse({ status: 200, description: 'Bulk post results', type: BulkOperationResultDto })
async bulkPost(@Body() dto: BulkOperationDto): Promise<BulkOperationResultDto> {
  return this.journalEntryService.bulkPost(dto.ids);
}

@Post('bulk-delete')
@Auth(UserRole.ADMIN)
@ApiOperation({ summary: 'Delete multiple draft journal entries' })
@ApiResponse({ status: 200, description: 'Bulk delete results', type: BulkOperationResultDto })
async bulkDelete(@Body() dto: BulkOperationDto): Promise<BulkOperationResultDto> {
  return this.journalEntryService.bulkDelete(dto.ids);
}
```

**Important:** These routes must come **before** the `:id` route to avoid NestJS treating "bulk-post" as a UUID.

**Step 6: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPatterns="journal-entry.service.spec" --verbose`
Expected: PASS

**Step 7: Commit**

```bash
git add backend/src/modules/accounting/
git commit -m "feat(accounting): add bulk post and bulk delete for journal entries"
```

---

## Task 4: Frontend - Bulk Operations on Journal Entries Page

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Modify: `frontend/src/store/slices/journalEntriesSlice.ts`
- Modify: `frontend/src/services/accountingApi.ts`
- Test: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx` (update)

**Step 1: Add API methods**

Add to `frontend/src/services/accountingApi.ts`:

```typescript
bulkPostEntries: (ids: string[]) =>
  ApiService.post('/accounting/journal-entries/bulk-post', { ids }),
bulkDeleteEntries: (ids: string[]) =>
  ApiService.post('/accounting/journal-entries/bulk-delete', { ids }),
```

**Step 2: Add Redux thunks**

Add to `frontend/src/store/slices/journalEntriesSlice.ts`:

```typescript
export const bulkPostEntries = createAsyncThunk(
  'journalEntries/bulkPost',
  async (ids: string[], { rejectWithValue }) => {
    try {
      const response = await journalEntriesApi.bulkPostEntries(ids);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Bulk post failed');
    }
  },
);

export const bulkDeleteEntries = createAsyncThunk(
  'journalEntries/bulkDelete',
  async (ids: string[], { rejectWithValue }) => {
    try {
      const response = await journalEntriesApi.bulkDeleteEntries(ids);
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Bulk delete failed');
    }
  },
);
```

Add extra reducers:

```typescript
.addCase(bulkPostEntries.fulfilled, (state) => {
  state.loading = false;
})
.addCase(bulkDeleteEntries.fulfilled, (state) => {
  state.loading = false;
})
```

**Step 3: Add bulk selection UI to JournalEntriesPage.tsx**

Add state variables:

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [isBulkPostConfirmOpen, setIsBulkPostConfirmOpen] = useState(false);
const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
```

Add selection handlers:

```typescript
const handleToggleSelect = (id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const handleSelectAll = () => {
  if (selectedIds.size === journalEntries.length) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(journalEntries.map((e: JournalEntry) => e.id)));
  }
};

const handleBulkPost = async () => {
  try {
    const result = await dispatch(bulkPostEntries(Array.from(selectedIds))).unwrap();
    showSuccess(`Posted ${result.succeeded.length} entries`);
    if (result.failed.length > 0) {
      showError(`${result.failed.length} entries failed to post`);
    }
    setSelectedIds(new Set());
    dispatch(fetchJournalEntries(filters));
  } catch (error: any) {
    showError(error);
  }
  setIsBulkPostConfirmOpen(false);
};

const handleBulkDelete = async () => {
  try {
    const result = await dispatch(bulkDeleteEntries(Array.from(selectedIds))).unwrap();
    showSuccess(`Deleted ${result.succeeded.length} entries`);
    if (result.failed.length > 0) {
      showError(`${result.failed.length} entries failed to delete`);
    }
    setSelectedIds(new Set());
    dispatch(fetchJournalEntries(filters));
  } catch (error: any) {
    showError(error);
  }
  setIsBulkDeleteConfirmOpen(false);
};
```

Add checkbox column to table header:

```tsx
<TableCell padding="checkbox">
  <Checkbox
    indeterminate={selectedIds.size > 0 && selectedIds.size < journalEntries.length}
    checked={journalEntries.length > 0 && selectedIds.size === journalEntries.length}
    onChange={handleSelectAll}
  />
</TableCell>
```

Add checkbox to each table row:

```tsx
<TableCell padding="checkbox">
  <Checkbox
    checked={selectedIds.has(entry.id)}
    onChange={() => handleToggleSelect(entry.id)}
  />
</TableCell>
```

Add bulk action buttons (show when items selected):

```tsx
{selectedIds.size > 0 && (
  <Stack direction="row" spacing={1}>
    <Button
      size="small"
      variant="contained"
      color="primary"
      startIcon={<PostIcon />}
      onClick={() => setIsBulkPostConfirmOpen(true)}
    >
      Post Selected ({selectedIds.size})
    </Button>
    <Button
      size="small"
      variant="outlined"
      color="error"
      startIcon={<DeleteIcon />}
      onClick={() => setIsBulkDeleteConfirmOpen(true)}
    >
      Delete Selected ({selectedIds.size})
    </Button>
  </Stack>
)}
```

Add confirmation dialogs:

```tsx
<ConfirmationDialog
  open={isBulkPostConfirmOpen}
  onClose={() => setIsBulkPostConfirmOpen(false)}
  onConfirm={handleBulkPost}
  title="Bulk Post Entries"
  message={`Post ${selectedIds.size} selected journal entries? Only draft entries will be posted.`}
/>
<ConfirmationDialog
  open={isBulkDeleteConfirmOpen}
  onClose={() => setIsBulkDeleteConfirmOpen(false)}
  onConfirm={handleBulkDelete}
  title="Bulk Delete Entries"
  message={`Delete ${selectedIds.size} selected journal entries? Only draft entries can be deleted.`}
/>
```

**Step 4: Run frontend type check**

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx frontend/src/store/slices/journalEntriesSlice.ts frontend/src/services/accountingApi.ts
git commit -m "feat(accounting): add bulk post and delete UI for journal entries"
```

---

## Task 5: Add Keyboard Shortcuts to Remaining Pages

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Modify: `frontend/src/pages/accounting/JournalEntryFormPage.tsx`
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`
- Modify: `frontend/src/pages/accounting/BankReconciliationsPage.tsx`
- Modify: `frontend/src/pages/accounting/AccountingDashboardPage.tsx`

The existing `useKeyboardShortcuts` hook (from `@/hooks/useSearchAndFilter`) supports these callbacks: `onSearch` (Ctrl+F), `onAdd` (N/+), `onRefresh` (Ctrl+R), `onEdit` (E), `onDelete` (Delete/D), `onExport` (Ctrl+X), `onEscape`.

**Step 1: Add to JournalEntriesPage.tsx**

Add import:
```typescript
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
```

Add hook call inside component:
```typescript
useKeyboardShortcuts({
  onSearch: () => {
    const el = document.querySelector<HTMLInputElement>('[data-testid="search-input"]');
    el?.focus();
  },
  onAdd: () => navigate('/accounting/journal-entries/new'),
  onRefresh: () => dispatch(fetchJournalEntries(filters)),
});
```

**Step 2: Add to JournalEntryFormPage.tsx**

```typescript
useKeyboardShortcuts({
  onEscape: () => navigate('/accounting/journal-entries'),
});
```

**Step 3: Add to AccountMappingsPage.tsx**

```typescript
useKeyboardShortcuts({
  onRefresh: () => dispatch(fetchAccountMappings()),
});
```

**Step 4: Add to BankReconciliationsPage.tsx**

```typescript
useKeyboardShortcuts({
  onSearch: () => {
    const el = document.querySelector<HTMLInputElement>('[data-testid="search-input"]');
    el?.focus();
  },
  onAdd: () => setFormDialogOpen(true),
  onRefresh: () => dispatch(fetchBankReconciliations({})),
});
```

**Step 5: Add to AccountingDashboardPage.tsx**

```typescript
useKeyboardShortcuts({
  onAdd: () => navigate('/accounting/journal-entries/new'),
  onRefresh: () => {
    dispatch(fetchBalanceSheet({ asOfDate: getCurrentDate() }));
    dispatch(fetchProfitAndLoss({ startDate: '', endDate: getCurrentDate() }));
    dispatch(fetchJournalEntries({ limit: 10 }));
  },
});
```

**Step 6: Run frontend type check**

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 7: Commit**

```bash
git add frontend/src/pages/accounting/
git commit -m "feat(accounting): add keyboard shortcuts to all accounting pages"
```

---

## Task 6: Frontend Error Handling Improvements

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntryFormPage.tsx`
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`
- Modify: `frontend/src/pages/accounting/BankReconciliationDetailsPage.tsx`

This task adds consistent error display patterns: inline validation errors on forms, error banners for API failures, and loading skeletons instead of plain spinners.

**Step 1: Add validation feedback to JournalEntryFormPage**

Add a balance warning banner that shows in real-time when debits != credits:

```tsx
{(() => {
  const totalDebits = watchedLines?.reduce(
    (sum: number, l: any) => sum + (parseFloat(l.debitAmount) || 0),
    0,
  ) ?? 0;
  const totalCredits = watchedLines?.reduce(
    (sum: number, l: any) => sum + (parseFloat(l.creditAmount) || 0),
    0,
  ) ?? 0;
  const diff = Math.abs(totalDebits - totalCredits);
  if (diff > 0.01 && (totalDebits > 0 || totalCredits > 0)) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Entry is out of balance by {formatCurrency(diff)}. Total Debits: {formatCurrency(totalDebits)}, Total Credits: {formatCurrency(totalCredits)}
      </Alert>
    );
  }
  return null;
})()}
```

**Step 2: Add error recovery to AccountMappingsPage**

Add a retry button when mapping fetch fails:

```tsx
{error && (
  <Alert
    severity="error"
    action={
      <Button color="inherit" size="small" onClick={() => dispatch(fetchAccountMappings())}>
        Retry
      </Button>
    }
    sx={{ mb: 2 }}
  >
    {error}
  </Alert>
)}
```

**Step 3: Add save error feedback to BankReconciliationDetailsPage**

Ensure all catch blocks show the actual error message:

```typescript
} catch (error: any) {
  const message = typeof error === 'string' ? error : error?.message || 'Operation failed';
  showError(message);
}
```

**Step 4: Run frontend type check**

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/pages/accounting/
git commit -m "fix(accounting): improve error handling and validation feedback"
```

---

## Task 7: Update CLAUDE.md with Phase 5 Accounting Documentation

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Add accounting module section to CLAUDE.md**

Add the following section after the Bank Reconciliation Module section:

```markdown
### Accounting Module ✅
**Full double-entry accounting system implemented (February 2026)**

**Phases Completed:**
- Phase 1: Foundation (entities, COA, fiscal periods, manual journal entries)
- Phase 2: Auto-posting integration (sales, purchasing, payments, inventory)
- Phase 3: Financial reports (Trial Balance, Balance Sheet, P&L, GL, Account Activity)
- Phase 4: Bank reconciliation workflow
- Phase 5: Polish (RBAC, opening balances, bulk operations, keyboard shortcuts)

**Backend Architecture:**
- 7 entities: ChartOfAccount, FiscalPeriod, JournalEntry, JournalEntryLine, AccountMapping, BankReconciliation, ReconciledTransaction
- 7 services with comprehensive business logic
- 6 controllers with full Swagger documentation and RBAC
- 250+ backend unit tests

**Role-Based Access Control:**
- View reports/data: All authenticated users
- Create/edit journal entries: Admin, Manager
- Delete entries/accounts: Admin only
- Manage fiscal periods (close/reopen/generate): Admin only
- Configure account mappings: Admin only
- Complete/reopen reconciliation: Admin, Manager

**API Endpoints:**
- `/api/accounting/chart-of-accounts` - COA management with hierarchy and seed
- `/api/accounting/journal-entries` - CRUD, post, reverse, bulk-post, bulk-delete, opening-balances
- `/api/accounting/fiscal-periods` - CRUD, generate, close, reopen, validate
- `/api/accounting/account-mappings` - CRUD, validate
- `/api/accounting/bank-reconciliations` - CRUD, mark-cleared, unmark-cleared, complete, reopen
- `/api/accounting/reports/*` - Trial Balance, Balance Sheet, P&L, General Ledger, Account Activity (with Excel/PDF export)

**Frontend Routes:**
- `/accounting/dashboard` - Summary cards, recent entries, quick actions
- `/accounting/chart-of-accounts` - CRUD with hierarchy, seed, search
- `/accounting/journal-entries` - List with bulk post/delete, filters, keyboard shortcuts
- `/accounting/journal-entries/new` - Create/edit with line item management
- `/accounting/journal-entries/:id` - Entry details with lines
- `/accounting/fiscal-periods` - Generate, close, reopen
- `/accounting/account-mappings` - Configure auto-posting accounts
- `/accounting/bank-reconciliations` - List and create
- `/accounting/bank-reconciliations/:id` - Transaction matching workflow
- `/accounting/reports/*` - 5 financial reports with export

**Keyboard Shortcuts (all accounting pages):**
- Ctrl+F: Focus search
- N or +: Add new item
- Ctrl+R: Refresh data
- Escape: Cancel/go back
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add comprehensive accounting module documentation to CLAUDE.md"
```

---

## Task 8: Run Full Test Suite and Fix Any Failures

**Files:**
- Various (depends on failures)

**Step 1: Run backend accounting tests**

Run: `cd backend && npx jest --testPathPatterns="accounting" --verbose`
Expected: All tests PASS (250+)

**Step 2: Run frontend type check**

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run --reporter=verbose`
Expected: All tests PASS

**Step 4: Fix any failing tests**

If tests fail:
- Read the error message
- Identify root cause (import path, missing mock, changed API)
- Fix the minimum needed to make the test pass
- Re-run tests to confirm

**Step 5: Run backend build**

Run: `cd backend && npm run build`
Expected: Build succeeds

**Step 6: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(accounting): fix test failures from Phase 5 changes"
```

---

## Summary

| Task | What | Type | Estimated Steps |
|------|------|------|-----------------|
| 1 | RBAC on all 6 controllers | Backend | 6 |
| 2 | Opening balance posting endpoint | Backend | 7 |
| 3 | Bulk post/delete backend | Backend | 7 |
| 4 | Bulk operations frontend UI | Frontend | 5 |
| 5 | Keyboard shortcuts on 5 pages | Frontend | 7 |
| 6 | Error handling improvements | Frontend | 5 |
| 7 | CLAUDE.md documentation | Docs | 2 |
| 8 | Full test suite verification | Testing | 6 |

**Total commits:** 8
**New tests:** ~15 (RBAC + opening balance + bulk operations)
**Files modified:** ~20
**Files created:** 1 (RBAC test file)
