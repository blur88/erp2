# Issue #379 — Category Products Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix "Failed to load products" in `CategoryWorkspaceCard` by adding a lightweight `GET /inventory/categories/:id/products` endpoint and wiring it to the frontend component.

**Architecture:** Add `CategoryProductDto` to the backend DTO file, a `getCategoryProducts` method to `CategoryService`, and a new `@Get(':id/products')` route to `CategoryController`. On the frontend, add a `getCategoryProducts` RTK Query endpoint to `inventoryApiSlice` and update `CategoryWorkspaceCard` to use the new hook.

**Tech Stack:** NestJS 11, TypeORM, Jest (backend); React 19, RTK Query, Vitest (frontend)

---

## File Map

| File | Change |
|------|--------|
| `backend/src/modules/inventory/dto/category.dto.ts` | Add `CategoryProductDto` |
| `backend/src/modules/inventory/services/category.service.ts` | Add `getCategoryProducts` method |
| `backend/src/modules/inventory/controllers/category.controller.ts` | Add `@Get(':id/products')` route before `@Get(':id')` |
| `backend/src/modules/inventory/services/category.service.spec.ts` | Add 3 tests for `getCategoryProducts` |
| `frontend/src/store/api/inventoryApi.ts` | Add `getCategoryProducts` RTK endpoint + export hook |
| `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx` | Replace `useGetProductsQuery` with `useGetCategoryProductsQuery` |
| `frontend/src/pages/inventory/components/CategoryWorkspaceCard.test.tsx` | Update mock + add error-state test |

---

## Task 1: Add `CategoryProductDto` to backend DTOs

**Files:**
- Modify: `backend/src/modules/inventory/dto/category.dto.ts`

- [ ] **Step 1: Add the DTO**

Open `backend/src/modules/inventory/dto/category.dto.ts`. Add this class at the end of the file, after the last export:

```ts
export class CategoryProductDto {
  @ApiProperty({ description: 'Product ID' })
  id: string;

  @ApiProperty({ description: 'Product name' })
  name: string;

  @ApiProperty({ description: 'Current stock quantity' })
  stockQuantity: number;
}
```

