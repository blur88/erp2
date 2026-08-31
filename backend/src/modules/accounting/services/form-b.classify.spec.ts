import { classifyFormB, type ClassifiableAccount } from './form-b.classify';
import { FormBExpenseCategory, FormBIncomeCategory } from '../entities/form-b-category.enum';
import type { AccountMovement } from './profit-and-loss.types';

const COGS = 'cogs-root';
const REV = 'rev-root';

const account = (over: Partial<ClassifiableAccount> = {}): ClassifiableAccount => ({
  id: 'a1', code: '6100', name: 'Salaries', type: 'Expense',
  isPostable: true, isActive: true, parentId: null,
  formBExpenseCategory: null, formBIncomeCategory: null, ...over,
});

const move = (accountId: string, ordinary: bigint, stockAdjustment = 0n): AccountMovement =>
  ({ accountId, ordinary, stockAdjustment });

const run = (accounts: ClassifiableAccount[], movements: AccountMovement[]) =>
  classifyFormB({
    accounts: [
      ...accounts,
      { ...account({ id: COGS, code: '5000', name: 'Cost of Sales', isPostable: false }) },
      { ...account({ id: REV, code: '4000', name: 'Income', type: 'Income', isPostable: false }) },
    ],
    movements,
    graph: new Map(
      [...accounts, { id: COGS, parentId: null }, { id: REV, parentId: null }]
        .map((a: any) => [a.id, { id: a.id, parentId: a.parentId ?? null }]),
    ),
    cogsAccountId: COGS,
    salesRevenueAccountId: REV,
    cyclicIds: new Set<string>(),
    danglingIds: new Set<string>(),
  });

describe('classifyFormB', () => {
  it('routes a mapped expense account to its category line', () => {
    const a = account({ formBExpenseCategory: FormBExpenseCategory.SALARIES_AND_WAGES });
    const r = run([a], [move('a1', 5000n)]);
    expect(r.byLine.get('N16')).toEqual([
      { accountId: 'a1', code: '6100', name: 'Salaries', isActive: true,
        category: 'SALARIES_AND_WAGES', assignment: 'explicit', amount: '0.5000' },
    ]);
  });

  it('routes a mapped income account to its category line', () => {
    const a = account({ id: 'i1', code: '4200', name: 'Rental', type: 'Income',
      formBIncomeCategory: FormBIncomeCategory.RENT_ROYALTIES_PREMIUMS });
    const r = run([a], [move('i1', 7000n)]);
    expect(r.byLine.get('N12')!.map((x) => x.accountId)).toEqual(['i1']);
  });

  it('falls an unmapped expense account back to N24 and reports it', () => {
    const a = account({ id: 'u1', code: '6990', name: 'Sundry' });
    const r = run([a], [move('u1', 1234n)]);
    expect(r.byLine.get('N24')!.map((x) => x.assignment)).toEqual(['fallback']);
    expect(r.byLine.get('N24')![0].category).toBeNull();
    expect(r.fallbackExpense.map((x) => x.accountId)).toEqual(['u1']);
  });

  it('keeps an explicitly-mapped OTHER_EXPENSES account distinguishable from a fallback', () => {
    const explicit = account({ id: 'e1', code: '6800', name: 'Misc',
      formBExpenseCategory: FormBExpenseCategory.OTHER_EXPENSES });
    const fallback = account({ id: 'f1', code: '6990', name: 'Sundry' });
    const r = run([explicit, fallback], [move('e1', 100n), move('f1', 200n)]);
    const n24 = r.byLine.get('N24')!;
    expect(n24.find((x) => x.accountId === 'e1')!.assignment).toBe('explicit');
    expect(n24.find((x) => x.accountId === 'f1')!.assignment).toBe('fallback');
    expect(r.fallbackExpense.map((x) => x.accountId)).toEqual(['f1']);
  });

  // Spec §5.4 — the second double-count path, and the one the COGS boundary
  // does NOT cover. A stock adjustment posted through a non-COGS expense
  // account reaches N7 by its INVENTORY leg; its EXPENSE leg is what
  // profit-and-loss.classify.ts claims into inventoryAdjustments. Classifying
  // that expense leg here too would count it a third time.
  it('classifies ONLY the ordinary component of a mapped expense account', () => {
    const a = account({ formBExpenseCategory: FormBExpenseCategory.SALARIES_AND_WAGES });
    const r = run([a], [move('a1', 5000n, 9999n)]);
    expect(r.byLine.get('N16')![0].amount).toBe('0.5000');
  });

  it('classifies ONLY the ordinary component of a fallback expense account', () => {
    const a = account({ id: 'u1', code: '6990', name: 'Sundry' });
    const r = run([a], [move('u1', 1000n, 8888n)]);
    expect(r.byLine.get('N24')![0].amount).toBe('0.1000');
  });

  it('omits an account whose ordinary movement is zero even if it has adjustments', () => {
    const a = account({ id: 'z1', code: '6990', name: 'Sundry' });
    const r = run([a], [move('z1', 0n, 5000n)]);
    expect(r.byLine.get('N24') ?? []).toEqual([]);
    expect(r.fallbackExpense).toEqual([]);
  });

  it('excludes a mapped-but-ineligible account and reports its reason', () => {
    const bad = account({ id: 'b1', code: '5100', name: 'COGS child', parentId: COGS,
      formBExpenseCategory: FormBExpenseCategory.RENT_LEASE });
    const r = run([bad], [move('b1', 4000n)]);
    expect(r.byLine.get('N17') ?? []).toEqual([]);
    expect(r.ineligible).toEqual([
      { accountId: 'b1', code: '5100', name: 'COGS child', reason: 'DESCENDANT_OF_EXCLUDED_ROOT' },
    ]);
  });

  // Report mode admits inactive accounts (spec §4.2.1): a mapping made while
  // active must keep classifying historical years after deactivation.
  it('classifies an INACTIVE mapped account and flags it on the ref', () => {
    const a = account({ isActive: false,
      formBExpenseCategory: FormBExpenseCategory.SALARIES_AND_WAGES });
    const r = run([a], [move('a1', 5000n)]);
    expect(r.byLine.get('N16')![0].isActive).toBe(false);
    expect(r.ineligible).toEqual([]);
  });

  it('never routes a COGS or Sales Revenue descendant into a mapped line', () => {
    const cogsChild = account({ id: 'c1', code: '5100', name: 'COGS child', parentId: COGS });
    const revChild = account({ id: 'r1', code: '4100', name: 'Sales', type: 'Income', parentId: REV });
    const r = run([cogsChild, revChild], [move('c1', 100n), move('r1', 200n)]);
    expect(r.byLine.get('N24') ?? []).toEqual([]);
    expect(r.byLine.get('N13') ?? []).toEqual([]);
    expect(r.fallbackExpense).toEqual([]);
    expect(r.fallbackIncome).toEqual([]);
  });
});
