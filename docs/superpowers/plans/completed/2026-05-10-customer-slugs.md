# Customer Slugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UUIDs in customer URLs with human-readable slugs (e.g., `/sales/customers/customber-b1/edit`).

**Architecture:** Add a `slug` column to the `Customer` entity. Automatically generate/update slugs from names using a backend service. Update frontend routing to use slugs for identification.

**Tech Stack:** NestJS, TypeORM, React, React Router, RTK Query.

---

### Task 1: Backend Entity and Migration

**Files:**
- Modify: `backend/src/database/entities/customer.entity.ts`
- Create: `backend/src/database/migrations/1715340000000-AddCustomerSlug.ts` (Example timestamp)

- [ ] **Step 1: Add slug column to Customer entity**

```typescript
// backend/src/database/entities/customer.entity.ts

@Column({
  type: 'varchar',
  length: 255,
  nullable: true, // Nullable initially for migration, then made unique
  comment: 'URL-friendly identifier derived from name',
})
@Index({ unique: true })
slug: string;
```

- [ ] **Step 2: Create migration to add slug column and populate existing data**
Generate a migration that adds the column and provides a script to populate slugs for existing customers based on their names.

- [ ] **Step 3: Commit**
```bash
git add backend/src/database/entities/customer.entity.ts
git commit -m "feat(backend): add slug column to customer entity"
```

### Task 2: Backend DTOs and Logic

**Files:**
- Modify: `backend/src/modules/sales/dto/customer.dto.ts`
- Modify: `backend/src/modules/sales/services/customer.service.ts`

- [ ] **Step 1: Update CustomerResponseDto to include slug**
```typescript
// backend/src/modules/sales/dto/customer.dto.ts

export class CustomerResponseDto {
  // ... existing fields
  @ApiProperty({ example: 'customber-b1' })
  slug: string;
}
```

- [ ] **Step 2: Implement slug generation logic in CustomerService**
Add a utility method to generate unique slugs.

```typescript
// backend/src/modules/sales/services/customer.service.ts

private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await this.customerRepository.findOne({
      where: { slug },
      withDeleted: true,
    });

    if (!existing || (excludeId && existing.id === excludeId)) {
      return slug;
    }

    slug = `${baseSlug}-${counter++}`;
  }
}
```

- [ ] **Step 3: Update create and update methods to sync slug with name**
Modify `create` and `update` methods in `CustomerService` to call `generateUniqueSlug` when the name changes.

- [ ] **Step 4: Commit**
```bash
git add backend/src/modules/sales/dto/customer.dto.ts backend/src/modules/sales/services/customer.service.ts
git commit -m "feat(backend): implement automatic slug generation in customer service"
```

### Task 3: Backend Controller - Fetch by Slug

**Files:**
- Modify: `backend/src/modules/sales/controllers/customer.controller.ts`
- Modify: `backend/src/modules/sales/services/customer.service.ts`

- [ ] **Step 1: Add findBySlug to CustomerService**
```typescript
// backend/src/modules/sales/services/customer.service.ts

async findBySlug(slug: string): Promise<Customer> {
  const customer = await this.customerRepository.findOne({
    where: { slug },
    relations: ['priceList'],
  });
  if (!customer) throw new NotFoundException(`Customer with slug ${slug} not found`);
  return customer;
}
```

- [ ] **Step 2: Add GET endpoint to CustomerController**
```typescript
// backend/src/modules/sales/controllers/customer.controller.ts

@Get('slug/:slug')
@ApiOperation({ summary: 'Get customer by slug' })
async getCustomerBySlug(@Param('slug') slug: string): Promise<CustomerResponseDto> {
  return this.customerService.findBySlug(slug);
}
```

- [ ] **Step 3: Commit**
```bash
git add backend/src/modules/sales/controllers/customer.controller.ts backend/src/modules/sales/services/customer.service.ts
git commit -m "feat(backend): add endpoint to fetch customer by slug"
```

### Task 4: Frontend Types and API

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/store/api/salesApi.ts`

- [ ] **Step 1: Update Customer interface**
```typescript
// frontend/src/types/index.ts

export interface Customer {
  // ... existing
  slug: string;
}
```

- [ ] **Step 2: Add getCustomerBySlug to salesApi**
```typescript
// frontend/src/store/api/salesApi.ts

getCustomerBySlug: builder.query<ApiResponse<Customer>, string>({
  query: (slug) => `customers/slug/${slug}`,
  providesTags: (result, error, slug) => [{ type: 'Customers', id: `SLUG_${slug}` }],
}),
```

- [ ] **Step 3: Commit**
```bash
git add frontend/src/types/index.ts frontend/src/store/api/salesApi.ts
git commit -m "feat(frontend): update customer type and api to support slugs"
```

### Task 5: Frontend Routing and Navigation

**Files:**
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`
- Modify: `frontend/src/pages/sales/components/CustomerContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`

- [ ] **Step 1: Update routes in router.tsx**
Change `:id` to `:slug`.
```typescript
// frontend/src/router.tsx

{ path: '/sales/customers/:slug/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } },
```

- [ ] **Step 2: Update workspace routes in CustomersPage.tsx**
```typescript
// frontend/src/pages/sales/CustomersPage.tsx

routes: {
  create: '/sales/customers/create',
  edit: (id, entity) => `/sales/customers/${(entity as any).slug}/edit`,
},
```

- [ ] **Step 3: Update navigation in ContextHeader and WorkspaceCard**
Ensure `navigate` calls use `customer.slug` instead of `customer.id`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/router.tsx frontend/src/pages/sales/CustomersPage.tsx
git commit -m "refactor(frontend): update routes to use customer slug"
```

### Task 6: Frontend Form Page Refactor

**Files:**
- Modify: `frontend/src/pages/sales/CustomerFormPage.tsx`

- [ ] **Step 1: Update CustomerFormPage to use slug**
Switch from `id` to `slug` in `useParams`. Update the fetch logic to use the new `getCustomerBySlug` query or direct API call.

- [ ] **Step 2: Handle URL redirect after name change**
If editing and the name changes, ensure the user is redirected to the new slug URL or back to the list.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/sales/CustomerFormPage.tsx
git commit -m "feat(frontend): refactor customer form page to handle slugs and redirects"
```
