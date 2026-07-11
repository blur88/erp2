import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ACCOUNTING_POSTING_PORT } from '../../common/accounting-posting/accounting-posting.port';
import { AccountingPostingService } from './services/accounting-posting.service';
import { AccountingLookupService } from './services/accounting-lookup.service';
import { AccountBalanceService } from './services/account-balance.service';
import { ChartOfAccountService } from './services/chart-of-account.service';
import { AccountingSettingsService } from './services/accounting-settings.service';
import { JournalEntryService } from './services/journal-entry.service';
import { GeneralLedgerService } from './services/general-ledger.service';
import { TrialBalanceService } from './services/trial-balance.service';
import { SettingsService } from '../settings/settings.service';
import { ChartOfAccount } from './entities/chart-of-account.entity';
import { AccountingSettings } from './entities/accounting-settings.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalEntryLine } from './entities/journal-entry-line.entity';

describe('AccountingModule port binding', () => {
  it('binds ACCOUNTING_POSTING_PORT to AccountingPostingService', async () => {
    const repoMock = {};
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountingLookupService, AccountingPostingService, AccountBalanceService,
        ChartOfAccountService, AccountingSettingsService, JournalEntryService,
        GeneralLedgerService, TrialBalanceService,
        { provide: ACCOUNTING_POSTING_PORT, useExisting: AccountingPostingService },
        { provide: SettingsService, useValue: { generateDocumentNumber: async () => 'JE-26-001' } },
        { provide: DataSource, useValue: { transaction: async (cb: any) => cb({}) } },
        { provide: getRepositoryToken(ChartOfAccount), useValue: repoMock },
        { provide: getRepositoryToken(AccountingSettings), useValue: repoMock },
        { provide: getRepositoryToken(JournalEntry), useValue: repoMock },
        { provide: getRepositoryToken(JournalEntryLine), useValue: repoMock },
      ],
    }).compile();
    expect(moduleRef.get(ACCOUNTING_POSTING_PORT)).toBeInstanceOf(AccountingPostingService);
  });
});
