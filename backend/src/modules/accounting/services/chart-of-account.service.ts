import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { AccountingPostingService } from './accounting-posting.service';
import { AccountBalanceService } from './account-balance.service';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { toMinorUnits, formatScale4 } from '../utils/money';

@Injectable()
export class ChartOfAccountService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(AccountingSettings) private readonly settingsRepo: Repository<AccountingSettings>,
    private readonly posting: AccountingPostingService,
    private readonly balance: AccountBalanceService,
    private readonly dataSource: DataSource,
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

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const repo = manager.getRepository(ChartOfAccount);
      const account = await repo.save(repo.create({
        code: dto.code, name: dto.name, type: dto.type, parentId: dto.parentId ?? null,
        description: dto.description ?? null, isActive: true, isSystem: false, isPostable: true,
        openingBalance: opening, createdBy: actor,
      } as any)) as unknown as ChartOfAccount;

      if (toMinorUnits(opening) !== 0n) {
        await this.posting.postOpeningBalance({
          accountId: account.id, sourceRef: account.code,
          amount: opening,
          entryDate: dto.openingBalanceDate ?? new Date().toISOString().slice(0, 10),
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
    ].includes(id);
  }

  async list(filter: { type?: string; activeOnly?: boolean; postableOnly?: boolean }): Promise<ChartOfAccount[]> {
    const qb = this.coaRepo.createQueryBuilder('a');
    if (filter.type) qb.andWhere('a.type = :type', { type: filter.type });
    if (filter.activeOnly) qb.andWhere('a.isActive = true');
    if (filter.postableOnly) qb.andWhere('a.isPostable = true');
    return qb.orderBy('a.code', 'ASC').getMany();
  }

  async findTree(filter?: { search?: string }): Promise<any[]> {
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
    // account, not only the ones a search happens to match.
    const q = filter?.search?.trim().toLowerCase();
    if (!q) return tree;
    return this.pruneTree(tree, q);
  }

  // Keeps a node if it matches, or if any descendant matches — so a matching
  // leaf is shown with its ancestor path intact. Non-matching siblings drop out.
  private pruneTree(nodes: any[], q: string): any[] {
    const out: any[] = [];
    for (const n of nodes) {
      const kids = this.pruneTree(n.children, q);
      const self = n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q);
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
