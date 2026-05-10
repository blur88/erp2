# Unified Module Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicated parallel-track implementations across Sales, Purchasing, and Inventory with a shared generic engine — `BaseCrudService`, `BaseCrudController`, `useEntityWorkspace`, and `GenericListPage` — migrating all 17 list pages.

**Architecture:** Additive-first within a single big-bang branch. New base classes and generic components are created first (Tasks 1–5), then the pilot entities (Customer/Supplier) validate the design (Tasks 6–7), then all remaining entities are migrated mechanically (Tasks 8–17 backend, 18–25 frontend), and finally dead code is deleted (Task 26).

**Tech Stack:** NestJS 11, TypeORM, React 19, MUI v7, RTK Query, Vitest (frontend tests), Jest (backend tests)

---

## Execution Status (as of 2026-04-15)

**Completed:** Tasks 1–7, Task 12 (TransactionForm), partial Task 8 (inventory list pages), partial Tasks 13–15 (remaining list pages)

**Partially complete:**
- Tasks 8–10 (backend service migrations): Customer, Supplier, StockAdjustment, VendorPayment, Payment, GRN done. Product, Category, SalesOrder, Invoice, PurchaseOrder deferred to #374.
- Tasks 13–15 (frontend page migrations): All 11 list pages use `GenericListPage`. `useEntityWorkspace` fully replaces hook triplets for Customers/Suppliers only; 9 pages retained renamed per-entity hooks — deferred to #374.
- Task 11 (transaction entity inheritance): `BaseTransactionHeader`/`BaseTransactionItem` created but no entity extends them yet — deferred to #374.
- Task 17 (dead code deletion): Customer/Supplier hook triplets deleted. Remaining 9 pages' hooks renamed but not deleted — deferred to #374.

**Not started:** Task 18 (final verification — superseded by CI)

Individual step checkboxes were not tracked during execution. See issue #374 for remaining scope.

---

## File Map

### New backend files
- `backend/src/common/dto/base-query.dto.ts` — shared pagination/search/sort DTO
- `backend/src/common/dto/base-contact.dto.ts` — shared phone/address fields (phone, streetAddress, city, state, postalCode, country)
- `backend/src/common/services/base-crud.service.ts` — generic abstract service
- `backend/src/common/services/base-crud.service.spec.ts` — unit tests for base service
- `backend/src/common/controllers/base-crud.controller.ts` — generic abstract controller
- `backend/src/database/entities/base-transaction-header.entity.ts` — abstract TypeORM header entity
- `backend/src/database/entities/base-transaction-item.entity.ts` — abstract TypeORM item entity

### New frontend files
- `frontend/src/hooks/useEntityWorkspace.ts` — generic selection/keyboard/dialog hook
- `frontend/src/hooks/useEntityWorkspace.test.ts` — unit tests
- `frontend/src/components/common/GenericListPage.tsx` — generic page scaffold component
- `frontend/src/components/common/GenericListPage.test.tsx` — render tests
- `frontend/src/components/common/TransactionForm.tsx` — unified order-entry form
- `frontend/src/components/common/TransactionForm.test.tsx` — form tests

### Modified backend files (pilot)
- `backend/src/modules/sales/services/customer.service.ts` — extend BaseCrudService
- `backend/src/modules/sales/controllers/customer.controller.ts` — extend BaseCrudController
- `backend/src/modules/sales/dto/customer.dto.ts` — extend BaseQueryDto/BaseContactDto
- `backend/src/modules/purchasing/services/supplier.service.ts` — extend BaseCrudService
- `backend/src/modules/purchasing/controllers/supplier.controller.ts` — extend BaseCrudController
- `backend/src/modules/purchasing/dto/supplier.dto.ts` — extend BaseQueryDto/BaseContactDto

### Modified backend files (remaining — same pattern as pilot)
- Inventory: `product.service.ts`, `product.controller.ts`, `category.service.ts`, `category.controller.ts`, `stock-adjustment.service.ts`, `stock-adjustment.controller.ts`
- Sales: `sales-order.service.ts`, `sales-order.controller.ts`, `invoice.service.ts`, `invoice.controller.ts`, `payment.service.ts`, `payment.controller.ts`
- Purchasing: `purchase-order.service.ts`, `purchase-order.controller.ts`, `goods-received-note.service.ts`, `goods-received-note.controller.ts`, `vendor-payment.service.ts`, `vendor-payment.controller.ts`
- Entities: `sales-order.entity.ts`, `sales-order-item.entity.ts`, `purchase-order.entity.ts`, `purchase-order-item.entity.ts`, `invoice.entity.ts`, `invoice-item.entity.ts`, `goods-received-note-item.entity.ts`

### Modified frontend files (pilot)
- `frontend/src/pages/sales/CustomersPage.tsx`
- `frontend/src/pages/purchasing/SuppliersPage.tsx`

### Modified frontend files (remaining — same pattern as pilot)
- `frontend/src/pages/inventory/ProductsPage.tsx`
- `frontend/src/pages/inventory/CategoriesPage.tsx`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- `frontend/src/pages/sales/OrdersPage.tsx`
- `frontend/src/pages/sales/InvoicesPage.tsx`
- `frontend/src/pages/sales/PaymentsPage.tsx`
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`
- `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- `frontend/src/pages/inventory/CreateProductPage.tsx`
- `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`
- `frontend/src/pages/sales/CustomerFormPage.tsx`
- `frontend/src/pages/purchasing/SupplierFormPage.tsx`

### Deleted after migration (frontend)
- All `useXxxPageState.ts`, `useXxxSelection.ts`, `useXxxActions.ts` files in:
  - `frontend/src/pages/sales/hooks/`
  - `frontend/src/pages/purchasing/hooks/`
  - `frontend/src/pages/inventory/hooks/`

---

## Task 1: Shared DTOs

**Files:**
- Create: `backend/src/common/dto/base-query.dto.ts`
- Create: `backend/src/common/dto/base-contact.dto.ts`

- [ ] **Step 1: Create BaseQueryDto**

```typescript
// backend/src/common/dto/base-query.dto.ts
import { IsOptional, IsString, IsBoolean, IsIn, IsInt, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class BaseQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
```

- [ ] **Step 2: Create BaseContactDto**

Fields match the actual entity columns in `customer.entity.ts` and `supplier.entity.ts`. Neither entity has an `email` column — do not add one here.

```typescript
// backend/src/common/dto/base-contact.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class BaseContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/common/dto/base-query.dto.ts backend/src/common/dto/base-contact.dto.ts
git commit -m "feat(backend): add BaseQueryDto and BaseContactDto shared DTOs"
```

---

## Task 2: BaseCrudService

**Files:**
- Create: `backend/src/common/services/base-crud.service.ts`

- [ ] **Step 1: Write the failing test first**

```typescript
// backend/src/common/services/base-crud.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { BaseCrudService } from './base-crud.service';
import { AuditLogService } from '../../modules/audit-logs/services';
import { BaseEntity } from '../../database/entities/base.entity';

// Minimal test entity
class TestEntity extends BaseEntity {
  name: string;
}

class TestQueryDto {
  search?: string;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

class TestCreateDto { name: string; }
class TestUpdateDto { name?: string; }

// Concrete subclass to test the abstract base
class TestCrudService extends BaseCrudService<TestEntity, TestCreateDto, TestUpdateDto, TestQueryDto> {
  constructor(repo: Repository<TestEntity>, auditLogService: AuditLogService) {
    super(repo, auditLogService);
  }

  getEntityType(): string { return 'TestEntity'; }

  buildWhereClause(query: TestQueryDto): FindOptionsWhere<TestEntity> {
    const where: FindOptionsWhere<TestEntity> = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    return where;
  }
}

describe('BaseCrudService', () => {
  let service: TestCrudService;
  let repo: jest.Mocked<Repository<TestEntity>>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockEntity: TestEntity = { id: 'uuid-1', name: 'Test', isActive: true, createdAt: new Date(), updatedAt: new Date() } as TestEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(TestEntity),
          useValue: {
            createQueryBuilder: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: TestCrudService,
          useFactory: (r: Repository<TestEntity>, a: AuditLogService) => new TestCrudService(r, a),
          inject: [getRepositoryToken(TestEntity), AuditLogService],
        },
      ],
    }).compile();

    service = module.get(TestCrudService);
    repo = module.get(getRepositoryToken(TestEntity));
    auditLogService = module.get(AuditLogService);
  });

  it('findOne throws NotFoundException when entity missing', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('findOne returns entity when found', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(mockEntity);
    const result = await service.findOne('uuid-1');
    expect(result).toBe(mockEntity);
  });

  it('softDelete calls repo.softDelete and logs audit', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(mockEntity);
    (repo.softDelete as jest.Mock).mockResolvedValue(undefined);
    await service.softDelete('uuid-1', 'user-1', 'admin');
    expect(repo.softDelete).toHaveBeenCalledWith('uuid-1');
    expect(auditLogService.log).toHaveBeenCalledWith(
      'DELETE', 'TestEntity', expect.any(String),
      expect.objectContaining({ entityId: 'uuid-1', userId: 'user-1', username: 'admin' }),
    );
  });

  it('restore calls repo.restore and logs audit', async () => {
    (repo.findOne as jest.Mock).mockResolvedValueOnce(mockEntity);
    (repo.restore as jest.Mock).mockResolvedValue(undefined);
    (repo.findOne as jest.Mock).mockResolvedValueOnce({ ...mockEntity, isActive: true });
    await service.restore('uuid-1', 'user-1', 'admin');
    expect(repo.restore).toHaveBeenCalledWith('uuid-1');
    expect(auditLogService.log).toHaveBeenCalledWith(
      'RESTORE', 'TestEntity', expect.any(String),
      expect.objectContaining({ entityId: 'uuid-1' }),
    );
  });

  it('bulkRestore returns successCount and failedItems', async () => {
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce(mockEntity)   // before snapshot
      .mockResolvedValueOnce({ ...mockEntity, isActive: true }) // after restore
      .mockResolvedValueOnce(null);        // second ID not found
    (repo.restore as jest.Mock).mockResolvedValue(undefined);

    const result = await service.bulkRestore(['uuid-1', 'uuid-missing'], 'user-1', 'admin');
    expect(result.successCount).toBe(1);
    expect(result.failedItems).toHaveLength(1);
    expect(result.failedItems[0].id).toBe('uuid-missing');
  });

  it('permanentDelete calls repo.delete and logs audit', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(mockEntity);
    (repo.delete as jest.Mock).mockResolvedValue(undefined);
    await service.permanentDelete('uuid-1', 'user-1', 'admin');
    expect(repo.delete).toHaveBeenCalledWith('uuid-1');
    expect(auditLogService.log).toHaveBeenCalledWith(
      'PERMANENT_DELETE', 'TestEntity', expect.any(String),
      expect.objectContaining({ entityId: 'uuid-1' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/common/services/base-crud.service.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './base-crud.service'`

