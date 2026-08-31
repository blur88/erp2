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
  return { service: new FormBMappingService(repo as any, settings as any), repo };
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
