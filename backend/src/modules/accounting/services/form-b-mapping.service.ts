// backend/src/modules/accounting/services/form-b-mapping.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
      const family = this.familyOf(account.type);
      const mapped = this.mappedOf(account);

      // A non-P&L account can still carry a stale mapping; surface it so it can
      // be cleared, with a reason its family check will supply.
      const effectiveFamily: CategoryFamily = family
        ?? (account.formBExpenseCategory ? 'expense' : 'income');

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
   * `null` clears; anything else assigns and requires WRITE eligibility.
   *
   * Clearing nulls whichever columns are populated rather than resolving the
   * column from the account's current type — a clear must work on an account
   * whose type is itself wrong, or an expense category stranded on an account
   * since flipped to Income would be unremovable.
   */
  async setCategory(accountId: string, category: string | null): Promise<void> {
    const ctx = await this.context();
    const account = (ctx.accounts as any[]).find((a) => a.id === accountId);
    if (!account) throw new BadRequestException(`Account ${accountId} not found`);

    if (category === null) {
      await this.coaRepo.update(accountId, {
        formBExpenseCategory: null, formBIncomeCategory: null,
      } as any);
      return;
    }

    const family: CategoryFamily | null = EXPENSE_VALUES.has(category) ? 'expense'
      : INCOME_VALUES.has(category) ? 'income' : null;
    if (family === null) throw new BadRequestException(`Unknown Form B category: ${category}`);

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
        `Account ${account.code} cannot be mapped to ${category}: ${verdict.reason}`,
      );
    }

    await this.coaRepo.update(accountId, family === 'expense'
      ? { formBExpenseCategory: category, formBIncomeCategory: null }
      : { formBIncomeCategory: category, formBExpenseCategory: null } as any);
  }
}
