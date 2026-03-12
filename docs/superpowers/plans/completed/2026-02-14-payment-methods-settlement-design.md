# Payment Methods & Third-Party Settlement System Design

**Date:** 2026-02-14
**Status:** Approved

## Problem

When buyers pay sales orders, several payment channels (TnG, Credit Card, Atome, Shopee, TikTok) hold funds with the third party before releasing to the business bank account. The system needs to:
1. Support multiple configurable payment methods
2. Track which payments are held by third parties
3. Record when third parties settle (release) funds to the bank
4. Post correct accounting entries at each step

## Design Decisions

- **Configurable payment methods** via a PaymentMethod entity (not a hardcoded enum)
- **Batch settlements** - platforms settle multiple payments at once; one Settlement record covers many payments
- **Simplified model** - no SettlementItem join table; Payment has a direct FK to Settlement
- **Hybrid account mapping** - PaymentMethod has a `code`; system auto-generates `PAYMENT_{CODE}` and `PAYMENT_{CODE}_SETTLEMENT` entries in Account Mappings. All GL configuration stays on the Account Mappings page.
- **Fees handled as sales order discounts** - payment amount always equals net amount; no fee tracking on payments
- **Separate receivable account per platform** - gives visibility into how much each platform owes at any time

## Data Model

### PaymentMethod Entity (new)

```
payment_methods
├── id (UUID, PK)
├── code (varchar, unique) - e.g. "CASH", "TNG", "SHOPEE"
├── name (varchar) - e.g. "Touch n Go", "Shopee"
├── requiresSettlement (boolean) - false for Cash/Bank Transfer, true for TnG/Shopee/etc
├── isActive (boolean, default: true)
├── sortOrder (int) - display order in dropdowns
└── BaseEntity fields (createdAt, updatedAt, deletedAt, audit fields)
```

### Settlement Entity (new)

```
settlements
├── id (UUID, PK)
├── settlementNumber (varchar, unique) - auto-generated "STL-{timestamp}"
├── paymentMethodId (UUID, FK → payment_methods) - which platform
├── settlementDate (date) - when money arrived in bank
├── totalAmount (decimal 15,4) - total settled amount
├── reference (varchar, nullable) - bank reference number
├── notes (text, nullable)
├── status (enum: PENDING, COMPLETED, CANCELLED)
└── BaseEntity fields
```

### Payment Entity (modified)

Existing `payments` table gains these changes:
- **Replace** `paymentMethod` enum column → `paymentMethodId` (UUID, FK → payment_methods)
- **Add** `settlementStatus` (enum: NOT_APPLICABLE, PENDING, SETTLED)
- **Add** `settlementId` (UUID, FK → settlements, nullable) - set when payment is included in a settlement

### Account Mappings (auto-generated)

When a PaymentMethod is created with code `XYZ`:
- `PAYMENT_XYZ` mapping is auto-created (account to debit when payment received)
- `PAYMENT_XYZ_SETTLEMENT` mapping is auto-created if `requiresSettlement = true` (account to debit when settled)

Global mapping `PAYMENT_AR` remains as the credit side for all payments.

## Default Payment Methods (seed data)

| Code | Name | Requires Settlement |
|------|------|-------------------|
| CASH | Cash | No |
| BANK | Bank Transfer | No |
| TNG | Touch n Go | Yes |
| CC | Credit Card | Yes |
| ATOME | Atome | Yes |
| SHOPEE | Shopee | Yes |
| TIKTOK | TikTok | Yes |

### New Chart of Accounts (auto-created)

| Code | Name | Type |
|------|------|------|
| 1120 | TnG Receivable | ASSET |
| 1130 | Credit Card Receivable | ASSET |
| 1140 | Atome Receivable | ASSET |
| 1150 | Shopee Receivable | ASSET |
| 1160 | TikTok Receivable | ASSET |

## Accounting Flow

### Payment Received (all methods)

```
DR  account from PAYMENT_{CODE} mapping    (amount)
CR  account from PAYMENT_AR mapping        (amount)
```

