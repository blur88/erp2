# Search Phase 5: Analytics & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend infrastructure to log search queries, track result clicks, and auto-purge data older than 90 days — without ever affecting search UX on failure.

**Architecture:** Two new lightweight entities (`SearchQuery`, `SearchClick`) live alongside the existing search module. `SearchAnalyticsService` provides fire-and-forget `logQuery()` and `logClick()` methods. `SearchScheduler` runs a transactional retention cleanup daily at 2 AM. The search response gains a `searchQueryId` field generated synchronously before any DB write.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 18, `@nestjs/schedule` (already wired), `uuid` (already a project dep), `class-validator`, Jest

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `backend/src/database/entities/search-query.entity.ts` | `SearchQuery` entity — lightweight, no soft-delete fields |
| Create | `backend/src/database/entities/search-click.entity.ts` | `SearchClick` entity — FK to SearchQuery, nullable |
| Create | `backend/src/modules/search/search-result-type.enum.ts` | `SearchResultType` enum for `@IsEnum()` DTO validation |
| Create | `backend/src/modules/search/search-analytics.service.ts` | `logQuery()` and `logClick()` — fire-and-forget, never throw |
| Create | `backend/src/modules/search/search.scheduler.ts` | Transactional daily retention cleanup |
| Create | `backend/src/modules/search/dto/track-click.dto.ts` | Validated DTO for `POST /search/click` |
| Modify | `backend/src/database/entities/index.ts` | Export new entities |
| Modify | `backend/src/config/database-config.factory.ts` | Register `SearchQuery` + `SearchClick` in `entities` array |
| Modify | `backend/src/modules/search/dto/global-search-response.dto.ts` | Add `searchQueryId: string` |
| Modify | `backend/src/modules/search/search.service.ts` | Generate `searchQueryId`, call `logQuery()`, return ID in response |
| Modify | `backend/src/modules/search/search.controller.ts` | Add `POST /search/click` endpoint |
| Modify | `backend/src/modules/search/search.module.ts` | Register new entities, providers, DataSource |
| Create | `backend/src/database/migrations/<timestamp>-AddSearchAnalyticsTables.ts` | Create both tables + indexes |

---

## Task 1: Create `SearchResultType` enum

This enum mirrors `GlobalSearchResultType` and enables `@IsEnum()` DTO validation. It must be created first since the DTO depends on it.

**Files:**
- Create: `backend/src/modules/search/search-result-type.enum.ts`

- [ ] **Step 1: Create the enum file**

```typescript
// backend/src/modules/search/search-result-type.enum.ts
export enum SearchResultType {
  PAGE = 'page',
  CUSTOMER = 'customer',
  PRODUCT = 'product',
  TRANSACTION = 'transaction',
  SUPPLIER = 'supplier',
  INVOICE = 'invoice',
  CUSTOMER_PAYMENT = 'customer_payment',
  VENDOR_PAYMENT = 'vendor_payment',
  JOURNAL_ENTRY = 'journal_entry',
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/search/search-result-type.enum.ts
git commit -m "feat(search): add SearchResultType enum for analytics DTO validation"
```

---

## Task 2: Create entity files

Two lightweight entities — no `BaseEntity` inheritance (avoids `deletedAt`/`isActive` noise on append-only telemetry). `SearchQuery` uses `@PrimaryColumn('uuid')` because the service pre-generates the ID. `SearchClick` uses `@PrimaryGeneratedColumn('uuid')`.

**Files:**
- Create: `backend/src/database/entities/search-query.entity.ts`
- Create: `backend/src/database/entities/search-click.entity.ts`

- [ ] **Step 1: Create `SearchQuery` entity**

```typescript
// backend/src/database/entities/search-query.entity.ts
import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('search_queries')
@Index(['userId'])
@Index(['resultCount', 'createdAt'])
export class SearchQuery {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  query: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'int' })
  resultCount: number;

  @Column({ type: 'int' })
  executionTimeMs: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
```

- [ ] **Step 2: Create `SearchClick` entity**

