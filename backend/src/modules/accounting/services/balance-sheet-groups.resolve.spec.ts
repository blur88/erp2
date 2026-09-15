import { BadRequestException } from '@nestjs/common';
import {
  BalanceSheetGroup,
  assertNoLineConflicts,
  effectiveLines,
  type GroupAssignment,
} from './balance-sheet-groups.resolve';

const CASH = 'acct-cash';
const BANK = 'acct-bank';
const MAYBANK = 'acct-maybank';
const SUPPLIER_DEPOSIT = 'acct-supplier-deposit';
const ATOME = 'acct-atome';
const INVENTORY = 'acct-inventory';

const settings = (over: Record<string, string | null> = {}) => ({
  cashAccountId: CASH,
  bankAccountId: BANK,
  inventoryAccountId: INVENTORY,
  supplierDepositAccountId: SUPPLIER_DEPOSIT,
  ...over,
});

const bank = (...ids: string[]): GroupAssignment[] =>
  ids.map((accountId) => ({ accountId, group: BalanceSheetGroup.BANK_BALANCE }));
const other = (...ids: string[]): GroupAssignment[] =>
  ids.map((accountId) => ({ accountId, group: BalanceSheetGroup.OTHER_CURRENT_ASSETS }));

const linesFor = (groups: GroupAssignment[], over = {}) =>
  effectiveLines({ settingsAccountIds: settings(over), groups });

describe('effectiveLines', () => {
  it('falls back to the settings key when a group is empty', () => {
    const lines = linesFor([]);
    expect(lines.get(BANK)).toEqual(new Set(['N38']));
    expect(lines.get(SUPPLIER_DEPOSIT)).toEqual(new Set(['N39']));
  });

  it('a non-empty group REPLACES its fallback rather than unioning with it', () => {
    const lines = linesFor(bank(MAYBANK));
    expect(lines.get(MAYBANK)).toEqual(new Set(['N38']));
    // The whole point of replacement: the default bank account drops out of
    // N38 entirely. A union rule would leave it pinned there forever.
    expect(lines.get(BANK)).toBeUndefined();
  });

  it('keeps unconditional settings keys on their line regardless of groups', () => {
    const lines = linesFor(bank(MAYBANK, BANK));
    expect(lines.get(CASH)).toEqual(new Set(['N37']));
    expect(lines.get(INVENTORY)).toEqual(new Set(['N34']));
  });
});

describe('assertNoLineConflicts', () => {
  const check = (groups: GroupAssignment[], over = {}) => () =>
    assertNoLineConflicts({ settingsAccountIds: settings(over), groups });

  describe('same-line overlap is legal', () => {
    // The two cases the first-draft rule wrongly rejected. Keeping the default
    // contributor is the documented remedy for it dropping out of the line, so
    // these must pass or that remedy is unreachable.
    it('accepts the bank default inside the N38 group', () => {
      expect(check(bank(BANK, MAYBANK))).not.toThrow();
    });

    it('accepts the supplier deposit default inside the N39 group', () => {
      expect(check(other(SUPPLIER_DEPOSIT, ATOME))).not.toThrow();
    });
  });

  describe('cross-line conflicts are rejected', () => {
    it('rejects the bank default in N39 while the N38 group is EMPTY', () => {
      // Empty N38 group leaves the bank fallback contributing to N38, so N39
      // membership is a genuine two-line assignment.
      expect(check(other(BANK))).toThrow(BadRequestException);
      expect(check(other(BANK))).toThrow(/N38 and N39/);
    });

    it('ACCEPTS the bank default in N39 when a non-empty N38 group excludes it', () => {
      // The correction that matters: a non-empty N38 group displaces the bank
      // fallback, so the account contributes to N39 only.
      expect(check([...bank(MAYBANK), ...other(BANK)])).not.toThrow();
    });

    it('rejects the bank default in N39 when the N38 group CONTAINS it', () => {
      expect(check([...bank(BANK), ...other(BANK)])).toThrow(BadRequestException);
    });

    it('ACCEPTS the supplier deposit in N38 when a non-empty N39 group excludes it', () => {
      expect(check([...other(ATOME), ...bank(SUPPLIER_DEPOSIT)])).not.toThrow();
    });

    it('rejects the supplier deposit in N38 while the N39 group is EMPTY', () => {
      expect(check(bank(SUPPLIER_DEPOSIT))).toThrow(/N38 and N39/);
    });

    it('rejects the cash account in either group unconditionally', () => {
      // cashAccountId has no group to be displaced by, so N37 always stands.
      expect(check(bank(CASH))).toThrow(/N37 and N38/);
      expect(check(other(CASH))).toThrow(/N37 and N39/);
    });

    it('rejects an account placed in BOTH groups', () => {
      expect(check([...bank(ATOME), ...other(ATOME)])).toThrow(/N38 and N39/);
    });
  });

  describe('fallback reactivation on transition', () => {
    /*
     * The cases that only a post-write effective-assignment rule can catch.
     * Each starts from a legal state and reaches an illegal one by EMPTYING a
     * group — no account is added or moved. A validator reading raw settings
     * membership, or one reading pre-write group state, passes both.
     */
    it('rejects emptying the N38 group while the bank default sits in N39', () => {
      const legal = [...bank(MAYBANK), ...other(BANK)];
      expect(check(legal)).not.toThrow();

      // Emptying N38 re-arms the bank fallback to N38; BANK is now on N38+N39.
      expect(check(other(BANK))).toThrow(/N38 and N39/);
    });

    it('rejects emptying the N39 group while the supplier deposit sits in N38', () => {
      const legal = [...other(ATOME), ...bank(SUPPLIER_DEPOSIT)];
      expect(check(legal)).not.toThrow();

      expect(check(bank(SUPPLIER_DEPOSIT))).toThrow(/N38 and N39/);
    });
  });

  describe('settings-side changes', () => {
    it('rejects pointing bankAccountId at an account already in N39', () => {
      // Legal before: ATOME is only in N39 and bankAccountId is elsewhere.
      expect(check(other(ATOME))).not.toThrow();
      // Emptying N38 is what re-arms the fallback onto ATOME.
      expect(check(other(ATOME), { bankAccountId: ATOME })).toThrow(/N38 and N39/);
    });

    it('accepts pointing bankAccountId at an N39 account when N38 is non-empty', () => {
      expect(
        check([...bank(MAYBANK), ...other(ATOME)], { bankAccountId: ATOME }),
      ).not.toThrow();
    });

    it('rejects pointing cashAccountId at a grouped account', () => {
      expect(check(bank(MAYBANK), { cashAccountId: MAYBANK })).toThrow(/N37 and N38/);
    });
  });

  it('names every conflicting account, not just the first', () => {
    /*
     * Two INDEPENDENT conflicts. Both are unconditional-key collisions, which
     * is what keeps them independent: an account in CASH's or INVENTORY's key
     * conflicts with any group membership no matter what the other group
     * holds. (A first attempt here used the bank default in N39 as the second
     * conflict — a non-empty N38 group displaces the fallback, so it is legal
     * and the fixture proved the replacement rule instead of the message.)
     */
    let message = '';
    try {
      assertNoLineConflicts(
        {
          settingsAccountIds: settings(),
          groups: [...bank(CASH), ...other(INVENTORY)],
        },
        (id) => `CODE-${id}`,
      );
    } catch (err: any) {
      message = err.message;
    }
    expect(message).toContain(`CODE-${CASH}`);
    expect(message).toContain(`CODE-${INVENTORY}`);
  });
});