- [ ] **Step 3: Implement BaseCrudService**

```typescript
// backend/src/common/services/base-crud.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository, FindOptionsWhere } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { AuditLogService } from '../../modules/audit-logs/services';
import { BulkOperationUtil, BulkOperationResponse } from '../utils/validation.util';

export interface BulkOperationError {
  id: string;
  error: string;
}

export interface BaseBulkResult {
  successCount: number;
  failedItems: BulkOperationError[];
}

@Injectable()
export abstract class BaseCrudService<
  T extends BaseEntity,
  CreateDto,
  UpdateDto,
  QueryDto extends { search?: string; isActive?: boolean; sortBy?: string; sortOrder?: 'ASC' | 'DESC' },
> {
  constructor(
    protected readonly repository: Repository<T>,
    protected readonly auditLogService: AuditLogService,
  ) {}

  /** Return the audit entity type string, e.g. 'Customer' */
  abstract getEntityType(): string;

  /** Build entity-specific WHERE clause from query DTO */
  abstract buildWhereClause(query: QueryDto): FindOptionsWhere<T>;

  /** Override to add entity-specific filters to the query builder */
  protected applyQueryBuilder(
    qb: ReturnType<Repository<T>['createQueryBuilder']>,
    query: QueryDto,
  ): ReturnType<Repository<T>['createQueryBuilder']> {
    return qb;
  }

  /** Override for custom post-create logic */
  protected async afterCreate(_entity: T, _userId: string, _username?: string): Promise<void> {}

  /** Override for custom post-update logic */
  protected async afterUpdate(_before: T, _after: T, _userId: string, _username?: string): Promise<void> {}

  /** Override for custom post-delete logic (dependency checks, cascade) */
  protected async afterDelete(_entity: T, _userId: string, _username?: string): Promise<void> {}

  async findAll(query: QueryDto): Promise<{ data: T[]; total: number }> {
    const { search, sortBy = 'createdAt', sortOrder = 'ASC' } = query;
    const where = this.buildWhereClause(query);

    const alias = this.getEntityType().toLowerCase();
    let qb = this.repository.createQueryBuilder(alias);

    Object.entries(where).forEach(([key, value]) => {
      qb = qb.andWhere(`${alias}.${key} = :${key}`, { [key]: value });
    });

    if (search) {
      qb = qb.andWhere(`${alias}.name ILIKE :search`, { search: `%${search}%` });
    }

    qb = this.applyQueryBuilder(qb, query);
    qb = qb.orderBy(`${alias}.${sortBy}`, sortOrder);

    const entities = await qb.getMany();
    return { data: entities, total: entities.length };
  }

  async findDeleted(query: QueryDto): Promise<{ data: T[]; total: number }> {
    const { search } = query;
    const alias = this.getEntityType().toLowerCase();

    let qb = this.repository
      .createQueryBuilder(alias)
      .withDeleted()
      .where(`${alias}.deletedAt IS NOT NULL`);

    if (search) {
      qb = qb.andWhere(`${alias}.name ILIKE :search`, { search: `%${search}%` });
    }

    const entities = await qb.getMany();
    return { data: entities, total: entities.length };
  }

  async findOne(id: string): Promise<T> {
    const entity = await this.repository.findOne({ where: { id } as FindOptionsWhere<T> });
    if (!entity) {
      throw new NotFoundException(`${this.getEntityType()} with id ${id} not found`);
    }
    return entity;
  }

  async create(dto: CreateDto, userId: string, username?: string): Promise<T> {
    const entity = this.repository.create(dto as any);
    const saved = await this.repository.save(entity);

    await this.auditLogService.log('CREATE', this.getEntityType(), `Created ${this.getEntityType()} ${saved.id}`, {
      entityId: saved.id,
      userId,
      username,
      newValues: dto as any,
    });

    await this.afterCreate(saved, userId, username);
    return saved;
  }

  async update(id: string, dto: UpdateDto, userId: string, username?: string): Promise<T> {
    const before = await this.findOne(id);

    Object.assign(before, dto);
    const saved = await this.repository.save(before);

    await this.auditLogService.log('UPDATE', this.getEntityType(), `Updated ${this.getEntityType()} ${id}`, {
      entityId: id,
      userId,
      username,
      oldValues: before,
      newValues: dto as any,
    });

    await this.afterUpdate(before, saved, userId, username);
    return saved;
  }

  async softDelete(id: string, userId: string, username?: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.afterDelete(entity, userId, username);
    await this.repository.softDelete(id);

    await this.auditLogService.log('DELETE', this.getEntityType(), `Deleted ${this.getEntityType()} ${id}`, {
      entityId: id,
      userId,
      username,
      oldValues: { id: entity.id },
    });
  }

  async restore(id: string, userId: string, username?: string): Promise<T> {
    const entity = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
      withDeleted: true,
    });
    if (!entity) {
      throw new NotFoundException(`${this.getEntityType()} with id ${id} not found`);
    }

    await this.repository.restore(id);
    const restored = await this.findOne(id);

    await this.auditLogService.log('RESTORE', this.getEntityType(), `Restored ${this.getEntityType()} ${id}`, {
      entityId: id,
      userId,
      username,
    });

    return restored;
  }

  async bulkRestore(ids: string[], userId: string, username?: string): Promise<BaseBulkResult> {
    let successCount = 0;
    const failedItems: BulkOperationError[] = [];

    for (const id of ids) {
      try {
        await this.restore(id, userId, username);
        successCount++;
      } catch (error: any) {
        failedItems.push({ id, error: error.message });
      }
    }

    return { successCount, failedItems };
  }

  async permanentDelete(id: string, userId: string, username?: string): Promise<void> {
    const entity = await this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
      withDeleted: true,
    });
    if (!entity) {
      throw new NotFoundException(`${this.getEntityType()} with id ${id} not found`);
    }

    await this.repository.delete(id);

    await this.auditLogService.log('PERMANENT_DELETE', this.getEntityType(), `Permanently deleted ${this.getEntityType()} ${id}`, {
      entityId: id,
      userId,
      username,
    });
  }

  async bulkPermanentDelete(ids: string[], userId: string, username?: string): Promise<BaseBulkResult> {
    let successCount = 0;
    const failedItems: BulkOperationError[] = [];

    for (const id of ids) {
      try {
        await this.permanentDelete(id, userId, username);
        successCount++;
      } catch (error: any) {
        failedItems.push({ id, error: error.message });
      }
    }

    return { successCount, failedItems };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/common/services/base-crud.service.spec.ts --no-coverage
```

Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/services/base-crud.service.ts backend/src/common/services/base-crud.service.spec.ts
git commit -m "feat(backend): add BaseCrudService with audit integration and tests"
```

---

## Task 3: BaseCrudController

**Files:**
- Create: `backend/src/common/controllers/base-crud.controller.ts`

- [ ] **Step 1: Create BaseCrudController**

```typescript
// backend/src/common/controllers/base-crud.controller.ts
import {
  Get, Post, Put, Patch, Delete, Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { BaseCrudService } from '../services/base-crud.service';
import { CurrentUser } from '../../modules/auth/decorators/current-user.decorator';
import { BaseEntity } from '../../database/entities/base.entity';

/**
 * Abstract base controller providing standard CRUD endpoints.
 * Subclasses extend this and may add entity-specific endpoints.
 *
 * IMPORTANT: NestJS route ordering — specific routes (/deleted, /summary, /search)
 * MUST be declared in the subclass BEFORE calling super methods or adding /:id routes.
 * The base class declares them in safe order but subclass additions must come first.
 */
export abstract class BaseCrudController<
  T extends BaseEntity,
  CreateDto,
  UpdateDto,
  QueryDto extends { search?: string; isActive?: boolean; sortBy?: string; sortOrder?: 'ASC' | 'DESC' },
> {
  constructor(protected readonly service: BaseCrudService<T, CreateDto, UpdateDto, QueryDto>) {}

  @Get()
  @ApiOperation({ summary: 'Get all (with filters)' })
  async findAll(@Query() query: QueryDto) {
    return this.service.findAll(query);
  }

  @Get('deleted')
  @ApiOperation({ summary: 'Get soft-deleted records' })
  async findDeleted(@Query() query: QueryDto) {
    return this.service.findDeleted(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get by ID' })
  @ApiParam({ name: 'id', type: 'string' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create' })
  async create(
    @Body() dto: CreateDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.create(dto, userId, username);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update' })
  @ApiParam({ name: 'id', type: 'string' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.update(id, dto, userId, username);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete' })
  @ApiParam({ name: 'id', type: 'string' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ): Promise<void> {
    return this.service.softDelete(id, userId, username);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted record' })
  @ApiParam({ name: 'id', type: 'string' })
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.restore(id, userId, username);
  }

  @Post('bulk-restore')
  @ApiOperation({ summary: 'Bulk restore soft-deleted records' })
  @ApiBody({ schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } } } })
  async bulkRestore(
    @Body() body: { ids: string[] },
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.bulkRestore(body.ids, userId, username);
  }

  @Post('bulk-permanent-delete')
  @ApiOperation({ summary: 'Bulk permanent delete' })
  @ApiBody({ schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } } } })
  async bulkPermanentDelete(
    @Body() body: { ids: string[] },
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ) {
    return this.service.bulkPermanentDelete(body.ids, userId, username);
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete' })
  @ApiParam({ name: 'id', type: 'string' })
  async permanentDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('username') username: string,
  ): Promise<void> {
    return this.service.permanentDelete(id, userId, username);
  }
}
```

- [ ] **Step 2: Run the backend TypeScript check to confirm no errors**

```bash
cd backend && npm run build 2>&1 | head -30
```

Expected: Build succeeds (0 errors)

- [ ] **Step 3: Commit**

```bash
git add backend/src/common/controllers/base-crud.controller.ts
git commit -m "feat(backend): add BaseCrudController with standard CRUD endpoints"
```

---

## Task 4: Abstract Transaction Entities

**Files:**
- Create: `backend/src/database/entities/base-transaction-header.entity.ts`
- Create: `backend/src/database/entities/base-transaction-item.entity.ts`

- [ ] **Step 1: Create BaseTransactionHeader**

These are TypeScript abstract classes — NO `@Entity()` decorator. Subclasses keep their own `@Entity()` and table names. No database migration is needed.

```typescript
// backend/src/database/entities/base-transaction-header.entity.ts
import { Column } from 'typeorm';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { BaseEntity } from './base.entity';

/**
 * Abstract base for transaction header entities (SalesOrder, PurchaseOrder, Invoice, etc).
 * No @Entity() decorator — subclasses define their own table names.
 * No database migration required — TypeScript inheritance only.
 */
export abstract class BaseTransactionHeader extends BaseEntity {
  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  discountAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @Column({ type: 'uuid', nullable: true })
  @IsOptional()
  createdByUserId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsString()
  createdByUsername?: string;
}
```

- [ ] **Step 2: Create BaseTransactionItem**

```typescript
// backend/src/database/entities/base-transaction-item.entity.ts
import { Column } from 'typeorm';
import { IsOptional, IsString, IsNumber, IsUUID, Min } from 'class-validator';
import { BaseEntity } from './base.entity';

/**
 * Abstract base for transaction line item entities.
 * No @Entity() decorator — subclasses define their own table names.
 * No database migration required — TypeScript inheritance only.
 */
export abstract class BaseTransactionItem extends BaseEntity {
  @Column({ type: 'uuid' })
  @IsUUID()
  productId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'percentage' })
  @IsOptional()
  @IsString()
  discountType?: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  @IsNumber()
  @Min(0)
  discountValue: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  taxRate: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  totalAmount: number;
}
```

- [ ] **Step 3: Run build to confirm no errors**

```bash
cd backend && npm run build 2>&1 | head -30
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/entities/base-transaction-header.entity.ts backend/src/database/entities/base-transaction-item.entity.ts
git commit -m "feat(backend): add abstract BaseTransactionHeader and BaseTransactionItem entities"
```

---

## Task 5: Frontend — useEntityWorkspace and GenericListPage

**Files:**
- Create: `frontend/src/hooks/useEntityWorkspace.ts`
- Create: `frontend/src/hooks/useEntityWorkspace.test.ts`
- Create: `frontend/src/components/common/GenericListPage.tsx`
- Create: `frontend/src/components/common/GenericListPage.test.tsx`

- [ ] **Step 1: Write failing tests for useEntityWorkspace**

```typescript
// frontend/src/hooks/useEntityWorkspace.test.ts
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEntityWorkspace } from './useEntityWorkspace'

