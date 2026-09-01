import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountType } from '../entities/account-type.enum';
import { UpdateAccountingSettingsDto } from '../dto/update-accounting-settings.dto';
import { isDescendantOf } from './profit-and-loss.graph';

const REQUIRED_TYPE: Record<string, AccountType> = {
  cashAccountId: AccountType.ASSET, bankAccountId: AccountType.ASSET,
  inventoryAccountId: AccountType.ASSET, supplierDepositAccountId: AccountType.ASSET,
  customerDepositAccountId: AccountType.LIABILITY, openingBalanceEquityAccountId: AccountType.EQUITY,
  ownerCapitalAccountId: AccountType.EQUITY, ownerDrawingsAccountId: AccountType.EQUITY,
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
    await this.assertNoMappedAccountCaptured(dto);
    const current = await this.get();
    const merged = this.settingsRepo.create({ ...current, ...dto, id: true } as any);
    return this.settingsRepo.save(merged as any);
  }

  /**
   * A root change must not capture an account that already carries a Form B
   * mapping (#1174, spec §4.3): the COGS and Sales Revenue subtrees are
   * ineligible for mapping, so moving the root over a mapped account would put
   * the chart in a state the report has to defend against at read time.
   *
   * Rejected, never silently cleared — a mapping is the user's classification
   * decision, and destroying it to make a settings change succeed would alter a
   * filed figure without telling anyone.
   *
   * NOTE: the sibling guards in spec §4.3 (reparenting a mapped account, or
   * making one non-postable / wrong-type) are deliberately NOT implemented:
   * ChartOfAccountService.update() assigns only name, description and isActive,
   * so no route can perform those changes. A future PR that adds a reparent or
   * type-change route MUST add the equivalent guard there.
   */
  private async assertNoMappedAccountCaptured(dto: UpdateAccountingSettingsDto): Promise<void> {
    const pairs: Array<[keyof UpdateAccountingSettingsDto, 'formBExpenseCategory' | 'formBIncomeCategory']> = [
      ['cogsAccountId', 'formBExpenseCategory'],
      ['salesRevenueAccountId', 'formBIncomeCategory'],
    ];

    // The settings form submits the COMPLETE object on every save
    // (AccountingSettingsPage.tsx), so a root appears in the DTO whether or not
    // it changed. Only an actual CHANGE can capture anything new — validating an
    // unchanged root would let one pre-existing mapping under the current root
    // block every future settings change, with no way to save.
    const current = await this.get();

    for (const [settingKey, column] of pairs) {
      const newRootId = (dto as any)[settingKey] as string | undefined;
      if (!newRootId) continue;
      if (newRootId === (current as any)[settingKey]) continue;

      const accounts = await this.coaRepo.find();
      const graph = new Map(
        accounts.map((a: any) => [a.id, { id: a.id, parentId: a.parentId }]),
      );

      const captured = accounts.filter((a: any) =>
        (a as any)[column] !== null &&
        (a as any)[column] !== undefined &&
        (a.id === newRootId || isDescendantOf(a.id, newRootId, graph as any)),
      );

      if (captured.length > 0) {
        const names = captured.map((a: any) => `${a.code} ${a.name}`).join(', ');
        throw new BadRequestException(
          `${settingKey}: cannot point at this account because ${captured.length} mapped account(s) would fall inside its subtree: ${names}. Remove the Form B mapping first.`,
        );
      }
    }
  }
}
