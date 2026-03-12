# Payment Methods & Third-Party Settlement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable payment methods with third-party settlement tracking, so payments via platforms like TnG, Shopee, and Atome are properly tracked from receipt through bank settlement.

**Architecture:** New `PaymentMethod` and `Settlement` entities. Payment entity modified with `paymentMethodId` FK and `settlementStatus`. Account mappings auto-generated per payment method. Two-step accounting: payment debits method-specific account, settlement moves to bank.

**Tech Stack:** NestJS 11 + TypeORM (PostgreSQL), React 18 + MUI v7 + Redux Toolkit, Jest/Vitest

**Design Doc:** `docs/plans/completed/2026-02-14-payment-methods-settlement-design.md`

---

## Task 1: PaymentMethod Entity

**Files:**
- Create: `backend/src/database/entities/payment-method.entity.ts`
- Modify: `backend/src/database/entities/index.ts`

**Step 1: Create the PaymentMethod entity**

```typescript
// backend/src/database/entities/payment-method.entity.ts
import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  MaxLength,
} from 'class-validator';
import { BaseEntity } from './base.entity';

@Entity('payment_methods')
@Index(['code'], { unique: true })
@Index(['isActive'])
export class PaymentMethodEntity extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: 'Unique code e.g. CASH, TNG, SHOPEE',
  })
  @IsString()
  @MaxLength(20)
  code: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: 'Display name e.g. Touch n Go, Shopee',
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether this method requires third-party settlement',
  })
  @IsBoolean()
  requiresSettlement: boolean;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Display order in dropdowns',
  })
  @IsInt()
  sortOrder: number;
}
```

**Step 2: Register in entity index**

In `backend/src/database/entities/index.ts`, add:
- Export: `export { PaymentMethodEntity } from './payment-method.entity';`
- Import for ACTIVE_ENTITIES array: `import { PaymentMethodEntity } from './payment-method.entity';`
- Add `PaymentMethodEntity` to `ACTIVE_ENTITIES` array (in a "// Payment Methods" section)

**Step 3: Commit**

```bash
git add backend/src/database/entities/payment-method.entity.ts backend/src/database/entities/index.ts
git commit -m "feat: add PaymentMethod entity"
```

---

## Task 2: Settlement Entity

**Files:**
- Create: `backend/src/database/entities/settlement.entity.ts`
- Modify: `backend/src/database/entities/index.ts`

**Step 1: Create the Settlement entity**

```typescript
// backend/src/database/entities/settlement.entity.ts
import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
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

export enum SettlementStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('settlements')
@Index(['settlementNumber'], { unique: true })
@Index(['paymentMethodId'])
@Index(['status'])
@Index(['settlementDate'])
export class Settlement extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 30,
    unique: true,
    comment: 'Unique settlement reference number',
  })
  @IsString()
  @MaxLength(30)
  settlementNumber: string;

  @Column({
    type: 'uuid',
    comment: 'Payment method ID',
  })
  paymentMethodId: string;

  @Column({
    type: 'date',
    comment: 'Date money arrived in bank',
  })
  @IsDate()
  settlementDate: Date;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Total settled amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  totalAmount: number;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Bank reference number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.COMPLETED,
    comment: 'Settlement status',
  })
  @IsEnum(SettlementStatus)
  status: SettlementStatus;

  // Relationships
  @ManyToOne(() => PaymentMethodEntity, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethodEntity;

  // Hooks
  @BeforeInsert()
  generateSettlementNumber() {
    if (!this.settlementNumber) {
      const timestamp = Date.now().toString(36).toUpperCase();
      this.settlementNumber = `STL-${timestamp}`;
    }
  }
}
```

**Step 2: Register in entity index**

In `backend/src/database/entities/index.ts`:
- Export: `export { Settlement, SettlementStatus } from './settlement.entity';`
- Import and add `Settlement` to ACTIVE_ENTITIES

**Step 3: Commit**

```bash
git add backend/src/database/entities/settlement.entity.ts backend/src/database/entities/index.ts
git commit -m "feat: add Settlement entity"
```

---

## Task 3: Modify Payment Entity

**Files:**
- Modify: `backend/src/database/entities/payment.entity.ts`

**Step 1: Add SettlementStatus enum and new fields**

Add new enum after existing enums:
```typescript
export enum SettlementStatusEnum {
  NOT_APPLICABLE = 'not_applicable',
  PENDING = 'pending',
  SETTLED = 'settled',
}
```

Add new columns after `paymentMethod` column:
```typescript
  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Payment method entity ID',
  })
  @IsOptional()
  paymentMethodId?: string;

  @Column({
    type: 'enum',
    enum: SettlementStatusEnum,
    default: SettlementStatusEnum.NOT_APPLICABLE,
    comment: 'Settlement status for third-party payments',
  })
  @IsEnum(SettlementStatusEnum)
  settlementStatus: SettlementStatusEnum;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Settlement ID when payment is settled',
  })
  @IsOptional()
  settlementId?: string;
```

Add relationships (import PaymentMethodEntity and Settlement):
```typescript
  @ManyToOne(() => PaymentMethodEntity, {
    onDelete: 'RESTRICT',
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethodEntity?: PaymentMethodEntity;

  @ManyToOne(() => Settlement, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: false,
  })
  @JoinColumn({ name: 'settlementId' })
  settlement?: Settlement;
```

Add indexes for the new FK columns:
```typescript
@Index(['paymentMethodId'])
@Index(['settlementId'])
@Index(['settlementStatus'])
```

