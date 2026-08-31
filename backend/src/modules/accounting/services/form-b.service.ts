import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntryLine } from '../entities/journal-entry-line.entity';
import { AccountBalanceService } from './account-balance.service';
import { AccountingSettingsService } from './accounting-settings.service';
import { ProfitAndLossService } from './profit-and-loss.service';
import { FormBSettingsService } from './form-b-settings.service';
import { toMinorUnits } from '@/common/utils/money';
import type { PlAccount } from './profit-and-loss.types';

export type RootStatus =
  | { ok: true; id: string }
  | { ok: false; kind: 'missing' }
  | { ok: false; kind: 'invalid'; detail: 'notFound' | 'wrongType' | 'dangling' | 'cyclic' };

@Injectable()
export class FormBService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntryLine) private readonly lineRepo: Repository<JournalEntryLine>,
    private readonly balance: AccountBalanceService,
    private readonly settings: AccountingSettingsService,
    private readonly accountingReport: ProfitAndLossService,
    private readonly identity: FormBSettingsService,
  ) {}

  /**
   * A configured root must be proven sound BEFORE it is used, because
   * getRollup() walks children recursively with no visited set
   * (account-balance.service.ts:40): a cyclic subtree is unbounded recursion,
   * and a dangling or wrong-type root would yield a confidently wrong number.
   *
   * `missing` and `invalid` are kept distinct: the first is an unfinished setup
   * the user completes, the second means the chart itself is malformed.
   */
  validateRoot(input: {
    id: string | null;
    expectedType: string;
    accounts: PlAccount[];
    cyclicIds: ReadonlySet<string>;
    danglingIds: ReadonlySet<string>;
  }): RootStatus {
    const { id, expectedType, accounts, cyclicIds, danglingIds } = input;
    if (id === null) return { ok: false, kind: 'missing' };

    const root = accounts.find((a) => a.id === id);
    if (!root) return { ok: false, kind: 'invalid', detail: 'notFound' };
    if (root.type !== expectedType) return { ok: false, kind: 'invalid', detail: 'wrongType' };

    // Walk the subtree with an explicit visited set — the traversal that checks
    // for a cycle must itself terminate on one.
    const childrenOf = new Map<string, string[]>();
    for (const a of accounts) {
      if (a.parentId === null) continue;
      const siblings = childrenOf.get(a.parentId);
      if (siblings) siblings.push(a.id);
      else childrenOf.set(a.parentId, [a.id]);
    }

    const seen = new Set<string>();
    const stack = [id];
    let sawCycle = false;
    let sawDangling = false;
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      if (cyclicIds.has(current)) sawCycle = true;
      if (danglingIds.has(current)) sawDangling = true;
      for (const child of childrenOf.get(current) ?? []) stack.push(child);
    }

    // Cycle wins: it is the fault that makes traversal itself unsafe.
    if (sawCycle) return { ok: false, kind: 'invalid', detail: 'cyclic' };
    if (sawDangling) return { ok: false, kind: 'invalid', detail: 'dangling' };
    return { ok: true, id };
  }

  /** Every account id in a subtree, cycle-safe. */
  subtreeIds(rootId: string, accounts: PlAccount[]): Set<string> {
    const childrenOf = new Map<string, string[]>();
    for (const a of accounts) {
      if (a.parentId === null) continue;
      const siblings = childrenOf.get(a.parentId);
      if (siblings) siblings.push(a.id);
      else childrenOf.set(a.parentId, [a.id]);
    }
    const ids = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (ids.has(current)) continue;
      ids.add(current);
      for (const child of childrenOf.get(current) ?? []) stack.push(child);
    }
    return ids;
  }

  /**
   * N5 — retail purchases: net Inventory-subtree movement for the year from
   * PURCHASE_ORDER-sourced entries. Debits minus credits, so PURCHASE_RECEIVE
   * adds and PURCHASE_REFUND subtracts.
   *
   * ONE query with FILTER, following getMovements()'s pattern, so the two
   * directions cannot drift apart.
   */
  async getInventoryPurchases(
    from: string, to: string, inventoryIds: Set<string>,
  ): Promise<bigint> {
    if (inventoryIds.size === 0) return 0n;
    const row = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('journal_entry', 'e', 'e.id = l."entryId"')
      .select('COALESCE(SUM(l.debit),0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
      .where('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL')
      .andWhere('e."entryDate" >= :from', { from })
      .andWhere('e."entryDate" <= :to', { to })
      .andWhere(`e."sourceType" = 'PURCHASE_ORDER'`)
      .andWhere('l."accountId" IN (:...ids)', { ids: [...inventoryIds] })
      .getRawOne<{ debit: string; credit: string }>();
    return toMinorUnits(row?.debit ?? '0') - toMinorUnits(row?.credit ?? '0');
  }

  /**
   * Reconciliation term (c) — measured on the INVENTORY leg: credits minus
   * debits, so outflow is positive and the term is directly comparable to N7.
   *
   * Not the Owner Drawings subtree. (c) is a partition of N7, so it must be
   * measured the way N7 is. The postingType filter excludes cash drawings,
   * which share sourceType OWNER_EQUITY but never touch Inventory.
   */
  async getOwnerStockDrawings(
    from: string, to: string, inventoryIds: Set<string>,
  ): Promise<bigint> {
    if (inventoryIds.size === 0) return 0n;
    const row = await this.lineRepo.createQueryBuilder('l')
      .innerJoin('journal_entry', 'e', 'e.id = l."entryId"')
      .select('COALESCE(SUM(l.debit),0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
      .where('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL')
      .andWhere('e."entryDate" >= :from', { from })
      .andWhere('e."entryDate" <= :to', { to })
      .andWhere(`e."sourceType" = 'OWNER_EQUITY'`)
      .andWhere(`e."postingType" = 'OWNER_STOCK_DRAWING'`)
      .andWhere('l."accountId" IN (:...ids)', { ids: [...inventoryIds] })
      .getRawOne<{ debit: string; credit: string }>();
    return toMinorUnits(row?.credit ?? '0') - toMinorUnits(row?.debit ?? '0');
  }
}
