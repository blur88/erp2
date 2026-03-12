# Fund Transfer Module Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Fund Transfer feature to the Accounting module that lets users move funds between cash/bank accounts, auto-posting a balanced journal entry on creation and reversing it on cancellation.

**Architecture:** Dedicated `FundTransfer` entity with its own service/controller following the `Expense` module pattern exactly. `AccountingService.postFundTransferEntry()` handles JE auto-posting. Cancellation delegates to the existing `AccountingService.reverseSourceEntries()`. Frontend is a single-page list + inline create dialog, consistent with `ExpensesPage`.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, React 19, MUI v7, RTK Query, Jest (backend tests), Vitest (frontend tests)

**Spec:** `docs/superpowers/specs/2026-03-12-fund-transfer-design.md`

---

## File Map

### Backend — New files
| File | Responsibility |
|---|---|
| `backend/src/database/entities/fund-transfer.entity.ts` | `FundTransfer` TypeORM entity + `FundTransferStatus` enum |
| `backend/src/modules/accounting/dto/fund-transfer.dto.ts` | DTOs: Create, Query, Response, ListResponse |
| `backend/src/modules/accounting/services/fund-transfer.service.ts` | Business logic: create, cancel, findAll, findOne |
| `backend/src/modules/accounting/services/fund-transfer.service.spec.ts` | Jest unit tests for the service |
| `backend/src/modules/accounting/controllers/fund-transfer.controller.ts` | REST endpoints |
| `backend/src/database/migrations/TIMESTAMP-AddFundTransferAndCashEquivalent.ts` | DB migration |

### Backend — Modified files
| File | Change |
|---|---|
| `backend/src/database/entities/chart-of-account.entity.ts` | Add `isCashEquivalent: boolean` column |
| `backend/src/modules/accounting/dto/chart-of-account.dto.ts` | Add `isCashEquivalent` to create/update/response DTOs |
| `backend/src/modules/accounting/services/accounting.service.ts` | Add `postFundTransferEntry()` method |
| `backend/src/modules/accounting/accounting.module.ts` | Register new entity, service, controller |

### Frontend — New files
| File | Responsibility |
|---|---|
| `frontend/src/pages/accounting/FundTransfersPage.tsx` | List table + create dialog + cancel confirmation |
| `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx` | Vitest tests |

### Frontend — Modified files
| File | Change |
|---|---|
| `frontend/src/types/index.ts` | Add `FundTransfer` type; add `isCashEquivalent` to `ChartOfAccount` |
| `frontend/src/store/api/accountingApi.ts` | Add `FundTransfer` tag + 4 RTK Query endpoints |
| `frontend/src/router.tsx` | Add `/accounting/fund-transfers` route |
| `frontend/src/components/common/Sidebar.tsx` | Add "Fund Transfers" nav item |
| `frontend/src/components/accounting/ChartOfAccountFormDialog.tsx` | Add `isCashEquivalent` checkbox |

---

## Chunk 1: Database — Entity + Migration

### Task 1: Add `isCashEquivalent` to `ChartOfAccount` entity

**Files:**
- Modify: `backend/src/database/entities/chart-of-account.entity.ts`

- [ ] **Step 1: Add the column**

  Open `backend/src/database/entities/chart-of-account.entity.ts`. After the `isActive` column (line ~80), add:

  ```typescript
  @Column({
    type: 'boolean',
    default: false,
    comment: 'Marks account as eligible for fund transfers (cash/bank accounts)',
  })
  @IsBoolean()
  isCashEquivalent: boolean;
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd backend && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/database/entities/chart-of-account.entity.ts
  git commit -m "feat(accounting): add isCashEquivalent flag to ChartOfAccount entity"
  ```

---

### Task 2: Create `FundTransfer` entity

**Files:**
- Create: `backend/src/database/entities/fund-transfer.entity.ts`