const makeEntity = (id: string) => ({ id, name: `Entity ${id}` })

const makeConfig = (overrides = {}) => ({
  entities: [makeEntity('1'), makeEntity('2'), makeEntity('3')],
  selectedEntity: null as { id: string; name: string } | null,
  selectEntity: vi.fn(),
  refetch: vi.fn(),
  navigate: vi.fn(),
  routes: { create: '/entities/create', edit: (id: string) => `/entities/${id}/edit` },
  notifications: { showSuccess: vi.fn(), showError: vi.fn() },
  deleteMutation: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})

describe('useEntityWorkspace', () => {
  it('initializes with no focused entity and closed dialogs', () => {
    const { result } = renderHook(() => useEntityWorkspace(makeConfig()))
    expect(result.current.focusedIndex).toBe(-1)
    expect(result.current.deleteConfirmOpen).toBe(false)
    expect(result.current.deletedEntitiesDialogOpen).toBe(false)
  })

  it('auto-selects first entity when none selected', () => {
    const config = makeConfig()
    renderHook(() => useEntityWorkspace(config))
    // After first render, selectEntity should be called with entities[0]
    expect(config.selectEntity).toHaveBeenCalledWith(config.entities[0])
  })

  it('handleSelect updates focusedIndex and calls selectEntity', () => {
    const config = makeConfig()
    const { result } = renderHook(() => useEntityWorkspace(config))
    act(() => { result.current.handleSelect(config.entities[1]) })
    expect(result.current.focusedIndex).toBe(1)
    expect(config.selectEntity).toHaveBeenCalledWith(config.entities[1])
  })

  it('handleNavigateDown increments focusedIndex', () => {
    const config = makeConfig({ selectedEntity: makeEntity('1') })
    const { result } = renderHook(() => useEntityWorkspace(config))
    act(() => { result.current.setFocusedIndex(0) })
    act(() => { result.current.handleNavigateDown() })
    expect(result.current.focusedIndex).toBe(1)
  })

  it('handleNavigateUp decrements focusedIndex', () => {
    const config = makeConfig({ selectedEntity: makeEntity('2') })
    const { result } = renderHook(() => useEntityWorkspace(config))
    act(() => { result.current.setFocusedIndex(1) })
    act(() => { result.current.handleNavigateUp() })
    expect(result.current.focusedIndex).toBe(0)
  })

  it('handleNavigateToFirst sets focusedIndex to 0', () => {
    const config = makeConfig()
    const { result } = renderHook(() => useEntityWorkspace(config))
    act(() => { result.current.setFocusedIndex(2) })
    act(() => { result.current.handleNavigateToFirst() })
    expect(result.current.focusedIndex).toBe(0)
  })

  it('handleNavigateToLast sets focusedIndex to last', () => {
    const config = makeConfig()
    const { result } = renderHook(() => useEntityWorkspace(config))
    act(() => { result.current.handleNavigateToLast() })
    expect(result.current.focusedIndex).toBe(2)
  })

  it('setDeleteConfirmOpen controls dialog state', () => {
    const { result } = renderHook(() => useEntityWorkspace(makeConfig()))
    act(() => { result.current.setDeleteConfirmOpen(true) })
    expect(result.current.deleteConfirmOpen).toBe(true)
    act(() => { result.current.handleCancelDelete() })
    expect(result.current.deleteConfirmOpen).toBe(false)
  })

  it('handleEscapeAction clears selection and closes dialogs', () => {
    const config = makeConfig()
    const { result } = renderHook(() => useEntityWorkspace(config))
    act(() => { result.current.setDeleteConfirmOpen(true) })
    act(() => { result.current.handleEscapeAction() })
    expect(result.current.deleteConfirmOpen).toBe(false)
    expect(config.selectEntity).toHaveBeenCalledWith(null)
  })

  it('handleDelete calls deleteMutation and refetch on success', async () => {
    const config = makeConfig({ selectedEntity: makeEntity('1') })
    const { result } = renderHook(() => useEntityWorkspace(config))
    await act(async () => { await result.current.handleDelete() })
    expect(config.deleteMutation).toHaveBeenCalledWith('1')
    expect(config.refetch).toHaveBeenCalled()
    expect(result.current.deleteConfirmOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts
```

Expected: FAIL — `Cannot find module './useEntityWorkspace'`

- [ ] **Step 3: Implement useEntityWorkspace**

```typescript
// frontend/src/hooks/useEntityWorkspace.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'

export interface UseEntityWorkspaceConfig<T extends { id: string }> {
  entities: T[]
  selectedEntity: T | null
  selectEntity: (entity: T | null) => void
  refetch: () => void
  navigate: NavigateFunction
  routes: {
    create: string
    edit: (id: string) => string
  }
  notifications: {
    showSuccess: (msg: string) => void
    showError: (msg: string) => void
  }
  deleteMutation: (id: string) => Promise<void>
}

export interface EntityWorkspaceReturn<T extends { id: string }> {
  focusedIndex: number
  setFocusedIndex: (i: number) => void
  listRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  deleteConfirmOpen: boolean
  setDeleteConfirmOpen: (open: boolean) => void
  deletedEntitiesDialogOpen: boolean
  setDeletedEntitiesDialogOpen: (open: boolean) => void
  setShouldPreserveSearchFocus: (v: boolean) => void
  handleSelect: (entity: T) => void
  handleDelete: () => Promise<void>
  handleCancelDelete: () => void
  handleNavigateUp: () => void
  handleNavigateDown: () => void
  handleEnterAction: () => void
  handleEscapeAction: () => void
  handlePageUpNavigation: () => void
  handlePageDownNavigation: () => void
  handleNavigateToFirst: () => void
  handleNavigateToLast: () => void
}

export function useEntityWorkspace<T extends { id: string }>(
  config: UseEntityWorkspaceConfig<T>,
): EntityWorkspaceReturn<T> {
  const {
    entities,
    selectedEntity,
    selectEntity,
    refetch,
    navigate,
    routes,
    notifications,
    deleteMutation,
  } = config

  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletedEntitiesDialogOpen, setDeletedEntitiesDialogOpen] = useState(false)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const hasAutoSelected = useRef(false)

  // Auto-select first entity when none selected
  useEffect(() => {
    if (entities.length > 0 && !hasAutoSelected.current && focusedIndex === -1 && !selectedEntity) {
      hasAutoSelected.current = true
      setFocusedIndex(0)
      selectEntity(entities[0])
    } else if (entities.length === 0) {
      selectEntity(null)
      setFocusedIndex(-1)
    }
  }, [entities, focusedIndex, selectedEntity, selectEntity])

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const focusedRow = listRef.current.querySelector(`[data-index="${focusedIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedIndex])

  // Search focus preservation
  useEffect(() => {
    if (shouldPreserveSearchFocus && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
        setShouldPreserveSearchFocus(false)
      }, 0)
      return () => clearTimeout(timer)
    }
    if (shouldPreserveSearchFocus) {
      setShouldPreserveSearchFocus(false)
    }
  }, [shouldPreserveSearchFocus])

  const selectAtIndex = useCallback((index: number) => {
    setFocusedIndex(index)
    selectEntity(entities[index])
  }, [entities, selectEntity])

  const handleSelect = useCallback((entity: T) => {
    const index = entities.findIndex((e) => e.id === entity.id)
    setFocusedIndex(index)
    selectEntity(entity)
  }, [entities, selectEntity])

  const handleNavigateUp = useCallback(() => {
    if (focusedIndex > 0) selectAtIndex(focusedIndex - 1)
  }, [focusedIndex, selectAtIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedIndex < entities.length - 1) selectAtIndex(focusedIndex + 1)
  }, [focusedIndex, entities.length, selectAtIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (entities.length > 0) selectAtIndex(0)
  }, [entities.length, selectAtIndex])

  const handleNavigateToLast = useCallback(() => {
    if (entities.length > 0) selectAtIndex(entities.length - 1)
  }, [entities.length, selectAtIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedIndex - 20)
    if (entities[newIndex]) selectAtIndex(newIndex)
  }, [focusedIndex, entities, selectAtIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(entities.length - 1, focusedIndex + 20)
    if (entities[newIndex]) selectAtIndex(newIndex)
  }, [focusedIndex, entities, selectAtIndex])

  const handleEnterAction = useCallback(() => {
    if (focusedIndex >= 0 && entities[focusedIndex]) {
      navigate(routes.edit(entities[focusedIndex].id))
    }
  }, [focusedIndex, entities, navigate, routes])

  const handleEscapeAction = useCallback(() => {
    setFocusedIndex(-1)
    selectEntity(null)
    setDeleteConfirmOpen(false)
    setDeletedEntitiesDialogOpen(false)
  }, [selectEntity])

  const handleDelete = useCallback(async () => {
    if (!selectedEntity) return
    try {
      await deleteMutation(selectedEntity.id)
      notifications.showSuccess(`Deleted successfully`)
      selectEntity(null)
      setFocusedIndex(-1)
      setDeleteConfirmOpen(false)
      refetch()
    } catch (error: any) {
      const msg = error?.data?.message || error?.message || 'An unexpected error occurred.'
      notifications.showError(msg)
    }
  }, [selectedEntity, deleteMutation, notifications, selectEntity, refetch])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
  }, [])

  useKeyboardShortcuts({
    onSearch: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    },
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
    onEnter: handleEnterAction,
    onPageUp: handlePageUpNavigation,
    onPageDown: handlePageDownNavigation,
    onHome: handleNavigateToFirst,
    onEnd: handleNavigateToLast,
    onEscape: handleEscapeAction,
  })

  return {
    focusedIndex,
    setFocusedIndex,
    listRef,
    searchInputRef,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deletedEntitiesDialogOpen,
    setDeletedEntitiesDialogOpen,
    setShouldPreserveSearchFocus,
    handleSelect,
    handleDelete,
    handleCancelDelete,
    handleNavigateUp,
    handleNavigateDown,
    handleEnterAction,
    handleEscapeAction,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleNavigateToFirst,
    handleNavigateToLast,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts
```

Expected: All 10 tests PASS

- [ ] **Step 5: Write failing test for GenericListPage**

```typescript
// frontend/src/components/common/GenericListPage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GenericListPage from './GenericListPage'

const noop = () => {}
const filterConfig = { search: { placeholder: 'Search...' }, fields: [], defaults: {} }
const handlers = { onSearchChange: noop, onSearchCommit: noop, onQuickFilterChange: noop, onClearField: noop, onClearAll: noop }
const sort = { field: 'name', sortBy: 'name', sortOrder: 'asc' as const, onSort: noop }

const baseProps = {
  title: 'Test Title',
  subtitle: 'Test subtitle',
  primaryAction: { label: 'New Item', onClick: noop },
  secondaryAction: { label: 'View Deleted', onClick: noop },
  filterConfig,
  draftFilters: {},
  handlers,
  hasActiveFilters: false,
  searchInputRef: { current: null } as any,
  sort,
  listSlot: <div data-testid="list-slot">List</div>,
  headerSlot: <div data-testid="header-slot">Header</div>,
  workspaceSlot: <div data-testid="workspace-slot">Workspace</div>,
}

describe('GenericListPage', () => {
  it('renders title, subtitle, and all slots', () => {
    render(<GenericListPage {...baseProps} />)
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByTestId('list-slot')).toBeInTheDocument()
    expect(screen.getByTestId('header-slot')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-slot')).toBeInTheDocument()
  })

  it('does not render error banner when error is null', () => {
    render(<GenericListPage {...baseProps} error={null} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders error banner when error is provided', () => {
    render(<GenericListPage {...baseProps} error="Something went wrong" onErrorClose={noop} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('calls onErrorClose when error banner is dismissed', () => {
    const onErrorClose = vi.fn()
    render(<GenericListPage {...baseProps} error="Error" onErrorClose={onErrorClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onErrorClose).toHaveBeenCalled()
  })

  it('renders dialogs slot when provided', () => {
    render(<GenericListPage {...baseProps} dialogs={<div data-testid="dialogs">Dialogs</div>} />)
    expect(screen.getByTestId('dialogs')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run to confirm failure**

```bash
cd frontend && npx vitest run src/components/common/GenericListPage.test.tsx
```

Expected: FAIL — `Cannot find module './GenericListPage'`

- [ ] **Step 7: Implement GenericListPage**

```tsx
// frontend/src/components/common/GenericListPage.tsx
import React from 'react'
import type { ReactNode, RefObject } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import MasterDetailWorkspace from './MasterDetailWorkspace'
import PageHeader from './PageHeader'
import { FilterBar } from '@/components/filters'
import type { FilterBarConfig, FilterBarHandlers, FilterBarSortConfig } from '@/types/filterBar.types'

interface GenericListPageProps<F extends Record<string, unknown>> {
  title: string
  subtitle: string
  primaryAction: { label: string; onClick: () => void }
  secondaryAction: { label: string; onClick: () => void }
  filterConfig: FilterBarConfig<F>
  draftFilters: F
  handlers: FilterBarHandlers<F>
  hasActiveFilters: boolean
  searchInputRef: RefObject<HTMLInputElement | null>
  sort: FilterBarSortConfig
  error?: string | null
  onErrorClose?: () => void
  listSlot: ReactNode
  headerSlot: ReactNode
  workspaceSlot: ReactNode
  dialogs?: ReactNode
}

function GenericListPage<F extends Record<string, unknown>>({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  filterConfig,
  draftFilters,
  handlers,
  hasActiveFilters,
  searchInputRef,
  sort,
  error,
  onErrorClose,
  listSlot,
  headerSlot,
  workspaceSlot,
  dialogs,
}: GenericListPageProps<F>) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        variant="workflow"
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={searchInputRef}
            sort={sort}
          />
        )}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={onErrorClose}>
          {error}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={listSlot}
        headerSlot={headerSlot}
        workspaceSlot={workspaceSlot}
      />

      {dialogs}
    </Box>
  )
}

export default GenericListPage
```

- [ ] **Step 8: Run GenericListPage tests**

```bash
cd frontend && npx vitest run src/components/common/GenericListPage.test.tsx
```

Expected: All 5 tests PASS

- [ ] **Step 9: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 10: Commit**

```bash
git add frontend/src/hooks/useEntityWorkspace.ts frontend/src/hooks/useEntityWorkspace.test.ts frontend/src/components/common/GenericListPage.tsx frontend/src/components/common/GenericListPage.test.tsx
git commit -m "feat(frontend): add useEntityWorkspace hook and GenericListPage component with tests"
```

---

## Task 6: Pilot Migration — Backend (Customer + Supplier)

**Files:**
- Modify: `backend/src/modules/sales/dto/customer.dto.ts`
- Modify: `backend/src/modules/sales/services/customer.service.ts`
- Modify: `backend/src/modules/sales/controllers/customer.controller.ts`
- Modify: `backend/src/modules/purchasing/dto/supplier.dto.ts`
- Modify: `backend/src/modules/purchasing/services/supplier.service.ts`
- Modify: `backend/src/modules/purchasing/controllers/supplier.controller.ts`

- [ ] **Step 1: Extend QueryCustomersDto from BaseQueryDto**

In `backend/src/modules/sales/dto/customer.dto.ts`, change `QueryCustomersDto` to extend `BaseQueryDto`:

```typescript
// At top of file, add import:
import { BaseQueryDto } from '../../../common/dto/base-query.dto';
import { BaseContactDto } from '../../../common/dto/base-contact.dto';

// Replace the class definition (keep all existing entity-specific fields):
export class QueryCustomersDto extends BaseQueryDto {
  @IsOptional()
  @IsIn(['individual', 'business'])
  type?: 'individual' | 'business';

  @IsOptional()
  @IsUUID()
  priceListId?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'suspended', 'blacklisted'])
  status?: string;

  @IsOptional()
  @IsIn(['retail', 'wholesale', 'special'])
  pricingScheme?: string;
}

