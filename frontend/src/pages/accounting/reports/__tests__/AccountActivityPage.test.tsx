import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import AccountActivityPage from '../AccountActivityPage';
import accountingReportsReducer from '@/store/slices/accountingReportsSlice';
import chartOfAccountsReducer from '@/store/slices/chartOfAccountsSlice';

// Mock API
vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn().mockResolvedValue({ data: [], meta: {} }),
  },
}));

const createMockStore = (preloadedState?: any) => {
  return configureStore({
    reducer: {
      accountingReports: accountingReportsReducer,
      chartOfAccounts: chartOfAccountsReducer,
    },
    preloadedState,
  });
};

const renderWithProviders = (preloadedState?: any) => {
  const store = createMockStore(preloadedState);
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <AccountActivityPage />
      </BrowserRouter>
    </Provider>
  );
};

describe('AccountActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page correctly', () => {
    const { container } = renderWithProviders();
    // Basic smoke test - page renders something
    expect(container.firstChild).toBeTruthy();
  });

  it('has filter inputs', () => {
    renderWithProviders();
    // Check that date filters are rendered
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
  });

  it('has start date filter', () => {
    renderWithProviders();
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument();
  });

  it('has end date filter', () => {
    renderWithProviders();
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
  });

  it('has form filters', () => {
    renderWithProviders();
    // Check that date filters exist
    expect(screen.getByLabelText('End Date')).toBeInTheDocument();
  });

  it('has action buttons', () => {
    renderWithProviders();
    // Check that buttons are rendered (they may show loading spinner on mount)
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders safely when account activity response has no entries array', () => {
    renderWithProviders({
      accountingReports: {
        trialBalance: { data: null, loading: false, error: null },
        balanceSheet: { data: null, loading: false, error: null },
        profitAndLoss: { data: null, loading: false, error: null },
        generalLedger: { data: null, loading: false, error: null },
        accountActivity: {
          loading: false,
          error: null,
          data: {
            account: {
              id: 'acc-1',
              code: '1000',
              name: 'Cash',
              type: 'ASSET',
            },
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            totalEntries: 0,
          },
        },
        downloading: false,
      },
      chartOfAccounts: {
        accounts: [],
        selectedAccount: null,
        loading: false,
        error: null,
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        },
      },
    });

    expect(screen.getByText('No entries found for the selected period')).toBeInTheDocument();
  });
});
