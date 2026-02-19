import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import BalanceSheetPage from './BalanceSheetPage';
import accountingReportsReducer from '@/store/slices/accountingReportsSlice';
import { ApiService } from '@/services/api';

vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const reportData = {
  assets: {
    accounts: [{ id: 'a1', code: '1000', name: 'Cash', balance: 5000 }],
    subtotal: 5000,
  },
  liabilities: {
    accounts: [{ id: 'l1', code: '2000', name: 'Accounts Payable', balance: 2000 }],
    subtotal: 2000,
  },
  equity: {
    accounts: [{ id: 'e1', code: '3000', name: 'Owner Equity', balance: 2500 }],
    subtotal: 2500,
    netIncome: 500,
  },
  totalAssets: 5000,
  totalLiabilitiesAndEquity: 4500,
  isBalanced: false,
};

const createStore = () =>
  configureStore({
    reducer: {
      accountingReports: accountingReportsReducer,
    },
    preloadedState: {
      accountingReports: {
        trialBalance: { data: null, loading: false, error: null },
        balanceSheet: { data: reportData, loading: false, error: null },
        profitAndLoss: { data: null, loading: false, error: null },
        generalLedger: { data: null, loading: false, error: null },
        accountActivity: { data: null, loading: false, error: null },
        downloading: false,
      },
    } as any,
  });

const renderPage = () =>
  render(
    <Provider store={createStore()}>
      <BalanceSheetPage />
    </Provider>
  );

describe('BalanceSheetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ApiService.get).mockResolvedValue(reportData as any);
  });

  it('uses uniform-height cards for assets, liabilities, and equity sections', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('balance-sheet-section-assets')).toBeInTheDocument();
    });

    const assetsCard = screen.getByTestId('balance-sheet-section-assets');
    const liabilitiesCard = screen.getByTestId('balance-sheet-section-liabilities');
    const equityCard = screen.getByTestId('balance-sheet-section-equity');

    expect(assetsCard).toHaveStyle({ height: '100%', display: 'flex', flexDirection: 'column' });
    expect(liabilitiesCard).toHaveStyle({ height: '100%', display: 'flex', flexDirection: 'column' });
    expect(equityCard).toHaveStyle({ height: '100%', display: 'flex', flexDirection: 'column' });
  });

  it('renders net income in a highlighted summary panel', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('balance-sheet-net-income')).toBeInTheDocument();
    });

    expect(screen.getByTestId('balance-sheet-net-income-label')).toHaveTextContent('Net Income');
    expect(screen.getByTestId('balance-sheet-net-income-value')).toHaveTextContent('500.00');
  });

  it('keeps balance check footer card height consistent with totals cards', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('balance-sheet-total-assets')).toBeInTheDocument();
    });

    expect(screen.getByTestId('balance-sheet-total-assets')).toHaveStyle({ height: '100%' });
    expect(screen.getByTestId('balance-sheet-total-liabilities-equity')).toHaveStyle({ height: '100%' });
    expect(screen.getByTestId('balance-sheet-balance-check')).toHaveStyle({ height: '100%' });
  });
});
