# Owner's Equity & Expense Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two new accounting sub-modules -- Owner's Equity Transactions (drawings, capital injections) and Expense Management -- each with backend CRUD, auto-posting to journal entries, and frontend management pages.

**Architecture:** Both modules follow the existing Settlement pattern: entity + service + controller + DTOs in the accounting module, with auto-posting methods added to `AccountingService`. Frontend follows the SettlementsPage pattern with Redux slices and dedicated API services.

**Tech Stack:** NestJS + TypeORM (backend), React + MUI + Redux Toolkit (frontend), Jest (backend tests), Vitest (frontend tests)

---

## Task 1: Owner Equity Transaction Entity

**Files:**
- Create: `backend/src/database/entities/owner-equity-transaction.entity.ts`

**Step 1: Create the entity file**

```typescript
import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDecimal,
  IsDate,
  MaxLength,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { PaymentMethodEntity } from './payment-method.entity';
import { JournalEntry } from './journal-entry.entity';

export enum OwnerEquityTransactionType {
  CAPITAL_INJECTION = 'capital_injection',
  OWNER_DRAWING = 'owner_drawing',
}

export enum OwnerEquityTransactionStatus {
  DRAFT = 'draft',
  POSTED = 'posted',
}

@Entity('owner_equity_transactions')
@Index(['referenceNumber'], { unique: true })
@Index(['type'])
@Index(['status'])
@Index(['transactionDate'])
@Index(['paymentMethodId'])
export class OwnerEquityTransaction extends BaseEntity {
  @Column({ type: 'varchar', length: 30, unique: true })
  @IsString()
  @MaxLength(30)
  referenceNumber: string;

  @Column({ type: 'date' })
  @IsDate()
  transactionDate: Date;

  @Column({
    type: 'enum',
    enum: OwnerEquityTransactionType,
  })
  @IsEnum(OwnerEquityTransactionType)
  type: OwnerEquityTransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  @IsDecimal({ decimal_digits: '0,4' })
  amount: number;

  @Column({ type: 'uuid' })
  paymentMethodId: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({
    type: 'enum',
    enum: OwnerEquityTransactionStatus,
    default: OwnerEquityTransactionStatus.DRAFT,
  })
  @IsEnum(OwnerEquityTransactionStatus)
  status: OwnerEquityTransactionStatus;

  @Column({ type: 'uuid', nullable: true })
  @IsOptional()
  journalEntryId?: string;

  @ManyToOne(() => PaymentMethodEntity, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethodEntity;

  @ManyToOne(() => JournalEntry, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'journalEntryId' })
  journalEntry?: JournalEntry;

  @BeforeInsert()
  generateReferenceNumber() {
    if (!this.referenceNumber) {
      const timestamp = Date.now().toString(36).toUpperCase();
      this.referenceNumber = `EQ-${timestamp}`;
    }
  }
}
```

**Step 2: Commit**

```bash
git add backend/src/database/entities/owner-equity-transaction.entity.ts
git commit -m "feat(accounting): add OwnerEquityTransaction entity"
```

---

## Task 2: Expense Entity

**Files:**
- Create: `backend/src/database/entities/expense.entity.ts`

**Step 1: Create the entity file**

```typescript
import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDecimal,
  IsDate,
  MaxLength,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { PaymentMethodEntity } from './payment-method.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { JournalEntry } from './journal-entry.entity';

export enum ExpenseStatus {
  DRAFT = 'draft',
  POSTED = 'posted',
}

@Entity('expenses')
@Index(['referenceNumber'], { unique: true })
@Index(['status'])
@Index(['expenseDate'])
@Index(['expenseAccountId'])
@Index(['paymentMethodId'])
export class Expense extends BaseEntity {
  @Column({ type: 'varchar', length: 30, unique: true })
  @IsString()
  @MaxLength(30)
  referenceNumber: string;

  @Column({ type: 'date' })
  @IsDate()
  expenseDate: Date;

  @Column({ type: 'uuid' })
  expenseAccountId: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  @IsDecimal({ decimal_digits: '0,4' })
  amount: number;

  @Column({ type: 'uuid' })
  paymentMethodId: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  vendor?: string;

  @Column({
    type: 'enum',
    enum: ExpenseStatus,
    default: ExpenseStatus.DRAFT,
  })
  @IsEnum(ExpenseStatus)
  status: ExpenseStatus;

  @Column({ type: 'uuid', nullable: true })
  @IsOptional()
  journalEntryId?: string;

  @ManyToOne(() => PaymentMethodEntity, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethodEntity;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'expenseAccountId' })
  expenseAccount: ChartOfAccount;

  @ManyToOne(() => JournalEntry, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'journalEntryId' })
  journalEntry?: JournalEntry;

  @BeforeInsert()
  generateReferenceNumber() {
    if (!this.referenceNumber) {
      const timestamp = Date.now().toString(36).toUpperCase();
      this.referenceNumber = `EXP-${timestamp}`;
    }
  }
}
```

**Step 2: Commit**

```bash
git add backend/src/database/entities/expense.entity.ts
git commit -m "feat(accounting): add Expense entity"
```

---

## Task 3: Owner Equity DTOs

**Files:**
- Create: `backend/src/modules/accounting/dto/owner-equity.dto.ts`

**Step 1: Create DTOs**

```typescript
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsUUID,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OwnerEquityTransactionType } from '../../../database/entities/owner-equity-transaction.entity';

export class CreateOwnerEquityDto {
  @IsDateString()
  transactionDate: string;

  @IsEnum(OwnerEquityTransactionType)
  type: OwnerEquityTransactionType;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateOwnerEquityDto {
  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsEnum(OwnerEquityTransactionType)
  type?: OwnerEquityTransactionType;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class QueryOwnerEquityDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsEnum(OwnerEquityTransactionType)
  type?: OwnerEquityTransactionType;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class BulkOwnerEquityDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class OwnerEquityResponseDto {
  id: string;
  referenceNumber: string;
  transactionDate: Date;
  type: string;
  amount: number;
  paymentMethodId: string;
  paymentMethod?: {
    id: string;
    code: string;
    name: string;
  };
  description?: string;
  status: string;
  journalEntryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class OwnerEquityListResponseDto {
  data: OwnerEquityResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**Step 2: Commit**

```bash
git add backend/src/modules/accounting/dto/owner-equity.dto.ts
git commit -m "feat(accounting): add owner equity DTOs"
```

---

## Task 4: Expense DTOs

**Files:**
- Create: `backend/src/modules/accounting/dto/expense.dto.ts`

**Step 1: Create DTOs**

```typescript
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsUUID,
  IsArray,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExpenseDto {
  @IsDateString()
  expenseDate: string;

  @IsUUID()
  expenseAccountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  vendor?: string;
}