// Extend CreateCustomerDto from BaseContactDto — add the import and change:
// export class CreateCustomerDto extends BaseContactDto { ... }
// Keep all existing fields; remove phone/streetAddress/city/state/postalCode/country from the class
// body since they are now inherited from BaseContactDto.
```

- [ ] **Step 2: Extend CustomerService from BaseCrudService**

In `backend/src/modules/sales/services/customer.service.ts`:

```typescript
// Add imports at top:
import { BaseCrudService } from '../../../common/services/base-crud.service';

// Change class declaration:
export class CustomerService extends BaseCrudService<Customer, CreateCustomerDto, UpdateCustomerDto, QueryCustomersDto> {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    private readonly transactionManager: TransactionManager,
    auditLogService: AuditLogService,
  ) {
    super(customerRepository, auditLogService);
  }

  getEntityType(): string { return 'Customer'; }

  buildWhereClause(query: QueryCustomersDto): FindOptionsWhere<Customer> {
    const where: FindOptionsWhere<Customer> = {};
    if (query.type !== undefined) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    return where;
  }

  // Override applyQueryBuilder for joins and price list filter
  protected applyQueryBuilder(qb: any, query: QueryCustomersDto): any {
    qb = qb.leftJoinAndSelect('customer.priceList', 'priceList');
    if (query.priceListId) {
      qb = qb.andWhere('customer.priceListId = :priceListId', { priceListId: query.priceListId });
    }
    return qb;
  }

  // Remove these methods — they are now provided by BaseCrudService:
  // findAll, findOne, findDeleted, softDelete, restore, bulkRestore, bulkPermanentDelete, permanentDelete
  //
  // KEEP all entity-specific methods:
  // create (override to add phone uniqueness check and custom audit message)
  // update (override for custom logic)
  // delete (override to check dependencies before soft delete)
  // searchGlobal, getSalesHistory, getOutstandingInvoices, getCustomerStatistics,
  // recalculateAllCustomerTotals, updateCustomerMetrics, findSummaries, mapToResponseDto, etc.
}
```

- [ ] **Step 3: Extend CustomerController from BaseCrudController**

In `backend/src/modules/sales/controllers/customer.controller.ts`:

```typescript
// Add import:
import { BaseCrudController } from '../../../common/controllers/base-crud.controller';

