import { ChartOfAccountService } from './chart-of-account.service';
import { AccountType } from '../entities/account-type.enum';
import { BadRequestException, ConflictException } from '@nestjs/common';

function makeService(overrides: any = {}) {
  const accounts: any[] = overrides.accounts ?? [];
  const coaRepo = {
    findOne: async ({ where }: any) =>
      accounts.find((a) => (where.code && a.code === where.code) || (where.id && a.id === where.id)) ?? null,
    find: async () => accounts,
  };
  const settingsRepo = { findOne: async () => overrides.settings ?? { id: true } };
  const posting = { postOpeningBalance: jest.fn(async () => ({ journalEntryId: 'je-1' })) };
  const balance = overrides.balance ?? { getLeafBalances: async () => new Map(), getRollup: () => 0n, naturalBalance: (_t: any, v: bigint) => v };
  const dataSource = {
    transaction: async (cb: any) => cb({
      getRepository: () => ({ create: (x: any) => x, save: async (x: any) => ({ ...x, id: 'new-id' }) }),
    }),
  };
  const svc = new ChartOfAccountService(coaRepo as any, settingsRepo as any, posting as any, balance as any, dataSource as any);
  return { svc, posting };
}

describe('ChartOfAccountService.create', () => {
  it('rejects duplicate code', async () => {
    const { svc } = makeService({ accounts: [{ id: '1', code: '1100', type: AccountType.ASSET }] });
    await expect(svc.create({ code: '1100', name: 'Dup', type: AccountType.ASSET } as any, 'admin'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects parent of a different type', async () => {
    const parent = { id: 'p', code: '2000', type: AccountType.LIABILITY, isActive: true, isPostable: false };
    const { svc } = makeService({ accounts: [parent] });
    await expect(svc.create({ code: '1500', name: 'X', type: AccountType.ASSET, parentId: 'p' } as any, 'admin'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('posts an opening-balance JE when openingBalance != 0', async () => {
    const { svc, posting } = makeService({ accounts: [] });
    await svc.create({ code: '1500', name: 'Petty Cash', type: AccountType.ASSET, openingBalance: '250.0000' } as any, 'admin');
    expect(posting.postOpeningBalance).toHaveBeenCalledTimes(1);
  });

  it('does not post a JE when openingBalance is 0', async () => {
    const { svc, posting } = makeService({ accounts: [] });
    await svc.create({ code: '1500', name: 'Petty Cash', type: AccountType.ASSET, openingBalance: '0' } as any, 'admin');
    expect(posting.postOpeningBalance).not.toHaveBeenCalled();
  });
});

describe('ChartOfAccountService.update', () => {
  it('blocks deactivating an account used in settings', async () => {
    const used = { id: 'cash', code: '1100', type: AccountType.ASSET, isActive: true };
    const { svc } = makeService({ accounts: [used], settings: { id: true, cashAccountId: 'cash' } });
    await expect(svc.update('cash', { isActive: false } as any, 'admin')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ChartOfAccountService.findTree', () => {
  // 1000 Current Assets (group)
  //   1100 Cash on Hand (leaf)
  //   1200 Bank Account (leaf)
  // 3000 Equity (group)
  //   3100 Opening Balance Equity (leaf)
  const accounts = [
    { id: 'ca', code: '1000', name: 'Current Assets', type: AccountType.ASSET, parentId: null, isPostable: false },
    { id: 'cash', code: '1100', name: 'Cash on Hand', type: AccountType.ASSET, parentId: 'ca', isPostable: true },
    { id: 'bank', code: '1200', name: 'Bank Account', type: AccountType.ASSET, parentId: 'ca', isPostable: true },
    { id: 'eq', code: '3000', name: 'Equity', type: AccountType.EQUITY, parentId: null, isPostable: false },
    { id: 'obe', code: '3100', name: 'Opening Balance Equity', type: AccountType.EQUITY, parentId: 'eq', isPostable: true },
  ];

  it('returns the full tree when no search term is given', async () => {
    const { svc } = makeService({ accounts });
    const tree = await svc.findTree();
    expect(tree.map((n: any) => n.code)).toEqual(['1000', '3000']);
    expect(tree[0].children.map((n: any) => n.code)).toEqual(['1100', '1200']);
  });

  it('returns the full tree for a whitespace-only search term', async () => {
    const { svc } = makeService({ accounts });
    const tree = await svc.findTree({ search: '   ' });
    expect(tree.map((n: any) => n.code)).toEqual(['1000', '3000']);
    expect(tree[0].children).toHaveLength(2);
  });

  it('keeps the ancestor path of a matching leaf and drops non-matching siblings', async () => {
    const { svc } = makeService({ accounts });
    const tree = await svc.findTree({ search: 'cash' });
    expect(tree).toHaveLength(1);
    expect(tree[0].code).toBe('1000');
    expect(tree[0].children.map((n: any) => n.code)).toEqual(['1100']);
  });

  it('matches case-insensitively', async () => {
    const { svc } = makeService({ accounts });
    const tree = await svc.findTree({ search: 'CASH ON HAND' });
    expect(tree[0].children.map((n: any) => n.code)).toEqual(['1100']);
  });

  it('matches on code as well as name', async () => {
    const { svc } = makeService({ accounts });
    const tree = await svc.findTree({ search: '1200' });
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((n: any) => n.code)).toEqual(['1200']);
  });

  it('returns a matching group with no children when no descendant matches', async () => {
    const { svc } = makeService({ accounts });
    const tree = await svc.findTree({ search: 'Current Assets' });
    expect(tree).toHaveLength(1);
    expect(tree[0].code).toBe('1000');
    expect(tree[0].children).toEqual([]);
  });

  it('returns an empty tree when nothing matches', async () => {
    const { svc } = makeService({ accounts });
    expect(await svc.findTree({ search: 'zzz-no-such-account' })).toEqual([]);
  });

  // The important accounting invariant: pruning must happen AFTER the balance
  // rollup, so a retained group still reports the balance of children the
  // search removed from view.
  it('keeps a retained group balance rolled up over ALL children, not just matching ones', async () => {
    const leaves = new Map<string, bigint>([
      ['cash', 1000000n], // 100.0000
      ['bank', 500000n],  //  50.0000
    ]);
    const { svc } = makeService({
      accounts,
      balance: {
        getLeafBalances: async () => leaves,
        // Real rollup: sum of every descendant leaf, matching or not.
        getRollup: (id: string) =>
          accounts
            .filter((a) => a.parentId === id)
            .reduce((sum, a) => sum + (leaves.get(a.id) ?? 0n), 0n),
        naturalBalance: (_t: any, v: bigint) => v,
      },
    });

    const tree = await svc.findTree({ search: 'cash' });

    expect(tree[0].code).toBe('1000');
    expect(tree[0].children.map((n: any) => n.code)).toEqual(['1100']); // sibling pruned from view
    expect(tree[0].balance).toBe('150.0000');                          // ...but still counted
  });
});
