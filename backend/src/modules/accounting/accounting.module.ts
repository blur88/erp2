import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChartOfAccount } from './entities/chart-of-account.entity';
import { AccountingSettings } from './entities/accounting-settings.entity';
import { FormBSettings } from './entities/form-b-settings.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalEntryLine } from './entities/journal-entry-line.entity';
import { Expense } from './entities/expense.entity';
import { ExpensePayment } from './entities/expense-payment.entity';
import { SettingsModule } from '../settings/settings.module';
import { PrintSettingsModule } from '../print-settings/print-settings.module';
import { AccountingLookupService } from './services/accounting-lookup.service';
import { AccountingPostingService } from './services/accounting-posting.service';
import { AccountBalanceService } from './services/account-balance.service';
import { ChartOfAccountService } from './services/chart-of-account.service';
import { AccountingSettingsService } from './services/accounting-settings.service';
import { JournalEntryService } from './services/journal-entry.service';
import { GeneralLedgerService } from './services/general-ledger.service';
import { TrialBalanceService } from './services/trial-balance.service';
import { ProfitAndLossService } from './services/profit-and-loss.service';
import { AccountingSeederService } from './services/accounting-seeder.service';
import { ChartOfAccountController } from './controllers/chart-of-account.controller';
import { AccountingSettingsController } from './controllers/accounting-settings.controller';
import { JournalEntryController } from './controllers/journal-entry.controller';
import { GeneralLedgerController } from './controllers/general-ledger.controller';
import { TrialBalanceController } from './controllers/trial-balance.controller';
import { ProfitAndLossController } from './controllers/profit-and-loss.controller';
import { ExpenseController } from './controllers/expense.controller';
import { ExpenseService } from './services/expense.service';
import { ExpensePaymentService } from './services/expense-payment.service';
import { FormBSettingsService } from './services/form-b-settings.service';
import { ACCOUNTING_POSTING_PORT } from '../../common/accounting-posting/accounting-posting.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChartOfAccount, AccountingSettings, FormBSettings, JournalEntry, JournalEntryLine, Expense, ExpensePayment]),
    SettingsModule,
    PrintSettingsModule,
  ],
  controllers: [
    ChartOfAccountController, AccountingSettingsController, JournalEntryController,
    GeneralLedgerController, TrialBalanceController, ProfitAndLossController, ExpenseController,
  ],
  providers: [
    AccountingLookupService, AccountingPostingService, AccountBalanceService,
    ChartOfAccountService, AccountingSettingsService, JournalEntryService,
    GeneralLedgerService, TrialBalanceService, ProfitAndLossService, AccountingSeederService,
    ExpenseService, ExpensePaymentService,
    FormBSettingsService,
    { provide: ACCOUNTING_POSTING_PORT, useExisting: AccountingPostingService },
  ],
  exports: [ACCOUNTING_POSTING_PORT, AccountingLookupService],
})
export class AccountingModule {}
