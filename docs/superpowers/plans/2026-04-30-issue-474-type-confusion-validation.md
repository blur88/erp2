# Issue #474 Type Confusion Validation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix issue #474 by validating invoice batch-send body data and directly affected date query params before controller logic reaches services.

**Architecture:** Add DTO validation at NestJS controller boundaries and keep service contracts unchanged. `BatchSendInvoicesDto` lives with invoice DTOs; focused report/stat query DTOs live in a small shared backend DTO file so `fromDate`, `toDate`, and `asOfDate` validation is consistent without a repo-wide validation migration.

**Tech Stack:** NestJS 11, class-validator, class-transformer, Jest, TypeScript

---

## File Map

| File | Action |
|------|--------|
| `backend/src/modules/sales/dto/invoice.dto.ts` | Modify - add `BatchSendInvoicesDto` |
| `backend/src/common/dto/report-date-query.dto.ts` | Create - strict reusable date query DTOs |
| `backend/src/common/dto/report-date-query.dto.spec.ts` | Create - DTO validation regression tests for array and invalid dates |
| `backend/src/modules/sales/dto/invoice.dto.spec.ts` | Create or modify - batch-send DTO validation tests |
| `backend/src/modules/sales/controllers/invoice.controller.ts` | Modify - use DTOs for `batch-send` and revenue stats |
| `backend/src/modules/sales/controllers/payment.controller.ts` | Modify - use DTO for payment statistics dates |
| `backend/src/modules/accounting/controllers/accounting-reports.controller.ts` | Modify - use DTO for `asOfDate` report endpoints |
| `backend/src/modules/sales/controllers/invoice.controller.spec.ts` | Create - controller delegation tests for batch-send and revenue stats |
| `backend/src/modules/sales/controllers/payment.controller.spec.ts` | Create - controller delegation tests for payment statistics |
| `backend/src/modules/accounting/controllers/accounting-reports.controller.spec.ts` | Create - controller delegation tests for `asOfDate` reports |

---

## Chunk 1: Batch Send Body Validation

### Task 1: Add failing DTO tests for batch-send input shape

**Files:**
- Test: `backend/src/modules/sales/dto/invoice.dto.spec.ts`
- Modify later: `backend/src/modules/sales/dto/invoice.dto.ts`

- [ ] **Step 1: Create the failing DTO spec**

Create `backend/src/modules/sales/dto/invoice.dto.spec.ts` if it does not exist.

Add:

