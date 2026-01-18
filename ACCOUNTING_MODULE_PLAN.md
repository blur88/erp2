# Accounting Module Implementation Plan

## Overview
Implement a comprehensive double-entry accounting system that integrates seamlessly with the existing Sales, Purchasing, and Inventory modules to provide complete financial tracking and reporting capabilities.

## Project Scope

### What We're Building
- **Chart of Accounts (COA)**: Hierarchical account structure (Assets, Liabilities, Equity, Revenue, Expenses)
- **Journal Entry System**: Manual and auto-generated double-entry bookkeeping
- **General Ledger**: Complete transaction history by account with running balances
- **Financial Reports**: Trial Balance, Income Statement, Balance Sheet, Cash Flow Statement
- **Automated Integration**: Auto-create journal entries from invoices, payments, purchase orders, vendor payments, and stock adjustments
- **Account Mappings**: Configuration system to map business transactions to GL accounts

### Key Benefits
- Complete financial audit trail for all business transactions
- Real-time financial statement generation
- Automated accounting entries reduce manual effort and errors
- Compliance-ready financial reporting
- Foundation for tax reporting and financial analysis

---

## Architecture Design

### Database Entities (6 new tables)

1. **accounts** - Chart of Accounts
   - Fields: accountCode, accountName, accountType, accountSubType, parentAccountId, currentBalance, openingBalance, isSystemAccount, allowJournalEntries
   - Relationships: Self-referencing parent-child hierarchy
   - Indexes: accountCode (unique), accountType, parentAccountId

2. **fiscal_periods** - Financial periods (monthly/quarterly)
   - Fields: fiscalYear, periodNumber, periodName, startDate, endDate, status (open/closed/locked)
   - Indexes: (fiscalYear, periodNumber) unique, status, date range

3. **journal_entries** - Transaction headers
   - Fields: journalNumber, entryDate, status (draft/posted/reversed), entryType, description, totalDebit, totalCredit, fiscalPeriodId, referenceType, referenceId
   - Relationships: Lines (one-to-many), FiscalPeriod (many-to-one), Reversal tracking
   - Indexes: journalNumber (unique), status, entryType, entryDate, fiscalPeriodId, (referenceType, referenceId)

4. **journal_entry_lines** - Transaction line items
   - Fields: journalEntryId, accountId, lineNumber, description, debitAmount, creditAmount, entityType, entityId, entityName
   - Relationships: JournalEntry (many-to-one), Account (many-to-one)
   - Indexes: journalEntryId, accountId

5. **account_mappings** - Integration configuration
   - Fields: mappingType (revenue_by_category, cogs_by_category, ar, ap, cash, etc.), entityId (categoryId for category mappings), accountId, isDefault
   - Relationships: Account (many-to-one)
   - Indexes: (mappingType, entityId) unique, accountId

6. **accounting_settings** - Global configuration
   - Fields: enableAutoJournalEntries, fiscalYearStartMonth, fiscalPeriodType, baseCurrency, retainedEarningsAccountId

### Service Layer (7 new services)

1. **ChartOfAccountsService**
   - CRUD operations for accounts
   - Hierarchical tree operations
   - Balance updates and recalculations
   - Default chart of accounts setup

2. **JournalEntryService**
   - Create/update/delete journal entries
   - Post/unpost/reverse operations
   - Validation (balanced entries, period status)
   - Auto-generation from business transactions

3. **GeneralLedgerService**
   - Account ledger queries with date ranges
   - Balance calculations (current and as-of-date)
   - Trial balance generation
   - Period close/reopen operations

4. **FinancialReportService**
   - Trial Balance report
   - Income Statement (P&L) report
   - Balance Sheet report
   - Cash Flow Statement (indirect method)
   - Excel/PDF export functionality

5. **AccountingIntegrationService**
   - Event handlers for business transactions
   - Auto-create journal entries for:
     - Invoice creation → AR debit, Revenue credit
     - Payment receipt → Cash debit, AR credit
     - Purchase order receipt → Inventory debit, AP credit
     - Vendor payment → AP debit, Cash credit
     - Stock adjustment → Inventory debit/credit

6. **FiscalPeriodService**
   - Period CRUD operations
   - Find current period
   - Generate periods for fiscal year
   - Close/reopen period validation