```typescript
// backend/src/database/entities/search-click.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { SearchQuery } from './search-query.entity';

@Entity('search_clicks')
export class SearchClick {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SearchQuery, { nullable: true, onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'search_query_id' })
  @Index()
  searchQuery: SearchQuery | null;

  @Column({ type: 'uuid', nullable: true, name: 'search_query_id' })
  searchQueryId: string | null;

  @Column({ type: 'varchar', length: 500 })
  query: string;

  @Column({ type: 'varchar', length: 100 })
  resultType: string;

  @Column({ type: 'varchar', length: 255 })
  resultId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resultLabel: string | null;

  @Column({ type: 'int' })
  position: number;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
```

- [ ] **Step 3: Export from entities index**

Open `backend/src/database/entities/index.ts` and add at the appropriate alphabetical position:

```typescript
export { SearchClick } from './search-click.entity';
export { SearchQuery } from './search-query.entity';
```

- [ ] **Step 4: Register in `database-config.factory.ts`**

Open `backend/src/config/database-config.factory.ts`.

Add imports near the other `S` imports:
```typescript
import { SearchClick } from '../database/entities/search-click.entity';
import { SearchQuery } from '../database/entities/search-query.entity';
```

Add to the `entities` array (line ~86–94, after `SalesOrderItem`):
```typescript
SearchClick, SearchQuery,
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/entities/search-query.entity.ts \
        backend/src/database/entities/search-click.entity.ts \
        backend/src/database/entities/index.ts \
        backend/src/config/database-config.factory.ts
git commit -m "feat(search): add SearchQuery and SearchClick entities"
```

---

## Task 3: Create the migration

Generate the migration, then verify it creates both tables with the correct indexes.

**Files:**
- Create: `backend/src/database/migrations/<timestamp>-AddSearchAnalyticsTables.ts`

- [ ] **Step 1: Generate the migration**

```bash
cd backend && npm run migration:generate --name=AddSearchAnalyticsTables
```

Expected: a new file in `backend/src/database/migrations/` with timestamp prefix.

- [ ] **Step 2: Verify the generated migration**

Open the generated migration file and confirm it contains:
- `CREATE TABLE "search_queries"` with columns: `id uuid PK`, `query varchar(500)`, `user_id uuid`, `result_count int`, `execution_time_ms int`, `created_at timestamptz`
- `CREATE TABLE "search_clicks"` with columns: `id uuid PK`, `search_query_id uuid nullable FK`, `query varchar(500)`, `result_type varchar(100)`, `result_id varchar(255)`, `result_label varchar(255) nullable`, `position int`, `created_at timestamptz`
- Indexes on `search_queries`: `createdAt`, `userId`, `(resultCount, createdAt)`
- Indexes on `search_clicks`: `createdAt`, `searchQueryId`

If the generated migration looks correct, proceed. If indexes are missing or columns are wrong, fix the entity files and regenerate.

- [ ] **Step 3: Run the migration**

```bash
cd backend && npm run migration:run
```

Expected: migration runs without error.

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/database/migrations/
git commit -m "feat(search): add search analytics tables migration"
```

---

## Task 4: Create `track-click.dto.ts`

**Files:**
- Create: `backend/src/modules/search/dto/track-click.dto.ts`

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/modules/search/dto/track-click.dto.spec.ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TrackClickDto } from './track-click.dto';
import { SearchResultType } from '../search-result-type.enum';

describe('TrackClickDto', () => {
  function make(overrides: Partial<TrackClickDto> = {}): TrackClickDto {
    return plainToInstance(TrackClickDto, {
      query: 'acme',
      resultType: SearchResultType.CUSTOMER,
      resultId: 'some-id',
      position: 1,
      ...overrides,
    });
  }

  it('passes with minimal valid payload', async () => {
    const errors = await validate(make());
    expect(errors).toHaveLength(0);
  });

  it('passes with all optional fields', async () => {
    const errors = await validate(make({
      searchQueryId: '550e8400-e29b-41d4-a716-446655440000',
      resultLabel: 'Acme Corp',
    }));
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid resultType', async () => {
    const errors = await validate(make({ resultType: 'invalid' as any }));
    expect(errors.some(e => e.property === 'resultType')).toBe(true);
  });

  it('rejects position < 1', async () => {
    const errors = await validate(make({ position: 0 }));
    expect(errors.some(e => e.property === 'position')).toBe(true);
  });

  it('rejects position > 20', async () => {
    const errors = await validate(make({ position: 21 }));
    expect(errors.some(e => e.property === 'position')).toBe(true);
  });

  it('rejects invalid UUID for searchQueryId', async () => {
    const errors = await validate(make({ searchQueryId: 'not-a-uuid' }));
    expect(errors.some(e => e.property === 'searchQueryId')).toBe(true);
  });

  it('accepts missing searchQueryId', async () => {
    const dto = make();
    delete (dto as any).searchQueryId;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npx jest src/modules/search/dto/track-click.dto.spec.ts --no-coverage
```