```ts
import { validate } from 'class-validator';
import { BatchSendInvoicesDto } from './invoice.dto';

describe('BatchSendInvoicesDto', () => {
  const validInvoiceId = '550e8400-e29b-41d4-a716-446655440000';

  it('rejects invoiceIds when it is a single string', async () => {
    const dto = Object.assign(new BatchSendInvoicesDto(), {
      invoiceIds: validInvoiceId,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'invoiceIds')).toBe(true);
  });

  it('rejects invoiceIds entries that are not UUID v4 strings', async () => {
    const dto = Object.assign(new BatchSendInvoicesDto(), {
      invoiceIds: ['not-a-uuid'],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'invoiceIds')).toBe(true);
  });

  it('rejects an empty invoiceIds array', async () => {
    const dto = Object.assign(new BatchSendInvoicesDto(), {
      invoiceIds: [],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'invoiceIds')).toBe(true);
  });

  it('accepts a non-empty UUID v4 invoiceIds array', async () => {
    const dto = Object.assign(new BatchSendInvoicesDto(), {
      invoiceIds: [validInvoiceId],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the DTO test to verify it fails**

Run:

```bash
cd backend && npx jest src/modules/sales/dto/invoice.dto.spec.ts --no-coverage
```

Expected: fail because `BatchSendInvoicesDto` is not exported from `invoice.dto.ts`.

### Task 2: Implement `BatchSendInvoicesDto`

**Files:**
- Modify: `backend/src/modules/sales/dto/invoice.dto.ts`
- Test: `backend/src/modules/sales/dto/invoice.dto.spec.ts`

- [ ] **Step 1: Add imports**

In `backend/src/modules/sales/dto/invoice.dto.ts`, add `ArrayNotEmpty` to the existing `class-validator` import.

```ts
import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  IsDecimal,
  IsDateString,
  Min,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  IsInt,
  IsBoolean,
  IsNumber,
} from 'class-validator';
```

- [ ] **Step 2: Add the DTO**

Add near the other invoice request DTOs:

```ts
export class BatchSendInvoicesDto {
  @ApiProperty({
    description: 'Invoice IDs to send',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  invoiceIds: string[];
}
```

- [ ] **Step 3: Run the DTO test**

Run:

```bash
cd backend && npx jest src/modules/sales/dto/invoice.dto.spec.ts --no-coverage
```

Expected: pass.

- [ ] **Step 4: Commit**

Run:

```bash
git add backend/src/modules/sales/dto/invoice.dto.ts backend/src/modules/sales/dto/invoice.dto.spec.ts
git commit -m "test(sales): cover batch invoice ID validation"
```

### Task 3: Update invoice controller to use the batch DTO

**Files:**
- Modify: `backend/src/modules/sales/controllers/invoice.controller.ts`
- Test: `backend/src/modules/sales/controllers/invoice.controller.spec.ts`

- [ ] **Step 1: Add controller tests**

Create `backend/src/modules/sales/controllers/invoice.controller.spec.ts` with:

```ts
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from '../services/invoice.service';

describe('InvoiceController', () => {
  let controller: InvoiceController;
  let invoiceService: Pick<InvoiceService, 'batchSendInvoices' | 'getRevenueStatistics'>;

  beforeEach(() => {
    invoiceService = {
      batchSendInvoices: jest.fn().mockResolvedValue({ sent: 1, failed: 0 }),
      getRevenueStatistics: jest.fn().mockResolvedValue({ totalRevenue: 0 }),
    } as any;

    controller = new InvoiceController(invoiceService as InvoiceService);
  });

  it('passes validated invoice IDs to batchSendInvoices', async () => {
    const invoiceIds = ['550e8400-e29b-41d4-a716-446655440000'];

    await controller.batchSendInvoices({ invoiceIds });

    expect(invoiceService.batchSendInvoices).toHaveBeenCalledWith(invoiceIds);
  });
});
```

- [ ] **Step 2: Run the controller test to verify it fails**

Run:

```bash
cd backend && npx jest src/modules/sales/controllers/invoice.controller.spec.ts --no-coverage
```

Expected: fail because `batchSendInvoices` still accepts a raw string array parameter.

- [ ] **Step 3: Import and use `BatchSendInvoicesDto`**

In `backend/src/modules/sales/controllers/invoice.controller.ts`, add `BatchSendInvoicesDto` to the existing import from `../dto/invoice.dto`.

Change:

```ts
async batchSendInvoices(@Body('invoiceIds') invoiceIds: string[]) {
  return this.invoiceService.batchSendInvoices(invoiceIds);
}
```

To:

```ts
async batchSendInvoices(@Body() dto: BatchSendInvoicesDto) {
  return this.invoiceService.batchSendInvoices(dto.invoiceIds);
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd backend && npx jest src/modules/sales/dto/invoice.dto.spec.ts src/modules/sales/controllers/invoice.controller.spec.ts --no-coverage
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/modules/sales/controllers/invoice.controller.ts backend/src/modules/sales/controllers/invoice.controller.spec.ts
git commit -m "fix(sales): validate batch invoice send body"
```

---

## Chunk 2: Date Query DTOs

### Task 4: Add strict shared report date query DTOs

**Files:**
- Create: `backend/src/common/dto/report-date-query.dto.ts`
- Test: `backend/src/common/dto/report-date-query.dto.spec.ts`

- [ ] **Step 1: Write failing DTO tests**

Create `backend/src/common/dto/report-date-query.dto.spec.ts`:

```ts
import { validate } from 'class-validator';
import {
  AsOfDateQueryDto,
  DateRangeQueryDto,
  PaymentStatisticsQueryDto,
} from './report-date-query.dto';

describe('report date query DTOs', () => {
  it('rejects array-valued asOfDate', async () => {
    const dto = Object.assign(new AsOfDateQueryDto(), {
      asOfDate: ['2026-01-01', '2026-01-02'],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'asOfDate')).toBe(true);
  });

  it('rejects invalid asOfDate strings', async () => {
    const dto = Object.assign(new AsOfDateQueryDto(), {
      asOfDate: 'not-a-date',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'asOfDate')).toBe(true);
  });

  it('accepts valid optional asOfDate', async () => {
    const dto = Object.assign(new AsOfDateQueryDto(), {
      asOfDate: '2026-01-01',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects array-valued fromDate and toDate', async () => {
    const dto = Object.assign(new DateRangeQueryDto(), {
      fromDate: ['2026-01-01', '2026-01-02'],
      toDate: ['2026-01-03', '2026-01-04'],
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining(['fromDate', 'toDate']));
  });

  it('accepts valid optional fromDate and toDate', async () => {
    const dto = Object.assign(new DateRangeQueryDto(), {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('validates optional customerId for payment statistics', async () => {
    const dto = Object.assign(new PaymentStatisticsQueryDto(), {
      customerId: 'not-a-uuid',
      fromDate: '2026-01-01',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'customerId')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the DTO test to verify it fails**

Run:

```bash
cd backend && npx jest src/common/dto/report-date-query.dto.spec.ts --no-coverage
```

Expected: fail because `report-date-query.dto.ts` does not exist yet.

- [ ] **Step 3: Add the DTO file**

Create `backend/src/common/dto/report-date-query.dto.ts`:

```ts
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class DateRangeQueryDto {
  @IsOptional()
  @IsString()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  @IsDateString()
  toDate?: string;
}

export class AsOfDateQueryDto {
  @IsOptional()
  @IsString()
  @IsDateString()
  asOfDate?: string;
}

export class PaymentStatisticsQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
```

- [ ] **Step 4: Run the DTO test**

Run:

```bash
cd backend && npx jest src/common/dto/report-date-query.dto.spec.ts --no-coverage
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add backend/src/common/dto/report-date-query.dto.ts backend/src/common/dto/report-date-query.dto.spec.ts
git commit -m "test(common): cover strict report date query validation"
```

---

## Chunk 3: Wire Date Query DTOs Into Controllers

### Task 5: Validate invoice revenue stats query params

**Files:**
- Modify: `backend/src/modules/sales/controllers/invoice.controller.ts`
- Modify: `backend/src/modules/sales/controllers/invoice.controller.spec.ts`

- [ ] **Step 1: Add a controller delegation test**

In `backend/src/modules/sales/controllers/invoice.controller.spec.ts`, add:

```ts
it('passes validated revenue stats dates to getRevenueStatistics', async () => {
  await controller.getRevenueStats({
    fromDate: '2026-01-01',
    toDate: '2026-01-31',
  });

  expect(invoiceService.getRevenueStatistics).toHaveBeenCalledWith(
    '2026-01-01',
    '2026-01-31',
  );
});
```

- [ ] **Step 2: Run the controller test to verify it fails**

Run:

```bash
cd backend && npx jest src/modules/sales/controllers/invoice.controller.spec.ts --no-coverage
```

Expected: fail because `getRevenueStats` still takes two positional query params.

- [ ] **Step 3: Import `DateRangeQueryDto`**

In `backend/src/modules/sales/controllers/invoice.controller.ts`, add:

```ts
import { DateRangeQueryDto } from '../../../common/dto/report-date-query.dto';
```

- [ ] **Step 4: Update `getRevenueStats`**

Change:

```ts
async getRevenueStats(
  @Query('fromDate') fromDate?: string,
  @Query('toDate') toDate?: string,
) {
  return this.invoiceService.getRevenueStatistics(fromDate, toDate);
}
```

To:

```ts
async getRevenueStats(@Query() query: DateRangeQueryDto) {
  return this.invoiceService.getRevenueStatistics(query.fromDate, query.toDate);
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd backend && npx jest src/common/dto/report-date-query.dto.spec.ts src/modules/sales/controllers/invoice.controller.spec.ts --no-coverage
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/modules/sales/controllers/invoice.controller.ts backend/src/modules/sales/controllers/invoice.controller.spec.ts
git commit -m "fix(sales): validate invoice revenue stats dates"
```

### Task 6: Validate payment statistics query params

**Files:**
- Modify: `backend/src/modules/sales/controllers/payment.controller.ts`
- Test: `backend/src/modules/sales/controllers/payment.controller.spec.ts`

- [ ] **Step 1: Add a controller test**

Create `backend/src/modules/sales/controllers/payment.controller.spec.ts`:

```ts
import { PaymentController } from './payment.controller';
import { PaymentService } from '../services/payment.service';

describe('PaymentController', () => {
  let controller: PaymentController;
  let paymentService: Pick<PaymentService, 'getPaymentStatistics'>;

  beforeEach(() => {
    paymentService = {
      getPaymentStatistics: jest.fn().mockResolvedValue({ totalPayments: 0 }),
    } as any;

    controller = new PaymentController(paymentService as PaymentService);
  });

  it('passes validated statistics query values to getPaymentStatistics', async () => {
    await controller.getPaymentStatistics({
      customerId: '550e8400-e29b-41d4-a716-446655440000',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    });

    expect(paymentService.getPaymentStatistics).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );
  });
});
```

- [ ] **Step 2: Run the controller test to verify it fails**

Run:

```bash
cd backend && npx jest src/modules/sales/controllers/payment.controller.spec.ts --no-coverage
```

Expected: fail because `getPaymentStatistics` still takes three positional query params.

- [ ] **Step 3: Import `PaymentStatisticsQueryDto`**

In `backend/src/modules/sales/controllers/payment.controller.ts`, add:

```ts
import { PaymentStatisticsQueryDto } from '../../../common/dto/report-date-query.dto';
```

- [ ] **Step 4: Update `getPaymentStatistics`**

Change the method signature and body to:

```ts
async getPaymentStatistics(@Query() query: PaymentStatisticsQueryDto) {
  const fromDateObj = query.fromDate ? new Date(query.fromDate) : undefined;
  const toDateObj = query.toDate ? new Date(query.toDate) : undefined;

  return this.paymentService.getPaymentStatistics(
    query.customerId,
    fromDateObj,
    toDateObj,
  );
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd backend && npx jest src/common/dto/report-date-query.dto.spec.ts src/modules/sales/controllers/payment.controller.spec.ts --no-coverage
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/modules/sales/controllers/payment.controller.ts backend/src/modules/sales/controllers/payment.controller.spec.ts
git commit -m "fix(sales): validate payment statistics query dates"
```

### Task 7: Validate accounting `asOfDate` query params

**Files:**
- Modify: `backend/src/modules/accounting/controllers/accounting-reports.controller.ts`
- Test: `backend/src/modules/accounting/controllers/accounting-reports.controller.spec.ts`

- [ ] **Step 1: Add controller tests for non-export endpoints**

Create `backend/src/modules/accounting/controllers/accounting-reports.controller.spec.ts`:

```ts
import { AccountingReportsController } from './accounting-reports.controller';
import { AccountingReportsService } from '../services/accounting-reports.service';

describe('AccountingReportsController', () => {
  let controller: AccountingReportsController;
  let service: Pick<
    AccountingReportsService,
    'generateTrialBalance' | 'generateBalanceSheet'
  >;

  beforeEach(() => {
    service = {
      generateTrialBalance: jest.fn().mockResolvedValue({ accounts: [] }),
      generateBalanceSheet: jest.fn().mockResolvedValue({ assets: [] }),
    } as any;

    controller = new AccountingReportsController(service as AccountingReportsService);
  });

  it('passes validated asOfDate to generateTrialBalance', async () => {
    await controller.getTrialBalance(
      { asOfDate: '2026-01-01' },
      'true',
    );

    expect(service.generateTrialBalance).toHaveBeenCalledWith(
      new Date('2026-01-01'),
      true,
    );
  });

  it('passes validated asOfDate to generateBalanceSheet', async () => {
    await controller.getBalanceSheet(
      { asOfDate: '2026-01-01' },
      'false',
    );

    expect(service.generateBalanceSheet).toHaveBeenCalledWith(
      new Date('2026-01-01'),
      false,
    );
  });
});
```

- [ ] **Step 2: Run the controller test to verify it fails**

Run:

```bash
cd backend && npx jest src/modules/accounting/controllers/accounting-reports.controller.spec.ts --no-coverage
```

Expected: fail because `getTrialBalance` and `getBalanceSheet` still accept raw `asOfDate` strings.

- [ ] **Step 3: Import `AsOfDateQueryDto`**

In `backend/src/modules/accounting/controllers/accounting-reports.controller.ts`, add:

```ts
import { AsOfDateQueryDto } from '../../../common/dto/report-date-query.dto';
```

- [ ] **Step 4: Update the four `asOfDate` methods**

For these methods, replace `@Query('asOfDate') asOfDate?: string` with `@Query() query: AsOfDateQueryDto`, and replace `asOfDate` references with `query.asOfDate`:

- `getTrialBalance`
- `exportTrialBalance`
- `getBalanceSheet`
- `exportBalanceSheet`

Example:

```ts
async getTrialBalance(
  @Query() query: AsOfDateQueryDto,
  @Query('includeInactive') includeInactive?: string,
) {
  const date = query.asOfDate ? new Date(query.asOfDate) : new Date();
  const includeInactiveBool = includeInactive === 'true';

  if (isNaN(date.getTime())) {
    throw new BadRequestException('Invalid date format. Use ISO 8601 format (YYYY-MM-DD)');
  }

  return this.accountingReportsService.generateTrialBalance(
    date,
    includeInactiveBool,
  );
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd backend && npx jest src/common/dto/report-date-query.dto.spec.ts src/modules/accounting/controllers/accounting-reports.controller.spec.ts --no-coverage
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add backend/src/modules/accounting/controllers/accounting-reports.controller.ts backend/src/modules/accounting/controllers/accounting-reports.controller.spec.ts
git commit -m "fix(accounting): validate as-of report dates"
```

---

## Chunk 4: Final Verification

### Task 8: Run scoped backend verification

**Files:**
- No file changes expected

- [ ] **Step 1: Run focused regression tests**

Run:

```bash
cd backend && npx jest src/modules/sales/dto/invoice.dto.spec.ts src/common/dto/report-date-query.dto.spec.ts src/modules/sales/controllers/invoice.controller.spec.ts src/modules/sales/controllers/payment.controller.spec.ts src/modules/accounting/controllers/accounting-reports.controller.spec.ts --no-coverage
```

Expected: all focused tests pass.

- [ ] **Step 2: Run required backend checks**

Run:

```bash
cd backend && npm run lint && npm run test
```

Expected: lint completes and the full Jest suite passes.

- [ ] **Step 3: Check worktree**

Run:

```bash
git status --short
```

Expected: clean worktree.

- [ ] **Step 4: Update issue or PR notes**

Record the exact verification commands run:

```text
cd backend && npx jest src/modules/sales/dto/invoice.dto.spec.ts src/common/dto/report-date-query.dto.spec.ts src/modules/sales/controllers/invoice.controller.spec.ts src/modules/sales/controllers/payment.controller.spec.ts src/modules/accounting/controllers/accounting-reports.controller.spec.ts --no-coverage
cd backend && npm run lint && npm run test
```

Expected PR summary:

```text
Fixes issue #474 by adding DTO validation for invoice batch-send IDs and strict date query validation for the affected report/stat endpoints.
```
