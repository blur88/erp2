import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import BalanceSheetPage, { getBalanceSheetTone } from '../BalanceSheetPage';
import accountingReportsReducer from '@/store/slices/accountingReportsSlice';

// Mock API
vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn().mockResolvedValue({ data: [], meta: {} }),
  },
}));

const createMockStore = (preloadedState?: unknown) => {
  return configureStore({
    reducer: {
      accountingReports: accountingReportsReducer,
    },
    preloadedState: preloadedState as any,
  });
};

const renderWithProviders = () => {
  const store = createMockStore();
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <BalanceSheetPage />
      </BrowserRouter>
    </Provider>
  );
};

describe('BalanceSheetPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders();
    expect(screen.getByText('Balance Sheet')).toBeInTheDocument();
  });

  it('displays page subtitle', () => {
    renderWithProviders();
    expect(
      screen.getByText('View your financial position showing Assets = Liabilities + Equity as of a specific date')
    ).toBeInTheDocument();
  });

  it('has as of date filter', () => {
    renderWithProviders();
    expect(screen.getByLabelText('As Of Date')).toBeInTheDocument();
  });

  it('has include inactive checkbox', () => {
    renderWithProviders();
    expect(screen.getByLabelText('Include Inactive Accounts')).toBeInTheDocument();
  });

  it('has action buttons', () => {
    renderWithProviders();
    // Check that buttons are rendered (they may show loading spinner on mount)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders balance sheet data from backend response shape', () => {
    const store = createMockStore({
      accountingReports: {
        trialBalance: { data: null, loading: false, error: null },
        balanceSheet: {
          loading: false,
          error: null,
          data: {
            assets: {
              current: [
                { accountCode: '1100', accountName: 'Cash', balance: 1000 },
                { accountCode: '1200', accountName: 'Inventory', balance: 500 },
              ],
              fixed: [{ accountCode: '1500', accountName: 'Equipment', balance: 4000 }],
              totalCurrent: 1500,
              totalFixed: 4000,
              total: 5500,
            },
            liabilities: {
              current: [{ accountCode: '2100', accountName: 'Accounts Payable', balance: 1200 }],
              longTerm: [{ accountCode: '2300', accountName: 'Loan', balance: 3000 }],
              totalCurrent: 1200,
              totalLongTerm: 3000,
              total: 4200,
            },
            equity: {
              accounts: [{ accountCode: '3100', accountName: 'Capital', balance: 1300 }],
              total: 1300,
            },
            isBalanced: true,
          },
        },
        profitAndLoss: { data: null, loading: false, error: null },
        generalLedger: { data: null, loading: false, error: null },
        accountActivity: { data: null, loading: false, error: null },
        downloading: false,
      },
    });

    expect(() =>
      render(
        <Provider store={store}>
          <BrowserRouter>
            <BalanceSheetPage />
          </BrowserRouter>
        </Provider>
      )
    ).not.toThrow();

    expect(screen.getByText('Balance Sheet')).toBeInTheDocument();
  });

  it('uses dark-mode specific tones for report surfaces', () => {
    const darkTone = getBalanceSheetTone('dark');
    const lightTone = getBalanceSheetTone('light');

    expect(darkTone.surfaceSoft).toBe('rgba(255, 255, 255, 0.06)');
    expect(darkTone.surfaceStrong).toBe('rgba(255, 255, 255, 0.1)');
    expect(darkTone.sectionAccent).toBe('rgba(255, 255, 255, 0.08)');
    expect(lightTone.surfaceSoft).toBe('grey.50');
    expect(lightTone.surfaceStrong).toBe('grey.100');
    expect(lightTone.sectionAccent).toBe('grey.100');
  });
});