**Important:** Keep the old `paymentMethod` enum column for now. We'll remove it in the migration task after data is migrated.

**Step 2: Commit**

```bash
git add backend/src/database/entities/payment.entity.ts
git commit -m "feat: add paymentMethodId, settlementStatus, settlementId to Payment entity"
```

---

## Task 4: Database Migration

**Files:**
- Create: `backend/src/database/migrations/1771100000000-AddPaymentMethodsAndSettlements.ts`

**Step 1: Create migration file**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodsAndSettlements1771100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create settlement_status enum type
    await queryRunner.query(`
      CREATE TYPE "settlement_status_enum" AS ENUM ('not_applicable', 'pending', 'settled')
    `);

    // 2. Create settlement_status_settlement enum type
    await queryRunner.query(`
      CREATE TYPE "settlement_status_entity_enum" AS ENUM ('pending', 'completed', 'cancelled')
    `);

    // 3. Create payment_methods table
    await queryRunner.query(`
      CREATE TABLE "payment_methods" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" varchar(20) NOT NULL,
        "name" varchar(100) NOT NULL,
        "requiresSettlement" boolean NOT NULL DEFAULT false,
        "sortOrder" int NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_payment_methods" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_methods_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_payment_methods_code" ON "payment_methods" ("code")`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_methods_isActive" ON "payment_methods" ("isActive")`);

    // 4. Create settlements table
    await queryRunner.query(`
      CREATE TABLE "settlements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "settlementNumber" varchar(30) NOT NULL,
        "paymentMethodId" uuid NOT NULL,
        "settlementDate" date NOT NULL,
        "totalAmount" decimal(15,4) NOT NULL,
        "reference" varchar(100),
        "notes" text,
        "status" "settlement_status_entity_enum" NOT NULL DEFAULT 'completed',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_settlements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_settlements_number" UNIQUE ("settlementNumber"),
        CONSTRAINT "FK_settlements_paymentMethod" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_settlements_number" ON "settlements" ("settlementNumber")`);
    await queryRunner.query(`CREATE INDEX "IDX_settlements_paymentMethodId" ON "settlements" ("paymentMethodId")`);
    await queryRunner.query(`CREATE INDEX "IDX_settlements_status" ON "settlements" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_settlements_date" ON "settlements" ("settlementDate")`);

    // 5. Add new columns to payments table
    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD COLUMN "paymentMethodId" uuid,
      ADD COLUMN "settlementStatus" "settlement_status_enum" NOT NULL DEFAULT 'not_applicable',
      ADD COLUMN "settlementId" uuid
    `);

    await queryRunner.query(`CREATE INDEX "IDX_payments_paymentMethodId" ON "payments" ("paymentMethodId")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_settlementId" ON "payments" ("settlementId")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_settlementStatus" ON "payments" ("settlementStatus")`);

    await queryRunner.query(`
      ALTER TABLE "payments"
      ADD CONSTRAINT "FK_payments_paymentMethod" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT,
      ADD CONSTRAINT "FK_payments_settlement" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE SET NULL
    `);

    // 6. Seed default payment methods
    await queryRunner.query(`
      INSERT INTO "payment_methods" ("code", "name", "requiresSettlement", "sortOrder") VALUES
      ('CASH', 'Cash', false, 1),
      ('BANK', 'Bank Transfer', false, 2),
      ('TNG', 'Touch n Go', true, 3),
      ('CC', 'Credit Card', true, 4),
      ('ATOME', 'Atome', true, 5),
      ('SHOPEE', 'Shopee', true, 6),
      ('TIKTOK', 'TikTok', true, 7)
    `);

    // 7. Migrate existing payments to use Cash payment method
    await queryRunner.query(`
      UPDATE "payments"
      SET "paymentMethodId" = (SELECT id FROM "payment_methods" WHERE code = 'CASH'),
          "settlementStatus" = 'not_applicable'
      WHERE "paymentMethodId" IS NULL
    `);

    // 8. Make paymentMethodId NOT NULL after migration
    await queryRunner.query(`
      ALTER TABLE "payments" ALTER COLUMN "paymentMethodId" SET NOT NULL
    `);

    // 9. Drop old paymentMethod enum column
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "paymentMethod"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payments_paymentmethod_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore old paymentMethod enum column
    await queryRunner.query(`CREATE TYPE "payments_paymentmethod_enum" AS ENUM ('cash')`);
    await queryRunner.query(`
      ALTER TABLE "payments" ADD COLUMN "paymentMethod" "payments_paymentmethod_enum" NOT NULL DEFAULT 'cash'
    `);

    // Drop new columns from payments
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_settlement"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_paymentMethod"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_settlementStatus"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_settlementId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payments_paymentMethodId"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "settlementId"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "settlementStatus"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "paymentMethodId"`);

    // Drop settlements table
    await queryRunner.query(`DROP TABLE IF EXISTS "settlements"`);

    // Drop payment_methods table
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_methods"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "settlement_status_entity_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "settlement_status_enum"`);
  }
}
```

**Step 2: Commit**

```bash
git add backend/src/database/migrations/1771100000000-AddPaymentMethodsAndSettlements.ts
git commit -m "feat: add migration for payment methods and settlements"
```

---

## Task 5: Payment Method Module - Backend (DTOs, Service, Controller)

