# Entity Slugs & Highlight-on-Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UUIDs in edit URLs with human-readable slugs/references across all six entity modules, and standardise the highlight-on-return pattern after save.

**Architecture:** Three entities (Customer, Supplier, Product) get a `slug` column generated from their name field and regenerated on rename. Three entities (Sales Order, Purchase Order, Stock Adjustment) already have unique human-readable references (`orderNumber`/`adjustmentNumber`) used directly as the URL identifier with no new column. A shared `slug.util.ts` handles base slug generation. All form pages navigate back to the list with `?highlight=<uuid>` after save; all list pages wire up `highlightParam: 'highlight'` in their workspace config.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, React 19, RTK Query, React Router, MUI v7.

**Spec:** `docs/superpowers/specs/2026-05-10-entity-slugs-design.md`

---

## File Map

### Backend — New files
- `backend/src/common/utils/slug.util.ts` — `generateBaseSlug(input: string): string`
- `backend/src/common/utils/slug.util.spec.ts` — unit tests for slug util
- `backend/src/database/migrations/<timestamp>-AddCustomerSlug.ts`
- `backend/src/database/migrations/<timestamp>-AddSupplierSlug.ts`
- `backend/src/database/migrations/<timestamp>-AddProductSlug.ts`

### Backend — Modified files
- `backend/src/database/entities/customer.entity.ts` — add `slug` column
- `backend/src/database/entities/supplier.entity.ts` — add `slug` column
- `backend/src/database/entities/product.entity.ts` — add `slug` column
- `backend/src/modules/sales/dto/customer.dto.ts` — add `slug` to `CustomerResponseDto`
- `backend/src/modules/sales/services/customer.service.ts` — add slug generation in `create`/`update`, add `findBySlug`
- `backend/src/modules/sales/controllers/customer.controller.ts` — add `GET slug/:slug` endpoint
- `backend/src/modules/purchasing/dto/supplier.dto.ts` — add `slug` to `SupplierResponseDto`
- `backend/src/modules/purchasing/services/supplier.service.ts` — add slug generation, add `findBySlug`
- `backend/src/modules/purchasing/controllers/supplier.controller.ts` — add `GET slug/:slug` endpoint
- `backend/src/modules/inventory/dto/product.dto.ts` — add `slug` to `ProductResponseDto`
- `backend/src/modules/inventory/services/product.service.ts` — add slug generation, add `findBySlug`
- `backend/src/modules/inventory/controllers/product.controller.ts` — add `GET slug/:slug` endpoint
- `backend/src/modules/purchasing/services/purchase-order.service.ts` — add `findByOrderNumber`
- `backend/src/modules/purchasing/controllers/purchase-order.controller.ts` — add `GET by-number/:orderNumber`
- `backend/src/modules/inventory/services/stock-adjustment.service.ts` — add `findByAdjustmentNumber`
- `backend/src/modules/inventory/controllers/stock-adjustment.controller.ts` — add `GET by-number/:adjustmentNumber`

### Frontend — Modified files
- `frontend/src/types/index.ts` — add `slug` to `Customer`, `Supplier`, `Product`
- `frontend/src/store/api/salesApi.ts` — add `getCustomerBySlug`, `getSalesOrderByNumber`
- `frontend/src/store/api/purchasingApi.ts` — add `getSupplierBySlug`, `getPurchaseOrderByNumber`
- `frontend/src/store/api/inventoryApi.ts` — add `getProductBySlug`, `getStockAdjustmentByNumber`
- `frontend/src/router.tsx` — update 6 edit routes to use slug/reference param
- `frontend/src/pages/sales/CustomersPage.tsx` — add `highlightParam`, update `edit` route fn
- `frontend/src/pages/sales/CustomerFormPage.tsx` — switch to slug param, navigate with highlight on save
- `frontend/src/pages/purchasing/SuppliersPage.tsx` — add `highlightParam`, update `edit` route fn
- `frontend/src/pages/purchasing/SupplierFormPage.tsx` — switch to slug param, navigate with highlight on save
- `frontend/src/pages/inventory/hooks/useProductsWorkspace.ts` — add `highlightParam`, update edit nav to slug
- `frontend/src/pages/inventory/CreateProductPage.tsx` — switch to slug param, navigate with highlight on save
- `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts` — add `highlightParam`, update edit route
- `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx` — switch to adjustmentNumber param, navigate with highlight on save
- `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` — update `edit` route fn to use orderNumber
- `frontend/src/pages/sales/CreateSalesOrderPage.tsx` — switch to orderNumber param (already navigates with highlight)
- `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts` — update `edit` route fn
- `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx` — switch to orderNumber param (already navigates with highlight)

---

## Task 1: Shared Slug Utility

**Files:**
- Create: `backend/src/common/utils/slug.util.ts`
- Create: `backend/src/common/utils/slug.util.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// backend/src/common/utils/slug.util.spec.ts
import { generateBaseSlug } from './slug.util';

describe('generateBaseSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(generateBaseSlug('Acme Corporation')).toBe('acme-corporation');
  });

  it('strips special characters', () => {
    expect(generateBaseSlug("O'Brien & Sons")).toBe('obrien-sons');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(generateBaseSlug('Foo  --  Bar')).toBe('foo-bar');
  });

  it('trims leading/trailing hyphens', () => {
    expect(generateBaseSlug('  Hello World  ')).toBe('hello-world');
  });

  it('handles all-special-character input with fallback', () => {
    expect(generateBaseSlug('!!!')).toBe('entity');
  });

  it('handles empty string with fallback', () => {
    expect(generateBaseSlug('')).toBe('entity');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/common/utils/slug.util.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './slug.util'`

- [ ] **Step 3: Implement the utility**