Expected: FAIL — `TrackClickDto` not found.

- [ ] **Step 3: Create the DTO**

```typescript
// backend/src/modules/search/dto/track-click.dto.ts
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, Max } from 'class-validator';
import { SearchResultType } from '../search-result-type.enum';

export class TrackClickDto {
  @IsOptional()
  @IsUUID()
  searchQueryId?: string;

  @IsString()
  @MaxLength(500)
  query: string;

  @IsEnum(SearchResultType)
  resultType: SearchResultType;

  @IsString()
  @MaxLength(255)
  resultId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  resultLabel?: string;

  @IsInt()
  @Min(1)
  @Max(20)
  position: number;
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd backend && npx jest src/modules/search/dto/track-click.dto.spec.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/search/dto/track-click.dto.ts \
        backend/src/modules/search/dto/track-click.dto.spec.ts
git commit -m "feat(search): add TrackClickDto with enum and position validation"
```

---

## Task 5: Update `GlobalSearchResponseDto`

**Files:**
- Modify: `backend/src/modules/search/dto/global-search-response.dto.ts`

- [ ] **Step 1: Add `searchQueryId` field**

Open `backend/src/modules/search/dto/global-search-response.dto.ts`.

Replace the entire file content with:

```typescript
import { GlobalSearchResultDto } from './global-search-result.dto';

export class GlobalSearchResponseDto {
  query: string;
  searchQueryId: string;
  results: GlobalSearchResultDto[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/search/dto/global-search-response.dto.ts
git commit -m "feat(search): add searchQueryId to GlobalSearchResponseDto"
```

---

## Task 6: Create `SearchAnalyticsService`

This service writes query and click events fire-and-forget. Both methods always return `void` synchronously and never propagate errors to callers.

**Files:**
- Create: `backend/src/modules/search/search-analytics.service.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/modules/search/search-analytics.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchQuery } from '../../database/entities/search-query.entity';
import { SearchClick } from '../../database/entities/search-click.entity';

describe('SearchAnalyticsService', () => {
  let service: SearchAnalyticsService;
  let queryRepo: { save: jest.Mock };
  let clickRepo: { save: jest.Mock };

  beforeEach(async () => {
    queryRepo = { save: jest.fn().mockResolvedValue({}) };
    clickRepo = { save: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchAnalyticsService,
        { provide: getRepositoryToken(SearchQuery), useValue: queryRepo },
        { provide: getRepositoryToken(SearchClick), useValue: clickRepo },
      ],
    }).compile();

    service = module.get(SearchAnalyticsService);
  });

  describe('logQuery()', () => {
    const params = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      query: 'acme',
      userId: 'user-uuid',
      resultCount: 5,
      executionTimeMs: 42,
    };

    it('calls queryRepo.save with correct data', async () => {
      service.logQuery(params);
      // allow microtask queue to flush
      await new Promise(r => setImmediate(r));
      expect(queryRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        id: params.id,
        query: params.query,
        userId: params.userId,
        resultCount: params.resultCount,
        executionTimeMs: params.executionTimeMs,
      }));
    });

    it('does not throw when repo.save rejects', async () => {
      queryRepo.save.mockRejectedValueOnce(new Error('db error'));
      expect(() => service.logQuery(params)).not.toThrow();
      await new Promise(r => setImmediate(r)); // let async rejection resolve
    });
  });

  describe('logClick()', () => {
    const params = {
      searchQueryId: '550e8400-e29b-41d4-a716-446655440000',
      query: 'acme',
      resultType: 'customer',
      resultId: 'cust-uuid',
      resultLabel: 'Acme Corp',
      position: 1,
    };

    it('calls clickRepo.save with correct data', async () => {
      service.logClick(params);
      await new Promise(r => setImmediate(r));
      expect(clickRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        searchQueryId: params.searchQueryId,
        query: params.query,
        resultType: params.resultType,
        resultId: params.resultId,
        resultLabel: params.resultLabel,
        position: params.position,
      }));
    });

    it('does not throw when repo.save rejects', async () => {
      clickRepo.save.mockRejectedValueOnce(new Error('db error'));
      expect(() => service.logClick(params)).not.toThrow();
      await new Promise(r => setImmediate(r));
    });

    it('accepts undefined searchQueryId', async () => {
      const paramsNoId = { ...params, searchQueryId: undefined };
      expect(() => service.logClick(paramsNoId)).not.toThrow();
      await new Promise(r => setImmediate(r));
      expect(clickRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        searchQueryId: null,
      }));
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest src/modules/search/search-analytics.service.spec.ts --no-coverage
```

