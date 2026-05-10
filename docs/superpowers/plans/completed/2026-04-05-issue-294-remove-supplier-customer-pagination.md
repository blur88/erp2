# Remove Supplier & Customer Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all pagination (page/limit) from supplier and customer backend DTOs, services, and frontend pages/filters so all records are always fetched.

**Architecture:** Backend DTOs lose `page`/`limit` fields; service methods switch from `.skip().take()` to `.getMany()` returning flat arrays; response shapes drop pagination metadata. Frontend removes `limit: 999999` params and consumes the simplified responses.

**Tech Stack:** NestJS 11 (backend), TypeORM, class-validator; React 19 + RTK Query (frontend), Vitest (frontend tests), Jest (backend tests).

---

## Files

| File | Change |
|------|--------|
| `backend/src/modules/purchasing/dto/supplier.dto.ts` | Remove `page`, `limit` from `SupplierQueryDto`; remove `page`, `limit`, `totalPages`, `hasNext`, `hasPrev` from `SupplierListResponseDto`; remove `Max` import |
| `backend/src/modules/purchasing/services/supplier.service.ts` | Update `findDeleted` to remove pagination logic |
| `backend/src/modules/sales/dto/customer.dto.ts` | Remove `page`, `limit` from `QueryCustomersDto` |
| `backend/src/modules/sales/services/customer.service.ts` | Update `findAll` and `findDeleted` to remove pagination logic |
| `frontend/src/components/filters/FilterSupplier.tsx` | Remove `limit: 999999` |
| `frontend/src/components/filters/FilterCustomer.tsx` | Remove `limit: 999999` |
| `frontend/src/pages/sales/CustomersPage.tsx` | Remove `limit: 999999` from query params |

---

### Task 1: Update `SupplierQueryDto` and `SupplierListResponseDto`

**Files:**
- Modify: `backend/src/modules/purchasing/dto/supplier.dto.ts`

- [ ] **Step 1: Remove `page`, `limit` from `SupplierQueryDto` and clean up `SupplierListResponseDto`**

In `SupplierQueryDto` (lines 87–128), remove the `page` and `limit` fields and their decorators. Also remove `Max` from the import. In `SupplierListResponseDto` (lines 207–228), remove `page`, `limit`, `totalPages`, `hasNext`, `hasPrev`.

The updated `SupplierQueryDto` should look like:

```typescript
export class SupplierQueryDto {
  @ApiPropertyOptional({ description: 'Search term' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by type', enum: SupplierType })
  @IsOptional()
  @IsEnum(SupplierType)
  type?: SupplierType;

  @ApiPropertyOptional({ description: 'Filter active suppliers only' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Sort by field', default: 'companyName' })
  @IsOptional()
  @IsString()
  sortBy?: string = 'companyName';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'ASC';
}
```

The updated `SupplierListResponseDto` should look like:

```typescript
export class SupplierListResponseDto {
  @ApiProperty({ description: 'List of suppliers', type: [SupplierResponseDto] })
  suppliers!: SupplierResponseDto[];

  @ApiProperty({ description: 'Total count' })
  total!: number;
}
```

Remove `Max` from the import line (line 13). The import line should become:

```typescript
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsDecimal,
  IsInt,
  MaxLength,
  MinLength,
  Min,
  IsDateString,
  IsUUID,
} from 'class-validator';
```

Also remove `@Type` import from `class-transformer` if it's only used for `limit`/`page`. Check: `@Type` is used on `page` and `limit` only — remove it from the import.

```typescript
import { Transform } from 'class-transformer';
```

- [ ] **Step 2: Run backend TypeScript check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -40
```

Expected: errors only if `supplier.service.ts` still references `page`/`limit` from the DTO (fix in next task).

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/purchasing/dto/supplier.dto.ts
git commit -m "refactor(purchasing): remove page/limit from SupplierQueryDto and SupplierListResponseDto"
```

---

### Task 2: Update `supplier.service.ts` `findDeleted`

**Files:**
- Modify: `backend/src/modules/purchasing/services/supplier.service.ts`

`findAll` (lines 103–166) already returns all records without pagination — no change needed there. Only `findDeleted` (lines 566–619) needs updating.

- [ ] **Step 1: Update `findDeleted` to remove pagination**

Replace the `findDeleted` method body. The current destructuring includes `page` and `limit`; remove those. Remove `.skip().take()`. Switch to `.getMany()`. Simplify the return value.

The updated `findDeleted` method:

