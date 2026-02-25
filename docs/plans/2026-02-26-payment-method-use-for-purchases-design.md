# Payment Method: Use For Purchases Flag — Design Doc

**Date**: 2026-02-26
**Status**: Approved

## Problem

All payment methods currently generate both a `payment_{code}` (customer receipt) and `vendor_payment_{code}` (vendor payment) account mapping. This means the Account Mappings page shows all payment methods in the Vendor Payment Mappings section, and all payment methods appear in vendor payment dropdowns — even methods only relevant for sales (e.g., Shopee Pay, Atome).

## Goal

Add a `useForPurchases` flag to payment methods so that only flagged methods:
1. Generate a `vendor_payment_{code}` account mapping
2. Appear in the Vendor Payment Mappings section of Account Mappings
3. Appear in vendor payment method dropdowns in the purchasing module

## Approach

Add a single `useForPurchases: boolean` column (default `true`) to the `payment_methods` table. This is the simplest, most direct solution — explicit, easy to query, and minimal blast radius.

## Design

### Database & Entity

New column on `payment_methods` table:
```sql
ALTER TABLE payment_methods ADD COLUMN use_for_purchases BOOLEAN NOT NULL DEFAULT TRUE;
```

Default `true` ensures all existing payment methods continue working without change.

`PaymentMethodEntity` gets one new field:
```typescript
@Column({ default: true })
useForPurchases: boolean;
```

### Backend Service Logic

**On CREATE:**
- `useForPurchases: true` → create `vendor_payment_{code}` mapping (existing behavior)
- `useForPurchases: false` → skip creating `vendor_payment_{code}` mapping

**On UPDATE (toggling `useForPurchases`):**
- `false → true`: Find existing `vendor_payment_{code}` mapping and set `isActive: true`. If none exists, create it fresh.
- `true → false`: Find `vendor_payment_{code}` mapping and set `isActive: false` (not deleted — preserves GL account assignment for future re-enabling).

**Active endpoint filter:**
- `GET /settings/payment-methods/active?forPurchases=true` — new optional query param
- Returns only methods where `useForPurchases: true` when param is set

### Frontend Changes

**`PaymentMethodFormDialog.tsx`:**
- Add `useForPurchases` toggle switch alongside `requiresSettlement`
- Label: "Use for Purchase Orders"
- Default: `true` for new methods

**`PaymentMethodsPage.tsx`:**
- Add "For Purchases" column with chip display (matching "Requires Settlement" chip pattern)

**`AccountMappingsPage.tsx`:**
- Vendor Payment Mappings section fetches `?forPurchases=true` to filter payment methods
- Payment Mappings section (customer receipts) is unaffected

**Vendor Payment Form (purchasing):**
- Populate payment method dropdown using `?forPurchases=true` filtered endpoint

**`types/index.ts` (`PaymentMethodConfig`):**
- Add `useForPurchases: boolean` field

### Migration & Data

- Database migration adds column with `DEFAULT TRUE NOT NULL`
- All existing payment methods default to `true` — no data loss, no breaking changes
- Existing `vendor_payment_{code}` account mappings remain untouched

## Files to Change

| File | Change |
|------|--------|
| `backend/src/database/entities/payment-method.entity.ts` | Add `useForPurchases` column |
| `backend/src/modules/settings/services/payment-method.service.ts` | Update create/update logic |
| `backend/src/modules/settings/dto/payment-method.dto.ts` | Add field to DTOs |
| `backend/src/modules/settings/controllers/payment-method.controller.ts` | Add `forPurchases` query param |
| Migration file (new) | Add column migration |
| `frontend/src/types/index.ts` | Add field to `PaymentMethodConfig` |
| `frontend/src/components/settings/PaymentMethodFormDialog.tsx` | Add toggle |
| `frontend/src/pages/settings/PaymentMethodsPage.tsx` | Add column |
| `frontend/src/pages/accounting/AccountMappingsPage.tsx` | Filter vendor payment methods |
| Vendor payment form component | Use filtered endpoint |