- [ ] **Step 1: Create the entity file**

  ```typescript
  // backend/src/database/entities/fund-transfer.entity.ts
  import {
    Entity,
    Column,
    Index,
    ManyToOne,
    JoinColumn,
  } from 'typeorm';
  import {
    IsString,
    IsEnum,
    IsOptional,
    IsDate,
    IsNumber,
    Min,
    MaxLength,
    IsUUID,
  } from 'class-validator';
  import { BaseEntity } from './base.entity';
  import { ChartOfAccount } from './chart-of-account.entity';
  import { JournalEntry } from './journal-entry.entity';
  import { FiscalPeriod } from './fiscal-period.entity';

  export enum FundTransferStatus {
    ACTIVE = 'ACTIVE',
    CANCELLED = 'CANCELLED',
  }

  @Entity('fund_transfers')
  @Index(['referenceNumber'], { unique: true })
  @Index(['transferDate'])
  @Index(['status'])
  @Index(['sourceAccountId'])
  @Index(['destinationAccountId'])
  @Index(['fiscalPeriodId'])
  export class FundTransfer extends BaseEntity {
    @Column({
      type: 'varchar',
      length: 50,
      unique: true,
      comment: 'Auto-generated reference number e.g. TRF-26-001',
    })
    @IsString()
    @MaxLength(50)
    referenceNumber: string;

    @Column({
      type: 'date',
      comment: 'Date of the transfer',
    })
    @IsDate()
    transferDate: Date;

    @Column({
      type: 'uuid',
      comment: 'Source (From) account — must have isCashEquivalent=true',
    })
    @IsUUID()
    sourceAccountId: string;

    @Column({
      type: 'uuid',
      comment: 'Destination (To) account — must have isCashEquivalent=true',
    })
    @IsUUID()
    destinationAccountId: string;

    @Column({
      type: 'decimal',
      precision: 15,
      scale: 2,
      comment: 'Transfer amount — must be > 0',
    })
    @IsNumber()
    @Min(0.01)
    amount: number;

    @Column({
      type: 'text',
      nullable: true,
      comment: 'Optional memo/notes',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @Column({
      type: 'enum',
      enum: FundTransferStatus,
      default: FundTransferStatus.ACTIVE,
      comment: 'Transfer status',
    })
    @IsEnum(FundTransferStatus)
    status: FundTransferStatus;

    @Column({
      type: 'uuid',
      nullable: true,
      comment: 'Linked journal entry — nullable until JE is posted inside transaction',
    })
    @IsOptional()
    @IsUUID()
    journalEntryId?: string;

    @Column({
      type: 'uuid',
      comment: 'Fiscal period auto-detected from transferDate',
    })
    @IsUUID()
    fiscalPeriodId: string;

    // Relationships
    @ManyToOne(() => ChartOfAccount, { eager: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'sourceAccountId' })
    sourceAccount: ChartOfAccount;

    @ManyToOne(() => ChartOfAccount, { eager: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'destinationAccountId' })
    destinationAccount: ChartOfAccount;

    @ManyToOne(() => JournalEntry, { eager: false, nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'journalEntryId' })
    journalEntry?: JournalEntry;

    @ManyToOne(() => FiscalPeriod, { eager: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'fiscalPeriodId' })
    fiscalPeriod: FiscalPeriod;
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd backend && npx tsc --noEmit
  ```
  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/database/entities/fund-transfer.entity.ts
  git commit -m "feat(accounting): add FundTransfer entity"
  ```

---

### Task 3: Write and run the migration

**Files:**
- Create: `backend/src/database/migrations/TIMESTAMP-AddFundTransferAndCashEquivalent.ts`

- [ ] **Step 1: Generate migration timestamp**

  ```bash
  date +%s%3N
  ```
  Use this number as `TIMESTAMP` in the filename. e.g. `1773000000000`.

- [ ] **Step 2: Create the migration file**

  Replace `TIMESTAMP` and `MigrationClassName` with your actual values:

  ```typescript
  // backend/src/database/migrations/TIMESTAMP-AddFundTransferAndCashEquivalent.ts
  import { MigrationInterface, QueryRunner } from 'typeorm';

  export class AddFundTransferAndCashEquivalentTIMESTAMP implements MigrationInterface {
    name = 'AddFundTransferAndCashEquivalentTIMESTAMP';

    public async up(queryRunner: QueryRunner): Promise<void> {
      // 1. Add isCashEquivalent to chart_of_accounts
      await queryRunner.query(`
        ALTER TABLE "chart_of_accounts"
        ADD COLUMN IF NOT EXISTS "isCashEquivalent" boolean NOT NULL DEFAULT false
      `);

      // 2. Create enum type for fund_transfer status
      await queryRunner.query(`
        CREATE TYPE "public"."fund_transfer_status_enum" AS ENUM('ACTIVE', 'CANCELLED')
      `);

      // 3. Create fund_transfers table
      await queryRunner.query(`
        CREATE TABLE "fund_transfers" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          "deletedAt" TIMESTAMPTZ,
          "isActive" boolean NOT NULL DEFAULT true,
          "referenceNumber" character varying(50) NOT NULL,
          "transferDate" date NOT NULL,
          "sourceAccountId" uuid NOT NULL,
          "destinationAccountId" uuid NOT NULL,
          "amount" numeric(15,2) NOT NULL,
          "description" text,
          "status" "public"."fund_transfer_status_enum" NOT NULL DEFAULT 'ACTIVE',
          "journalEntryId" uuid,
          "fiscalPeriodId" uuid NOT NULL,
          CONSTRAINT "UQ_fund_transfers_referenceNumber" UNIQUE ("referenceNumber"),
          CONSTRAINT "PK_fund_transfers" PRIMARY KEY ("id")
        )
      `);

      // 4. Indexes
      await queryRunner.query(`CREATE UNIQUE INDEX "IDX_fund_transfers_referenceNumber" ON "fund_transfers" ("referenceNumber")`);
      await queryRunner.query(`CREATE INDEX "IDX_fund_transfers_transferDate" ON "fund_transfers" ("transferDate")`);
      await queryRunner.query(`CREATE INDEX "IDX_fund_transfers_status" ON "fund_transfers" ("status")`);
      await queryRunner.query(`CREATE INDEX "IDX_fund_transfers_sourceAccountId" ON "fund_transfers" ("sourceAccountId")`);
      await queryRunner.query(`CREATE INDEX "IDX_fund_transfers_destinationAccountId" ON "fund_transfers" ("destinationAccountId")`);
      await queryRunner.query(`CREATE INDEX "IDX_fund_transfers_fiscalPeriodId" ON "fund_transfers" ("fiscalPeriodId")`);

      // 5. Foreign keys
      await queryRunner.query(`
        ALTER TABLE "fund_transfers"
        ADD CONSTRAINT "FK_fund_transfers_sourceAccountId"
        FOREIGN KEY ("sourceAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT
      `);
      await queryRunner.query(`
        ALTER TABLE "fund_transfers"
        ADD CONSTRAINT "FK_fund_transfers_destinationAccountId"
        FOREIGN KEY ("destinationAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT
      `);
      await queryRunner.query(`
        ALTER TABLE "fund_transfers"
        ADD CONSTRAINT "FK_fund_transfers_journalEntryId"
        FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL
      `);
      await queryRunner.query(`
        ALTER TABLE "fund_transfers"
        ADD CONSTRAINT "FK_fund_transfers_fiscalPeriodId"
        FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT
      `);

      // 6. Seed document number settings row
      const currentYear = new Date().getFullYear() % 100;
      await queryRunner.query(
        `INSERT INTO "document_number_settings"
           ("documentName", "prefix", "paddingDigits", "nextNumber", "lastResetYear")
         VALUES ($1, $2, 3, 1, $3)
         ON CONFLICT ("documentName") DO NOTHING`,
        ['Fund Transfers', 'TRF', currentYear],
      );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.query(`ALTER TABLE "fund_transfers" DROP CONSTRAINT "FK_fund_transfers_fiscalPeriodId"`);
      await queryRunner.query(`ALTER TABLE "fund_transfers" DROP CONSTRAINT "FK_fund_transfers_journalEntryId"`);
      await queryRunner.query(`ALTER TABLE "fund_transfers" DROP CONSTRAINT "FK_fund_transfers_destinationAccountId"`);
      await queryRunner.query(`ALTER TABLE "fund_transfers" DROP CONSTRAINT "FK_fund_transfers_sourceAccountId"`);
      await queryRunner.query(`DROP TABLE "fund_transfers"`);
      await queryRunner.query(`DROP TYPE "public"."fund_transfer_status_enum"`);
      await queryRunner.query(`ALTER TABLE "chart_of_accounts" DROP COLUMN IF EXISTS "isCashEquivalent"`);
      await queryRunner.query(`DELETE FROM "document_number_settings" WHERE "documentName" = 'Fund Transfers'`);
    }
  }
  ```

- [ ] **Step 3: Run the migration**

  Make sure Docker PostgreSQL is running first (`docker compose up -d postgres`), then:

  ```bash
  cd backend && npm run migration:run
  ```
  Expected: migration runs without error, prints "migration ... has been executed successfully"

- [ ] **Step 4: Commit**

  ```bash
  git add backend/src/database/migrations/
  git commit -m "feat(accounting): add fund_transfers table and isCashEquivalent migration"
  ```

---

## Chunk 2: Backend — DTOs, Service, Controller

### Task 4: Add `isCashEquivalent` to COA DTOs

**Files:**
- Modify: `backend/src/modules/accounting/dto/chart-of-account.dto.ts`

- [ ] **Step 1: Read the existing DTO file**

  Read `backend/src/modules/accounting/dto/chart-of-account.dto.ts` to see the existing DTO shape.

- [ ] **Step 2: Add `isCashEquivalent` to create, update, and response DTOs**

  In `CreateChartOfAccountDto`, add:
  ```typescript
  @IsOptional()
  @IsBoolean()
  isCashEquivalent?: boolean;
  ```

  In `UpdateChartOfAccountDto`, add the same optional field.

  In the response DTO class (e.g. `ChartOfAccountResponseDto`), add:
  ```typescript
  isCashEquivalent: boolean;
  ```

  Also ensure the `toResponseDto` / serialization in the service maps this field.

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd backend && npx tsc --noEmit
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add backend/src/modules/accounting/dto/chart-of-account.dto.ts
  git commit -m "feat(accounting): add isCashEquivalent to COA DTOs"
  ```

---

### Task 5: Create Fund Transfer DTOs

**Files:**
- Create: `backend/src/modules/accounting/dto/fund-transfer.dto.ts`

- [ ] **Step 1: Write the DTOs**

  ```typescript
  // backend/src/modules/accounting/dto/fund-transfer.dto.ts
  import {
    IsString,
    IsOptional,
    IsEnum,
    IsNumber,
    IsDateString,
    IsUUID,
    Min,
  } from 'class-validator';
  import { Type } from 'class-transformer';
  import { FundTransferStatus } from '../../../database/entities/fund-transfer.entity';

  export class CreateFundTransferDto {
    @IsUUID()
    sourceAccountId: string;

    @IsUUID()
    destinationAccountId: string;

    @IsNumber()
    @Min(0.01)
    amount: number;

    @IsDateString()
    transferDate: string;

    @IsOptional()
    @IsString()
    description?: string;
  }

  export class QueryFundTransfersDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    limit?: number;

    @IsOptional()
    @IsString()
    startDate?: string;

    @IsOptional()
    @IsString()
    endDate?: string;

    @IsOptional()
    @IsUUID()
    sourceAccountId?: string;

    @IsOptional()
    @IsUUID()
    destinationAccountId?: string;

    @IsOptional()
    @IsEnum(FundTransferStatus)
    status?: FundTransferStatus;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsString()
    sortBy?: string;

    @IsOptional()
    @IsString()
    sortOrder?: string;
  }

  type AccountSummary = {
    id: string;
    code: string;
    name: string;
    type: string;
  };

  type JournalEntrySummary = {
    id: string;
    referenceNumber: string;
    status: string;
  };

  export class FundTransferResponseDto {
    id: string;
    referenceNumber: string;
    transferDate: Date;
    amount: number;
    description?: string;
    status: FundTransferStatus;
    fiscalPeriodId: string;
    journalEntryId?: string;
    sourceAccount: AccountSummary;
    destinationAccount: AccountSummary;
    journalEntry?: JournalEntrySummary;
    createdAt: Date;
    updatedAt: Date;
  }

  export class FundTransferListResponseDto {
    data: FundTransferResponseDto[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd backend && npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/modules/accounting/dto/fund-transfer.dto.ts
  git commit -m "feat(accounting): add FundTransfer DTOs"
  ```

