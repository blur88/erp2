import { TrialBalanceService } from './trial-balance.service';
import { AccountType } from '../entities/account-type.enum';

describe('TrialBalanceService.classify', () => {
  const svc = new TrialBalanceService({} as any, {} as any);
  it('net debit → debit column', () => {
    expect(svc.classify(5000000n)).toEqual({ debit: '500.0000', credit: '0.0000' });
  });
  it('net credit → credit column', () => {
    expect(svc.classify(-3000000n)).toEqual({ debit: '0.0000', credit: '300.0000' });
  });
});

describe('TrialBalanceService.assemble', () => {
  const svc = new TrialBalanceService({} as any, {} as any);
  it('excludes zero-balance rows unless showZero, and reports balanced', () => {
    const rows = [
      { id: 'a', code: '1100', name: 'Cash', type: AccountType.ASSET, isPostable: true },
      { id: 'b', code: '2100', name: 'Cust Dep', type: AccountType.LIABILITY, isPostable: true },
      { id: 'z', code: '1300', name: 'Inv', type: AccountType.ASSET, isPostable: true },
    ] as any[];
    const leaf = new Map<string, bigint>([['a', 5000000n], ['b', -5000000n], ['z', 0n]]);
    const res = svc.assemble(rows, leaf, false);
    expect(res.rows.map((r) => r.code)).toEqual(['1100', '2100']); // zero 'z' hidden
    expect(res.totalDebit).toBe('500.0000');
    expect(res.totalCredit).toBe('500.0000');
    expect(res.balanced).toBe(true);
  });
});