```typescript
async findDeleted(query: SupplierQueryDto): Promise<SupplierListResponseDto> {
  this.logger.log('Finding deleted suppliers');

  const {
    search,
    type,
    sortBy = 'companyName',
    sortOrder = 'ASC',
  } = query;

  const queryBuilder = this.supplierRepository
    .createQueryBuilder('supplier')
    .withDeleted()
    .where('supplier.deletedAt IS NOT NULL');

  if (search) {
    queryBuilder.andWhere(
      '(supplier.companyName ILIKE :search OR supplier.contactPerson ILIKE :search)',
      { search: `%${search}%` }
    );
  }

  if (type) {
    queryBuilder.andWhere('supplier.type = :type', { type });
  }

  const validSortFields = ['companyName', 'type', 'createdAt', 'deletedAt'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'companyName';
  queryBuilder.orderBy(`supplier.${sortField}`, sortOrder as 'ASC' | 'DESC');

  const suppliers = await queryBuilder.getMany();

  return {
    suppliers: suppliers.map(supplier => this.mapToResponseDto(supplier)),
    total: suppliers.length,
  };
}
```

- [ ] **Step 2: Run backend TypeScript check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -40
```

Expected: no errors related to supplier files.

- [ ] **Step 3: Run backend supplier tests**

```bash
cd /home/blur/erp2/backend && npx jest src/modules/purchasing --no-coverage 2>&1 | tail -20
```

Expected: all passing (or pre-existing failures only).

- [ ] **Step 4: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/purchasing/services/supplier.service.ts
git commit -m "refactor(purchasing): remove pagination from supplier findDeleted"
```

---

### Task 3: Update `QueryCustomersDto`

**Files:**
- Modify: `backend/src/modules/sales/dto/customer.dto.ts`

- [ ] **Step 1: Remove `page` and `limit` from `QueryCustomersDto`**

In `QueryCustomersDto` (lines 201–273), remove the `page` and `limit` fields and their decorators. The updated class:

```typescript
export class QueryCustomersDto {
  @ApiPropertyOptional({
    description: 'Search term for customer name, email, or phone',
    example: 'acme',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer type',
    enum: CustomerType,
    example: CustomerType.BUSINESS,
  })
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @ApiPropertyOptional({
    description: 'Filter by price list ID',
    example: 'uuid-string',
  })
  @IsOptional()
  @IsString()
  priceListId?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'name',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    example: 'ASC',
  })
  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
```

Also remove `IsInt` and `Min` from the import since they're no longer used in this DTO (verify they're not used elsewhere in the file first):

```bash
grep -n 'IsInt\|@Min' /home/blur/erp2/backend/src/modules/sales/dto/customer.dto.ts
```

If `IsInt` and `Min` only appear in the `page`/`limit` fields, remove them from imports.

- [ ] **Step 2: Run TypeScript check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -40
```

Expected: errors only if `customer.service.ts` still references `page`/`limit` (fixed in next task).

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/sales/dto/customer.dto.ts
git commit -m "refactor(sales): remove page/limit from QueryCustomersDto"
```

---