// Change class declaration:
export class CustomerController extends BaseCrudController<Customer, CreateCustomerDto, UpdateCustomerDto, QueryCustomersDto> {
  constructor(private readonly customerService: CustomerService) {
    super(customerService);
  }

  // Remove these endpoints — provided by BaseCrudController:
  // GET /, GET /deleted, GET /:id, POST /, PUT /:id, DELETE /:id,
  // POST /:id/restore, POST /bulk-restore, POST /bulk-permanent-delete, DELETE /:id/permanent

  // KEEP all entity-specific endpoints:
  // GET /summary, GET /:id/sales-history, GET /:id/outstanding-invoices,
  // GET /:id/statistics, POST /recalculate-totals, POST /:id/update-metrics
}
```

- [ ] **Step 4: Apply identical pattern to Supplier**

Repeat Steps 1–3 for SupplierService and SupplierController:

- `QuerySupplierDto` extends `BaseQueryDto`, adds: `type?: 'local' | 'international'`, `status?`, `rating?`
- `CreateSupplierDto` extends `BaseContactDto`, adds `companyName`, `supplierCode`, `paymentTerms`, etc.
- `SupplierService` extends `BaseCrudService<Supplier, CreateSupplierDto, UpdateSupplierDto, SupplierQueryDto>`:
  - `getEntityType()` returns `'Supplier'`
  - `buildWhereClause` filters `type`, `isActive`, `rating`
  - Remove base methods; keep: `create` (override), `update` (override), `searchSuppliers`, `checkDuplicateCompanyName`, `getSupplierPurchaseOrders`, `getSupplierGRNs`, `getSupplierPayments`, `activate`, `suspend`, `canPurchase`
- `SupplierController` extends `BaseCrudController`:
  - Remove base endpoints; keep: `GET /check-duplicate`, `GET /search`, `GET /:id/purchase-orders`, `GET /:id/grns`, `GET /:id/payments`, `POST /:id/activate`, `POST /:id/suspend`, `GET /:id/can-purchase`

- [ ] **Step 5: Run the backend tests**

```bash
cd backend && npx jest src/modules/sales/services/customer.service.spec.ts src/modules/purchasing/services/supplier.service.spec.ts --no-coverage
```

Expected: All tests pass. Fix any failures before continuing — these are the signals that the base class interface is correct.

- [ ] **Step 6: Run full backend build**

```bash
cd backend && npm run build 2>&1 | head -30
```

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/sales/ backend/src/modules/purchasing/
git commit -m "feat(backend): migrate CustomerService and SupplierService to BaseCrudService (pilot)"
```

---

## Task 7: Pilot Migration — Frontend (CustomersPage + SuppliersPage)

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`

- [ ] **Step 1: Rewrite CustomersPage using GenericListPage and useEntityWorkspace**

Replace the entire contents of `frontend/src/pages/sales/CustomersPage.tsx`:

```tsx
import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useGetCustomersQuery, useDeleteCustomerMutation } from '@/store/api/salesApi'
import { selectSelectedCustomer, setSelectedCustomer } from '@/store/slices/salesSlice'
import GenericListPage from '@/components/common/GenericListPage'
import CustomerContextHeader from './components/CustomerContextHeader'
import CustomersDialogs from './components/CustomersDialogs'
import CustomerList from './components/CustomerList'
import CustomerWorkspaceCard from './components/CustomerWorkspaceCard'
import type { FilterBarConfig } from '@/types/filterBar.types'

interface CustomerFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'individual' | 'business' | null
  priceListId: string | null
}

const filterConfig: FilterBarConfig<CustomerFilters> = {
  search: { placeholder: 'Search by name or phone...' },
  fields: [
    { field: 'status', label: 'Status', type: 'status' },
    { field: 'type', label: 'Customer Type', type: 'customer-type' },
    { field: 'priceListId', label: 'Price List', type: 'price-list' },
  ],
  defaults: { search: '', status: null, type: null, priceListId: null },
}

const CustomersPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const selectedCustomer = useAppSelector(selectSelectedCustomer)
  const [pageError, setPageError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const queryParams = useMemo(() => ({
    search: appliedFilters.search || undefined,
    isActive: appliedFilters.status === 'active' ? true : appliedFilters.status === 'inactive' ? false : undefined,
    type: appliedFilters.type ?? undefined,
    priceListId: appliedFilters.priceListId ?? undefined,
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  }), [appliedFilters, sortBy, sortOrder])

  const { data: customersResponse, isLoading, isFetching, error, refetch } = useGetCustomersQuery(queryParams)
  const [deleteCustomer] = useDeleteCustomerMutation()
  const customers = customersResponse?.data ?? []

  const workspace = useEntityWorkspace({
    entities: customers,
    selectedEntity: selectedCustomer,
    selectEntity: (c) => dispatch(setSelectedCustomer(c)),
    refetch: () => { void refetch() },
    navigate,
    routes: { create: '/sales/customers/create', edit: (id) => `/sales/customers/${id}/edit` },
    notifications: { showSuccess, showError: (msg) => { setPageError(msg); showError(msg) } },
    deleteMutation: (id) => deleteCustomer(id).unwrap(),
  })

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      workspace.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, workspace])

  return (
    <GenericListPage
      title="Customers"
      subtitle="View customer profiles and client account details"
      primaryAction={{ label: 'New Customer', onClick: () => navigate('/sales/customers/create') }}
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedEntitiesDialogOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
      error={pageError || (error ? 'Failed to load customers.' : null)}
      onErrorClose={() => setPageError(null)}
      listSlot={(
        <CustomerList
          customers={customers}
          loading={isLoading || isFetching}
          total={customers.length}
          selectedCustomerId={selectedCustomer?.id}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          customerListRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <CustomerContextHeader
          selectedCustomer={selectedCustomer}
          onEdit={() => navigate(`/sales/customers/${selectedCustomer!.id}/edit`)}
          onDelete={() => workspace.setDeleteConfirmOpen(true)}
        />
      )}
      workspaceSlot={<CustomerWorkspaceCard selectedCustomer={selectedCustomer} />}
      dialogs={(
        <CustomersDialogs
          selectedCustomer={selectedCustomer}
          deleteConfirmOpen={workspace.deleteConfirmOpen}
          onConfirmDelete={workspace.handleDelete}
          onCancelDelete={workspace.handleCancelDelete}
          deletedCustomersDialogOpen={workspace.deletedEntitiesDialogOpen}
          onCloseDeletedCustomersDialog={() => workspace.setDeletedEntitiesDialogOpen(false)}
        />
      )}
    />
  )
}

