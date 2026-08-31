import { isDescendantOf, type GraphNode } from './profit-and-loss.graph';

export type EligibilityReason =
  | 'NOT_EXPENSE_TYPE'
  | 'NOT_INCOME_TYPE'
  | 'NOT_POSTABLE'
  | 'INACTIVE'
  | 'IS_CONFIGURED_ROOT'
  | 'DESCENDANT_OF_EXCLUDED_ROOT'
  | 'GRAPH_FAULT';

/**
 * `write` governs whether a mapping may be SET; `report` governs whether a
 * mapped account's movement is CLASSIFIED. They differ on isActive ONLY.
 */
export type EligibilityMode = 'write' | 'report';

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: EligibilityReason };

export type CategoryFamily = 'expense' | 'income';

export interface EligibilityAccount {
  id: string;
  type: string;
  isPostable: boolean;
  isActive: boolean;
  parentId: string | null;
}

export function checkEligibility(input: {
  account: EligibilityAccount;
  family: CategoryFamily;
  mode: EligibilityMode;
  graph: Map<string, GraphNode>;
  /** cogsAccountId for expenses, salesRevenueAccountId for income. */
  excludedRootId: string | null;
  cyclicIds: ReadonlySet<string>;
  danglingIds: ReadonlySet<string>;
}): EligibilityResult {
  const { account, family, mode, graph, excludedRootId, cyclicIds, danglingIds } =
    input;

  const requiredType = family === 'expense' ? 'Expense' : 'Income';
  if (account.type !== requiredType) {
    return {
      eligible: false,
      reason: family === 'expense' ? 'NOT_EXPENSE_TYPE' : 'NOT_INCOME_TYPE',
    };
  }

  if (!account.isPostable) return { eligible: false, reason: 'NOT_POSTABLE' };

  // The one rule that differs by mode. Report mode admits inactive accounts so
  // a mapping made while active keeps classifying historical years.
  if (mode === 'write' && !account.isActive) {
    return { eligible: false, reason: 'INACTIVE' };
  }

  // A malformed chain makes descent unknowable. Ineligible and REPORTED, never
  // assumed benign — the account could be inside the excluded subtree.
  if (cyclicIds.has(account.id) || danglingIds.has(account.id)) {
    return { eligible: false, reason: 'GRAPH_FAULT' };
  }

  if (excludedRootId !== null) {
    if (account.id === excludedRootId) {
      return { eligible: false, reason: 'IS_CONFIGURED_ROOT' };
    }
    if (isDescendantOf(account.id, excludedRootId, graph)) {
      return { eligible: false, reason: 'DESCENDANT_OF_EXCLUDED_ROOT' };
    }
  }

  return { eligible: true };
}
