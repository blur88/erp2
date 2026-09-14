import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { BalanceSheetGroupService } from './balance-sheet-group.service';
import { BalanceSheetGroup } from './balance-sheet-groups.resolve';
import { AccountType } from '../entities/account-type.enum';

const account = (over: any = {}) => ({
  id: 'a1', code: '1200', name: 'CIMB', type: AccountType.ASSET,
  isActive: true, isPostable: true, deletedAt: null, ...over,
});

const CIMB = account({ id: 'cimb', code: '1200', name: 'CIMB' });
const MAYBANK = account({ id: 'maybank', code: '1210', name: 'Maybank' });
const ATOME = account({ id: 'atome', code: '1240', name: 'Atome' });
const CASH_ACCT = account({ id: 'cash', code: '1100', name: 'Cash' });
const SUPPLIER_DEP = account({ id: 'supdep', code: '1300', name: 'Supplier Deposits' });

const bank = (...ids: string[]) =>
  ids.map((accountId) => ({ accountId, group: BalanceSheetGroup.BANK_BALANCE }));
const other = (...ids: string[]) =>
  ids.map((accountId) => ({ accountId, group: BalanceSheetGroup.OTHER_CURRENT_ASSETS }));

/**
 * A transaction-shaped fake. `stored` is the group table; the service's writes
 * go through it so replacement semantics are observable.
 *
 * The lock query is stubbed to RESOLVE only — a single-connection fake cannot
 * demonstrate that two writers serialize. That claim is asserted in the e2e
 * suite against real Postgres; nothing here should be read as evidence for it.
 */
const makeService = (opts: {
  accounts?: any[];
  settings?: any;
  stored?: { accountId: string; groupLine: BalanceSheetGroup }[];
} = {}) => {
  const accounts = opts.accounts ?? [CIMB, MAYBANK, ATOME, CASH_ACCT, SUPPLIER_DEP];
  const settings = opts.settings ?? {
    id: true, cashAccountId: 'cash', bankAccountId: 'cimb',
    inventoryAccountId: 'inv', supplierDepositAccountId: 'supdep',
  };
  const stored = [...(opts.stored ?? [])];

  /*
   * `delete` REJECTS empty criteria, exactly as TypeORM does. The first
   * version of this fake accepted `delete({})` and returned success, so the
   * service shipped a call real TypeORM refuses with "Empty criteria(s) are
   * not allowed for the delete method" — a 500 the e2e suite caught and this
   * suite could not. Clearing the table goes through the query builder.
   */
  const clearAll = (jest.fn as any)(async () => { stored.length = 0; });
  const groupRepo = {
    find: (jest.fn as any)(async () => stored.map((s) => ({ ...s }))),
    delete: (jest.fn as any)(async (criteria: any) => {
      if (!criteria || Object.keys(criteria).length === 0) {
        throw new Error('Empty criteria(s) are not allowed for the delete method.');
      }
      throw new Error('unexpected filtered delete');
    }),
    createQueryBuilder: () => ({ delete: () => ({ execute: clearAll }) }),
    insert: (jest.fn as any)(async (rows: any[]) => { stored.push(...rows); }),
  };
  const coaRepo = {
    find: (jest.fn as any)(async () => accounts),
    findOne: (jest.fn as any)(async ({ where }: any) =>
      accounts.find((a) => a.id === where.id) ?? null),
  };
  const settingsRepo = {
    findOne: (jest.fn as any)(async () => settings),
    createQueryBuilder: () => ({
      setLock: () => ({ where: () => ({ getOne: async () => settings }) }),
    }),
  };

  const manager = {
    getRepository: (entity: any) => {
      const name = entity?.name ?? String(entity);
      if (name === 'BalanceSheetAccountGroup') return groupRepo;
      if (name === 'ChartOfAccount') return coaRepo;
      if (name === 'AccountingSettings') return settingsRepo;
      throw new Error(`unexpected repository: ${name}`);
    },
  };
  const dataSource = { transaction: async (work: any) => work(manager) };

  const service = new BalanceSheetGroupService(
    groupRepo as any, coaRepo as any, dataSource as any,
  );
  return { service, groupRepo: { ...groupRepo, clearAll }, stored, settingsRepo };
};