export default CustomersPage
```

- [ ] **Step 2: Apply the same pattern to SuppliersPage**

Replace the entire contents of `frontend/src/pages/purchasing/SuppliersPage.tsx` following the exact same pattern as CustomersPage above, substituting:
- `customers` → `suppliers`, `Customer` → `Supplier` throughout
- `useGetSuppliersQuery` / `useDeleteSupplierMutation` from `purchasingApi`
- `selectSelectedSupplier` / `setSelectedSupplier` from `purchasingSlice`
- `filterConfig` fields: `status` and `type: 'supplier-type'` (no `priceListId`)
- `routes`: `{ create: '/purchasing/suppliers/create', edit: (id) => `/purchasing/suppliers/${id}/edit` }`
- Subtitle: `'Manage your suppliers and vendor relationships'`
- Sort field: `'companyName'`
- Pass `supplierListRef={workspace.listRef}` to `SupplierList`

- [ ] **Step 3: Run the existing filterbar tests to confirm no regression**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx
```

Expected: All tests pass. If any fail, the test is likely using the old hook names — update the test's mock imports to use `useEntityWorkspace` instead.

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx frontend/src/pages/purchasing/SuppliersPage.tsx
git commit -m "feat(frontend): migrate CustomersPage and SuppliersPage to GenericListPage (pilot)"
```

---

## Task 8: Backend Migration — Inventory Services

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts`
- Modify: `backend/src/modules/inventory/controllers/product.controller.ts`
- Modify: `backend/src/modules/inventory/services/category.service.ts`
- Modify: `backend/src/modules/inventory/controllers/category.controller.ts`
- Modify: `backend/src/modules/inventory/services/stock-adjustment.service.ts`
- Modify: `backend/src/modules/inventory/controllers/stock-adjustment.controller.ts`

Follow the exact same pattern established in Task 6 for each entity:

- [ ] **Step 1: Migrate ProductService and ProductController**

- `ProductService` extends `BaseCrudService<Product, CreateProductDto, UpdateProductDto, QueryProductDto>`
- `getEntityType()` returns `'Product'`
- `buildWhereClause` filters `isActive`, `categoryId`, `type`, `stockStatus`
- Keep all inventory-specific methods: costing strategy calls, `updateStock`, `searchProducts`, `findByBarcode`, `mapToResponseDto`, etc.
- `ProductController` extends `BaseCrudController`, keeps entity-specific endpoints: `GET /search`, `GET /:id/price`, `GET /:id/stock`, etc.

- [ ] **Step 2: Migrate CategoryService and CategoryController**

- `CategoryService` extends `BaseCrudService<Category, CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto>`
- `getEntityType()` returns `'Category'`
- `buildWhereClause` filters `isActive`, `parentId`
- `applyQueryBuilder` handles tree ordering (order by `level`, then `name`)
- Keep: `getTree`, `getProductCount`, `checkSmartDeleteDependencies`, etc.
- `CategoryController` extends `BaseCrudController`, keeps: `GET /tree`, `GET /:id/products`, smart-delete endpoint

- [ ] **Step 3: Migrate StockAdjustmentService and StockAdjustmentController**

- `StockAdjustmentService` extends `BaseCrudService<StockAdjustment, CreateStockAdjustmentDto, UpdateStockAdjustmentDto, QueryStockAdjustmentDto>`
- `getEntityType()` returns `'StockAdjustment'`
- `buildWhereClause` filters `status`, `adjustmentType`, `isActive`
- Keep: `confirm`, `cancel`, stock movement side-effects, `mapToResponseDto`
- `StockAdjustmentController` extends `BaseCrudController`, keeps: `POST /:id/confirm`, `POST /:id/cancel`

- [ ] **Step 4: Run inventory backend tests**

```bash
cd backend && npx jest src/modules/inventory --no-coverage
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/inventory/
git commit -m "feat(backend): migrate Inventory services and controllers to BaseCrudService"
```

---

## Task 9: Backend Migration — Sales Services (Orders, Invoices, Payments)

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.service.ts`
- Modify: `backend/src/modules/sales/controllers/sales-order.controller.ts`
- Modify: `backend/src/modules/sales/services/invoice.service.ts`
- Modify: `backend/src/modules/sales/controllers/invoice.controller.ts`
- Modify: `backend/src/modules/sales/services/payment.service.ts`
- Modify: `backend/src/modules/sales/controllers/payment.controller.ts`

Follow the same pattern as Task 6 for each entity:

- [ ] **Step 1: Migrate SalesOrderService and SalesOrderController**

- `SalesOrderService` extends `BaseCrudService<SalesOrder, CreateSalesOrderDto, UpdateSalesOrderDto, QuerySalesOrderDto>`
- `getEntityType()` returns `'SalesOrder'`
- `buildWhereClause` filters `status`, `customerId`, `isActive`
- Keep: `confirm`, `cancel`, `addLineItem`, `removeLineItem`, `recalculateTotals`, accounting auto-post hooks, `mapToResponseDto`
- `SalesOrderController`: keep `POST /:id/confirm`, `POST /:id/cancel`, `GET /:id/line-items`, etc.

- [ ] **Step 2: Migrate InvoiceService and InvoiceController**

- `InvoiceService` extends `BaseCrudService<Invoice, CreateInvoiceDto, UpdateInvoiceDto, QueryInvoiceDto>`
- `getEntityType()` returns `'Invoice'`
- `buildWhereClause` filters `status`, `customerId`, `isActive`
- Keep: `markPaid`, `addPayment`, `getOutstandingAmount`, accounting hooks, `mapToResponseDto`
- `InvoiceController`: keep payment and status endpoints

- [ ] **Step 3: Migrate PaymentService and PaymentController**

- `PaymentService` extends `BaseCrudService<Payment, CreatePaymentDto, UpdatePaymentDto, QueryPaymentDto>`
- `getEntityType()` returns `'Payment'`
- `buildWhereClause` filters `customerId`, `status`, `isActive`
- Keep: `applyToInvoice`, accounting hooks, `mapToResponseDto`

- [ ] **Step 4: Run sales backend tests**

```bash
cd backend && npx jest src/modules/sales --no-coverage
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/
git commit -m "feat(backend): migrate Sales services and controllers to BaseCrudService"
```

---

## Task 10: Backend Migration — Purchasing Services

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`
- Modify: `backend/src/modules/purchasing/controllers/purchase-order.controller.ts`
- Modify: `backend/src/modules/purchasing/services/goods-received-note.service.ts`
- Modify: `backend/src/modules/purchasing/controllers/goods-received-note.controller.ts`
- Modify: `backend/src/modules/purchasing/services/vendor-payment.service.ts`
- Modify: `backend/src/modules/purchasing/controllers/vendor-payment.controller.ts`

- [ ] **Step 1: Migrate PurchaseOrderService and PurchaseOrderController**

- `PurchaseOrderService` extends `BaseCrudService<PurchaseOrder, CreatePurchaseOrderDto, UpdatePurchaseOrderDto, QueryPurchaseOrderDto>`
- `getEntityType()` returns `'PurchaseOrder'`
- `buildWhereClause` filters `status`, `supplierId`, `isActive`
- Keep: `confirm`, `cancel`, `approve`, `matchGRN`, accounting hooks, `mapToResponseDto`

- [ ] **Step 2: Migrate GoodsReceivedNoteService and GoodsReceivedNoteController**

- `GoodsReceivedNoteService` extends `BaseCrudService<GoodsReceivedNote, CreateGRNDto, UpdateGRNDto, QueryGRNDto>`
- `getEntityType()` returns `'GoodsReceivedNote'`
- `buildWhereClause` filters `supplierId`, `purchaseOrderId`, `status`
- Keep: `confirm`, stock movement side-effects, costing updates, `mapToResponseDto`

- [ ] **Step 3: Migrate VendorPaymentService and VendorPaymentController**

- `VendorPaymentService` extends `BaseCrudService<VendorPayment, CreateVendorPaymentDto, UpdateVendorPaymentDto, QueryVendorPaymentDto>`
- `getEntityType()` returns `'VendorPayment'`
- `buildWhereClause` filters `supplierId`, `status`, `isActive`
- Keep: `applyToPurchaseOrder`, accounting hooks, `mapToResponseDto`

- [ ] **Step 4: Run purchasing backend tests**

```bash
cd backend && npx jest src/modules/purchasing --no-coverage
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/purchasing/
git commit -m "feat(backend): migrate Purchasing services and controllers to BaseCrudService"
```

---

## Task 11: Transaction Base Entities — Wire SalesOrder and PurchaseOrder

**Files:**
- Modify: `backend/src/database/entities/sales-order.entity.ts`
- Modify: `backend/src/database/entities/sales-order-item.entity.ts`
- Modify: `backend/src/database/entities/purchase-order.entity.ts`
- Modify: `backend/src/database/entities/purchase-order-item.entity.ts`
- Modify: `backend/src/database/entities/invoice.entity.ts`
- Modify: `backend/src/database/entities/invoice-item.entity.ts`
- Modify: `backend/src/database/entities/goods-received-note-item.entity.ts`

- [ ] **Step 1: Extend SalesOrder from BaseTransactionHeader**

In `backend/src/database/entities/sales-order.entity.ts`:

```typescript
// Add import:
import { BaseTransactionHeader } from './base-transaction-header.entity';

// Change class declaration:
@Entity('sales_orders')
export class SalesOrder extends BaseTransactionHeader {
  // REMOVE fields already defined in BaseTransactionHeader:
  // status, notes, subtotal, taxAmount, discountAmount, totalAmount, createdByUserId, createdByUsername
  //
  // KEEP all SalesOrder-specific fields:
  // orderNumber, customerId, customer (relation), deliveryDate, shippingAddress,
  // salesOrderItems (relation), invoices (relation), etc.
}
```

- [ ] **Step 2: Extend SalesOrderItem from BaseTransactionItem**