**Files:**
- Create: `backend/src/modules/settings/dto/payment-method.dto.ts`
- Create: `backend/src/modules/settings/services/payment-method.service.ts`
- Create: `backend/src/modules/settings/services/payment-method.service.spec.ts`
- Create: `backend/src/modules/settings/controllers/payment-method.controller.ts`
- Modify: `backend/src/modules/settings/settings.module.ts`

**Step 1: Create DTOs**

```typescript
// backend/src/modules/settings/dto/payment-method.dto.ts
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsInt,
  MaxLength,
  Min,
  Max,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentMethodDto {
  @ApiProperty({ description: 'Unique code', example: 'TNG' })
  @IsString()
  @MaxLength(20)
  code: string;

  @ApiProperty({ description: 'Display name', example: 'Touch n Go' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Whether this method requires third-party settlement', default: false })
  @IsBoolean()
  requiresSettlement: boolean;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdatePaymentMethodDto extends PartialType(CreatePaymentMethodDto) {
  @ApiPropertyOptional({ description: 'Whether the method is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryPaymentMethodsDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by requiresSettlement' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresSettlement?: boolean;
}

export class PaymentMethodResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() requiresSettlement: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class PaymentMethodListResponseDto {
  @ApiProperty({ type: [PaymentMethodResponseDto] })
  data: PaymentMethodResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**Step 2: Create Service**

```typescript
// backend/src/modules/settings/services/payment-method.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AccountMapping } from '../../../database/entities/account-mapping.entity';
import { ChartOfAccount, AccountType } from '../../../database/entities/chart-of-account.entity';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
  QueryPaymentMethodsDto,
  PaymentMethodResponseDto,
  PaymentMethodListResponseDto,
} from '../dto/payment-method.dto';

@Injectable()
export class PaymentMethodService {
  private readonly logger = new Logger(PaymentMethodService.name);

  constructor(
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    @InjectRepository(AccountMapping)
    private readonly accountMappingRepository: Repository<AccountMapping>,
    @InjectRepository(ChartOfAccount)
    private readonly accountRepository: Repository<ChartOfAccount>,
  ) {}