### Task 4: Update `customer.service.ts` `findAll` and `findDeleted`

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts`

- [ ] **Step 1: Update `findAll` to remove pagination**

Replace the `findAll` method (lines 87–141). Remove `page`/`limit` destructuring, remove `.skip().take()`, switch from `getManyAndCount()` to `getMany()`, simplify response:

```typescript
async findAll(query: QueryCustomersDto) {
  const {
    search,
    type,
    isActive,
    sortBy = 'name',
    sortOrder = 'ASC',
  } = query;

  const where: FindOptionsWhere<Customer> = {};

  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive;

  let queryBuilder = this.customerRepository.createQueryBuilder('customer')
    .leftJoinAndSelect('customer.priceList', 'priceList');

  Object.entries(where).forEach(([key, value]) => {
    queryBuilder.andWhere(`customer.${key} = :${key}`, { [key]: value });
  });

  if (search) {
    queryBuilder.andWhere(
      '(customer.name ILIKE :search OR customer.phone ILIKE :search)',
      { search: `%${search}%` }
    );
  }

  if (sortBy === 'name') {
    queryBuilder.orderBy('customer.name', sortOrder, 'NULLS LAST');
  } else {
    queryBuilder.orderBy(`customer.${sortBy}`, sortOrder);
  }

  const customers = await queryBuilder.getMany();

  return {
    data: customers.map(customer => this.mapToResponseDto(customer)),
    total: customers.length,
  };
}
```

- [ ] **Step 2: Update `findDeleted` to remove pagination**

Replace the `findDeleted` method (lines 215–256). Remove `page`/`limit` destructuring, remove `.offset().limit()`, switch to `getMany()`, simplify response:

```typescript
async findDeleted(query: QueryCustomersDto) {
  const {
    search,
    sortBy = 'name',
    sortOrder = 'ASC',
  } = query;

  const queryBuilder = this.customerRepository
    .createQueryBuilder('customer')
    .where('customer.deletedAt IS NOT NULL')
    .withDeleted();

  if (search) {
    queryBuilder.andWhere(
      '(customer.name ILIKE :search OR customer.phone ILIKE :search)',
      { search: `%${search}%` }
    );
  }

  if (sortBy === 'name') {
    queryBuilder.orderBy('UPPER(customer.name)', sortOrder);
  } else {
    queryBuilder.orderBy(`customer.${sortBy}`, sortOrder);
  }

  const customers = await queryBuilder.getMany();

  return {
    data: customers.map(customer => this.mapToResponseDto(customer)),
    total: customers.length,
  };
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Run backend customer tests**

```bash
cd /home/blur/erp2/backend && npx jest src/modules/sales --no-coverage 2>&1 | tail -20
```

Expected: all passing (or pre-existing failures only).

- [ ] **Step 5: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/sales/services/customer.service.ts
git commit -m "refactor(sales): remove pagination from customer findAll and findDeleted"
```

---

### Task 5: Update frontend filter components and CustomersPage

**Files:**
- Modify: `frontend/src/components/filters/FilterSupplier.tsx`
- Modify: `frontend/src/components/filters/FilterCustomer.tsx`
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

- [ ] **Step 1: Update `FilterSupplier.tsx`**

Change line 14 from `useGetSuppliersQuery({ limit: 999999 })` to `useGetSuppliersQuery({})`:

```typescript
const { data } = useGetSuppliersQuery({})
```

- [ ] **Step 2: Update `FilterCustomer.tsx`**

Change line 14 from `useGetCustomersQuery({ limit: 999999 })` to `useGetCustomersQuery({})`:

```typescript
const { data } = useGetCustomersQuery({})
```

- [ ] **Step 3: Update `CustomersPage.tsx`**

Remove `limit: 999999` from `customerQueryParams` (line 161). The `useMemo` block should be:

```typescript
const customerQueryParams = useMemo(
  () => ({
    search: appliedFilters.search || undefined,
    isActive:
      appliedFilters.status === 'active'
        ? true
        : appliedFilters.status === 'inactive'
          ? false
          : undefined,
    sortBy: sortState.sortBy,
    sortOrder: sortState.sortOrder,
  }),
  [appliedFilters, sortState],
)
```

- [ ] **Step 4: Run frontend type check**

```bash
cd /home/blur/erp2/frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Run affected frontend tests**

```bash
cd /home/blur/erp2/frontend && npx vitest run src/components/filters/ src/pages/sales/ --reporter=verbose 2>&1 | tail -30
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2 && git add frontend/src/components/filters/FilterSupplier.tsx frontend/src/components/filters/FilterCustomer.tsx frontend/src/pages/sales/CustomersPage.tsx
git commit -m "refactor: remove limit param from supplier/customer filter components and CustomersPage"
```

---

### Task 6: Create PR closing issue #294

- [ ] **Step 1: Push branch and create PR**

```bash
cd /home/blur/erp2 && gh pr create \
  --title "refactor: remove pagination limit from supplier and customer endpoints" \
  --body "$(cat <<'EOF'
## Summary

- Removes `page`/`limit` from `SupplierQueryDto` and `QueryCustomersDto` — backend now always returns all records
- Removes pagination logic (`.skip().take()`) from `supplier.service.ts` `findDeleted`, `customer.service.ts` `findAll` and `findDeleted`
- Simplifies `SupplierListResponseDto` by removing `page`, `limit`, `totalPages`, `hasNext`, `hasPrev`
- Removes `limit: 999999` from `FilterSupplier`, `FilterCustomer`, and `CustomersPage`

Closes #294

## Test plan

- [ ] Supplier filter dropdown shows all suppliers without 400 error
- [ ] Customer filter dropdown shows all customers
- [ ] Suppliers page lists all suppliers
- [ ] Customers page lists all customers
- [ ] Deleted Suppliers dialog shows all deleted suppliers
- [ ] Deleted Customers dialog shows all deleted customers

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---
