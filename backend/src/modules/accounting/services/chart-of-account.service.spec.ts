import { jest } from '@jest/globals';
import { ChartOfAccountService } from './chart-of-account.service';
import { AccountType } from '../entities/account-type.enum';
import { BadRequestException, ConflictException } from '@nestjs/common';

function makeService(overrides: any = {}) {
  const accounts: any[] = overrides.accounts ?? [];
  const repoCreate = (jest.fn as unknown as any)((x: any) => x);
  const coaRepo = {
    findOne: async ({ where }: any) =>
      accounts.find((a) => (where.code && a.code === where.code) || (where.id && a.id === where.id)) ?? null,
    find: async () => accounts,
    create: repoCreate,
    save: (jest.fn as unknown as any)(async (x: any) => ({ id: 'new-id', ...x })),
  };
  const settingsRepo: any = {
    findOne: (jest.fn as unknown as any)(async () => overrides.settings ?? { id: true }),
  };
  // withBalanceSheetConfigLock locks the settings row through createQueryBuilder.
  // A single-connection fake cannot show serialisation; that is the e2e's job.
  settingsRepo.createQueryBuilder = () => ({
    setLock: () => ({ where: () => ({ getOne: async () => settingsRepo.findOne({ where: { id: true } }) }) }),
  });
  const manager = {
    getRepository: (entity: any) => {
      const name = entity?.name ?? String(entity);
      if (name === 'ChartOfAccount') return coaRepo;
      if (name === 'AccountingSettings') return settingsRepo;
      throw new Error(`unexpected repository requested: ${name}`);
    },
  };
  const dataSource = { transaction: (jest.fn as unknown as any)(async (cb: any) => cb(manager)) };
  const posting = { postOpeningBalance: (jest.fn as unknown as any)(async () => ({ journalEntryId: 'je-1' })) };
  const balance = overrides.balance ?? { getLeafBalances: async () => new Map(), getRollup: () => 0n, naturalBalance: (_t: any, v: bigint) => v };
  const getRegionalSettings = (jest.fn as unknown as any)(async () => ({
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
  return { svc, posting, getRegionalSettings, dataSource, coaRepo, settingsRepo, repoCreate };
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

describe('ChartOfAccountService — isProviderClearing (#1285)', () => {
  it('create: rejects flagging a non-Asset account and writes nothing', async () => {
    const { svc, dataSource } = makeService({ accounts: [] });
    await expect(
      svc.create({ code: '2999', name: 'X', type: AccountType.LIABILITY, isProviderClearing: true } as any, 'tester'),
    ).rejects.toThrow('Only an Asset account can be a provider clearing account');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('create: persists isProviderClearing for a postable Asset', async () => {
    const { svc, repoCreate } = makeService({ accounts: [] });
    await svc.create(
      { code: '1250', name: 'Shopee', type: AccountType.ASSET, isProviderClearing: true } as any,
      'tester',
    );
    expect(repoCreate).toHaveBeenCalledWith(expect.objectContaining({ isProviderClearing: true }));
  });

  it('update: rejects flagging the configured bank account', async () => {
    const bank = { id: 'cimb', code: '1200', name: 'CIMB', type: AccountType.ASSET, isActive: true, isPostable: true };
    const { svc, coaRepo } = makeService({ accounts: [bank], settings: { id: true, bankAccountId: 'cimb' } });
    await expect(svc.update('cimb', { isProviderClearing: true } as any, 'tester')).rejects.toThrow(
      'This account is the Accounting Settings Bank account and cannot be a provider clearing account',
    );
    expect(coaRepo.save).not.toHaveBeenCalled();
  });

  it('update: rejects flagging a non-postable group account', async () => {
    const group = { id: 'grp', code: '1290', name: 'Providers', type: AccountType.ASSET, isActive: true, isPostable: false };
    const { svc, coaRepo } = makeService({ accounts: [group] });
    await expect(svc.update('grp', { isProviderClearing: true } as any, 'tester')).rejects.toThrow(
      'Only a postable account can be a provider clearing account',
    );
    expect(coaRepo.save).not.toHaveBeenCalled();
  });

  it('update: allows unflagging a clearing account', async () => {
    const flagged = {
      id: 'shopee', code: '1250', name: 'Shopee', type: AccountType.ASSET,
      isActive: true, isPostable: true, isProviderClearing: true, isBankAccount: false,
    };
    const { svc, coaRepo } = makeService({ accounts: [flagged], settings: { id: true, bankAccountId: 'cimb' } });
    await svc.update('shopee', { isProviderClearing: false } as any, 'tester');
    expect(coaRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isProviderClearing: false }));
  });
});

describe('ChartOfAccountService — isBankAccount (#1298)', () => {
  const settings = {
    id: true, bankAccountId: 'cimb', cashAccountId: 'cash',
    inventoryAccountId: 'inv', supplierDepositAccountId: 'sup',
  };
  const asset = (id: string, over: Record<string, unknown> = {}) => ({
    id, code: id.toUpperCase(), name: id, type: AccountType.ASSET,
    isActive: true, isPostable: true, isProviderClearing: false, isBankAccount: false, ...over,
  });

  it('create: persists isBankAccount for a postable Asset', async () => {
    const { svc, repoCreate } = makeService({ accounts: [] });
    await svc.create({ code: '1250', name: 'RHB', type: AccountType.ASSET, isBankAccount: true } as any, 'tester');
    expect(repoCreate).toHaveBeenCalledWith(expect.objectContaining({ isBankAccount: true }));
  });

  it('create: rejects flagging a non-Asset and writes nothing', async () => {
    const { svc, dataSource } = makeService({ accounts: [] });
    await expect(
      svc.create({ code: '6100', name: 'X', type: AccountType.EXPENSE, isBankAccount: true } as any, 'tester'),
    ).rejects.toThrow('Only an Asset account can be a bank account');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('create: rejects both flags at once', async () => {
    const { svc, dataSource } = makeService({ accounts: [] });
    await expect(
      svc.create({ code: '1250', name: 'X', type: AccountType.ASSET, isBankAccount: true, isProviderClearing: true } as any, 'tester'),
    ).rejects.toThrow('A provider clearing account cannot be a bank account');
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['cash', 'Cash'], ['inv', 'Inventory'], ['sup', 'Supplier Deposit'],
  ])('update: rejects flagging the Settings %s account', async (id, label) => {
    const { svc, coaRepo } = makeService({ accounts: [asset(id)], settings });
    await expect(svc.update(id, { isBankAccount: true } as any, 'tester')).rejects.toThrow(
      `This account is the Accounting Settings ${label} account and cannot be a bank account`,
    );
    expect(coaRepo.save).not.toHaveBeenCalled();
  });

  it('update: rejects unflagging the Settings bank account', async () => {
    const { svc, coaRepo } = makeService({ accounts: [asset('cimb', { isBankAccount: true })], settings });
    await expect(svc.update('cimb', { isBankAccount: false } as any, 'tester')).rejects.toThrow(
      'Account is the Accounting Settings Bank account and must remain a bank account',
    );
    expect(coaRepo.save).not.toHaveBeenCalled();
  });

  it('update: rejects turning on isProviderClearing for a flagged account (merged state)', async () => {
    // The merged account carries BOTH flags; update() runs the bank rule first,
    // so its message wins. The mirror message ("A bank account cannot be a
    // provider clearing account") is reachable only via the rule function
    // itself (Task 1's test).
    const { svc, coaRepo } = makeService({ accounts: [asset('maybank', { isBankAccount: true })], settings });
    await expect(svc.update('maybank', { isProviderClearing: true } as any, 'tester')).rejects.toThrow(
      'A provider clearing account cannot be a bank account',
    );
    expect(coaRepo.save).not.toHaveBeenCalled();
  });

  it('update: rejects both flags at once', async () => {
    const { svc, coaRepo } = makeService({ accounts: [asset('rhb')], settings });
    await expect(
      svc.update('rhb', { isBankAccount: true, isProviderClearing: true } as any, 'tester'),
    ).rejects.toThrow('A provider clearing account cannot be a bank account');
    expect(coaRepo.save).not.toHaveBeenCalled();
  });

  it('update: re-validates a flagged account on an unrelated edit', async () => {
    // A flagged row that already violates an invariant (e.g. hand-edited data)
    // cannot be saved until fixed — the merged state is what is checked.
    const { svc } = makeService({ accounts: [asset('grp', { isBankAccount: true, isPostable: false })], settings });
    await expect(svc.update('grp', { name: 'Renamed' } as any, 'tester'))
      .rejects.toThrow('Only a postable account can be a bank account');
  });

  it('update: renames a flagged account', async () => {
    const { svc, coaRepo } = makeService({ accounts: [asset('cimb', { isBankAccount: true })], settings });
    await svc.update('cimb', { name: 'CIMB Current' } as any, 'tester');
    expect(coaRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'CIMB Current', isBankAccount: true }));
  });

  it('update: unflags a bank that is not the Settings bank', async () => {
    const { svc, coaRepo } = makeService({ accounts: [asset('maybank', { isBankAccount: true })], settings });
    await svc.update('maybank', { isBankAccount: false } as any, 'tester');
    expect(coaRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isBankAccount: false }));
  });

  it('update: runs inside the config-lock transaction', async () => {
    const { svc, dataSource } = makeService({ accounts: [asset('maybank', { isBankAccount: true })], settings });
    await svc.update('maybank', { name: 'x' } as any, 'tester');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
});
