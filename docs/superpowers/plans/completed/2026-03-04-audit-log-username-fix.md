# Audit Log Username Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all audit log entries that show `'system'` as the user by threading the authenticated user's `userId` and `username` from JWT through every mutating controller method and service in the codebase.

**Architecture:** Add `@CurrentUser('userId')` and `@CurrentUser('username')` params to each controller's mutating methods, add `username?: string` to service method signatures alongside existing `userId`, and pass `username` into every `auditLogService.log()` options object. The `AuditLogService` and frontend already support this — no changes needed there.

**Tech Stack:** NestJS 11, TypeScript, `@CurrentUser` decorator at `src/modules/auth/decorators/current-user.decorator.ts`

---

## Reference Pattern

The Users module already does this correctly. Use it as the template for every task below.

**Controller:**
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

async create(
  @Body() dto: CreateUserDto,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<UserResponseDto> {
  return this.usersService.create(dto, currentUserId, currentUsername);
}
```

**Service method signature:**
```typescript
async create(dto: CreateUserDto, userId?: string, username?: string): Promise<UserResponseDto> {
  await this.auditLogService.log('CREATE', 'User', '...', {
    entityId: saved.id,
    userId: userId || 'system',
    username,
    newValues: { ... },
  });
}
```

**Import path for CurrentUser** (relative to each controller's location):
- Inventory/Sales/Purchasing controllers: `'../../auth/decorators/current-user.decorator'`
- Accounting controllers: `'../../auth/decorators/current-user.decorator'`

---

## How to verify after each task

```bash
cd /home/blur/erp2/frontend && npm run type-check
cd /home/blur/erp2/backend && npm run lint
```

There are no unit tests for these controller/service methods, so lint + type-check is the verification step.

---

## Task 1: Inventory — Product

**Files:**
- Modify: `backend/src/modules/inventory/controllers/product.controller.ts`
- Modify: `backend/src/modules/inventory/services/product.service.ts`

### Step 1: Update product.controller.ts

Add `CurrentUser` to imports (after existing imports at top of file):
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Update these methods — add `@CurrentUser('userId') currentUserId: string, @CurrentUser('username') currentUsername: string` as params and pass to service:

**create** (currently line ~70):
```typescript
async create(
  @Body() createProductDto: CreateProductDto,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<ProductResponseDto> {
  return this.productService.create(createProductDto, currentUserId, currentUsername);
}
```

**update** (currently line ~261):
```typescript
async update(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() updateProductDto: UpdateProductDto,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<ProductResponseDto> {
  return this.productService.update(id, updateProductDto, currentUserId, currentUsername);
}
```

**restore** (currently line ~402):
```typescript
async restore(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<ProductResponseDto> {
  return this.productService.restore(id, currentUserId, currentUsername);
}
```

**permanentDelete** (currently line ~499):
```typescript
async permanentDelete(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<void> {
  await this.productService.permanentDelete(id, currentUserId, currentUsername);
}
```

**bulkRestore** (currently line ~380):
```typescript
async bulkRestore(
  @Body() body: { productIds: string[] },
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<{ message: string; restoredCount: number; failedIds: string[] }> {
  return this.productService.bulkRestore(body.productIds, currentUserId, currentUsername);
}
```

**bulkPermanentDelete** (currently line ~475):
```typescript
async bulkPermanentDelete(
  @Body() body: { productIds: string[] },
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<{ message: string; deletedCount: number; failedIds: string[] }> {
  return this.productService.bulkPermanentDelete(body.productIds, currentUserId, currentUsername);
}
```

**remove** (currently line ~518) — service's `remove()` doesn't accept userId, skip for now.

### Step 2: Update product.service.ts

For each method that calls `auditLogService.log()`, add `username?: string` to the signature and add `username` to the log options.

**create** signature: `async create(createProductDto: CreateProductDto, userId?: string, username?: string)`
In the `auditLogService.log()` call, add `username` to options:
```typescript
{ entityId: savedProduct.id, userId: userId || 'system', username, newValues: { ... } }
```

**update** signature: `async update(id: string, updateProductDto: UpdateProductDto, userId?: string, username?: string)`
Add `username` to each `auditLogService.log()` call inside.

**restore** signature: `async restore(id: string, userId?: string, username?: string)`
Add `username` to `auditLogService.log()` call.

**permanentDelete** signature: `async permanentDelete(id: string, userId?: string, username?: string)`
Add `username` to `auditLogService.log()` call.

**bulkRestore** — find the method, add `username?: string` param, pass it to the internal `restore()` call.

**bulkPermanentDelete** — same pattern, pass to internal `permanentDelete()` call.

### Step 3: Verify
```bash
cd /home/blur/erp2/backend && npm run lint
```
Expected: no new errors.

### Step 4: Commit
```bash
git add backend/src/modules/inventory/controllers/product.controller.ts \
        backend/src/modules/inventory/services/product.service.ts
git commit -m "feat(audit-logs): thread userId+username through product controller/service"
```

---

## Task 2: Inventory — Category

**Files:**
- Modify: `backend/src/modules/inventory/controllers/category.controller.ts`
- Modify: `backend/src/modules/inventory/services/category.service.ts`

### Step 1: Update category.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Update mutating methods. Note: `remove` already passes `'system'` as userId — replace that with real user.

**create** (currently line ~55):
```typescript
async create(
  @Body() createCategoryDto: CreateCategoryDto,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<CategoryResponseDto> {
  return this.categoryService.create(createCategoryDto, currentUserId, currentUsername);
}
```

**update** (currently line ~231):
```typescript
async update(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() updateCategoryDto: UpdateCategoryDto,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<CategoryResponseDto> {
  return this.categoryService.update(id, updateCategoryDto, currentUserId, currentUsername);
}
```

**remove** (currently line ~403) — replace hardcoded `'system'`:
```typescript
async remove(
  @Param('id', ParseUUIDPipe) id: string,
  @Query('force') force?: boolean,
  @Query('moveToUncategorized') moveToUncategorized?: boolean,
  @CurrentUser('userId') currentUserId: string = 'system',
  @CurrentUser('username') currentUsername?: string,
): Promise<{ message: string; moved?: number }> {
  return this.categoryService.remove(id, currentUserId, { force: force === true, moveToUncategorized: moveToUncategorized === true }, currentUsername);
}
```

**restore** (currently line ~315):
```typescript
async restore(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<CategoryResponseDto> {
  return this.categoryService.restore(id, currentUserId, currentUsername);
}
```

**permanentDelete** (currently line ~366):
```typescript
async permanentDelete(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<void> {
  return this.categoryService.permanentDelete(id, currentUserId, currentUsername);
}
```

**bulkRestore** (currently line ~294):
```typescript
async bulkRestore(
  @Body() body: { categoryIds: string[] },
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<{ message: string; restoredCount: number; failedIds: string[] }> {
  return this.categoryService.bulkRestore(body.categoryIds, currentUserId, currentUsername);
}
```

**bulkPermanentDelete** (currently line ~342):
```typescript
async bulkPermanentDelete(
  @Body() body: { categoryIds: string[] },
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<{ message: string; deletedCount: number; failedIds: string[] }> {
  return this.categoryService.bulkPermanentDelete(body.categoryIds, currentUserId, currentUsername);
}
```

### Step 2: Update category.service.ts

Current `remove` signature: `async remove(id: string, userId: string, options?)` — add `username?: string` after options.

For each method with `auditLogService.log()`, add `username?: string` to signature and `username` to log options.

**create**: `async create(dto: CreateCategoryDto, userId?: string, username?: string)`
**update**: `async update(id: string, dto: UpdateCategoryDto, userId?: string, username?: string)`
**remove**: `async remove(id: string, userId: string, options?, username?: string)` — add `username` to log call
**restore**: `async restore(id: string, userId?: string, username?: string)`
**permanentDelete**: `async permanentDelete(id: string, userId?: string, username?: string)`
**bulkRestore/bulkPermanentDelete**: add `username` param, pass to internal calls

### Step 3: Verify
```bash
cd /home/blur/erp2/backend && npm run lint
```

### Step 4: Commit
```bash
git add backend/src/modules/inventory/controllers/category.controller.ts \
        backend/src/modules/inventory/services/category.service.ts
git commit -m "feat(audit-logs): thread userId+username through category controller/service"
```

---

## Task 3: Inventory — Stock Adjustment

**Files:**
- Modify: `backend/src/modules/inventory/controllers/stock-adjustment.controller.ts`
- Modify: `backend/src/modules/inventory/services/stock-adjustment.service.ts`

### Step 1: Update stock-adjustment.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser('userId') currentUserId: string, @CurrentUser('username') currentUsername: string` to: create, update, restore, permanentDelete, bulkPermanentDelete.

Pass `currentUserId, currentUsername` to each service call.

### Step 2: Update stock-adjustment.service.ts

For each method that calls `auditLogService.log()`, add `userId?: string, username?: string` to signature and `username` to log options object.

### Step 3: Verify
```bash
cd /home/blur/erp2/backend && npm run lint
```

### Step 4: Commit
```bash
git add backend/src/modules/inventory/controllers/stock-adjustment.controller.ts \
        backend/src/modules/inventory/services/stock-adjustment.service.ts
git commit -m "feat(audit-logs): thread userId+username through stock-adjustment controller/service"
```

---

## Task 4: Sales — Sales Order

**Files:**
- Modify: `backend/src/modules/sales/controllers/sales-order.controller.ts`
- Modify: `backend/src/modules/sales/services/sales-order.service.ts`

### Step 1: Update sales-order.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove (deleteSalesOrder), restore, bulkRestore, bulkPermanentDelete, permanentDelete.

Note: `create` currently passes `null` — replace with `currentUserId, currentUsername`.

### Step 2: Update sales-order.service.ts

Add `username?: string` alongside `userId` in every method signature that calls `auditLogService.log()`. Pass `username` in log options.

Methods to update: create, update, delete, restore, bulkRestore, permanentDelete, bulkPermanentDelete, fulfill (if it logs).

### Step 3: Verify
```bash
cd /home/blur/erp2/backend && npm run lint
```

### Step 4: Commit
```bash
git add backend/src/modules/sales/controllers/sales-order.controller.ts \
        backend/src/modules/sales/services/sales-order.service.ts
git commit -m "feat(audit-logs): thread userId+username through sales-order controller/service"
```

---

## Task 5: Sales — Customer

**Files:**
- Modify: `backend/src/modules/sales/controllers/customer.controller.ts`
- Modify: `backend/src/modules/sales/services/customer.service.ts`

### Step 1: Update customer.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create (createCustomer), update (updateCustomer), remove (deleteCustomer), restore (restoreCustomer), bulkRestore, bulkPermanentDelete, permanentDelete.

### Step 2: Update customer.service.ts

Add `userId?: string, username?: string` to: create, update, delete, restore, bulkRestore, permanentDelete, bulkPermanentDelete. Add `username` to each `auditLogService.log()` call.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/sales/controllers/customer.controller.ts \
        backend/src/modules/sales/services/customer.service.ts
git commit -m "feat(audit-logs): thread userId+username through customer controller/service"
```

---

## Task 6: Sales — Invoice

**Files:**
- Modify: `backend/src/modules/sales/controllers/invoice.controller.ts`
- Modify: `backend/src/modules/sales/services/invoice.service.ts`

### Step 1: Update invoice.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create (createInvoice), update (updateInvoice), remove (deleteInvoice), restore (restoreInvoice), bulkRestore (bulkRestoreInvoices).

### Step 2: Update invoice.service.ts

Add `userId?: string, username?: string` to: create, update, delete, restore, bulkRestore. Add `username` to each `auditLogService.log()` call.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/sales/controllers/invoice.controller.ts \
        backend/src/modules/sales/services/invoice.service.ts
git commit -m "feat(audit-logs): thread userId+username through invoice controller/service"
```

---

## Task 7: Sales — Payment

**Files:**
- Modify: `backend/src/modules/sales/controllers/payment.controller.ts`
- Modify: `backend/src/modules/sales/services/payment.service.ts`

### Step 1: Update payment.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create (recordPayment), update (updatePayment), completePayment, failPayment, cancelPayment, refundPayment, restore (restorePayment), bulkRestore (bulkRestorePayments).

### Step 2: Update payment.service.ts

Add `userId?: string, username?: string` to: create, update, complete, fail, cancel, refund, restore, bulkRestore. Add `username` to each `auditLogService.log()` call.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/sales/controllers/payment.controller.ts \
        backend/src/modules/sales/services/payment.service.ts
git commit -m "feat(audit-logs): thread userId+username through payment controller/service"
```

---

## Task 8: Purchasing — Purchase Order

**Files:**
- Modify: `backend/src/modules/purchasing/controllers/purchase-order.controller.ts`
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`

### Step 1: Update purchase-order.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, restore, bulkRestore, bulkPermanentDelete, permanentDelete, remove.

Note: create currently passes `'system'` — replace with `currentUserId, currentUsername`. restore and bulkRestore pass `'system'` — replace too.

### Step 2: Update purchase-order.service.ts

Current `create` signature: `async create(dto, userId?: string)` — add `username?: string`.
Current `restore` signature: `async restore(id, userId: string = 'system')` — add `username?: string`.
Current `bulkRestore` signature: `async bulkRestore(orderIds, userId: string = 'system')` — add `username?: string`.

Add `username` to each `auditLogService.log()` call.

Also add `username` to: update, remove, permanentDelete, bulkPermanentDelete where they call `auditLogService.log()`.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/purchasing/controllers/purchase-order.controller.ts \
        backend/src/modules/purchasing/services/purchase-order.service.ts
git commit -m "feat(audit-logs): thread userId+username through purchase-order controller/service"
```

---

## Task 9: Purchasing — Supplier

**Files:**
- Modify: `backend/src/modules/purchasing/controllers/supplier.controller.ts`
- Modify: `backend/src/modules/purchasing/services/supplier.service.ts`

### Step 1: Update supplier.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove, restore, bulkRestore, bulkPermanentDelete, permanentDelete.

### Step 2: Update supplier.service.ts

Add `userId?: string, username?: string` to: create, update, remove, restore, bulkRestore, permanentDelete, bulkPermanentDelete. Add `username` to `auditLogService.log()` calls.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/purchasing/controllers/supplier.controller.ts \
        backend/src/modules/purchasing/services/supplier.service.ts
git commit -m "feat(audit-logs): thread userId+username through supplier controller/service"
```

---

## Task 10: Purchasing — Goods Received Note

**Files:**
- Modify: `backend/src/modules/purchasing/controllers/goods-received-note.controller.ts`
- Modify: `backend/src/modules/purchasing/services/goods-received-note.service.ts`

### Step 1: Update goods-received-note.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove, restore, bulkRestore, bulkPermanentDelete, permanentDelete.

### Step 2: Update goods-received-note.service.ts

Add `userId?: string, username?: string` to all mutating methods that call `auditLogService.log()`. Add `username` to log options.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/purchasing/controllers/goods-received-note.controller.ts \
        backend/src/modules/purchasing/services/goods-received-note.service.ts
git commit -m "feat(audit-logs): thread userId+username through goods-received-note controller/service"
```

---

## Task 11: Purchasing — Vendor Payment

**Files:**
- Modify: `backend/src/modules/purchasing/controllers/vendor-payment.controller.ts`
- Modify: `backend/src/modules/purchasing/services/vendor-payment.service.ts`

### Step 1: Update vendor-payment.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove, restore, bulkRestore, permanentDelete.

### Step 2: Update vendor-payment.service.ts

Current `create` signature: `async create(dto, user: string = 'system')` — this uses `user` not `userId`. Change to: `async create(dto: CreateVendorPaymentDto, userId?: string, username?: string)` and update the `auditLogService.log()` call to use `userId || 'system'` and add `username`.

Add `username` to all other methods' `auditLogService.log()` calls.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/purchasing/controllers/vendor-payment.controller.ts \
        backend/src/modules/purchasing/services/vendor-payment.service.ts
git commit -m "feat(audit-logs): thread userId+username through vendor-payment controller/service"
```

---

## Task 12: Accounting — Journal Entry

**Files:**
- Modify: `backend/src/modules/accounting/controllers/journal-entry.controller.ts`
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`

### Step 1: Update journal-entry.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove, postEntry, reverseEntry, bulkPost, bulkDelete.

### Step 2: Update journal-entry.service.ts

Current `create` signature: `async create(dto: CreateJournalEntryDto, userId: string = 'system')` — add `username?: string`.

Add `username` param to: create, update, remove, postEntry, reverseEntry, bulkPost, bulkDelete. Add `username` to all `auditLogService.log()` calls.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/accounting/controllers/journal-entry.controller.ts \
        backend/src/modules/accounting/services/journal-entry.service.ts
git commit -m "feat(audit-logs): thread userId+username through journal-entry controller/service"
```

---

## Task 13: Accounting — Account Mapping

**Files:**
- Modify: `backend/src/modules/accounting/controllers/account-mapping.controller.ts`
- Modify: `backend/src/modules/accounting/services/account-mapping.service.ts`

### Step 1: Update account-mapping.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove.

### Step 2: Update account-mapping.service.ts

Add `userId?: string, username?: string` to: create, update, remove. Add `username` to `auditLogService.log()` calls.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/accounting/controllers/account-mapping.controller.ts \
        backend/src/modules/accounting/services/account-mapping.service.ts
git commit -m "feat(audit-logs): thread userId+username through account-mapping controller/service"
```

---

## Task 14: Accounting — Fiscal Period

**Files:**
- Modify: `backend/src/modules/accounting/controllers/fiscal-period.controller.ts`
- Modify: `backend/src/modules/accounting/services/fiscal-period.service.ts`

### Step 1: Update fiscal-period.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove, restore, closePeriod, reopenPeriod.

### Step 2: Update fiscal-period.service.ts

Add `username?: string` to: create, update, remove, restore, closePeriod, reopenPeriod. Add `username` to `auditLogService.log()` calls.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/accounting/controllers/fiscal-period.controller.ts \
        backend/src/modules/accounting/services/fiscal-period.service.ts
git commit -m "feat(audit-logs): thread userId+username through fiscal-period controller/service"
```

---

## Task 15: Accounting — Chart of Accounts

**Files:**
- Modify: `backend/src/modules/accounting/controllers/chart-of-accounts.controller.ts`
- Modify: `backend/src/modules/accounting/services/chart-of-accounts.service.ts`

### Step 1: Update chart-of-accounts.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove, permanentDelete, restore, bulkRestore, bulkPermanentDelete.

### Step 2: Update chart-of-accounts.service.ts

Add `userId?: string, username?: string` to all mutating methods. Add `username` to `auditLogService.log()` calls.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/accounting/controllers/chart-of-accounts.controller.ts \
        backend/src/modules/accounting/services/chart-of-accounts.service.ts
git commit -m "feat(audit-logs): thread userId+username through chart-of-accounts controller/service"
```

---

## Task 16: Accounting — Reconciliation

**Files:**
- Modify: `backend/src/modules/accounting/controllers/reconciliation.controller.ts`
- Modify: `backend/src/modules/accounting/services/reconciliation.service.ts`

### Step 1: Update reconciliation.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove, complete, reopen.

### Step 2: Update reconciliation.service.ts

Add `username?: string` to: create, update, remove, complete, reopen. Add `username` to `auditLogService.log()` calls.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/accounting/controllers/reconciliation.controller.ts \
        backend/src/modules/accounting/services/reconciliation.service.ts
git commit -m "feat(audit-logs): thread userId+username through reconciliation controller/service"
```

---

## Task 17: Accounting — Settlement

**Files:**
- Modify: `backend/src/modules/accounting/controllers/settlement.controller.ts`
- Modify: `backend/src/modules/accounting/services/settlement.service.ts`

### Step 1: Update settlement.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create.

Also find the `cancel` endpoint (if it exists as a controller method) and add `@CurrentUser` there too.

### Step 2: Update settlement.service.ts

**create**: add `username?: string`, add to `auditLogService.log()` call.

**cancel**: currently hardcodes `'system'` — add `userId?: string, username?: string` params and replace hardcoded value.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/accounting/controllers/settlement.controller.ts \
        backend/src/modules/accounting/services/settlement.service.ts
git commit -m "feat(audit-logs): thread userId+username through settlement controller/service"
```

---

## Task 18: Accounting — Expense

**Files:**
- Modify: `backend/src/modules/accounting/controllers/expense.controller.ts`
- Modify: `backend/src/modules/accounting/services/expense.service.ts`

### Step 1: Update expense.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove, post, bulkPost, bulkDelete.

### Step 2: Update expense.service.ts

**remove**: currently hardcodes `'system'` — add `userId?: string, username?: string` and replace hardcoded value.

For all methods: add `username?: string`, add `username` to `auditLogService.log()` calls.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/accounting/controllers/expense.controller.ts \
        backend/src/modules/accounting/services/expense.service.ts
git commit -m "feat(audit-logs): thread userId+username through expense controller/service"
```

---

## Task 19: Accounting — Owner Equity

**Files:**
- Modify: `backend/src/modules/accounting/controllers/owner-equity.controller.ts`
- Modify: `backend/src/modules/accounting/services/owner-equity.service.ts`

### Step 1: Update owner-equity.controller.ts

Add import:
```typescript
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
```

Add `@CurrentUser` params to: create, update, remove, post, bulkPost, bulkDelete.

### Step 2: Update owner-equity.service.ts

**remove**: currently hardcodes `'system'` — add `userId?: string, username?: string` and replace.

For all methods: add `username?: string`, add `username` to `auditLogService.log()` calls.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/accounting/controllers/owner-equity.controller.ts \
        backend/src/modules/accounting/services/owner-equity.service.ts
git commit -m "feat(audit-logs): thread userId+username through owner-equity controller/service"
```

---

## Task 20: Fix accounting.service.ts — postOpeningBalances

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting.service.ts`
- Modify: `backend/src/modules/accounting/controllers/journal-entry.controller.ts` (postOpeningBalances endpoint)

### Step 1: Update accounting.service.ts

Find `postOpeningBalances` — it already has `userId?: string` but no `username`. Add `username?: string` and add to the `auditLogService.log()` call.

All other auto-posting methods (postSalesOrderEntry, postCustomerPaymentEntry, postSettlementEntry, postGoodsReceivedEntry, postVendorPaymentEntry, postStockAdjustmentEntry, postOwnerEquityEntry, postExpenseEntry) — these are called internally from other services, not from controllers directly. Add `username?: string` to their signatures and pass through to `auditLogService.log()`.

### Step 2: Update journal-entry.controller.ts — postOpeningBalances endpoint

Find the `postOpeningBalances` controller method and add `@CurrentUser` params, pass to service.

### Step 3: Verify + Commit
```bash
cd /home/blur/erp2/backend && npm run lint
git add backend/src/modules/accounting/services/accounting.service.ts \
        backend/src/modules/accounting/controllers/journal-entry.controller.ts
git commit -m "feat(audit-logs): thread userId+username through accounting.service postOpeningBalances"
```

---

## Task 21: Final verification

### Step 1: Full lint check
```bash
cd /home/blur/erp2/backend && npm run lint
```
Expected: no errors.

### Step 2: TypeScript check
```bash
cd /home/blur/erp2/frontend && npm run type-check
```
Expected: no errors (frontend unchanged, but verify nothing broke).

### Step 3: Backend build check
```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```
Expected: no type errors.

### Step 4: Final commit if anything left unstaged
```bash
git status
```