```typescript
// backend/src/common/utils/slug.util.ts
export function generateBaseSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'entity';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/common/utils/slug.util.spec.ts --no-coverage
```

Expected: 6 passing

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/utils/slug.util.ts backend/src/common/utils/slug.util.spec.ts
git commit -m "feat(backend): add generateBaseSlug utility"
```

---

## Task 2: Customer Entity, Migration, and Backend

**Files:**
- Modify: `backend/src/database/entities/customer.entity.ts`
- Create: migration file (generated by CLI)
- Modify: `backend/src/modules/sales/dto/customer.dto.ts`
- Modify: `backend/src/modules/sales/services/customer.service.ts`
- Modify: `backend/src/modules/sales/controllers/customer.controller.ts`

- [ ] **Step 1: Add `slug` column to Customer entity**

In `backend/src/database/entities/customer.entity.ts`, add after the `name` column:

```typescript
@Column({
  type: 'varchar',
  length: 255,
  nullable: true,
  comment: 'URL-friendly identifier derived from name',
})
@Index({ unique: true })
slug: string;
```

Also add `Index` to the imports from `typeorm` if not already present.

- [ ] **Step 2: Generate the migration**

```bash
cd backend && npm run migration:generate --name=AddCustomerSlug
```

This creates a file in `backend/src/database/migrations/`. Open it and add the backfill SQL in the `up()` method, **after** the `addColumn` call:

```typescript
// After the addColumn call, add:
await queryRunner.query(`
  UPDATE customers
  SET slug = LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(name, '[^a-zA-Z0-9\\s-]', '', 'g'),
        '[\\s-]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  ) || '-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL
`);

await queryRunner.query(`
  UPDATE customers SET slug = 'entity-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL OR slug = '' OR slug = '-'
`);
```

- [ ] **Step 3: Run the migration to verify it works**

```bash
cd backend && npm run migration:run
```

Expected: no errors

- [ ] **Step 4: Add `slug` to `CustomerResponseDto`**

In `backend/src/modules/sales/dto/customer.dto.ts`, add to `CustomerResponseDto`:

```typescript
@ApiProperty({ example: 'acme-corporation' })
slug: string;
```

- [ ] **Step 5: Add slug generation and `findBySlug` to `CustomerService`**

In `backend/src/modules/sales/services/customer.service.ts`:

Add import at top:
```typescript
import { generateBaseSlug } from '../../../common/utils/slug.util';
```

Add private method to the class:
```typescript
private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = generateBaseSlug(name);
  let slug = base;
  let counter = 1;
  while (true) {
    const existing = await this.customerRepository.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${counter++}`;
  }
}

async findBySlug(slug: string): Promise<CustomerResponseDto> {
  const customer = await this.customerRepository.findOne({
    where: { slug },
    relations: ['priceList'],
  });
  if (!customer) throw new NotFoundException(`Customer with slug '${slug}' not found`);
  return this.mapToResponseDto(customer);
}
```

In the `create` method, after `this.customerRepository.create(...)` and before `save`, add:
```typescript
customer.slug = await this.generateUniqueSlug(createCustomerDto.name);
```

In the `update` method, after `Object.assign(customer, updateCustomerDto)` and before `save`, add:
```typescript
if (updateCustomerDto.name && updateCustomerDto.name !== customer.name) {
  customer.slug = await this.generateUniqueSlug(updateCustomerDto.name, id);
}
```

Wait — `Object.assign` already overwrites `customer.name`. Read the old name before the assign:

Replace this block in `update`:
```typescript
    Object.assign(customer, updateCustomerDto);
    const savedCustomer = await this.customerRepository.save(customer);
```

With:
```typescript
    const nameChanged = updateCustomerDto.name !== undefined && updateCustomerDto.name !== customer.name;
    Object.assign(customer, updateCustomerDto);
    if (nameChanged) {
      customer.slug = await this.generateUniqueSlug(customer.name, id);
    }
    const savedCustomer = await this.customerRepository.save(customer);
```

Also ensure `mapToResponseDto` includes `slug`. Find the `mapToResponseDto` method and add:
```typescript
slug: customer.slug,
```

- [ ] **Step 6: Add `GET slug/:slug` endpoint to `CustomerController`**

In `backend/src/modules/sales/controllers/customer.controller.ts`, add this route **before** `@Get(':id')` (critical — NestJS route order):

```typescript
@Get('slug/:slug')
@ApiOperation({ summary: 'Get customer by slug' })
@ApiParam({ name: 'slug', description: 'Customer slug', type: 'string' })
@ApiResponse({ status: 200, description: 'Customer retrieved successfully', type: CustomerResponseDto })
@ApiResponse({ status: 404, description: 'Customer not found' })
async getCustomerBySlug(@Param('slug') slug: string): Promise<CustomerResponseDto> {
  return this.customerService.findBySlug(slug);
}
```

- [ ] **Step 7: Run backend tests**

```bash
cd backend && npx jest src/modules/sales --no-coverage
```

Expected: all passing

- [ ] **Step 8: Commit**

```bash
git add backend/src/database/entities/customer.entity.ts \
  backend/src/database/migrations/ \
  backend/src/modules/sales/dto/customer.dto.ts \
  backend/src/modules/sales/services/customer.service.ts \
  backend/src/modules/sales/controllers/customer.controller.ts
git commit -m "feat(backend): add slug to customer entity, service, and controller"
```

---

## Task 3: Supplier Entity, Migration, and Backend

**Files:**
- Modify: `backend/src/database/entities/supplier.entity.ts`
- Create: migration file (generated)
- Modify: `backend/src/modules/purchasing/dto/supplier.dto.ts`
- Modify: `backend/src/modules/purchasing/services/supplier.service.ts`
- Modify: `backend/src/modules/purchasing/controllers/supplier.controller.ts`

- [ ] **Step 1: Add `slug` column to Supplier entity**

In `backend/src/database/entities/supplier.entity.ts`, add after the `companyName` column:

```typescript
@Column({
  type: 'varchar',
  length: 255,
  nullable: true,
  comment: 'URL-friendly identifier derived from companyName',
})
@Index({ unique: true })
slug: string;
```

Add `Index` to the `typeorm` import if not present.

- [ ] **Step 2: Generate and patch the migration**

```bash
cd backend && npm run migration:generate --name=AddSupplierSlug
```

Open the generated file and add after the `addColumn` call:

```typescript
await queryRunner.query(`
  UPDATE suppliers
  SET slug = LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE("companyName", '[^a-zA-Z0-9\\s-]', '', 'g'),
        '[\\s-]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  ) || '-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL
`);

await queryRunner.query(`
  UPDATE suppliers SET slug = 'entity-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL OR slug = '' OR slug = '-'
`);
```

- [ ] **Step 3: Run the migration**

```bash
cd backend && npm run migration:run
```

Expected: no errors

- [ ] **Step 4: Add `slug` to `SupplierResponseDto`**

In `backend/src/modules/purchasing/dto/supplier.dto.ts`, add to `SupplierResponseDto`:

```typescript
@ApiProperty({ example: 'acme-supplies' })
slug!: string;
```

- [ ] **Step 5: Add slug generation and `findBySlug` to `SupplierService`**

In `backend/src/modules/purchasing/services/supplier.service.ts`:

Add import:
```typescript
import { generateBaseSlug } from '../../../common/utils/slug.util';
```

Add methods to the class:
```typescript
private async generateUniqueSlug(companyName: string, excludeId?: string): Promise<string> {
  const base = generateBaseSlug(companyName);
  let slug = base;
  let counter = 1;
  while (true) {
    const existing = await this.supplierRepository.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${counter++}`;
  }
}