---

### Task 6: Write failing tests for `FundTransferService`

**Files:**
- Create: `backend/src/modules/accounting/services/fund-transfer.service.spec.ts`

- [ ] **Step 1: Write the test file**

  Model this exactly on `expense.service.spec.ts`. Key patterns:
  - Use `Test.createTestingModule` with mocked repositories and services
  - Mock `DataSource` with a `transaction` method that calls the callback with an entity manager
  - Test each validation path (self-transfer, non-cash-equivalent accounts, amount ≤ 0, no open period)
  - Test successful create path
  - Test cancel paths (not found, already cancelled, null journalEntryId)

  ```typescript
  // backend/src/modules/accounting/services/fund-transfer.service.spec.ts
  import { Test, TestingModule } from '@nestjs/testing';
  import { getRepositoryToken } from '@nestjs/typeorm';
  import { BadRequestException, NotFoundException } from '@nestjs/common';
  import { DataSource, Repository } from 'typeorm';
  import { FundTransferService } from './fund-transfer.service';
  import { FundTransfer, FundTransferStatus } from '../../../database/entities/fund-transfer.entity';
  import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
  import { AccountingService } from './accounting.service';
  import { SettingsService } from '../../settings/settings.service';
  import { AuditLogService } from '../../audit-logs/services';
  import { FiscalPeriodService } from './fiscal-period.service';

  describe('FundTransferService', () => {
    let service: FundTransferService;
    let transferRepository: jest.Mocked<Repository<FundTransfer>>;
    let coaRepository: jest.Mocked<Repository<ChartOfAccount>>;
    let accountingService: jest.Mocked<AccountingService>;
    let settingsService: jest.Mocked<SettingsService>;
    let fiscalPeriodService: jest.Mocked<FiscalPeriodService>;
    let auditLogService: jest.Mocked<AuditLogService>;
    let dataSource: jest.Mocked<DataSource>;

    const mockCashAccount = (id: string) => ({
      id,
      code: '1001',
      name: 'Cash',
      type: 'ASSET',
      isActive: true,
      deletedAt: null,
      isCashEquivalent: true,
    } as any);

    const mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FundTransferService,
          {
            provide: getRepositoryToken(FundTransfer),
            useValue: {
              createQueryBuilder: jest.fn(() => mockQueryBuilder),
              findOne: jest.fn(),
              create: jest.fn(),
              save: jest.fn(),
            },
          },
          {
            provide: getRepositoryToken(ChartOfAccount),
            useValue: {
              findOne: jest.fn(),
            },
          },
          {
            provide: AccountingService,
            useValue: {
              postFundTransferEntry: jest.fn(),
              reverseSourceEntries: jest.fn(),
            },
          },
          {
            provide: SettingsService,
            useValue: {
              generateDocumentNumber: jest.fn().mockResolvedValue('TRF-26-001'),
            },
          },
          {
            provide: FiscalPeriodService,
            useValue: {
              validatePeriod: jest.fn(),
            },
          },
          {
            provide: AuditLogService,
            useValue: {
              log: jest.fn(),
            },
          },
          {
            provide: DataSource,
            useValue: {
              transaction: jest.fn((cb) =>
                cb({
                  create: jest.fn().mockReturnValue({}),
                  save: jest.fn().mockResolvedValue({ id: 'trf-1', referenceNumber: 'TRF-26-001' }),
                }),
              ),
            },
          },
        ],
      }).compile();

      service = module.get<FundTransferService>(FundTransferService);
      transferRepository = module.get(getRepositoryToken(FundTransfer));
      coaRepository = module.get(getRepositoryToken(ChartOfAccount));
      accountingService = module.get(AccountingService);
      settingsService = module.get(SettingsService);
      fiscalPeriodService = module.get(FiscalPeriodService);
      auditLogService = module.get(AuditLogService);
      dataSource = module.get(DataSource);
    });

    afterEach(() => jest.clearAllMocks());

    describe('create', () => {
      const dto = {
        sourceAccountId: 'acc-1',
        destinationAccountId: 'acc-2',
        amount: 500,
        transferDate: '2026-03-12',
      };

      it('throws BadRequestException when source and destination are the same', async () => {
        await expect(
          service.create({ ...dto, destinationAccountId: 'acc-1' }, 'user-1'),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when source account is not cash equivalent', async () => {
        coaRepository.findOne
          .mockResolvedValueOnce({ ...mockCashAccount('acc-1'), isCashEquivalent: false } as any)
          .mockResolvedValueOnce(mockCashAccount('acc-2'));

        await expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when destination account is not cash equivalent', async () => {
        coaRepository.findOne
          .mockResolvedValueOnce(mockCashAccount('acc-1'))
          .mockResolvedValueOnce({ ...mockCashAccount('acc-2'), isCashEquivalent: false } as any);

        await expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
      });

      it('throws NotFoundException when source account does not exist', async () => {
        coaRepository.findOne.mockResolvedValueOnce(null);

        await expect(service.create(dto, 'user-1')).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException when no open fiscal period', async () => {
        coaRepository.findOne
          .mockResolvedValueOnce(mockCashAccount('acc-1'))
          .mockResolvedValueOnce(mockCashAccount('acc-2'));
        fiscalPeriodService.validatePeriod.mockResolvedValue({ isValid: false, period: null } as any);

        await expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
      });

      it('creates transfer and posts journal entry on success', async () => {
        coaRepository.findOne
          .mockResolvedValueOnce(mockCashAccount('acc-1'))
          .mockResolvedValueOnce(mockCashAccount('acc-2'));
        fiscalPeriodService.validatePeriod.mockResolvedValue({
          isValid: true,
          period: { id: 'period-1' },
        } as any);

        const savedTransfer = {
          id: 'trf-1',
          referenceNumber: 'TRF-26-001',
          status: FundTransferStatus.ACTIVE,
          journalEntryId: 'je-1',
          sourceAccount: mockCashAccount('acc-1'),
          destinationAccount: mockCashAccount('acc-2'),
          journalEntry: { id: 'je-1', referenceNumber: 'JE-26-001', status: 'POSTED' },
        } as any;

        // Simulate the transaction callback creating and returning a transfer
        dataSource.transaction.mockImplementation(async (cb: any) => {
          return cb({
            create: jest.fn().mockReturnValue(savedTransfer),
            save: jest.fn().mockResolvedValue(savedTransfer),
          });
        });

        // findOne called by findOne() at the end of create
        transferRepository.findOne.mockResolvedValue(savedTransfer);
        accountingService.postFundTransferEntry.mockResolvedValue({ id: 'je-1' } as any);

        const result = await service.create(dto, 'user-1');

        expect(accountingService.postFundTransferEntry).toHaveBeenCalled();
        expect(auditLogService.log).toHaveBeenCalledWith('CREATE', 'FundTransfer', expect.any(String), expect.any(Object));
        expect(result).toBeDefined();
      });
    });

    describe('cancel', () => {
      it('throws NotFoundException when transfer not found', async () => {
        transferRepository.findOne.mockResolvedValue(null);
        await expect(service.cancel('trf-1', 'user-1')).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException when already cancelled', async () => {
        transferRepository.findOne.mockResolvedValue({
          id: 'trf-1',
          status: FundTransferStatus.CANCELLED,
        } as any);
        await expect(service.cancel('trf-1', 'user-1')).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when journalEntryId is null', async () => {
        transferRepository.findOne.mockResolvedValue({
          id: 'trf-1',
          status: FundTransferStatus.ACTIVE,
          journalEntryId: null,
        } as any);
        await expect(service.cancel('trf-1', 'user-1')).rejects.toThrow(BadRequestException);
      });

      it('cancels transfer and reverses journal entry on success', async () => {
        const transfer = {
          id: 'trf-1',
          referenceNumber: 'TRF-26-001',
          status: FundTransferStatus.ACTIVE,
          journalEntryId: 'je-1',
        } as any;

        transferRepository.findOne
          .mockResolvedValueOnce(transfer)   // initial lookup
          .mockResolvedValueOnce({ ...transfer, status: FundTransferStatus.CANCELLED, journalEntry: { id: 'je-1', referenceNumber: 'JE-26-001', status: 'REVERSED' } }); // reload for response

        transferRepository.save.mockResolvedValue({ ...transfer, status: FundTransferStatus.CANCELLED } as any);
        accountingService.reverseSourceEntries.mockResolvedValue(undefined);

        const result = await service.cancel('trf-1', 'user-1');

        expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith('fund_transfer', 'trf-1', 'user-1');
        expect(transferRepository.save).toHaveBeenCalled();
        expect(auditLogService.log).toHaveBeenCalledWith('CANCEL', 'FundTransfer', expect.any(String), expect.any(Object));
        expect(result).toBeDefined();
      });
    });

    describe('findOne', () => {
      it('throws NotFoundException when not found', async () => {
        transferRepository.findOne.mockResolvedValue(null);
        await expect(service.findOne('trf-1')).rejects.toThrow(NotFoundException);
      });

      it('returns transfer when found', async () => {
        const transfer = { id: 'trf-1', status: FundTransferStatus.ACTIVE } as any;
        transferRepository.findOne.mockResolvedValue(transfer);
        const result = await service.findOne('trf-1');
        expect(result).toBeDefined();
      });
    });
  });
  ```