Expected: FAIL — `SearchAnalyticsService` not found.

- [ ] **Step 3: Implement the service**

```typescript
// backend/src/modules/search/search-analytics.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchQuery } from '../../database/entities/search-query.entity';
import { SearchClick } from '../../database/entities/search-click.entity';

@Injectable()
export class SearchAnalyticsService {
  private readonly logger = new Logger(SearchAnalyticsService.name);

  constructor(
    @InjectRepository(SearchQuery)
    private readonly queryRepo: Repository<SearchQuery>,
    @InjectRepository(SearchClick)
    private readonly clickRepo: Repository<SearchClick>,
  ) {}

  logQuery(params: {
    id: string;
    query: string;
    userId: string;
    resultCount: number;
    executionTimeMs: number;
  }): void {
    this.queryRepo
      .save({
        id: params.id,
        query: params.query,
        userId: params.userId,
        resultCount: params.resultCount,
        executionTimeMs: params.executionTimeMs,
      })
      .catch((error: Error) => {
        this.logger.error(`Failed to log search query: ${error.message}`, error.stack);
      });
  }

  logClick(params: {
    searchQueryId?: string;
    query: string;
    resultType: string;
    resultId: string;
    resultLabel?: string;
    position: number;
  }): void {
    this.clickRepo
      .save({
        searchQueryId: params.searchQueryId ?? null,
        query: params.query,
        resultType: params.resultType,
        resultId: params.resultId,
        resultLabel: params.resultLabel ?? null,
        position: params.position,
      })
      .catch((error: Error) => {
        this.logger.error(`Failed to log search click: ${error.message}`, error.stack);
      });
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx jest src/modules/search/search-analytics.service.spec.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/search/search-analytics.service.ts \
        backend/src/modules/search/search-analytics.service.spec.ts
git commit -m "feat(search): add SearchAnalyticsService with fire-and-forget logQuery/logClick"
```

---

## Task 7: Create `SearchScheduler`

Follows `auth.scheduler.ts` exactly. Uses `DataSource` + `QueryRunner` for transactional deletes (same pattern as `stock-adjustment.service.ts`).

**Files:**
- Create: `backend/src/modules/search/search.scheduler.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/modules/search/search.scheduler.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SearchScheduler } from './search.scheduler';

describe('SearchScheduler', () => {
  let scheduler: SearchScheduler;
  let mockQueryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
  };
  let mockDataSource: { createQueryRunner: jest.Mock };

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      // Returns array of deleted rows (each with an `id` field)
      query: jest.fn().mockResolvedValue([{ id: 'row-1' }, { id: 'row-2' }]),
    };
    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchScheduler,
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    scheduler = module.get(SearchScheduler);
  });

  it('deletes clicks before queries in one transaction', async () => {
    await scheduler.handleRetentionCleanup();

    expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.query).toHaveBeenCalledTimes(2);

    // First query should be clicks, second should be queries
    const [firstCall, secondCall] = mockQueryRunner.query.mock.calls;
    expect(firstCall[0]).toContain('search_clicks');
    expect(secondCall[0]).toContain('search_queries');

    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('rolls back and does not rethrow on error', async () => {
    mockQueryRunner.query.mockRejectedValueOnce(new Error('db error'));

    await expect(scheduler.handleRetentionCleanup()).resolves.not.toThrow();
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('always releases the query runner even on rollback failure', async () => {
    mockQueryRunner.query.mockRejectedValueOnce(new Error('db error'));
    mockQueryRunner.rollbackTransaction.mockRejectedValueOnce(new Error('rollback error'));

    await expect(scheduler.handleRetentionCleanup()).resolves.not.toThrow();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest src/modules/search/search.scheduler.spec.ts --no-coverage
```

