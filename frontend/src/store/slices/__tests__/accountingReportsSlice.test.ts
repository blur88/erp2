import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import accountingReportsReducer, {
  downloadAccountActivityExcel,
  downloadBalanceSheetExcel,
  downloadGeneralLedgerExcel,
  downloadTrialBalanceExcel,
  fetchAccountActivity,
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

  it('normalizes account activity response and preserves requested period', async () => {
    (ApiService.get as any).mockResolvedValue({
      account: { id: 'acc-1', code: '1100', name: 'Cash', type: 'ASSET' },
      openingBalance: 100,
      activity: [
        {
          date: '2026-01-10',
          entryNumber: 'JE-001',
          description: 'Sample entry',
          status: 'POSTED',
          referenceType: 'SALES_ORDER',
          referenceId: 'so-1',
          debit: 250,
          credit: 0,
        },
      ],
      closingBalance: 350,
    });

    await store.dispatch(
      fetchAccountActivity({
        accountId: 'acc-1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }) as any,
    );

    const report = store.getState().accountingReports.accountActivity.data;
    expect(report?.startDate).toBe('2026-01-01');
    expect(report?.endDate).toBe('2026-01-31');
    expect(report?.totalEntries).toBe(1);
    expect(report?.entries[0]).toMatchObject({
      entryDate: '2026-01-10',
      entryNumber: 'JE-001',
      status: 'POSTED',
      debitAmount: 250,
      creditAmount: 0,
      referenceType: 'SALES_ORDER',
      referenceId: 'so-1',
    });
  });

  it('uses export endpoint for trial balance excel download', async () => {
    (ApiService.get as any).mockResolvedValue(new Blob(['excel']));
    const createObjectURLMock = vi.fn(() => 'blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURLMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURLMock,
      writable: true,
      configurable: true,
    });
    const clickMock = vi.fn();
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockReturnValue({ click: clickMock } as any);

    await store.dispatch(
      downloadTrialBalanceExcel({
        asOfDate: '2026-02-10',
        includeInactive: false,
      }) as any,
    );

    expect(ApiService.get).toHaveBeenCalledWith('/accounting/reports/trial-balance/export', {
      params: { asOfDate: '2026-02-10', includeInactive: false },
      responseType: 'blob',
    });

    createElementSpy.mockRestore();
  });

  it('uses export endpoint for balance sheet excel download', async () => {
    (ApiService.get as any).mockResolvedValue(new Blob(['excel']));
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock-url'),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockReturnValue({ click: vi.fn() } as any);

    await store.dispatch(
      downloadBalanceSheetExcel({
        asOfDate: '2026-02-10',
        includeInactive: false,
      }) as any,
    );

    expect(ApiService.get).toHaveBeenCalledWith('/accounting/reports/balance-sheet/export', {
      params: { asOfDate: '2026-02-10', includeInactive: false },
      responseType: 'blob',
    });

    createElementSpy.mockRestore();
  });

  it('uses export endpoint for general ledger excel download', async () => {
    (ApiService.get as any).mockResolvedValue(new Blob(['excel']));
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock-url'),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockReturnValue({ click: vi.fn() } as any);

    await store.dispatch(
      downloadGeneralLedgerExcel({
        accountId: 'acc-1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }) as any,
    );

    expect(ApiService.get).toHaveBeenCalledWith('/accounting/reports/general-ledger/export', {
      params: {
        accountId: 'acc-1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
      responseType: 'blob',
    });

    createElementSpy.mockRestore();
  });

  it('uses export endpoint for account activity excel download', async () => {
    (ApiService.get as any).mockResolvedValue(new Blob(['excel']));
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock-url'),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockReturnValue({ click: vi.fn() } as any);

    await store.dispatch(
      downloadAccountActivityExcel({
        accountId: 'acc-1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }) as any,
    );

    expect(ApiService.get).toHaveBeenCalledWith('/accounting/reports/account-activity/export', {
      params: {
        accountId: 'acc-1',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
      responseType: 'blob',
    });

    createElementSpy.mockRestore();
  });
});