- [ ] **Step 2: Run the tests — expect them to fail (service doesn't exist yet)**

  ```bash
  cd backend && npx jest src/modules/accounting/services/fund-transfer.service.spec.ts --no-coverage
  ```
  Expected: FAIL — `Cannot find module './fund-transfer.service'`

- [ ] **Step 3: Commit the test file**

  ```bash
  git add backend/src/modules/accounting/services/fund-transfer.service.spec.ts
  git commit -m "test(accounting): add failing tests for FundTransferService"
  ```

---

### Task 7: Implement `FundTransferService`

**Files:**
- Create: `backend/src/modules/accounting/services/fund-transfer.service.ts`

- [ ] **Step 1: Implement the service**

  ```typescript
  // backend/src/modules/accounting/services/fund-transfer.service.ts
  import {
    Injectable,
    NotFoundException,
    BadRequestException,
    Logger,
  } from '@nestjs/common';
  import { InjectRepository } from '@nestjs/typeorm';
  import { DataSource, Repository } from 'typeorm';
  import { FundTransfer, FundTransferStatus } from '../../../database/entities/fund-transfer.entity';
  import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
  import { AccountingService } from './accounting.service';
  import { FiscalPeriodService } from './fiscal-period.service';
  import { SettingsService } from '../../settings/settings.service';
  import { AuditLogService } from '../../audit-logs/services';
  import {
    CreateFundTransferDto,
    QueryFundTransfersDto,
    FundTransferResponseDto,
    FundTransferListResponseDto,
  } from '../dto/fund-transfer.dto';

  @Injectable()
  export class FundTransferService {
    private readonly logger = new Logger(FundTransferService.name);

    constructor(
      @InjectRepository(FundTransfer)
      private readonly transferRepository: Repository<FundTransfer>,
      @InjectRepository(ChartOfAccount)
      private readonly coaRepository: Repository<ChartOfAccount>,
      private readonly accountingService: AccountingService,
      private readonly fiscalPeriodService: FiscalPeriodService,
      private readonly settingsService: SettingsService,
      private readonly auditLogService: AuditLogService,
      private readonly dataSource: DataSource,
    ) {}

    async create(
      dto: CreateFundTransferDto,
      userId: string,
      username?: string,
    ): Promise<FundTransferResponseDto> {
      // 1. Self-transfer check
      if (dto.sourceAccountId === dto.destinationAccountId) {
        throw new BadRequestException('Source and destination accounts must be different');
      }

      // 2. Validate source account
      const sourceAccount = await this.coaRepository.findOne({
        where: { id: dto.sourceAccountId },
      });
      if (!sourceAccount || !sourceAccount.isActive || sourceAccount.deletedAt) {
        throw new NotFoundException(`Source account '${dto.sourceAccountId}' not found or inactive`);
      }
      if (!sourceAccount.isCashEquivalent) {
        throw new BadRequestException(
          `Source account '${sourceAccount.name}' is not marked as a cash/bank account eligible for transfers`,
        );
      }

      // 3. Validate destination account
      const destinationAccount = await this.coaRepository.findOne({
        where: { id: dto.destinationAccountId },
      });
      if (!destinationAccount || !destinationAccount.isActive || destinationAccount.deletedAt) {
        throw new NotFoundException(`Destination account '${dto.destinationAccountId}' not found or inactive`);
      }
      if (!destinationAccount.isCashEquivalent) {
        throw new BadRequestException(
          `Destination account '${destinationAccount.name}' is not marked as a cash/bank account eligible for transfers`,
        );
      }

      // 4. Validate fiscal period
      const periodValidation = await this.fiscalPeriodService.validatePeriod({
        date: new Date(dto.transferDate),
      });
      if (!periodValidation.isValid || !periodValidation.period) {
        throw new BadRequestException(
          `No open fiscal period found for date ${dto.transferDate}. Please open a fiscal period first.`,
        );
      }

      // 5. Generate reference number
      const referenceNumber = await this.settingsService.generateDocumentNumber('Fund Transfers');

      // 6. Save in a transaction
      let savedTransfer: FundTransfer;
      await this.dataSource.transaction(async (manager) => {
        // 6a. Save transfer (journalEntryId is null initially)
        const transfer = manager.create(FundTransfer, {
          referenceNumber,
          transferDate: new Date(dto.transferDate),
          sourceAccountId: dto.sourceAccountId,
          destinationAccountId: dto.destinationAccountId,
          amount: dto.amount,
          description: dto.description,
          status: FundTransferStatus.ACTIVE,
          fiscalPeriodId: periodValidation.period.id,
        });
        savedTransfer = await manager.save(FundTransfer, transfer);

        // 6b. Post the journal entry
        const postedJE = await this.accountingService.postFundTransferEntry(
          savedTransfer,
          userId,
          username,
        );

        // 6c. Link JE back to transfer
        savedTransfer.journalEntryId = postedJE.id;
        await manager.save(FundTransfer, savedTransfer);
      });

      // 7. Audit log
      await this.auditLogService.log(
        'CREATE',
        'FundTransfer',
        `Created fund transfer: ${referenceNumber}`,
        { entityId: savedTransfer!.id, userId, username },
      );

      this.logger.log(`Fund transfer created: ${referenceNumber}`);
      return this.findOne(savedTransfer!.id);
    }

    async cancel(
      id: string,
      userId: string,
      username?: string,
    ): Promise<FundTransferResponseDto> {
      // 1. Find transfer
      const transfer = await this.transferRepository.findOne({ where: { id } });
      if (!transfer) {
        throw new NotFoundException(`Fund transfer '${id}' not found`);
      }

      // 2. Already cancelled?
      if (transfer.status === FundTransferStatus.CANCELLED) {
        throw new BadRequestException(`Fund transfer '${transfer.referenceNumber}' is already cancelled`);
      }

      // 3. Journal entry must exist
      if (!transfer.journalEntryId) {
        throw new BadRequestException(
          'Cannot cancel transfer — journal entry was not posted. This should not happen if transaction wrapping is in place.',
        );
      }

      // 4. Reverse the journal entry via AccountingService
      await this.accountingService.reverseSourceEntries('fund_transfer', id, userId);

      // 5-7. Update status and save
      transfer.status = FundTransferStatus.CANCELLED;
      await this.transferRepository.save(transfer);

      // 8. Audit log
      await this.auditLogService.log(
        'CANCEL',
        'FundTransfer',
        `Cancelled fund transfer: ${transfer.referenceNumber}`,
        { entityId: id, userId, username },
      );

      this.logger.log(`Fund transfer cancelled: ${transfer.referenceNumber}`);
      // 9. Reload with fresh relations so JE status reflects REVERSED
      return this.findOne(id);
    }

    async findAll(query: QueryFundTransfersDto): Promise<FundTransferListResponseDto> {
      const {
        page = 1,
        limit = 20,
        startDate,
        endDate,
        sourceAccountId,
        destinationAccountId,
        status,
        search,
        sortBy = 'transferDate',
        sortOrder = 'DESC',
      } = query;

      const qb = this.transferRepository
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.sourceAccount', 'sourceAccount')
        .leftJoinAndSelect('t.destinationAccount', 'destinationAccount')
        .leftJoinAndSelect('t.journalEntry', 'journalEntry')
        .where('t.deletedAt IS NULL');

      if (search) {
        qb.andWhere(
          '(t.referenceNumber ILIKE :search OR t.description ILIKE :search)',
          { search: `%${search}%` },
        );
      }
      if (startDate) qb.andWhere('t.transferDate >= :startDate', { startDate });
      if (endDate) qb.andWhere('t.transferDate <= :endDate', { endDate });
      if (sourceAccountId) qb.andWhere('t.sourceAccountId = :sourceAccountId', { sourceAccountId });
      if (destinationAccountId) qb.andWhere('t.destinationAccountId = :destinationAccountId', { destinationAccountId });
      if (status) qb.andWhere('t.status = :status', { status });

      const validSortFields = ['transferDate', 'referenceNumber', 'amount', 'createdAt'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'transferDate';
      const safeSortOrder = sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      qb.orderBy(`t.${sortField}`, safeSortOrder);

      const offset = (page - 1) * limit;
      qb.skip(offset).take(limit);

      const [transfers, total] = await qb.getManyAndCount();

      return {
        data: transfers.map((t) => this.toResponseDto(t)),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    async findOne(id: string): Promise<FundTransferResponseDto> {
      const transfer = await this.transferRepository.findOne({
        where: { id },
        relations: ['sourceAccount', 'destinationAccount', 'journalEntry'],
      });
      if (!transfer) {
        throw new NotFoundException(`Fund transfer '${id}' not found`);
      }
      return this.toResponseDto(transfer);
    }

    private toResponseDto(t: FundTransfer): FundTransferResponseDto {
      return {
        id: t.id,
        referenceNumber: t.referenceNumber,
        transferDate: t.transferDate,
        amount: Number(t.amount),
        description: t.description,
        status: t.status,
        fiscalPeriodId: t.fiscalPeriodId,
        journalEntryId: t.journalEntryId,
        sourceAccount: t.sourceAccount
          ? { id: t.sourceAccount.id, code: t.sourceAccount.code, name: t.sourceAccount.name, type: t.sourceAccount.type }
          : undefined as any,
        destinationAccount: t.destinationAccount
          ? { id: t.destinationAccount.id, code: t.destinationAccount.code, name: t.destinationAccount.name, type: t.destinationAccount.type }
          : undefined as any,
        journalEntry: t.journalEntry
          ? { id: t.journalEntry.id, referenceNumber: t.journalEntry.referenceNumber, status: t.journalEntry.status }
          : undefined,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    }
  }
  ```

- [ ] **Step 2: Run the tests — expect them to pass**

  ```bash
  cd backend && npx jest src/modules/accounting/services/fund-transfer.service.spec.ts --no-coverage
  ```
  Expected: all tests PASS. If any fail, fix the service until they do.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/modules/accounting/services/fund-transfer.service.ts
  git commit -m "feat(accounting): implement FundTransferService"
  ```

---

### Task 8: Add `postFundTransferEntry` to `AccountingService`

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting.service.ts`

- [ ] **Step 1: Read `postExpenseEntry` in `accounting.service.ts`** (lines ~720–811 as reference)

- [ ] **Step 2: Add the method after `postExpenseEntry`**

  Find the end of `postExpenseEntry` and add:

  ```typescript
  async postFundTransferEntry(
    transfer: import('../../../database/entities/fund-transfer.entity').FundTransfer,
    userId: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting fund transfer entry for ${transfer.referenceNumber}`);

    // Idempotency guard
    const existingEntries = await this.journalEntryService.findBySource('fund_transfer', transfer.id);
    const activeEntry = existingEntries.find(
      (e) => e.status === JournalEntryStatus.POSTED || e.status === JournalEntryStatus.DRAFT,
    );
    if (activeEntry) {
      this.logger.warn(
        `Journal entry already exists for fund transfer ${transfer.referenceNumber} — skipping duplicate`,
      );
      return activeEntry as any;
    }

    // Validate period is open
    await this.validatePeriodOpen(transfer.transferDate);

    // Get period entity
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: transfer.transferDate,
    });
    if (!periodValidation.period) {
      throw new BadRequestException(
        `No fiscal period found for date ${transfer.transferDate}`,
      );
    }

    const description = `Fund Transfer: ${transfer.referenceNumber}${
      transfer.description ? ` - ${transfer.description}` : ''
    }`;

    const lines: CreateJournalEntryLineDto[] = [
      // DR Destination account
      {
        accountId: transfer.destinationAccountId,
        debitAmount: Number(transfer.amount),
        creditAmount: 0,
        memo: `Transfer to ${transfer.destinationAccountId}`,
      },
      // CR Source account
      {
        accountId: transfer.sourceAccountId,
        debitAmount: 0,
        creditAmount: Number(transfer.amount),
        memo: `Transfer from ${transfer.sourceAccountId}`,
      },
    ];

    const entry = await this.journalEntryService.create(
      {
        entryDate: new Date(transfer.transferDate),
        description,
        fiscalPeriodId: periodValidation.period.id,
        sourceType: 'fund_transfer',
        sourceId: transfer.id,
        lines,
      },
      userId,
    );

    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);

    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted fund transfer journal entry: ${transfer.referenceNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'fund_transfer', sourceId: transfer.id },
      },
    );

    this.logger.log(`Fund transfer entry posted: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd backend && npx tsc --noEmit
  ```

- [ ] **Step 4: Run all accounting service tests to verify no regressions**

  ```bash
  cd backend && npx jest src/modules/accounting/services/ --no-coverage
  ```
  Expected: all existing tests still pass

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/modules/accounting/services/accounting.service.ts
  git commit -m "feat(accounting): add postFundTransferEntry to AccountingService"
  ```

---

### Task 9: Create `FundTransferController`

**Files:**
- Create: `backend/src/modules/accounting/controllers/fund-transfer.controller.ts`

- [ ] **Step 1: Create the controller**

  Model exactly on `expense.controller.ts`:

  ```typescript
  // backend/src/modules/accounting/controllers/fund-transfer.controller.ts
  import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    ParseUUIDPipe,
  } from '@nestjs/common';
  import { Auth } from '../../auth/decorators/auth.decorator';
  import { CurrentUser } from '../../auth/decorators/current-user.decorator';
  import { UserRole } from '../../../database/entities/user.entity';
  import { FundTransferService } from '../services/fund-transfer.service';
  import { CreateFundTransferDto, QueryFundTransfersDto } from '../dto/fund-transfer.dto';

  @Controller('accounting/fund-transfers')
  @Auth()
  export class FundTransferController {
    constructor(private readonly fundTransferService: FundTransferService) {}

    @Get()
    findAll(@Query() query: QueryFundTransfersDto) {
      return this.fundTransferService.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
      return this.fundTransferService.findOne(id);
    }

    @Post()
    @Auth(UserRole.ADMIN, UserRole.MANAGER)
    create(
      @Body() dto: CreateFundTransferDto,
      @CurrentUser('userId') userId: string,
      @CurrentUser('username') username: string,
    ) {
      return this.fundTransferService.create(dto, userId, username);
    }

    @Post(':id/cancel')
    @Auth(UserRole.ADMIN, UserRole.MANAGER)
    cancel(
      @Param('id', ParseUUIDPipe) id: string,
      @CurrentUser('userId') userId: string,
      @CurrentUser('username') username: string,
    ) {
      return this.fundTransferService.cancel(id, userId, username);
    }
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  cd backend && npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/modules/accounting/controllers/fund-transfer.controller.ts
  git commit -m "feat(accounting): add FundTransferController"
  ```

---

### Task 10: Register everything in `AccountingModule`

**Files:**
- Modify: `backend/src/modules/accounting/accounting.module.ts`

- [ ] **Step 1: Read `accounting.module.ts` to see the current imports**

- [ ] **Step 2: Add `FundTransfer` to imports, and `FundTransferService`/`FundTransferController` to providers/controllers/exports**

  Add to the top imports:
  ```typescript
  import { FundTransfer } from '../../database/entities/fund-transfer.entity';
  import { FundTransferService } from './services/fund-transfer.service';
  import { FundTransferController } from './controllers/fund-transfer.controller';
  ```

  Add `FundTransfer` to `TypeOrmModule.forFeature([...])`.

  Add `FundTransferController` to `controllers: [...]`.

  Add `FundTransferService` to both `providers: [...]` and `exports: [...]`.

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  cd backend && npx tsc --noEmit
  ```

- [ ] **Step 4: Run all backend tests to verify no regressions**

  ```bash
  cd backend && npm run test
  ```
  Expected: all tests pass

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/modules/accounting/accounting.module.ts
  git commit -m "feat(accounting): register FundTransfer in AccountingModule"
  ```

---

## Chunk 3: Frontend

### Task 11: Add types and RTK Query endpoints

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/store/api/accountingApi.ts`

- [ ] **Step 1: Add `isCashEquivalent` to `ChartOfAccount` type**

  In `frontend/src/types/index.ts`, find the `ChartOfAccount` interface and add:
  ```typescript
  isCashEquivalent?: boolean;
  ```

- [ ] **Step 2: Add `FundTransfer` type**

  In `frontend/src/types/index.ts`, add after `ExpenseRecord`:
  ```typescript
  export interface FundTransfer {
    id: string;
    referenceNumber: string;
    transferDate: string;
    amount: number;
    description?: string;
    status: 'ACTIVE' | 'CANCELLED';
    fiscalPeriodId: string;
    journalEntryId?: string;
    sourceAccount: {
      id: string;
      code: string;
      name: string;
      type: string;
    };
    destinationAccount: {
      id: string;
      code: string;
      name: string;
      type: string;
    };
    journalEntry?: {
      id: string;
      referenceNumber: string;
      status: string;
    };
    createdAt: string;
    updatedAt: string;
  }
  ```

- [ ] **Step 3: Add `FundTransfer` import and tag to `accountingApi.ts`**

  In `frontend/src/store/api/accountingApi.ts`:
  1. Add `FundTransfer` to the import from `@/types`
  2. Add `'FundTransfer'` to the `tagTypes` array

- [ ] **Step 4: Add RTK Query endpoints to `accountingApi.ts`**

  Inside `endpoints: (builder) => ({`, add after the existing expense endpoints:

  ```typescript
  getFundTransfers: builder.query<PaginatedResponse<FundTransfer>, Record<string, unknown> | undefined>({
    query: (params) => ({ url: '/accounting/fund-transfers', params: params ?? {} }),
    transformResponse: normalizePaginated<FundTransfer>,
    providesTags: ['FundTransfer'],
  }),
  getFundTransfer: builder.query<FundTransfer, string>({
    query: (id) => ({ url: `/accounting/fund-transfers/${id}` }),
    transformResponse: normalizeSingle<FundTransfer>,
    providesTags: (_result, _error, id) => [{ type: 'FundTransfer', id }],
  }),
  createFundTransfer: builder.mutation<FundTransfer, Partial<FundTransfer>>({
    query: (body) => ({ url: '/accounting/fund-transfers', method: 'POST', data: body }),
    transformResponse: normalizeSingle<FundTransfer>,
    invalidatesTags: ['FundTransfer', 'JournalEntry', 'AccountingReport'],
  }),
  cancelFundTransfer: builder.mutation<FundTransfer, string>({
    query: (id) => ({ url: `/accounting/fund-transfers/${id}/cancel`, method: 'POST' }),
    transformResponse: normalizeSingle<FundTransfer>,
    invalidatesTags: (_result, _error, id) => [{ type: 'FundTransfer', id }, 'FundTransfer', 'JournalEntry', 'AccountingReport'],
  }),
  ```

- [ ] **Step 5: Export the new hooks**

  Find the `export const { ... } = accountingApiSlice` at the bottom of `accountingApi.ts` and add the four new hooks:
  ```
  useGetFundTransfersQuery,
  useGetFundTransferQuery,
  useCreateFundTransferMutation,
  useCancelFundTransferMutation,
  ```

- [ ] **Step 6: TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/types/index.ts frontend/src/store/api/accountingApi.ts
  git commit -m "feat(accounting): add FundTransfer type and RTK Query endpoints"
  ```

---

### Task 12: Add `isCashEquivalent` to COA form dialog

**Files:**
- Modify: `frontend/src/components/accounting/ChartOfAccountFormDialog.tsx`

- [ ] **Step 1: Add `isCashEquivalent` to `FormData` interface**

  ```typescript
  interface FormData {
    code: string
    name: string
    type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
    parentId?: string | null
    isActive: boolean
    isCashEquivalent: boolean   // add this
  }
  ```

- [ ] **Step 2: Add to yup schema**

  ```typescript
  isCashEquivalent: yup.boolean().required(),
  ```

- [ ] **Step 3: Add to `defaultValues`**

  ```typescript
  isCashEquivalent: false,
  ```

- [ ] **Step 4: Populate from account in the `reset` call for edit mode**

  ```typescript
  isCashEquivalent: account.isCashEquivalent ?? false,
  ```

- [ ] **Step 5: Pass field to create/update API calls**

  In `onSubmit`, add `isCashEquivalent: data.isCashEquivalent` to `accountData`.

- [ ] **Step 6: Add the checkbox to the form JSX**

  After the existing `isActive` checkbox (around line 309), add:

  ```tsx
  <Grid size={12}>
    <Controller
      name="isCashEquivalent"
      control={control}
      render={({ field }) => (
        <FormControlLabel
          control={
            <Checkbox
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
            />
          }
          label="Cash/Bank Account (eligible for fund transfers)"
        />
      )}
    />
  </Grid>
  ```

- [ ] **Step 7: TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add frontend/src/components/accounting/ChartOfAccountFormDialog.tsx
  git commit -m "feat(accounting): add isCashEquivalent checkbox to COA form"
  ```

---

### Task 13: Write failing frontend tests for `FundTransfersPage`

**Files:**
- Create: `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx`

- [ ] **Step 1: Write the test file**

  Model exactly on `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx`:

  ```tsx
  // frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { BrowserRouter } from 'react-router-dom'

  import FundTransfersPage from '../FundTransfersPage'

  vi.mock('@/hooks/useNotification', () => ({
    useNotification: () => ({
      showSuccess: vi.fn(),
      showError: vi.fn(),
    }),
  }))

  vi.mock('@/hooks/useSearchAndFilter', async () => {
    const actual = await vi.importActual('@/hooks/useSearchAndFilter')
    return { ...actual, useKeyboardShortcuts: vi.fn() }
  })

  const mockedApi = vi.hoisted(() => ({
    useGetFundTransfersQuery: vi.fn(),
    useGetChartOfAccountsQuery: vi.fn(),
    useCreateFundTransferMutation: vi.fn(),
    useCancelFundTransferMutation: vi.fn(),
  }))

  vi.mock('@/store/api/accountingApi', () => ({
    useGetFundTransfersQuery: mockedApi.useGetFundTransfersQuery,
    useGetChartOfAccountsQuery: mockedApi.useGetChartOfAccountsQuery,
    useCreateFundTransferMutation: mockedApi.useCreateFundTransferMutation,
    useCancelFundTransferMutation: mockedApi.useCancelFundTransferMutation,
  }))

  const mockTransfer = {
    id: 'trf-1',
    referenceNumber: 'TRF-26-001',
    transferDate: '2026-03-12',
    amount: 1000,
    description: 'Test transfer',
    status: 'ACTIVE',
    sourceAccount: { id: 'acc-1', code: '1001', name: 'Cash on Hand', type: 'ASSET' },
    destinationAccount: { id: 'acc-2', code: '1002', name: 'Petty Cash', type: 'ASSET' },
    createdAt: '2026-03-12',
    updatedAt: '2026-03-12',
  }

  const mockCashAccount = (id: string, name: string) => ({
    id,
    code: '1001',
    name,
    type: 'ASSET',
    isActive: true,
    isCashEquivalent: true,
    fullCode: '1001',
    isParent: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  })

  const renderPage = () =>
    render(
      <BrowserRouter>
        <FundTransfersPage />
      </BrowserRouter>,
    )

  describe('FundTransfersPage', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      mockedApi.useGetFundTransfersQuery.mockReturnValue({
        data: { data: [mockTransfer], meta: { total: 1 } },
        isLoading: false,
        refetch: vi.fn(),
      })
      mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
        data: {
          data: [
            mockCashAccount('acc-1', 'Cash on Hand'),
            mockCashAccount('acc-2', 'Petty Cash'),
          ],
        },
        isLoading: false,
      })
      mockedApi.useCreateFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
      mockedApi.useCancelFundTransferMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    })

    it('renders the page title', () => {
      renderPage()
      expect(screen.getByText('Fund Transfers')).toBeInTheDocument()
    })

    it('renders the transfer reference number in the table', () => {
      renderPage()
      expect(screen.getByText('TRF-26-001')).toBeInTheDocument()
    })

    it('renders source account name', () => {
      renderPage()
      expect(screen.getByText(/Cash on Hand/)).toBeInTheDocument()
    })

    it('renders destination account name', () => {
      renderPage()
      expect(screen.getByText(/Petty Cash/)).toBeInTheDocument()
    })

    it('renders ACTIVE status chip', () => {
      renderPage()
      expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    })

    it('shows loading state when data is loading', () => {
      mockedApi.useGetFundTransfersQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        refetch: vi.fn(),
      })
      renderPage()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('renders New Transfer button', () => {
      renderPage()
      expect(screen.getByRole('button', { name: /new transfer/i })).toBeInTheDocument()
    })

    it('renders Cancel button for ACTIVE transfer', () => {
      renderPage()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run the tests — expect them to fail**

  ```bash
  cd frontend && npx vitest run src/pages/accounting/__tests__/FundTransfersPage.test.tsx
  ```
  Expected: FAIL — `Cannot find module '../FundTransfersPage'`

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx
  git commit -m "test(accounting): add failing tests for FundTransfersPage"
  ```

---

### Task 14: Implement `FundTransfersPage`

**Files:**
- Create: `frontend/src/pages/accounting/FundTransfersPage.tsx`

- [ ] **Step 1: Implement the page**

  Model exactly on `ExpensesPage.tsx`. Key structure:
  - Imports from MUI, hooks, RTK Query
  - `FormState` type for the create dialog
  - Page-level state: `dialogOpen`, `cancelDialogOpen`, `cancelTargetId`, filter state
  - `useGetFundTransfersQuery` with filter params
  - `useGetChartOfAccountsQuery` filtered to `isCashEquivalent: true` — pass `{ isCashEquivalent: true }` as query param
  - `useCreateFundTransferMutation` and `useCancelFundTransferMutation`
  - Toolbar with "New Transfer" button (hidden for Viewer), date filters, status filter, refresh
  - Table with columns: Reference, Date, From Account, To Account, Amount, Status chip, Cancel action button
  - Create dialog form with From Account (searchable Select filtered to `isCashEquivalent` accounts), To Account (same, excluding From selection), Amount, Date, Description
  - Cancel confirmation dialog

  ```tsx
  // frontend/src/pages/accounting/FundTransfersPage.tsx
  import React, { useState, useMemo } from 'react'
  import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
  } from '@mui/material'
  import {
    Add as AddIcon,
    Cancel as CancelIcon,
    Refresh as RefreshIcon,
    SwapHoriz as TransferIcon,
  } from '@mui/icons-material'
  import { TYPOGRAPHY_STYLES } from '@/constants/typography'
  import { useNotification } from '@/hooks/useNotification'
  import {
    useGetFundTransfersQuery,
    useGetChartOfAccountsQuery,
    useCreateFundTransferMutation,
    useCancelFundTransferMutation,
  } from '@/store/api/accountingApi'
  import type { FundTransfer } from '@/types'
  import { formatCurrency, formatDate } from '@/utils/formatters'

  type FormState = {
    sourceAccountId: string
    destinationAccountId: string
    amount: string
    transferDate: string
    description: string
  }

  const defaultForm: FormState = {
    sourceAccountId: '',
    destinationAccountId: '',
    amount: '',
    transferDate: new Date().toISOString().split('T')[0],
    description: '',
  }

  export default function FundTransfersPage() {
    const { showSuccess, showError } = useNotification()

    const [dialogOpen, setDialogOpen] = useState(false)
    const [form, setForm] = useState<FormState>(defaultForm)
    const [cancelTarget, setCancelTarget] = useState<FundTransfer | null>(null)
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [statusFilter, setStatusFilter] = useState('')

    const { data, isLoading, refetch } = useGetFundTransfersQuery({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status: statusFilter || undefined,
    })

    const { data: accountsResponse } = useGetChartOfAccountsQuery({ isCashEquivalent: true, limit: 200 })
    const cashAccounts = useMemo(
      () => (accountsResponse?.data ?? []).filter((a) => a.isCashEquivalent && a.isActive),
      [accountsResponse],
    )

    const [createTransfer, { isLoading: creating }] = useCreateFundTransferMutation()
    const [cancelTransfer, { isLoading: cancelling }] = useCancelFundTransferMutation()

    const transfers = data?.data ?? []

    const handleCreate = async () => {
      if (!form.sourceAccountId || !form.destinationAccountId || !form.amount || !form.transferDate) {
        showError('Please fill in all required fields')
        return
      }
      if (form.sourceAccountId === form.destinationAccountId) {
        showError('Source and destination accounts must be different')
        return
      }
      try {
        await createTransfer({
          sourceAccountId: form.sourceAccountId,
          destinationAccountId: form.destinationAccountId,
          amount: parseFloat(form.amount),
          transferDate: form.transferDate,
          description: form.description || undefined,
        } as any).unwrap()
        showSuccess('Fund transfer created successfully')
        setDialogOpen(false)
        setForm(defaultForm)
        refetch()
      } catch (err: any) {
        showError(err?.message || err || 'Failed to create transfer')
      }
    }

    const handleCancel = async () => {
      if (!cancelTarget) return
      try {
        await cancelTransfer(cancelTarget.id).unwrap()
        showSuccess(`Transfer ${cancelTarget.referenceNumber} cancelled`)
        setCancelTarget(null)
        refetch()
      } catch (err: any) {
        showError(err?.message || err || 'Failed to cancel transfer')
      }
    }

    const availableDestinations = useMemo(
      () => cashAccounts.filter((a) => a.id !== form.sourceAccountId),
      [cashAccounts, form.sourceAccountId],
    )

    return (
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
          <Stack direction="row" alignItems="center" gap={1}>
            <TransferIcon color="primary" />
            <Typography variant="h5" sx={TYPOGRAPHY_STYLES.pageTitle}>
              Fund Transfers
            </Typography>
          </Stack>
          <Stack direction="row" gap={1}>
            <IconButton onClick={() => refetch()} title="Refresh">
              <RefreshIcon />
            </IconButton>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
            >
              New Transfer
            </Button>
          </Stack>
        </Stack>

        {/* Filters */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction="row" gap={2} flexWrap="wrap">
              <TextField
                label="From Date"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <TextField
                label="To Date"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} label="Status">
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="ACTIVE">Active</MenuItem>
                  <MenuItem value="CANCELLED">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </CardContent>
        </Card>

        {/* Table */}
        {isLoading ? (
          <Box display="flex" justifyContent="center" mt={4}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>From Account</TableCell>
                  <TableCell>To Account</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      No fund transfers found
                    </TableCell>
                  </TableRow>
                ) : (
                  transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.referenceNumber}</TableCell>
                      <TableCell>{formatDate(t.transferDate)}</TableCell>
                      <TableCell>{t.sourceAccount?.code} - {t.sourceAccount?.name}</TableCell>
                      <TableCell>{t.destinationAccount?.code} - {t.destinationAccount?.name}</TableCell>
                      <TableCell align="right">{formatCurrency(t.amount)}</TableCell>
                      <TableCell>
                        <Chip
                          label={t.status}
                          size="small"
                          color={t.status === 'ACTIVE' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          color="error"
                          startIcon={<CancelIcon />}
                          disabled={t.status === 'CANCELLED'}
                          onClick={() => setCancelTarget(t)}
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Create Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>New Fund Transfer</DialogTitle>
          <DialogContent>
            <Stack gap={2} sx={{ mt: 1 }}>
              <FormControl fullWidth>
                <InputLabel>From Account *</InputLabel>
                <Select
                  value={form.sourceAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, sourceAccountId: e.target.value, destinationAccountId: '' }))}
                  label="From Account *"
                >
                  {cashAccounts.map((a) => (
                    <MenuItem key={a.id} value={a.id}>{a.code} - {a.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>To Account *</InputLabel>
                <Select
                  value={form.destinationAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, destinationAccountId: e.target.value }))}
                  label="To Account *"
                  disabled={!form.sourceAccountId}
                >
                  {availableDestinations.map((a) => (
                    <MenuItem key={a.id} value={a.id}>{a.code} - {a.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Amount *"
                type="number"
                inputProps={{ min: 0.01, step: 0.01 }}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
              <TextField
                fullWidth
                label="Date *"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.transferDate}
                onChange={(e) => setForm((f) => ({ ...f, transferDate: e.target.value }))}
              />
              <TextField
                fullWidth
                label="Description"
                multiline
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setDialogOpen(false); setForm(defaultForm) }}>Cancel</Button>
            <Button variant="contained" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Transfer'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Cancel Confirmation Dialog */}
        <Dialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Cancel Transfer</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to cancel transfer <strong>{cancelTarget?.referenceNumber}</strong>?
              This will post a reversing journal entry.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCancelTarget(null)}>Keep</Button>
            <Button variant="contained" color="error" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling...' : 'Yes, Cancel Transfer'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    )
  }
  ```

- [ ] **Step 2: Run the frontend tests — expect them to pass**

  ```bash
  cd frontend && npx vitest run src/pages/accounting/__tests__/FundTransfersPage.test.tsx
  ```
  Expected: all tests PASS. If any fail, fix the page until they do.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/accounting/FundTransfersPage.tsx
  git commit -m "feat(accounting): implement FundTransfersPage"
  ```

---

### Task 15: Wire up routing and sidebar

**Files:**
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Add route to `router.tsx`**

  At the top of `router.tsx`, add the lazy import after `ExpensesPage`:
  ```typescript
  const FundTransfersPage = React.lazy(() => import('./pages/accounting/FundTransfersPage'))
  ```

  In the routes array, after the expenses route:
  ```typescript
  { path: '/accounting/fund-transfers', element: <FundTransfersPage /> },
  ```

- [ ] **Step 2: Add sidebar item to `Sidebar.tsx`**

  Read `Sidebar.tsx` to find where the accounting section items are defined (around the `expenses` entry). Add after it:

  ```typescript
  {
    id: 'fund-transfers',
    title: 'Fund Transfers',
    icon: <SwapHorizIcon />,
    path: '/accounting/fund-transfers',
  },
  ```

  Import `SwapHorizIcon` from `@mui/icons-material` at the top of the file (check existing imports to see the pattern, then add `SwapHoriz as SwapHorizIcon`).

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

- [ ] **Step 4: Run all frontend tests to verify no regressions**

  ```bash
  cd frontend && npm run test
  ```
  Expected: all tests pass

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/router.tsx frontend/src/components/common/Sidebar.tsx
  git commit -m "feat(accounting): add Fund Transfers route and sidebar navigation"
  ```

---

## Chunk 4: Verification

### Task 16: End-to-end smoke test

- [ ] **Step 1: Build and start the backend**

  ```bash
  docker compose build backend && docker compose up -d backend
  ```
  Wait ~30 seconds for the backend to start.

- [ ] **Step 2: Check backend logs for errors**

  ```bash
  docker compose logs backend --tail=50
  ```
  Expected: no startup errors, NestJS prints "Application is running on..."

- [ ] **Step 3: Build and start the frontend**

  ```bash
  docker compose build frontend && docker compose up -d frontend
  ```

- [ ] **Step 4: Manual smoke test checklist**

  1. Log in as `admin / Admin@123!`
  2. Go to **Accounting → Chart of Accounts**
  3. Edit an asset account → verify "Cash/Bank Account" checkbox is visible
  4. Check the box on at least 2 accounts (e.g., "Cash on Hand", "Bank Account")
  5. Go to **Accounting → Fund Transfers**
  6. Verify the page loads with an empty table
  7. Click "New Transfer" → verify only `isCashEquivalent` accounts appear in dropdowns
  8. Create a transfer → verify it appears in the table with status ACTIVE
  9. Go to **Accounting → Journal Entries** → verify a POSTED JE exists with `sourceType = fund_transfer`
  10. Return to Fund Transfers → click Cancel on the transfer → confirm → verify status changes to CANCELLED
  11. Go to Journal Entries → verify the reversing JE was created
  12. Go to **Accounting → Reports → General Ledger** → select one of the transfer accounts → verify the transfer appears

- [ ] **Step 5: Run the full backend test suite one final time**

  ```bash
  cd backend && npm run test
  ```
  Expected: all tests pass

- [ ] **Step 6: Run the full frontend test suite one final time**

  ```bash
  cd frontend && npm run test
  ```
  Expected: all tests pass

- [ ] **Step 7: Final commit**

  ```bash
  git add -A
  git status  # review what's staged
  git commit -m "feat(accounting): complete Fund Transfer module (issue #79)"
  ```
