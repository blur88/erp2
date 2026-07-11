import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountType } from '../entities/account-type.enum';
import { UpdateAccountingSettingsDto } from '../dto/update-accounting-settings.dto';

const REQUIRED_TYPE: Record<string, AccountType> = {
  cashAccountId: AccountType.ASSET, bankAccountId: AccountType.ASSET,
  inventoryAccountId: AccountType.ASSET, supplierDepositAccountId: AccountType.ASSET,
  customerDepositAccountId: AccountType.LIABILITY, openingBalanceEquityAccountId: AccountType.EQUITY,
  salesRevenueAccountId: AccountType.INCOME, cogsAccountId: AccountType.EXPENSE,
  defaultExpenseAccountId: AccountType.EXPENSE,
};

@Injectable()
export class AccountingSettingsService {
  constructor(
    @InjectRepository(AccountingSettings) private readonly settingsRepo: Repository<AccountingSettings>,
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
  ) {}

  async get(): Promise<AccountingSettings> {
    const existing = await this.settingsRepo.findOne({ where: { id: true } as any });
    if (!existing) throw new BadRequestException('Accounting settings row is missing (migration not applied?)');
    return existing;
  }

  async update(dto: UpdateAccountingSettingsDto, actor: string): Promise<AccountingSettings> {
    for (const [field, requiredType] of Object.entries(REQUIRED_TYPE)) {
      const accountId = (dto as any)[field] as string | undefined;
      if (!accountId) continue;
      const account = await this.coaRepo.findOne({ where: { id: accountId } as any });
      if (!account) throw new BadRequestException(`${field}: account not found`);
      if (!account.isActive) throw new BadRequestException(`${field}: account is inactive`);
      if (!account.isPostable) throw new BadRequestException(`${field}: account is not postable`);
      if (account.type !== requiredType) throw new BadRequestException(`${field}: must be a ${requiredType} account`);
    }
    const current = await this.get();
    const merged = this.settingsRepo.create({ ...current, ...dto, id: true } as any);
    return this.settingsRepo.save(merged as any);
  }
}