describe('BalanceSheetGroupService.setGroups — account eligibility', () => {
  const rejects = async (accounts: any[], items: any[], pattern: RegExp) => {
    const { service, groupRepo } = makeService({ accounts });
    await expect(service.setGroups(items as any)).rejects.toThrow(pattern);
    // Validate-all-then-write: a rejected batch must write NOTHING.
    expect(groupRepo.clearAll).not.toHaveBeenCalled();
    expect(groupRepo.insert).not.toHaveBeenCalled();
  };

  it('rejects an inactive account', async () => {
    await rejects([account({ id: 'x', isActive: false })], bank('x'), /inactive/);
  });

  it('rejects a non-postable account', async () => {
    await rejects([account({ id: 'x', isPostable: false })], bank('x'), /not postable/);
  });

  it('rejects a soft-deleted account', async () => {
    await rejects([account({ id: 'x', deletedAt: new Date() })], bank('x'), /deleted/);
  });

  it('rejects a non-Asset account', async () => {
    await rejects(
      [account({ id: 'x', type: AccountType.LIABILITY })], bank('x'), /wrong type/,
    );
  });

  it('rejects an account that does not exist', async () => {
    await rejects([], bank('ghost'), /not found/);
  });

  it('rejects the same account listed twice', async () => {
    await rejects(
      [CIMB],
      [...bank('cimb'), ...other('cimb')],
      /more than once/,
    );
  });
});

describe('BalanceSheetGroupService.setGroups — conflict rule is applied', () => {
  /*
   * These assert the SHARED validator is actually wired in. Deleting the
   * assertNoLineConflicts call from setGroups turns every one of them red —
   * which is the point: the pure-function suite proves the rule, this proves
   * the path uses it.
   */
  it('rejects the cash default in a group', async () => {
    const { service } = makeService();
    await expect(service.setGroups(bank('cash') as any)).rejects.toThrow(/N37 and N38/);
  });

  it('rejects the bank default in N39 while the N38 group is EMPTY', async () => {
    const { service } = makeService();
    await expect(service.setGroups(other('cimb') as any)).rejects.toThrow(/N38 and N39/);
  });

  it('ACCEPTS the bank default in N39 when a non-empty N38 group excludes it', async () => {
    const { service, stored } = makeService();
    await service.setGroups([...bank('maybank'), ...other('cimb')] as any);
    expect(stored).toEqual([
      { accountId: 'maybank', groupLine: BalanceSheetGroup.BANK_BALANCE },
      { accountId: 'cimb', groupLine: BalanceSheetGroup.OTHER_CURRENT_ASSETS },
    ]);
  });

  it('ACCEPTS the bank default inside the N38 group (same-line overlap)', async () => {
    const { service, stored } = makeService();
    await service.setGroups(bank('cimb', 'maybank') as any);
    expect(stored.map((s) => s.accountId)).toEqual(['cimb', 'maybank']);
  });

  it('ACCEPTS the supplier deposit inside the N39 group (same-line overlap)', async () => {
    const { service, stored } = makeService();
    await service.setGroups(other('supdep', 'atome') as any);
    expect(stored.map((s) => s.accountId)).toEqual(['supdep', 'atome']);
  });

  describe('fallback reactivation', () => {
    it('rejects emptying the N38 group while the bank default sits in N39', async () => {
      // Start from the legal state...
      const { service, stored } = makeService();
      await service.setGroups([...bank('maybank'), ...other('cimb')] as any);
      expect(stored).toHaveLength(2);

      // ...then empty N38. The bank fallback re-arms onto N38 and CIMB, which
      // is in N39, now contributes to both.
      await expect(service.setGroups(other('cimb') as any)).rejects.toThrow(/N38 and N39/);
    });

    it('rejects emptying the N39 group while the supplier deposit sits in N38', async () => {
      const { service } = makeService();
      await service.setGroups([...other('atome'), ...bank('supdep')] as any);
      await expect(service.setGroups(bank('supdep') as any)).rejects.toThrow(/N38 and N39/);
    });
  });
});

