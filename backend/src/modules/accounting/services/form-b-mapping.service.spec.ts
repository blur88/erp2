// backend/src/modules/accounting/services/form-b-mapping.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { FormBMappingService } from './form-b-mapping.service';
import { FormBExpenseCategory } from '../entities/form-b-category.enum';

const COGS = 'cogs';
const REV = 'rev';

const row = (over: any = {}) => ({
  id: 'a1', code: '6100', name: 'Salaries', type: 'Expense',
  isPostable: true, isActive: true, parentId: null,
  formBExpenseCategory: null, formBIncomeCategory: null, ...over,
});

const build = (accounts: any[]) => {
  const repo = {
    find: (jest.fn as unknown as any)().mockResolvedValue(accounts),
    findOne: (jest.fn as unknown as any)(async ({ where }: any) =>
      accounts.find((a) => a.id === where.id) ?? null),
    update: (jest.fn as unknown as any)().mockResolvedValue({ affected: 1 }),
  };
  const settings = {
    get: (jest.fn as unknown as any)().mockResolvedValue({ cogsAccountId: COGS, salesRevenueAccountId: REV }),
  };
  const managerRepo = {
    update: (jest.fn as unknown as any)().mockResolvedValue({ affected: 1 }),
  };
  const manager = {
    getRepository: (jest.fn as unknown as any)().mockReturnValue(managerRepo),
  };
  const dataSource = {
    transaction: (jest.fn as unknown as any)().mockImplementation(async (cb: any) => cb(manager)),
  };
  return {
    service: new FormBMappingService(repo as any, settings as any, dataSource as any),
    repo,
    coaRepo: repo,
    managerRepo,
    manager,
    dataSource,
    settings,
  };
};

const makeService = (accounts?: any[]) => {
  if (accounts) return build(accounts);
  // default chart for bulk tests — covers a1 eligible, b1 ineligible descendant, f1 flipped for clear
  const defaultAccounts = [
    row({ id: COGS, code: '5000', name: 'Cost of Sales', isPostable: false }),
    row({ id: REV, code: '4000', name: 'Income', type: 'Income', isPostable: false }),
    row({ id: 'a1', code: '6100', name: 'Salaries', type: 'Expense', isPostable: true, parentId: null }),
    row({ id: 'b1', code: '5150', name: 'Bad Map', type: 'Expense', isPostable: true, parentId: COGS }),
    row({ id: 'f1', code: '6200', name: 'Flipped', type: 'Income', isPostable: true, parentId: null, formBExpenseCategory: FormBExpenseCategory.RENT_LEASE }),
  ];
  return build(defaultAccounts);
};

const CHART = [
  row({ id: COGS, code: '5000', name: 'Cost of Sales', isPostable: false }),
  row({ id: REV, code: '4000', name: 'Income', type: 'Income', isPostable: false }),
];

describe('FormBMappingService.list', () => {
  it('includes write-eligible accounts, mapped or not', async () => {
    const { service } = build([...CHART, row()]);
    const list = await service.list();
    expect(list.map((r) => r.accountId)).toContain('a1');
    expect(list.find((r) => r.accountId === 'a1')!.eligibility).toEqual({ eligible: true });
  });

  // Selecting on PERSISTENCE, not eligibility, is what makes repair possible.
  it('includes an INACTIVE account that still carries a mapping, flagged', async () => {
    const inactive = row({
      id: 'i1', isActive: false,
      formBExpenseCategory: FormBExpenseCategory.RENT_LEASE,
    });
    const { service } = build([...CHART, inactive]);
    const found = (await service.list()).find((r) => r.accountId === 'i1')!;
    expect(found.isActive).toBe(false);
    expect(found.category).toBe('RENT_LEASE');
    expect(found.eligibility).toEqual({ eligible: false, reason: 'INACTIVE' });
  });

  // The hole this closes: an account made ineligible by direct SQL is excluded
  // from the report AND would otherwise be absent from the only screen that
  // could clear it.
  it('includes a mapped ACTIVE COGS descendant so it can be repaired', async () => {
    const bad = row({
      id: 'b1', code: '5100', name: 'COGS child', parentId: COGS,
      formBExpenseCategory: FormBExpenseCategory.RENT_LEASE,
    });
    const { service } = build([...CHART, bad]);
    const found = (await service.list()).find((r) => r.accountId === 'b1')!;
    expect(found.eligibility).toEqual({
      eligible: false, reason: 'DESCENDANT_OF_EXCLUDED_ROOT',
    });
  });

  // A cross-family mapping must render clear-only with its reason, not as a
  // healthy editable row — the list is the repair surface for exactly this.
  it('reports an Income account holding an expense mapping as ineligible', async () => {
    const stranded = row({
      id: 's1', code: '4300', name: 'Stranded', type: 'Income',
      formBExpenseCategory: FormBExpenseCategory.RENT_LEASE,
    });
    const { service } = build([...CHART, stranded]);
    const found = (await service.list()).find((r: any) => r.accountId === 's1')!;
    expect(found.category).toBe('RENT_LEASE');
    expect(found.eligibility).toEqual({ eligible: false, reason: 'NOT_EXPENSE_TYPE' });
  });

  it('omits an UNMAPPED ineligible account', async () => {
    const plain = row({ id: 'p1', code: '5200', name: 'COGS child', parentId: COGS });
    const { service } = build([...CHART, plain]);
    expect((await service.list()).map((r) => r.accountId)).not.toContain('p1');
  });

  it('exposes no dormant field', async () => {
    const { service } = build([...CHART, row()]);
    expect('dormant' in (await service.list())[0]).toBe(false);
  });
});

