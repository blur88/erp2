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
  const getRegionalSettings = jest.fn(async () => ({
    timezone: overrides.timezone ?? 'Asia/Kuala_Lumpur',
  }));
  const regionalSettingsService = { getRegionalSettings };
  const svc = new ChartOfAccountService(
    coaRepo as any,
    settingsRepo as any,
    posting as any,
    balance as any,
    dataSource as any,
    regionalSettingsService as any,
  );
  return { svc, posting, getRegionalSettings };
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

  describe('opening-balance entryDate fallback (issue #1134)', () => {
    // 16:30Z is past the UTC+8 rollover (16:00Z), so the UTC calendar date and
    // the Asia/Kuala_Lumpur one differ. A mid-UTC-day instant would be inert.
    const FROZEN_INSTANT = new Date('2026-08-24T16:30:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_INSTANT);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const createWithoutDate = (svc: any) =>
      svc.create(
        { code: '1500', name: 'Petty Cash', type: AccountType.ASSET, openingBalance: '250.0000' } as any,
        'admin',
      );

    it('falls back to today in the configured timezone, not UTC', async () => {
      const { svc, posting } = makeService({ accounts: [], timezone: 'Asia/Kuala_Lumpur' });
      await createWithoutDate(svc);
      expect(posting.postOpeningBalance).toHaveBeenCalledWith(
        expect.objectContaining({ entryDate: '2026-08-25' }),
        expect.anything(),
      );
    });

    it('falls back to the UTC date when UTC is the configured timezone', async () => {
      const { svc, posting } = makeService({ accounts: [], timezone: 'UTC' });
      await createWithoutDate(svc);
      expect(posting.postOpeningBalance).toHaveBeenCalledWith(
        expect.objectContaining({ entryDate: '2026-08-24' }),
        expect.anything(),
      );
    });

    it('leaves a supplied openingBalanceDate untouched and skips the settings read', async () => {
      const { svc, posting, getRegionalSettings } = makeService({ accounts: [] });
      await svc.create(
        {
          code: '1500',
          name: 'Petty Cash',
          type: AccountType.ASSET,
          openingBalance: '250.0000',
          openingBalanceDate: '2026-01-15',
        } as any,
        'admin',
      );
      expect(posting.postOpeningBalance).toHaveBeenCalledWith(
        expect.objectContaining({ entryDate: '2026-01-15' }),
        expect.anything(),
      );
      expect(getRegionalSettings).not.toHaveBeenCalled();
    });

    it('skips the settings read when no opening-balance JE is posted', async () => {
      const { svc, getRegionalSettings } = makeService({ accounts: [] });
      await svc.create(
        { code: '1500', name: 'Petty Cash', type: AccountType.ASSET, openingBalance: '0' } as any,
        'admin',
      );
      expect(getRegionalSettings).not.toHaveBeenCalled();
    });
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
describe('ChartOfAccountService.findTree filtering', () => {
  const accounts = [
    { id: 'a', code: '1000', name: 'Assets', type: AccountType.ASSET, parentId: null, isActive: true, isPostable: false },
    { id: 'b', code: '1100', name: 'Cash', type: AccountType.ASSET, parentId: 'a', isActive: true, isPostable: true },
    { id: 'e', code: '1200', name: 'Retired Equipment', type: AccountType.ASSET, parentId: 'a', isActive: false, isPostable: true },
    { id: 'c', code: '2000', name: 'Liabilities', type: AccountType.LIABILITY, parentId: null, isActive: false, isPostable: false },
    { id: 'd', code: '2100', name: 'Payables', type: AccountType.LIABILITY, parentId: 'c', isActive: true, isPostable: true },
    { id: 'f', code: '2200', name: 'Cash Loans Payable', type: AccountType.LIABILITY, parentId: 'c', isActive: true, isPostable: true },
  ];

  const build = () => makeService({ accounts }).svc;

  it('keeps only the matching type, with hierarchy intact', async () => {
    const tree = await build().findTree({ type: AccountType.ASSET });
    expect(tree.map((n: any) => n.code)).toEqual(['1000']);
    expect(tree[0].children.map((n: any) => n.code)).toEqual(['1100', '1200']);
  });

  it('excludes an inactive leaf that has no active descendant', async () => {
    const tree = await build().findTree({ isActive: true });
    const assets: any = tree.find((n: any) => n.code === '1000');
    expect(assets.children.map((n: any) => n.code)).toEqual(['1100']);
  });

  it('retains a non-matching ancestor as context', async () => {
    const tree = await build().findTree({ isActive: true });
    const liabilities: any = tree.find((n: any) => n.code === '2000');
    expect(liabilities).toBeDefined();
    expect(liabilities.isActive).toBe(false);
    expect(liabilities.children.map((n: any) => n.code)).toEqual(['2100', '2200']);
  });

  it('combines search with type, excluding a cross-type name match', async () => {
    const tree = await build().findTree({ search: 'cash', type: AccountType.ASSET });
    expect(tree.map((n: any) => n.code)).toEqual(['1000']);
    expect(tree[0].children.map((n: any) => n.code)).toEqual(['1100']);
  });

  it('returns the whole tree when no filter is given', async () => {
    const tree = await build().findTree({});
    expect(tree.map((n: any) => n.code)).toEqual(['1000', '2000']);
    expect(tree[0].children.map((n: any) => n.code)).toEqual(['1100', '1200']);
  });

  it('does not let filtering change a rolled-up group balance', async () => {
    const unfiltered = await build().findTree({});
    const filtered = await build().findTree({ type: AccountType.ASSET });
    const rootBefore: any = unfiltered.find((n: any) => n.code === '1000');
    const rootAfter: any = filtered.find((n: any) => n.code === '1000');
    expect(rootAfter.balance).toBe(rootBefore.balance);
  });

  // Regression: the filters must be ANDed in ONE traversal. Applying them as
  // successive passes kept '2000 Liabilities' here — pass 1 retained it because
  // its active child '2100' survived, then the search pass dropped '2100' for not
  // matching the term but kept '2000' on its own name match, surfacing an
  // INACTIVE account under isActive=true with no surviving descendant.
  it('drops a node failing one filter even when it matches another', async () => {
    const tree = await build().findTree({ search: 'liabilities', isActive: true });
    expect(tree.find((n: any) => n.code === '2000')).toBeUndefined();
  });

  it('still returns a node matching every active filter at once', async () => {
    // '2100 Payables' matches the term AND is active, so it satisfies every
    // filter on its own. Its parent '2000 Liabilities' matches neither and is
    // retained purely as ancestor context — the case the test above confirms is
    // dropped once no descendant survives.
    const tree = await build().findTree({ search: 'payables', isActive: true });
    const liabilities: any = tree.find((n: any) => n.code === '2000');
    expect(liabilities).toBeDefined();
    expect(liabilities.children.map((n: any) => n.code)).toEqual(['2100']);
  });
});

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
