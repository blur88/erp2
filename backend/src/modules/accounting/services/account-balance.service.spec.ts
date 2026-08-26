import { AccountBalanceService } from './account-balance.service';
import { AccountType } from '../entities/account-type.enum';

describe('AccountBalanceService.naturalBalance', () => {
  const svc = new AccountBalanceService({} as any, {} as any);
  it('keeps sign for debit-normal (Asset/Expense)', () => {
    expect(svc.naturalBalance(AccountType.ASSET, 5000000n)).toBe(5000000n);
    expect(svc.naturalBalance(AccountType.EXPENSE, 3000000n)).toBe(3000000n);
  });
  it('flips sign for credit-normal (Liability/Equity/Income)', () => {
    expect(svc.naturalBalance(AccountType.LIABILITY, -5000000n)).toBe(5000000n);
    expect(svc.naturalBalance(AccountType.INCOME, -2000000n)).toBe(2000000n);
    expect(svc.naturalBalance(AccountType.EQUITY, -1000000n)).toBe(1000000n);
  });

  describe('naturalBalance distributivity (#1146)', () => {
    // This spec constructs the service per test (`const svc = new
    // AccountBalanceService(...)` inside each `it`); there is no shared
    // instance to reuse, so build one here the same way.
    const svc = new AccountBalanceService({} as any, {} as any);

    // General Ledger derives each page's opening balance from an aggregate over
    // the preceding rows rather than by replaying them. That is only valid
    // because naturalBalance distributes over addition.
    it.each([
      AccountType.ASSET,
      AccountType.EXPENSE,
      AccountType.LIABILITY,
      AccountType.EQUITY,
      AccountType.INCOME,
    ])('holds for %s', (type) => {
      const pairs: Array<[bigint, bigint]> = [
        [700n, 300n],
        [-250n, 1000n],
        [0n, 0n],
        [-5n, -7n],
      ];
      for (const [a, b] of pairs) {
        expect(svc.naturalBalance(type, a) + svc.naturalBalance(type, b)).toBe(
          svc.naturalBalance(type, a + b),
        );
      }
    });
  });
});

describe('AccountBalanceService.getRollup', () => {
  const svc = new AccountBalanceService({} as any, {} as any);
  it('sums descendant leaf balances', () => {
    const accounts = [
      { id: 'g', parentId: null }, { id: 'a', parentId: 'g' }, { id: 'b', parentId: 'g' },
    ] as any[];
    const leaf = new Map<string, bigint>([['a', 100n], ['b', 250n]]);
    expect(svc.getRollup('g', leaf, accounts)).toBe(350n);
  });
});
