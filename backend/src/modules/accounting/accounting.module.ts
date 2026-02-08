import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { FiscalPeriod } from '../../database/entities/fiscal-period.entity';
import { JournalEntry } from '../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../database/entities/journal-entry-line.entity';
import { AccountMapping } from '../../database/entities/account-mapping.entity';

// Services
import { AccountingService } from './services/accounting.service';
import { ChartOfAccountsService } from './services/chart-of-accounts.service';
import { FiscalPeriodService } from './services/fiscal-period.service';
import { JournalEntryService } from './services/journal-entry.service';
import { AccountMappingService } from './services/account-mapping.service';
import { AccountingReportsService } from './services/accounting-reports.service';

// Controllers
import { ChartOfAccountsController } from './controllers/chart-of-accounts.controller';
import { FiscalPeriodController } from './controllers/fiscal-period.controller';
import { JournalEntryController } from './controllers/journal-entry.controller';
import { AccountMappingController } from './controllers/account-mapping.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChartOfAccount,
      FiscalPeriod,
      JournalEntry,
      JournalEntryLine,
      AccountMapping,
    ]),
  ],
  controllers: [
    ChartOfAccountsController,
    FiscalPeriodController,
    JournalEntryController,
    AccountMappingController,
  ],
  providers: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
  ],
  exports: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
  ],
})
export class AccountingModule {}