7. **AccountMappingService**
   - Configure account mappings
   - Retrieve accounts for auto-entry generation
   - Default mapping management

### Integration Points

#### Sales Module Modifications
- **InvoiceService.create()**: Call `accountingIntegrationService.onInvoiceCreated()`
- **PaymentService.create()**: Call `accountingIntegrationService.onPaymentReceived()`
- Journal entries track customer AR and revenue by product category

#### Purchasing Module Modifications
- **PurchaseOrderService.receiveGoods()**: Call `accountingIntegrationService.onPurchaseOrderReceived()`
- **VendorPaymentService.create()**: Call `accountingIntegrationService.onVendorPaymentMade()`
- Journal entries track supplier AP and inventory cost

#### Inventory Module Modifications
- **StockAdjustmentService.create()**: Call `accountingIntegrationService.onStockAdjustment()`
- Journal entries track inventory value adjustments

#### Settings Module Extension
- Add accounting settings to SettingsService
- Document number generation for journal entries (JE-000001 format)

### Frontend Structure

#### Redux State (`accountingSlice.ts`)
```typescript
{
  accounts: { data: Account[], tree: Account[], loading, error },
  journalEntries: { data: JournalEntry[], pagination, loading, error },
  fiscalPeriods: { data: FiscalPeriod[], current, loading, error },
  accountMappings: { data: AccountMapping[], loading, error },
  reports: { trialBalance, incomeStatement, balanceSheet, cashFlow, loading, error }
}
```

#### Pages (9 new pages)
1. `/accounting` - Dashboard with AR/AP/Cash metrics
2. `/accounting/chart-of-accounts` - Tree view with CRUD
3. `/accounting/journal-entries` - List with filters and actions
4. `/accounting/journal-entries/create` - Multi-line entry form
5. `/accounting/reports/trial-balance` - Trial balance report
6. `/accounting/reports/income-statement` - P&L report
7. `/accounting/reports/balance-sheet` - Balance sheet report
8. `/accounting/reports/cash-flow` - Cash flow statement
9. `/accounting/account-mappings` - Configuration interface
10. `/accounting/fiscal-periods` - Period management

#### Components (5 new components)
1. `AccountSelector` - Autocomplete dropdown for account selection
2. `AccountTreeView` - Hierarchical tree with expand/collapse
3. `JournalEntryLineEditor` - Dynamic line item editor with debit/credit validation
4. `FinancialStatementTable` - Reusable table for financial reports
5. `AccountMappingForm` - Mapping configuration form

---

## Implementation Phases

### Phase 1: Backend Foundation (Week 1)
**Goal**: Create database schema and core accounting services

#### Tasks:
1. Create entity files (6 entities)
   - `/backend/src/database/entities/account.entity.ts`
   - `/backend/src/database/entities/fiscal-period.entity.ts`
   - `/backend/src/database/entities/journal-entry.entity.ts`
   - `/backend/src/database/entities/journal-entry-line.entity.ts`
   - `/backend/src/database/entities/account-mapping.entity.ts`
   - `/backend/src/database/entities/accounting-settings.entity.ts`

2. Generate and run database migration
   ```bash
   cd backend
   npm run migration:generate --name=CreateAccountingModule
   npm run migration:run
   ```

3. Create accounting module structure
   - `/backend/src/modules/accounting/accounting.module.ts`
   - Create services/, controllers/, dto/ directories

4. Implement ChartOfAccountsService
   - CRUD operations
   - Tree structure methods
   - Balance calculations
   - Default COA setup (20+ accounts)

5. Implement FiscalPeriodService
   - Period management
   - Current period lookup
   - Auto-generate periods for year

6. Create DTOs
   - `/backend/src/modules/accounting/dto/create-account.dto.ts`
   - `/backend/src/modules/accounting/dto/update-account.dto.ts`
   - `/backend/src/modules/accounting/dto/query-accounts.dto.ts`
   - `/backend/src/modules/accounting/dto/create-fiscal-period.dto.ts`

7. Create controllers
   - `/backend/src/modules/accounting/controllers/chart-of-accounts.controller.ts`
   - `/backend/src/modules/accounting/controllers/fiscal-period.controller.ts`

8. Register AccountingModule in `app.module.ts`

