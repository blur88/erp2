# Dynamic Payment Account Mappings Design

**Date**: 2026-02-15
**Status**: Approved

## Problem

Account Mappings Configuration has hardcoded payment mapping types (PAYMENT_CASH, VENDOR_PAYMENT_CASH, etc.) in the `MappingType` enum. When new payment methods are created, their mappings appear in a separate "Dynamic" section. When payment methods are permanently deleted, their mappings are removed, but the hardcoded entries remain stale.

## Goal

Payment account mappings should be entirely data-driven from payment methods. Creating a payment method auto-generates its mappings. Updating a payment method syncs its mappings. Permanently deleting a payment method removes its mappings. The Account Mappings page renders payment sections dynamically from active payment methods.

## Approach: Enum + Dynamic Extension

Remove per-method hardcoded enum values. Keep two global payment enum values (PAYMENT_AR, VENDOR_PAYMENT_AP). Payment method CRUD generates/syncs/removes dynamic mapping rows using naming convention (`payment_{code}`, `vendor_payment_{code}`, `payment_{code}_settlement`).

## Design

### 1. Enum Changes

**Backend `MappingType` enum** (account-mapping.entity.ts):

Remove:
- `PAYMENT_CASH = 'payment_cash'`
- `VENDOR_PAYMENT_CASH = 'vendor_payment_cash'`

Keep (global shared mappings):
- `PAYMENT_AR = 'payment_ar'` - shared AR credit-side for all customer payments
- `VENDOR_PAYMENT_AP = 'vendor_payment_ap'` - shared AP debit-side for all vendor payments

Enum goes from 13 to 11 values.

**Frontend `MappingType` enum** (types/accountMapping.ts): Same changes.

### 2. Dynamic Mapping Lifecycle

**On Payment Method Create** (PaymentMethodService.create):
Already creates: `payment_{code}`, `payment_{code}_settlement` (if requiresSettlement).
Add: `vendor_payment_{code}` mapping.

**On Payment Method Update** (PaymentMethodService.update - new behavior):
- Code change: rename mapping types (`payment_oldcode` -> `payment_newcode`, same for vendor/settlement)
- Name change: update description on related mappings
- requiresSettlement toggled ON: create `payment_{code}_settlement`
- requiresSettlement toggled OFF: delete `payment_{code}_settlement`

**On Payment Method Permanent Delete** (PaymentMethodService.permanentDelete):
Already deletes: `payment_{code}`, `payment_{code}_settlement`.
Add: delete `vendor_payment_{code}`.

**On Payment Method Restore** (PaymentMethodService.restore):
Re-create mappings if they don't exist (same logic as create).

### 3. VendorPayment Entity Migration

Current: `paymentMethod: string` (freeform: 'cash', 'bank_transfer', 'check', 'card')
New: `paymentMethodId: UUID` (FK to payment_methods)

**Data migration mapping:**
- 'cash' -> CASH payment method ID
- 'bank_transfer' -> BANK payment method ID
- 'check' -> BANK payment method ID
- 'card' -> CC payment method ID

After migration, drop the `paymentMethod` string column.

### 4. Accounting Service Changes

**Customer Payment Posting** (postCustomerPaymentEntry):
- No change needed. Already uses dynamic `payment_{code}` for debit and `PAYMENT_AR` enum for credit.

**Vendor Payment Posting** (postVendorPaymentEntry):
- DR: `VENDOR_PAYMENT_AP` (kept in enum) - no change
- CR: `vendor_payment_{code}` (dynamic, derived from vendor payment's paymentMethodEntity.code) - replaces hardcoded `VENDOR_PAYMENT_CASH`

### 5. Validation Changes

`AccountMappingService.validateMappings()` currently checks all enum values are configured.

New behavior:
1. Check all 11 enum values are configured
2. Query active payment methods
3. For each payment method, verify:
   - `payment_{code}` mapping exists with non-null accountId
   - `vendor_payment_{code}` mapping exists with non-null accountId
   - If requiresSettlement: `payment_{code}_settlement` mapping exists with non-null accountId

### 6. Frontend Account Mappings Page

Current: Iterates hardcoded MappingType enum grouped by category, separate "Dynamic" section.

New:
- **Static categories** (Sales, Purchasing, Inventory): From enum as before (9 values)
- **Customer Payments**: Built dynamically from payment methods
  - `payment_ar` (global, from enum)
  - For each payment method: `payment_{code}` row
  - For each with requiresSettlement: `payment_{code}_settlement` row
- **Vendor Payments**: Built dynamically from payment methods
  - `vendor_payment_ap` (global, from enum)
  - For each payment method: `vendor_payment_{code}` row

Labels use payment method names (e.g., "TnG Payment Account", "TnG Settlement Account").

The page fetches both account mappings AND active payment methods, merging them to show configured/unconfigured status.

### 7. Files to Change

| File | Change |
|------|--------|
| `backend/src/database/entities/account-mapping.entity.ts` | Remove PAYMENT_CASH, VENDOR_PAYMENT_CASH from enum |
| `backend/src/database/entities/vendor-payment.entity.ts` | Add paymentMethodId FK |
| `backend/src/modules/settings/services/payment-method.service.ts` | Add vendor mapping creation, update sync, restore re-creation |
| `backend/src/modules/accounting/services/accounting.service.ts` | Use dynamic vendor_payment_{code} in vendor payment posting |
| `backend/src/modules/accounting/services/account-mapping.service.ts` | Dynamic validation with payment methods |
| `backend/src/modules/accounting/accounting.module.ts` | Add PaymentMethodEntity to imports if needed |
| `frontend/src/types/accountMapping.ts` | Remove PAYMENT_CASH, VENDOR_PAYMENT_CASH from enum |
| `frontend/src/pages/accounting/AccountMappingsPage.tsx` | Dynamic Payments/Vendor Payments sections |
| Database migration | Add paymentMethodId to vendor_payments, migrate data, drop paymentMethod string |