async findBySlug(slug: string): Promise<SupplierResponseDto> {
  const supplier = await this.supplierRepository.findOne({ where: { slug } });
  if (!supplier) throw new NotFoundException(`Supplier with slug '${slug}' not found`);
  return this.mapToResponseDto(supplier);
}
```

In the `create` method, before the `this.supplierRepository.save(supplier)` call, add:
```typescript
supplier.slug = await this.generateUniqueSlug(createSupplierDto.companyName);
```

In the `update` method, find where the supplier is updated and saved. Check if `companyName` changed and regenerate:
```typescript
const nameChanged = dto.companyName !== undefined && dto.companyName !== supplier.companyName;
// ... (existing update logic) ...
if (nameChanged) {
  supplier.slug = await this.generateUniqueSlug(supplier.companyName, id);
}
```

Find `mapToDto` (or equivalent mapping method) and add `slug: supplier.slug` to the returned object.

- [ ] **Step 6: Add `GET slug/:slug` endpoint to `SupplierController`**

In `backend/src/modules/purchasing/controllers/supplier.controller.ts`, add **before** any `@Get(':id')` route:

```typescript
@Get('slug/:slug')
@ApiOperation({ summary: 'Get supplier by slug' })
@ApiParam({ name: 'slug', description: 'Supplier slug', type: 'string' })
@ApiResponse({ status: 200, description: 'Supplier retrieved successfully', type: SupplierResponseDto })
@ApiResponse({ status: 404, description: 'Supplier not found' })
async getSupplierBySlug(@Param('slug') slug: string): Promise<SupplierResponseDto> {
  return this.supplierService.findBySlug(slug);
}
```

- [ ] **Step 7: Run backend tests**

```bash
cd backend && npx jest src/modules/purchasing --no-coverage
```

Expected: all passing

- [ ] **Step 8: Commit**

```bash
git add backend/src/database/entities/supplier.entity.ts \
  backend/src/database/migrations/ \
  backend/src/modules/purchasing/dto/supplier.dto.ts \
  backend/src/modules/purchasing/services/supplier.service.ts \
  backend/src/modules/purchasing/controllers/supplier.controller.ts
git commit -m "feat(backend): add slug to supplier entity, service, and controller"
```

---

## Task 4: Product Entity, Migration, and Backend

**Files:**
- Modify: `backend/src/database/entities/product.entity.ts`
- Create: migration file (generated)
- Modify: `backend/src/modules/inventory/dto/product.dto.ts`
- Modify: `backend/src/modules/inventory/services/product.service.ts`
- Modify: `backend/src/modules/inventory/controllers/product.controller.ts`

- [ ] **Step 1: Add `slug` column to Product entity**

In `backend/src/database/entities/product.entity.ts`, add after the `name` column:

```typescript
@Column({
  type: 'varchar',
  length: 255,
  nullable: true,
  comment: 'URL-friendly identifier derived from name',
})
@Index({ unique: true })
slug: string;
```

Add `Index` to `typeorm` import if not present.

- [ ] **Step 2: Generate and patch the migration**

```bash
cd backend && npm run migration:generate --name=AddProductSlug
```

Open the generated file and add after the `addColumn` call:

```typescript
await queryRunner.query(`
  UPDATE products
  SET slug = LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(name, '[^a-zA-Z0-9\\s-]', '', 'g'),
        '[\\s-]+', '-', 'g'
      ),
      '^-+|-+$', '', 'g'
    )
  ) || '-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL
`);