**Deliverables**: Database tables created, COA service functional, API endpoints available

---

### Phase 2: Journal Entry System (Week 2)
**Goal**: Implement core double-entry bookkeeping functionality

#### Tasks:
1. Implement JournalEntryService
   - Create/update/delete methods
   - Post/unpost operations
   - Reversal logic
   - Balance validation (debits = credits)

2. Implement GeneralLedgerService
   - Account ledger queries
   - Balance calculations
   - Trial balance generation

3. Create journal entry DTOs
   - `/backend/src/modules/accounting/dto/create-journal-entry.dto.ts`
   - `/backend/src/modules/accounting/dto/create-journal-entry-line.dto.ts`
   - `/backend/src/modules/accounting/dto/query-journal-entries.dto.ts`

4. Create JournalEntryController
   - `/backend/src/modules/accounting/controllers/journal-entry.controller.ts`
   - Endpoints: CRUD, post, unpost, reverse

5. Add document numbering to SettingsService
   - Extend `generateDocumentNumber()` to support 'JE' prefix

6. Create AccountMappingService
   - CRUD operations for mappings
   - Default mapping logic

7. Create AccountMappingController
   - `/backend/src/modules/accounting/controllers/account-mapping.controller.ts`

**Deliverables**: Manual journal entry creation fully functional, posting/reversing works

---

### Phase 3: Automated Integration (Week 3)
**Goal**: Auto-generate journal entries from business transactions

#### Tasks:
1. Implement AccountingIntegrationService
   - `/backend/src/modules/accounting/services/accounting-integration.service.ts`
   - Methods: onInvoiceCreated, onPaymentReceived, onPurchaseOrderReceived, onVendorPaymentMade, onStockAdjustment
   - Account mapping lookups
   - Entry generation logic