export class UpdateExpenseDto {
  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @IsOptional()
  @IsUUID()
  expenseAccountId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  vendor?: string;
}

export class QueryExpenseDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsUUID()
  expenseAccountId?: string;

  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

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

export class BulkExpenseDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class ExpenseResponseDto {
  id: string;
  referenceNumber: string;
  expenseDate: Date;
  expenseAccountId: string;
  expenseAccount?: {
    id: string;
    code: string;
    name: string;
  };
  amount: number;
  paymentMethodId: string;
  paymentMethod?: {
    id: string;
    code: string;
    name: string;
  };
  description?: string;
  vendor?: string;
  status: string;
  journalEntryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ExpenseListResponseDto {
  data: ExpenseResponseDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**Step 2: Commit**

```bash
git add backend/src/modules/accounting/dto/expense.dto.ts
git commit -m "feat(accounting): add expense DTOs"
```

---

## Task 5: Owner Equity Service

**Files:**
- Create: `backend/src/modules/accounting/services/owner-equity.service.ts`

**Step 1: Create the service**

```typescript
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  OwnerEquityTransaction,
  OwnerEquityTransactionStatus,
} from '../../../database/entities/owner-equity-transaction.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AccountingService } from './accounting.service';
import {
  CreateOwnerEquityDto,
  UpdateOwnerEquityDto,
  QueryOwnerEquityDto,
  BulkOwnerEquityDto,
  OwnerEquityResponseDto,
  OwnerEquityListResponseDto,
} from '../dto/owner-equity.dto';

@Injectable()
export class OwnerEquityService {
  private readonly logger = new Logger(OwnerEquityService.name);

  constructor(
    @InjectRepository(OwnerEquityTransaction)
    private readonly ownerEquityRepository: Repository<OwnerEquityTransaction>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    private readonly accountingService: AccountingService,
  ) {}

  async findAll(query: QueryOwnerEquityDto): Promise<OwnerEquityListResponseDto> {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      startDate,
      endDate,
      sortBy = 'transactionDate',
      sortOrder = 'DESC',
    } = query;

    const qb = this.ownerEquityRepository
      .createQueryBuilder('oet')
      .leftJoinAndSelect('oet.paymentMethod', 'paymentMethod')
      .where('oet.deletedAt IS NULL');

    if (type) {
      qb.andWhere('oet.type = :type', { type });
    }

    if (status) {
      qb.andWhere('oet.status = :status', { status });
    }

    if (startDate) {
      qb.andWhere('oet.transactionDate >= :startDate', { startDate });
    }

    if (endDate) {
      qb.andWhere('oet.transactionDate <= :endDate', { endDate });
    }

    const allowedSortFields = ['transactionDate', 'createdAt', 'amount', 'type'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'transactionDate';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(`oet.${safeSortBy}`, safeSortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toResponseDto(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<OwnerEquityResponseDto> {
    const transaction = await this.ownerEquityRepository.findOne({
      where: { id },
      relations: ['paymentMethod'],
    });

    if (!transaction || transaction.deletedAt) {
      throw new NotFoundException(`Owner equity transaction ${id} not found`);
    }

    return this.toResponseDto(transaction);
  }

  async create(dto: CreateOwnerEquityDto, userId = 'system'): Promise<OwnerEquityResponseDto> {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });

    if (!paymentMethod || paymentMethod.deletedAt) {
      throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);
    }

    const transaction = this.ownerEquityRepository.create({
      transactionDate: new Date(dto.transactionDate),
      type: dto.type,
      amount: dto.amount,
      paymentMethodId: dto.paymentMethodId,
      description: dto.description,
      status: OwnerEquityTransactionStatus.DRAFT,
    });

    const saved = await this.ownerEquityRepository.save(transaction);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateOwnerEquityDto, userId = 'system'): Promise<OwnerEquityResponseDto> {
    const transaction = await this.ownerEquityRepository.findOne({
      where: { id },
    });

    if (!transaction || transaction.deletedAt) {
      throw new NotFoundException(`Owner equity transaction ${id} not found`);
    }

    if (transaction.status === OwnerEquityTransactionStatus.POSTED) {
      throw new BadRequestException('Cannot update a posted transaction');
    }

    if (dto.paymentMethodId) {
      const paymentMethod = await this.paymentMethodRepository.findOne({
        where: { id: dto.paymentMethodId, isActive: true },
      });
      if (!paymentMethod || paymentMethod.deletedAt) {
        throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);
      }
    }

    if (dto.transactionDate) transaction.transactionDate = new Date(dto.transactionDate);
    if (dto.type) transaction.type = dto.type;
    if (dto.amount !== undefined) transaction.amount = dto.amount;
    if (dto.paymentMethodId) transaction.paymentMethodId = dto.paymentMethodId;
    if (dto.description !== undefined) transaction.description = dto.description;

    await this.ownerEquityRepository.save(transaction);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const transaction = await this.ownerEquityRepository.findOne({
      where: { id },
    });

    if (!transaction || transaction.deletedAt) {
      throw new NotFoundException(`Owner equity transaction ${id} not found`);
    }

    if (transaction.status === OwnerEquityTransactionStatus.POSTED) {
      throw new BadRequestException('Cannot delete a posted transaction');
    }

    await this.ownerEquityRepository.softDelete(id);
  }

  async post(id: string, userId = 'system'): Promise<OwnerEquityResponseDto> {
    const transaction = await this.ownerEquityRepository.findOne({
      where: { id },
      relations: ['paymentMethod'],
    });

    if (!transaction || transaction.deletedAt) {
      throw new NotFoundException(`Owner equity transaction ${id} not found`);
    }

    if (transaction.status === OwnerEquityTransactionStatus.POSTED) {
      throw new BadRequestException('Transaction is already posted');
    }

    try {
      const journalEntry = await this.accountingService.postOwnerEquityEntry(
        transaction,
        userId,
      );
      transaction.status = OwnerEquityTransactionStatus.POSTED;
      transaction.journalEntryId = journalEntry.id;
      await this.ownerEquityRepository.save(transaction);
    } catch (error) {
      this.logger.error(
        `Failed to post owner equity entry for ${transaction.referenceNumber}: ${error.message}`,
      );
      throw error;
    }

    return this.findOne(id);
  }

  async bulkPost(dto: BulkOwnerEquityDto, userId = 'system'): Promise<{ posted: number; failed: number }> {
    let posted = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.post(id, userId);
        posted++;
      } catch (error) {
        this.logger.error(`Failed to post owner equity ${id}: ${error.message}`);
        failed++;
      }
    }

    return { posted, failed };
  }

  async bulkDelete(dto: BulkOwnerEquityDto): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.remove(id);
        deleted++;
      } catch (error) {
        this.logger.error(`Failed to delete owner equity ${id}: ${error.message}`);
        failed++;
      }
    }

    return { deleted, failed };
  }

  private toResponseDto(transaction: OwnerEquityTransaction): OwnerEquityResponseDto {
    return {
      id: transaction.id,
      referenceNumber: transaction.referenceNumber,
      transactionDate: transaction.transactionDate,
      type: transaction.type,
      amount: Number(transaction.amount),
      paymentMethodId: transaction.paymentMethodId,
      paymentMethod: transaction.paymentMethod
        ? {
            id: transaction.paymentMethod.id,
            code: transaction.paymentMethod.code,
            name: transaction.paymentMethod.name,
          }
        : undefined,
      description: transaction.description,
      status: transaction.status,
      journalEntryId: transaction.journalEntryId,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
```

**Step 2: Commit**

```bash
git add backend/src/modules/accounting/services/owner-equity.service.ts
git commit -m "feat(accounting): add OwnerEquityService with CRUD and posting"
```

---

## Task 6: Expense Service

**Files:**
- Create: `backend/src/modules/accounting/services/expense.service.ts`

**Step 1: Create the service**

```typescript
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Expense, ExpenseStatus } from '../../../database/entities/expense.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { ChartOfAccount, AccountType } from '../../../database/entities/chart-of-account.entity';
import { AccountingService } from './accounting.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  QueryExpenseDto,
  BulkExpenseDto,
  ExpenseResponseDto,
  ExpenseListResponseDto,
} from '../dto/expense.dto';

@Injectable()
export class ExpenseService {
  private readonly logger = new Logger(ExpenseService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    @InjectRepository(ChartOfAccount)
    private readonly chartOfAccountRepository: Repository<ChartOfAccount>,
    private readonly accountingService: AccountingService,
  ) {}

  async findAll(query: QueryExpenseDto): Promise<ExpenseListResponseDto> {
    const {
      page = 1,
      limit = 20,
      expenseAccountId,
      paymentMethodId,
      status,
      startDate,
      endDate,
      search,
      sortBy = 'expenseDate',
      sortOrder = 'DESC',
    } = query;

    const qb = this.expenseRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.paymentMethod', 'paymentMethod')
      .leftJoinAndSelect('e.expenseAccount', 'expenseAccount')
      .where('e.deletedAt IS NULL');

    if (expenseAccountId) {
      qb.andWhere('e.expenseAccountId = :expenseAccountId', { expenseAccountId });
    }

    if (paymentMethodId) {
      qb.andWhere('e.paymentMethodId = :paymentMethodId', { paymentMethodId });
    }

    if (status) {
      qb.andWhere('e.status = :status', { status });
    }

    if (startDate) {
      qb.andWhere('e.expenseDate >= :startDate', { startDate });
    }

    if (endDate) {
      qb.andWhere('e.expenseDate <= :endDate', { endDate });
    }

    if (search) {
      qb.andWhere(
        '(e.description ILIKE :search OR e.vendor ILIKE :search OR e.referenceNumber ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const allowedSortFields = ['expenseDate', 'createdAt', 'amount', 'vendor'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'expenseDate';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(`e.${safeSortBy}`, safeSortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      data: rows.map((row) => this.toResponseDto(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['paymentMethod', 'expenseAccount'],
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    return this.toResponseDto(expense);
  }

  async create(dto: CreateExpenseDto, userId = 'system'): Promise<ExpenseResponseDto> {
    // Validate payment method
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id: dto.paymentMethodId, isActive: true },
    });

    if (!paymentMethod || paymentMethod.deletedAt) {
      throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);
    }

    // Validate expense account exists and is of EXPENSE type
    const account = await this.chartOfAccountRepository.findOne({
      where: { id: dto.expenseAccountId, isActive: true },
    });

    if (!account || account.deletedAt) {
      throw new NotFoundException(`Account ${dto.expenseAccountId} not found`);
    }

    if (account.accountType !== AccountType.EXPENSE) {
      throw new BadRequestException(
        `Account ${account.code} (${account.name}) is not an expense account`,
      );
    }

    const expense = this.expenseRepository.create({
      expenseDate: new Date(dto.expenseDate),
      expenseAccountId: dto.expenseAccountId,
      amount: dto.amount,
      paymentMethodId: dto.paymentMethodId,
      description: dto.description,
      vendor: dto.vendor,
      status: ExpenseStatus.DRAFT,
    });

    const saved = await this.expenseRepository.save(expense);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateExpenseDto, userId = 'system'): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException('Cannot update a posted expense');
    }

    if (dto.paymentMethodId) {
      const paymentMethod = await this.paymentMethodRepository.findOne({
        where: { id: dto.paymentMethodId, isActive: true },
      });
      if (!paymentMethod || paymentMethod.deletedAt) {
        throw new NotFoundException(`Payment method ${dto.paymentMethodId} not found`);
      }
    }

    if (dto.expenseAccountId) {
      const account = await this.chartOfAccountRepository.findOne({
        where: { id: dto.expenseAccountId, isActive: true },
      });
      if (!account || account.deletedAt) {
        throw new NotFoundException(`Account ${dto.expenseAccountId} not found`);
      }
      if (account.accountType !== AccountType.EXPENSE) {
        throw new BadRequestException(
          `Account ${account.code} (${account.name}) is not an expense account`,
        );
      }
    }

    if (dto.expenseDate) expense.expenseDate = new Date(dto.expenseDate);
    if (dto.expenseAccountId) expense.expenseAccountId = dto.expenseAccountId;
    if (dto.amount !== undefined) expense.amount = dto.amount;
    if (dto.paymentMethodId) expense.paymentMethodId = dto.paymentMethodId;
    if (dto.description !== undefined) expense.description = dto.description;
    if (dto.vendor !== undefined) expense.vendor = dto.vendor;

    await this.expenseRepository.save(expense);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException('Cannot delete a posted expense');
    }

    await this.expenseRepository.softDelete(id);
  }

  async post(id: string, userId = 'system'): Promise<ExpenseResponseDto> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['paymentMethod', 'expenseAccount'],
    });

    if (!expense || expense.deletedAt) {
      throw new NotFoundException(`Expense ${id} not found`);
    }

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException('Expense is already posted');
    }

    try {
      const journalEntry = await this.accountingService.postExpenseEntry(
        expense,
        userId,
      );
      expense.status = ExpenseStatus.POSTED;
      expense.journalEntryId = journalEntry.id;
      await this.expenseRepository.save(expense);
    } catch (error) {
      this.logger.error(
        `Failed to post expense entry for ${expense.referenceNumber}: ${error.message}`,
      );
      throw error;
    }

    return this.findOne(id);
  }

  async bulkPost(dto: BulkExpenseDto, userId = 'system'): Promise<{ posted: number; failed: number }> {
    let posted = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.post(id, userId);
        posted++;
      } catch (error) {
        this.logger.error(`Failed to post expense ${id}: ${error.message}`);
        failed++;
      }
    }

    return { posted, failed };
  }

  async bulkDelete(dto: BulkExpenseDto): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;

    for (const id of dto.ids) {
      try {
        await this.remove(id);
        deleted++;
      } catch (error) {
        this.logger.error(`Failed to delete expense ${id}: ${error.message}`);
        failed++;
      }
    }

    return { deleted, failed };
  }

  private toResponseDto(expense: Expense): ExpenseResponseDto {
    return {
      id: expense.id,
      referenceNumber: expense.referenceNumber,
      expenseDate: expense.expenseDate,
      expenseAccountId: expense.expenseAccountId,
      expenseAccount: expense.expenseAccount
        ? {
            id: expense.expenseAccount.id,
            code: expense.expenseAccount.code,
            name: expense.expenseAccount.name,
          }
        : undefined,
      amount: Number(expense.amount),
      paymentMethodId: expense.paymentMethodId,
      paymentMethod: expense.paymentMethod
        ? {
            id: expense.paymentMethod.id,
            code: expense.paymentMethod.code,
            name: expense.paymentMethod.name,
          }
        : undefined,
      description: expense.description,
      vendor: expense.vendor,
      status: expense.status,
      journalEntryId: expense.journalEntryId,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }
}
```

**Step 2: Commit**

```bash
git add backend/src/modules/accounting/services/expense.service.ts
git commit -m "feat(accounting): add ExpenseService with CRUD and posting"
```

---

## Task 7: Add Auto-Posting Methods to AccountingService

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting.service.ts`

**Step 1: Add import for new entities at top of file (after existing imports around line 20)**

Add after the `Settlement` import:

```typescript
import { OwnerEquityTransaction, OwnerEquityTransactionType } from '../../../database/entities/owner-equity-transaction.entity';
import { Expense } from '../../../database/entities/expense.entity';
```

**Step 2: Add `postOwnerEquityEntry` method (after `postStockAdjustmentEntry` around line 519)**

```typescript
  /**
   * Post journal entry for owner equity transaction
   * Capital injection: DR Payment Method, CR Owner's Equity
   * Owner drawing: DR Drawings, CR Payment Method
   */
  async postOwnerEquityEntry(
    transaction: OwnerEquityTransaction,
    userId: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting owner equity entry for ${transaction.referenceNumber}`);

    const mappings = await this.accountMappingService.getMappings();

    const paymentMethodCode = transaction.paymentMethod?.code || 'CASH';
    const paymentMappingKey = `payment_${paymentMethodCode.toLowerCase()}`;

    this.validateMappingByKey(
      mappings,
      paymentMappingKey,
      `payment method "${paymentMethodCode}"`,
    );
    this.validateMappingByKey(mappings, 'equity_owners_equity', "Owner's Equity");
    this.validateMappingByKey(mappings, 'equity_drawings', 'Drawings');

    await this.validatePeriodOpen(transaction.transactionDate);

    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: transaction.transactionDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(
        `No fiscal period found for date ${transaction.transactionDate}`,
      );
    }

    const lines: CreateJournalEntryLineDto[] = [];

    if (transaction.type === OwnerEquityTransactionType.CAPITAL_INJECTION) {
      // Owner puts money in: DR Cash, CR Owner's Equity
      lines.push(
        {
          accountId: mappings[paymentMappingKey],
          debitAmount: Number(transaction.amount),
          creditAmount: 0,
          memo: 'Capital injection received',
        },
        {
          accountId: mappings['equity_owners_equity'],
          debitAmount: 0,
          creditAmount: Number(transaction.amount),
          memo: "Owner's equity increase",
        },
      );
    } else {
      // Owner draws money out: DR Drawings, CR Cash
      lines.push(
        {
          accountId: mappings['equity_drawings'],
          debitAmount: Number(transaction.amount),
          creditAmount: 0,
          memo: 'Owner drawing',
        },
        {
          accountId: mappings[paymentMappingKey],
          debitAmount: 0,
          creditAmount: Number(transaction.amount),
          memo: 'Cash paid for owner drawing',
        },
      );
    }

    const typeLabel = transaction.type === OwnerEquityTransactionType.CAPITAL_INJECTION
      ? 'Capital Injection'
      : 'Owner Drawing';

    const entry = await this.journalEntryService.create(
      {
        entryDate: new Date(transaction.transactionDate),
        description: `${typeLabel} ${transaction.referenceNumber}${transaction.description ? ' - ' + transaction.description : ''}`,
        fiscalPeriodId: periodValidation.period.id,
        sourceType: 'owner_equity_transaction',
        sourceId: transaction.id,
        lines,
      },
      userId,
    );

    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    this.logger.log(
      `Owner equity entry posted successfully: ${postedEntry.referenceNumber}`,
    );
    return postedEntry as any;
  }
```

**Step 3: Add `postExpenseEntry` method (after `postOwnerEquityEntry`)**

```typescript
  /**
   * Post journal entry for expense
   * DR Expense Account, CR Payment Method Account
   */
  async postExpenseEntry(
    expense: Expense,
    userId: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting expense entry for ${expense.referenceNumber}`);

    const mappings = await this.accountMappingService.getMappings();

    const paymentMethodCode = expense.paymentMethod?.code || 'CASH';
    const paymentMappingKey = `payment_${paymentMethodCode.toLowerCase()}`;

    this.validateMappingByKey(
      mappings,
      paymentMappingKey,
      `payment method "${paymentMethodCode}"`,
    );

    // Expense account is directly selected by user, no mapping needed
    // Just validate it exists
    if (!expense.expenseAccountId) {
      throw new BadRequestException('Expense account is required');
    }

    await this.validatePeriodOpen(expense.expenseDate);

    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: expense.expenseDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(
        `No fiscal period found for date ${expense.expenseDate}`,
      );
    }