Examples:
- Cash payment RM 100: DR Cash (1000), CR A/R (1200)
- Shopee payment RM 100: DR Shopee Receivable (1150), CR A/R (1200)

### Settlement Recorded (third-party methods only)

```
DR  account from PAYMENT_{CODE}_SETTLEMENT mapping   (total amount)
CR  account from PAYMENT_{CODE} mapping               (total amount)
```

Example - Shopee settles RM 500:
- DR Bank (1010), CR Shopee Receivable (1150)
- All included payments marked as SETTLED

### Settlement Status Flow

- Cash/Bank Transfer: `NOT_APPLICABLE` (instant, no settlement needed)
- Third-party at payment time: `PENDING`
- Third-party after settlement: `SETTLED`

## UI & Navigation

### Settings > Payment Methods (`/settings/payment-methods`)

Table listing all payment methods:
| Code | Name | Type | Requires Settlement | Active |
|------|------|------|-------------------|--------|

Create/Edit dialog: Code, Name, Requires Settlement toggle, Sort Order.
When created, system auto-creates Account Mapping entries and prompts user to configure GL accounts.

### Accounting > Settlements (`/accounting/settlements`)

**List view:** All settlements with filters by payment method, date range, status.

**Create Settlement workflow:**
1. Select payment method (e.g. "Shopee")
2. System shows all PENDING payments for that method
3. Check the payments included in this settlement (or "Select All")
4. Enter settlement date and bank reference
5. System calculates total, creates settlement record
6. All selected payments marked as SETTLED
7. Accounting entry posted: DR Bank, CR Shopee Receivable

### Modified Payment Form

When recording a payment on an invoice, the form shows a **Payment Method dropdown** (replaces hardcoded Cash). Selecting a method determines:
- Which GL account is debited (via account mapping)
- Whether `settlementStatus` is NOT_APPLICABLE or PENDING

### Dashboard Widget

"Pending Settlements" card showing per-platform amounts:
- TnG: RM 1,200 (8 payments)
- Shopee: RM 3,400 (22 payments)
- etc.

### Account Mappings Page (updated)

All payment-related GL configuration visible and editable:
| Mapping Type | Account | Description |
|---|---|---|
| PAYMENT_AR | Accounts Receivable | A/R for all payments |
| PAYMENT_CASH | Cash | Cash payments received |
| PAYMENT_BANK | Bank | Bank transfer payments |
| PAYMENT_TNG | TnG Receivable | TnG payments received |
| PAYMENT_TNG_SETTLEMENT | Bank | TnG settlement to bank |
| PAYMENT_CC | CC Receivable | CC payments received |
| PAYMENT_CC_SETTLEMENT | Bank | CC settlement to bank |
| PAYMENT_ATOME | Atome Receivable | Atome payments received |
| PAYMENT_ATOME_SETTLEMENT | Bank | Atome settlement to bank |
| PAYMENT_SHOPEE | Shopee Receivable | Shopee payments received |
| PAYMENT_SHOPEE_SETTLEMENT | Bank | Shopee settlement to bank |
| PAYMENT_TIKTOK | TikTok Receivable | TikTok payments received |
| PAYMENT_TIKTOK_SETTLEMENT | Bank | TikTok settlement to bank |

## Migration Strategy

1. Create `payment_methods` and `settlements` tables
2. Seed default payment methods
3. Create new GL accounts for platform receivables
4. Auto-create account mapping entries
5. Migrate existing payments: set `paymentMethodId` to Cash method, `settlementStatus` to NOT_APPLICABLE
6. Drop old `paymentMethod` enum column from payments table
7. Update `postCustomerPaymentEntry()` to use dynamic account mapping based on payment method code

## RBAC

- **View payment methods/settlements:** All authenticated users
- **Create/edit payment methods:** Admin, Manager
- **Create/complete settlements:** Admin, Manager
- **Delete payment methods/settlements:** Admin only