2. Modify InvoiceService
   - Add accounting integration hook in `create()` method
   - Journal entry: DR AR, CR Revenue (by category)
   - Error handling (don't fail invoice if accounting fails)

3. Modify PaymentService
   - Add accounting integration hook in `create()` method
   - Journal entry: DR Cash, CR AR

4. Modify PurchaseOrderService
   - Add accounting integration hook in `receiveGoods()` method
   - Journal entry: DR Inventory, CR AP

5. Modify VendorPaymentService
   - Add accounting integration hook in `create()` method
   - Journal entry: DR AP, CR Cash

6. Modify StockAdjustmentService
   - Add accounting integration hook in `create()` method
   - Journal entry: DR/CR Inventory

7. Add AccountingSettings to SettingsService
   - Extend settings entity with accounting config
   - `enableAutoJournalEntries` flag

8. Create default account mappings
   - Setup service to create default mappings on first run
   - Map categories to revenue/COGS accounts
   - Map payment methods to cash/bank accounts

**Deliverables**: All business transactions auto-create journal entries when enabled

---

### Phase 4: Financial Reporting (Week 4)
**Goal**: Generate financial statements

#### Tasks:
1. Implement FinancialReportService
   - `/backend/src/modules/accounting/services/financial-report.service.ts`
   - Trial Balance: List all accounts with debit/credit balances
   - Income Statement: Revenue - Expenses = Net Income
   - Balance Sheet: Assets = Liabilities + Equity
   - Cash Flow Statement: Operating/Investing/Financing activities

2. Create report DTOs
   - `/backend/src/modules/accounting/dto/report-params.dto.ts`
   - Support date ranges and fiscal period selection

3. Create FinancialReportsController
   - `/backend/src/modules/accounting/controllers/financial-reports.controller.ts`
   - Endpoints: trial-balance, income-statement, balance-sheet, cash-flow

4. Implement Excel export
   - Use ExcelJS (already in project)
   - Apply consistent formatting (like existing reports)
   - Subtotals and grand totals

5. Implement PDF export
   - Use jsPDF (already in project)
   - Table formatting for statements

**Deliverables**: All 4 financial reports generate correctly with export capability

---

### Phase 5: Frontend Implementation (Week 5-6)
**Goal**: Build user interface for accounting module

#### Week 5 Tasks:
1. Create Redux slice
   - `/frontend/src/store/slices/accountingSlice.ts`
   - Async thunks for all accounting operations
   - Selectors for state access

2. Create API service
   - `/frontend/src/services/accountingApi.ts`
   - Methods for all endpoints

3. Create Chart of Accounts page
   - `/frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
   - Tree view with expand/collapse
   - Create/edit/delete accounts
   - Show current balances

4. Create AccountTreeView component
   - `/frontend/src/components/accounting/AccountTreeView.tsx`
   - Hierarchical display
   - Click to expand/collapse
   - Icons for account types

5. Create AccountSelector component
   - `/frontend/src/components/accounting/AccountSelector.tsx`
   - Autocomplete dropdown
   - Search by code or name
   - Only show leaf accounts for posting

6. Create Journal Entries list page
   - `/frontend/src/pages/accounting/JournalEntriesPage.tsx`
   - Table with filters (date, type, status)
   - Actions: View, Edit, Post, Reverse, Delete
   - Pagination

#### Week 6 Tasks:
7. Create Journal Entry form page
   - `/frontend/src/pages/accounting/CreateJournalEntryPage.tsx`
   - Date picker
   - Entry type selector
   - Line item editor (dynamic rows)
   - Real-time debit/credit balance display
   - Validation before save

8. Create JournalEntryLineEditor component
   - `/frontend/src/components/accounting/JournalEntryLineEditor.tsx`
   - Multi-row table
   - Account selector per line
   - Debit/Credit amount inputs
   - Add/remove line buttons
   - Running total display

9. Create Financial Reports pages (4 pages)
   - `/frontend/src/pages/accounting/reports/TrialBalancePage.tsx`
   - `/frontend/src/pages/accounting/reports/IncomeStatementPage.tsx`
   - `/frontend/src/pages/accounting/reports/BalanceSheetPage.tsx`
   - `/frontend/src/pages/accounting/reports/CashFlowPage.tsx`
   - Date range picker
   - Export buttons (Excel/PDF)

10. Create FinancialStatementTable component
    - `/frontend/src/components/accounting/FinancialStatementTable.tsx`
    - Reusable table for all reports
    - Support for subtotals/totals
    - Hierarchical indentation

11. Create Account Mappings page
    - `/frontend/src/pages/accounting/AccountMappingsPage.tsx`
    - Group by mapping type
    - Edit mappings
    - Set defaults

12. Create Fiscal Periods page
    - `/frontend/src/pages/accounting/FiscalPeriodsPage.tsx`
    - List view
    - Close/Reopen actions
    - Generate periods button

13. Add navigation links
    - Update `/frontend/src/App.tsx` with accounting routes
    - Update sidebar in MainLayout with Accounting section

**Deliverables**: Complete accounting UI with all CRUD operations and reports

---

### Phase 6: Historical Data & Testing (Week 7)
**Goal**: Migrate existing transactions and validate system

#### Tasks:
1. Create data migration script
   - `/backend/src/scripts/migrate-accounting-data.ts`
   - Process all existing invoices
   - Process all existing payments
   - Process all existing purchase orders with GRNs
   - Process all existing vendor payments
   - Process all existing stock adjustments

2. Run migration script
   - Generate journal entries for historical transactions
   - Update account balances

3. Verify account balances
   - AR balance = sum of unpaid invoices
   - AP balance = sum of unpaid purchase orders
   - Inventory balance = sum of product values
   - Cash balance = sum of payments - sum of vendor payments

4. Test auto-entry generation
   - Create new invoice → verify AR/Revenue entry
   - Record payment → verify Cash/AR entry
   - Receive goods → verify Inventory/AP entry
   - Pay vendor → verify AP/Cash entry

5. Test financial reports
   - Run Trial Balance → verify debits = credits
   - Run Income Statement → verify net income calculation
   - Run Balance Sheet → verify Assets = Liabilities + Equity
   - Test date range filtering

6. Test period close
   - Close current period
   - Verify no new entries can be posted to closed period
   - Reopen period and verify posting works

7. Integration testing
   - End-to-end flow: Create invoice → Record payment → Verify journal entries → Check trial balance
   - Reversal testing: Post entry → Reverse → Verify balances restored

**Deliverables**: All historical data migrated, system validated and ready for production

---

## Default Chart of Accounts Setup

### Assets (1000-1999)
- **1000** - Current Assets (parent)
  - **1010** - Cash
  - **1020** - Bank Account - Operating
  - **1030** - Bank Account - Savings
  - **1100** - Accounts Receivable
  - **1200** - Inventory
  - **1300** - Prepaid Expenses
- **1500** - Fixed Assets (parent)
  - **1510** - Equipment
  - **1520** - Furniture & Fixtures
  - **1530** - Vehicles
  - **1540** - Accumulated Depreciation

### Liabilities (2000-2999)
- **2000** - Current Liabilities (parent)
  - **2100** - Accounts Payable
  - **2200** - Sales Tax Payable
  - **2300** - Accrued Expenses
- **2500** - Long-term Liabilities (parent)
  - **2510** - Loans Payable
  - **2520** - Mortgage Payable

### Equity (3000-3999)
- **3000** - Owner's Equity
- **3100** - Retained Earnings
- **3200** - Current Year Earnings

### Revenue (4000-4999)
- **4000** - Sales Revenue (parent)
  - **4010** - Product Sales
  - **4020** - Service Revenue
- **4100** - Shipping Revenue
- **4200** - Discount Received
- **4900** - Other Revenue

### Expenses (5000-5999)
- **5000** - Cost of Goods Sold (parent)
  - **5010** - Product Cost
  - **5020** - Freight In
- **5100** - Operating Expenses (parent)
  - **5110** - Rent Expense
  - **5120** - Utilities
  - **5130** - Salaries & Wages
  - **5140** - Office Supplies
  - **5150** - Insurance
- **5200** - Discount Given
- **5300** - Inventory Adjustment
- **5900** - Other Expenses

---

## Journal Entry Examples

### Example 1: Invoice Creation
**Transaction**: Customer invoice for $1,000 (product $900, shipping $100)

**Journal Entry**:
```
JE-000001 | Date: 2024-01-15 | Type: Auto-Invoice | Status: Posted
Description: Invoice INV-000123 for Customer ABC

Line 1: DR  1100 - Accounts Receivable     $1,000.00
Line 2:     CR  4010 - Product Sales                    $900.00
Line 3:     CR  4100 - Shipping Revenue                 $100.00

Total Debits: $1,000.00 | Total Credits: $1,000.00 | Balanced: ✓
```

### Example 2: Payment Receipt
**Transaction**: Customer payment of $1,000

**Journal Entry**:
```
JE-000002 | Date: 2024-01-16 | Type: Auto-Payment | Status: Posted
Description: Payment PMT-000045 from Customer ABC

Line 1: DR  1010 - Cash                    $1,000.00
Line 2:     CR  1100 - Accounts Receivable             $1,000.00

Total Debits: $1,000.00 | Total Credits: $1,000.00 | Balanced: ✓
```

### Example 3: Purchase Order Receipt
**Transaction**: Goods received from supplier for $800

**Journal Entry**:
```
JE-000003 | Date: 2024-01-17 | Type: Auto-Purchase | Status: Posted
Description: GRN GRN-000012 for PO PO-000089

Line 1: DR  1200 - Inventory               $800.00
Line 2:     CR  2100 - Accounts Payable               $800.00

Total Debits: $800.00 | Total Credits: $800.00 | Balanced: ✓
```

### Example 4: Vendor Payment
**Transaction**: Payment to supplier for $800

**Journal Entry**:
```
JE-000004 | Date: 2024-01-18 | Type: Auto-Vendor-Payment | Status: Posted
Description: Vendor Payment VP-000023 to Supplier XYZ

Line 1: DR  2100 - Accounts Payable        $800.00
Line 2:     CR  1020 - Bank Account - Operating       $800.00

Total Debits: $800.00 | Total Credits: $800.00 | Balanced: ✓
```

### Example 5: Stock Adjustment
**Transaction**: Inventory adjustment increase of $500

**Journal Entry**:
```
JE-000005 | Date: 2024-01-19 | Type: Auto-Stock-Adjustment | Status: Posted
Description: Stock Adjustment SA-000003 - Count correction

Line 1: DR  1200 - Inventory               $500.00
Line 2:     CR  5300 - Inventory Adjustment           $500.00

Total Debits: $500.00 | Total Credits: $500.00 | Balanced: ✓
```

---

## Critical Files to Create/Modify

### New Files (Backend) - 30+ files
**Entities (6)**:
- `/backend/src/database/entities/account.entity.ts`
- `/backend/src/database/entities/fiscal-period.entity.ts`
- `/backend/src/database/entities/journal-entry.entity.ts`
- `/backend/src/database/entities/journal-entry-line.entity.ts`
- `/backend/src/database/entities/account-mapping.entity.ts`
- `/backend/src/database/entities/accounting-settings.entity.ts`

**Module Structure**:
- `/backend/src/modules/accounting/accounting.module.ts`

**Services (7)**:
- `/backend/src/modules/accounting/services/chart-of-accounts.service.ts`
- `/backend/src/modules/accounting/services/journal-entry.service.ts`
- `/backend/src/modules/accounting/services/general-ledger.service.ts`
- `/backend/src/modules/accounting/services/financial-report.service.ts`
- `/backend/src/modules/accounting/services/accounting-integration.service.ts`
- `/backend/src/modules/accounting/services/fiscal-period.service.ts`
- `/backend/src/modules/accounting/services/account-mapping.service.ts`

**Controllers (5)**:
- `/backend/src/modules/accounting/controllers/chart-of-accounts.controller.ts`
- `/backend/src/modules/accounting/controllers/journal-entry.controller.ts`
- `/backend/src/modules/accounting/controllers/financial-reports.controller.ts`
- `/backend/src/modules/accounting/controllers/account-mapping.controller.ts`
- `/backend/src/modules/accounting/controllers/fiscal-period.controller.ts`

**DTOs (10+)**:
- `/backend/src/modules/accounting/dto/create-account.dto.ts`
- `/backend/src/modules/accounting/dto/update-account.dto.ts`
- `/backend/src/modules/accounting/dto/query-accounts.dto.ts`
- `/backend/src/modules/accounting/dto/create-journal-entry.dto.ts`
- `/backend/src/modules/accounting/dto/update-journal-entry.dto.ts`
- `/backend/src/modules/accounting/dto/query-journal-entries.dto.ts`
- `/backend/src/modules/accounting/dto/create-fiscal-period.dto.ts`
- `/backend/src/modules/accounting/dto/create-account-mapping.dto.ts`
- `/backend/src/modules/accounting/dto/report-params.dto.ts`
- Additional response DTOs as needed

### New Files (Frontend) - 20+ files
**Redux**:
- `/frontend/src/store/slices/accountingSlice.ts`

**API Service**:
- `/frontend/src/services/accountingApi.ts`

**Pages (10)**:
- `/frontend/src/pages/accounting/AccountingPage.tsx`
- `/frontend/src/pages/accounting/ChartOfAccountsPage.tsx`
- `/frontend/src/pages/accounting/JournalEntriesPage.tsx`
- `/frontend/src/pages/accounting/CreateJournalEntryPage.tsx`
- `/frontend/src/pages/accounting/AccountMappingsPage.tsx`
- `/frontend/src/pages/accounting/FiscalPeriodsPage.tsx`
- `/frontend/src/pages/accounting/reports/TrialBalancePage.tsx`
- `/frontend/src/pages/accounting/reports/IncomeStatementPage.tsx`
- `/frontend/src/pages/accounting/reports/BalanceSheetPage.tsx`
- `/frontend/src/pages/accounting/reports/CashFlowPage.tsx`

**Components (5)**:
- `/frontend/src/components/accounting/AccountSelector.tsx`
- `/frontend/src/components/accounting/AccountTreeView.tsx`
- `/frontend/src/components/accounting/JournalEntryLineEditor.tsx`
- `/frontend/src/components/accounting/FinancialStatementTable.tsx`
- `/frontend/src/components/accounting/AccountMappingForm.tsx`

### Files to Modify (8)
**Backend**:
- `/backend/src/app.module.ts` - Register AccountingModule
- `/backend/src/modules/sales/services/invoice.service.ts` - Add accounting integration hook
- `/backend/src/modules/sales/services/payment.service.ts` - Add accounting integration hook
- `/backend/src/modules/purchasing/services/purchase-order.service.ts` - Add accounting integration hook
- `/backend/src/modules/purchasing/services/vendor-payment.service.ts` - Add accounting integration hook
- `/backend/src/modules/inventory/services/stock-adjustment.service.ts` - Add accounting integration hook

**Frontend**:
- `/frontend/src/App.tsx` - Add accounting routes
- `/frontend/src/components/layout/MainLayout.tsx` - Add accounting navigation

---

## Verification Steps

After implementation, verify the following:

### Backend Verification
1. **Database schema**: All 6 tables created with proper indexes and constraints
2. **Default COA**: 25+ accounts created covering all account types
3. **Manual journal entry**: Can create, post, and reverse entries
4. **Auto-entry generation**: Invoice creation generates AR/Revenue entry
5. **Payment tracking**: Payment receipt generates Cash/AR entry
6. **Purchase tracking**: GRN generates Inventory/AP entry
7. **Trial balance**: Debits equal credits for all posted entries
8. **Period close**: Cannot post to closed periods

### Frontend Verification
1. **Navigation**: Accounting menu accessible from sidebar
2. **Chart of Accounts**: Tree view displays correctly, CRUD operations work
3. **Journal entries**: List displays, create form validates balance
4. **Financial reports**: All 4 reports generate with correct data
5. **Export**: Excel/PDF downloads work
6. **Account mappings**: Can configure and save mappings
7. **Integration**: Creating invoice shows corresponding journal entry

### Integration Verification
1. Create complete transaction flow:
   - Create invoice → Check journal entry created
   - Record payment → Check journal entry created
   - Verify AR balance decreased
   - Verify Cash balance increased
   - Check Trial Balance is balanced

2. Test financial statements:
   - Income Statement shows revenue from invoices
   - Balance Sheet shows AR from unpaid invoices
   - Balance Sheet shows Cash from payments
   - Assets = Liabilities + Equity

---

## Success Criteria

The accounting module is considered complete when:

1. ✅ All 6 database tables created and migrated
2. ✅ Default chart of accounts (25+ accounts) auto-generated
3. ✅ Manual journal entry creation fully functional
4. ✅ All 5 business transaction types auto-generate journal entries
5. ✅ All 4 financial reports generate correctly
6. ✅ Excel and PDF export working for all reports
7. ✅ Frontend UI complete for all accounting operations
8. ✅ Historical data migrated and balances verified
9. ✅ Trial Balance always balanced (debits = credits)
10. ✅ Period close/reopen working correctly
11. ✅ Integration testing passes for end-to-end flows
12. ✅ Documentation updated in CLAUDE.md

---

## Risk Mitigation

### Technical Risks
- **Decimal precision errors**: Use decimal(15,4) consistently, convert to Number only for display
- **Unbalanced entries**: Validate before posting, prevent posting if debits ≠ credits
- **Integration failures**: Wrap accounting calls in try-catch, log errors but don't fail business transactions
- **Performance**: Index all foreign keys and date columns, paginate journal entry lists

### Business Risks
- **Incorrect account mapping**: Provide validation UI, require admin review before enabling auto-entries
- **Historical data migration**: Run in transaction, verify balances before committing
- **Period close errors**: Validate all entries balanced before allowing period close

### User Experience Risks
- **Complex UI**: Follow existing patterns from Inventory/Sales modules, provide inline help
- **Learning curve**: Create default setup wizard, provide sample data

---

## Future Enhancements (Not in Scope)

- Multi-currency support with exchange rates
- Tax/VAT tracking and reporting
- Budget vs. actual analysis
- Cost center/department allocation
- Project/job costing
- Fixed asset depreciation automation
- Bank reconciliation module
- Intercompany transactions
- Financial statement consolidation
- Automated recurring entries

---

## Estimated Timeline

- **Phase 1**: Backend Foundation - 5 days
- **Phase 2**: Journal Entry System - 5 days
- **Phase 3**: Automated Integration - 5 days
- **Phase 4**: Financial Reporting - 5 days
- **Phase 5**: Frontend Implementation - 10 days
- **Phase 6**: Historical Data & Testing - 5 days

**Total**: 35 working days (~7 weeks)

**Note**: Timeline assumes single developer working full-time. Parallel development of backend and frontend can reduce total time.

---

## Next Steps

1. Review and approve this plan
2. Create Phase 1 branch: `git checkout -b feature/accounting-module`
3. Begin with entity creation and database migration
4. Implement incrementally following the phased approach
5. Test each phase before proceeding to the next
6. Update CLAUDE.md after completion