Expected: FAIL — `SearchScheduler` not found.

- [ ] **Step 3: Implement the scheduler**

```typescript
// backend/src/modules/search/search.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

const RETENTION_DAYS = 90;

@Injectable()
export class SearchScheduler {
  private readonly logger = new Logger(SearchScheduler.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleRetentionCleanup(): Promise<void> {
    this.logger.log('Starting search analytics retention cleanup');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const clickResult: { id: string }[] = await queryRunner.query(
        `DELETE FROM search_clicks WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         RETURNING id`,
      );
      const clicksDeleted = clickResult.length;

      const queryResult: { id: string }[] = await queryRunner.query(
        `DELETE FROM search_queries WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         RETURNING id`,
      );
      const queriesDeleted = queryResult.length;

      await queryRunner.commitTransaction();
      this.logger.log(
        `Retention cleanup complete: ${clicksDeleted} clicks, ${queriesDeleted} queries deleted`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction().catch((rollbackError: Error) => {
        this.logger.error('Rollback failed during retention cleanup', rollbackError.stack);
      });
      this.logger.error('Search analytics retention cleanup failed', (error as Error).stack);
    } finally {
      await queryRunner.release();
    }
  }
}
```

> **Note on the raw SQL:** TypeORM's `queryRunner.query()` returns the rows array directly (not a tuple). `DELETE ... RETURNING id` returns `[{ id: '...' }, ...]` — one object per deleted row. The count logged is the length of that array.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx jest src/modules/search/search.scheduler.spec.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/search/search.scheduler.ts \
        backend/src/modules/search/search.scheduler.spec.ts
git commit -m "feat(search): add SearchScheduler with transactional 90-day retention cleanup"
```

---

## Task 8: Wire up `SearchModule`

Register the new entities and providers in the search module.

**Files:**
- Modify: `backend/src/modules/search/search.module.ts`

- [ ] **Step 1: Update `search.module.ts`**

Replace the entire file:

```typescript
// backend/src/modules/search/search.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { SalesModule } from '../sales/sales.module';
import { SearchQuery } from '../../database/entities/search-query.entity';
import { SearchClick } from '../../database/entities/search-click.entity';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchController } from './search.controller';
import { SearchScheduler } from './search.scheduler';
import { SearchService } from './search.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchQuery, SearchClick]),
    SalesModule,
    InventoryModule,
    PurchasingModule,
    AccountingModule,
  ],
  controllers: [SearchController],
  providers: [SearchService, SearchAnalyticsService, SearchScheduler],
})
export class SearchModule {}
```

- [ ] **Step 2: Verify the backend compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/search/search.module.ts
git commit -m "feat(search): wire SearchAnalyticsService and SearchScheduler into SearchModule"
```

---

## Task 9: Update `SearchService` to log queries and return `searchQueryId`

The service generates the UUID synchronously, fires `logQuery()` without awaiting it, then returns the ID in the response.

**Files:**
- Modify: `backend/src/modules/search/search.service.ts`

- [ ] **Step 1: Update the existing `search.service.spec.ts` tests**

Open `backend/src/modules/search/search.service.spec.ts`.

Add `SearchAnalyticsService` mock to the module setup and add new test cases. Add to the `providers` array in `beforeEach`:

```typescript
// add this import at the top
import { SearchAnalyticsService } from './search-analytics.service';
```

Add to the `providers` array inside `Test.createTestingModule`:
```typescript
{
  provide: SearchAnalyticsService,
  useValue: { logQuery: jest.fn() },
},
```

Add these test cases in a new `describe` block after existing ones:

```typescript
describe('searchQueryId', () => {
  it('includes searchQueryId in the response', async () => {
    const result = await service.search('test', mockUser);
    expect(result.searchQueryId).toBeDefined();
    expect(typeof result.searchQueryId).toBe('string');
    // should be a valid UUID format
    expect(result.searchQueryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('calls logQuery with correct params', async () => {
    const analyticsService = module.get(SearchAnalyticsService);
    await service.search('acme', mockUser);
    expect(analyticsService.logQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'acme',
        userId: mockUser.userId,
        resultCount: expect.any(Number),
        executionTimeMs: expect.any(Number),
      }),
    );
  });

  it('returns searchQueryId even when logQuery throws', async () => {
    const analyticsService = module.get(SearchAnalyticsService);
    (analyticsService.logQuery as jest.Mock).mockImplementation(() => {
      throw new Error('unexpected');
    });
    const result = await service.search('test', mockUser);
    expect(result.searchQueryId).toBeDefined();
  });
});
```

