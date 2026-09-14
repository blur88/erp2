import { jest } from '@jest/globals';
import { AccountingSettingsService } from './accounting-settings.service';
import { AccountType } from '../entities/account-type.enum';
import { BadRequestException } from '@nestjs/common';

/**
 * A DataSource whose transaction() hands back the same fakes the suite already
 * builds, plus the settings-row lock query.
 *
 * update() now runs inside withBalanceSheetConfigLock (#1239), so the service
 * reads through manager.getRepository() rather than its injected repos. The
 * lock is a real SELECT ... FOR UPDATE against accounting_settings; here it
 * only has to RESOLVE, since a single-connection fake cannot demonstrate
 * serialization. That is asserted in the e2e suite, against Postgres.
 */
function makeDataSource(opts: {
  settingsRepo: any;
  coaRepo: any;
  groupRepo?: any;
}) {
  const groupRepo = opts.groupRepo ?? { find: async () => [] };
  const manager = {
    getRepository: (entity: any) => {
      const name = entity?.name ?? String(entity);
      if (name === 'AccountingSettings') return opts.settingsRepo;
      if (name === 'ChartOfAccount') return opts.coaRepo;
      if (name === 'BalanceSheetAccountGroup') return groupRepo;
      throw new Error(`unexpected repository requested: ${name}`);
    },
  };
  // The lock goes through createQueryBuilder on the settings repo.
  opts.settingsRepo.createQueryBuilder = () => ({
    setLock: () => ({
      where: () => ({ getOne: async () => opts.settingsRepo.findOne({ where: { id: true } }) }),
    }),
  });
  return { transaction: async (work: any) => work(manager) };
}

function makeService(accounts: any[]) {
  const settingsRepo = {
    findOne: async () => ({ id: true }),
    save: async (x: any) => x,
    create: (x: any) => x,
  };
  const coaRepo = {
    findOne: async ({ where }: any) => accounts.find((a) => a.id === where.id) ?? null,
    find: async () => accounts,
  };
  const dataSource = makeDataSource({ settingsRepo, coaRepo });
  return new AccountingSettingsService(settingsRepo as any, coaRepo as any, dataSource as any);
}

