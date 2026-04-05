# Design: Fix isActive Filter Defaulting to False (Issue #297)

## Problem

The `isActive` query filter in `SupplierQueryDto` and `QueryCustomersDto` incorrectly defaults to `false` when the parameter is not provided. This causes the API to return only inactive records by default, making Suppliers and Customers lists appear empty.

**Root cause:** The `@Transform` decorator evaluates `undefined === 'true' || undefined === true` → `false`. class-transformer runs the transform even when the value is absent, so the backend receives `isActive: false` instead of `undefined`.

## Scope

Strictly scoped to the two affected DTOs. Other boolean filters in the codebase are out of scope for this fix.

## Files Changed

| File | Location |
|------|----------|
| `backend/src/modules/purchasing/dto/supplier.dto.ts` | `SupplierQueryDto.isActive` ~line 99 |
| `backend/src/modules/sales/dto/customer.dto.ts` | `QueryCustomersDto.isActive` ~line 231 |

## Fix

Replace the one-liner transform with a guarded version in both DTOs:

```typescript
// Before
@Transform(({ value }) => value === 'true' || value === true)

// After
@Transform(({ value }) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === 'true' || value === true;
})
```

No changes to service layer — both services already guard with `if (isActive !== undefined)` before applying the filter.

## Behavior After Fix

| Query param | Transform result | Service behavior |
|-------------|-----------------|-----------------|
| _(absent)_ | `undefined` | No filter — all records returned |
| `isActive=true` | `true` | Filters active records only |
| `isActive=false` | `false` | Filters inactive records only |

## Testing

Add unit tests for both DTOs verifying:
- Instantiating without `isActive` yields `undefined` (not `false`)
- `isActive=true` string yields `true`
- `isActive=false` string yields `false`

## Verification (manual)

- `GET /api/purchasing/suppliers` (no params) — should return active suppliers
- `GET /api/sales/customers` (no params) — should return active customers