    const accountName = expense.expenseAccount?.name || 'Expense';

    const lines: CreateJournalEntryLineDto[] = [
      // DR Expense Account
      {
        accountId: expense.expenseAccountId,
        debitAmount: Number(expense.amount),
        creditAmount: 0,
        memo: accountName,
      },
      // CR Payment Method Account
      {
        accountId: mappings[paymentMappingKey],
        debitAmount: 0,
        creditAmount: Number(expense.amount),
        memo: 'Payment for expense',
      },
    ];

    const description = `Expense ${expense.referenceNumber}${expense.vendor ? ' - ' + expense.vendor : ''}${expense.description ? ' - ' + expense.description : ''}`;

    const entry = await this.journalEntryService.create(
      {
        entryDate: new Date(expense.expenseDate),
        description,
        fiscalPeriodId: periodValidation.period.id,
        sourceType: 'expense',
        sourceId: expense.id,
        lines,
      },
      userId,
    );

    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    this.logger.log(
      `Expense entry posted successfully: ${postedEntry.referenceNumber}`,
    );
    return postedEntry as any;
  }
```

**Step 4: Commit**

```bash
git add backend/src/modules/accounting/services/accounting.service.ts
git commit -m "feat(accounting): add auto-posting methods for owner equity and expenses"
```

---

## Task 8: Owner Equity Controller

**Files:**
- Create: `backend/src/modules/accounting/controllers/owner-equity.controller.ts`

**Step 1: Create the controller**

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Auth } from '../../../common/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { OwnerEquityService } from '../services/owner-equity.service';
import {
  CreateOwnerEquityDto,
  UpdateOwnerEquityDto,
  QueryOwnerEquityDto,
  BulkOwnerEquityDto,
} from '../dto/owner-equity.dto';

@Controller('accounting/owner-equity')
@Auth()
export class OwnerEquityController {
  constructor(private readonly ownerEquityService: OwnerEquityService) {}

  @Get()
  findAll(@Query() query: QueryOwnerEquityDto) {
    return this.ownerEquityService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ownerEquityService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreateOwnerEquityDto) {
    return this.ownerEquityService.create(dto);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOwnerEquityDto,
  ) {
    return this.ownerEquityService.update(id, dto);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.ownerEquityService.remove(id);
  }

  @Post(':id/post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  post(@Param('id', ParseUUIDPipe) id: string) {
    return this.ownerEquityService.post(id);
  }

  @Post('bulk-post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  bulkPost(@Body() dto: BulkOwnerEquityDto) {
    return this.ownerEquityService.bulkPost(dto);
  }

  @Post('bulk-delete')
  @Auth(UserRole.ADMIN)
  bulkDelete(@Body() dto: BulkOwnerEquityDto) {
    return this.ownerEquityService.bulkDelete(dto);
  }
}
```