describe('AccountingSettingsService.update', () => {
  it('rejects a cash mapping to a non-Asset account', async () => {
    const svc = makeService([{ id: 'x', type: AccountType.INCOME, isActive: true, isPostable: true }]);
    await expect(svc.update({ cashAccountId: 'x' } as any, 'admin')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a mapping to an inactive account', async () => {
    const svc = makeService([{ id: 'x', type: AccountType.ASSET, isActive: false, isPostable: true }]);
    await expect(svc.update({ cashAccountId: 'x' } as any, 'admin')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('accepts a valid Asset cash mapping', async () => {
    const svc = makeService([{ id: 'x', type: AccountType.ASSET, isActive: true, isPostable: true }]);
    await expect(svc.update({ cashAccountId: 'x' } as any, 'admin')).resolves.toBeDefined();
  });
});

describe('AccountingSettingsService — Form B mapping capture guard', () => {
  const account = (over: any = {}) => ({
    id: 'a1', code: '6100', name: 'Salaries', type: 'Expense',
    isActive: true, isPostable: true, parentId: null,
    formBExpenseCategory: null, formBIncomeCategory: null, ...over,
  });

  const build = (accounts: any[]) => {
    const settingsRepo = {
      findOne: (jest.fn as any)().mockResolvedValue({
        id: true, cogsAccountId: 'old-cogs', salesRevenueAccountId: 'old-rev',
      }),
      create: (jest.fn as any)((v: any) => v),
      save: (jest.fn as any)((v: any) => Promise.resolve(v)),
    };
    const coaRepo = {
      findOne: (jest.fn as any)(async ({ where }: any) =>
        accounts.find((a) => a.id === where.id) ?? null),
      find: (jest.fn as any)().mockResolvedValue(accounts),
    };
    // Static import — the suite runs under Jest ESM, where require() is not
    // defined in a module scope.
    return {
      service: new AccountingSettingsService(
        settingsRepo as any,
        coaRepo as any,
        makeDataSource({ settingsRepo, coaRepo }) as any,
      ),
      settingsRepo,
    };
  };

  // The new root must be ACTIVE, POSTABLE and correctly typed, or update()'s
  // pre-existing REQUIRED_TYPE loop (accounting-settings.service.ts:32-40)
  // throws "is not postable" first and the capture guard never runs — the test
  // would fail on the wrong exception.
  it('rejects a cogsAccountId change that would capture a mapped account', async () => {
    const newRoot = account({ id: 'new-cogs', code: '5000' });
    const mapped = account({
      id: 'm1', code: '5150', parentId: 'new-cogs',
      formBExpenseCategory: 'RENT_LEASE',
    });
    const { service } = build([newRoot, mapped]);
    await expect(service.update({ cogsAccountId: 'new-cogs' } as any, 'tester'))
      .rejects.toThrow(/5150/);
  });

  it('rejects a salesRevenueAccountId change that would capture a mapped income account', async () => {
    const newRoot = account({ id: 'new-rev', code: '4000', type: 'Income' });
    const mapped = account({
      id: 'm2', code: '4150', type: 'Income', parentId: 'new-rev',
      formBIncomeCategory: 'DIVIDENDS',
    });
    const { service } = build([newRoot, mapped]);
    await expect(service.update({ salesRevenueAccountId: 'new-rev' } as any, 'tester'))
      .rejects.toThrow(/4150/);
  });

  it('allows a root change that captures only UNMAPPED accounts', async () => {
    const newRoot = account({ id: 'new-cogs', code: '5000' });
    const plain = account({ id: 'p1', code: '5150', parentId: 'new-cogs' });
    const { service, settingsRepo } = build([newRoot, plain]);
    await service.update({ cogsAccountId: 'new-cogs' } as any, 'tester');
    expect(settingsRepo.save).toHaveBeenCalled();
  });

  /*
   * The frontend submits the COMPLETE settings object on every save
   * (AccountingSettingsPage.tsx:211 — `updateSettings(data)` with the whole
   * react-hook-form payload), so both roots are present in the DTO whether or
   * not they changed.
   *
   * Validating an UNCHANGED root would therefore make a pre-existing mapping
   * under the current COGS root block every unrelated settings change,
   * permanently and with no way to save. The guard must compare against the
   * stored value and skip when it is the same.
   */
  it('does not block an unrelated update when an unchanged root already holds a mapped account', async () => {
    const legacyMapped = account({
      id: 'legacy', code: '5199', parentId: 'old-cogs',
      formBExpenseCategory: 'RENT_LEASE',
    });
    const oldCogs = account({ id: 'old-cogs', code: '5000' });
    const cash = account({ id: 'cash', code: '1100', type: 'Asset' });
    const { service, settingsRepo } = build([oldCogs, legacyMapped, cash]);

    // A full-object save: cogsAccountId is resubmitted UNCHANGED.
    await service.update(
      { cashAccountId: 'cash', cogsAccountId: 'old-cogs' } as any, 'tester',
    );
    expect(settingsRepo.save).toHaveBeenCalled();
  });

  // Never silently cleared — the user removes the mapping first.
  it('does not clear the mapping when it rejects', async () => {
    const newRoot = account({ id: 'new-cogs', code: '5000' });
    const mapped = account({
      id: 'm1', code: '5150', parentId: 'new-cogs', formBExpenseCategory: 'RENT_LEASE',
    });
    const { service } = build([newRoot, mapped]);
    await expect(service.update({ cogsAccountId: 'new-cogs' } as any, 'tester')).rejects.toThrow();
    expect(mapped.formBExpenseCategory).toBe('RENT_LEASE');
  });
});

/**
 * The SETTINGS side of the shared Balance Sheet conflict rule (#1239).
 *
 * The group service has the symmetric suite. Both paths must enforce the rule,
 * because either can create a conflict: a group write can add an account that
 * collides with a default, and a settings write can point a default at an
 * account that is already grouped.
 */
describe('AccountingSettingsService — Balance Sheet grouping conflicts', () => {
  const asset = (id: string, code: string, name: string) => ({
    id, code, name, type: AccountType.ASSET,
    isActive: true, isPostable: true, parentId: null,
    formBExpenseCategory: null, formBIncomeCategory: null,
  });

  const ACCOUNTS = [
    asset('cimb', '1200', 'CIMB'),
    asset('maybank', '1210', 'Maybank'),
    asset('atome', '1240', 'Atome'),
    asset('cash', '1100', 'Cash'),
  ];

  const build = (
    groups: { accountId: string; groupLine: string }[],
    current: any = {
      id: true, cashAccountId: 'cash', bankAccountId: 'cimb',
      inventoryAccountId: 'inv', supplierDepositAccountId: 'supdep',
    },
  ) => {
    const settingsRepo = {
      findOne: (jest.fn as any)().mockResolvedValue(current),
      create: (jest.fn as any)((v: any) => v),
      save: (jest.fn as any)((v: any) => Promise.resolve(v)),
    };
    const coaRepo = {
      findOne: (jest.fn as any)(async ({ where }: any) =>
        ACCOUNTS.find((a) => a.id === where.id) ?? null),
      find: (jest.fn as any)().mockResolvedValue(ACCOUNTS),
    };
    const groupRepo = { find: (jest.fn as any)().mockResolvedValue(groups) };
    const service = new AccountingSettingsService(
      settingsRepo as any,
      coaRepo as any,
      makeDataSource({ settingsRepo, coaRepo, groupRepo }) as any,
    );
    return { service, settingsRepo };
  };

  it('rejects pointing bankAccountId at an account already in N39 when N38 is EMPTY', async () => {
    // No N38 group, so the bank fallback contributes to N38; Atome is in N39.
    const { service, settingsRepo } = build([
      { accountId: 'atome', groupLine: 'OTHER_CURRENT_ASSETS' },
    ]);
    await expect(
      service.update({ bankAccountId: 'atome' } as any, 'tester'),
    ).rejects.toThrow(/N38 and N39/);
    expect(settingsRepo.save).not.toHaveBeenCalled();
  });

  it('ACCEPTS pointing bankAccountId at an N39 account when a non-empty N38 group excludes it', async () => {
    // The correction that matters: a non-empty N38 group displaces the bank
    // fallback, so bankAccountId contributes to no line of its own.
    const { service, settingsRepo } = build([
      { accountId: 'maybank', groupLine: 'BANK_BALANCE' },
      { accountId: 'atome', groupLine: 'OTHER_CURRENT_ASSETS' },
    ]);
    await service.update({ bankAccountId: 'atome' } as any, 'tester');
    expect(settingsRepo.save).toHaveBeenCalled();
  });

  it('rejects pointing cashAccountId at a grouped account', async () => {
    // cashAccountId has no group to be displaced by, so N37 always stands.
    const { service } = build([{ accountId: 'maybank', groupLine: 'BANK_BALANCE' }]);
    await expect(
      service.update({ cashAccountId: 'maybank' } as any, 'tester'),
    ).rejects.toThrow(/N37 and N38/);
  });

  it('allows an ordinary settings save when no grouping conflicts', async () => {
    const { service, settingsRepo } = build([
      { accountId: 'cimb', groupLine: 'BANK_BALANCE' },
      { accountId: 'maybank', groupLine: 'BANK_BALANCE' },
    ]);
    await service.update({ bankAccountId: 'cimb' } as any, 'tester');
    expect(settingsRepo.save).toHaveBeenCalled();
  });
});
