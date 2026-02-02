# Accounting Module Design Document

**Project:** ERP System - Comprehensive Accounting Module
**Date:** February 2, 2026
**Status:** Design Complete - Ready for Implementation
**Architecture:** Full Double-Entry Accounting with Auto-Posting Integration

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Business Requirements](#business-requirements)
3. [Technical Architecture](#technical-architecture)
4. [Database Schema](#database-schema)
5. [Auto-Posting Logic](#auto-posting-logic)
6. [API Endpoints](#api-endpoints)
7. [Frontend Architecture](#frontend-architecture)
8. [Integration Requirements](#integration-requirements)
9. [Phased Implementation Plan](#phased-implementation-plan)
10. [Testing Strategy](#testing-strategy)
11. [Deployment & Documentation](#deployment--documentation)

---

## Executive Summary

### Overview
This document outlines the design for a comprehensive double-entry accounting module that integrates seamlessly with the existing ERP system's Sales, Purchasing, and Inventory modules. The accounting module will automatically post journal entries for all financial transactions while providing professional financial reporting and period-end closing capabilities.

### Key Features
- **Full Double-Entry Accounting** - Complete Chart of Accounts, Journal Entries, General Ledger
- **Automated Posting** - Auto-generate journal entries from sales, purchases, payments, and inventory transactions
- **Fiscal Period Management** - Monthly periods with closing/locking functionality
- **Bank Reconciliation** - Full reconciliation workflow with cleared transaction tracking
- **Financial Reports** - Trial Balance, Balance Sheet, Profit & Loss, General Ledger
- **Period Locking** - Prevent modifications to closed periods with reversal entry support
- **Single Currency** - Leverage existing price & costing settings for currency configuration

### Design Decisions Made

| Decision Point | Choice | Rationale |
|---------------|--------|-----------|
| **Accounting Methodology** | Full Double-Entry (Option A) | Complete financial management and compliance |
| **Chart of Accounts** | Extended COA with COGS (Option B) | Clear gross profit tracking for inventory business |
| **Posting Mode** | Fully Automatic (Option A) | Real-time accuracy, reduced manual work |
| **Fiscal Periods** | Calendar Year Monthly (Option A) | Simple, aligns with most business reporting |
| **Currency & Tax** | Single Currency, No Tax (Option A) | Uses price & costing settings, keeps it simple |
| **Reports** | Core Statements Only (Option A) | Balance Sheet, P&L, Trial Balance - essentials |
| **Integration** | Fresh Start (Option A) | All mock data, accounting starts from go-live |
| **Period Closing** | Reconciliation Support (Option C) | Locking + bank reconciliation for proper controls |
| **Account Mapping** | Configurable (Option B) | Admin settings for flexibility without complexity |

---

## Business Requirements

### Functional Requirements

#### FR1: Chart of Accounts Management
- **FR1.1** - Support hierarchical Chart of Accounts with 6 account types
- **FR1.2** - Account types: Asset (1000-1999), Liability (2000-2999), Equity (3000-3999), Revenue (4000-4999), COGS (5000-5999), Expense (6000-6999)
- **FR1.3** - Seed default COA with standard business accounts
- **FR1.4** - Support parent-child account relationships
- **FR1.5** - Prevent deletion of system accounts and accounts with transactions
- **FR1.6** - Track normal balance (Debit/Credit) per account

#### FR2: Journal Entry Management
- **FR2.1** - Create manual journal entries with multiple line items
- **FR2.2** - Validate debits equal credits before posting
- **FR2.3** - Support entry statuses: Draft, Posted, Reversed
- **FR2.4** - Auto-generate sequential entry numbers (JE-2026-001)
- **FR2.5** - Track entry type: Manual, Auto-Sales, Auto-Purchase, Auto-Payment, etc.
- **FR2.6** - Link journal entries to source transactions (two-way reference)
- **FR2.7** - Support reversal entries for corrections

#### FR3: Fiscal Period Management
- **FR3.1** - Generate fiscal periods for calendar year (Jan-Dec)
- **FR3.2** - Support monthly periods (12 periods per year)
- **FR3.3** - Period statuses: Open, Closed
- **FR3.4** - Prevent posting to closed periods (hard lock)
- **FR3.5** - Allow admin to reopen closed periods
- **FR3.6** - Track who closed period and when

#### FR4: Automatic Posting
- **FR4.1** - Auto-post journal entries when sales orders fulfilled
- **FR4.2** - Auto-post journal entries when customer payments received
- **FR4.3** - Auto-post journal entries when goods received from suppliers
- **FR4.4** - Auto-post journal entries when vendor payments made
- **FR4.5** - Auto-post journal entries when stock adjustments completed
- **FR4.6** - Use configurable account mappings for auto-posting
- **FR4.7** - Log errors but continue business transaction if posting fails

#### FR5: Bank Reconciliation
- **FR5.1** - Start reconciliation for cash/bank accounts
- **FR5.2** - Mark journal entry lines as cleared/unreconciled
- **FR5.3** - Track statement date and statement balance
- **FR5.4** - Calculate difference between book balance and statement balance
- **FR5.5** - Complete reconciliation when balanced
- **FR5.6** - Maintain reconciliation history

#### FR6: Financial Reports
- **FR6.1** - Generate Trial Balance (date range filter)
- **FR6.2** - Generate Balance Sheet (as of date)
- **FR6.3** - Generate Profit & Loss Statement (date range)
- **FR6.4** - Generate General Ledger (account and date filters)
- **FR6.5** - Generate Account Activity report (drill-down by account)
- **FR6.6** - Export all reports to Excel (ExcelJS)
- **FR6.7** - Validate Trial Balance always balances
- **FR6.8** - Validate Balance Sheet equation (Assets = Liabilities + Equity)

#### FR7: Account Mapping Configuration
- **FR7.1** - Configure which GL accounts to use for each transaction type
- **FR7.2** - Support mappings: Sales Revenue, AR, COGS, Inventory, AP, Cash, etc.
- **FR7.3** - Validate all required mappings configured before auto-posting
- **FR7.4** - Admin-only access to mapping configuration

### Non-Functional Requirements

#### NFR1: Performance
- **NFR1.1** - Financial reports generate in < 5 seconds
- **NFR1.2** - Journal entry posting completes in < 2 seconds
- **NFR1.3** - Support 100,000+ journal entry lines without degradation

#### NFR2: Data Integrity
- **NFR2.1** - All journal entries must balance (Total Debit = Total Credit)
- **NFR2.2** - Closed periods cannot be modified
- **NFR2.3** - Account balances always reflect posted entries
- **NFR2.4** - Audit trail for all accounting operations

#### NFR3: Security
- **NFR3.1** - Role-based access control (leverage existing RBAC)
- **NFR3.2** - Admin role required for period closing/reopening
- **NFR3.3** - Manager role can create manual entries
- **NFR3.4** - All users can view reports

#### NFR4: Usability
- **NFR4.1** - Intuitive UI following existing Material-UI patterns
- **NFR4.2** - Clear error messages for validation failures
- **NFR4.3** - Responsive design for all accounting pages
- **NFR4.4** - Keyboard shortcuts for data entry

---

## Technical Architecture

### Module Structure

```
backend/src/modules/accounting/
├── entities/
│   ├── chart-of-accounts.entity.ts
│   ├── fiscal-period.entity.ts
│   ├── journal-entry.entity.ts
│   ├── journal-entry-line.entity.ts
│   ├── account-mapping.entity.ts
│   ├── bank-reconciliation.entity.ts
│   └── reconciled-transaction.entity.ts
│
├── services/
│   ├── chart-of-accounts.service.ts      // COA CRUD, hierarchy
│   ├── fiscal-period.service.ts          // Period management
│   ├── journal-entry.service.ts          // Entry CRUD, posting
│   ├── accounting.service.ts             // Auto-posting integration
│   ├── account-mapping.service.ts        // Mapping configuration
│   ├── reconciliation.service.ts         // Bank reconciliation
│   └── accounting-reports.service.ts     // Financial reports
│
├── controllers/
│   ├── accounting.controller.ts          // Module info
│   ├── chart-of-accounts.controller.ts   // COA endpoints
│   ├── journal-entries.controller.ts     // Entry endpoints
│   ├── fiscal-periods.controller.ts      // Period endpoints
│   ├── account-mappings.controller.ts    // Mapping endpoints
│   ├── reconciliation.controller.ts      // Reconciliation endpoints
│   └── accounting-reports.controller.ts  // Report endpoints
│
├── dto/
│   ├── create-account.dto.ts
│   ├── create-journal-entry.dto.ts
│   ├── create-reconciliation.dto.ts
│   └── ... (other DTOs)
│
└── accounting.module.ts
```

### Technology Stack

- **Backend Framework:** NestJS 11
- **Database:** PostgreSQL (primary), TypeORM
- **Validation:** class-validator, class-transformer
- **Reports:** ExcelJS (Excel export), jsPDF (PDF - optional)
- **Frontend:** React 18.3.1, TypeScript, Material-UI v7, Redux Toolkit
- **State Management:** Redux Toolkit with persistence
- **API Documentation:** Swagger/OpenAPI

### Design Patterns

- **Repository Pattern** - TypeORM repositories for data access
- **Service Layer Pattern** - Business logic in services
- **DTO Pattern** - Request/response validation with class-validator
- **Observer Pattern** - Event-driven auto-posting integration
- **Strategy Pattern** - Different posting strategies per transaction type

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────┐
│  ChartOfAccounts    │
│─────────────────────│
│ id (PK)             │
│ accountCode (UQ)    │◄─────┐
│ accountName         │      │
│ accountType (enum)  │      │
│ normalBalance       │      │
│ parentAccountId(FK) │──────┘
│ balance             │
│ isSystemAccount     │
└─────────────────────┘
          △
          │
          │ accountId (FK)
          │
┌─────────────────────┐      ┌─────────────────────┐
│  JournalEntry       │      │  FiscalPeriod       │
│─────────────────────│      │─────────────────────│
│ id (PK)             │      │ id (PK)             │
│ entryNumber (UQ)    │      │ periodName          │
│ entryDate           │      │ periodYear          │
│ fiscalPeriodId (FK) │──────┤ periodMonth         │
│ entryType (enum)    │      │ startDate           │
│ referenceType       │      │ endDate             │
│ referenceId         │      │ status (enum)       │
│ description         │      │ closedBy            │
│ status (enum)       │      │ closedAt            │
│ totalDebit          │      └─────────────────────┘
│ totalCredit         │
│ isReversed          │
│ reversedById        │
└─────────────────────┘
          │
          │ journalEntryId (FK)
          ▼
┌─────────────────────┐
│ JournalEntryLine    │
│─────────────────────│
│ id (PK)             │
│ journalEntryId (FK) │
│ accountId (FK)      │
│ lineNumber          │
│ description         │
│ debit               │
│ credit              │
└─────────────────────┘

┌─────────────────────┐
│  AccountMapping     │
│─────────────────────│
│ id (PK)             │
│ mappingType (enum)  │
│ accountId (FK)      │
│ description         │
│ isActive            │
└─────────────────────┘

┌─────────────────────┐      ┌──────────────────────┐
│ BankReconciliation  │      │ ReconciledTransaction│
│─────────────────────│      │──────────────────────│
│ id (PK)             │◄─────│ id (PK)              │
│ accountId (FK)      │      │ reconciliationId (FK)│
│ fiscalPeriodId (FK) │      │ journalEntryLineId   │
│ reconciliationDate  │      │ isCleared            │
│ statementDate       │      │ clearedDate          │
│ statementBalance    │      └──────────────────────┘
│ bookBalance         │
│ status (enum)       │
│ reconciledBy        │
└─────────────────────┘
```

### Entity Definitions

#### 1. ChartOfAccounts Entity

```typescript
@Entity('chart_of_accounts')
@Index(['accountCode'], { unique: true })
@Index(['accountType'])
@Index(['parentAccountId'])
export class ChartOfAccounts extends BaseEntity {
  @Column({ type: 'varchar', length: 20, unique: true })
  accountCode: string; // e.g., "1000", "4000-01"

  @Column({ type: 'varchar', length: 255 })
  accountName: string; // e.g., "Cash in Hand"

  @Column({ type: 'enum', enum: AccountType })
  accountType: AccountType; // ASSET, LIABILITY, EQUITY, REVENUE, COGS, EXPENSE

  @Column({ type: 'varchar', length: 100, nullable: true })
  accountSubType: string; // e.g., "Current Asset", "Fixed Asset"

  @Column({ type: 'uuid', nullable: true })
  parentAccountId: string; // For sub-accounts

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isSystemAccount: boolean; // Prevents deletion

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  balance: number; // Current balance

  @Column({ type: 'enum', enum: NormalBalance })
  normalBalance: NormalBalance; // DEBIT or CREDIT

  @Column({ type: 'integer', default: 1 })
  level: number; // Hierarchy depth

  // Relationships
  @ManyToOne(() => ChartOfAccounts, { nullable: true })
  @JoinColumn({ name: 'parentAccountId' })
  parentAccount: ChartOfAccounts;

  @OneToMany(() => ChartOfAccounts, (account) => account.parentAccount)
  childAccounts: ChartOfAccounts[];
}

export enum AccountType {
  ASSET = 'asset',
  LIABILITY = 'liability',
  EQUITY = 'equity',
  REVENUE = 'revenue',
  COGS = 'cogs',
  EXPENSE = 'expense',
}

export enum NormalBalance {
  DEBIT = 'debit',
  CREDIT = 'credit',
}
```

#### 2. FiscalPeriod Entity

```typescript
@Entity('fiscal_periods')
@Index(['periodYear', 'periodMonth'], { unique: true })
@Index(['status'])
export class FiscalPeriod extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  periodName: string; // e.g., "January 2026"

  @Column({ type: 'integer' })
  periodYear: number; // 2026

  @Column({ type: 'integer' })
  periodMonth: number; // 1-12

  @Column({ type: 'date' })
  startDate: Date; // First day of month

  @Column({ type: 'date' })
  endDate: Date; // Last day of month

  @Column({ type: 'enum', enum: PeriodStatus, default: PeriodStatus.OPEN })
  status: PeriodStatus;

  @Column({ type: 'uuid', nullable: true })
  closedBy: string; // User ID who closed

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date;

  // Relationships
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'closedBy' })
  closedByUser: User;
}

export enum PeriodStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}
```

#### 3. JournalEntry Entity

```typescript
@Entity('journal_entries')
@Index(['entryNumber'], { unique: true })
@Index(['entryDate'])
@Index(['fiscalPeriodId'])
@Index(['status'])
@Index(['entryType'])
@Index(['referenceType', 'referenceId'])
export class JournalEntry extends BaseEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  entryNumber: string; // "JE-2026-001"

  @Column({ type: 'date' })
  entryDate: Date;

  @Column({ type: 'uuid' })
  fiscalPeriodId: string;

  @Column({ type: 'enum', enum: EntryType })
  entryType: EntryType;

  @Column({ type: 'varchar', length: 50, nullable: true })
  referenceType: string; // e.g., "sales_order", "invoice"

  @Column({ type: 'uuid', nullable: true })
  referenceId: string; // Source transaction ID

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: EntryStatus, default: EntryStatus.DRAFT })
  status: EntryStatus;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalDebit: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalCredit: number;

  @Column({ type: 'boolean', default: false })
  isReversed: boolean;

  @Column({ type: 'uuid', nullable: true })
  reversedById: string; // ID of reversing entry

  @Column({ type: 'timestamp', nullable: true })
  reversedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  postedBy: string; // User ID who posted

  @Column({ type: 'timestamp', nullable: true })
  postedAt: Date;

  // Relationships
  @ManyToOne(() => FiscalPeriod)
  @JoinColumn({ name: 'fiscalPeriodId' })
  fiscalPeriod: FiscalPeriod;

  @OneToMany(() => JournalEntryLine, (line) => line.journalEntry, { cascade: true })
  lines: JournalEntryLine[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'postedBy' })
  postedByUser: User;

  // Validation
  @BeforeInsert()
  @BeforeUpdate()
  validateBalance() {
    if (Math.abs(this.totalDebit - this.totalCredit) > 0.01) {
      throw new BadRequestException('Journal entry does not balance');
    }
  }
}

export enum EntryType {
  MANUAL = 'manual',
  AUTO_SALES = 'auto_sales',
  AUTO_PURCHASE = 'auto_purchase',
  AUTO_PAYMENT = 'auto_payment',
  AUTO_RECEIPT = 'auto_receipt',
  AUTO_INVENTORY = 'auto_inventory',
  OPENING_BALANCE = 'opening_balance',
  REVERSING = 'reversing',
}

export enum EntryStatus {
  DRAFT = 'draft',
  POSTED = 'posted',
  REVERSED = 'reversed',
}
```

#### 4. JournalEntryLine Entity

```typescript
@Entity('journal_entry_lines')
@Index(['journalEntryId'])
@Index(['accountId'])
export class JournalEntryLine extends BaseEntity {
  @Column({ type: 'uuid' })
  journalEntryId: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ type: 'integer' })
  lineNumber: number; // Sequence within entry

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  credit: number;

  // Relationships
  @ManyToOne(() => JournalEntry, (entry) => entry.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journalEntryId' })
  journalEntry: JournalEntry;

  @ManyToOne(() => ChartOfAccounts)
  @JoinColumn({ name: 'accountId' })
  account: ChartOfAccounts;

  // Validation
  @BeforeInsert()
  @BeforeUpdate()
  validateDebitOrCredit() {
    const hasDebit = this.debit > 0;
    const hasCredit = this.credit > 0;

    if (hasDebit && hasCredit) {
      throw new BadRequestException('Line cannot have both debit and credit');
    }

    if (!hasDebit && !hasCredit) {
      throw new BadRequestException('Line must have either debit or credit');
    }
  }
}
```

#### 5. AccountMapping Entity

```typescript
@Entity('account_mappings')
@Index(['mappingType'], { unique: true })
export class AccountMapping extends BaseEntity {
  @Column({ type: 'enum', enum: MappingType, unique: true })
  mappingType: MappingType;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Relationships
  @ManyToOne(() => ChartOfAccounts)
  @JoinColumn({ name: 'accountId' })
  account: ChartOfAccounts;
}

export enum MappingType {
  SALES_REVENUE = 'sales_revenue',
  SALES_AR = 'sales_ar',
  SALES_COGS = 'sales_cogs',
  SALES_INVENTORY = 'sales_inventory',
  PURCHASE_INVENTORY = 'purchase_inventory',
  PURCHASE_AP = 'purchase_ap',
  PAYMENT_CASH = 'payment_cash',
  PAYMENT_AR = 'payment_ar',
  VENDOR_PAYMENT_CASH = 'vendor_payment_cash',
  VENDOR_PAYMENT_AP = 'vendor_payment_ap',
  INVENTORY_ASSET = 'inventory_asset',
  INVENTORY_ADJUSTMENT_GAIN = 'inventory_adjustment_gain',
  INVENTORY_ADJUSTMENT_LOSS = 'inventory_adjustment_loss',
}
```

#### 6. BankReconciliation Entity

```typescript
@Entity('bank_reconciliations')
@Index(['accountId'])
@Index(['fiscalPeriodId'])
@Index(['status'])
export class BankReconciliation extends BaseEntity {
  @Column({ type: 'uuid' })
  accountId: string; // Bank/Cash account

  @Column({ type: 'uuid' })
  fiscalPeriodId: string;

  @Column({ type: 'date' })
  reconciliationDate: Date;

  @Column({ type: 'date' })
  statementDate: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  statementBalance: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  bookBalance: number;

  @Column({ type: 'enum', enum: ReconciliationStatus, default: ReconciliationStatus.IN_PROGRESS })
  status: ReconciliationStatus;

  @Column({ type: 'uuid', nullable: true })
  reconciledBy: string;

  @Column({ type: 'timestamp', nullable: true })
  reconciledAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Relationships
  @ManyToOne(() => ChartOfAccounts)
  @JoinColumn({ name: 'accountId' })
  account: ChartOfAccounts;

  @ManyToOne(() => FiscalPeriod)
  @JoinColumn({ name: 'fiscalPeriodId' })
  fiscalPeriod: FiscalPeriod;

  @OneToMany(() => ReconciledTransaction, (txn) => txn.reconciliation, { cascade: true })
  transactions: ReconciledTransaction[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reconciledBy' })
  reconciledByUser: User;
}

export enum ReconciliationStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}
```

#### 7. ReconciledTransaction Entity

```typescript
@Entity('reconciled_transactions')
@Index(['reconciliationId'])
@Index(['journalEntryLineId'])
export class ReconciledTransaction extends BaseEntity {
  @Column({ type: 'uuid' })
  reconciliationId: string;

  @Column({ type: 'uuid' })
  journalEntryLineId: string;

  @Column({ type: 'boolean', default: false })
  isCleared: boolean;

  @Column({ type: 'date', nullable: true })
  clearedDate: Date;

  // Relationships
  @ManyToOne(() => BankReconciliation, (recon) => recon.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reconciliationId' })
  reconciliation: BankReconciliation;

  @ManyToOne(() => JournalEntryLine)
  @JoinColumn({ name: 'journalEntryLineId' })
  journalEntryLine: JournalEntryLine;
}
```

### Database Indexes

```sql
-- Chart of Accounts
CREATE INDEX idx_coa_account_code ON chart_of_accounts(account_code);
CREATE INDEX idx_coa_account_type ON chart_of_accounts(account_type);
CREATE INDEX idx_coa_parent_id ON chart_of_accounts(parent_account_id);

-- Fiscal Periods
CREATE UNIQUE INDEX idx_period_year_month ON fiscal_periods(period_year, period_month);
CREATE INDEX idx_period_status ON fiscal_periods(status);

-- Journal Entries
CREATE UNIQUE INDEX idx_entry_number ON journal_entries(entry_number);
CREATE INDEX idx_entry_date ON journal_entries(entry_date);
CREATE INDEX idx_entry_period ON journal_entries(fiscal_period_id);
CREATE INDEX idx_entry_status ON journal_entries(status);
CREATE INDEX idx_entry_type ON journal_entries(entry_type);
CREATE INDEX idx_entry_reference ON journal_entries(reference_type, reference_id);

-- Journal Entry Lines
CREATE INDEX idx_line_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_line_account ON journal_entry_lines(account_id);

-- Account Mappings
CREATE UNIQUE INDEX idx_mapping_type ON account_mappings(mapping_type);

-- Bank Reconciliations
CREATE INDEX idx_recon_account ON bank_reconciliations(account_id);
CREATE INDEX idx_recon_period ON bank_reconciliations(fiscal_period_id);
CREATE INDEX idx_recon_status ON bank_reconciliations(status);

-- Reconciled Transactions
CREATE INDEX idx_recon_txn_recon ON reconciled_transactions(reconciliation_id);
CREATE INDEX idx_recon_txn_line ON reconciled_transactions(journal_entry_line_id);
```

---

## Auto-Posting Logic

### Transaction Integration Points

The accounting module will automatically post journal entries for the following transaction types:

#### 1. Sales Order Fulfillment

**Trigger:** `SalesOrderService.fulfill()` when `isFulfilled = true`

**Journal Entry:**
```
Entry Type: AUTO_SALES
Reference: sales_order:{id}
Description: "Sales Order {orderNumber} - {customer.name}"

Line 1: DR  Cost of Goods Sold (5000)      $XXX
        CR  Inventory Asset (1500)                $XXX
        (Description: "COGS for {product.name}")

Line 2: DR  Accounts Receivable (1200)     $XXX
        CR  Sales Revenue (4000)                  $XXX
        (Description: "Sales revenue for {product.name}")
```

**Calculations:**
- COGS Amount = Sum of (item.quantity × product.baseCost) for all items
- Sales Revenue = order.totalAmount
- AR Amount = order.totalAmount

**Stock Movement:** Created by existing SalesOrderService (no change needed)

#### 2. Customer Payment Receipt

**Trigger:** `PaymentService.create()` for customer payments

**Journal Entry:**
```
Entry Type: AUTO_PAYMENT
Reference: payment:{id}
Description: "Payment {paymentNumber} from {customer.name}"

DR  Cash in Hand (1000)            $XXX
    CR  Accounts Receivable (1200)       $XXX
```

**Calculations:**
- Cash Amount = payment.amount
- AR Reduction = payment.amount

**Invoice Update:** Existing PaymentService updates invoice.paidAmount (no change needed)

#### 3. Purchase Order - Goods Received

**Trigger:** `GoodsReceivedNoteService.create()`

**Journal Entry:**
```
Entry Type: AUTO_PURCHASE
Reference: goods_received_note:{id}
Description: "GRN {grnNumber} from {supplier.name}"

DR  Inventory Asset (1500)         $XXX
    CR  Accounts Payable (2000)          $XXX
```

**Calculations:**
- Inventory Increase = Sum of (item.receivedQuantity × item.unitCost) for all items
- AP Amount = grn.totalAmount

**Stock Movement:** Created by existing GRNService (no change needed)

#### 4. Vendor Payment

**Trigger:** `VendorPaymentService.create()`

**Journal Entry:**
```
Entry Type: AUTO_PAYMENT
Reference: vendor_payment:{id}
Description: "Vendor Payment {paymentNumber} to {supplier.name}"

DR  Accounts Payable (2000)        $XXX
    CR  Cash in Hand (1000)              $XXX
```

**Calculations:**
- AP Reduction = vendorPayment.amount
- Cash Decrease = vendorPayment.amount

#### 5. Stock Adjustments

**Trigger:** `StockAdjustmentService.complete()`

**For Increase (newQuantity > oldQuantity):**
```
Entry Type: AUTO_INVENTORY
Reference: stock_adjustment:{id}
Description: "Stock Adjustment {adjustmentNumber} - Increase"

DR  Inventory Asset (1500)                 $XXX
    CR  Inventory Adjustment Gain (4900)         $XXX
```

**For Decrease (newQuantity < oldQuantity):**
```
Entry Type: AUTO_INVENTORY
Reference: stock_adjustment:{id}
Description: "Stock Adjustment {adjustmentNumber} - Decrease"

DR  Inventory Adjustment Loss (6500)       $XXX
    CR  Inventory Asset (1500)                   $XXX
```

**Calculations:**
- Adjustment Value = Sum of (|item.difference| × item.unitCost) for all items
- Stock movements already created by existing service

### AccountingService Methods

The `AccountingService` will provide these auto-posting methods:

```typescript
@Injectable()
export class AccountingService {
  constructor(
    private readonly journalEntryService: JournalEntryService,
    private readonly accountMappingService: AccountMappingService,
    private readonly fiscalPeriodService: FiscalPeriodService,
  ) {}

  /**
   * Post sales order fulfillment to accounting
   */
  async postSalesOrderEntry(
    salesOrder: SalesOrder,
    userId: string,
  ): Promise<JournalEntry> {
    // 1. Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // 2. Validate period is open
    await this.validatePeriodOpen(salesOrder.fulfilledDate);

    // 3. Calculate amounts
    const cogsAmount = this.calculateCOGS(salesOrder.items);
    const salesAmount = salesOrder.totalAmount;

    // 4. Build journal entry
    const entry = {
      entryType: EntryType.AUTO_SALES,
      entryDate: salesOrder.fulfilledDate,
      referenceType: 'sales_order',
      referenceId: salesOrder.id,
      description: `Sales Order ${salesOrder.orderNumber} - ${salesOrder.customer.name}`,
      lines: [
        {
          accountId: mappings.SALES_COGS,
          description: 'Cost of Goods Sold',
          debit: cogsAmount,
          credit: 0,
        },
        {
          accountId: mappings.SALES_INVENTORY,
          description: 'Inventory reduction',
          debit: 0,
          credit: cogsAmount,
        },
        {
          accountId: mappings.SALES_AR,
          description: 'Accounts Receivable',
          debit: salesAmount,
          credit: 0,
        },
        {
          accountId: mappings.SALES_REVENUE,
          description: 'Sales Revenue',
          debit: 0,
          credit: salesAmount,
        },
      ],
    };

    // 5. Post entry
    return await this.journalEntryService.createAndPost(entry, userId);
  }

  /**
   * Post customer payment to accounting
   */
  async postCustomerPaymentEntry(
    payment: Payment,
    userId: string,
  ): Promise<JournalEntry> {
    const mappings = await this.accountMappingService.getMappings();
    await this.validatePeriodOpen(payment.paymentDate);

    const entry = {
      entryType: EntryType.AUTO_PAYMENT,
      entryDate: payment.paymentDate,
      referenceType: 'payment',
      referenceId: payment.id,
      description: `Payment ${payment.paymentNumber} from ${payment.customer.name}`,
      lines: [
        {
          accountId: mappings.PAYMENT_CASH,
          description: 'Cash received',
          debit: payment.amount,
          credit: 0,
        },
        {
          accountId: mappings.PAYMENT_AR,
          description: 'AR reduction',
          debit: 0,
          credit: payment.amount,
        },
      ],
    };

    return await this.journalEntryService.createAndPost(entry, userId);
  }

  /**
   * Post goods received to accounting
   */
  async postGoodsReceivedEntry(
    grn: GoodsReceivedNote,
    userId: string,
  ): Promise<JournalEntry> {
    const mappings = await this.accountMappingService.getMappings();
    await this.validatePeriodOpen(grn.receivedDate);

    const totalAmount = this.calculateGRNTotal(grn.items);

    const entry = {
      entryType: EntryType.AUTO_PURCHASE,
      entryDate: grn.receivedDate,
      referenceType: 'goods_received_note',
      referenceId: grn.id,
      description: `GRN ${grn.grnNumber} from ${grn.supplier.name}`,
      lines: [
        {
          accountId: mappings.PURCHASE_INVENTORY,
          description: 'Inventory increase',
          debit: totalAmount,
          credit: 0,
        },
        {
          accountId: mappings.PURCHASE_AP,
          description: 'Accounts Payable',
          debit: 0,
          credit: totalAmount,
        },
      ],
    };

    return await this.journalEntryService.createAndPost(entry, userId);
  }

  /**
   * Post vendor payment to accounting
   */
  async postVendorPaymentEntry(
    vendorPayment: VendorPayment,
    userId: string,
  ): Promise<JournalEntry> {
    const mappings = await this.accountMappingService.getMappings();
    await this.validatePeriodOpen(vendorPayment.paymentDate);

    const entry = {
      entryType: EntryType.AUTO_PAYMENT,
      entryDate: vendorPayment.paymentDate,
      referenceType: 'vendor_payment',
      referenceId: vendorPayment.id,
      description: `Vendor Payment ${vendorPayment.paymentNumber} to ${vendorPayment.supplier.name}`,
      lines: [
        {
          accountId: mappings.VENDOR_PAYMENT_AP,
          description: 'AP reduction',
          debit: vendorPayment.amount,
          credit: 0,
        },
        {
          accountId: mappings.VENDOR_PAYMENT_CASH,
          description: 'Cash paid',
          debit: 0,
          credit: vendorPayment.amount,
        },
      ],
    };

    return await this.journalEntryService.createAndPost(entry, userId);
  }

  /**
   * Post stock adjustment to accounting
   */
  async postStockAdjustmentEntry(
    adjustment: StockAdjustment,
    userId: string,
  ): Promise<JournalEntry> {
    const mappings = await this.accountMappingService.getMappings();
    await this.validatePeriodOpen(adjustment.adjustmentDate);

    const { totalIncrease, totalDecrease } = this.calculateAdjustmentTotals(adjustment.items);

    const lines = [];

    // Handle increases
    if (totalIncrease > 0) {
      lines.push(
        {
          accountId: mappings.INVENTORY_ASSET,
          description: 'Inventory increase',
          debit: totalIncrease,
          credit: 0,
        },
        {
          accountId: mappings.INVENTORY_ADJUSTMENT_GAIN,
          description: 'Adjustment gain',
          debit: 0,
          credit: totalIncrease,
        },
      );
    }

    // Handle decreases
    if (totalDecrease > 0) {
      lines.push(
        {
          accountId: mappings.INVENTORY_ADJUSTMENT_LOSS,
          description: 'Adjustment loss',
          debit: totalDecrease,
          credit: 0,
        },
        {
          accountId: mappings.INVENTORY_ASSET,
          description: 'Inventory decrease',
          debit: 0,
          credit: totalDecrease,
        },
      );
    }

    const entry = {
      entryType: EntryType.AUTO_INVENTORY,
      entryDate: adjustment.adjustmentDate,
      referenceType: 'stock_adjustment',
      referenceId: adjustment.id,
      description: `Stock Adjustment ${adjustment.adjustmentNumber}`,
      lines,
    };

    return await this.journalEntryService.createAndPost(entry, userId);
  }

  /**
   * Reverse a journal entry (for corrections)
   */
  async reverseSalesOrderEntry(
    salesOrder: SalesOrder,
    userId: string,
  ): Promise<JournalEntry> {
    // Find original entry
    const originalEntry = await this.journalEntryService.findByReference(
      'sales_order',
      salesOrder.id,
    );

    if (!originalEntry) {
      throw new NotFoundException('Original journal entry not found');
    }

    // Create reversal entry
    return await this.journalEntryService.reverse(originalEntry.id, userId);
  }

  /**
   * Validate that period is open for posting
   */
  private async validatePeriodOpen(entryDate: Date): Promise<void> {
    const period = await this.fiscalPeriodService.getPeriodByDate(entryDate);

    if (!period) {
      throw new BadRequestException(
        `No fiscal period found for date ${entryDate}. Please generate periods first.`,
      );
    }

    if (period.status === PeriodStatus.CLOSED) {
      throw new BadRequestException(
        `Cannot post to closed period: ${period.periodName}. Period was closed on ${period.closedAt}.`,
      );
    }
  }

  // Helper calculation methods...
}
```

### Error Handling Strategy

**Approach: Log and Continue (Option B)**

When auto-posting fails, the business transaction continues but the error is logged:

```typescript
// In SalesOrderService.fulfill()
async fulfill(id: string, userId: string): Promise<SalesOrder> {
  // Existing fulfillment logic
  const order = await this.markAsFulfilled(id, userId);
  await this.createStockMovements(order);

  // NEW: Attempt to post to accounting
  try {
    await this.accountingService.postSalesOrderEntry(order, userId);
  } catch (error) {
    // Log error but don't fail the transaction
    this.logger.error(
      `Failed to post sales order ${id} to accounting: ${error.message}`,
      error.stack,
    );

    // Optional: Create notification for accounting team
    await this.notificationService.notify({
      type: 'ACCOUNTING_POST_FAILED',
      message: `Sales order ${order.orderNumber} fulfilled but accounting entry failed. Manual journal entry required.`,
      metadata: { salesOrderId: id, error: error.message },
    });
  }

  return order;
}
```

**Benefits:**
- Business operations not blocked by accounting issues
- Accounting module can be enabled gradually
- Admin can review and manually fix mismatched entries
- More resilient to system errors

---

## API Endpoints

### Base Path: `/api/accounting`

### Chart of Accounts Endpoints

```typescript
// GET /api/accounting/chart-of-accounts
// List all accounts with optional filters
Query params: accountType, isActive, search
Response: { data: ChartOfAccounts[], meta: { total, page, limit } }

// GET /api/accounting/chart-of-accounts/tree
// Get hierarchical tree structure
Response: { data: ChartOfAccountsTree[] }

// GET /api/accounting/chart-of-accounts/:id
// Get single account with details
Response: { data: ChartOfAccounts }

// POST /api/accounting/chart-of-accounts
// Create new account
Body: CreateAccountDto
Response: { data: ChartOfAccounts }

// PUT /api/accounting/chart-of-accounts/:id
// Update account
Body: UpdateAccountDto
Response: { data: ChartOfAccounts }

// DELETE /api/accounting/chart-of-accounts/:id
// Soft delete account (only if no transactions)
Response: { success: true }

// POST /api/accounting/chart-of-accounts/seed
// Seed default COA (one-time setup)
Response: { data: ChartOfAccounts[], message: 'Default COA seeded successfully' }
```

### Journal Entry Endpoints

```typescript
// GET /api/accounting/journal-entries
// List journal entries with filters
Query params: startDate, endDate, accountId, entryType, status, fiscalPeriodId, page, limit
Response: { data: JournalEntry[], meta: { total, page, limit } }

// GET /api/accounting/journal-entries/:id
// Get entry with all line items
Response: { data: JournalEntry (with lines) }

// POST /api/accounting/journal-entries
// Create manual journal entry
Body: CreateJournalEntryDto
Response: { data: JournalEntry }

// PUT /api/accounting/journal-entries/:id
// Update draft entry
Body: UpdateJournalEntryDto
Response: { data: JournalEntry }

// DELETE /api/accounting/journal-entries/:id
// Delete draft entry
Response: { success: true }

// POST /api/accounting/journal-entries/:id/post
// Post entry (draft → posted)
Response: { data: JournalEntry }

// POST /api/accounting/journal-entries/:id/reverse
// Reverse posted entry
Body: { reason: string }
Response: { data: JournalEntry (reversal entry) }
```

### Fiscal Period Endpoints

```typescript
// GET /api/accounting/fiscal-periods
// List all periods
Query params: year, status
Response: { data: FiscalPeriod[] }

// GET /api/accounting/fiscal-periods/:id
// Get single period
Response: { data: FiscalPeriod }

// POST /api/accounting/fiscal-periods/generate
// Auto-generate periods for a year
Body: { year: number } // e.g., 2026
Response: { data: FiscalPeriod[], message: '12 periods generated' }

// POST /api/accounting/fiscal-periods/:id/close
// Close period (lock)
Response: { data: FiscalPeriod }

// POST /api/accounting/fiscal-periods/:id/reopen
// Reopen period (admin only)
Response: { data: FiscalPeriod }

// GET /api/accounting/fiscal-periods/current
// Get current open period
Response: { data: FiscalPeriod }
```

### Account Mapping Endpoints

```typescript
// GET /api/accounting/account-mappings
// List all mappings
Response: { data: AccountMapping[] }

// PUT /api/accounting/account-mappings
// Bulk update all mappings
Body: { mappings: { [MappingType]: accountId } }
Response: { data: AccountMapping[] }

// GET /api/accounting/account-mappings/validate
// Validate all required mappings are configured
Response: { isValid: boolean, missing: MappingType[] }
```

### Bank Reconciliation Endpoints

```typescript
// GET /api/accounting/reconciliations
// List reconciliations
Query params: accountId, fiscalPeriodId, status
Response: { data: BankReconciliation[], meta: { total, page, limit } }

// GET /api/accounting/reconciliations/:id
// Get reconciliation with details
Response: { data: BankReconciliation (with transactions) }

// POST /api/accounting/reconciliations
// Start new reconciliation
Body: CreateReconciliationDto
Response: { data: BankReconciliation }

// PUT /api/accounting/reconciliations/:id
// Update reconciliation
Body: UpdateReconciliationDto
Response: { data: BankReconciliation }

// POST /api/accounting/reconciliations/:id/complete
// Mark reconciliation as completed
Response: { data: BankReconciliation }

// GET /api/accounting/reconciliations/:id/transactions
// Get unreconciled transactions for account/period
Response: { data: JournalEntryLine[] (with account info) }

// POST /api/accounting/reconciliations/:id/mark-cleared
// Mark transactions as cleared
Body: { journalEntryLineIds: string[] }
Response: { success: true }

// POST /api/accounting/reconciliations/:id/unmark-cleared
// Unmark transactions
Body: { journalEntryLineIds: string[] }
Response: { success: true }
```

### Report Endpoints

```typescript
// GET /api/accounting/reports/trial-balance
// Generate Trial Balance
Query params: startDate, endDate, includeInactive
Response: {
  data: {
    accounts: { accountCode, accountName, debit, credit }[],
    totalDebit: number,
    totalCredit: number,
    isBalanced: boolean
  }
}

// GET /api/accounting/reports/balance-sheet
// Generate Balance Sheet
Query params: asOfDate, includeInactive
Response: {
  data: {
    assets: { total, current, fixed },
    liabilities: { total, current, longTerm },
    equity: { total },
    isBalanced: boolean (assets === liabilities + equity)
  }
}

// GET /api/accounting/reports/profit-loss
// Generate Profit & Loss Statement
Query params: startDate, endDate, includeInactive
Response: {
  data: {
    revenue: { total, breakdown },
    cogs: { total, breakdown },
    grossProfit: number,
    expenses: { total, breakdown },
    netIncome: number
  }
}

// GET /api/accounting/reports/general-ledger
// Generate General Ledger
Query params: accountId, startDate, endDate
Response: {
  data: {
    account: ChartOfAccounts,
    openingBalance: number,
    transactions: JournalEntryLine[],
    closingBalance: number
  }
}

// GET /api/accounting/reports/account-activity
// Generate Account Activity report
Query params: accountId, startDate, endDate
Response: {
  data: {
    account: ChartOfAccounts,
    activity: { date, entryNumber, description, debit, credit, balance }[]
  }
}

// Excel Export Endpoints
GET /api/accounting/reports/trial-balance/export
GET /api/accounting/reports/balance-sheet/export
GET /api/accounting/reports/profit-loss/export
GET /api/accounting/reports/general-ledger/export
// Returns Excel file using ExcelJS
```

### Utility Endpoints

```typescript
// POST /api/accounting/opening-balances
// Post opening balance entry (one-time setup)
Body: {
  asOfDate: Date,
  balances: { accountId: string, amount: number }[]
}
Response: { data: JournalEntry }

// GET /api/accounting/account-balances
// Get current balances for all accounts
Response: {
  data: { accountId, accountCode, accountName, balance }[]
}

// GET /api/accounting/dashboard
// Accounting dashboard summary
Response: {
  data: {
    totalAssets: number,
    totalLiabilities: number,
    totalEquity: number,
    currentPeriodRevenue: number,
    currentPeriodExpenses: number,
    netIncome: number,
    arBalance: number,
    apBalance: number,
    cashBalance: number,
    recentEntries: JournalEntry[]
  }
}

// GET /api/accounting
// Module info
Response: {
  message: 'Accounting Module',
  version: '1.0.0',
  features: [...]
}
```

---

## Frontend Architecture

### Page Structure

```
frontend/src/pages/accounting/
├── AccountingDashboard.tsx
├── ChartOfAccountsPage.tsx
├── JournalEntriesPage.tsx
├── JournalEntryFormPage.tsx
├── JournalEntryDetailsPage.tsx
├── FiscalPeriodsPage.tsx
├── AccountMappingsPage.tsx
├── ReconciliationPage.tsx
├── ReconciliationDetailsPage.tsx
└── reports/
    ├── TrialBalancePage.tsx
    ├── BalanceSheetPage.tsx
    ├── ProfitLossPage.tsx
    ├── GeneralLedgerPage.tsx
    └── AccountActivityPage.tsx
```

### Component Structure

```
frontend/src/components/accounting/
├── AccountSelector.tsx              // Dropdown for selecting accounts
├── JournalEntryLineItems.tsx        // Line item editor (debit/credit table)
├── AccountBalanceCard.tsx           // Display account balance widget
├── FiscalPeriodSelector.tsx         // Period dropdown
├── ReconciliationTransactionList.tsx // Transaction list for reconciliation
├── AccountMappingForm.tsx           // Account mapping configuration
├── ChartOfAccountsTree.tsx          // Hierarchical account tree view
├── JournalEntryStatusChip.tsx       // Status indicator chip
└── FinancialReportTable.tsx         // Reusable report table component
```

### Redux Store Structure

```
frontend/src/store/slices/
├── chartOfAccountsSlice.ts
│   ├── State: { data: ChartOfAccounts[], loading, error, tree }
│   ├── Thunks: fetchAccounts, createAccount, updateAccount, deleteAccount, seedCOA
│
├── journalEntriesSlice.ts
│   ├── State: { data: JournalEntry[], loading, error, pagination, selectedEntry }
│   ├── Thunks: fetchEntries, createEntry, updateEntry, postEntry, reverseEntry
│
├── fiscalPeriodsSlice.ts
│   ├── State: { data: FiscalPeriod[], loading, error, currentPeriod }
│   ├── Thunks: fetchPeriods, generatePeriods, closePeriod, reopenPeriod
│
├── accountMappingsSlice.ts
│   ├── State: { data: AccountMapping[], loading, error, isValid }
│   ├── Thunks: fetchMappings, updateMappings, validateMappings
│
└── reconciliationSlice.ts
    ├── State: { data: BankReconciliation[], loading, error, currentReconciliation }
    ├── Thunks: fetchReconciliations, startReconciliation, markCleared, completeReconciliation
```

### Key Page Descriptions

#### 1. Accounting Dashboard (`/accounting`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Accounting Dashboard                                            │
├─────────────┬─────────────┬─────────────┬──────────────────────┤
│ Total Assets│Total Liab.  │Total Equity │ Current Period       │
│ $XXX,XXX    │ $XXX,XXX    │ $XXX,XXX    │ Revenue: $XXX        │
│             │             │             │ Expenses: $XXX       │
├─────────────┼─────────────┼─────────────┼──────────────────────┤
│ AR Balance  │ AP Balance  │ Cash Balance│ Net Income           │
│ $XXX,XXX    │ $XXX,XXX    │ $XXX,XXX    │ $XXX,XXX             │
└─────────────┴─────────────┴─────────────┴──────────────────────┘

Quick Actions:
[New Journal Entry] [Run Trial Balance] [Bank Reconciliation]

Recent Journal Entries:
┌──────────┬────────────┬──────────────┬────────┬────────┐
│ Entry #  │ Date       │ Description  │ Amount │ Status │
├──────────┼────────────┼──────────────┼────────┼────────┤
│ JE-001   │ 2026-02-01 │ Sales Order  │ $1,500 │ Posted │
│ JE-002   │ 2026-02-01 │ Payment Rcvd │ $1,000 │ Posted │
└──────────┴────────────┴──────────────┴────────┴────────┘
```

**Features:**
- Summary cards showing key financial metrics
- Quick action buttons for common tasks
- Recent journal entries table (last 10 entries)
- Drill-down links to detailed reports

#### 2. Chart of Accounts Page (`/accounting/chart-of-accounts`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Chart of Accounts                [Seed Default COA] [+ New]     │
├─────────────────────────────────────────────────────────────────┤
│ Filter: [All Types ▼] [Active ▼]  Search: [________]           │
├──────┬───────────────────────┬──────────┬──────────┬───────────┤
│ Code │ Account Name          │ Type     │ Balance  │ Actions   │
├──────┼───────────────────────┼──────────┼──────────┼───────────┤
│ 1000 │ Cash in Hand          │ Asset    │ $50,000  │ [Edit][•••]│
│ 1200 │ Accounts Receivable   │ Asset    │ $25,000  │ [Edit][•••]│
│ 1500 │ Inventory Asset       │ Asset    │ $75,000  │ [Edit][•••]│
│ 2000 │ Accounts Payable      │ Liability│ $15,000  │ [Edit][•••]│
│ 4000 │ Sales Revenue         │ Revenue  │ $120,000 │ [Edit][•••]│
│ 5000 │ Cost of Goods Sold    │ COGS     │ $60,000  │ [Edit][•••]│
└──────┴───────────────────────┴──────────┴──────────┴───────────┘
```

**Features:**
- Table view with sorting and filtering
- "Seed Default COA" button (one-time setup)
- Create new account dialog
- Edit account dialog
- Cannot delete accounts with transactions
- Color-coded account types

#### 3. Journal Entries Page (`/accounting/journal-entries`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Journal Entries                               [+ New Entry]     │
├─────────────────────────────────────────────────────────────────┤
│ Filters:                                                        │
│ Date Range: [2026-01-01] to [2026-02-02]                      │
│ Type: [All ▼] Status: [All ▼] Period: [Current ▼]            │
├──────────┬──────┬──────┬────────────────┬────────┬────────────┤
│ Entry #  │ Date │ Type │ Description    │ Amount │ Status     │
├──────────┼──────┼──────┼────────────────┼────────┼────────────┤
│ JE-2026- │02/01 │ Auto │ Sales Order    │ $3,000 │ 🟢 Posted  │
│ 001      │      │Sales │ SO-001         │        │            │
├──────────┼──────┼──────┼────────────────┼────────┼────────────┤
│ JE-2026- │02/01 │ Auto │ Payment Rcvd   │ $2,000 │ 🟢 Posted  │
│ 002      │      │Pay   │ PAY-001        │        │            │
├──────────┼──────┼──────┼────────────────┼────────┼────────────┤
│ JE-2026- │02/02 │Manual│ Month-end      │ $500   │ 🟡 Draft   │
│ 003      │      │      │ adjustment     │        │            │
└──────────┴──────┴──────┴────────────────┴────────┴────────────┘
```

**Features:**
- List view with comprehensive filters
- Color-coded status chips (Draft=yellow, Posted=green, Reversed=red)
- Click row to view details
- Actions: View, Edit (draft only), Post, Reverse

#### 4. Journal Entry Form (`/accounting/journal-entries/new`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ New Journal Entry                                [Cancel] [Save]│
├─────────────────────────────────────────────────────────────────┤
│ Entry Date: [2026-02-02 📅]                                    │
│ Description: [_______________________________________]          │
│                                                                 │
│ Line Items:                                       [+ Add Line]  │
├────────┬────────────────────────┬─────────┬─────────┬─────────┤
│ Account│ Description            │ Debit   │ Credit  │ Actions │
├────────┼────────────────────────┼─────────┼─────────┼─────────┤
│[Select]│[___________________]   │[$_____] │[$_____] │ [Remove]│
│[Select]│[___________________]   │[$_____] │[$_____] │ [Remove]│
└────────┴────────────────────────┴─────────┴─────────┴─────────┘
│                                                                 │
│ Totals:                 Debit: $XXX    Credit: $XXX            │
│ Difference: $XXX (must be $0 to post)                          │
│                                                                 │
│ [Save as Draft]  [Post Entry]                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Date picker for entry date
- Dynamic line items table (add/remove rows)
- Account selector with search
- Real-time debit/credit balance calculation
- Validation: Cannot post unless balanced
- Save as draft or post immediately

#### 5. Fiscal Periods Page (`/accounting/fiscal-periods`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Fiscal Periods                          [Generate Periods]     │
├─────────────────────────────────────────────────────────────────┤
│ Generate periods for year: [2026 ▼] [Generate]                │
├────────────┬────────────┬──────────┬──────────┬────────────────┤
│ Period     │ Start Date │ End Date │ Status   │ Actions        │
├────────────┼────────────┼──────────┼──────────┼────────────────┤
│ Jan 2026   │ 2026-01-01 │2026-01-31│🔒 Closed │ [Reopen]       │
│ Feb 2026   │ 2026-02-01 │2026-02-29│🟢 Open   │ [Close Period] │
│ Mar 2026   │ 2026-03-01 │2026-03-31│🟢 Open   │ [Close Period] │
│ Apr 2026   │ 2026-04-01 │2026-04-30│🟢 Open   │ [Close Period] │
└────────────┴────────────┴──────────┴──────────┴────────────────┘
```

**Features:**
- Generate 12 periods for selected year
- Visual status indicators (Open=green, Closed=lock icon)
- Close period confirmation dialog
- Reopen period (admin only) with warning
- Show who closed and when

#### 6. Account Mappings Page (`/settings/account-mappings`)

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Account Mappings                                                │
├─────────────────────────────────────────────────────────────────┤
│ Configure which GL accounts to use for automatic posting:      │
│                                                                 │
│ Sales Transactions:                                             │
│   Sales Revenue Account:      [4000 - Sales Revenue      ▼]    │
│   Accounts Receivable:        [1200 - AR                 ▼]    │
│   Cost of Goods Sold:         [5000 - COGS               ▼]    │
│   Inventory Asset:            [1500 - Inventory Asset    ▼]    │
│                                                                 │
│ Purchase Transactions:                                          │
│   Inventory Asset:            [1500 - Inventory Asset    ▼]    │
│   Accounts Payable:           [2000 - AP                 ▼]    │
│                                                                 │
│ Payment Transactions:                                           │
│   Cash Account:               [1000 - Cash in Hand       ▼]    │
│   AR Reduction:               [1200 - AR                 ▼]    │
│   AP Reduction:               [2000 - AP                 ▼]    │
│                                                                 │
│ Inventory Adjustments:                                          │
│   Inventory Asset:            [1500 - Inventory Asset    ▼]    │
│   Adjustment Gain:            [4900 - Other Income       ▼]    │
│   Adjustment Loss:            [6500 - Adjustment Loss    ▼]    │
│                                                                 │
│                                      [Cancel] [Save Mappings]  │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Organized by transaction type
- Account dropdowns with code and name
- Validation: All required mappings must be set
- Save all mappings at once (bulk update)

#### 7. Bank Reconciliation Page (`/accounting/reconciliation`)

**List View:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Bank Reconciliations                   [+ New Reconciliation]  │
├────────┬───────────┬────────────┬─────────────┬───────────────┤
│ Account│ Period    │ Statement  │ Difference  │ Status        │
│        │           │ Date       │             │               │
├────────┼───────────┼────────────┼─────────────┼───────────────┤
│ Cash   │ Jan 2026  │ 2026-01-31 │ $0.00       │ ✅ Completed  │
│ Bank   │ Jan 2026  │ 2026-01-31 │ $0.00       │ ✅ Completed  │
│ Cash   │ Feb 2026  │ 2026-02-28 │ $250.00     │ 🔄 In Progress│
└────────┴───────────┴────────────┴─────────────┴───────────────┘
```

**Reconciliation Workflow (`/accounting/reconciliation/:id`):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Bank Reconciliation - Cash in Hand - February 2026             │
├─────────────────────────────────────────────────────────────────┤
│ Statement Date: [2026-02-28 📅]                                │
│ Statement Balance: [$50,250.00]                                │
│                                                                 │
│ Book Balance: $50,000.00                                       │
│ Difference: $250.00 ⚠️                                          │
│                                                                 │
│ Unreconciled Transactions:                                      │
├──────┬──────────┬─────────────────┬────────┬────────┬────────┤
│ ✓    │ Date     │ Entry / Desc    │ Debit  │ Credit │ Balance│
├──────┼──────────┼─────────────────┼────────┼────────┼────────┤
│ ☐    │ 02/01    │ JE-001 Payment  │ $1,000 │        │$51,000 │
│ ☑    │ 02/05    │ JE-005 Payment  │ $500   │        │$51,500 │
│ ☐    │ 02/10    │ JE-010 Expense  │        │ $750   │$50,750 │
│ ☑    │ 02/15    │ JE-015 Payment  │ $1,250 │        │$52,000 │
└──────┴──────────┴─────────────────┴────────┴────────┴────────┘
│                                                                 │
│ Cleared transactions: $1,750  |  Uncleared: $1,750            │
│                                                                 │
│                    [Mark Selected as Cleared] [Complete]       │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Select account and period
- Enter statement date and balance
- List of unreconciled transactions
- Checkbox to mark as cleared
- Real-time balance calculation
- Complete when difference = $0

#### 8. Financial Reports

**Trial Balance (`/accounting/reports/trial-balance`):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Trial Balance                                     [Export Excel]│
├─────────────────────────────────────────────────────────────────┤
│ Period: [2026-01-01] to [2026-02-02]                           │
│                                                                 │
├───────┬────────────────────────┬────────────┬──────────────────┤
│ Code  │ Account Name           │ Debit      │ Credit           │
├───────┼────────────────────────┼────────────┼──────────────────┤
│ 1000  │ Cash in Hand           │ $50,000.00 │                  │
│ 1200  │ Accounts Receivable    │ $25,000.00 │                  │
│ 1500  │ Inventory Asset        │ $75,000.00 │                  │
│ 2000  │ Accounts Payable       │            │ $15,000.00       │
│ 3000  │ Owner's Equity         │            │ $100,000.00      │
│ 4000  │ Sales Revenue          │            │ $120,000.00      │
│ 5000  │ Cost of Goods Sold     │ $60,000.00 │                  │
│ 6000  │ Operating Expenses     │ $25,000.00 │                  │
├───────┴────────────────────────┼────────────┼──────────────────┤
│ TOTAL                          │ $235,000   │ $235,000         │
└────────────────────────────────┴────────────┴──────────────────┘
│ ✅ Trial Balance is balanced                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Balance Sheet (`/accounting/reports/balance-sheet`):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Balance Sheet                                   [Export Excel]  │
├─────────────────────────────────────────────────────────────────┤
│ As of: [2026-02-02 📅]                                         │
│                                                                 │
│ ASSETS                                                          │
│   Current Assets:                                               │
│     Cash in Hand                           $50,000              │
│     Accounts Receivable                    $25,000              │
│     Inventory Asset                        $75,000              │
│   Total Current Assets                               $150,000   │
│                                                                 │
│   Fixed Assets:                                                 │
│     Fixed Assets                           $50,000              │
│   Total Fixed Assets                                 $50,000    │
│                                                                 │
│ TOTAL ASSETS                                         $200,000   │
│                                                                 │
│ LIABILITIES                                                     │
│   Current Liabilities:                                          │
│     Accounts Payable                       $15,000              │
│   Total Current Liabilities                          $15,000    │
│                                                                 │
│ TOTAL LIABILITIES                                    $15,000    │
│                                                                 │
│ EQUITY                                                          │
│   Owner's Equity                           $100,000             │
│   Retained Earnings                        $85,000              │
│ TOTAL EQUITY                                         $185,000   │
│                                                                 │
│ TOTAL LIABILITIES + EQUITY                           $200,000   │
│                                                                 │
│ ✅ Balance Sheet balances (Assets = Liabilities + Equity)      │
└─────────────────────────────────────────────────────────────────┘
```

**Profit & Loss (`/accounting/reports/profit-loss`):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Profit & Loss Statement                         [Export Excel]  │
├─────────────────────────────────────────────────────────────────┤
│ Period: [2026-01-01] to [2026-02-02]                           │
│                                                                 │
│ REVENUE                                                         │
│   Sales Revenue                            $120,000             │
│   Service Revenue                          $10,000              │
│ TOTAL REVENUE                                        $130,000   │
│                                                                 │
│ COST OF GOODS SOLD                                              │
│   Cost of Goods Sold                       $60,000              │
│   Freight In                               $2,000               │
│ TOTAL COGS                                           $62,000    │
│                                                                 │
│ GROSS PROFIT                                         $68,000    │
│                                                                 │
│ OPERATING EXPENSES                                              │
│   Salaries and Wages                       $15,000              │
│   Rent Expense                             $5,000               │
│   Utilities Expense                        $2,000               │
│   Office Supplies                          $1,000               │
│   Other Expenses                           $2,000               │
│ TOTAL OPERATING EXPENSES                             $25,000    │
│                                                                 │
│ NET INCOME                                           $43,000    │
└─────────────────────────────────────────────────────────────────┘
```

### Navigation Structure

Add to sidebar:
```
📊 Accounting
  ├── Dashboard
  ├── Chart of Accounts
  ├── Journal Entries
  ├── Fiscal Periods
  ├── Bank Reconciliation
  └── Reports ▼
      ├── Trial Balance
      ├── Balance Sheet
      ├── Profit & Loss
      └── General Ledger

⚙️ Settings
  ├── Company Settings (existing)
  ├── Print Settings (existing)
  ├── Price Lists (existing)
  └── Account Mappings (NEW)
```

### Routes

```typescript
// frontend/src/App.tsx
<Route path="/accounting" element={<AccountingDashboard />} />
<Route path="/accounting/chart-of-accounts" element={<ChartOfAccountsPage />} />
<Route path="/accounting/journal-entries" element={<JournalEntriesPage />} />
<Route path="/accounting/journal-entries/new" element={<JournalEntryFormPage />} />
<Route path="/accounting/journal-entries/:id" element={<JournalEntryDetailsPage />} />
<Route path="/accounting/fiscal-periods" element={<FiscalPeriodsPage />} />
<Route path="/accounting/reconciliation" element={<ReconciliationPage />} />
<Route path="/accounting/reconciliation/:id" element={<ReconciliationDetailsPage />} />
<Route path="/accounting/reports/trial-balance" element={<TrialBalancePage />} />
<Route path="/accounting/reports/balance-sheet" element={<BalanceSheetPage />} />
<Route path="/accounting/reports/profit-loss" element={<ProfitLossPage />} />
<Route path="/accounting/reports/general-ledger" element={<GeneralLedgerPage />} />
<Route path="/settings/account-mappings" element={<AccountMappingsPage />} />
```

---

## Integration Requirements

### Changes to Existing Modules

#### 1. Sales Module

**File:** `backend/src/modules/sales/services/sales-order.service.ts`

**Changes:**
```typescript
import { AccountingService } from '../../accounting/services/accounting.service';

@Injectable()
export class SalesOrderService {
  constructor(
    // ... existing dependencies
    private readonly accountingService: AccountingService, // NEW
  ) {}

  async fulfill(id: string, userId: string): Promise<SalesOrder> {
    // Existing fulfillment logic
    const order = await this.markAsFulfilled(id, userId);
    await this.createStockMovements(order);

    // NEW: Post to accounting
    try {
      await this.accountingService.postSalesOrderEntry(order, userId);
    } catch (error) {
      this.logger.error(`Failed to post sales order ${id} to accounting`, error);
    }

    return order;
  }

  async unfulfill(id: string, userId: string): Promise<SalesOrder> {
    // Existing unfulfillment logic
    const order = await this.markAsUnfulfilled(id, userId);
    await this.reverseStockMovements(order);

    // NEW: Reverse accounting entry
    try {
      await this.accountingService.reverseSalesOrderEntry(order, userId);
    } catch (error) {
      this.logger.error(`Failed to reverse sales order ${id} in accounting`, error);
    }

    return order;
  }
}
```

**Module Import:**
```typescript
// backend/src/modules/sales/sales.module.ts
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    // ... existing imports
    AccountingModule, // NEW
  ],
  // ...
})
export class SalesModule {}
```

**File:** `backend/src/modules/sales/services/payment.service.ts`

**Changes:**
```typescript
async create(dto: CreatePaymentDto, userId: string): Promise<Payment> {
  // Existing payment creation
  const payment = await this.createPayment(dto, userId);

  // NEW: Post to accounting
  try {
    await this.accountingService.postCustomerPaymentEntry(payment, userId);
  } catch (error) {
    this.logger.error(`Failed to post payment ${payment.id} to accounting`, error);
  }

  return payment;
}
```

#### 2. Purchasing Module

**File:** `backend/src/modules/purchasing/services/goods-received-note.service.ts`

**Changes:**
```typescript
import { AccountingService } from '../../accounting/services/accounting.service';

@Injectable()
export class GoodsReceivedNoteService {
  constructor(
    // ... existing dependencies
    private readonly accountingService: AccountingService, // NEW
  ) {}

  async create(dto: CreateGoodsReceivedNoteDto, userId: string): Promise<GoodsReceivedNote> {
    // Existing GRN creation
    const grn = await this.createGRN(dto, userId);
    await this.updateInventory(grn);

    // NEW: Post to accounting
    try {
      await this.accountingService.postGoodsReceivedEntry(grn, userId);
    } catch (error) {
      this.logger.error(`Failed to post GRN ${grn.id} to accounting`, error);
    }

    return grn;
  }
}
```

**Module Import:**
```typescript
// backend/src/modules/purchasing/purchasing.module.ts
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    // ... existing imports
    AccountingModule, // NEW
  ],
  // ...
})
export class PurchasingModule {}
```

**File:** `backend/src/modules/purchasing/services/vendor-payment.service.ts`

**Changes:**
```typescript
async create(dto: CreateVendorPaymentDto, userId: string): Promise<VendorPayment> {
  // Existing vendor payment creation
  const payment = await this.createVendorPayment(dto, userId);

  // NEW: Post to accounting
  try {
    await this.accountingService.postVendorPaymentEntry(payment, userId);
  } catch (error) {
    this.logger.error(`Failed to post vendor payment ${payment.id} to accounting`, error);
  }

  return payment;
}
```

#### 3. Inventory Module

**File:** `backend/src/modules/inventory/services/stock-adjustment.service.ts`

**Changes:**
```typescript
import { AccountingService } from '../../accounting/services/accounting.service';

@Injectable()
export class StockAdjustmentService {
  constructor(
    // ... existing dependencies
    private readonly accountingService: AccountingService, // NEW
  ) {}

  async complete(id: string, userId: string): Promise<StockAdjustment> {
    // Existing completion logic
    const adjustment = await this.markAsCompleted(id, userId);
    await this.createStockMovements(adjustment);

    // NEW: Post to accounting
    try {
      await this.accountingService.postStockAdjustmentEntry(adjustment, userId);
    } catch (error) {
      this.logger.error(`Failed to post stock adjustment ${id} to accounting`, error);
    }

    return adjustment;
  }
}
```

**Module Import:**
```typescript
// backend/src/modules/inventory/inventory.module.ts
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    // ... existing imports
    AccountingModule, // NEW
  ],
  // ...
})
export class InventoryModule {}
```

### Optional: Two-Way Linking

Add `journalEntryId` field to existing entities for easy reference:

**Migrations:**
```typescript
// Add column to existing tables
ALTER TABLE sales_orders ADD COLUMN journal_entry_id UUID NULL;
ALTER TABLE invoices ADD COLUMN journal_entry_id UUID NULL;
ALTER TABLE payments ADD COLUMN journal_entry_id UUID NULL;
ALTER TABLE purchase_orders ADD COLUMN journal_entry_id UUID NULL;
ALTER TABLE goods_received_notes ADD COLUMN journal_entry_id UUID NULL;
ALTER TABLE vendor_payments ADD COLUMN journal_entry_id UUID NULL;
ALTER TABLE stock_adjustments ADD COLUMN journal_entry_id UUID NULL;
```

**Entity Updates (optional):**
```typescript
// In SalesOrder entity
@Column({ type: 'uuid', nullable: true })
journalEntryId?: string;
```

**AccountingService Update:**
```typescript
async postSalesOrderEntry(salesOrder: SalesOrder, userId: string): Promise<JournalEntry> {
  const entry = await this.createAndPostEntry(...);

  // Update sales order with journal entry reference
  await this.salesOrderRepository.update(salesOrder.id, {
    journalEntryId: entry.id,
  });

  return entry;
}
```

**Benefits:**
- "View Accounting Entry" button on transaction detail pages
- Easy audit trail from business transaction to accounting
- Implement in Phase 2 (not Phase 1)

---

## Phased Implementation Plan

### Phase 1: Foundation & Core Accounting (2 weeks)

**Goal:** Basic double-entry accounting infrastructure

**Backend Tasks:**
1. Create database entities (7 entities)
2. Create database migrations
3. Implement ChartOfAccountsService (CRUD, hierarchy, seed)
4. Implement FiscalPeriodService (CRUD, generate, close/reopen)
5. Implement JournalEntryService (CRUD, posting, validation)
6. Implement AccountingService skeleton (methods stubbed)
7. Create all controllers with basic endpoints
8. Write unit tests for services (30+ tests)

**Frontend Tasks:**
1. Create Redux slices (chartOfAccounts, journalEntries, fiscalPeriods)
2. Build Chart of Accounts page (list, create, edit, seed)
3. Build Fiscal Periods page (list, generate, close/reopen)
4. Build Journal Entries list page
5. Build Journal Entry form page (manual entries)
6. Build Journal Entry details page
7. Add navigation menu items
8. Write component tests (15+ tests)

**Deliverables:**
- ✅ Manual journal entries working end-to-end
- ✅ Chart of accounts seeded and manageable
- ✅ Fiscal periods created and closeable
- ✅ No auto-posting yet (manual only)

**Testing:**
- Create manual journal entry
- Verify debits = credits validation
- Post entry and verify status changes
- Close period and verify cannot post
- Seed COA and verify 20+ accounts created

---

### Phase 2: Auto-Posting Integration (2 weeks)

**Goal:** Connect existing modules with automatic journal entries

**Backend Tasks:**
1. Create AccountMapping entity and service
2. Implement auto-posting methods in AccountingService:
   - postSalesOrderEntry()
   - postCustomerPaymentEntry()
   - postGoodsReceivedEntry()
   - postVendorPaymentEntry()
   - postStockAdjustmentEntry()
3. Update SalesOrderService.fulfill()
4. Update PaymentService.create()
5. Update GoodsReceivedNoteService.create()
6. Update VendorPaymentService.create()
7. Update StockAdjustmentService.complete()
8. Add period locking enforcement
9. Write integration tests (20+ tests)

**Frontend Tasks:**
1. Create accountMappings Redux slice
2. Build Account Mappings page (settings)
3. Add "View Accounting Entry" links to transaction pages
4. Display auto-posted entries in Journal Entries list
5. Add validation warnings if mappings not configured
6. Write integration tests (10+ tests)

**Deliverables:**
- ✅ All sales transactions auto-post
- ✅ All purchase transactions auto-post
- ✅ All payment transactions auto-post
- ✅ All inventory adjustments auto-post
- ✅ Account mappings configurable
- ✅ Period locking enforced

**Testing:**
- Fulfill sales order → verify journal entry created
- Receive payment → verify journal entry created
- Receive goods → verify journal entry created
- Complete stock adjustment → verify journal entry created
- Attempt to post to closed period → verify error

---

### Phase 3: Financial Reports (2 weeks)

**Goal:** Generate core financial statements

**Backend Tasks:**
1. Implement AccountingReportsService
2. Build Trial Balance calculation logic
3. Build Balance Sheet calculation logic
4. Build Profit & Loss calculation logic
5. Build General Ledger query logic
6. Build Account Activity query logic
7. Implement Excel export using ExcelJS
8. Create report endpoints
9. Write report tests (15+ tests)

**Frontend Tasks:**
1. Build Trial Balance report page
2. Build Balance Sheet report page
3. Build Profit & Loss report page
4. Build General Ledger report page
5. Build Account Activity report page
6. Build Accounting Dashboard with summary cards
7. Add Excel export buttons
8. Write report component tests (10+ tests)

**Deliverables:**
- ✅ Trial Balance report with validation
- ✅ Balance Sheet report with equation check
- ✅ Profit & Loss report with calculations
- ✅ General Ledger report with drill-down
- ✅ Dashboard with key metrics
- ✅ Excel exports for all reports

**Testing:**
- Generate trial balance → verify balances
- Generate balance sheet → verify equation holds
- Generate P&L → verify calculations
- Export to Excel → verify formatting
- Dashboard loads → verify summary cards

---

### Phase 4: Bank Reconciliation (2 weeks)

**Goal:** Bank reconciliation workflow

**Backend Tasks:**
1. Create BankReconciliation and ReconciledTransaction entities
2. Implement ReconciliationService
3. Start reconciliation logic
4. Mark transactions as cleared logic
5. Calculate differences logic
6. Complete reconciliation logic
7. Reconciliation history queries
8. Write reconciliation tests (15+ tests)

**Frontend Tasks:**
1. Create reconciliation Redux slice
2. Build Reconciliation list page
3. Build Reconciliation workflow page
4. Build transaction selection UI
5. Add cleared/uncleared indicators
6. Add balance calculation display
7. Write reconciliation tests (10+ tests)

**Deliverables:**
- ✅ Start bank reconciliation for account/period
- ✅ Mark transactions as cleared
- ✅ Calculate differences automatically
- ✅ Complete reconciliation when balanced
- ✅ View reconciliation history

**Testing:**
- Start reconciliation → verify setup
- Mark transactions cleared → verify calculation
- Complete reconciliation → verify status
- View history → verify past reconciliations

---

### Phase 5: Polish & Production Ready (1 week)

**Goal:** Final enhancements and production readiness

**Backend Tasks:**
1. Opening balance posting functionality
2. Reversal entry improvements
3. Advanced validations and business rules
4. Performance optimization (indexes, caching)
5. Comprehensive test coverage (80%+ goal)
6. API documentation (Swagger)

**Frontend Tasks:**
1. Advanced filters and search
2. Keyboard shortcuts for data entry
3. Bulk operations UI
4. Role-based permissions UI
5. Mobile-responsive design polish
6. Error handling improvements

**Documentation:**
1. User guide (USER_GUIDE.md)
2. Administrator guide (ADMIN_GUIDE.md)
3. Developer guide (DEVELOPER_GUIDE.md)
4. Update CLAUDE.md

**Deliverables:**
- ✅ Production-ready accounting module
- ✅ Complete documentation
- ✅ 80%+ test coverage
- ✅ Performance optimized
- ✅ User guides written

---

### Summary Timeline

| Phase | Duration | Focus | Key Deliverables |
|-------|----------|-------|------------------|
| **Phase 1** | 2 weeks | Foundation | Manual entries, COA, periods |
| **Phase 2** | 2 weeks | Integration | Auto-posting from all modules |
| **Phase 3** | 2 weeks | Reports | Financial statements, dashboard |
| **Phase 4** | 2 weeks | Reconciliation | Bank reconciliation workflow |
| **Phase 5** | 1 week | Polish | Production ready, documentation |
| **Total** | **9 weeks** | | **Full accounting module** |

---

## Testing Strategy

### Backend Testing (Jest)

#### Unit Tests

**ChartOfAccountsService (10 tests):**
- ✅ Create account with valid data
- ✅ Prevent duplicate account codes
- ✅ Create sub-account with parent
- ✅ Delete account without transactions
- ✅ Prevent deletion if account has transactions
- ✅ Build hierarchy tree correctly
- ✅ Seed default COA (20+ accounts)
- ✅ Calculate account balance correctly
- ✅ Update account details
- ✅ Deactivate account

**JournalEntryService (15 tests):**
- ✅ Create manual journal entry
- ✅ Validate debits equal credits
- ✅ Reject entry if not balanced
- ✅ Post entry (draft → posted)
- ✅ Prevent editing posted entry
- ✅ Prevent posting to closed period
- ✅ Reverse posted entry
- ✅ Calculate totals correctly
- ✅ Delete draft entry
- ✅ Prevent deletion of posted entry
- ✅ Auto-generate entry number
- ✅ Find by reference type/ID
- ✅ Update draft entry
- ✅ Query entries by date range
- ✅ Query entries by account

**FiscalPeriodService (8 tests):**
- ✅ Generate 12 periods for year
- ✅ Prevent duplicate periods
- ✅ Close period successfully
- ✅ Reopen period (admin only)
- ✅ Get current open period
- ✅ Get period by date
- ✅ Validate period status
- ✅ Track who closed period

**AccountingService (20 tests):**
- ✅ Post sales order entry with correct accounts
- ✅ Post customer payment entry
- ✅ Post goods received entry
- ✅ Post vendor payment entry
- ✅ Post stock adjustment entry (increase)
- ✅ Post stock adjustment entry (decrease)
- ✅ Handle missing account mappings
- ✅ Validate period is open before posting
- ✅ Calculate COGS correctly
- ✅ Calculate GRN total correctly
- ✅ Reverse sales order entry
- ✅ Link journal entry to source transaction
- ✅ Update account balances after posting
- ✅ Handle multiple line items
- ✅ Validate all mappings configured
- ✅ Log error if posting fails
- ✅ Continue business transaction on error
- ✅ Create correct entry descriptions
- ✅ Use correct entry types
- ✅ Handle edge cases (zero amounts, etc.)

**ReconciliationService (10 tests):**
- ✅ Start reconciliation
- ✅ Mark transaction as cleared
- ✅ Unmark transaction
- ✅ Calculate book balance
- ✅ Calculate difference
- ✅ Complete reconciliation
- ✅ Prevent completion if not balanced
- ✅ List unreconciled transactions
- ✅ Get reconciliation history
- ✅ Update reconciliation details

**AccountingReportsService (12 tests):**
- ✅ Generate trial balance
- ✅ Validate trial balance balances
- ✅ Generate balance sheet
- ✅ Validate balance sheet equation
- ✅ Generate P&L
- ✅ Calculate gross profit
- ✅ Calculate net income
- ✅ Generate general ledger
- ✅ Generate account activity
- ✅ Filter reports by date range
- ✅ Include/exclude inactive accounts
- ✅ Export to Excel (ExcelJS)

**Target:** 75+ backend unit tests

#### Integration Tests (E2E)

**Complete Workflows:**
- ✅ Seed COA → Generate periods → Create manual entry → Post entry
- ✅ Configure mappings → Fulfill sales order → Verify journal entry created
- ✅ Receive payment → Verify journal entry → Verify AR reduced
- ✅ Receive goods → Verify journal entry → Verify inventory increased
- ✅ Complete stock adjustment → Verify journal entry
- ✅ Close period → Attempt to post → Verify error
- ✅ Start reconciliation → Mark cleared → Complete → Verify status
- ✅ Generate trial balance → Verify balances
- ✅ Generate balance sheet → Verify equation
- ✅ Generate P&L → Verify calculations

**Target:** 15+ E2E tests

---

### Frontend Testing (Vitest)

#### Redux Slice Tests

**chartOfAccountsSlice (8 tests):**
- ✅ Fetch accounts
- ✅ Create account
- ✅ Update account
- ✅ Delete account
- ✅ Seed COA
- ✅ Build tree structure
- ✅ Handle loading states
- ✅ Handle errors

**journalEntriesSlice (10 tests):**
- ✅ Fetch entries
- ✅ Create entry
- ✅ Update entry
- ✅ Post entry
- ✅ Reverse entry
- ✅ Delete entry
- ✅ Filter by date
- ✅ Filter by status
- ✅ Handle pagination
- ✅ Handle errors

**fiscalPeriodsSlice (6 tests):**
- ✅ Fetch periods
- ✅ Generate periods
- ✅ Close period
- ✅ Reopen period
- ✅ Get current period
- ✅ Handle errors

**accountMappingsSlice (5 tests):**
- ✅ Fetch mappings
- ✅ Update mappings
- ✅ Validate mappings
- ✅ Handle loading
- ✅ Handle errors

**reconciliationSlice (6 tests):**
- ✅ Fetch reconciliations
- ✅ Start reconciliation
- ✅ Mark cleared
- ✅ Complete reconciliation
- ✅ Handle loading
- ✅ Handle errors

**Target:** 35+ Redux tests

#### Component Tests

**AccountSelector (3 tests):**
- ✅ Renders account options
- ✅ Filters by search
- ✅ Selects account

**JournalEntryLineItems (5 tests):**
- ✅ Renders line items
- ✅ Adds new line
- ✅ Removes line
- ✅ Calculates totals
- ✅ Validates balance

**ChartOfAccountsTree (3 tests):**
- ✅ Renders hierarchy
- ✅ Expands/collapses nodes
- ✅ Displays balances

**ReconciliationTransactionList (4 tests):**
- ✅ Renders transactions
- ✅ Marks as cleared
- ✅ Calculates balance
- ✅ Shows cleared indicator

**Target:** 15+ component tests

---

### Test Coverage Goals

| Category | Target Coverage |
|----------|----------------|
| Backend Services | 85%+ |
| Backend Controllers | 70%+ |
| Frontend Redux | 80%+ |
| Frontend Components | 75%+ |
| **Overall** | **80%+** |

---

### Validation Testing

**Critical Validations:**
- ✅ All journal entries balance (Total Debit = Total Credit)
- ✅ Trial Balance always balances
- ✅ Balance Sheet equation holds (Assets = Liabilities + Equity)
- ✅ Closed periods cannot be modified
- ✅ Account balances match journal entry totals
- ✅ Auto-posted entries have correct amounts
- ✅ Reconciliation difference calculation is accurate
- ✅ Reports show consistent data across all views

---

## Deployment & Documentation

### Pre-Deployment Checklist

**Database:**
- ✅ Run all migrations successfully
- ✅ Seed default Chart of Accounts
- ✅ Generate fiscal periods for current year
- ✅ Verify indexes created correctly
- ✅ Backup database before deployment

**Backend:**
- ✅ All tests pass (75+ unit, 15+ E2E)
- ✅ Build succeeds without errors
- ✅ Environment variables configured
- ✅ Swagger documentation complete

**Frontend:**
- ✅ All tests pass (50+ tests)
- ✅ TypeScript check passes
- ✅ Build succeeds without errors
- ✅ Production build optimized

**Configuration:**
- ✅ Configure account mappings
- ✅ Validate all required mappings set
- ✅ Set go-live date

### Deployment Steps

```bash
# 1. Database migrations
cd backend
npm run migration:run

# 2. Seed default COA
npm run seed:chart-of-accounts

# 3. Generate fiscal periods (via API or manual)
# POST /api/accounting/fiscal-periods/generate { year: 2026 }

# 4. Run tests
cd backend && npm run test
cd frontend && npm run test

# 5. Build production
cd backend && npm run build
cd frontend && npm run build

# 6. Deploy with Docker
docker compose build
docker compose up -d

# 7. Verify deployment
curl http://localhost:3001/api/accounting
curl http://localhost:3001/api/accounting/chart-of-accounts
curl http://localhost:3001/api/accounting/fiscal-periods
```

### Post-Deployment Verification

**Smoke Tests:**
1. ✅ Access `/accounting` - Dashboard loads
2. ✅ Access `/accounting/chart-of-accounts` - 20+ accounts visible
3. ✅ Access `/accounting/fiscal-periods` - 12 periods visible
4. ✅ Access `/settings/account-mappings` - Configure mappings
5. ✅ Create test sales order and fulfill - Verify journal entry auto-created
6. ✅ Create test payment - Verify journal entry auto-created
7. ✅ Run Trial Balance - Verify it balances
8. ✅ Close a period - Verify cannot post to closed period

### Default Chart of Accounts Seed

**See Implementation Plan for full seed script**

20+ default accounts covering:
- Assets: Cash, Bank, AR, Inventory, Fixed Assets
- Liabilities: AP, Accrued Expenses, Long-term Debt
- Equity: Owner's Equity, Retained Earnings, Drawings
- Revenue: Sales Revenue, Service Revenue, Other Income
- COGS: Cost of Goods Sold, Freight In
- Expenses: Salaries, Rent, Utilities, Supplies, Depreciation, etc.

### Default Account Mappings

**Required Mappings:**
- SALES_REVENUE → 4000 (Sales Revenue)
- SALES_AR → 1200 (Accounts Receivable)
- SALES_COGS → 5000 (Cost of Goods Sold)
- SALES_INVENTORY → 1500 (Inventory Asset)
- PURCHASE_INVENTORY → 1500 (Inventory Asset)
- PURCHASE_AP → 2000 (Accounts Payable)
- PAYMENT_CASH → 1000 (Cash in Hand)
- PAYMENT_AR → 1200 (Accounts Receivable)
- VENDOR_PAYMENT_CASH → 1000 (Cash in Hand)
- VENDOR_PAYMENT_AP → 2000 (Accounts Payable)
- INVENTORY_ASSET → 1500 (Inventory Asset)
- INVENTORY_ADJUSTMENT_GAIN → 4900 (Other Income)
- INVENTORY_ADJUSTMENT_LOSS → 6500 (Inventory Adjustment Loss)

### Documentation Deliverables

#### 1. User Guide (`docs/accounting/USER_GUIDE.md`)

**Contents:**
- Introduction to accounting module
- Getting Started (seed COA, generate periods, configure mappings)
- Creating Manual Journal Entries
- Understanding Auto-Posted Entries
- Running Financial Reports
- Month-End Closing Process
- Bank Reconciliation Workflow
- Troubleshooting Common Issues
- FAQ

#### 2. Administrator Guide (`docs/accounting/ADMIN_GUIDE.md`)

**Contents:**
- Initial Setup and Configuration
- Seeding Default Chart of Accounts
- Managing Fiscal Periods
- Configuring Account Mappings
- Period Closing and Reopening
- User Permissions and Roles
- Data Integrity Validation
- Backup and Recovery
- Performance Tuning

#### 3. Developer Guide (`docs/accounting/DEVELOPER_GUIDE.md`)

**Contents:**
- Accounting Module Architecture
- Database Schema Overview
- Auto-Posting Integration Points
- Adding New Account Mappings
- Creating Custom Reports
- Testing Guidelines
- Migration Guide
- API Reference (link to Swagger)
- Troubleshooting Development Issues

#### 4. CLAUDE.md Updates

Add comprehensive accounting module section to project documentation (see sample in design doc).

---

## Success Criteria

### Before Production Release

**Data Integrity:**
- ✅ All journal entries balance (Total Debit = Total Credit)
- ✅ Trial Balance always balances
- ✅ Balance Sheet equation holds (Assets = Liabilities + Equity)
- ✅ Account balances match journal entry totals
- ✅ No orphaned journal entries (all have valid periods)

**Functional Requirements:**
- ✅ Manual journal entries can be created and posted
- ✅ Sales orders auto-post on fulfillment
- ✅ Customer payments auto-post on receipt
- ✅ Goods received auto-post on GRN creation
- ✅ Vendor payments auto-post on payment creation
- ✅ Stock adjustments auto-post on completion
- ✅ Period closing prevents further posting
- ✅ Period reopening works for corrections
- ✅ Bank reconciliation workflow completes successfully
- ✅ All financial reports generate accurately

**Performance:**
- ✅ Journal entry posting < 2 seconds
- ✅ Financial reports generate < 5 seconds
- ✅ Chart of accounts loads < 1 second
- ✅ Dashboard loads < 3 seconds

**Testing:**
- ✅ 75+ backend unit tests passing
- ✅ 15+ E2E tests passing
- ✅ 50+ frontend tests passing
- ✅ 80%+ overall test coverage

**Documentation:**
- ✅ User guide complete
- ✅ Admin guide complete
- ✅ Developer guide complete
- ✅ API documentation (Swagger) complete
- ✅ CLAUDE.md updated

**Deployment:**
- ✅ Migrations run successfully
- ✅ Default COA seeded
- ✅ Fiscal periods generated
- ✅ Account mappings configured
- ✅ All smoke tests pass

---

## Risk Mitigation

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Auto-posting failure blocks business operations** | High | Log and continue pattern - business transaction succeeds, accounting issue logged for manual fix |
| **Complex reconciliation workflow confuses users** | Medium | Comprehensive user guide, tooltips, step-by-step wizard UI |
| **Performance issues with large datasets** | Medium | Proper indexes, pagination, caching, query optimization |
| **Data integrity issues (unbalanced entries)** | High | Strict validation, database constraints, automated tests |
| **Period closing errors** | Medium | Pre-close validation, clear error messages, reopen capability |

### Business Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **User unfamiliarity with accounting concepts** | Medium | User training, clear UI labels, help documentation |
| **Incorrect account mappings** | High | Validation before posting, clear mapping UI, default sensible mappings |
| **Lost historical data during migration** | Low | Fresh start approach - no historical migration needed |
| **Regulatory compliance issues** | Low | Standard double-entry accounting, audit trails, proper period locking |

---

## Conclusion

This design provides a complete, production-ready double-entry accounting module that:

✅ **Integrates seamlessly** with existing Sales, Purchasing, and Inventory modules
✅ **Automates accounting** with intelligent journal entry posting
✅ **Provides professional reports** - Trial Balance, Balance Sheet, P&L
✅ **Ensures data integrity** through validation and period locking
✅ **Supports bank reconciliation** for proper cash management
✅ **Maintains audit trails** for all financial transactions
✅ **Follows industry standards** for double-entry bookkeeping
✅ **Delivers in 9 weeks** through phased implementation

The module is architected for:
- **Simplicity** - Single currency, calendar year, core reports
- **Extensibility** - Can add multi-currency, tax, budgets later
- **Reliability** - Comprehensive testing, error handling, logging
- **Usability** - Intuitive UI, clear workflows, helpful documentation

**Ready to begin implementation!**

---

**Next Steps:**

1. **Review and Approve Design** - Stakeholder sign-off
2. **Set Up Development Environment** - Create feature branch
3. **Begin Phase 1** - Foundation & Core Accounting
4. **Follow Implementation Plan** - 9-week schedule
5. **Deploy to Production** - After all phases complete

**Questions or clarifications?** Ready to proceed with implementation planning!