You'll also need to expose `module` in the outer `describe` scope:

```typescript
let module: TestingModule; // add this alongside `let service: SearchService`
```

And in `beforeEach`, assign it:
```typescript
module = await Test.createTestingModule({ ... }).compile();
service = module.get<SearchService>(SearchService);
```

- [ ] **Step 2: Run existing + new tests to confirm new ones fail**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```

Expected: existing tests PASS, new `searchQueryId` tests FAIL.

- [ ] **Step 3: Update `search.service.ts`**

Add these imports at the top:
```typescript
import { v4 as uuidv4 } from 'uuid';
import { SearchAnalyticsService } from './search-analytics.service';
```

Add `SearchAnalyticsService` to the constructor:
```typescript
constructor(
  // ... existing services ...
  private readonly searchAnalyticsService: SearchAnalyticsService,
) {}
```

Replace the `search()` method body:
```typescript
async search(query: string, user: any): Promise<GlobalSearchResponseDto> {
  const trimmed = query?.trim() ?? '';
  if (trimmed.length < 2) {
    return { query, searchQueryId: uuidv4(), results: [] };
  }

  const searchQueryId = uuidv4();
  const startTime = Date.now();

  const [
    pages,
    customers,
    products,
    salesOrders,
    purchaseOrders,
    suppliers,
    invoices,
    customerPayments,
    vendorPayments,
    journalEntries,
  ] = await Promise.all([
    this.safeSearch('pages', () =>
      Promise.resolve(this.searchPages(trimmed, user)),
    ),
    this.safeSearch('customers', () =>
      this.customerService.searchGlobal(trimmed, user),
    ),
    this.safeSearch('products', () =>
      this.productService.searchGlobal(trimmed, user),
    ),
    this.safeSearch('salesOrders', () =>
      this.salesOrderService.searchGlobal(trimmed, user),
    ),
    this.safeSearch('purchaseOrders', () =>
      this.purchaseOrderService.searchGlobal(trimmed, user),
    ),
    this.safeSearch('suppliers', () =>
      this.supplierService.searchGlobal(trimmed, user),
    ),
    this.safeSearch('invoices', () =>
      this.invoiceService.searchGlobal(trimmed, user),
    ),
    this.safeSearch('customerPayments', () =>
      this.paymentService.searchGlobal(trimmed, user),
    ),
    this.safeSearch('vendorPayments', () =>
      this.vendorPaymentService.searchGlobal(trimmed, user),
    ),
    this.safeSearch('journalEntries', () =>
      this.journalEntryService.searchGlobal(trimmed, user),
    ),
  ]);

  const executionTimeMs = Date.now() - startTime;

  const results = [
    ...pages,
    ...customers,
    ...products,
    ...salesOrders,
    ...purchaseOrders,
    ...suppliers,
    ...invoices,
    ...customerPayments,
    ...vendorPayments,
    ...journalEntries,
  ]
    .sort((a, b) => {
      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.label ?? '')
        .toLowerCase()
        .localeCompare((b.label ?? '').toLowerCase());
    })
    .slice(0, SEARCH_RESPONSE_LIMIT);

  this.searchAnalyticsService.logQuery({
    id: searchQueryId,
    query: trimmed,
    userId: user.userId,
    resultCount: results.length,
    executionTimeMs,
  });

  return { query, searchQueryId, results };
}
```

- [ ] **Step 4: Run all search service tests**

```bash
cd backend && npx jest src/modules/search/search.service.spec.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/search/search.service.ts \
        backend/src/modules/search/search.service.spec.ts
git commit -m "feat(search): return searchQueryId and log query analytics in SearchService"
```

---

## Task 10: Add `POST /search/click` to controller

**Files:**
- Modify: `backend/src/modules/search/search.controller.ts`

- [ ] **Step 1: Write failing test**

```typescript
// backend/src/modules/search/search.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchResultType } from './search-result-type.enum';

