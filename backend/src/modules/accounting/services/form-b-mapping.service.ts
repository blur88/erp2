// backend/src/modules/accounting/services/form-b-mapping.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountingSettingsService } from './accounting-settings.service';
import { FormBExpenseCategory, FormBIncomeCategory } from '../entities/form-b-category.enum';
import { detectCycles, detectDanglingParents, type GraphNode } from './profit-and-loss.graph';
import {
  checkEligibility, type CategoryFamily, type EligibilityResult,
} from './form-b.eligibility';
import type { FormBCategory } from './form-b.types';

export interface FormBMappingRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  category: FormBCategory | null;
  eligibility: EligibilityResult;
}

const EXPENSE_VALUES = new Set<string>(Object.values(FormBExpenseCategory));
const INCOME_VALUES = new Set<string>(Object.values(FormBIncomeCategory));

@Injectable()
export class FormBMappingService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly settings: AccountingSettingsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private async context() {
    const [accounts, settings] = await Promise.all([
      this.coaRepo.find({ order: { code: 'ASC' } }),
      this.settings.get(),
    ]);
    const nodes: GraphNode[] = accounts.map((a: any) => ({ id: a.id, parentId: a.parentId }));
    return {
      accounts,
      graph: new Map(nodes.map((n) => [n.id, n])),
      cyclicIds: new Set(detectCycles(nodes)),
      danglingIds: new Set(detectDanglingParents(nodes)),
      cogsAccountId: (settings as any).cogsAccountId ?? null,
      salesRevenueAccountId: (settings as any).salesRevenueAccountId ?? null,
    };
  }

  private familyOf(type: string): CategoryFamily | null {
    return type === 'Expense' ? 'expense' : type === 'Income' ? 'income' : null;
  }

  private mappedOf(account: any): FormBCategory | null {
    return account.formBExpenseCategory ?? account.formBIncomeCategory ?? null;
  }

  /**
   * Every write-eligible account, PLUS every account with either mapping column
   * populated — whatever its state.
   *
   * The second predicate is persistence, not eligibility. Mappings outlive
   * deactivation, and one can also be made invalid by a route validation never
   * saw (direct SQL, or a row written before the column existed). Selecting on
   * "has a mapping" is the only predicate that still holds when the account
   * itself is incoherent — and without it, an ineligible mapped account is
   * excluded from the report AND absent from the only screen that could clear
   * it.
   *
   * There is deliberately no `dormant` field: dormancy is zero movement in a
   * selected year, and this endpoint has no year.
   */
  async list(): Promise<FormBMappingRow[]> {
    const ctx = await this.context();
    const rows: FormBMappingRow[] = [];

    for (const account of ctx.accounts as any[]) {
      const mapped = this.mappedOf(account);

      /*
       * Eligibility is judged against the family the STORED mapping belongs to,
       * falling back to the account's type only when unmapped.
       *
       * Deriving it from the type would judge a corrupted row healthy: an
       * Income account still holding a formBExpenseCategory would be checked as
       * 'income', pass, and render with an editable category select — hiding
       * the very defect this list exists to expose. Following the mapping makes
       * it fail as NOT_INCOME_TYPE, so the row renders clear-only with a reason.
       *
       * Matches form-b.classify.ts, which adjudicates the same way.
       */
      const effectiveFamily: CategoryFamily =
        account.formBExpenseCategory ? 'expense'
        : account.formBIncomeCategory ? 'income'
        : (this.familyOf(account.type) ?? 'expense');

      const eligibility = checkEligibility({
        account: {
          id: account.id, type: account.type, isPostable: account.isPostable,
          isActive: account.isActive, parentId: account.parentId,
        },
        family: effectiveFamily,
        mode: 'write',
        graph: ctx.graph,
        excludedRootId: effectiveFamily === 'expense'
          ? ctx.cogsAccountId : ctx.salesRevenueAccountId,
        cyclicIds: ctx.cyclicIds,
        danglingIds: ctx.danglingIds,
      });

      if (!eligibility.eligible && mapped === null) continue;

      rows.push({
        accountId: account.id, code: account.code, name: account.name,
        type: account.type, isActive: account.isActive,
        category: mapped, eligibility,
      });
    }

    return rows;
  }

  /**
   * Resolves one mapping edit against an already-built context into the column
   * patch it implies, throwing if the edit is not permitted.
   *
   * Split out of setCategory so the bulk path can validate every item against
   * ONE context snapshot before writing any of them. context() does a full
   * chart-of-accounts read plus a settings read, so calling setCategory in a
   * loop would issue N of those.
   */
  private resolveUpdate(
    ctx: Awaited<ReturnType<FormBMappingService['context']>>,
    item: { accountId: string; category: string | null },
  ): { accountId: string; patch: Record<string, string | null> } {
    const account = (ctx.accounts as any[]).find((a) => a.id === item.accountId);
    // An unknown account has no code to name, so it is identified by the id
    // that was submitted — matching the single-row route's wording.
    if (!account) throw new BadRequestException(`Account ${item.accountId} not found`);

    if (item.category === null) {
      return {
        accountId: item.accountId,
        patch: { formBExpenseCategory: null, formBIncomeCategory: null },
      };
    }

    const family: CategoryFamily | null = EXPENSE_VALUES.has(item.category) ? 'expense'
      : INCOME_VALUES.has(item.category) ? 'income' : null;
    if (family === null) {
      throw new BadRequestException(`Unknown Form B category: ${item.category}`);
    }

    const verdict = checkEligibility({
      account: {
        id: account.id, type: account.type, isPostable: account.isPostable,
        isActive: account.isActive, parentId: account.parentId,
      },
      family,
      mode: 'write',
      graph: ctx.graph,
      excludedRootId: family === 'expense' ? ctx.cogsAccountId : ctx.salesRevenueAccountId,
      cyclicIds: ctx.cyclicIds,
      danglingIds: ctx.danglingIds,
    });

    if (verdict.eligible === false) {
      throw new BadRequestException(
        `Account ${account.code} cannot be mapped to ${item.category}: ${verdict.reason}`,
      );
    }

    return {
      accountId: item.accountId,
      patch: family === 'expense'
        ? { formBExpenseCategory: item.category, formBIncomeCategory: null }
        : { formBIncomeCategory: item.category, formBExpenseCategory: null },
    };
  }

  /**
   * `null` clears; anything else assigns and requires WRITE eligibility.
   *
   * Clearing nulls whichever columns are populated rather than resolving the
   * column from the account's current type — a clear must work on an account
   * whose type is itself wrong, or an expense category stranded on an account
   * since flipped to Income would be unremovable.
   */
  async setCategory(accountId: string, category: string | null): Promise<void> {
    const ctx = await this.context();
    const { patch } = this.resolveUpdate(ctx, { accountId, category });
    await this.coaRepo.update(accountId, patch as any);
  }

  /**
   * Apply many mapping edits atomically.
   *
   * Two phases, deliberately separate. Every item is validated against ONE
   * context snapshot first, so an invalid item aborts before the write phase
   * opens a transaction at all. The writes then run inside a single
   * transaction, through the transaction's own manager — the injected coaRepo
   * runs on the default connection and its writes would not roll back with it.
   */
  async setCategories(
    items: { accountId: string; category: string | null }[],
  ): Promise<FormBMappingRow[]> {
    const ctx = await this.context();
    const resolved = items.map((item) => this.resolveUpdate(ctx, item));

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ChartOfAccount);
      for (const { accountId, patch } of resolved) {
        await repo.update(accountId, patch as any);
      }
    });

    return this.list();
  }
}
