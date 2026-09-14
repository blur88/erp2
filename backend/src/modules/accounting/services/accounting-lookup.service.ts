import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { repoFor } from '../../../common/db/tx-helpers';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { PaymentMethodAccountMapping } from '../entities/payment-method-account-mapping.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';

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

  /**
   * Resolve the posting account for a payment (issue #1237).
   *
   * Mapping first, channel default second. An INVALID mapping throws rather
   * than falling back: silently using the bank default would send Maybank
   * payments to CIMB again, which is indistinguishable from the bug this
   * exists to fix. Only the ABSENCE of a mapping is a fallback.
   */
  async resolvePaymentAccount(
    channel: 'CASH' | 'BANK',
    paymentMethodId: string | undefined,
    manager: EntityManager,
  ): Promise<ChartOfAccount> {
    const fallbackKey: MappingKey = channel === 'CASH' ? 'cash' : 'bank';
    if (!paymentMethodId) return this.resolveAccount(fallbackKey, manager);

    const mappingRepo = manager.getRepository(PaymentMethodAccountMapping);
    const mapping = await mappingRepo.findOne({
      where: { paymentMethodId } as any,
    });
    if (!mapping) return this.resolveAccount(fallbackKey, manager);

    // NEVER pass withDeleted here. The default exclusion is what makes a
    // soft-deleted account resolve as invalid — FK RESTRICT does not fire on a
    // soft delete, so this lookup is the only thing standing between a deleted
    // account and a posting.
    const coaRepo = manager.getRepository(ChartOfAccount);
    const account = await coaRepo.findOne({ where: { id: mapping.accountId } as any });

    const methodRepo = manager.getRepository(PaymentMethodEntity);
    const method = await methodRepo.findOne({ where: { id: paymentMethodId } as any });
    const methodLabel = method?.name ?? paymentMethodId;

    if (!account) {
      throw new BadRequestException(
        `Payment method '${methodLabel}' is mapped to account ${mapping.accountId} (not found or deleted)`,
      );
    }
    const accountLabel = `${account.code} ${account.name}`;
    if (!account.isActive) {
      throw new BadRequestException(
        `Payment method '${methodLabel}' is mapped to account '${accountLabel}', which is inactive`,
      );
    }
    if (!account.isPostable) {
      throw new BadRequestException(
        `Payment method '${methodLabel}' is mapped to account '${accountLabel}', which is not postable`,
      );
    }
    return account;
  }
}
