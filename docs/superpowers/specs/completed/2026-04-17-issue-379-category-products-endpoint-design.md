---
name: Issue #379 — Category Products Dedicated Endpoint
description: Fix "Failed to load products" in CategoryWorkspaceCard by adding a lightweight GET /inventory/categories/:id/products endpoint
type: project
---

## Problem

`CategoryWorkspaceCard` calls `useGetProductsQuery({ categoryId })` which maps to `GET /api/inventory/products`. That endpoint calls `ProductService.applyQueryBuilder`, which does complex `leftJoinAndSelect` on `priceListItems` and `priceList` (including a `priceList.deletedAt IS NULL` condition on a soft-deleted joined entity). This causes a 500 error. The component only needs `id`, `name`, and `stockQuantity` — none of the price list data.

## Solution

Add a dedicated `GET /api/inventory/categories/:id/products` endpoint that returns only the fields the workspace card needs. No price list joins.

## Backend

### New DTO (`category.dto.ts`)

```ts
export class CategoryProductDto {
  id: string;
  name: string;
  stockQuantity: number;
}
```

### New service method (`CategoryService.getCategoryProducts`)

```ts
async getCategoryProducts(id: string): Promise<{ data: CategoryProductDto[] }> {
  // Verify category exists
  const exists = await this.categoryRepository.findOne({ where: { id } });
  if (!exists) throw new NotFoundException(`Category ${id} not found`);

  const products = await this.productRepository.find({
    where: { categoryId: id },
    select: ['id', 'name', 'stockQuantity'],
  });

  return { data: products };
}
```

- Uses `productRepository` already injected in `CategoryService`.
- `find()` with `select` — no joins, no price list data.
- TypeORM soft-delete filter applies automatically (no `deletedAt` rows returned).

### New controller route (`CategoryController`)

```ts
@Get(':id/products')
@ApiOperation({ summary: 'Get products in a category' })
async getCategoryProducts(@Param('id') id: string): Promise<{ data: CategoryProductDto[] }> {
  return this.categoryService.getCategoryProducts(id);
}
```

- Placed **before** `@Get(':id')` to satisfy NestJS route order rules.

## Frontend

### New RTK Query endpoint (`inventoryApiSlice`)

```ts
getCategoryProducts: builder.query<{ data: CategoryProduct[] }, string>({
  query: (categoryId) => `/inventory/categories/${categoryId}/products`,
  providesTags: (_, __, categoryId) => [{ type: 'Category', id: categoryId }],
}),
```

- Tagged with `Category` so cache invalidates when category data changes.
- Export `useGetCategoryProductsQuery` from the slice.

### Type (`types/index.ts` or inline)

```ts
export interface CategoryProduct {
  id: string;
  name: string;
  stockQuantity: number;
}
```

### Update `CategoryWorkspaceCard`

Replace:
```ts
const { data: productsResponse, isLoading, isError } = useGetProductsQuery(
  { categoryId },
  { skip: !categoryId },
)
const products = productsResponse?.data ?? []
```

With:
```ts
const { data: productsResponse, isLoading, isError } = useGetCategoryProductsQuery(
  categoryId,
  { skip: !categoryId },
)
const products = productsResponse?.data ?? []
```

No other changes to the component — the `data` access pattern is identical.

## Testing

### Backend unit tests (`category.service.spec.ts`)

1. Returns `{ data: [...] }` with correct fields for a valid category with products.
2. Returns `{ data: [] }` for a valid category with no products.
3. Throws `NotFoundException` for an unknown category ID.

### Frontend

- Update or add a `CategoryWorkspaceCard` test to mock `useGetCategoryProductsQuery` instead of `useGetProductsQuery`.

## What is NOT changed

- `ProductService.applyQueryBuilder` — left untouched.
- `Product` entity `eager: true` on `category` — left untouched (separate concern).
- Existing `GET /inventory/products?categoryId=` endpoint — unchanged, still used by the Products page.
