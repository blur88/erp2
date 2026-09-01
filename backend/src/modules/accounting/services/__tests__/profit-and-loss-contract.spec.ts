// backend/src/modules/accounting/services/__tests__/profit-and-loss-contract.spec.ts
import { jest } from '@jest/globals';
import { ProfitAndLossService } from '../profit-and-loss.service';

/**
 * The Accounting View's contract, asserted over a fixed dataset.
 *
 * The fixture deliberately includes accounts CARRYING Form B mappings: the risk
 * is not that the neutral report crashes, but that a mapping column silently
 * changes a section total or an integrity finding. An unmapped fixture could
 * not detect that.
 *
 * If this fails, the Form B work changed the Accounting View. Fix the Form B
 * side — do not update these expectations.
 */
describe('ProfitAndLossService contract (Form B must not disturb it)', () => {
  const chart = [
    { id: 'rev', code: '4100', name: 'Sales Revenue', type: 'Income', parentId: null,
      isPostable: true, isActive: true, formBExpenseCategory: null, formBIncomeCategory: null },
    { id: 'oth', code: '4200', name: 'Rental Income', type: 'Income', parentId: null,
      isPostable: true, isActive: true, formBExpenseCategory: null,
      formBIncomeCategory: 'RENT_ROYALTIES_PREMIUMS' },   // MAPPED
    { id: 'cogs', code: '5100', name: 'COGS', type: 'Expense', parentId: null,
      isPostable: true, isActive: true, formBExpenseCategory: null, formBIncomeCategory: null },
    { id: 'sal', code: '6100', name: 'Salaries', type: 'Expense', parentId: null,
      isPostable: true, isActive: true, formBExpenseCategory: 'SALARIES_AND_WAGES',
      formBIncomeCategory: null },                         // MAPPED
    { id: 'sun', code: '6990', name: 'Sundry', type: 'Expense', parentId: null,
      isPostable: true, isActive: true, formBExpenseCategory: null, formBIncomeCategory: null },
  ];

  const build = () => {
    const coaRepo = { find: (jest.fn() as any).mockResolvedValue(chart) };
    const lineRepo = {
      createQueryBuilder: jest.fn(() => {
        const qb: any = {};
        for (const m of ['innerJoin','select','addSelect','where','andWhere','groupBy']) {
          qb[m] = jest.fn(() => qb);
        }
        qb.getRawMany = (jest.fn() as any).mockResolvedValue([
          { accountId: 'rev', ordDebit: '0', ordCredit: '100.0000', adjDebit: '0', adjCredit: '0' },
          { accountId: 'oth', ordDebit: '0', ordCredit: '10.0000', adjDebit: '0', adjCredit: '0' },
          { accountId: 'cogs', ordDebit: '40.0000', ordCredit: '0', adjDebit: '0', adjCredit: '0' },
          { accountId: 'sal', ordDebit: '20.0000', ordCredit: '0', adjDebit: '0', adjCredit: '0' },
          { accountId: 'sun', ordDebit: '5.0000', ordCredit: '0', adjDebit: '3.0000', adjCredit: '0' },
        ]);
        qb.getRawOne = (jest.fn() as any).mockResolvedValue({ earliest: '2025-01-01' });
        return qb;
      }),
    };
    const balance = {
      naturalBalance: jest.fn((type: string, raw: bigint) =>
        type === 'Income' || type === 'Liability' || type === 'Equity' ? -raw : raw),
    };
    const settings = {
      get: (jest.fn() as any).mockResolvedValue({ salesRevenueAccountId: 'rev', cogsAccountId: 'cogs' }),
    };
    return new ProfitAndLossService(
      coaRepo as any, lineRepo as any, balance as any, settings as any,
    );
  };

  it('produces the expected totals with mapped accounts present', async () => {
    const res = await build().getProfitAndLoss({ year: 2025 });
    expect(res.grossProfit).toBe('57.0000');       // 100 - (40 + 3)
    expect(res.totalCostOfSales).toBe('43.0000');  // 40 COGS + 3 adjustments
    expect(res.inventoryAdjustments).toBe('3.0000');
    expect(res.netProfit).toBe('42.0000');         // 57 + 10 - 25
    expect(res.integrity.tieOutOk).toBe(true);
  });

  it('exposes no Form B field anywhere in the payload', async () => {
    const res = await build().getProfitAndLoss({ year: 2025 });
    expect(JSON.stringify(res)).not.toMatch(/formB/i);
    expect(JSON.stringify(res)).not.toMatch(/SALARIES_AND_WAGES/);
  });

  it('keeps the top-level response keys stable', async () => {
    const res = await build().getProfitAndLoss({ year: 2025 });
    expect(Object.keys(res).sort()).toEqual([
      'availableYears', 'grossProfit', 'integrity', 'inventoryAdjustments',
      'inventoryAdjustmentsRowId', 'netProfit', 'sections', 'totalCostOfSales',
      'totalCostOfSalesRowId', 'year',
    ]);
  });
});