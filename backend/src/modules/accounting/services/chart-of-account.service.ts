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
import { toMinorUnits, formatScale4 } from '@/common/utils/money';
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

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const repo = manager.getRepository(ChartOfAccount);
      const account = await repo.save(repo.create({
        code: dto.code, name: dto.name, type: dto.type, parentId: dto.parentId ?? null,
        description: dto.description ?? null, isActive: true, isSystem: false, isPostable: true,
        openingBalance: opening, createdBy: actor,
      } as any)) as unknown as ChartOfAccount;

      if (postsOpeningBalance) {
        await this.posting.postOpeningBalance({
          accountId: account.id, sourceRef: account.code,
          amount: opening,
          entryDate: entryDate as string,
          createdBy: actor,
        }, manager);
      }
      return account;
    });
  }

  async update(id: string, dto: UpdateAccountDto, actor: string): Promise<ChartOfAccount> {
    const account = await this.coaRepo.findOne({ where: { id } as any });
    if (!account) throw new NotFoundException('Account not found');
    if (dto.isActive === false) {
      const settings = await this.settingsRepo.findOne({ where: { id: true } as any });
      if (settings && this.isUsedInSettings(id, settings)) {
        throw new BadRequestException('Account is used in Accounting Settings and cannot be set inactive');
      }
    }
    // BaseEntity has no updatedBy column — do not set it.
    void actor;
    if (dto.name !== undefined) account.name = dto.name;
    if (dto.description !== undefined) account.description = dto.description;
    if (dto.isActive !== undefined) account.isActive = dto.isActive;
    return this.coaRepo.save(account);
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
