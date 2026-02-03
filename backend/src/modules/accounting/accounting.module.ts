import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { FiscalPeriod } from '../../database/entities/fiscal-period.entity';
import { JournalEntry } from '../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../database/entities/journal-entry-line.entity';

// Services
import { AccountingService } from './services/accounting.service';
import { ChartOfAccountsService } from './services/chart-of-accounts.service';
import { FiscalPeriodService } from './services/fiscal-period.service';
import { JournalEntryService } from './services/journal-entry.service';

// Controllers
import { ChartOfAccountsController } from './controllers/chart-of-accounts.controller';
import { FiscalPeriodController } from './controllers/fiscal-period.controller';
import { JournalEntryController } from './controllers/journal-entry.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChartOfAccount,
      FiscalPeriod,
      JournalEntry,
      JournalEntryLine,
    ]),
  ],
  controllers: [
    ChartOfAccountsController,
    FiscalPeriodController,
    JournalEntryController,
  ],
  providers: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
  ],
  exports: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
  ],
})
export class AccountingModule {}