```typescript
// Add import:
import { BaseTransactionItem } from './base-transaction-item.entity';

// Change class declaration:
@Entity('sales_order_items')
export class SalesOrderItem extends BaseTransactionItem {
  // REMOVE fields already in BaseTransactionItem:
  // productId, description, quantity, unitPrice, discountType, discountValue, taxRate, subtotal, totalAmount
  //
  // KEEP SalesOrderItem-specific fields:
  // salesOrderId, salesOrder (relation), product (relation), etc.
}
```

- [ ] **Step 3: Apply same pattern to PurchaseOrder, PurchaseOrderItem, Invoice, InvoiceItem, GoodsReceivedNoteItem**

Each extends its respective abstract base. Only remove fields already defined in the base; keep all entity-specific fields and relations.

- [ ] **Step 4: Run build to confirm no schema changes and no TypeScript errors**

```bash
cd backend && npm run build 2>&1 | head -30
```

Expected: 0 errors. No migration generated (these are TypeScript-only changes to abstract parent classes).

- [ ] **Step 5: Verify no migration is needed**

```bash
cd backend && npm run migration:generate --name=CheckNoChanges 2>&1 | tail -5
```

Expected: `No changes in database schema were found` (or the generated migration file is empty — delete it if created).

- [ ] **Step 6: Run all backend tests**

```bash
cd backend && npm run test 2>&1 | tail -20
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/src/database/entities/
git commit -m "feat(backend): extend transaction entities from BaseTransactionHeader and BaseTransactionItem"
```

---

## Task 12: Frontend — TransactionForm Component

**Files:**
- Create: `frontend/src/components/common/TransactionForm.tsx`
- Create: `frontend/src/components/common/TransactionForm.test.tsx`

- [ ] **Step 1: Read the current CreateSalesOrderPage to understand form structure**

```bash
wc -l frontend/src/pages/sales/CreateSalesOrderPage.tsx frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx
```

Then read both files to identify the shared form fields, line-item table structure, and totals logic before implementing `TransactionForm`.

- [ ] **Step 2: Write failing tests for TransactionForm**

```typescript
// frontend/src/components/common/TransactionForm.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TransactionForm from './TransactionForm'

const baseProps = {
  entityLabel: 'Customer' as const,
  entityOptions: [
    { id: 'c1', name: 'Customer A' },
    { id: 'c2', name: 'Customer B' },
  ],
  lineItemColumns: [
    { key: 'product', label: 'Product' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unitPrice', label: 'Unit Price' },
  ],
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
  isSubmitting: false,
}

describe('TransactionForm', () => {
  it('renders entity selector with entityLabel', () => {
    render(<TransactionForm {...baseProps} />)
    expect(screen.getByLabelText('Customer')).toBeInTheDocument()
  })

  it('does not render entity selector when entityLabel is undefined', () => {
    render(<TransactionForm {...baseProps} entityLabel={undefined} />)
    expect(screen.queryByLabelText('Customer')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Supplier')).not.toBeInTheDocument()
  })

  it('renders Add Line Item button', () => {
    render(<TransactionForm {...baseProps} />)
    expect(screen.getByText('Add Line Item')).toBeInTheDocument()
  })

  it('adds a line item row when Add Line Item is clicked', () => {
    render(<TransactionForm {...baseProps} />)
    fireEvent.click(screen.getByText('Add Line Item'))
    expect(screen.getAllByLabelText('Qty')).toHaveLength(1)
  })

  it('removes a line item row when remove is clicked', () => {
    render(<TransactionForm {...baseProps} />)
    fireEvent.click(screen.getByText('Add Line Item'))
    fireEvent.click(screen.getByLabelText('Remove line item'))
    expect(screen.queryAllByLabelText('Qty')).toHaveLength(0)
  })

  it('calls onCancel when Cancel is clicked', () => {
    render(<TransactionForm {...baseProps} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(baseProps.onCancel).toHaveBeenCalled()
  })

  it('calls onSubmit with form data when submitted', async () => {
    render(<TransactionForm {...baseProps} />)
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(baseProps.onSubmit).toHaveBeenCalled())
  })

  it('disables Save button when isSubmitting is true', () => {
    render(<TransactionForm {...baseProps} isSubmitting />)
    expect(screen.getByText('Save')).toBeDisabled()
  })
})
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd frontend && npx vitest run src/components/common/TransactionForm.test.tsx
```

Expected: FAIL — `Cannot find module './TransactionForm'`

- [ ] **Step 4: Implement TransactionForm**

After reading CreateSalesOrderPage and CreatePurchaseOrderPage in Step 1, implement `TransactionForm` extracting the shared UI. The component must:
- Accept `entityLabel: 'Customer' | 'Supplier' | undefined` — renders a partner selector autocomplete when defined, omits it when undefined (Stock Adjustments)
- Accept `entityOptions: { id: string; name: string }[]` for the partner selector
- Accept `lineItemColumns: { key: string; label: string }[]` defining which columns appear in the line-items table
- Manage line item rows as local state (add/remove)
- Show a running total at the bottom
- Call `onSubmit(formData)` on form submission
- Call `onCancel()` on cancel

The exact field layout should match the existing Create pages — do not change the visual design.

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/common/TransactionForm.test.tsx
```

Expected: All 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/TransactionForm.tsx frontend/src/components/common/TransactionForm.test.tsx
git commit -m "feat(frontend): add TransactionForm unified order-entry component with tests"
```

---

## Task 13: Frontend — Migrate Inventory List Pages

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`
- Modify: `frontend/src/pages/inventory/CategoriesPage.tsx`
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`

Follow the exact pattern from Task 7. For each page:

- [ ] **Step 1: Migrate ProductsPage**

Replace with `GenericListPage` + `useEntityWorkspace`. Unique considerations:
- `ProductImportDialog` is passed via `dialogs` slot alongside `ProductsDialogs`
- RTK Query: `useGetProductsQuery`, `useDeleteProductMutation` from `inventoryApi`
- Redux: `selectSelectedProduct` / `setSelectedProduct` from `inventorySlice`
- Routes: `{ create: '/inventory/products/create', edit: (id) => `/inventory/products/${id}/edit` }`
- Sort field: `'name'`

- [ ] **Step 2: Migrate CategoriesPage**

Replace with `GenericListPage` + `useEntityWorkspace`. Unique considerations:
- **Keep local state** for smart-delete: `const [smartDeleteOpen, setSmartDeleteOpen] = useState(false)` and `const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)` and `const [deleteError, setDeleteError] = useState<string | null>(null)`
- These local state vars are passed to `CategoryDialogs` in the `dialogs` slot
- RTK Query: `useGetCategoriesQuery`, `useDeleteCategoryMutation` from `inventoryApi`
- Redux: `selectSelectedCategory` / `setSelectedCategory` from `inventorySlice`
- Routes: `{ create: '/inventory/categories/create', edit: (id) => `/inventory/categories/${id}/edit` }`

- [ ] **Step 3: Migrate StockAdjustmentsPage**

- RTK Query: `useGetStockAdjustmentsQuery`, `useDeleteStockAdjustmentMutation`
- Redux: `selectSelectedStockAdjustment` / `setSelectedStockAdjustment`
- Routes: `{ create: '/inventory/adjustments/create', edit: (id) => `/inventory/adjustments/${id}/edit` }`

- [ ] **Step 4: Run existing inventory filterbar tests**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/
git commit -m "feat(frontend): migrate Inventory list pages to GenericListPage"
```

---

## Task 14: Frontend — Migrate Sales List Pages (Orders, Invoices, Payments)

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/pages/sales/InvoicesPage.tsx`
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`

Follow the exact pattern from Task 7 for each page:

- [ ] **Step 1: Migrate OrdersPage**

- RTK Query: `useGetSalesOrdersQuery`, `useDeleteSalesOrderMutation`
- Redux: `selectSelectedOrder` / `setSelectedOrder`
- Routes: `{ create: '/sales/orders/create', edit: (id) => `/sales/orders/${id}/edit` }`
- Sort field: `'orderNumber'`

- [ ] **Step 2: Migrate InvoicesPage**

- RTK Query: `useGetInvoicesQuery`, `useDeleteInvoiceMutation`
- Redux: `selectSelectedInvoice` / `setSelectedInvoice`
- Routes: `{ create: '/sales/invoices/create', edit: (id) => `/sales/invoices/${id}/edit` }`

- [ ] **Step 3: Migrate PaymentsPage**

- RTK Query: `useGetPaymentsQuery`, `useDeletePaymentMutation`
- Redux: `selectSelectedPayment` / `setSelectedPayment`
- Routes: `{ create: '/sales/payments/create', edit: (id) => `/sales/payments/${id}/edit` }`

- [ ] **Step 4: Run sales filterbar tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx frontend/src/pages/sales/InvoicesPage.tsx frontend/src/pages/sales/PaymentsPage.tsx
git commit -m "feat(frontend): migrate Sales list pages (Orders, Invoices, Payments) to GenericListPage"
```

---

## Task 15: Frontend — Migrate Purchasing List Pages

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Modify: `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`

Follow the exact pattern from Task 7 for each page:

- [ ] **Step 1: Migrate PurchaseOrdersPage**

- RTK Query: `useGetPurchaseOrdersQuery`, `useDeletePurchaseOrderMutation`
- Redux: `selectSelectedPurchaseOrder` / `setSelectedPurchaseOrder`
- Routes: `{ create: '/purchasing/orders/create', edit: (id) => `/purchasing/orders/${id}/edit` }`

- [ ] **Step 2: Migrate GoodsReceivedPage**

- RTK Query: `useGetGRNsQuery`, `useDeleteGRNMutation`
- Redux: `selectSelectedGRN` / `setSelectedGRN`
- Routes: `{ create: '/purchasing/grns/create', edit: (id) => `/purchasing/grns/${id}/edit` }`

- [ ] **Step 3: Migrate VendorPaymentsPage**