**Step 2: Commit**

```bash
git add backend/src/modules/accounting/controllers/owner-equity.controller.ts
git commit -m "feat(accounting): add OwnerEquityController with RBAC"
```

---

## Task 9: Expense Controller

**Files:**
- Create: `backend/src/modules/accounting/controllers/expense.controller.ts`

**Step 1: Create the controller**

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Auth } from '../../../common/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { ExpenseService } from '../services/expense.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  QueryExpenseDto,
  BulkExpenseDto,
} from '../dto/expense.dto';

@Controller('accounting/expenses')
@Auth()
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Get()
  findAll(@Query() query: QueryExpenseDto) {
    return this.expenseService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreateExpenseDto) {
    return this.expenseService.create(dto);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenseService.update(id, dto);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.remove(id);
  }

  @Post(':id/post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  post(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.post(id);
  }

  @Post('bulk-post')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  bulkPost(@Body() dto: BulkExpenseDto) {
    return this.expenseService.bulkPost(dto);
  }

  @Post('bulk-delete')
  @Auth(UserRole.ADMIN)
  bulkDelete(@Body() dto: BulkExpenseDto) {
    return this.expenseService.bulkDelete(dto);
  }
}
```

**Step 2: Commit**

```bash
git add backend/src/modules/accounting/controllers/expense.controller.ts
git commit -m "feat(accounting): add ExpenseController with RBAC"
```

---

## Task 10: Register New Entities and Services in Accounting Module

**Files:**
- Modify: `backend/src/modules/accounting/accounting.module.ts`

**Step 1: Add imports for new entities, services, and controllers**

At the top of the file, add imports:

```typescript
import { OwnerEquityTransaction } from '../../database/entities/owner-equity-transaction.entity';
import { Expense } from '../../database/entities/expense.entity';
import { OwnerEquityService } from './services/owner-equity.service';
import { ExpenseService } from './services/expense.service';
import { OwnerEquityController } from './controllers/owner-equity.controller';
import { ExpenseController } from './controllers/expense.controller';
```

**Step 2: Add entities to `TypeOrmModule.forFeature()`**

Add `OwnerEquityTransaction` and `Expense` to the entities array.

**Step 3: Add services to `providers` array**

Add `OwnerEquityService` and `ExpenseService`.

**Step 4: Add controllers to `controllers` array**

Add `OwnerEquityController` and `ExpenseController`.

**Step 5: Add services to `exports` array**

Add `OwnerEquityService` and `ExpenseService`.

**Step 6: Commit**

```bash
git add backend/src/modules/accounting/accounting.module.ts
git commit -m "feat(accounting): register owner equity and expense in accounting module"
```

---

## Task 11: Add Account Mapping Keys for Equity

**Files:**
- Modify: `backend/src/database/entities/account-mapping.entity.ts`

**Step 1: Add new mapping types to the MappingType enum**

Add after `INVENTORY_ADJUSTMENT_LOSS`:

```typescript
  EQUITY_OWNERS_EQUITY = 'equity_owners_equity',
  EQUITY_DRAWINGS = 'equity_drawings',
