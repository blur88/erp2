import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { FiscalPeriod } from '../../database/entities/fiscal-period.entity';
import { JournalEntry } from '../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../database/entities/journal-entry-line.entity';
import { AccountMapping } from '../../database/entities/account-mapping.entity';
import { BankReconciliation } from '../../database/entities/bank-reconciliation.entity';
import { ReconciledTransaction } from '../../database/entities/reconciled-transaction.entity';
import { Settlement } from '../../database/entities/settlement.entity';
import { PaymentMethodEntity } from '../../database/entities/payment-method.entity';
import { Payment } from '../../database/entities/payment.entity';
import { OwnerEquityTransaction } from '../../database/entities/owner-equity-transaction.entity';
import { Expense } from '../../database/entities/expense.entity';

// Services
import { AccountingService } from './services/accounting.service';
import { ChartOfAccountsService } from './services/chart-of-accounts.service';
import { FiscalPeriodService } from './services/fiscal-period.service';
import { JournalEntryService } from './services/journal-entry.service';
import { AccountMappingService } from './services/account-mapping.service';
import { AccountingReportsService } from './services/accounting-reports.service';
import { ReconciliationService } from './services/reconciliation.service';
import { SettlementService } from './services/settlement.service';
import { OwnerEquityService } from './services/owner-equity.service';
import { ExpenseService } from './services/expense.service';

// Controllers
import { ChartOfAccountsController } from './controllers/chart-of-accounts.controller';
import { FiscalPeriodController } from './controllers/fiscal-period.controller';
import { JournalEntryController } from './controllers/journal-entry.controller';
import { AccountMappingController } from './controllers/account-mapping.controller';
import { AccountingReportsController } from './controllers/accounting-reports.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { SettlementController } from './controllers/settlement.controller';
import { OwnerEquityController } from './controllers/owner-equity.controller';
import { ExpenseController } from './controllers/expense.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChartOfAccount,
      FiscalPeriod,
      JournalEntry,
      JournalEntryLine,
      AccountMapping,
      BankReconciliation,
      ReconciledTransaction,
      Settlement,
      PaymentMethodEntity,
      Payment,
      OwnerEquityTransaction,
      Expense,
    ]),
  ],
  controllers: [
    ChartOfAccountsController,
    FiscalPeriodController,
    JournalEntryController,
    AccountMappingController,
    AccountingReportsController,
    ReconciliationController,
    SettlementController,
    OwnerEquityController,
    ExpenseController,
  ],
  providers: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
    ReconciliationService,
    SettlementService,
    OwnerEquityService,
    ExpenseService,
  ],
  exports: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
    ReconciliationService,
    SettlementService,
    OwnerEquityService,
    ExpenseService,
  ],
})
export class AccountingModule {}
