import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { AccountType } from '../entities/account-type.enum';
import { AccountingPostingService } from './accounting-posting.service';
import { AccountBalanceService } from './account-balance.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { providerClearingViolation } from './provider-clearing.rules';
import { bankAccountViolation } from './bank-account.rules';
import { withBalanceSheetConfigLock } from './balance-sheet-group.service';
import { toMinorUnits, formatMoney, formatScale4, quantizeToCents } from '@/common/utils/money';
import { getAppToday } from '@/common/utils/app-calendar';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class ChartOfAccountService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(AccountingSettings) private readonly settingsRepo: Repository<AccountingSettings>,
    private readonly posting: AccountingPostingService,
    private readonly balance: AccountBalanceService,
    private readonly dataSource: DataSource,
    private readonly regionalSettingsService: SettingsService,
  ) {}

  private async assertParentValid(parentId: string | undefined, type: string): Promise<void> {
    if (!parentId) return;
    const parent = await this.coaRepo.findOne({ where: { id: parentId } as any });
    if (!parent) throw new BadRequestException('Parent account not found');
    if (parent.type !== type) throw new BadRequestException('Parent must be the same account type');
    if (!parent.isActive) throw new BadRequestException('Parent account is inactive');
    if (parent.isPostable) throw new BadRequestException('Parent must be a group (non-postable) account');
  }

  async create(dto: CreateAccountDto, actor: string): Promise<ChartOfAccount> {
    const existing = await this.coaRepo.findOne({ where: { code: dto.code } as any });
    if (existing) throw new ConflictException(`Account code ${dto.code} already exists`);
    await this.assertParentValid(dto.parentId, dto.type);
    const opening = dto.openingBalance ? formatScale4(dto.openingBalance) : '0.0000';

    // Only resolve the business calendar when the UTC-derived fallback would
    // actually be used: a nonzero opening balance with no supplied date. The
    // settings read can create a default row on a fresh install, so it is not
    // free (issue #1134). Resolved before the transaction opens — it reads
    // through the default DataSource, not this manager.
    const postsOpeningBalance = toMinorUnits(opening) !== 0n;
    const entryDate =
      dto.openingBalanceDate ??
      (postsOpeningBalance ? await getAppToday(this.regionalSettingsService) : null);

    if (dto.isBankAccount) {
      // A new account has no id any setting could reference yet, and no Settings
      // update can reference it before this transaction commits — so create
      // needs no config lock (spec §6.1).
      const violation = bankAccountViolation(
        { id: '', type: dto.type as AccountType, isPostable: true, isProviderClearing: dto.isProviderClearing ?? false },
        null,
      );
      if (violation) throw new BadRequestException(violation);
    }

    if (dto.isProviderClearing) {
      // A new account is postable and has no id any setting could reference yet.
      const violation = providerClearingViolation(
        { id: '', type: dto.type as AccountType, isPostable: true, isBankAccount: dto.isBankAccount ?? false }, null,
      );
      if (violation) throw new BadRequestException(violation);
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const repo = manager.getRepository(ChartOfAccount);
      const account = await repo.save(repo.create({
        code: dto.code, name: dto.name, type: dto.type, parentId: dto.parentId ?? null,
        description: dto.description ?? null, isActive: true, isSystem: false, isPostable: true,
        openingBalance: opening, createdBy: actor,
        isProviderClearing: dto.isProviderClearing ?? false,
        isBankAccount: dto.isBankAccount ?? false,
      } as any)) as unknown as ChartOfAccount;

      if (postsOpeningBalance) {
        await this.posting.postOpeningBalance({
          accountId: account.id, sourceRef: account.code,
          amount: formatMoney(quantizeToCents(toMinorUnits(opening))),
          entryDate: entryDate as string,
          createdBy: actor,
        }, manager);
      }
      return account;
    });
  }

  /**
   * Runs entirely inside withBalanceSheetConfigLock (#1298, spec §6.2): the
   * same settings-row lock AccountingSettingsService.update holds. Every read,
   * check and the save go through the lock's manager, so a concurrent Settings
   * update cannot pass against this update's pre-change state (e.g. Settings
   * selecting X as the bank while this unflags X).
   */
  async update(id: string, dto: UpdateAccountDto, actor: string): Promise<ChartOfAccount> {
    // BaseEntity has no updatedBy column — do not set it.
    void actor;
    return withBalanceSheetConfigLock(this.dataSource, async (manager) => {
      const repo = manager.getRepository(ChartOfAccount);
      const account = await repo.findOne({ where: { id } as any });
      if (!account) throw new NotFoundException('Account not found');
      const settings = await manager.getRepository(AccountingSettings).findOne({ where: { id: true } as any });

      if (dto.isActive === false && settings && this.isUsedInSettings(id, settings)) {
        throw new BadRequestException('Account is used in Accounting Settings and cannot be set inactive');
      }
      if (dto.isBankAccount === false && settings?.bankAccountId === id) {
        throw new BadRequestException('Account is the Accounting Settings Bank account and must remain a bank account');
      }

      // Validate the RESULTING state whenever a flag stays set, not only when it
      // is being turned on (D7).
      const merged = {
        ...account,
        ...(dto.isProviderClearing !== undefined && { isProviderClearing: dto.isProviderClearing }),
        ...(dto.isBankAccount !== undefined && { isBankAccount: dto.isBankAccount }),
      };
      if (merged.isBankAccount) {
        const violation = bankAccountViolation(merged as any, settings);
        if (violation) throw new BadRequestException(violation);
      }
      if (merged.isProviderClearing) {
        const violation = providerClearingViolation(merged as any, settings);
        if (violation) throw new BadRequestException(violation);
      }

      if (dto.name !== undefined) account.name = dto.name;
      if (dto.description !== undefined) account.description = dto.description;
      if (dto.isActive !== undefined) account.isActive = dto.isActive;
      if (dto.isProviderClearing !== undefined) account.isProviderClearing = dto.isProviderClearing;
      if (dto.isBankAccount !== undefined) account.isBankAccount = dto.isBankAccount;
      return repo.save(account);
    });
  }

  private isUsedInSettings(id: string, s: AccountingSettings): boolean {
    return [
      s.cashAccountId, s.bankAccountId, s.inventoryAccountId, s.supplierDepositAccountId,
      s.customerDepositAccountId, s.openingBalanceEquityAccountId, s.salesRevenueAccountId,
      s.cogsAccountId, s.defaultExpenseAccountId,
      s.ownerCapitalAccountId, s.ownerDrawingsAccountId,
    ].includes(id);
  }

  async list(filter: { type?: string; activeOnly?: boolean; postableOnly?: boolean }): Promise<ChartOfAccount[]> {
    const qb = this.coaRepo.createQueryBuilder('a');
    if (filter.type) qb.andWhere('a.type = :type', { type: filter.type });
    if (filter.activeOnly) qb.andWhere('a.isActive = true');
    if (filter.postableOnly) qb.andWhere('a.isPostable = true');
    return qb.orderBy('a.code', 'ASC').getMany();
  }

  async findTree(filter?: { search?: string; type?: AccountType; isActive?: boolean }): Promise<any[]> {
    const accounts = await this.coaRepo.find({ order: { code: 'ASC' } });
    const leaves = await this.balance.getLeafBalances();
    const withBalances = accounts.map((a) => {
      const raw = a.isPostable
        ? (leaves.get(a.id) ?? 0n)
        : this.balance.getRollup(a.id, leaves, accounts as any);
      return { ...a, balance: formatScale4(this.balance.naturalBalance(a.type, raw)) };
    });
    const tree = this.buildTree(withBalances);

    // Prune AFTER the rollup above: group balances must be computed over every
    // account, not only the ones a filter happens to match.
    const q = filter?.search?.trim().toLowerCase();
    const type = filter?.type;
    const isActive = filter?.isActive;
    if (!q && !type && isActive === undefined) return tree;
    return this.pruneTree(tree, { q, type, isActive });
  }

  // Keeps a node if it matches EVERY active filter, or if any descendant does —
  // so a matching leaf keeps its ancestor path, and an ancestor retained purely
  // as context need not match itself (e.g. an active child under an inactive
  // parent). Non-matching siblings drop out.
  //
  // The predicates must be evaluated together in one traversal. Running them as
  // successive passes is NOT equivalent: under isActive=true + search=Liabilities,
  // pass 1 keeps an inactive parent because an active child survived, then pass 2
  // drops that child for not matching the term but keeps the parent on its own
  // name match — leaving a node that fails isActive with nothing to justify it.
  private pruneTree(
    nodes: any[],
    filter: { q?: string; type?: AccountType; isActive?: boolean },
  ): any[] {
    const out: any[] = [];
    for (const n of nodes) {
      const kids = this.pruneTree(n.children, filter);
      const matchesSearch =
        !filter.q ||
        n.name.toLowerCase().includes(filter.q) ||
        n.code.toLowerCase().includes(filter.q);
      const matchesType = !filter.type || n.type === filter.type;
      const matchesActive = filter.isActive === undefined || n.isActive === filter.isActive;
      const self = matchesSearch && matchesType && matchesActive;
      if (self || kids.length) out.push({ ...n, children: kids });
    }
    return out;
  }

  private buildTree(rows: any[]): any[] {
    const byParent = new Map<string | null, any[]>();
    for (const r of rows) {
      const key = r.parentId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(r);
    }
    const attach = (parentId: string | null): any[] =>
      (byParent.get(parentId) ?? []).map((r) => ({ ...r, children: attach(r.id) }));
    return attach(null);
  }
}
