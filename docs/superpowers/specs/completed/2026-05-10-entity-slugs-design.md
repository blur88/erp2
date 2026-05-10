# Entity Slugs & Highlight-on-Return Design

**Issue:** #554
**Date:** 2026-05-10

---

## Goal

Replace UUIDs in edit URLs with human-readable identifiers across all modules, and standardise the post-save highlight-on-return pattern across all list pages.

---

## Scope

### Entities getting a `slug` column (generated from name, regenerated on rename)

| Entity | Slug source | New edit route |
|---|---|---|
| Customer | `name` | `/sales/customers/:slug/edit` |
| Supplier | `companyName` | `/purchasing/suppliers/:slug/edit` |
| Product | `name` | `/inventory/products/:slug/edit` |

### Entities using existing unique reference as URL identifier (no new column)

| Entity | URL identifier | New edit route |
|---|---|---|
| Sales Order | `orderNumber` | `/sales/orders/:orderNumber/edit` |
| Purchase Order | `orderNumber` | `/purchasing/orders/:orderNumber/edit` |
| Stock Adjustment | `adjustmentNumber` | `/inventory/stock-adjustments/:adjustmentNumber/edit` |

### Highlight-on-return

All 6 entities above get the standard highlight-on-return pattern after save: navigate to list with `?highlight=<id>`, list briefly highlights the saved row.

---

## Architecture

### Backend — Shared Slug Utility

A pure utility function in `backend/src/common/utils/slug.util.ts`:

```typescript
export function generateBaseSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}
```

Each slugged entity service calls this and handles uniqueness itself (loop with counter suffix: `acme`, `acme-1`, `acme-2`). The uniqueness check uses `withDeleted: true` so soft-deleted slugs are reserved.

### Backend — Per-entity slug generation

Each service (CustomerService, SupplierService, ProductService) gets:

```typescript
private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
  const base = generateBaseSlug(name);
  let slug = base;
  let counter = 1;
  while (true) {
    const existing = await this.repo.findOne({ where: { slug }, withDeleted: true });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${counter++}`;
  }
}
```

Called in `create()` (no `excludeId`) and `update()` (pass current entity `id` so name-unchanged updates don't conflict with themselves).

### Backend — Entity changes

**Customer, Supplier, Product** each get:
- A `slug` column: `varchar(255)`, nullable initially, unique index
- A migration to add the column and backfill existing rows
- `findBySlug(slug)` method on the service
- `GET /<entity>/slug/:slug` endpoint on the controller (placed before `/:id` to avoid NestJS route conflict)
- `slug` included in response DTOs

**Sales Order, Purchase Order, Stock Adjustment** — no entity changes. The `orderNumber`/`adjustmentNumber` fields already exist and are unique.

Each order/adjustment service gets a `findByOrderNumber(orderNumber)` / `findByAdjustmentNumber(ref)` method and a corresponding `GET /orders/by-number/:orderNumber` / `GET /stock-adjustments/by-number/:adjustmentNumber` endpoint.

### Frontend — Shared slug resolution pattern

Each form page that previously used `useParams<{ id }>` switches to `useParams<{ slug }>` (or `{ orderNumber }` / `{ adjustmentNumber }`), then calls the appropriate "find by slug/ref" API endpoint to resolve the entity before rendering the form.

### Frontend — Route changes

| Old | New |
|---|---|
| `/sales/customers/:id/edit` | `/sales/customers/:slug/edit` |
| `/purchasing/suppliers/:id/edit` | `/purchasing/suppliers/:slug/edit` |
| `/inventory/products/:id/edit` | `/inventory/products/:slug/edit` |
| `/sales/orders/:id/edit` | `/sales/orders/:orderNumber/edit` |
| `/purchasing/orders/:id/edit` | `/purchasing/orders/:orderNumber/edit` |
| `/inventory/stock-adjustments/:id/edit` | `/inventory/stock-adjustments/:adjustmentNumber/edit` |

### Frontend — Navigation to edit pages

All workspace cards and context headers that call `navigate('/entity/:id/edit')` switch to using the slug/reference field instead of the UUID.

### Frontend — Post-save highlight-on-return

All form pages navigate to the list with `?highlight=<uuid>` after a successful save (create or edit). The list pages wire up `highlightParam: 'highlight'` in their `useEntityWorkspace` config (already supported by the existing `useEntityWorkspace` hook — just not configured on all pages yet).

Affected list pages that need `highlightParam` wired up:
- `CustomersPage` (missing)
- `SuppliersPage` (missing)
- `ProductsPage` (missing — uses `selectedProductId` state, normalise to query param)
- `StockAdjustmentsPage` (missing)

Sales Orders, Purchase Orders already have `highlightParam: 'highlight'` configured — just need form pages to pass `?highlight=<id>` on save.

### Frontend — Slug regeneration redirect

When a customer/supplier/product is edited and the name changes, the backend returns the new slug in the response. The form page navigates to `/<entity-list>?highlight=<id>` (not to the new slug URL) — no redirect complexity needed since we go back to the list, not back to the edit page.

---

## Data Flow

```
Edit form save
  → PUT /customers/:id { name: "Acme Corp" }
  → Service: generateUniqueSlug("Acme Corp", id) → "acme-corp"
  → Saves entity with new slug
  → Returns { id, slug: "acme-corp", ... }
  → Frontend: navigate('/sales/customers?highlight=<id>')
  → CustomersPage: useEntityWorkspace sees ?highlight=<id>, selects + briefly highlights that row
```

```
Navigate to edit page
  → User clicks edit on "Acme Corp" in list
  → navigate('/sales/customers/acme-corp/edit')
  → CustomerFormPage: useParams() → slug = "acme-corp"
  → GET /customers/slug/acme-corp → { id, name, slug, ... }
  → Form renders with entity data
```

---

## Error Handling

- `GET /customers/slug/:slug` returns 404 if slug not found — frontend shows not-found state (same as current UUID 404 handling)
- If slug generation produces an empty string (e.g., name is all special chars), fallback to UUID substring
- Backfill migration runs `generateBaseSlug` in SQL using `lower()` + `regexp_replace()` and appends row number suffix for duplicates

---

## Migration Strategy

Each entity gets one migration:
1. Add `slug` column as nullable
2. Backfill all existing rows with generated slugs (handle duplicates with counter suffix)
3. Add unique index

The nullable + backfill approach means zero downtime — no NOT NULL constraint until all rows are populated (can be tightened in a follow-up migration if desired, but not required for this issue).

---

## Testing

**Backend:**
- Unit test `generateBaseSlug` in `slug.util.spec.ts` — covers special chars, spaces, unicode, empty string
- Unit test `generateUniqueSlug` per service — covers collision handling, self-exclusion on update
- Integration test `GET /customers/slug/:slug` — 200 found, 404 not found

**Frontend:**
- Update existing `CustomerFormPage.test.tsx` and `SupplierFormPage.test.tsx` to use slug params instead of UUID params
- Unit test `useEntityWorkspace` highlight behaviour is already tested — no new tests needed there

---

## Out of Scope

- Slug history / redirect from old slugs to new (not needed for internal-only URLs)
- Accounting entities (journal entries, bank reconciliations, etc.) — these use modal/drawer patterns, not form pages
- Settings entities (price lists, etc.) — not part of the standard CRUD module pattern
