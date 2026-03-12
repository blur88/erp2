# Design: Fix User Name Display in Audit Logs

**Date:** 2026-03-04
**Status:** Approved
**Branch:** feat/audit-log-ui-redesign-2026-03-04

## Problem

All audit log entries show `userId: 'system'` and `username: null` because controllers never extract the authenticated user from the JWT and pass it through to services. The frontend falls back to displaying `'system'` when `username` is null.

## Approach

Option A — Fix controllers one by one (chosen). Add `@CurrentUser` params to every mutating controller method and thread `userId` + `username` through to `auditLogService.log()`. No infrastructure changes needed.

## What Doesn't Change

- `AuditLogService` — already accepts `username` in its options object
- Audit log entity — `username` column already exists
- Frontend — already displays `username` when present (`log.username || log.userId`)
- Historical logs — remain as `'system'`; only new logs get real usernames

## Changes Per Layer

### Controllers
Add two `@CurrentUser` params to every mutating method:
```typescript
@CurrentUser('userId') currentUserId: string,
@CurrentUser('username') currentUsername: string,
```
Pass both to the service call.

### Services
Add `username?: string` alongside `userId?: string`, then include it in every `auditLogService.log()` call:
```typescript
{ userId: userId || 'system', username, ... }
```

## Full Scope

### Inventory Module
| Controller | Service | Methods |
|---|---|---|
| `product.controller.ts` | `product.service.ts` | create, update, remove, restore, permanentDelete, bulkRestore, bulkPermanentDelete |
| `category.controller.ts` | `category.service.ts` | create, update, remove, restore, permanentDelete, bulkRestore, bulkPermanentDelete, move |
| `stock-adjustment.controller.ts` | `stock-adjustment.service.ts` | create, update, remove, restore, permanentDelete, bulkPermanentDelete |

### Sales Module
| Controller | Service | Methods |
|---|---|---|
| `sales-order.controller.ts` | `sales-order.service.ts` | create, update, remove, restore, permanentDelete, bulkRestore, bulkPermanentDelete, fulfill |
| `customer.controller.ts` | `customer.service.ts` | create, update, remove, restore, permanentDelete, bulkRestore, bulkPermanentDelete |
| `invoice.controller.ts` | `invoice.service.ts` | create, update, remove, restore, bulkRestore |
| `payment.controller.ts` | `payment.service.ts` | create, update (complete/fail/cancel), refund |

### Purchasing Module
| Controller | Service | Methods |
|---|---|---|
| `purchase-order.controller.ts` | `purchase-order.service.ts` | create, update, remove, restore, permanentDelete, bulkRestore, bulkPermanentDelete |
| `supplier.controller.ts` | `supplier.service.ts` | create, update, remove, restore, permanentDelete, bulkRestore, bulkPermanentDelete |
| `goods-received-note.controller.ts` | `goods-received-note.service.ts` | create, update, remove, restore, permanentDelete, bulkRestore, bulkPermanentDelete |
| `vendor-payment.controller.ts` | `vendor-payment.service.ts` | create, update, remove, restore, permanentDelete, bulkRestore |

### Accounting Module
| Controller | Service | Methods |
|---|---|---|
| `journal-entry.controller.ts` | `journal-entry.service.ts` | create, update, remove, postEntry, reverseEntry, bulkPost, bulkDelete |
| `account-mapping.controller.ts` | `account-mapping.service.ts` | create, update, remove |
| `fiscal-period.controller.ts` | `fiscal-period.service.ts` | create, update, remove, restore, closePeriod, reopenPeriod |
| `chart-of-accounts.controller.ts` | `chart-of-accounts.service.ts` | create, update, remove, restore, permanentDelete, bulkRestore, bulkPermanentDelete |
| `reconciliation.controller.ts` | `reconciliation.service.ts` | create, update, remove, complete, reopen |
| `settlement.controller.ts` | `settlement.service.ts` | create, cancel |
| `expense.controller.ts` | `expense.service.ts` | create, update, remove, post, bulkPost, bulkDelete |
| `owner-equity.controller.ts` | `owner-equity.service.ts` | create, update, remove, post, bulkPost, bulkDelete |

### Additional Fixes (hardcoded 'system' in accounting services)
- `accounting.service.ts` → `postOpeningBalances()`: add `userId` + `username` param
- `expense.service.ts` → `remove()`: use param instead of hardcoded `'system'`
- `owner-equity.service.ts` → `remove()`: use param instead of hardcoded `'system'`
- `settlement.service.ts` → `cancel()`: use param instead of hardcoded `'system'`

## Reference Pattern (Users Module — already correct)

```typescript
// Controller
async create(
  @Body(ValidationPipe) createUserDto: CreateUserDto,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<UserResponseDto> {
  return await this.usersService.create(createUserDto, currentUserId, currentUsername);
}

// Service
async create(dto: CreateUserDto, userId?: string, username?: string) {
  await this.auditLogService.log('CREATE', 'User', '...', {
    entityId: saved.id,
    userId: userId || 'system',
    username,
    newValues: { ... },
  });
}
```

## Not In Scope
- Settings, print-settings, price-lists, backup, dashboard — no audit logging
- Accounting module services (already implemented) — just need controller + username wiring
- Frontend changes — already handles `username` display correctly
