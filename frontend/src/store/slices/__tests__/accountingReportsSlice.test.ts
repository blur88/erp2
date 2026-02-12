import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import accountingReportsReducer, {
  fetchGeneralLedger,
  fetchProfitAndLoss,
} from '../accountingReportsSlice';
import { ApiService } from '../../../services/api';

vi.mock('../../../services/api', () => ({
  ApiService: {
    get: vi.fn(),
  },
}));

type TestRootState = {
  accountingReports: ReturnType<typeof accountingReportsReducer>;
};

describe('accountingReportsSlice', () => {
  let store: ReturnType<typeof configureStore<TestRootState>>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        accountingReports: accountingReportsReducer,
      },
    });
    vi.clearAllMocks();
  });

  it('normalizes backend profit and loss response shape for frontend consumers', async () => {
    (ApiService.get as any).mockResolvedValue({
      revenue: {
        accounts: [{ accountCode: '4000', accountName: 'Sales', balance: 1000 }],
        total: 1000,
      },
      costOfGoodsSold: {
        accounts: [{ accountCode: '5000', accountName: 'COGS', balance: 300 }],
        total: 300,
      },
      grossProfit: 700,
      expenses: {
        accounts: [{ accountCode: '6000', accountName: 'Rent', balance: 200 }],
        total: 200,
      },
      netIncome: 500,
    });

    await store.dispatch(
      fetchProfitAndLoss({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }) as any,
    );

    const state = store.getState().accountingReports;
    expect(state.profitAndLoss.data?.cogs.subtotal).toBe(300);
    expect(state.profitAndLoss.data?.cogs.accounts[0]).toMatchObject({
      code: '5000',
      name: 'COGS',
      amount: 300,
    });
  });

  it('normalizes general ledger transaction fields to prevent NaN in UI', async () => {
    (ApiService.get as any).mockResolvedValue({
      account: { id: 'acc-1', code: '1100', name: 'Cash', type: 'ASSET' },
      openingBalance: 100,
      transactions: [
        {
          date: '2026-01-10',
          entryNumber: 'JE-001',
          description: 'Sample',
          debit: 250,
          credit: 0,
          balance: 350,
        },
      ],
      closingBalance: 350,
    });

    await store.dispatch(
      fetchGeneralLedger({
        accountId: 'acc-1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }) as any,
    );

    const report = store.getState().accountingReports.generalLedger.data;
    expect(report?.startDate).toBe('2026-01-01');
    expect(report?.endDate).toBe('2026-01-31');
    expect(report?.transactions[0]).toMatchObject({
      debitAmount: 250,
      creditAmount: 0,
      runningBalance: 350,
    });
    expect(report?.totalDebits).toBe(250);
    expect(report?.totalCredits).toBe(0);
  });
});