describe('SearchController', () => {
  let controller: SearchController;
  let analyticsService: { logClick: jest.Mock };

  beforeEach(async () => {
    analyticsService = { logClick: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        { provide: SearchService, useValue: { search: jest.fn().mockResolvedValue({ query: '', searchQueryId: 'sq-id', results: [] }) } },
        { provide: SearchAnalyticsService, useValue: analyticsService },
      ],
    }).compile();

    controller = module.get(SearchController);
  });

  it('POST /search/click calls logClick and returns undefined', async () => {
    const dto = {
      query: 'acme',
      resultType: SearchResultType.CUSTOMER,
      resultId: 'cust-1',
      resultLabel: 'Acme Corp',
      position: 1,
    };
    const result = await controller.trackClick(dto as any, { user: { userId: 'u1' } } as any);
    expect(analyticsService.logClick).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'acme',
        resultType: SearchResultType.CUSTOMER,
        resultId: 'cust-1',
        position: 1,
      }),
    );
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npx jest src/modules/search/search.controller.spec.ts --no-coverage
```

Expected: FAIL — `trackClick` method not found.

- [ ] **Step 3: Update `search.controller.ts`**

Replace the entire file:

```typescript
// backend/src/modules/search/search.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Request } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchAnalyticsService } from './search-analytics.service';
import { SearchService } from './search.service';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';
import { GlobalSearchResponseDto } from './dto/global-search-response.dto';
import { TrackClickDto } from './dto/track-click.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly searchAnalyticsService: SearchAnalyticsService,
  ) {}

  @Get('global')
  @ApiOperation({
    summary: 'Global search across pages, customers, products, and transactions',
  })
  async searchGlobal(
    @Query() query: GlobalSearchQueryDto,
    @Request() req: any,
  ): Promise<GlobalSearchResponseDto> {
    return this.searchService.search(query.q, req.user);
  }

  @Post('click')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Track a search result click' })
  trackClick(@Body() dto: TrackClickDto, @Request() req: any): void {
    this.searchAnalyticsService.logClick({
      searchQueryId: dto.searchQueryId,
      query: dto.query.trim(),
      resultType: dto.resultType,
      resultId: dto.resultId,
      resultLabel: dto.resultLabel,
      position: dto.position,
    });
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd backend && npx jest src/modules/search/search.controller.spec.ts --no-coverage
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/search/search.controller.ts \
        backend/src/modules/search/search.controller.spec.ts
git commit -m "feat(search): add POST /search/click endpoint for click tracking"
```

---

## Task 11: Run full test suite and verify

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm run test
```

Expected: All tests PASS. No regressions.

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 3: Check lint**

```bash
cd backend && npm run lint 2>&1 | head -30
```

Expected: No errors (warnings acceptable).

- [ ] **Step 4: Commit if any lint auto-fixes were applied**

Only commit if lint made changes:
```bash
git add -p
git commit -m "chore(search): apply lint fixes to Phase 5 analytics files"
```

---

## Task 12: Smoke test against running backend

- [ ] **Step 1: Start the backend**

```bash
cd backend && npm run start:dev
```

Wait for "Application is running on port 3000" (or similar).

- [ ] **Step 2: Run the migration if not already run**

(Skip if already done in Task 3.)
```bash
cd backend && npm run migration:run
```

- [ ] **Step 3: Test the search endpoint returns `searchQueryId`**

```bash
# Get a token first
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123!"}' \
  | jq -r '.data.accessToken')

# Run a search
curl -s "http://localhost:3000/api/search/global?q=acme" \
  -H "Authorization: Bearer $TOKEN" | jq '{query, searchQueryId}'
```

Expected: response contains `searchQueryId` as a UUID string.

- [ ] **Step 4: Test the click endpoint**

```bash
SEARCH_QUERY_ID=$(curl -s "http://localhost:3000/api/search/global?q=acme" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.searchQueryId')

curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/search/click \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"acme\",\"resultType\":\"customer\",\"resultId\":\"some-id\",\"position\":1,\"searchQueryId\":\"$SEARCH_QUERY_ID\"}"
```

Expected: `201`

- [ ] **Step 5: Verify rows in the database**

Connect to the database and check:
```sql
SELECT id, query, result_count, execution_time_ms FROM search_queries ORDER BY created_at DESC LIMIT 5;
SELECT id, query, result_type, position FROM search_clicks ORDER BY created_at DESC LIMIT 5;
```

Expected: rows present for the queries and click just made.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix(search): Phase 5 smoke test fixes"
```