You will need `ApiProperty` — it is already imported at the top of `category.dto.ts`. No new imports needed.

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -i "category.dto" | head -20
```

Expected: no output (no errors in that file).

- [ ] **Step 3: Commit**

```bash
cd backend
git add src/modules/inventory/dto/category.dto.ts
git commit -m "feat(inventory): add CategoryProductDto"
```

---

## Task 2: Add `getCategoryProducts` to `CategoryService` — test first

**Files:**
- Modify: `backend/src/modules/inventory/services/category.service.spec.ts`
- Modify: `backend/src/modules/inventory/services/category.service.ts`

- [ ] **Step 1: Read the existing spec to understand mock setup**

```bash
head -110 backend/src/modules/inventory/services/category.service.spec.ts
```

Note: `productRepository` is mocked as `{ find: jest.fn(), count: jest.fn(), ... }` alongside `categoryRepository`. The test module uses `getRepositoryToken(Product)` and `getRepositoryToken(Category)`.

- [ ] **Step 2: Write the three failing tests**

In `backend/src/modules/inventory/services/category.service.spec.ts`, add a new `describe` block after the existing ones:

```ts
describe('getCategoryProducts', () => {
  it('returns products for a valid category', async () => {
    categoryRepository.findOne.mockResolvedValue({ id: 'cat-1', name: 'Hardware' } as any);
    productRepository.find.mockResolvedValue([
      { id: 'prod-1', name: 'Widget', stockQuantity: 5 },
      { id: 'prod-2', name: 'Bolt', stockQuantity: 0 },
    ] as any);

    const result = await service.getCategoryProducts('cat-1');

    expect(result).toEqual({
      data: [
        { id: 'prod-1', name: 'Widget', stockQuantity: 5 },
        { id: 'prod-2', name: 'Bolt', stockQuantity: 0 },
      ],
    });
    expect(productRepository.find).toHaveBeenCalledWith({
      where: { categoryId: 'cat-1' },
      select: ['id', 'name', 'stockQuantity'],
    });
  });

  it('returns empty data array for a category with no products', async () => {
    categoryRepository.findOne.mockResolvedValue({ id: 'cat-2', name: 'Empty' } as any);
    productRepository.find.mockResolvedValue([] as any);

    const result = await service.getCategoryProducts('cat-2');

    expect(result).toEqual({ data: [] });
  });

  it('throws NotFoundException for an unknown category ID', async () => {
    categoryRepository.findOne.mockResolvedValue(null);

    await expect(service.getCategoryProducts('no-such-id')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/inventory/services/category.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: 3 failures — `service.getCategoryProducts is not a function`.

- [ ] **Step 4: Implement `getCategoryProducts` in `CategoryService`**

In `backend/src/modules/inventory/services/category.service.ts`, add this method inside the `CategoryService` class (e.g., after `findOne`):

```ts
async getCategoryProducts(id: string): Promise<{ data: CategoryProductDto[] }> {
  const category = await this.categoryRepository.findOne({ where: { id } });
  if (!category) {
    throw new NotFoundException(`Category with id ${id} not found`);
  }
  const products = await this.productRepository.find({
    where: { categoryId: id },
    select: ['id', 'name', 'stockQuantity'],
  });
  return { data: products as CategoryProductDto[] };
}
```

Also add `CategoryProductDto` to the imports from `../dto/category.dto` at the top of the file. The existing import line looks like:

```ts
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  ...
} from '../dto/category.dto';
```

Add `CategoryProductDto` to that list.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/inventory/services/category.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests in that file pass (including the 3 new ones).

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/modules/inventory/services/category.service.spec.ts src/modules/inventory/services/category.service.ts
git commit -m "feat(inventory): add getCategoryProducts to CategoryService"
```

---

## Task 3: Add `@Get(':id/products')` route to `CategoryController`

**Files:**
- Modify: `backend/src/modules/inventory/controllers/category.controller.ts`

- [ ] **Step 1: Add the route**

In `backend/src/modules/inventory/controllers/category.controller.ts`, add the new route **immediately before** the existing `@Get(':id')` handler. The existing `@Get(':id')` block starts around line 146. Insert before it:

```ts
@Get(':id/products')
@ApiOperation({ summary: 'Get products in a category' })
@ApiResponse({
  status: 200,
  description: 'Category products retrieved successfully',
})
@ApiResponse({ status: 404, description: 'Category not found' })
@ApiParam({ name: 'id', description: 'Category ID' })
async getCategoryProducts(
  @Param('id', ParseUUIDPipe) id: string,
): Promise<{ data: CategoryProductDto[] }> {
  return this.categoryService.getCategoryProducts(id);
}
```

Also add `CategoryProductDto` to the import from `../dto/category.dto` at the top of the controller file.

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -i "category.controller\|category.service\|category.dto" | head -20
```

Expected: no output.

- [ ] **Step 3: Run the full category service spec to confirm no regressions**

```bash
cd backend && npx jest src/modules/inventory/services/category.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/modules/inventory/controllers/category.controller.ts
git commit -m "feat(inventory): add GET categories/:id/products endpoint"
```

---

## Task 4: Add `getCategoryProducts` RTK Query endpoint to frontend

**Files:**
- Modify: `frontend/src/store/api/inventoryApi.ts`

- [ ] **Step 1: Add the `CategoryProduct` type**

Near the top of `frontend/src/store/api/inventoryApi.ts`, after the existing `Product` and `Category` interface definitions, add:

```ts
export interface CategoryProduct {
  id: string;
  name: string;
  stockQuantity: number;
}
```

- [ ] **Step 2: Add the RTK Query endpoint**

Inside the `endpoints` builder in `inventoryApiSlice`, add `getCategoryProducts` after the existing `getCategories` endpoint:

```ts
getCategoryProducts: builder.query<{ data: CategoryProduct[] }, string>({
  query: (categoryId) => `/inventory/categories/${categoryId}/products`,
  providesTags: (_result, _error, categoryId) => [{ type: 'Category', id: categoryId }],
}),
```

- [ ] **Step 3: Export the generated hook**

In the destructured exports at the bottom of `inventoryApi.ts` (inside the `} = inventoryApiSlice` block), add:

```ts
useGetCategoryProductsQuery,
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "inventoryApi\|CategoryProduct" | head -20
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/store/api/inventoryApi.ts
git commit -m "feat(inventory): add getCategoryProducts RTK Query endpoint"
```

---

## Task 5: Update `CategoryWorkspaceCard` to use the new hook

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx`

- [ ] **Step 1: Swap the import**

In `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx`, change line 18:

```ts
// Before
import { useGetProductsQuery } from '@/store/api/inventoryApi'

// After
import { useGetCategoryProductsQuery } from '@/store/api/inventoryApi'
```

- [ ] **Step 2: Swap the hook call**

Replace the existing hook call (around line 29–33):

```ts
// Before
const { data: productsResponse, isLoading, isError } = useGetProductsQuery(
  { categoryId },
  { skip: !categoryId },
)

// After
const { data: productsResponse, isLoading, isError } = useGetCategoryProductsQuery(
  categoryId,
  { skip: !categoryId },
)
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "CategoryWorkspaceCard\|useGetCategoryProducts" | head -20
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/pages/inventory/components/CategoryWorkspaceCard.tsx
git commit -m "fix(inventory): use getCategoryProducts hook in CategoryWorkspaceCard"
```

---

## Task 6: Update `CategoryWorkspaceCard.test.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryWorkspaceCard.test.tsx`

- [ ] **Step 1: Update the mock and existing tests**

Replace the contents of `frontend/src/pages/inventory/components/CategoryWorkspaceCard.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CategoryWorkspaceCard from './CategoryWorkspaceCard'

import type { Category } from '@/types'

const mockUseGetCategoryProductsQuery = vi.hoisted(() => vi.fn())
const mockUseGetRegionalSettingsQuery = vi.hoisted(() => vi.fn())

vi.mock('@/store/api/inventoryApi', () => ({
  useGetCategoryProductsQuery: mockUseGetCategoryProductsQuery,
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetRegionalSettingsQuery: mockUseGetRegionalSettingsQuery,
}))

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-1',
  name: 'Hardware',
  level: 0,
  parentId: null,
  fullPath: 'Hardware',
  isRoot: true,
  hasChildren: false,
  isActive: true,
  productCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const makeProduct = (overrides: Partial<{ id: string; name: string; stockQuantity: number }> = {}) => ({
  id: 'prod-1',
  name: 'Widget',
  stockQuantity: 12,
  ...overrides,
})

describe('CategoryWorkspaceCard', () => {
  beforeEach(() => {
    mockUseGetCategoryProductsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReset()
    mockUseGetRegionalSettingsQuery.mockReturnValue({ data: { lowStockThreshold: 10 } })
  })

  it('renders a products table and notes section instead of tab panels', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({
      data: { data: [makeProduct({ name: 'Widget', stockQuantity: 3 })] },
      isLoading: false,
      isError: false,
    })

    render(<CategoryWorkspaceCard selectedCategory={makeCategory({ description: 'Shelf A' })} />)

    expect(screen.getByText('Category Products')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Stock' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByText('Low Stock')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Shelf A')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByText('Full Path')).not.toBeInTheDocument()
  })

  it('skips the products query when no category is selected', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    })

    render(<CategoryWorkspaceCard selectedCategory={null} />)

    expect(mockUseGetCategoryProductsQuery).toHaveBeenCalledWith('', { skip: true })
    expect(screen.queryByText('Category Products')).not.toBeInTheDocument()
  })

  it('shows error alert when query fails', () => {
    mockUseGetCategoryProductsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })

    render(<CategoryWorkspaceCard selectedCategory={makeCategory()} />)

    expect(screen.getByText('Failed to load products.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test file**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryWorkspaceCard.test.tsx 2>&1 | tail -20
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/pages/inventory/components/CategoryWorkspaceCard.test.tsx
git commit -m "test(inventory): update CategoryWorkspaceCard tests for new hook"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run all backend inventory tests**

```bash
cd backend && npx jest src/modules/inventory --no-coverage 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 2: Run all frontend inventory tests**

```bash
cd frontend && npx vitest run src/pages/inventory 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 3: Full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -10
cd backend && npx tsc --noEmit -p tsconfig.build.json 2>&1 | tail -10
```

Expected: no errors.