```

**Step 2: Commit**

```bash
git add backend/src/database/entities/account-mapping.entity.ts
git commit -m "feat(accounting): add equity mapping types to MappingType enum"
```

---

## Task 12: Update JournalEntriesPage Source Type Labels

**Files:**
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`

**Step 1: Add new entry type labels to `ENTRY_TYPE_LABELS` (around line 68-77)**

Add these entries:

```typescript
  owner_equity_transaction: 'Owner Equity',
  expense: 'Expense',
```

**Step 2: Add to the Entry Type filter dropdown (around line 432-443)**

Add these `<MenuItem>` entries:

```typescript
<MenuItem value="owner_equity_transaction">Owner Equity</MenuItem>
<MenuItem value="expense">Expense</MenuItem>
```

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/JournalEntriesPage.tsx
git commit -m "feat(accounting): add owner equity and expense labels to journal entries page"
```

---

## Task 13: Frontend Types

**Files:**
- Modify: `frontend/src/types/index.ts`

**Step 1: Add Owner Equity Transaction type (after Settlement interface)**

```typescript
export interface OwnerEquityTransaction {
  id: string;
  referenceNumber: string;
  transactionDate: string;
  type: 'capital_injection' | 'owner_drawing';
  amount: number;
  paymentMethodId: string;
  paymentMethod?: {
    id: string;
    code: string;
    name: string;
  };
  description?: string;
  status: 'draft' | 'posted';
  journalEntryId?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Add Expense type**

```typescript
export interface ExpenseRecord {
  id: string;
  referenceNumber: string;
  expenseDate: string;
  expenseAccountId: string;
  expenseAccount?: {
    id: string;
    code: string;
    name: string;
  };
  amount: number;
  paymentMethodId: string;
  paymentMethod?: {
    id: string;
    code: string;
    name: string;
  };
  description?: string;
  vendor?: string;
  status: 'draft' | 'posted';
  journalEntryId?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(accounting): add frontend types for owner equity and expenses"
```

---

## Task 14: Owner Equity API Service

**Files:**
- Create: `frontend/src/services/ownerEquityApi.ts`

**Step 1: Create API service**

```typescript
import { ApiService } from './api';
import type { OwnerEquityTransaction, PaginatedResponse } from '@/types';

const BASE_URL = '/accounting/owner-equity';

export const ownerEquityApi = {
  getAll: (params?: any): Promise<PaginatedResponse<OwnerEquityTransaction>> =>
    ApiService.get(BASE_URL, { params }),

  getById: (id: string): Promise<OwnerEquityTransaction> =>
    ApiService.get(`${BASE_URL}/${id}`),

  create: (data: {
    transactionDate: string;
    type: string;
    amount: number;
    paymentMethodId: string;
    description?: string;
  }): Promise<OwnerEquityTransaction> =>
    ApiService.post(BASE_URL, data),

  update: (id: string, data: {
    transactionDate?: string;
    type?: string;
    amount?: number;
    paymentMethodId?: string;
    description?: string;
  }): Promise<OwnerEquityTransaction> =>
    ApiService.patch(`${BASE_URL}/${id}`, data),

  delete: (id: string): Promise<void> =>
    ApiService.delete(`${BASE_URL}/${id}`),

  post: (id: string): Promise<OwnerEquityTransaction> =>
    ApiService.post(`${BASE_URL}/${id}/post`),

  bulkPost: (ids: string[]): Promise<{ posted: number; failed: number }> =>
    ApiService.post(`${BASE_URL}/bulk-post`, { ids }),

  bulkDelete: (ids: string[]): Promise<{ deleted: number; failed: number }> =>
    ApiService.post(`${BASE_URL}/bulk-delete`, { ids }),
};
```

**Step 2: Commit**

```bash
git add frontend/src/services/ownerEquityApi.ts
git commit -m "feat(accounting): add owner equity API service"
```

---

## Task 15: Expense API Service

**Files:**
- Create: `frontend/src/services/expenseApi.ts`

**Step 1: Create API service**

```typescript
import { ApiService } from './api';
import type { ExpenseRecord, PaginatedResponse } from '@/types';

const BASE_URL = '/accounting/expenses';

export const expenseApi = {
  getAll: (params?: any): Promise<PaginatedResponse<ExpenseRecord>> =>
    ApiService.get(BASE_URL, { params }),

  getById: (id: string): Promise<ExpenseRecord> =>
    ApiService.get(`${BASE_URL}/${id}`),

  create: (data: {
    expenseDate: string;
    expenseAccountId: string;
    amount: number;
    paymentMethodId: string;
    description?: string;
    vendor?: string;
  }): Promise<ExpenseRecord> =>
    ApiService.post(BASE_URL, data),

  update: (id: string, data: {
    expenseDate?: string;
    expenseAccountId?: string;
    amount?: number;
    paymentMethodId?: string;
    description?: string;
    vendor?: string;
  }): Promise<ExpenseRecord> =>
    ApiService.patch(`${BASE_URL}/${id}`, data),

  delete: (id: string): Promise<void> =>
    ApiService.delete(`${BASE_URL}/${id}`),

  post: (id: string): Promise<ExpenseRecord> =>
    ApiService.post(`${BASE_URL}/${id}/post`),

  bulkPost: (ids: string[]): Promise<{ posted: number; failed: number }> =>
    ApiService.post(`${BASE_URL}/bulk-post`, { ids }),

  bulkDelete: (ids: string[]): Promise<{ deleted: number; failed: number }> =>
    ApiService.post(`${BASE_URL}/bulk-delete`, { ids }),
};
```

**Step 2: Commit**

```bash
git add frontend/src/services/expenseApi.ts
git commit -m "feat(accounting): add expense API service"
```

---

## Task 16: Owner Equity Redux Slice

**Files:**
- Create: `frontend/src/store/slices/ownerEquitySlice.ts`

**Step 1: Create the Redux slice**

Follow the exact pattern from `settlementsSlice.ts`. Include:
- State: `data: OwnerEquityTransaction[]`, `loading`, `error`, `pagination`
- Async thunks: `fetchOwnerEquity`, `createOwnerEquity`, `updateOwnerEquity`, `deleteOwnerEquity`, `postOwnerEquity`, `bulkPostOwnerEquity`, `bulkDeleteOwnerEquity`
- Selectors: `selectOwnerEquity`, `selectOwnerEquityLoading`, `selectOwnerEquityError`, `selectOwnerEquityPagination`
- All thunks use `rejectWithValue` error handling
- Import from `ownerEquityApi`

**Step 2: Register slice in store**

Modify `frontend/src/store/index.ts` (or wherever the store is configured) to add the new reducer.

**Step 3: Commit**

```bash
git add frontend/src/store/slices/ownerEquitySlice.ts frontend/src/store/index.ts
git commit -m "feat(accounting): add owner equity Redux slice"
```

---

## Task 17: Expense Redux Slice

**Files:**
- Create: `frontend/src/store/slices/expenseSlice.ts`

**Step 1: Create the Redux slice**

Same pattern as owner equity slice but with expense-specific fields:
- State: `data: ExpenseRecord[]`, `loading`, `error`, `pagination`
- Async thunks: `fetchExpenses`, `createExpense`, `updateExpense`, `deleteExpense`, `postExpense`, `bulkPostExpenses`, `bulkDeleteExpenses`
- Selectors: `selectExpenses`, `selectExpensesLoading`, `selectExpensesError`, `selectExpensesPagination`
- Import from `expenseApi`

**Step 2: Register slice in store**

Add the new reducer to the store configuration.

**Step 3: Commit**

```bash
git add frontend/src/store/slices/expenseSlice.ts frontend/src/store/index.ts
git commit -m "feat(accounting): add expense Redux slice"
```

---

## Task 18: Owner Equity Page

**Files:**
- Create: `frontend/src/pages/accounting/OwnerEquityPage.tsx`

**Step 1: Create the page component**

Follow the `SettlementsPage.tsx` pattern. The page should include:

- **Header**: Title "Owner's Equity Transactions" with "New Transaction" button
- **Filters**: Type dropdown (Capital Injection / Owner Drawing), Status dropdown (Draft / Posted), Date range
- **Table columns**: Reference #, Date, Type, Amount, Payment Method, Description, Status, Actions
- **Type display**: Show "Capital Injection" or "Owner Drawing" with appropriate color chips
- **Status chips**: Draft (default color), Posted (success color)
- **Actions**:
  - Edit button (draft only, opens form dialog)
  - Post button (draft only, confirms and posts)
  - Delete button (draft only, confirms and deletes)
- **Bulk operations**: Checkbox selection with bulk post and bulk delete buttons
- **Keyboard shortcuts**: Ctrl+F (focus search), N or + (new), Ctrl+R (refresh), Escape (cancel)
- **Create/Edit dialog**: Inline dialog with fields: Type (radio/select), Date, Amount, Payment Method dropdown, Description

Use `useAppDispatch`/`useAppSelector`, dispatch `fetchOwnerEquity` on mount and filter changes.

**Step 2: Commit**

```bash
git add frontend/src/pages/accounting/OwnerEquityPage.tsx
git commit -m "feat(accounting): add OwnerEquityPage with CRUD and bulk operations"
```

---

## Task 19: Expense Page

**Files:**
- Create: `frontend/src/pages/accounting/ExpensesPage.tsx`

**Step 1: Create the page component**

Follow the same pattern as OwnerEquityPage with these differences:

- **Header**: Title "Expenses" with "New Expense" button
- **Summary cards at top**: Total expenses for current filter period
- **Filters**: Expense Account dropdown (EXPENSE type COA accounts only), Payment Method dropdown, Status dropdown, Date range, Search box
- **Table columns**: Reference #, Date, Expense Account, Amount, Payment Method, Vendor, Description, Status, Actions
- **Actions**: Edit, Post, Delete (all draft only)
- **Bulk operations**: Bulk post and bulk delete
- **Keyboard shortcuts**: Same as owner equity page
- **Create/Edit dialog**: Date, Expense Account (dropdown fetched from COA filtered to EXPENSE type), Amount, Payment Method, Vendor (optional text), Description

For the expense account dropdown, fetch chart of accounts filtered by `accountType=EXPENSE` using the existing `accountingApi.chartOfAccounts.getAll()` method.

**Step 2: Commit**

```bash
git add frontend/src/pages/accounting/ExpensesPage.tsx
git commit -m "feat(accounting): add ExpensesPage with CRUD, bulk operations, and summary"
```

---

## Task 20: Add Routes and Sidebar Navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/common/Sidebar.tsx`

**Step 1: Add imports and routes in App.tsx**

Add lazy imports at the top of App.tsx (near other accounting page imports):

```typescript
import OwnerEquityPage from './pages/accounting/OwnerEquityPage';
import ExpensesPage from './pages/accounting/ExpensesPage';
```

Add routes in the accounting routes section (after the settlements route):

```typescript
<Route path="/accounting/owner-equity" element={<OwnerEquityPage />} />
<Route path="/accounting/expenses" element={<ExpensesPage />} />
```

**Step 2: Add sidebar menu items in Sidebar.tsx**

In the accounting children array (after the Settlements item, before Bank Reconciliation):

```typescript
{
  id: 'owner-equity',
  label: "Owner's Equity",
  icon: AccountBalanceWallet,  // import from @mui/icons-material
  path: '/accounting/owner-equity',
},
{
  id: 'expenses',
  label: 'Expenses',
  icon: Receipt,  // import from @mui/icons-material
  path: '/accounting/expenses',
},
```

**Step 3: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/common/Sidebar.tsx
git commit -m "feat(accounting): add routes and sidebar navigation for owner equity and expenses"
```

---

## Task 21: Backend Unit Tests for Owner Equity Service

**Files:**
- Create: `backend/src/modules/accounting/services/owner-equity.service.spec.ts`

**Step 1: Write unit tests**

Follow the pattern from `settlement.service.spec.ts`. Test:
- `findAll()` returns paginated results
- `findOne()` returns a single transaction
- `findOne()` throws NotFoundException for missing id
- `create()` creates a draft transaction
- `create()` throws NotFoundException for invalid payment method
- `update()` updates a draft transaction
- `update()` throws BadRequestException for posted transaction
- `remove()` soft-deletes a draft transaction
- `remove()` throws BadRequestException for posted transaction
- `post()` calls `accountingService.postOwnerEquityEntry()` and updates status to POSTED
- `post()` throws BadRequestException if already posted
- `bulkPost()` posts multiple transactions and returns count
- `bulkDelete()` deletes multiple transactions and returns count

Mock repositories: `OwnerEquityTransaction`, `PaymentMethodEntity`
Mock service: `AccountingService`

**Step 2: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern=owner-equity.service.spec --verbose`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/services/owner-equity.service.spec.ts
git commit -m "test(accounting): add owner equity service unit tests"
```

---

## Task 22: Backend Unit Tests for Expense Service

**Files:**
- Create: `backend/src/modules/accounting/services/expense.service.spec.ts`

**Step 1: Write unit tests**

Same pattern. Test:
- `findAll()` returns paginated results with filters
- `findOne()` returns a single expense with relations
- `findOne()` throws NotFoundException for missing id
- `create()` creates a draft expense
- `create()` throws NotFoundException for invalid payment method
- `create()` throws BadRequestException for non-expense account type
- `update()` updates a draft expense
- `update()` throws BadRequestException for posted expense
- `remove()` soft-deletes a draft expense
- `remove()` throws BadRequestException for posted expense
- `post()` calls `accountingService.postExpenseEntry()` and updates status to POSTED
- `post()` throws BadRequestException if already posted
- `bulkPost()` and `bulkDelete()` work correctly

Mock repositories: `Expense`, `PaymentMethodEntity`, `ChartOfAccount`
Mock service: `AccountingService`

**Step 2: Run tests**

Run: `cd backend && npx jest --testPathPattern=expense.service.spec --verbose`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/services/expense.service.spec.ts
git commit -m "test(accounting): add expense service unit tests"
```

---

## Task 23: Frontend Tests

**Files:**
- Create: `frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx`
- Create: `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx`

**Step 1: Write OwnerEquityPage test**

Follow existing accounting page test patterns. Test:
- Renders the page title
- Shows loading state
- Displays transaction data in table
- Shows filter controls

**Step 2: Write ExpensesPage test**

Same pattern. Test:
- Renders the page title
- Shows loading state
- Displays expense data in table
- Shows filter controls

**Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run --reporter=verbose src/pages/accounting/__tests__/OwnerEquityPage.test.tsx src/pages/accounting/__tests__/ExpensesPage.test.tsx`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx
git commit -m "test(accounting): add frontend tests for owner equity and expenses pages"
```

---

## Task 24: Final Verification and Build Check

**Step 1: Run all backend tests**

Run: `cd backend && npm run test -- --verbose 2>&1 | tail -30`
Expected: All tests PASS including new ones

**Step 2: Run frontend type check**

Run: `cd frontend && npm run type-check`
Expected: No type errors

**Step 3: Run all frontend tests**

Run: `cd frontend && npm run test -- --run`
Expected: All tests PASS

**Step 4: Build backend**

Run: `cd backend && npm run build 2>&1 | tail -10`
Expected: Build succeeds

**Step 5: Commit any remaining fixes**

If any tests fail, fix them and commit.

---

## Summary of All Files

### New Files (14)
- `backend/src/database/entities/owner-equity-transaction.entity.ts`
- `backend/src/database/entities/expense.entity.ts`
- `backend/src/modules/accounting/dto/owner-equity.dto.ts`
- `backend/src/modules/accounting/dto/expense.dto.ts`
- `backend/src/modules/accounting/services/owner-equity.service.ts`
- `backend/src/modules/accounting/services/expense.service.ts`
- `backend/src/modules/accounting/controllers/owner-equity.controller.ts`
- `backend/src/modules/accounting/controllers/expense.controller.ts`
- `backend/src/modules/accounting/services/owner-equity.service.spec.ts`
- `backend/src/modules/accounting/services/expense.service.spec.ts`
- `frontend/src/services/ownerEquityApi.ts`
- `frontend/src/services/expenseApi.ts`
- `frontend/src/store/slices/ownerEquitySlice.ts`
- `frontend/src/store/slices/expenseSlice.ts`
- `frontend/src/pages/accounting/OwnerEquityPage.tsx`
- `frontend/src/pages/accounting/ExpensesPage.tsx`
- `frontend/src/pages/accounting/__tests__/OwnerEquityPage.test.tsx`
- `frontend/src/pages/accounting/__tests__/ExpensesPage.test.tsx`

### Modified Files (5)
- `backend/src/modules/accounting/accounting.module.ts` -- register new entities/services/controllers
- `backend/src/modules/accounting/services/accounting.service.ts` -- add 2 auto-posting methods
- `backend/src/database/entities/account-mapping.entity.ts` -- add equity mapping types
- `frontend/src/types/index.ts` -- add TypeScript interfaces
- `frontend/src/pages/accounting/JournalEntriesPage.tsx` -- add source type labels
- `frontend/src/App.tsx` -- add routes
- `frontend/src/components/common/Sidebar.tsx` -- add navigation items
- `frontend/src/store/index.ts` -- register new Redux slices
