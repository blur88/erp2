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

// Services
import { AccountingService } from './services/accounting.service';
import { ChartOfAccountsService } from './services/chart-of-accounts.service';
import { FiscalPeriodService } from './services/fiscal-period.service';
import { JournalEntryService } from './services/journal-entry.service';
import { AccountMappingService } from './services/account-mapping.service';
import { AccountingReportsService } from './services/accounting-reports.service';
import { ReconciliationService } from './services/reconciliation.service';

// Controllers
import { ChartOfAccountsController } from './controllers/chart-of-accounts.controller';
import { FiscalPeriodController } from './controllers/fiscal-period.controller';
import { JournalEntryController } from './controllers/journal-entry.controller';
import { AccountMappingController } from './controllers/account-mapping.controller';
import { AccountingReportsController } from './controllers/accounting-reports.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';

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
    ]),
  ],
  controllers: [
    ChartOfAccountsController,
    FiscalPeriodController,
    JournalEntryController,
    AccountMappingController,
    AccountingReportsController,
    ReconciliationController,
  ],
  providers: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
    ReconciliationService,
  ],
  exports: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
    ReconciliationService,
  ],
})
export class AccountingModule {}