describe('BalanceSheetGroupService.setGroups — replacement semantics', () => {
  it('replaces BOTH groups atomically in one request', async () => {
    const { service, stored } = makeService({
      stored: [{ accountId: 'cimb', groupLine: BalanceSheetGroup.BANK_BALANCE }],
    });
    await service.setGroups([
      ...bank('cimb', 'maybank'),
      ...other('atome'),
    ] as any);
    expect(stored).toEqual([
      { accountId: 'cimb', groupLine: BalanceSheetGroup.BANK_BALANCE },
      { accountId: 'maybank', groupLine: BalanceSheetGroup.BANK_BALANCE },
      { accountId: 'atome', groupLine: BalanceSheetGroup.OTHER_CURRENT_ASSETS },
    ]);
  });

  it('MOVES an account between groups without a primary-key collision', async () => {
    // The delete-then-insert case: accountId is the PK, so an insert alone
    // would collide and an update-only path would depend on statement order.
    const { service, stored } = makeService({
      stored: [{ accountId: 'atome', groupLine: BalanceSheetGroup.BANK_BALANCE }],
    });
    await service.setGroups([...bank('maybank'), ...other('atome')] as any);
    expect(stored).toEqual([
      { accountId: 'maybank', groupLine: BalanceSheetGroup.BANK_BALANCE },
      { accountId: 'atome', groupLine: BalanceSheetGroup.OTHER_CURRENT_ASSETS },
    ]);
  });

  it('clears every grouping on an empty array, re-arming both fallbacks', async () => {
    const { service, stored, groupRepo } = makeService({
      stored: [
        { accountId: 'cimb', groupLine: BalanceSheetGroup.BANK_BALANCE },
        { accountId: 'atome', groupLine: BalanceSheetGroup.OTHER_CURRENT_ASSETS },
      ],
    });
    await service.setGroups([]);
    expect(stored).toEqual([]);
    expect(groupRepo.insert).not.toHaveBeenCalled();
  });

  it('removes an account by omitting it, not by a delete flag', async () => {
    const { service, stored } = makeService({
      stored: [
        { accountId: 'cimb', groupLine: BalanceSheetGroup.BANK_BALANCE },
        { accountId: 'maybank', groupLine: BalanceSheetGroup.BANK_BALANCE },
      ],
    });
    await service.setGroups(bank('cimb') as any);
    expect(stored.map((s) => s.accountId)).toEqual(['cimb']);
  });
});

describe('BalanceSheetGroupService.getGroupedAccountIds', () => {
  it('returns both groups, empty when nothing is configured', async () => {
    const { service } = makeService();
    await expect(service.getGroupedAccountIds()).resolves.toEqual({
      BANK_BALANCE: [], OTHER_CURRENT_ASSETS: [],
    });
  });

  it('partitions stored rows by group', async () => {
    const { service } = makeService({
      stored: [
        { accountId: 'cimb', groupLine: BalanceSheetGroup.BANK_BALANCE },
        { accountId: 'maybank', groupLine: BalanceSheetGroup.BANK_BALANCE },
        { accountId: 'atome', groupLine: BalanceSheetGroup.OTHER_CURRENT_ASSETS },
      ],
    });
    await expect(service.getGroupedAccountIds()).resolves.toEqual({
      BANK_BALANCE: ['cimb', 'maybank'],
      OTHER_CURRENT_ASSETS: ['atome'],
    });
  });
});

describe('BalanceSheetGroupService.list', () => {
  it('flags a grouped account that has since become ineligible', async () => {
    const { service } = makeService({
      accounts: [account({ id: 'cimb', isActive: false })],
      stored: [{ accountId: 'cimb', groupLine: BalanceSheetGroup.BANK_BALANCE }],
    });
    const rows = await service.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'invalid', invalidReason: 'inactive' });
  });

  it('reports a grouped account whose account row is gone', async () => {
    const { service } = makeService({
      accounts: [],
      stored: [{ accountId: 'ghost', groupLine: BalanceSheetGroup.BANK_BALANCE }],
    });
    const rows = await service.list();
    expect(rows[0]).toMatchObject({
      status: 'invalid', invalidReason: 'missing', accountCode: null,
    });
  });
});
