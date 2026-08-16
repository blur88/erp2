import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { repoFor } from '../../../common/db/tx-helpers';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';

export type MappingKey =
  | 'cash' | 'bank' | 'inventory' | 'supplierDeposit' | 'customerDeposit'
  | 'openingBalanceEquity' | 'salesRevenue' | 'cogs' | 'defaultExpense'
  | 'ownerCapital' | 'ownerDrawings';

const KEY_TO_COLUMN: Record<MappingKey, keyof AccountingSettings> = {
  cash: 'cashAccountId', bank: 'bankAccountId', inventory: 'inventoryAccountId',
  supplierDeposit: 'supplierDepositAccountId', customerDeposit: 'customerDepositAccountId',
  openingBalanceEquity: 'openingBalanceEquityAccountId', salesRevenue: 'salesRevenueAccountId',
  cogs: 'cogsAccountId', defaultExpense: 'defaultExpenseAccountId',
  ownerCapital: 'ownerCapitalAccountId', ownerDrawings: 'ownerDrawingsAccountId',
};

@Injectable()
export class AccountingLookupService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(AccountingSettings) private readonly settingsRepo: Repository<AccountingSettings>,
  ) {}

  async resolveAccount(key: MappingKey, manager: EntityManager): Promise<ChartOfAccount> {
    const settingsRepo = repoFor(manager, AccountingSettings, this.settingsRepo);
    const settings = await settingsRepo.findOne({ where: { id: true } as any });
    const accountId = settings ? (settings[KEY_TO_COLUMN[key]] as unknown as string | null) : null;
    if (!accountId) throw new BadRequestException(`Accounting setting '${key}' is not configured`);
    const coaRepo = repoFor(manager, ChartOfAccount, this.coaRepo);
    const account = await coaRepo.findOne({ where: { id: accountId } as any });
    if (!account) throw new BadRequestException(`Mapped account for '${key}' not found`);
    if (!account.isActive) throw new BadRequestException(`Mapped account for '${key}' is inactive`);
    if (!account.isPostable) throw new BadRequestException(`Mapped account for '${key}' is not postable`);
    return account;
  }

  resolveChannelAccount(channel: 'CASH' | 'BANK', manager: EntityManager): Promise<ChartOfAccount> {
    return this.resolveAccount(channel === 'CASH' ? 'cash' : 'bank', manager);
  }
}