describe('FormBMappingService.setCategory', () => {
  it('assigns a category to an eligible account', async () => {
    const { service, repo } = build([...CHART, row()]);
    await service.setCategory('a1', 'SALARIES_AND_WAGES');
    expect(repo.update).toHaveBeenCalledWith('a1', expect.objectContaining({
      formBExpenseCategory: 'SALARIES_AND_WAGES',
    }));
  });

  it('rejects an ineligible assignment carrying the reason', async () => {
    const bad = row({ id: 'b1', parentId: COGS });
    const { service } = build([...CHART, bad]);
    await expect(service.setCategory('b1', 'RENT_LEASE'))
      .rejects.toThrow(/DESCENDANT_OF_EXCLUDED_ROOT/);
  });

  it('rejects a category from the wrong family', async () => {
    const { service } = build([...CHART, row()]);
    await expect(service.setCategory('a1', 'DIVIDENDS')).rejects.toThrow(BadRequestException);
  });

  it('rejects assigning to an inactive account', async () => {
    const inactive = row({ id: 'i1', isActive: false });
    const { service } = build([...CHART, inactive]);
    await expect(service.setCategory('i1', 'RENT_LEASE')).rejects.toThrow(/INACTIVE/);
  });

  // A retained or corrupted mapping must always be removable, or it is stuck
  // forever: the account would have to be reactivated purely to clear it.
  it('allows CLEARING on an inactive mapped account', async () => {
    const inactive = row({
      id: 'i1', isActive: false, formBExpenseCategory: FormBExpenseCategory.RENT_LEASE,
    });
    const { service, repo } = build([...CHART, inactive]);
    await service.setCategory('i1', null);
    expect(repo.update).toHaveBeenCalledWith('i1', {
      formBExpenseCategory: null, formBIncomeCategory: null,
    });
  });

  // Clearing must not resolve the column from the account's CURRENT type: an
  // expense category stranded on an account since flipped to Income would
  // survive a clear that only nulled the income column.
  it('clears whichever column is populated, regardless of current type', async () => {
    const flipped = row({
      id: 'f1', type: 'Income',
      formBExpenseCategory: FormBExpenseCategory.RENT_LEASE,
    });
    const { service, repo } = build([...CHART, flipped]);
    await service.setCategory('f1', null);
    expect(repo.update).toHaveBeenCalledWith('f1', {
      formBExpenseCategory: null, formBIncomeCategory: null,
    });
  });

  it('rejects an unknown account', async () => {
    const { service } = build([...CHART]);
    await expect(service.setCategory('ghost', null)).rejects.toThrow(BadRequestException);
  });
});

describe('FormBMappingService.setCategories', () => {
  it('builds the context once for a multi-item call', async () => {
    const { service, coaRepo } = makeService();
    coaRepo.find.mockClear();

    await service.setCategories([
      { accountId: 'a1', category: 'SALARIES_AND_WAGES' },
      { accountId: 'f1', category: null },
    ]);

    // One full chart-of-accounts read for validation, plus the one list() does
    // to build the response — never one per item.
    expect(coaRepo.find).toHaveBeenCalledTimes(2);
  });

  it('validates every item before writing any', async () => {
    const { service, managerRepo } = makeService();

    await expect(service.setCategories([
      { accountId: 'a1', category: 'SALARIES_AND_WAGES' }, // valid
      { accountId: 'b1', category: 'RENT_LEASE' },         // ineligible
    ])).rejects.toThrow(BadRequestException);

    // The valid item must not have been written: validation precedes the
    // write phase entirely.
    expect(managerRepo.update).not.toHaveBeenCalled();
  });

  it('names the account code when the account exists', async () => {
    const { service } = makeService();
    await expect(service.setCategories([{ accountId: 'b1', category: 'RENT_LEASE' }]))
      .rejects.toThrow(/Account 5150/);
  });

  it('names the submitted id when the account does not exist', async () => {
    const { service } = makeService();
    await expect(service.setCategories([{ accountId: 'ghost', category: null }]))
      .rejects.toThrow(/Account ghost not found/);
  });

  it('writes through the transaction manager, not the injected repository', async () => {
    const { service, coaRepo, managerRepo } = makeService();

    await service.setCategories([{ accountId: 'a1', category: 'SALARIES_AND_WAGES' }]);

    expect(managerRepo.update).toHaveBeenCalledTimes(1);
    // The injected repo runs on the default connection; a write through it
    // would not participate in the transaction and could not roll back.
    expect(coaRepo.update).not.toHaveBeenCalled();
  });

  it('returns the refreshed list rather than an echo of the request', async () => {
    const { service } = makeService();
    const result = await service.setCategories([{ accountId: 'a1', category: 'SALARIES_AND_WAGES' }]);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('eligibility');
  });
});