  async findAll(query: QueryPaymentMethodsDto): Promise<PaymentMethodListResponseDto> {
    const { page = 1, limit = 50, isActive, requiresSettlement } = query;

    const qb = this.paymentMethodRepository
      .createQueryBuilder('pm')
      .where('pm.deletedAt IS NULL');

    if (isActive !== undefined) {
      qb.andWhere('pm.isActive = :isActive', { isActive });
    }
    if (requiresSettlement !== undefined) {
      qb.andWhere('pm.requiresSettlement = :requiresSettlement', { requiresSettlement });
    }

    qb.orderBy('pm.sortOrder', 'ASC').addOrderBy('pm.name', 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((pm) => this.toResponseDto(pm)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<PaymentMethodResponseDto> {
    const pm = await this.paymentMethodRepository.findOne({
      where: { id, deletedAt: null as any },
    });
    if (!pm) throw new NotFoundException(`Payment method ${id} not found`);
    return this.toResponseDto(pm);
  }

  async findByCode(code: string): Promise<PaymentMethodEntity | null> {
    return this.paymentMethodRepository.findOne({
      where: { code, deletedAt: null as any },
    });
  }

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    const code = dto.code.toUpperCase().trim();

    // Check for duplicate code
    const existing = await this.paymentMethodRepository.findOne({
      where: { code, deletedAt: null as any },
    });
    if (existing) {
      throw new ConflictException(`Payment method with code "${code}" already exists`);
    }

    const pm = this.paymentMethodRepository.create({
      ...dto,
      code,
    });
    const saved = await this.paymentMethodRepository.save(pm);

    // Auto-create account mappings
    await this.createAccountMappings(saved);

    this.logger.log(`Created payment method: ${saved.code} - ${saved.name}`);
    return this.toResponseDto(saved);
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    const pm = await this.paymentMethodRepository.findOne({
      where: { id, deletedAt: null as any },
    });
    if (!pm) throw new NotFoundException(`Payment method ${id} not found`);

    if (dto.code) dto.code = dto.code.toUpperCase().trim();

    Object.assign(pm, dto);
    const saved = await this.paymentMethodRepository.save(pm);

    return this.toResponseDto(saved);
  }

  async remove(id: string): Promise<void> {
    const pm = await this.paymentMethodRepository.findOne({
      where: { id, deletedAt: null as any },
    });
    if (!pm) throw new NotFoundException(`Payment method ${id} not found`);
    await this.paymentMethodRepository.softDelete(id);
  }

  /**
   * Auto-create account mapping entries for a payment method.
   * Creates PAYMENT_{CODE} and optionally PAYMENT_{CODE}_SETTLEMENT.
   * Does NOT fail if accounts don't exist yet - mappings are created without accountId.
   */
  private async createAccountMappings(pm: PaymentMethodEntity): Promise<void> {
    const mappingKey = `payment_${pm.code.toLowerCase()}`;

    // Check if mapping already exists
    const existingMapping = await this.accountMappingRepository.findOne({
      where: { mappingType: mappingKey },
    });

    if (!existingMapping) {
      // Try to find a matching account
      const account = await this.findMatchingAccount(pm);

      const mapping = this.accountMappingRepository.create({
        mappingType: mappingKey,
        accountId: account?.id || null,
        description: `${pm.name} payment received account`,
        isActive: true,
      });
      await this.accountMappingRepository.save(mapping);
    }

    if (pm.requiresSettlement) {
      const settlementKey = `payment_${pm.code.toLowerCase()}_settlement`;
      const existingSettlement = await this.accountMappingRepository.findOne({
        where: { mappingType: settlementKey },
      });

      if (!existingSettlement) {
        // Settlement goes to bank account
        const bankAccount = await this.accountRepository.findOne({
          where: { code: '1100', isActive: true, deletedAt: null as any },
        });

        const mapping = this.accountMappingRepository.create({
          mappingType: settlementKey,
          accountId: bankAccount?.id || null,
          description: `${pm.name} settlement to bank account`,
          isActive: true,
        });
        await this.accountMappingRepository.save(mapping);
      }
    }
  }

  /**
   * Try to find a matching GL account for a payment method.
   * Looks for accounts by code pattern (e.g., 1000 for Cash, 1100 for Bank).
   */
  private async findMatchingAccount(pm: PaymentMethodEntity): Promise<ChartOfAccount | null> {
    // Map known codes to account codes
    const accountCodeMap: Record<string, string> = {
      'CASH': '1000',
      'BANK': '1100',
    };

    const accountCode = accountCodeMap[pm.code];
    if (accountCode) {
      return this.accountRepository.findOne({
        where: { code: accountCode, isActive: true, deletedAt: null as any },
      });
    }

    // For third-party methods, no default account - user must configure
    return null;
  }

  /**
   * Get all active payment methods as a simple list (for dropdowns).
   */
  async getActiveList(): Promise<PaymentMethodResponseDto[]> {
    const methods = await this.paymentMethodRepository.find({
      where: { isActive: true, deletedAt: null as any },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return methods.map((pm) => this.toResponseDto(pm));
  }

  private toResponseDto(pm: PaymentMethodEntity): PaymentMethodResponseDto {
    return {
      id: pm.id,
      code: pm.code,
      name: pm.name,
      requiresSettlement: pm.requiresSettlement,
      sortOrder: pm.sortOrder,
      isActive: pm.isActive,
      createdAt: pm.createdAt,
      updatedAt: pm.updatedAt,
    };
  }
}
```

**Step 3: Create Controller**

```typescript
// backend/src/modules/settings/controllers/payment-method.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Auth } from '../../../common/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
import { PaymentMethodService } from '../services/payment-method.service';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
  QueryPaymentMethodsDto,
  PaymentMethodResponseDto,
  PaymentMethodListResponseDto,
} from '../dto/payment-method.dto';

@ApiTags('Payment Methods')
@Controller('settings/payment-methods')
@Auth()
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Get()
  @ApiOperation({ summary: 'Get all payment methods' })
  @ApiResponse({ status: 200, type: PaymentMethodListResponseDto })
  async findAll(@Query() query: QueryPaymentMethodsDto): Promise<PaymentMethodListResponseDto> {
    return this.paymentMethodService.findAll(query);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get all active payment methods (for dropdowns)' })
  @ApiResponse({ status: 200, type: [PaymentMethodResponseDto] })
  async getActiveList(): Promise<PaymentMethodResponseDto[]> {
    return this.paymentMethodService.getActiveList();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment method by ID' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  @ApiResponse({ status: 200, type: PaymentMethodResponseDto })
  async findOne(@Param('id') id: string): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.findOne(id);
  }

  @Post()
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new payment method' })
  @ApiResponse({ status: 201, type: PaymentMethodResponseDto })
  async create(@Body() dto: CreatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.create(dto);
  }

  @Patch(':id')
  @Auth(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update a payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  @ApiResponse({ status: 200, type: PaymentMethodResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodResponseDto> {
    return this.paymentMethodService.update(id, dto);
  }

  @Delete(':id')
  @Auth(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a payment method' })
  @ApiParam({ name: 'id', description: 'Payment method ID' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.paymentMethodService.remove(id);
  }
}
```

**Step 4: Register in settings module**

In `backend/src/modules/settings/settings.module.ts`:
- Add `PaymentMethodEntity` to `TypeOrmModule.forFeature([...])`
- Add `AccountMapping` and `ChartOfAccount` to imports (for auto-creating mappings)
- Add `PaymentMethodController` to controllers
- Add `PaymentMethodService` to providers and exports

**Step 5: Write tests**

Create `backend/src/modules/settings/services/payment-method.service.spec.ts` with tests for:
- `findAll` - returns paginated results, filters by isActive and requiresSettlement
- `findOne` - returns single method, throws NotFoundException
- `create` - creates method, auto-creates account mappings, rejects duplicate codes
- `update` - updates fields, throws NotFoundException
- `remove` - soft deletes, throws NotFoundException
- `getActiveList` - returns only active methods sorted by sortOrder

**Step 6: Run tests**

```bash
cd backend && npm run test -- --testPathPattern=payment-method.service.spec
```

**Step 7: Commit**

```bash
git add backend/src/modules/settings/
git commit -m "feat: add PaymentMethod CRUD service, controller, and DTOs"
```

---

## Task 6: Settlement Module - Backend (DTOs, Service, Controller)

**Files:**
- Create: `backend/src/modules/accounting/dto/settlement.dto.ts`
- Create: `backend/src/modules/accounting/services/settlement.service.ts`
- Create: `backend/src/modules/accounting/services/settlement.service.spec.ts`
- Create: `backend/src/modules/accounting/controllers/settlement.controller.ts`
- Modify: `backend/src/modules/accounting/accounting.module.ts`

**Step 1: Create Settlement DTOs**

```typescript
// backend/src/modules/accounting/dto/settlement.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsArray,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SettlementStatus } from '../../../database/entities/settlement.entity';

export class CreateSettlementDto {
  @ApiProperty({ description: 'Payment method ID' })
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({ description: 'Settlement date (YYYY-MM-DD)' })
  @IsDateString()
  settlementDate: string;

  @ApiProperty({ description: 'Payment IDs to include in settlement', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  paymentIds: string[];

  @ApiPropertyOptional({ description: 'Bank reference number' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QuerySettlementsDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by payment method ID' })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: SettlementStatus })
  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['settlementDate', 'createdAt', 'totalAmount'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC';
}

export class SettlementResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() settlementNumber: string;
  @ApiProperty() paymentMethodId: string;
  @ApiPropertyOptional() paymentMethod?: {
    id: string;
    code: string;
    name: string;
  };
  @ApiProperty() settlementDate: Date;
  @ApiProperty() totalAmount: number;
  @ApiPropertyOptional() reference?: string;
  @ApiPropertyOptional() notes?: string;
  @ApiProperty() status: SettlementStatus;
  @ApiProperty() paymentCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class SettlementListResponseDto {
  @ApiProperty({ type: [SettlementResponseDto] })
  data: SettlementResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class PendingPaymentsSummaryDto {
  @ApiProperty() paymentMethodId: string;
  @ApiProperty() paymentMethodCode: string;
  @ApiProperty() paymentMethodName: string;
  @ApiProperty() pendingCount: number;
  @ApiProperty() pendingAmount: number;
}
```

**Step 2: Create Settlement Service**

The service should:
- `findAll(query)` - List settlements with pagination and filters
- `findOne(id)` - Get settlement by ID with payment count
- `create(dto)` - Create settlement: validate payments are PENDING for the given method, sum amounts, create settlement, mark all payments as SETTLED, post accounting entry
- `cancel(id)` - Cancel settlement: revert payments to PENDING, reverse accounting entry
- `getPendingPayments(paymentMethodId)` - Get payments with settlementStatus=PENDING for a given method
- `getPendingSettlementsSummary()` - Aggregate pending amounts per payment method (for dashboard widget)

Key logic in `create`:
```typescript
// 1. Validate payment method exists and requires settlement
// 2. Fetch all specified payments
// 3. Validate each payment: settlementStatus must be PENDING, paymentMethodId must match
// 4. Calculate total amount
// 5. Create settlement record
// 6. Update all payments: settlementId = settlement.id, settlementStatus = SETTLED
// 7. Post accounting entry: DR settlementAccount, CR paymentAccount
// 8. Return settlement with payment count
```

Accounting integration:
```typescript
// Get mapping keys from payment method code
const paymentMappingKey = `payment_${paymentMethod.code.toLowerCase()}`;
const settlementMappingKey = `payment_${paymentMethod.code.toLowerCase()}_settlement`;

// Look up account IDs from mappings
const mappings = await this.accountMappingService.getMappings();
const paymentAccountId = mappings[paymentMappingKey];
const settlementAccountId = mappings[settlementMappingKey];

// Create journal entry
// DR settlementAccountId (Bank)
// CR paymentAccountId (e.g. Shopee Receivable)
```

**Step 3: Create Settlement Controller**

Endpoints:
- `GET /accounting/settlements` - List settlements
- `GET /accounting/settlements/pending-summary` - Pending amounts per method (dashboard)
- `GET /accounting/settlements/pending-payments/:paymentMethodId` - Pending payments for a method
- `GET /accounting/settlements/:id` - Get settlement by ID
- `POST /accounting/settlements` - Create settlement (Admin, Manager)
- `POST /accounting/settlements/:id/cancel` - Cancel settlement (Admin)

**Step 4: Register in accounting module**

In `backend/src/modules/accounting/accounting.module.ts`:
- Add `Settlement` and `PaymentMethodEntity` and `Payment` to `TypeOrmModule.forFeature([...])`
- Add `SettlementController` to controllers
- Add `SettlementService` to providers and exports

**Step 5: Write tests**

Create `backend/src/modules/accounting/services/settlement.service.spec.ts` with tests for:
- `create` - creates settlement, marks payments as settled, posts accounting entry
- `create` - rejects if payment not PENDING or wrong method
- `cancel` - reverts payments to PENDING, sets settlement CANCELLED
- `findAll` - pagination and filters work
- `getPendingPayments` - returns only PENDING payments for given method
- `getPendingSettlementsSummary` - returns correct aggregation per method

**Step 6: Run tests**

```bash
cd backend && npm run test -- --testPathPattern=settlement.service.spec
```

**Step 7: Commit**

```bash
git add backend/src/modules/accounting/
git commit -m "feat: add Settlement CRUD service, controller, and DTOs with accounting integration"
```

---

## Task 7: Modify Payment Service for Dynamic Account Mapping

**Files:**
- Modify: `backend/src/modules/sales/services/payment.service.ts`
- Modify: `backend/src/modules/accounting/services/accounting.service.ts`
- Modify: `backend/src/modules/sales/dto/` (payment DTOs)
- Modify: `backend/src/modules/sales/services/payment.service.spec.ts`

**Step 1: Update Payment DTOs**

Add `paymentMethodId` (required UUID) to `CreatePaymentDto`. Remove old `paymentMethod` field references.

**Step 2: Update Payment Service**

In `create()` method:
- Accept `paymentMethodId` from DTO
- Fetch the PaymentMethodEntity by ID
- Set `payment.paymentMethodId = dto.paymentMethodId`
- Set `payment.settlementStatus` based on `paymentMethodEntity.requiresSettlement`:
  - If `requiresSettlement === false` → `SettlementStatusEnum.NOT_APPLICABLE`
  - If `requiresSettlement === true` → `SettlementStatusEnum.PENDING`
- Remove old `paymentMethod: PaymentMethod.CASH` assignment
- Pass payment method code to accounting service

**Step 3: Update Accounting Service - postCustomerPaymentEntry**

Change `postCustomerPaymentEntry` to use dynamic mapping:
```typescript
async postCustomerPaymentEntry(
  payment: Payment,
  userId: string,
): Promise<JournalEntry> {
  const mappings = await this.accountMappingService.getMappings();

  // Dynamic debit account based on payment method
  const paymentMethodCode = payment.paymentMethodEntity?.code || 'CASH';
  const debitMappingKey = `payment_${paymentMethodCode.toLowerCase()}`;

  // Validate mappings
  if (!mappings[debitMappingKey]) {
    throw new NotFoundException(
      `Account mapping not configured for payment method "${paymentMethodCode}" (${debitMappingKey}). ` +
      `Please configure account mappings before posting transactions.`,
    );
  }
  this.validateMapping(mappings, MappingType.PAYMENT_AR, 'Accounts Receivable');

  // ... rest of method uses mappings[debitMappingKey] instead of mappings[MappingType.PAYMENT_CASH]
}
```

**Step 4: Update validateMapping to accept string keys**

The current `validateMapping` method only accepts `MappingType` enum values. Update it to also accept plain strings for dynamic mapping keys:

```typescript
private validateMappingByKey(
  mappings: Record<string, string>,
  key: string,
  displayName: string,
): void {
  if (!mappings[key]) {
    throw new NotFoundException(
      `Account mapping not configured for ${displayName} (${key}). ` +
      `Please configure account mappings before posting transactions.`,
    );
  }
}
```

**Step 5: Update tests**

Update `payment.service.spec.ts`:
- Mock `PaymentMethodEntity` repository
- Test that payment is created with correct `paymentMethodId` and `settlementStatus`
- Test that correct mapping key is used for accounting

**Step 6: Run tests**

```bash
cd backend && npm run test -- --testPathPattern=payment.service.spec
```

**Step 7: Commit**

```bash
git add backend/src/modules/sales/ backend/src/modules/accounting/services/accounting.service.ts
git commit -m "feat: update payment service and accounting to use dynamic payment method mappings"
```

---

## Task 8: Seed GL Accounts for Third-Party Receivables

**Files:**
- Modify: `backend/src/modules/accounting/services/chart-of-accounts.service.ts`

**Step 1: Add platform receivable accounts to seed data**

In `seedDefaultChartOfAccounts()`, add these accounts after existing ASSET accounts:

```typescript
// Third-party payment receivables
{ code: '1120', name: 'TnG Receivable', type: AccountType.ASSET },
{ code: '1130', name: 'Credit Card Receivable', type: AccountType.ASSET },
{ code: '1140', name: 'Atome Receivable', type: AccountType.ASSET },
{ code: '1150', name: 'Shopee Receivable', type: AccountType.ASSET },
{ code: '1160', name: 'TikTok Receivable', type: AccountType.ASSET },
```

**Note:** These accounts may need to be created manually if the COA is already seeded. The migration in Task 4 does not auto-create these. Add a section to the migration or provide instructions to create them via the UI.

**Step 2: Commit**

```bash
git add backend/src/modules/accounting/services/chart-of-accounts.service.ts
git commit -m "feat: add third-party receivable accounts to COA seed data"
```

---

## Task 9: Frontend - Payment Methods Settings Page

**Files:**
- Create: `frontend/src/store/slices/paymentMethodsSlice.ts`
- Create: `frontend/src/services/paymentMethodsApi.ts`
- Create: `frontend/src/pages/settings/PaymentMethodsPage.tsx`
- Create: `frontend/src/components/settings/PaymentMethodFormDialog.tsx`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/store/index.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/common/Sidebar.tsx`

**Step 1: Add types**

In `frontend/src/types/index.ts`, add:

```typescript
export interface PaymentMethodConfig {
  id: string;
  code: string;
  name: string;
  requiresSettlement: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Create API service**

```typescript
// frontend/src/services/paymentMethodsApi.ts
import { ApiService } from './api';
import type { PaymentMethodConfig, PaginatedResponse } from '@/types';

const BASE_URL = '/settings/payment-methods';

export const paymentMethodsApi = {
  getAll: (params?: any): Promise<PaginatedResponse<PaymentMethodConfig>> =>
    ApiService.get(BASE_URL, { params }),

  getActive: (): Promise<PaymentMethodConfig[]> =>
    ApiService.get(`${BASE_URL}/active`),

  getById: (id: string): Promise<PaymentMethodConfig> =>
    ApiService.get(`${BASE_URL}/${id}`),

  create: (data: Partial<PaymentMethodConfig>): Promise<PaymentMethodConfig> =>
    ApiService.post(BASE_URL, data),

  update: (id: string, data: Partial<PaymentMethodConfig>): Promise<PaymentMethodConfig> =>
    ApiService.patch(`${BASE_URL}/${id}`, data),

  delete: (id: string): Promise<void> =>
    ApiService.delete(`${BASE_URL}/${id}`),
};
```

**Step 3: Create Redux slice**

Follow the `bankReconciliationsSlice.ts` pattern:
- State: `data`, `loading`, `error`, `pagination`
- Thunks: `fetchPaymentMethods`, `createPaymentMethod`, `updatePaymentMethod`, `deletePaymentMethod`
- Selectors: `selectPaymentMethods`, `selectPaymentMethodsLoading`, etc.

**Step 4: Register slice in store**

In `frontend/src/store/index.ts`:
- Import `paymentMethodsSlice`
- Add `paymentMethods: paymentMethodsSlice` to `combineReducers`

**Step 5: Create form dialog component**

`frontend/src/components/settings/PaymentMethodFormDialog.tsx`:
- Dialog with fields: Code, Name, Requires Settlement (switch), Sort Order
- Edit mode populates existing values
- Code field auto-uppercased and read-only in edit mode

**Step 6: Create page component**

`frontend/src/pages/settings/PaymentMethodsPage.tsx`:
- Table with columns: Code, Name, Requires Settlement, Sort Order, Active, Actions
- Create button opens form dialog
- Edit/Delete actions per row
- Delete confirmation dialog

**Step 7: Add route and navigation**

In `frontend/src/App.tsx`:
- Add lazy import: `const PaymentMethodsPage = React.lazy(() => import('./pages/settings/PaymentMethodsPage'))`
- Add route: `<Route path="/settings/payment-methods" element={<PaymentMethodsPage />} />`

In `frontend/src/components/common/Sidebar.tsx`:
- Add under Settings section:
```typescript
{
  id: 'payment-methods',
  title: 'Payment Methods',
  icon: <PaymentIcon />,
  path: '/settings/payment-methods',
},
```

**Step 8: Commit**

```bash
git add frontend/src/
git commit -m "feat: add Payment Methods settings page with CRUD"
```

---

## Task 10: Frontend - Settlements Page

**Files:**
- Create: `frontend/src/store/slices/settlementsSlice.ts`
- Create: `frontend/src/services/settlementsApi.ts`
- Create: `frontend/src/pages/accounting/SettlementsPage.tsx`
- Create: `frontend/src/components/accounting/CreateSettlementDialog.tsx`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/store/index.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/common/Sidebar.tsx`

**Step 1: Add types**

In `frontend/src/types/index.ts`, add:

```typescript
export interface Settlement {
  id: string;
  settlementNumber: string;
  paymentMethodId: string;
  paymentMethod?: {
    id: string;
    code: string;
    name: string;
  };
  settlementDate: string;
  totalAmount: number;
  reference?: string;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  paymentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PendingSettlementSummary {
  paymentMethodId: string;
  paymentMethodCode: string;
  paymentMethodName: string;
  pendingCount: number;
  pendingAmount: number;
}
```

**Step 2: Create API service**

```typescript
// frontend/src/services/settlementsApi.ts
import { ApiService } from './api';
import type { Settlement, PaginatedResponse, PendingSettlementSummary } from '@/types';

const BASE_URL = '/accounting/settlements';

export const settlementsApi = {
  getAll: (params?: any): Promise<PaginatedResponse<Settlement>> =>
    ApiService.get(BASE_URL, { params }),

  getById: (id: string): Promise<Settlement> =>
    ApiService.get(`${BASE_URL}/${id}`),

  create: (data: {
    paymentMethodId: string;
    settlementDate: string;
    paymentIds: string[];
    reference?: string;
    notes?: string;
  }): Promise<Settlement> =>
    ApiService.post(BASE_URL, data),

  cancel: (id: string): Promise<Settlement> =>
    ApiService.post(`${BASE_URL}/${id}/cancel`),

  getPendingSummary: (): Promise<PendingSettlementSummary[]> =>
    ApiService.get(`${BASE_URL}/pending-summary`),

  getPendingPayments: (paymentMethodId: string): Promise<any[]> =>
    ApiService.get(`${BASE_URL}/pending-payments/${paymentMethodId}`),
};
```

**Step 3: Create Redux slice**

Follow `bankReconciliationsSlice.ts` pattern:
- State: `data`, `loading`, `error`, `pagination`, `pendingSummary`, `pendingPayments`
- Thunks: `fetchSettlements`, `createSettlement`, `cancelSettlement`, `fetchPendingSummary`, `fetchPendingPayments`

**Step 4: Register slice in store**

**Step 5: Create settlement dialog**

`frontend/src/components/accounting/CreateSettlementDialog.tsx`:
1. User selects payment method from dropdown (only methods with `requiresSettlement=true`)
2. On selection, fetch pending payments for that method
3. Show table of pending payments with checkboxes (amount, date, payment number, customer)
4. "Select All" checkbox
5. Fields: Settlement date, bank reference, notes
6. Total amount auto-calculated from selected payments
7. Submit creates the settlement

**Step 6: Create page**

`frontend/src/pages/accounting/SettlementsPage.tsx`:
- Table: Settlement Number, Payment Method, Date, Total Amount, Payments Count, Reference, Status, Actions
- Filters: Payment method dropdown, status dropdown, date range
- "Create Settlement" button
- Cancel action for completed settlements (with confirmation)

**Step 7: Add route and navigation**

In `frontend/src/App.tsx`:
- Lazy import and route: `/accounting/settlements`

In `frontend/src/components/common/Sidebar.tsx`:
- Add under Accounting section (before Bank Reconciliations):
```typescript
{
  id: 'settlements',
  title: 'Settlements',
  icon: <AccountBalanceWalletIcon />,
  path: '/accounting/settlements',
},
```

**Step 8: Commit**

```bash
git add frontend/src/
git commit -m "feat: add Settlements page under Accounting with create dialog"
```

---

## Task 11: Modify Payment Form - Payment Method Dropdown

**Files:**
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx` (or wherever the payment creation form lives)
- Modify: `frontend/src/store/slices/salesSlice.ts` (payment creation thunk)

**Step 1: Fetch active payment methods on mount**

Use the `paymentMethodsApi.getActive()` endpoint to load available methods into a dropdown.

**Step 2: Add Payment Method dropdown to payment creation form**

Replace hardcoded "Cash" with a `<Select>` dropdown populated from active payment methods.

**Step 3: Pass paymentMethodId in create payment DTO**

Update the create payment thunk to include `paymentMethodId` from the selected dropdown value.

**Step 4: Display payment method name in payment list**

In the payments table, show the payment method name (from the `paymentMethodEntity` relation) instead of the old enum value.

**Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: add payment method dropdown to payment creation form"
```

---

## Task 12: Dashboard Widget - Pending Settlements

**Files:**
- Modify: `frontend/src/pages/accounting/AccountingDashboardPage.tsx`

**Step 1: Fetch pending settlements summary**

Call `settlementsApi.getPendingSummary()` on page mount (or reuse from settlements slice).

**Step 2: Add "Pending Settlements" card**

Add a new section below existing summary cards:
```typescript
<Typography variant="h6" sx={{ mb: 2, mt: 4 }}>Pending Settlements</Typography>
<Grid container spacing={2}>
  {pendingSummary.map((item) => (
    <Grid item xs={12} sm={6} md={4} key={item.paymentMethodId}>
      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary">
            {item.paymentMethodName}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {formatCurrency(item.pendingAmount)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {item.pendingCount} payment{item.pendingCount !== 1 ? 's' : ''} pending
          </Typography>
        </CardContent>
      </Card>
    </Grid>
  ))}
</Grid>
```

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/AccountingDashboardPage.tsx
git commit -m "feat: add pending settlements widget to accounting dashboard"
```

---

## Task 13: Remove Old PaymentMethod Enum References

**Files:**
- Modify: `backend/src/database/entities/payment.entity.ts` - Remove old `PaymentMethod` enum and `paymentMethod` column (already dropped in migration, clean up entity)
- Modify: `frontend/src/types/index.ts` - Update `Payment` interface to use `paymentMethodId` and `paymentMethodEntity` instead of old `method`/`paymentMethod` fields
- Search and update any remaining references to old `PaymentMethod.CASH` enum

**Step 1: Clean up Payment entity**

Remove the `PaymentMethod` enum definition and the old `paymentMethod` column from the entity. The migration already dropped the DB column.

**Step 2: Update frontend Payment type**

Replace old payment method fields with:
```typescript
  paymentMethodId: string;
  paymentMethodEntity?: PaymentMethodConfig;
  settlementStatus: 'not_applicable' | 'pending' | 'settled';
  settlementId?: string;
```

**Step 3: Search for remaining references**

```bash
grep -rn "PaymentMethod\." backend/src/ --include="*.ts" | grep -v node_modules | grep -v ".spec."
grep -rn "paymentMethod:" frontend/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Fix any remaining references.

**Step 4: Run all tests**

```bash
cd backend && npm run test
cd frontend && npm run test
```

**Step 5: Commit**

```bash
git add backend/ frontend/
git commit -m "refactor: remove old PaymentMethod enum, use PaymentMethodEntity throughout"
```

---

## Task 14: Run Migration and Integration Test

**Step 1: Run migration**

```bash
cd backend && npm run migration:run
```

**Step 2: Verify payment methods seeded**

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT * FROM payment_methods;"
```

**Step 3: Verify existing payments migrated**

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT id, \"paymentMethodId\", \"settlementStatus\" FROM payments LIMIT 5;"
```

**Step 4: Test the full flow manually**

1. Go to Settings > Payment Methods - verify 7 default methods exist
2. Go to Account Mappings - verify PAYMENT_CASH, PAYMENT_BANK, PAYMENT_TNG, etc. mappings exist
3. Configure missing account mappings (assign receivable accounts to each)
4. Create a payment with "Shopee" method - verify settlementStatus = PENDING
5. Create a payment with "Cash" method - verify settlementStatus = NOT_APPLICABLE
6. Go to Accounting > Settlements - create settlement for Shopee
7. Verify payments marked as SETTLED and journal entry posted
8. Check Accounting Dashboard for pending settlements widget

**Step 5: Commit any fixes**

```bash
git add .
git commit -m "fix: integration test fixes for payment methods and settlements"
```

---

## Summary of All Tasks

| # | Task | Estimated Complexity |
|---|------|---------------------|
| 1 | PaymentMethod Entity | Small |
| 2 | Settlement Entity | Small |
| 3 | Modify Payment Entity | Small |
| 4 | Database Migration | Medium |
| 5 | Payment Method Service/Controller/DTOs | Medium |
| 6 | Settlement Service/Controller/DTOs | Large |
| 7 | Modify Payment Service + Accounting | Medium |
| 8 | Seed GL Accounts | Small |
| 9 | Frontend - Payment Methods Page | Medium |
| 10 | Frontend - Settlements Page | Large |
| 11 | Modify Payment Form | Small |
| 12 | Dashboard Widget | Small |
| 13 | Clean up old enum references | Small |
| 14 | Migration + Integration Test | Medium |
