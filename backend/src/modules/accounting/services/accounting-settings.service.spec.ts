import { jest } from '@jest/globals';
import { AccountingSettingsService } from './accounting-settings.service';
import { AccountType } from '../entities/account-type.enum';
import { BadRequestException } from '@nestjs/common';

function makeService(accounts: any[]) {
  const settingsRepo = {
    findOne: async () => ({ id: true }),
    save: async (x: any) => x,
    create: (x: any) => x,
  };
  const coaRepo = { findOne: async ({ where }: any) => accounts.find((a) => a.id === where.id) ?? null };
  return new AccountingSettingsService(settingsRepo as any, coaRepo as any);
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
      service: new AccountingSettingsService(settingsRepo as any, coaRepo as any),
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
