import { formatScale4 } from '@/common/utils/money';
import type { GraphNode } from './profit-and-loss.graph';
import type { AccountMovement } from './profit-and-loss.types';
import {
  checkEligibility, type CategoryFamily, type EligibilityAccount,
} from './form-b.eligibility';
import {
  EXPENSE_CATEGORY_LINE, INCOME_CATEGORY_LINE,
  EXPENSE_FALLBACK_LINE, INCOME_FALLBACK_LINE,
} from './form-b.categories';
import type { FormBExpenseCategory, FormBIncomeCategory } from '../entities/form-b-category.enum';
import type { FormBAccountRef, FormBFindingAccount } from './form-b.types';

export interface ClassifiableAccount extends EligibilityAccount {
  code: string;
  name: string;
  formBExpenseCategory: FormBExpenseCategory | null;
  formBIncomeCategory: FormBIncomeCategory | null;
}

export interface FormBClassifyResult {
  /** Form B line -> the accounts contributing to it. */
  byLine: Map<string, FormBAccountRef[]>;
  /** Mapped accounts excluded by report-mode eligibility, with their reason. */
  ineligible: FormBFindingAccount[];
  /** Unmapped contributors, for the §6 warning. Non-zero movement only. */
  fallbackExpense: FormBAccountRef[];
  fallbackIncome: FormBAccountRef[];
}

/**
 * Classification owns ALL arithmetic; presentation re-reads these buckets and
 * never re-walks balances (mirrors profit-and-loss.classify.ts).
 *
 * Only the ORDINARY movement component is classified. The stockAdjustment
 * component is excluded because it already reaches the report twice over: its
 * Inventory leg is absorbed by N7 = N4 + N5 - N6, and its Expense leg is what
 * profit-and-loss.classify.ts claims into inventoryAdjustments (reconciliation
 * term (b), nested in (a)). Adding it here would be a third appearance.
 */
export function classifyFormB(input: {
  accounts: ClassifiableAccount[];
  movements: AccountMovement[];
  graph: Map<string, GraphNode>;
  cogsAccountId: string | null;
  salesRevenueAccountId: string | null;
  cyclicIds: ReadonlySet<string>;
  danglingIds: ReadonlySet<string>;
}): FormBClassifyResult {
  const {
    accounts, movements, graph, cogsAccountId, salesRevenueAccountId,
    cyclicIds, danglingIds,
  } = input;

  const byLine = new Map<string, FormBAccountRef[]>();
  const ineligible: FormBFindingAccount[] = [];
  const fallbackExpense: FormBAccountRef[] = [];
  const fallbackIncome: FormBAccountRef[] = [];

  const ordinaryOf = new Map(movements.map((m) => [m.accountId, m.ordinary]));

  const push = (line: string, ref: FormBAccountRef) => {
    const bucket = byLine.get(line);
    if (bucket) bucket.push(ref);
    else byLine.set(line, [ref]);
  };

  for (const account of accounts) {
    /*
     * The mapping is read from whichever column is POPULATED, not from the one
     * the account's current type implies.
     *
     * Type-derived selection silently misfiles a corrupted row: an Income
     * account still holding a formBExpenseCategory (written before a type
     * change, or by direct SQL) would read its income column as null, be judged
     * "unmapped", and land in the N13 fallback with no finding at all — the
     * exact silent misclassification the read-time defence exists to catch. It
     * also disagreed with the clear path in form-b-mapping.service.ts, which
     * always nulls both columns regardless of type.
     *
     * `family` follows the mapping when one exists, so eligibility is checked
     * against the family the stored category actually belongs to and the
     * mismatch surfaces as NOT_INCOME_TYPE / NOT_EXPENSE_TYPE.
     */
    const expenseMapping = account.formBExpenseCategory ?? null;
    const incomeMapping = account.formBIncomeCategory ?? null;
    const mapped = expenseMapping ?? incomeMapping;

    const typeFamily: CategoryFamily | null =
      account.type === 'Expense' ? 'expense'
      : account.type === 'Income' ? 'income'
      : null;

    const mappingFamily: CategoryFamily | null =
      expenseMapping !== null ? 'expense'
      : incomeMapping !== null ? 'income'
      : null;

    // A stored mapping is what must be adjudicated; only an unmapped account
    // falls back to its type. An account that is neither a P&L type nor mapped
    // is not this report's business.
    const family = mappingFamily ?? typeFamily;
    if (family === null) continue;

    const verdict = checkEligibility({
      account,
      family,
      mode: 'report',
      graph,
      excludedRootId: family === 'expense' ? cogsAccountId : salesRevenueAccountId,
      cyclicIds,
      danglingIds,
    });

    if (verdict.eligible === false) {
      // Only a MAPPED account is worth reporting. An ineligible unmapped one
      // (the Sales Revenue subtree, a structural parent) is simply not this
      // report's business and is silently skipped, exactly as the Accounting
      // View skips Asset and Equity movements.
      if (mapped !== null) {
        ineligible.push({
          accountId: account.id, code: account.code, name: account.name,
          reason: verdict.reason,
        });
      }
      continue;
    }

    // Zero ordinary movement contributes nothing and must not appear as a
    // contributor row or inflate the fallback warning (spec §6).
    const ordinary = ordinaryOf.get(account.id) ?? 0n;
    if (ordinary === 0n) continue;

    const ref: FormBAccountRef = {
      accountId: account.id,
      code: account.code,
      name: account.name,
      isActive: account.isActive,
      category: mapped,
      assignment: mapped === null ? 'fallback' : 'explicit',
      amount: formatScale4(ordinary),
    };

    if (mapped === null) {
      const line = family === 'expense' ? EXPENSE_FALLBACK_LINE : INCOME_FALLBACK_LINE;
      push(line, ref);
      (family === 'expense' ? fallbackExpense : fallbackIncome).push(ref);
    } else {
      const line = family === 'expense'
        ? EXPENSE_CATEGORY_LINE[mapped as FormBExpenseCategory]
        : INCOME_CATEGORY_LINE[mapped as FormBIncomeCategory];
      push(line, ref);
    }
  }

  return { byLine, ineligible, fallbackExpense, fallbackIncome };
}
