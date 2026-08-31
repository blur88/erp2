import { checkEligibility, type EligibilityAccount } from './form-b.eligibility';
import type { GraphNode } from './profit-and-loss.graph';

const COGS = 'cogs-root';
const acct = (over: Partial<EligibilityAccount> = {}): EligibilityAccount => ({
  id: 'a1',
  type: 'Expense',
  isPostable: true,
  isActive: true,
  parentId: null,
  ...over,
});

const graphOf = (nodes: GraphNode[]) => new Map(nodes.map((n) => [n.id, n]));

const check = (
  account: EligibilityAccount,
  over: Partial<Parameters<typeof checkEligibility>[0]> = {},
) =>
  checkEligibility({
    account,
    family: 'expense',
    mode: 'write',
    graph: graphOf([
      { id: account.id, parentId: account.parentId },
      { id: COGS, parentId: null },
    ]),
    excludedRootId: COGS,
    cyclicIds: new Set<string>(),
    danglingIds: new Set<string>(),
    ...over,
  });

describe('checkEligibility', () => {
  it('accepts an active postable expense account outside the excluded subtree', () => {
    expect(check(acct())).toEqual({ eligible: true });
  });

  it('rejects a wrong-type account per family', () => {
    expect(check(acct({ type: 'Income' }))).toEqual({
      eligible: false,
      reason: 'NOT_EXPENSE_TYPE',
    });
    expect(check(acct({ type: 'Expense' }), { family: 'income' })).toEqual({
      eligible: false,
      reason: 'NOT_INCOME_TYPE',
    });
  });

  it('rejects a non-postable account', () => {
    expect(check(acct({ isPostable: false }))).toEqual({
      eligible: false,
      reason: 'NOT_POSTABLE',
    });
  });

  it('rejects the configured root itself', () => {
    expect(check(acct({ id: COGS }))).toEqual({
      eligible: false,
      reason: 'IS_CONFIGURED_ROOT',
    });
  });

  it('rejects a descendant of the excluded root', () => {
    const child = acct({ id: 'child', parentId: COGS });
    expect(check(child)).toEqual({
      eligible: false,
      reason: 'DESCENDANT_OF_EXCLUDED_ROOT',
    });
  });

  it('rejects an account in a cyclic or dangling chain', () => {
    expect(check(acct(), { cyclicIds: new Set(['a1']) })).toEqual({
      eligible: false,
      reason: 'GRAPH_FAULT',
    });
    expect(check(acct(), { danglingIds: new Set(['a1']) })).toEqual({
      eligible: false,
      reason: 'GRAPH_FAULT',
    });
  });

  // The mode split (spec §4.2.1). A single policy would corrupt history: an
  // account mapped in 2025 and deactivated in 2026 would have its 2025 movement
  // swept into the N24 fallback on a re-run, changing a filed figure.
  it('rejects an inactive account for WRITE but accepts it for REPORT', () => {
    const inactive = acct({ isActive: false });
    expect(check(inactive)).toEqual({ eligible: false, reason: 'INACTIVE' });
    expect(check(inactive, { mode: 'report' })).toEqual({ eligible: true });
  });

  // An unset root cannot be used to prove non-membership, so nothing is
  // excluded on that basis — the SERVICE refuses to classify at all in that
  // case (Task 7), rather than this helper guessing.
  it('does not exclude on subtree membership when the root is unset', () => {
    expect(check(acct({ parentId: null }), { excludedRootId: null })).toEqual({
      eligible: true,
    });
  });
});