- RTK Query: `useGetVendorPaymentsQuery`, `useDeleteVendorPaymentMutation`
- Redux: `selectSelectedVendorPayment` / `setSelectedVendorPayment`
- Routes: `{ create: '/purchasing/vendor-payments/create', edit: (id) => `/purchasing/vendor-payments/${id}/edit` }`

- [ ] **Step 4: Run purchasing filterbar tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx frontend/src/pages/purchasing/GoodsReceivedPage.tsx frontend/src/pages/purchasing/VendorPaymentsPage.tsx
git commit -m "feat(frontend): migrate Purchasing list pages to GenericListPage"
```

---

## Task 16: Frontend — Migrate Create/Form Pages to TransactionForm

**Files:**
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx`
- Modify: `frontend/src/pages/sales/CustomerFormPage.tsx`
- Modify: `frontend/src/pages/purchasing/SupplierFormPage.tsx`

- [ ] **Step 1: Refactor CreateSalesOrderPage to use TransactionForm**

Extract the shared form UI into `TransactionForm` usage:

```tsx
// In CreateSalesOrderPage, replace the inline form with:
<TransactionForm
  entityLabel="Customer"
  entityOptions={customers.map(c => ({ id: c.id, name: c.name }))}
  lineItemColumns={[
    { key: 'product', label: 'Product' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unitPrice', label: 'Unit Price' },
    { key: 'discount', label: 'Discount' },
    { key: 'subtotal', label: 'Subtotal' },
  ]}
  onSubmit={handleSubmit}
  onCancel={() => navigate('/sales/orders')}
  isSubmitting={isSubmitting}
/>
```

Sales-specific logic (credit limit check, price list application) stays in the page component as `onSubmit` wrapper logic.

- [ ] **Step 2: Refactor CreatePurchaseOrderPage to use TransactionForm**

```tsx
<TransactionForm
  entityLabel="Supplier"
  entityOptions={suppliers.map(s => ({ id: s.id, name: s.companyName }))}
  lineItemColumns={[
    { key: 'product', label: 'Product' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unitPrice', label: 'Cost Price' },
    { key: 'discount', label: 'Discount' },
    { key: 'subtotal', label: 'Subtotal' },
  ]}
  onSubmit={handleSubmit}
  onCancel={() => navigate('/purchasing/orders')}
  isSubmitting={isSubmitting}
/>
```

Purchase-specific logic (PO approval workflow) stays in the `onSubmit` handler.

- [ ] **Step 3: Refactor CreateStockAdjustmentPage to use TransactionForm**

```tsx
<TransactionForm
  entityLabel={undefined}
  entityOptions={[]}
  lineItemColumns={[
    { key: 'product', label: 'Product' },
    { key: 'adjustmentType', label: 'Adjustment Type' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'notes', label: 'Notes' },
  ]}
  onSubmit={handleSubmit}
  onCancel={() => navigate('/inventory/adjustments')}
  isSubmitting={isSubmitting}
/>
```

- [ ] **Step 4: CreateProductPage and form pages — no TransactionForm needed**

`CreateProductPage`, `CustomerFormPage`, and `SupplierFormPage` use simple field forms, not line-item tables. They do NOT use `TransactionForm`. Verify they are already concise (< 80 lines of JSX). If not, extract repeated field groups into small local components within the file.

- [ ] **Step 5: Run create page tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/CreateSalesOrderPage.tsx frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx
git commit -m "feat(frontend): migrate Create/Form pages to use TransactionForm component"
```

---

## Task 17: Delete Dead Code

**Files:**
- Delete: All `useXxxPageState.ts`, `useXxxSelection.ts`, `useXxxActions.ts` files in sales/purchasing/inventory hooks directories

- [ ] **Step 1: Delete the now-unused per-entity hook files**

```bash
# Sales hooks
rm frontend/src/pages/sales/hooks/useCustomersPageState.ts
rm frontend/src/pages/sales/hooks/useCustomersSelection.ts
rm frontend/src/pages/sales/hooks/useCustomersActions.ts
rm frontend/src/pages/sales/hooks/useOrdersPageState.ts
rm frontend/src/pages/sales/hooks/useOrdersSelection.ts
rm frontend/src/pages/sales/hooks/useOrdersActions.ts
rm frontend/src/pages/sales/hooks/useInvoicesPageState.ts
rm frontend/src/pages/sales/hooks/useInvoicesSelection.ts
rm frontend/src/pages/sales/hooks/useInvoicesActions.ts
rm frontend/src/pages/sales/hooks/usePaymentsPageState.ts
rm frontend/src/pages/sales/hooks/usePaymentsSelection.ts

# Purchasing hooks
rm frontend/src/pages/purchasing/hooks/useSuppliersPageState.ts
rm frontend/src/pages/purchasing/hooks/useSuppliersSelection.ts
rm frontend/src/pages/purchasing/hooks/useSuppliersActions.ts
rm frontend/src/pages/purchasing/hooks/usePurchaseOrdersPageState.ts
rm frontend/src/pages/purchasing/hooks/usePurchaseOrdersSelection.ts
rm frontend/src/pages/purchasing/hooks/usePurchaseOrdersActions.ts
rm frontend/src/pages/purchasing/hooks/useGRNPageState.ts
rm frontend/src/pages/purchasing/hooks/useGRNSelection.ts
rm frontend/src/pages/purchasing/hooks/useVendorPaymentsPageState.ts
rm frontend/src/pages/purchasing/hooks/useVendorPaymentsSelection.ts

# Inventory hooks
rm frontend/src/pages/inventory/hooks/useProductsPageState.ts
rm frontend/src/pages/inventory/hooks/useProductsSelection.ts
rm frontend/src/pages/inventory/hooks/useProductsActions.ts
rm frontend/src/pages/inventory/hooks/useCategoriesPageState.ts
rm frontend/src/pages/inventory/hooks/useCategoriesSelection.ts
rm frontend/src/pages/inventory/hooks/useCategoriesActions.ts
rm frontend/src/pages/inventory/hooks/useStockAdjustmentsPageState.ts
rm frontend/src/pages/inventory/hooks/useStockAdjustmentsSelection.ts
rm frontend/src/pages/inventory/hooks/useStockAdjustmentsActions.ts
```

- [ ] **Step 2: Run TypeScript check to confirm no dangling imports**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: 0 errors. If there are errors, a file still imports a deleted hook — fix the import.

- [ ] **Step 3: Run full frontend test suite**

```bash
cd frontend && npm run test 2>&1 | tail -30
```

This takes ~12 minutes. Expected: All tests pass. Do NOT assume it is hung — wait for completion.

- [ ] **Step 4: Run full backend test suite**

```bash
cd backend && npm run test 2>&1 | tail -20
```

Expected: All tests pass

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: delete per-entity hook files replaced by useEntityWorkspace"
```

---

## Task 18: Final Verification

- [ ] **Step 1: TypeScript check (frontend)**

```bash
cd frontend && npm run type-check 2>&1
```

Expected: 0 errors

- [ ] **Step 2: Lint (frontend)**

```bash
cd frontend && npm run lint 2>&1 | tail -10
```

Expected: 0 errors

- [ ] **Step 3: Lint + format (backend)**

```bash
cd backend && npm run lint && npm run format 2>&1 | tail -10
```

Expected: 0 errors

- [ ] **Step 4: Verify page line counts**

```bash
wc -l \
  frontend/src/pages/sales/CustomersPage.tsx \
  frontend/src/pages/purchasing/SuppliersPage.tsx \
  frontend/src/pages/inventory/ProductsPage.tsx \
  frontend/src/pages/inventory/CategoriesPage.tsx \
  frontend/src/pages/inventory/StockAdjustmentsPage.tsx \
  frontend/src/pages/sales/OrdersPage.tsx \
  frontend/src/pages/sales/InvoicesPage.tsx \
  frontend/src/pages/sales/PaymentsPage.tsx \
  frontend/src/pages/purchasing/PurchaseOrdersPage.tsx \
  frontend/src/pages/purchasing/GoodsReceivedPage.tsx \
  frontend/src/pages/purchasing/VendorPaymentsPage.tsx
```

Expected: Each file ≤ 80 lines

- [ ] **Step 5: Verify no database migrations were generated**

```bash
ls -lt backend/src/database/migrations/ | head -5
```

Expected: No new migration files since the start of this branch

- [ ] **Step 6: Final commit if any lint fixes were made**

```bash
git add -A
git commit -m "chore: final lint and format fixes for unified module engine"
```

---

## Self-Review Checklist

| Spec requirement | Task that covers it |
|---|---|
| `BaseCrudService` with findAll/findOne/softDelete/restore/bulk/audit | Task 2 |
| `BaseCrudController` with standard endpoints | Task 3 |
| `BaseQueryDto` / `BaseContactDto` | Task 1 |
| `BaseTransactionHeader` / `BaseTransactionItem` | Task 4 |
| `useEntityWorkspace` hook with tests | Task 5 |
| `GenericListPage` component with tests | Task 5 |
| Pilot migration (Customer/Supplier backend) | Task 6 |
| Pilot migration (CustomersPage/SuppliersPage frontend) | Task 7 |
| All 11 backend services migrated | Tasks 6, 8, 9, 10 |
| `BaseTransactionHeader` wired to real entities | Task 11 |
| `TransactionForm` component with tests | Task 12 |
| All 11 frontend list pages migrated | Tasks 7, 13, 14, 15 |
| Create/Form pages using TransactionForm | Task 16 |
| Dead code deleted | Task 17 |
| All tests pass, 0 TS errors, pages ≤ 80 lines | Task 18 |
| No database migrations | Task 11 Step 5, Task 18 Step 5 |
| Audit logs fire for all CRUD operations | Task 2 (base), Task 6 Step 5 (validated in tests) |