await queryRunner.query(`
  UPDATE products SET slug = 'entity-' || SUBSTRING(id::text, 1, 8)
  WHERE slug IS NULL OR slug = '' OR slug = '-'
`);
```

- [ ] **Step 3: Run the migration**

```bash
cd backend && npm run migration:run
```

Expected: no errors

- [ ] **Step 4: Add `slug` to `ProductResponseDto`**

In `backend/src/modules/inventory/dto/product.dto.ts`, add to `ProductResponseDto`:

```typescript
@ApiProperty({ example: 'steel-bolt-m6' })
slug: string;
```

- [ ] **Step 5: Add slug generation and `findBySlug` to `ProductService`**

In `backend/src/modules/inventory/services/product.service.ts`:

Add import:
```typescript
import { generateBaseSlug } from '../../../common/utils/slug.util';
```

Add methods to the class:
```typescript
private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = generateBaseSlug(name);
  let slug = base;
  let counter = 1;
  while (true) {
    const existing = await this.productRepository.findOne({
      where: { slug },
      withDeleted: true,
    });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${counter++}`;
  }
}

async findBySlug(slug: string): Promise<ProductResponseDto> {
  const product = await this.productRepository.findOne({
    where: { slug },
    relations: ['category'],
  });
  if (!product) throw new NotFoundException(`Product with slug '${slug}' not found`);
  return this.mapToResponseDto(product);
}
```

In the `create` method, before saving the product, add:
```typescript
product.slug = await this.generateUniqueSlug(createProductDto.name);
```

In the `update` method (around line 853), after finding the product and before saving, add:
```typescript
const nameChanged = updateProductDto.name !== undefined && updateProductDto.name !== product.name;
// ... existing update logic ...
if (nameChanged) {
  const updatedName = updateProductDto.name!;
  await this.productRepository.update(product.id, {
    slug: await this.generateUniqueSlug(updatedName, id),
  });
}
```

Note: the product update uses `this.productRepository.update(id, {...})` directly rather than entity save, so the slug update should be included in that call. Find the `update` call in the method and add `slug` to it if name changed.

Find `mapToResponseDto` and add `slug: product.slug` to the returned object.

- [ ] **Step 6: Add `GET slug/:slug` endpoint to `ProductController`**

In `backend/src/modules/inventory/controllers/product.controller.ts`, add **before** any `@Get(':id')` route:

```typescript
@Get('slug/:slug')
@ApiOperation({ summary: 'Get product by slug' })
@ApiParam({ name: 'slug', description: 'Product slug', type: 'string' })
@ApiResponse({ status: 200, description: 'Product retrieved successfully', type: ProductResponseDto })
@ApiResponse({ status: 404, description: 'Product not found' })
async getProductBySlug(@Param('slug') slug: string): Promise<ProductResponseDto> {
  return this.productService.findBySlug(slug);
}
```

- [ ] **Step 7: Run backend tests**

```bash
cd backend && npx jest src/modules/inventory --no-coverage
```

Expected: all passing

- [ ] **Step 8: Commit**

```bash
git add backend/src/database/entities/product.entity.ts \
  backend/src/database/migrations/ \
  backend/src/modules/inventory/dto/product.dto.ts \
  backend/src/modules/inventory/services/product.service.ts \
  backend/src/modules/inventory/controllers/product.controller.ts
git commit -m "feat(backend): add slug to product entity, service, and controller"
```

---

## Task 5: Purchase Order and Stock Adjustment — By-Number Endpoints

Sales Orders already have `GET /orders/number/:orderNumber` and `findByOrderNumber`. This task adds equivalent endpoints for Purchase Orders and Stock Adjustments.

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`
- Modify: `backend/src/modules/purchasing/controllers/purchase-order.controller.ts`
- Modify: `backend/src/modules/inventory/services/stock-adjustment.service.ts`
- Modify: `backend/src/modules/inventory/controllers/stock-adjustment.controller.ts`

- [ ] **Step 1: Add `findByOrderNumber` to `PurchaseOrderService`**

In `backend/src/modules/purchasing/services/purchase-order.service.ts`, find the `findOne(id)` method and add below it:

```typescript
async findByOrderNumber(orderNumber: string): Promise<PurchaseOrderResponseDto> {
  const order = await this.purchaseOrderRepository.findOne({
    where: { orderNumber },
    relations: ['supplier', 'items', 'items.product'],
  });
  if (!order) throw new NotFoundException(`Purchase order '${orderNumber}' not found`);
  return this.mapToResponseDto(order);
}
```

Use the same `mapToResponseDto` / mapping pattern already used in `findOne`. Check what `findOne` returns and mirror it.

- [ ] **Step 2: Add `GET by-number/:orderNumber` to `PurchaseOrderController`**

In `backend/src/modules/purchasing/controllers/purchase-order.controller.ts`, add **before** `@Get(':id')`:

```typescript
@Get('by-number/:orderNumber')
@ApiOperation({ summary: 'Get purchase order by order number' })
@ApiParam({ name: 'orderNumber', description: 'Purchase order number (e.g. PO-001)', type: 'string' })
@ApiResponse({ status: 200, description: 'Purchase order retrieved successfully' })
@ApiResponse({ status: 404, description: 'Purchase order not found' })
async findByOrderNumber(@Param('orderNumber') orderNumber: string) {
  return this.purchaseOrderService.findByOrderNumber(orderNumber);
}
```

- [ ] **Step 3: Add `findByAdjustmentNumber` to `StockAdjustmentService`**

In `backend/src/modules/inventory/services/stock-adjustment.service.ts`, add after `findOne`:

```typescript
async findByAdjustmentNumber(adjustmentNumber: string): Promise<StockAdjustmentResponseDto> {
  const adjustment = await this.stockAdjustmentRepository.findOne({
    where: { adjustmentNumber },
    relations: ['items', 'items.product', 'adjustedByUser'],
  });
  if (!adjustment) throw new NotFoundException(`Stock adjustment '${adjustmentNumber}' not found`);
  return this.mapToResponseDto(adjustment);
}
```

Use the same `mapToResponseDto` / mapping pattern as `findOne`. Check what relations `findOne` loads and mirror them.

- [ ] **Step 4: Add `GET by-number/:adjustmentNumber` to `StockAdjustmentController`**

In `backend/src/modules/inventory/controllers/stock-adjustment.controller.ts`, add **before** `@Get(':id')`:

```typescript
@Get('by-number/:adjustmentNumber')
@ApiOperation({ summary: 'Get stock adjustment by adjustment number' })
@ApiParam({ name: 'adjustmentNumber', description: 'Adjustment number (e.g. SA-001)', type: 'string' })
@ApiResponse({ status: 200, description: 'Stock adjustment retrieved successfully' })
@ApiResponse({ status: 404, description: 'Stock adjustment not found' })
async findByAdjustmentNumber(@Param('adjustmentNumber') adjustmentNumber: string) {
  return this.stockAdjustmentService.findByAdjustmentNumber(adjustmentNumber);
}
```

- [ ] **Step 5: Run backend tests**

```bash
cd backend && npx jest src/modules/purchasing src/modules/inventory --no-coverage
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/purchasing/services/purchase-order.service.ts \
  backend/src/modules/purchasing/controllers/purchase-order.controller.ts \
  backend/src/modules/inventory/services/stock-adjustment.service.ts \
  backend/src/modules/inventory/controllers/stock-adjustment.controller.ts
git commit -m "feat(backend): add by-number lookup endpoints for purchase orders and stock adjustments"
```

---

## Task 6: Frontend Types and API Endpoints

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/store/api/salesApi.ts`
- Modify: `frontend/src/store/api/purchasingApi.ts`
- Modify: `frontend/src/store/api/inventoryApi.ts`

- [ ] **Step 1: Add `slug` to frontend types**

In `frontend/src/types/index.ts`:

In `interface Product` (line 27), add after `id: string;`:
```typescript
slug: string;
```

In `interface Customer` (line 159), add after `id: string;`:
```typescript
slug: string;
```

In `interface Supplier` (line 317), add after `id: string;`:
```typescript
slug: string;
```

`SalesOrder`, `PurchaseOrder`, and `StockAdjustment` already have `orderNumber`/`adjustmentNumber` — no changes needed.

- [ ] **Step 2: Add `getCustomerBySlug` to `salesApi`**

In `frontend/src/store/api/salesApi.ts`, add inside the `endpoints` builder, after `getCustomer`:

```typescript
getCustomerBySlug: builder.query<Customer, string>({
  query: (slug) => `customers/slug/${slug}`,
  providesTags: (result) => result ? [{ type: 'Customers' as const, id: result.id }] : [],
}),
```

Also add `getSalesOrderByNumber`:
```typescript
getSalesOrderByNumber: builder.query<SalesOrder, string>({
  query: (orderNumber) => `orders/number/${orderNumber}`,
  providesTags: (result) => result ? [{ type: 'SalesOrders' as const, id: result.id }] : [],
}),
```

Export the new hooks at the bottom of the file (find the existing exports block and add):
```typescript
export const {
  // ... existing exports ...
  useGetCustomerBySlugQuery,
  useGetSalesOrderByNumberQuery,
} = salesApiSlice
```

- [ ] **Step 3: Add `getSupplierBySlug` and `getPurchaseOrderByNumber` to `purchasingApi`**

In `frontend/src/store/api/purchasingApi.ts`, add inside `endpoints`:

```typescript
getSupplierBySlug: builder.query<Supplier, string>({
  query: (slug) => `suppliers/slug/${slug}`,
  providesTags: (result) => result ? [{ type: 'Suppliers' as const, id: result.id }] : [],
}),
getPurchaseOrderByNumber: builder.query<PurchaseOrder, string>({
  query: (orderNumber) => `purchase-orders/by-number/${orderNumber}`,
  providesTags: (result) => result ? [{ type: 'PurchaseOrders' as const, id: result.id }] : [],
}),
```

Export the new hooks at the bottom.

- [ ] **Step 4: Add `getProductBySlug` and `getStockAdjustmentByNumber` to `inventoryApi`**

In `frontend/src/store/api/inventoryApi.ts`, add inside `endpoints`:

```typescript
getProductBySlug: builder.query<Product, string>({
  query: (slug) => `products/slug/${slug}`,
  providesTags: (result) => result ? [{ type: 'Products' as const, id: result.id }] : [],
}),
getStockAdjustmentByNumber: builder.query<StockAdjustment, string>({
  query: (adjustmentNumber) => `stock-adjustments/by-number/${adjustmentNumber}`,
  providesTags: (result) => result ? [{ type: 'StockAdjustments' as const, id: result.id }] : [],
}),
```

Export the new hooks at the bottom.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts \
  frontend/src/store/api/salesApi.ts \
  frontend/src/store/api/purchasingApi.ts \
  frontend/src/store/api/inventoryApi.ts
git commit -m "feat(frontend): add slug to entity types and by-slug/number API queries"
```

---

## Task 7: Router Updates

**Files:**
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Update all 6 edit routes**

In `frontend/src/router.tsx`, replace:

```typescript
{ path: '/inventory/products/:id/edit', element: <CreateProductPage />, handle: { title: 'Edit Product' } },
{ path: '/inventory/stock-adjustments/:id/edit', element: <CreateStockAdjustmentPage />, handle: { title: 'Edit Stock Adjustment' } },
{ path: '/sales/customers/:id/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } },
{ path: '/sales/orders/:id/edit', element: <CreateSalesOrderPage />, handle: { title: 'Edit Sales Order' } },
{ path: '/purchasing/suppliers/:id/edit', element: <SupplierFormPage />, handle: { title: 'Edit Supplier' } },
{ path: '/purchasing/orders/:id/edit', element: <CreatePurchaseOrderPage />, handle: { title: 'Edit Purchase Order' } },
```

With:

```typescript
{ path: '/inventory/products/:slug/edit', element: <CreateProductPage />, handle: { title: 'Edit Product' } },
{ path: '/inventory/stock-adjustments/:adjustmentNumber/edit', element: <CreateStockAdjustmentPage />, handle: { title: 'Edit Stock Adjustment' } },
{ path: '/sales/customers/:slug/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } },
{ path: '/sales/orders/:orderNumber/edit', element: <CreateSalesOrderPage />, handle: { title: 'Edit Sales Order' } },
{ path: '/purchasing/suppliers/:slug/edit', element: <SupplierFormPage />, handle: { title: 'Edit Supplier' } },
{ path: '/purchasing/orders/:orderNumber/edit', element: <CreatePurchaseOrderPage />, handle: { title: 'Edit Purchase Order' } },
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors (params are `string` either way)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/router.tsx
git commit -m "refactor(frontend): update edit routes to use slug/reference params"
```

---

## Task 8: Customers Page and Form — Slug Routing + Highlight

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`
- Modify: `frontend/src/pages/sales/CustomerFormPage.tsx`

- [ ] **Step 1: Update `CustomersPage` workspace config**

In `frontend/src/pages/sales/CustomersPage.tsx`, update the `useEntityWorkspace` call:

```typescript
const workspace = useEntityWorkspace({
  // ... existing config ...
  routes: {
    create: '/sales/customers/create',
    edit: (id, entity) => `/sales/customers/${(entity as Customer).slug}/edit`,
  },
  highlightParam: 'highlight',
  // ... rest of existing config ...
})
```

Note: `useEntityWorkspace`'s `routes.edit` currently has signature `(id: string) => string`. Check if it supports a second `entity` argument — if not, you'll need to update the call site to use the selected customer's slug directly. The simplest approach: update just the route string to use the entity from the workspace. Look at how `handleEdit` is called and use `selectedCustomer.slug` there instead.

The cleanest fix that avoids changing `useEntityWorkspace`'s signature: keep `edit: (id) => `/sales/customers/${id}/edit`` and update the places that call navigate to edit (context header, workspace card) to use `customer.slug` instead of `customer.id`.

- [ ] **Step 2: Update navigate-to-edit calls to use slug**

Search for any calls in `CustomerContextHeader.tsx` and `CustomerWorkspaceCard.tsx` that navigate to the edit route with an ID:

In `frontend/src/pages/sales/components/CustomerContextHeader.tsx`, find any `navigate(\`/sales/customers/${...}/edit\`)` and replace the ID with `customer.slug`.

In `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`, do the same.

In `frontend/src/pages/sales/CustomersPage.tsx`, find the `routes.edit` fn and change it to:
```typescript
edit: (id) => {
  const customer = customers.find(c => c.id === id)
  return `/sales/customers/${customer?.slug ?? id}/edit`
},
```

- [ ] **Step 3: Update `CustomerFormPage` to use slug param and highlight on return**

In `frontend/src/pages/sales/CustomerFormPage.tsx`:

Change `useParams`:
```typescript
const { slug } = useParams<{ slug: string }>()
```

Change the fetch logic (currently `api.get(\`/customers/${id}\`)`):
```typescript
// When slug is present (edit mode), fetch by slug
useEffect(() => {
  if (!slug) return
  api.get(`/customers/slug/${slug}`).then(response => {
    const customer = response.data
    setEditingCustomerId(customer.id)
    // ... populate form fields as currently done
  })
}, [slug])
```

You'll need to store the resolved UUID separately for the update call. Add a state variable:
```typescript
const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
```

Update all PUT calls to use `editingCustomerId` instead of `id`.

Change the post-save navigate call (currently `navigate('/sales/customers')`):
```typescript
navigate(`/sales/customers?highlight=${savedCustomer.id}`)
```

Do this for both the create case (use the newly created customer's id) and the update case.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 5: Run existing customer form tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomerFormPage.test.tsx
```

Fix any test failures caused by the param name change from `id` to `slug`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx \
  frontend/src/pages/sales/CustomerFormPage.tsx \
  frontend/src/pages/sales/components/CustomerContextHeader.tsx \
  frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx
git commit -m "feat(frontend): customer edit uses slug URL and highlights row on return"
```

---

## Task 9: Suppliers Page and Form — Slug Routing + Highlight

**Files:**
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Modify: `frontend/src/pages/purchasing/SupplierFormPage.tsx`
- Modify: `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx`
- Modify: `frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx`

- [ ] **Step 1: Update `SuppliersPage` workspace config**

In `frontend/src/pages/purchasing/SuppliersPage.tsx`, update the `useEntityWorkspace` call:

```typescript
const workspace = useEntityWorkspace({
  // ... existing config ...
  routes: {
    create: '/purchasing/suppliers/create',
    edit: (id) => {
      const supplier = suppliers.find(s => s.id === id)
      return `/purchasing/suppliers/${supplier?.slug ?? id}/edit`
    },
  },
  highlightParam: 'highlight',
  // ... rest ...
})
```

- [ ] **Step 2: Update navigate-to-edit calls to use slug**

In `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx` and `SupplierWorkspaceCard.tsx`, replace any `navigate(\`/purchasing/suppliers/${supplier.id}/edit\`)` with `navigate(\`/purchasing/suppliers/${supplier.slug}/edit\`)`.

- [ ] **Step 3: Update `SupplierFormPage` to use slug param and highlight on return**

In `frontend/src/pages/purchasing/SupplierFormPage.tsx`:

Change `useParams`:
```typescript
const { slug } = useParams<{ slug: string }>()
```

Add state for resolved UUID:
```typescript
const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null)
```

Change the fetch to use slug endpoint:
```typescript
useEffect(() => {
  if (!slug) return
  api.get(`/suppliers/slug/${slug}`).then(response => {
    const supplier = response.data
    setEditingSupplierId(supplier.id)
    // ... populate form fields ...
  })
}, [slug])
```

Update all PUT calls to use `editingSupplierId`.

Change post-save navigate:
```typescript
navigate(`/purchasing/suppliers?highlight=${savedSupplier.id}`)
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 5: Run existing supplier form tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/SupplierFormPage.test.tsx
```

Fix any failures from the param name change.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/SuppliersPage.tsx \
  frontend/src/pages/purchasing/SupplierFormPage.tsx \
  frontend/src/pages/purchasing/components/SupplierContextHeader.tsx \
  frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx
git commit -m "feat(frontend): supplier edit uses slug URL and highlights row on return"
```

---

## Task 10: Products — Slug Routing + Highlight

**Files:**
- Modify: `frontend/src/pages/inventory/hooks/useProductsWorkspace.ts`
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx`
- Modify: `frontend/src/pages/inventory/components/ProductContextHeader.tsx`
- Modify: `frontend/src/pages/inventory/components/ProductWorkspaceCard.tsx`

- [ ] **Step 1: Update `useProductsWorkspace` routes and highlight**

In `frontend/src/pages/inventory/hooks/useProductsWorkspace.ts`:

Update the `useEntityWorkspace` config:
```typescript
routes: {
  create: '/inventory/products/create',
  edit: (id) => {
    const product = products.find(p => p.id === id)
    return `/inventory/products/${product?.slug ?? id}/edit`
  },
},
highlightParam: 'highlight',
```

Update `handleEditProduct`:
```typescript
const handleEditProduct = useCallback(
  (product: Product) => {
    navigate(`/inventory/products/${product.slug}/edit`)
  },
  [navigate],
)
```

Remove the `navigationSelectionId` / `selectedProductId` location-state effect — replace with the standard `highlightParam` mechanism. The effect currently watches `location.state.selectedProductId`; remove it and instead rely on `?highlight=<id>` query param.

- [ ] **Step 2: Update `CreateProductPage` to use slug param and highlight on return**

In `frontend/src/pages/inventory/CreateProductPage.tsx`:

Change `useParams` to use `slug`:
```typescript
const { slug } = useParams<{ slug: string }>()
```

Add state for resolved UUID:
```typescript
const [editingProductId, setEditingProductId] = useState<string | null>(null)
```

Fetch product by slug when in edit mode:
```typescript
useEffect(() => {
  if (!slug) return
  api.get(`/products/slug/${slug}`).then(response => {
    const product = response.data
    setEditingProductId(product.id)
    // ... populate form fields ...
  })
}, [slug])
```

Update PUT calls to use `editingProductId`.

Change the post-save navigate (currently `navigate('/inventory/products', { state: { selectedProductId: id } })`):
```typescript
navigate(`/inventory/products?highlight=${savedProduct.id}`)
```

Do this for both create and update paths.

- [ ] **Step 3: Update navigate-to-edit calls in context header and workspace card**

In `frontend/src/pages/inventory/components/ProductContextHeader.tsx` and `ProductWorkspaceCard.tsx`, replace any `navigate(\`/inventory/products/${product.id}/edit\`)` with `navigate(\`/inventory/products/${product.slug}/edit\`)`.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useProductsWorkspace.ts \
  frontend/src/pages/inventory/CreateProductPage.tsx \
  frontend/src/pages/inventory/components/ProductContextHeader.tsx \
  frontend/src/pages/inventory/components/ProductWorkspaceCard.tsx
git commit -m "feat(frontend): product edit uses slug URL and highlights row on return"
```

---

## Task 11: Stock Adjustments — Reference Routing + Highlight

**Files:**
- Modify: `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts`
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`
- Modify: `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx`
- Modify: `frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx`

- [ ] **Step 1: Update `useStockAdjustmentsWorkspace` routes and highlight**

In `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts`:

```typescript
routes: {
  create: '/inventory/stock-adjustments/create',
  edit: (id) => {
    const adjustment = adjustments.find(a => a.id === id)
    return `/inventory/stock-adjustments/${adjustment?.adjustmentNumber ?? id}/edit`
  },
},
highlightParam: 'highlight',
```

Remove any existing `saId` query param logic (currently uses `?saId=` to highlight). Replace with the standard `highlightParam: 'highlight'` mechanism.

- [ ] **Step 2: Update `CreateStockAdjustmentPage` to use adjustmentNumber param and highlight on return**

In `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`:

Change `useParams`:
```typescript
const { adjustmentNumber } = useParams<{ adjustmentNumber: string }>()
```

Add state for resolved UUID:
```typescript
const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null)
```

Fetch by adjustment number when editing:
```typescript
useEffect(() => {
  if (!adjustmentNumber) return
  api.get(`/stock-adjustments/by-number/${adjustmentNumber}`).then(response => {
    const adjustment = response.data
    setEditingAdjustmentId(adjustment.id)
    // ... populate form fields ...
  })
}, [adjustmentNumber])
```

Update PUT calls to use `editingAdjustmentId`.

Change post-save navigate (currently uses `saId` or UUID):
```typescript
navigate(`/inventory/stock-adjustments?highlight=${savedAdjustment.id}`)
```

- [ ] **Step 3: Update navigate-to-edit in context header and workspace card**

In `StockAdjustmentContextHeader.tsx` and `StockAdjustmentWorkspaceCard.tsx`, replace any `navigate(\`/inventory/stock-adjustments/${adjustment.id}/edit\`)` with `navigate(\`/inventory/stock-adjustments/${adjustment.adjustmentNumber}/edit\`)`.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts \
  frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx \
  frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx \
  frontend/src/pages/inventory/components/StockAdjustmentWorkspaceCard.tsx
git commit -m "feat(frontend): stock adjustment edit uses adjustmentNumber URL and highlights row on return"
```

---

## Task 12: Sales Orders — Reference Routing + Highlight

Sales orders already navigate with `?highlight=<id>` after save. This task only updates the edit route to use `orderNumber`.

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- Modify: `frontend/src/pages/sales/components/OrderContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/OrderWorkspaceCard.tsx`

- [ ] **Step 1: Update `useOrdersWorkspace` edit route**

In `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`, update the `routes.edit` fn:

```typescript
routes: {
  create: '/sales/orders/create',
  edit: (id) => {
    const order = orders.find(o => o.id === id)
    return `/sales/orders/${order?.orderNumber ?? id}/edit`
  },
},
```

Also update the `onEnter` handler that navigates to edit:
```typescript
onEnter: () => {
  if (workspaceRef.current?.focusedIndex != null && workspaceRef.current.focusedIndex >= 0) {
    const order = orders[workspaceRef.current.focusedIndex]
    if (order) {
      navigate(`/sales/orders/${order.orderNumber}/edit`)
    }
  }
},
```

- [ ] **Step 2: Update `CreateSalesOrderPage` to use orderNumber param**

In `frontend/src/pages/sales/CreateSalesOrderPage.tsx`:

Change `useParams`:
```typescript
const { orderNumber } = useParams<{ orderNumber: string }>()
```

Add state for resolved UUID:
```typescript
const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
```

Fetch by order number when in edit mode (find the existing fetch-by-id call and replace):
```typescript
useEffect(() => {
  if (!orderNumber) return
  api.get(`/orders/number/${orderNumber}`).then(response => {
    const order = response.data
    setEditingOrderId(order.id)
    // ... populate form ...
  })
}, [orderNumber])
```

Update PUT calls to use `editingOrderId`.

The existing post-save navigate already uses `?highlight=<id>` — verify it's using the ID (not UUID from params) and leave it as is.

- [ ] **Step 3: Update navigate-to-edit in context header and workspace card**

In `OrderContextHeader.tsx` and `OrderWorkspaceCard.tsx`, replace `navigate(\`/sales/orders/${order.id}/edit\`)` with `navigate(\`/sales/orders/${order.orderNumber}/edit\`)`.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/hooks/useOrdersWorkspace.ts \
  frontend/src/pages/sales/CreateSalesOrderPage.tsx \
  frontend/src/pages/sales/components/OrderContextHeader.tsx \
  frontend/src/pages/sales/components/OrderWorkspaceCard.tsx
git commit -m "feat(frontend): sales order edit uses orderNumber URL"
```

---

## Task 13: Purchase Orders — Reference Routing + Highlight

**Files:**
- Modify: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx`

- [ ] **Step 1: Update `usePurchaseOrdersWorkspace` edit route**

In `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`:

```typescript
routes: {
  create: '/purchasing/orders/create',
  edit: (id) => {
    const order = purchaseOrders.find(o => o.id === id)
    return `/purchasing/orders/${order?.orderNumber ?? id}/edit`
  },
},
```

- [ ] **Step 2: Update `CreatePurchaseOrderPage` to use orderNumber param**

In `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`:

Change `useParams`:
```typescript
const { orderNumber } = useParams<{ orderNumber: string }>()
```

Add state for resolved UUID:
```typescript
const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
```

Fetch by order number:
```typescript
useEffect(() => {
  if (!orderNumber) return
  api.get(`/purchase-orders/by-number/${orderNumber}`).then(response => {
    const order = response.data
    setEditingOrderId(order.id)
    // ... populate form ...
  })
}, [orderNumber])
```

Update PUT calls to use `editingOrderId`.

The existing post-save navigate already uses `?highlight=<id>` — verify and leave as is.

- [ ] **Step 3: Update navigate-to-edit in context header and workspace card**

In `PurchaseOrderContextHeader.tsx` and `PurchaseOrderWorkspaceCard.tsx`, replace `navigate(\`/purchasing/orders/${order.id}/edit\`)` with `navigate(\`/purchasing/orders/${order.orderNumber}/edit\`)`.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts \
  frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx \
  frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx \
  frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx
git commit -m "feat(frontend): purchase order edit uses orderNumber URL"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm run test
```

Expected: all passing

- [ ] **Step 2: Run full TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: no errors

- [ ] **Step 4: Manual smoke test**

Start the backend dev server:
```bash
cd backend && npm run start:dev
```

Test the following flows:
1. Create a new customer → saved → customer list opens, new customer row is highlighted
2. Edit a customer, change the name → saved → list opens, customer is highlighted, URL during edit was `/sales/customers/<slug>/edit`
3. Navigate directly to `/sales/customers/<slug>/edit` for an existing customer — form loads
4. Navigate to `/sales/customers/nonexistent-slug/edit` — form shows not-found state (not a crash)
5. Repeat flows 1-4 for Supplier and Product
6. Edit a Sales Order → URL is `/sales/orders/SO-001/edit` → save → highlighted in list
7. Edit a Purchase Order → URL is `/purchasing/orders/PO-001/edit` → works
8. Edit a Stock Adjustment → URL is `/inventory/stock-adjustments/SA-001/edit` → works

- [ ] **Step 5: Final commit (if any loose ends)**

```bash
git add -p  # review any remaining changes
git commit -m "feat: entity slugs and highlight-on-return across all modules"
```
